import asyncio
import socketio
from fastapi import FastAPI
from simulation import Simulation
from optimizer import Optimizer
import time
import traceback

sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins="*")
app = FastAPI()
socket_app = socketio.ASGIApp(sio, app)

simulation_task = None
current_simulation = None
pause_event = asyncio.Event()
is_optimizing = False

# AI/manual signal control globals
ai_control_enabled = True  # when True AI can set signals automatically; when False UI/manual control is authoritative
# timestamps of last manual override: signal_id -> unix_timestamp
manual_override_timestamps = {}
# signals set while no sim is running: signal_id -> state
pending_signal_overrides = {}
MANUAL_OVERRIDE_GRACE_SECONDS = 15  # AI will not override a signal that was manually toggled within this window

# Server-side authoritative priorities — network congestion & trackCondition are ALWAYS True.
current_ai_priorities = {
    'congestion': True,       # forced ON
    'trainType': True,
    'punctuality': True,
    'trackCondition': True,   # forced ON
    'weather': False
}

# Tracks that UI set while no simulation is running; applied when sim starts.
pending_faulty_tracks = set()


def _signal_overridden_recently(signal_id: str) -> bool:
    ts = manual_override_timestamps.get(signal_id)
    if not ts:
        return False
    return (time.time() - ts) < MANUAL_OVERRIDE_GRACE_SECONDS


def apply_track_status_to_sim(sim: Simulation, track_id: str, status: str):
    updated = False
    for seg in sim.network['trackSegments']:
        if seg['id'] == track_id:
            seg['status'] = status
            if track_id in sim.segments_map:
                sim.segments_map[track_id]['status'] = status
            updated = True
            break
    if status == 'FAULTY':
        sim.locked_resources.add(track_id)
    else:
        sim.locked_resources.discard(track_id)

    if updated:
        sim.plan_needed = True
        print(f"🔧 Applied status={status} to track {track_id} in simulation {sim.section_code}.")


def apply_signal_state(sim: Simulation, signal_id: str, state: str, by: str = 'ai'):
    """
    Set signal state on a simulation instance.
    - If by=='manual': record manual override timestamp (so AI will avoid overriding for grace window)
    - If by=='ai': apply only if allowed (no recent manual override AND ai_control_enabled)
    Returns True if state applied, False if skipped.
    """
    global manual_override_timestamps

    state = (state or 'RED').upper()
    signal_id = signal_id.strip().upper()

    if by == 'manual':
        manual_override_timestamps[signal_id] = time.time()
        # update simulation node map
        if signal_id in sim.nodes_map:
            sim.nodes_map[signal_id]['state'] = state
        # reflect into network dict for UI
        for n in sim.network['nodes']:
            if n['id'] == signal_id:
                n['state'] = state
        sim.plan_needed = True
        print(f"✋ Manual override applied: signal {signal_id} => {state}")
        # broadcast update (fire-and-forget)
        try:
            asyncio.create_task(sio.emit('network-update', sim.get_state()))
        except Exception:
            pass
        return True
    else:
        # AI attempt
        if not ai_control_enabled:
            print(f"🔒 AI tried to set {signal_id} => {state}, but AI control is disabled.")
            return False
        if _signal_overridden_recently(signal_id):
            print(f"🔒 AI wanted to set {signal_id} => {state}, but it was recently manually overridden.")
            return False
        if signal_id in sim.nodes_map:
            sim.nodes_map[signal_id]['state'] = state
        for n in sim.network['nodes']:
            if n['id'] == signal_id:
                n['state'] = state
        sim.plan_needed = True
        print(f"🤖 AI set signal {signal_id} => {state}")
        try:
            asyncio.create_task(sio.emit('ai:signal-set', {'signal': signal_id, 'state': state}))
            asyncio.create_task(sio.emit('network-update', sim.get_state()))
        except Exception:
            pass
        return True


def ai_try_clear_waiting_trains(sim: Simulation):
    """
    Proactively try to set departure signals GREEN for trains that are READY_TO_PROCEED
    or STOPPED_AWAITING_CLEARANCE when their next segment/node appears free.
    Additionally: set signals RED when AI decides they are not needed (idle/unused),
    while respecting manual overrides and safety checks.

    Returns a tuple (greens_applied, reds_applied).
    """
    # Fast guard
    if not ai_control_enabled:
        return (0, 0)

    greens_applied = 0
    # set of signal node IDs AI intends to keep GREEN for imminent departures
    desired_green_signals = set()

    # FIRST PASS: determine which signals should be GREEN (for trains that can proceed)
    for train in sim.active_trains:
        state = train.get('state')
        if state not in ('READY_TO_PROCEED', 'STOPPED_AWAITING_CLEARANCE'):
            continue
        route = train.get('route') or []
        node_path = train.get('node_path') or []
        if not route or not node_path:
            continue

        # Decide departure node and next segment
        if state == 'READY_TO_PROCEED':
            departure_node = node_path[0]
            next_segment = route[0]
        else:
            # STOPPED_AWAITING_CLEARANCE
            try:
                idx = route.index(train.get('currentSegmentId'))
                if (idx + 1) < len(node_path):
                    departure_node = node_path[idx + 1]
                else:
                    departure_node = node_path[0]
                next_segment = route[idx + 1] if (idx + 1) < len(route) else None
            except Exception:
                departure_node = node_path[0]
                next_segment = route[0]
        if not next_segment:
            continue

        # safety checks: segment not faulty, weather priorities, resources not locked
        seg = sim.segments_map.get(next_segment, {})
        if seg.get('status') == 'FAULTY':
            continue
        if sim.current_ai_priorities.get('weather') and seg.get('weather') == 'BAD':
            continue
        if next_segment in sim.locked_resources:
            continue
        # check node after segment if possible
        try:
            np_node_path = sim._convert_segment_path_to_node_path([next_segment])
            next_node_after = np_node_path[1] if len(np_node_path) > 1 else None
        except Exception:
            next_node_after = None
        if next_node_after and next_node_after in sim.locked_resources:
            continue

        # Respect manual override recency
        if _signal_overridden_recently(departure_node):
            continue

        # Mark as desired green
        desired_green_signals.add(departure_node.upper())

    # SECOND PASS: apply GREEN to desired signals (attempt)
    for sig in desired_green_signals:
        applied_ok = apply_signal_state(sim, sig, 'GREEN', by='ai')
        if applied_ok:
            greens_applied += 1

    # THIRD PASS: decide which GREEN signals should be set RED.
    # We will turn RED any signal currently GREEN that is NOT in desired_green_signals,
    # is safe to change, and wasn't manually overridden recently.
    reds_applied = 0

    # Build a map of node_id -> node object for quick lookup (normalized)
    node_map = {n['id'].upper(): n for n in sim.network.get('nodes', [])}

    for node_id, node in node_map.items():
        if node.get('type') != 'SIGNAL':
            continue
        current_state = (node.get('state') or '').upper()
        if current_state != 'GREEN':
            continue  # only consider currently green signals for red'ing

        # If AI wants this green, skip
        if node_id in desired_green_signals:
            continue

        # Respect manual override
        if _signal_overridden_recently(node_id):
            continue

        # Safety: avoid setting RED if doing so would block a RUNNING train that expects this signal
        # Heuristic: if there's a RUNNING train whose next segment or node depends on this signal, don't flip.
        # We'll conservatively check running trains' currentSegmentId and node_path.
        block_safe = True
        for t in sim.active_trains:
            if t.get('state') != 'RUNNING':
                continue
            # If this signal node appears in the node_path of a running train and is
            # the immediate departure node for next segment, avoid changing it.
            t_node_path = t.get('node_path') or []
            if node_id in [n.upper() for n in t_node_path]:
                # Determine if signal node is the departure node for upcoming movement — if so, avoid toggling
                # Conservative: if node is in node_path near the train's currentSegmentId, skip.
                try:
                    idx = t_node_path.index(node_id)
                    # if this node is the next node after currentSegmentId, it's important
                    current_seg = t.get('currentSegmentId')
                    if current_seg:
                        # find index of current segment in route and compare
                        t_route = t.get('route') or []
                        # convert route to node_path to be safe
                        # If node appears after a segment in route, it's relevant -> skip toggling
                        node_after_segments = sim._convert_segment_path_to_node_path(t_route)
                        if node_id in node_after_segments:
                            block_safe = False
                            break
                except Exception:
                    pass

        if not block_safe:
            continue

        # Additional safety: if the node controls entry into a locked resource, don't flip it red
        # We'll check segments adjacent to this signal's node: if any adjacent segment is locked and
        # would be needed for a train to exit, avoid flipping red.
        # Build adjacency check via sim.adjacency_list if possible
        try:
            neighbors = sim.adjacency_list.get(node_id, [])
            # if any adjacent segment is locked AND that segment's other node is occupied/locked, be conservative
            unsafe = False
            for nb in neighbors:
                seg_id = nb.get('segment_id')
                if seg_id and seg_id in sim.locked_resources:
                    unsafe = True
                    break
            if unsafe:
                continue
        except Exception:
            # if adjacency not available, continue with caution (don't flip)
            continue

        # If we reached here, it's considered safe to set this signal RED
        applied_ok = apply_signal_state(sim, node_id, 'RED', by='ai')
        if applied_ok:
            reds_applied += 1

    return (greens_applied, reds_applied)


async def simulation_loop(simulation_instance, optimizer_instance):
    global is_optimizing
    print(f"🏁 Simulation loop started for {simulation_instance.section_code}.")
    first_iteration = True
    try:
        while True:
            try:
                # debug: show pause_event current state
                print(f"[debug] pause_event.is_set() => {pause_event.is_set()}")

                # On first iteration, print type & available attrs to help diagnose missing methods
                if first_iteration:
                    first_iteration = False
                    try:
                        print(f"[debug] simulation_instance type: {type(simulation_instance)}")
                        print(f"[debug] simulation_instance dir: {sorted([a for a in dir(simulation_instance) if not a.startswith('_')])}")
                    except Exception:
                        print("[debug] Failed to print simulation_instance introspection.")
                        traceback.print_exc()

                # wait for play
                await pause_event.wait()

                # --- TICK (preferred) or fallback if missing ---
                try:
                    if hasattr(simulation_instance, 'tick') and callable(getattr(simulation_instance, 'tick')):
                        simulation_instance.tick()
                    else:
                        # Fallback: if tick not present, attempt to call internals if available
                        print("⚠️ Warning: simulation_instance has no 'tick'. Attempting fallback internal step.")
                        # conservative time increment if available
                        if hasattr(simulation_instance, 'current_time_seconds') and hasattr(simulation_instance, 'tick_rate'):
                            simulation_instance.current_time_seconds += simulation_instance.tick_rate * max(1, getattr(simulation_instance, 'sim_speed', 1))
                        if hasattr(simulation_instance, '_spawn_trains'):
                            try:
                                simulation_instance._spawn_trains()
                            except Exception:
                                print("⚠️ fallback: _spawn_trains failed")
                                traceback.print_exc()
                        if hasattr(simulation_instance, '_check_and_dispatch_trains'):
                            try:
                                simulation_instance._check_and_dispatch_trains()
                            except Exception:
                                print("⚠️ fallback: _check_and_dispatch_trains failed")
                                traceback.print_exc()
                        if hasattr(simulation_instance, '_update_train_positions'):
                            try:
                                simulation_instance._update_train_positions()
                            except Exception:
                                print("⚠️ fallback: _update_train_positions failed")
                                traceback.print_exc()
                        if hasattr(simulation_instance, '_update_network_state'):
                            try:
                                simulation_instance._update_network_state()
                            except Exception:
                                print("⚠️ fallback: _update_network_state failed")
                                traceback.print_exc()

                except Exception as e:
                    print("❌ Exception during simulation tick/fallback:")
                    traceback.print_exc()
                    await sio.emit('simulation:error', {'message': 'Simulation tick error: ' + str(e)})
                    # continue to next loop iteration after short pause
                    await asyncio.sleep(0.5)
                    continue

                # current state snapshot
                try:
                    current_state = simulation_instance.get_state()
                except Exception as e:
                    print("❌ Exception while getting simulation state:")
                    traceback.print_exc()
                    current_state = {"timestamp": getattr(simulation_instance, 'current_time_seconds', 0), "network": getattr(simulation_instance, 'network', {}), "trains": getattr(simulation_instance, 'active_trains', [])}

                # --- NEW: let AI proactively try to clear departure signals for waiting trains,
                # and also set redundant/idle signals to RED when safe ---
                try:
                    if ai_control_enabled and not is_optimizing:
                        greens, reds = ai_try_clear_waiting_trains(simulation_instance)
                        if (greens + reds) > 0:
                            print(f"🤖 AI proactively opened {greens} signal(s) and closed {reds} signal(s) this tick.")
                            # if AI changed signals, request a re-plan in case that affects optimizer decisions
                            simulation_instance.plan_needed = True
                except Exception:
                    print("⚠️ Exception while running ai_try_clear_waiting_trains:")
                    traceback.print_exc()

                # find trains that need a plan
                trains_needing_plan = [t for t in current_state.get('trains', []) if t.get('state') == 'WAITING_PLAN']

                if trains_needing_plan and not is_optimizing and getattr(simulation_instance, 'plan_needed', False):
                    is_optimizing = True
                    simulation_instance.plan_needed = False
                    await sio.emit('ai:plan-thinking')
                    try:
                        plan = optimizer_instance.generate_plan(trains_needing_plan, current_state, current_ai_priorities)
                    except Exception as e:
                        print("❌ Exception during optimizer.generate_plan():")
                        traceback.print_exc()
                        await sio.emit('simulation:error', {'message': 'Optimizer error: ' + str(e)})
                        plan = []

                    if plan:
                        # AI attempts to set departure signals to GREEN (won't override recent manual)
                        if ai_control_enabled:
                            for p in plan:
                                try:
                                    if p.get('action') == 'PROCEED':
                                        route = p.get('route', [])
                                        if route:
                                            node_path = simulation_instance._convert_segment_path_to_node_path(route)
                                            if node_path:
                                                first_node = node_path[0]
                                                apply_signal_state(simulation_instance, first_node, 'GREEN', by='ai')
                                except Exception:
                                    print("⚠️ Warning while pre-setting AI signals for plan:")
                                    traceback.print_exc()

                        try:
                            simulation_instance.apply_plan(plan)
                            await sio.emit('ai:plan-update', plan)
                        except Exception:
                            print("❌ Exception while applying plan:")
                            traceback.print_exc()
                            await sio.emit('simulation:error', {'message': 'Apply plan error'})
                    else:
                        print("⚠️ Optimizer returned no plan.")
                    is_optimizing = False

                # Emit periodic network update
                try:
                    await sio.emit('network-update', simulation_instance.get_state())
                except Exception:
                    print("❌ Exception while emitting network-update:")
                    traceback.print_exc()

                # cadence (guard against zero or negative sim_speed)
                await asyncio.sleep(1 / max(1, getattr(simulation_instance, 'sim_speed', 1)))

            except asyncio.CancelledError:
                print(f"🛑 Simulation loop for {simulation_instance.section_code} was cancelled (inner).")
                raise
            except Exception as exc:
                print(f"❗ Uncaught exception inside simulation loop for {simulation_instance.section_code}: {exc}")
                traceback.print_exc()
                try:
                    await sio.emit('simulation:error', {'message': f'Internal simulation error: {str(exc)}'})
                except Exception:
                    pass
                await asyncio.sleep(1)

    except asyncio.CancelledError:
        print(f"🛑 Simulation loop for {simulation_instance.section_code} was cancelled (outer).")
    finally:
        print(f"Simulation loop for {simulation_instance.section_code} has ended.")


@sio.event
async def connect(sid, environ):
    print(f"✅ Client connected: {sid}")
    # Send authoritative AI control state immediately to the connecting client so frontends stay in sync
    try:
        await sio.emit('ai:control_state_changed', {'enabled': ai_control_enabled}, to=sid)
    except Exception:
        pass

    if current_simulation:
        print(f"   -> Active simulation found. Syncing client {sid}.")
        await sio.emit('initial-state', current_simulation.get_state(), to=sid)


@sio.event
async def disconnect(sid):
    print(f"🔌 Client disconnected: {sid}")


@sio.event
async def controller_start_simulation(sid, data):
    global simulation_task, current_simulation, pending_faulty_tracks, manual_override_timestamps, pending_signal_overrides
    station_code = data.get('station_code', 'DLI')
    if simulation_task and not simulation_task.done():
        simulation_task.cancel()

    try:
        simulation_instance = Simulation(section_code=station_code)

        # Force server-side always-on flags into simulation
        simulation_instance.set_ai_priorities(current_ai_priorities)

        # apply pending signal overrides (if any) - these come from UI actions performed while sim wasn't running
        if pending_signal_overrides:
            for sig_id, state in list(pending_signal_overrides.items()):
                simulation_instance.set_signal_state(sig_id, state)
                # also stamp manual override time so AI respects them briefly
                manual_override_timestamps[sig_id] = time.time()
            pending_signal_overrides.clear()

        # apply any pending faulty tracks
        if pending_faulty_tracks:
            for trackid in list(pending_faulty_tracks):
                apply_track_status_to_sim(simulation_instance, trackid, 'FAULTY')
            pending_faulty_tracks.clear()

        # apply pending manual signal overrides recorded in timestamps (if any)
        for sid_id, ts_or_state in list(manual_override_timestamps.items()):
            # we only have timestamps here; pending_signal_overrides handles explicit state-to-apply
            # if signal exists in sim.nodes_map, don't overwrite its state here (it will be applied above if pending)
            if sid_id in simulation_instance.nodes_map:
                # leave node's existing state; timestamp is only for preserving manual preference
                pass

        optimizer_instance = Optimizer(simulation_instance=simulation_instance)
        current_simulation = simulation_instance

        pause_event.set()
        simulation_task = asyncio.create_task(simulation_loop(simulation_instance, optimizer_instance))

        await sio.emit('simulation:started')
        await sio.emit('initial-state', current_simulation.get_state())

        # Inform clients of AI control state as well (ensure UI shows correct toggle)
        try:
            await sio.emit('ai:control_state_changed', {'enabled': ai_control_enabled})
        except Exception:
            pass

    except ValueError as e:
        await sio.emit('simulation:error', {'message': str(e)})


# unified manual signal setter (single implementation)
@sio.event
async def controller_set_signal(sid, data):
    """
    UI sends { signalId: 'S-PF-3', state: 'GREEN' } to manually set a signal.
    If simulation is running, apply immediately; otherwise queue in pending_signal_overrides.
    Records manual override timestamp so AI will adapt.
    """
    global manual_override_timestamps, pending_signal_overrides, current_simulation

    if not isinstance(data, dict):
        print("⚠️ controller_set_signal invalid payload:", data)
        return

    sid_id = data.get('signalId') or data.get('signal_id') or data.get('nodeId') or data.get('id')
    desired = data.get('state')

    if not sid_id:
        print("⚠️ controller_set_signal missing signalId:", data)
        return

    sid_id = sid_id.strip().upper()
    if desired:
        desired = desired.strip().upper()

    # if sim active, toggle if no desired state provided
    if current_simulation:
        current_state = current_simulation.nodes_map.get(sid_id, {}).get('state', 'RED')
        if not desired:
            desired = 'GREEN' if current_state != 'GREEN' else 'RED'
        # apply as manual
        apply_signal_state(current_simulation, sid_id, desired, by='manual')
        # broadcast immediate update
        await sio.emit('network-update', current_simulation.get_state())
    else:
        # simulation not running: queue override to apply on start
        desired = desired or 'GREEN'
        pending_signal_overrides[sid_id] = desired
        manual_override_timestamps[sid_id] = time.time()
        print(f"🕓 Queued manual signal override {sid_id} => {desired} (simulation not running).")


@sio.event
async def controller_toggle_ai_control(sid, data):
    """
    UI sends { enabled: true/false } to toggle whether the server AI should
    control signals automatically.
    """
    global ai_control_enabled
    enable = data.get('enabled') if isinstance(data, dict) else None
    if isinstance(enable, bool):
        ai_control_enabled = enable
    else:
        ai_control_enabled = not ai_control_enabled

    print(f"⚖️ AI control set to: {ai_control_enabled}")
    await sio.emit('ai:control_state_changed', {'enabled': ai_control_enabled})


@sio.event
async def controller_toggle_pause_simulation(sid, data):
    is_playing = data.get('isPlaying', False)
    if is_playing:
        pause_event.set()
        print("▶️ Simulation Resumed")
    else:
        pause_event.clear()
        print("⏸️ Simulation Paused")
    await sio.emit('simulation:state_changed', {'isPlaying': is_playing})


@sio.event
async def controller_stop_simulation(sid, data):
    global simulation_task, current_simulation
    if simulation_task:
        simulation_task.cancel()
        simulation_task = None
    current_simulation = None
    print("⏹️ Simulation Stopped and Reset by Controller.")
    await sio.emit('simulation:stopped')


@sio.event
async def controller_set_sim_speed(sid, data):
    if current_simulation:
        speed = data.get('speed', 1)
        current_simulation.sim_speed = speed
        print(f"⚙️ Simulation speed set to: {speed}x")


@sio.event
async def controller_set_priorities(sid, data):
    """
    UI sends the ai priorities. Server forces community rules:
     - 'congestion' and 'trackCondition' are ALWAYS true.
     - 'weather' if toggled to True => simulation assigns random bad-weather segments (2-3).
    """
    global current_ai_priorities, current_simulation
    if not isinstance(data, dict):
        print("⚠️ controller_set_priorities got invalid payload:", data)
        return

    # persist user choices but enforce always-on ones
    user_priorities = dict(data)
    user_priorities['congestion'] = True
    user_priorities['trackCondition'] = True
    current_ai_priorities = user_priorities

    print("🎛️ Updated AI priorities (server authoritative):", current_ai_priorities)

    if current_simulation:
        current_simulation.set_ai_priorities(current_ai_priorities)
        # handle weather toggle: when enabled assign random bad-weather segments,
        # when disabled clear weather.
        if current_ai_priorities.get('weather'):
            current_simulation.assign_random_weather(choose_count=3)
        else:
            current_simulation.clear_weather()
        await sio.emit('network-update', current_simulation.get_state())


@sio.event
async def controller_set_track_status(sid, data):
    global pending_faulty_tracks, current_simulation
    track_id = data.get('trackId') or data.get('track_id') or data.get('track')
    status = data.get('status')

    if not track_id or not status:
        print(f"⚠️ controller_set_track_status missing data: {data}")
        return

    track_id = track_id.strip().upper()

    if current_simulation:
        apply_track_status_to_sim(current_simulation, track_id, status)
        await sio.emit('network-update', current_simulation.get_state())
    else:
        if status == 'FAULTY':
            pending_faulty_tracks.add(track_id)
            print(f"🕓 Queued pending faulty track {track_id} (simulation not running).")
        else:
            if track_id in pending_faulty_tracks:
                pending_faulty_tracks.discard(track_id)
                print(f"🧾 Removed {track_id} from pending faulty list.")


@sio.event
async def controller_get_plan(sid, data):
    if current_simulation:
        current_simulation.plan_needed = True
        print("👨‍💻 Controller manually requested a new AI plan.")


# New: set all lights red (manual override)
@sio.event
async def controller_set_all_signals_red(sid, data):
    """
    Force all signals to RED and mark them as manual overrides.
    """
    global manual_override_timestamps, current_simulation, pending_signal_overrides
    if current_simulation:
        count = 0
        for node in current_simulation.network.get('nodes', []):
            if node.get('type') == 'SIGNAL':
                apply_signal_state(current_simulation, node['id'], 'RED', by='manual')
                count += 1
        await sio.emit('network-update', current_simulation.get_state())
        print(f"🔴 Set all signals RED (count={count})")
    else:
        # If sim not running, queue marker for "set-all-red" — we can't enumerate signals before a layout is loaded.
        # Keep a small marker in pending_signal_overrides; frontend should re-request or toggle signals after load.
        pending_signal_overrides['_ALL_SIGNALS_RED_'] = True
        print("🕓 Received set-all-signals-red while simulation not running. Will apply after start.")


@app.on_event("startup")
async def startup_event():
    print("🚀 Server starting up... waiting for client to start simulation.")
