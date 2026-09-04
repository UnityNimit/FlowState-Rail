import sys
import os

try:
    from dotenv import load_dotenv
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
    load_dotenv(env_path)
except ImportError:
    pass

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import asyncio
import json
import uuid
import socketio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from simulation import Simulation
from optimizer import Optimizer
from planning_api import router as planning_router, resolve_workspace_token
from planning_models import initialize_database, SessionLocal, SimulationCheckpoint
import time
import traceback

cors_env = os.getenv("CORS_ORIGINS", "*")
allowed_origins = [origin.strip() for origin in cors_env.split(",") if origin.strip()] if cors_env != "*" else ["*"]
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins="*")
app = FastAPI(title="FlowState Rail API", version="2.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(planning_router)
if not os.getenv("DATABASE_URL"):
    # Zero-configuration local demo/test mode. Production Supabase schemas are
    # managed explicitly by Alembic during the Render build.
    initialize_database()
socket_app = socketio.ASGIApp(sio, app)

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')


@app.get("/")
@app.get("/health")
async def health():
    return {
        "service": "FlowState Rail API",
        "status": "ok",
        "schemaVersion": 2,
        "planningSchemaVersion": 1,
        "persistence": "supabase-postgresql" if os.getenv("DATABASE_URL") else "local-sqlite",
        "simulation": current_simulation.section_code if current_simulation else None,
    }


@app.get("/api/network/{station_code}")
async def get_network_layout(station_code: str):
    """
    Single source of truth for railway network topologies.
    Returns authentic V2 network layout directly from Backend/data.
    """
    code = station_code.lower().strip()
    aliases = {
        'corridor': 'corridor_layout.json',
        'dli': 'dli_layout.json',
        'dsa': 'dsa_layout.json',
        'anvr': 'anvr_layout.json',
        'anand_vihar': 'anvr_layout.json',
        'gzb': 'gzb_layout.json',
        'ghaziabad': 'gzb_layout.json',
        'sbb': 'sbb_layout.json',
        'sahibabad': 'sbb_layout.json',
    }
    filename = aliases.get(code, f"{code}_layout.json")
    filepath = os.path.join(DATA_DIR, filename)
    if not os.path.exists(filepath):
        filepath = os.path.join(DATA_DIR, 'corridor_layout.json')
    
    if not os.path.exists(filepath):
        return {"error": f"Network layout for {station_code} not found."}
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return data.get('network', data)
    except Exception as e:
        return {"error": str(e)}

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
pending_track_statuses = {}
socket_workspaces = {}


def persist_simulation_checkpoint(sid):
    """Persist recoverable evidence after each operator mutation."""
    workspace_id = socket_workspaces.get(sid)
    if not workspace_id or not current_simulation:
        return
    try:
        with SessionLocal() as db:
            db.add(SimulationCheckpoint(id=str(uuid.uuid4()), workspace_id=workspace_id, station_code=current_simulation.section_code, payload=current_simulation.get_state()))
            db.commit()
    except Exception as exc:
        print(f"Checkpoint persistence warning: {exc}")


def _signal_overridden_recently(signal_id: str) -> bool:
    ts = manual_override_timestamps.get(signal_id)
    if not ts:
        return False
    return (time.time() - ts) < MANUAL_OVERRIDE_GRACE_SECONDS


def apply_track_status_to_sim(sim: Simulation, track_id: str, status: str):
    status = status.upper()
    if status in {'FAULTY', 'MAINTENANCE'} and track_id in sim.locked_resources:
        print(f"⛔ Refused status={status} for occupied/locked resource {track_id}.")
        return False
    updated = False
    for seg in sim.network['trackSegments']:
        if seg['id'] == track_id:
            seg['status'] = status
            if track_id in sim.segments_map:
                sim.segments_map[track_id]['status'] = status
            updated = True
            break
    if status in {'FAULTY', 'MAINTENANCE'}:
        sim.locked_resources.add(track_id)
    else:
        sim.locked_resources.discard(track_id)

    if updated:
        sim.plan_needed = True
        print(f"🔧 Applied status={status} to track {track_id} in simulation {sim.section_code}.")
    return updated


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
            next_node_after = node_path[1] if len(node_path) > 1 else None
        else:
            # STOPPED_AWAITING_CLEARANCE
            try:
                idx = route.index(train.get('currentSegmentId'))
                if (idx + 1) < len(node_path):
                    departure_node = node_path[idx + 1]
                else:
                    departure_node = node_path[0]
                next_segment = route[idx + 1] if (idx + 1) < len(route) else None
                next_node_after = node_path[idx + 2] if (idx + 2) < len(node_path) else None
            except Exception:
                departure_node = node_path[0]
                next_segment = route[0]
                next_node_after = node_path[1] if len(node_path) > 1 else None
        if not next_segment:
            continue

        # safety checks: segment not faulty, weather priorities, resources not locked
        seg = sim.segments_map.get(next_segment, {})
        if sim._segment_unavailable(next_segment):
            continue
        if sim.current_ai_priorities.get('weather') and seg.get('weather') == 'BAD':
            continue
        if next_segment in sim.locked_resources:
            continue
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
                    try:
                        plan = await asyncio.to_thread(
                            optimizer_instance.generate_plan,
                            trains_needing_plan,
                            current_state,
                            current_ai_priorities
                        )
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
async def connect(sid, environ, auth=None):
    try:
        workspace_id = resolve_workspace_token((auth or {}).get('workspaceToken'))
    except ValueError as exc:
        print(f"Rejected socket {sid}: {exc}")
        return False
    socket_workspaces[sid] = workspace_id
    await sio.enter_room(sid, workspace_id)
    print(f"✅ Client connected: {sid}")
    # Send authoritative AI control state immediately to the connecting client so frontends stay in sync
    try:
        await sio.emit('ai:control_state_changed', {'enabled': ai_control_enabled}, to=sid)
    except Exception:
        pass

    # Always tell a reconnecting dashboard whether a live in-memory simulation
    # actually exists.  Without this, a backend reload leaves the browser
    # displaying its final cached train positions as if traffic were deadlocked.
    await sio.emit('simulation:status', {
        'hasSimulation': current_simulation is not None,
        'isPlaying': bool(current_simulation and pause_event.is_set()),
        'stationCode': current_simulation.section_code if current_simulation else None,
    }, to=sid)

    if current_simulation:
        print(f"   -> Active simulation found. Syncing client {sid}.")
        await sio.emit('initial-state', current_simulation.get_state(), to=sid)


@sio.event
async def disconnect(sid):
    socket_workspaces.pop(sid, None)
    print(f"🔌 Client disconnected: {sid}")


@sio.event
async def controller_start_simulation(sid, data):
    global simulation_task, current_simulation, pending_track_statuses, manual_override_timestamps, pending_signal_overrides
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

        # Apply offline-selected maintenance/failure states atomically after layout load.
        if pending_track_statuses:
            for trackid, status in list(pending_track_statuses.items()):
                apply_track_status_to_sim(simulation_instance, trackid, status)
            pending_track_statuses.clear()

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
        persist_simulation_checkpoint(sid)

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
        persist_simulation_checkpoint(sid)
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
    persist_simulation_checkpoint(sid)


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
        persist_simulation_checkpoint(sid)


@sio.event
async def controller_set_track_status(sid, data):
    global pending_track_statuses, current_simulation
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
        if status.upper() in {'FAULTY', 'MAINTENANCE'}:
            pending_track_statuses[track_id] = status.upper()
            print(f"🕓 Queued pending track state {track_id}={status.upper()} (simulation not running).")
        else:
            if track_id in pending_track_statuses:
                pending_track_statuses.pop(track_id, None)
                print(f"🧾 Removed {track_id} from pending track states.")


@sio.event
async def controller_set_maintenance_zone(sid, data):
    """Reserve/release every segment, point and OHE group in a v2 maintenance zone."""
    if not current_simulation or not isinstance(data, dict):
        return
    zone_id = data.get('zoneId') or data.get('zone_id')
    active = bool(data.get('active', True))
    applied = current_simulation.set_maintenance_zone(zone_id, active)
    await sio.emit('maintenance:zone-state', {'zoneId': zone_id, 'active': active, 'applied': applied})
    await sio.emit('network-update', current_simulation.get_state())
    persist_simulation_checkpoint(sid)


@sio.event
async def controller_generate_block_plan(sid, data):
    """Generate weekly/monthly coordinated block plans without changing live state."""
    payload = data if isinstance(data, dict) else {}
    horizon = payload.get('horizon', 'weekly')
    station_code = payload.get('stationCode', 'CORRIDOR')
    try:
        planning_simulation = current_simulation or Simulation(station_code)
        planner = Optimizer(planning_simulation)
        plan = await asyncio.to_thread(planner.generate_maintenance_plan, horizon)
        await sio.emit('maintenance:plan-update', plan, to=sid)
    except Exception as exc:
        traceback.print_exc()
        await sio.emit('simulation:error', {'message': f'Block planning error: {exc}'}, to=sid)


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


@sio.on('chatbot:query')
async def handle_chatbot_query(sid, data):
    question = data.get('question', '') if isinstance(data, dict) else ''
    network_state = data.get('networkState', {}) if isinstance(data, dict) else {}
    print(f"💬 Chatbot query received from {sid}: {question}")
    await sio.emit('chatbot:thinking', to=sid)

    api_key = os.getenv('GEMINI_API_KEY')
    reply_text = None

    if api_key:
        try:
            import google.generativeai as genai
            genai.configure(api_key=api_key)
            prompt = f"""You are "RailOps AI," an intelligent, real-time railway operations assistant for Indian Railways traffic control.
Answer the controller's question concisely, accurately, and professionally using ONLY the current system state below.

System State:
{json.dumps(network_state, indent=2)}

Controller Question:
"{question}"

Instructions:
- Keep the response short and direct (1-3 sentences).
- If information isn't in the state snapshot, state that clearly without guessing.
"""
            model = genai.GenerativeModel('gemini-1.5-flash')
            res = await asyncio.to_thread(model.generate_content, prompt)
            reply_text = res.text.strip()
        except Exception as err:
            print(f"⚠️ Gemini API chat error: {err}")
            err_str = str(err)
            if "429" in err_str or "Quota" in err_str:
                quota_note = " (Note: Gemini API free-tier quota is currently exhausted for this key.)"
            else:
                quota_note = f" (Note: Gemini API returned: {err_str[:60]}...)"
            
            trains = network_state.get('trains', [])
            running = [t for t in trains if t.get('state') == 'RUNNING']
            waiting = [t for t in trains if t.get('state') in ('WAITING_PLAN', 'READY_TO_PROCEED')]
            faulty = [s for s in network_state.get('network', {}).get('trackSegments', []) if s.get('status') == 'FAULTY']
            reply_text = f"Network Status: {len(running)} train(s) running, {len(waiting)} waiting for dispatch, {len(faulty)} track segment(s) reported faulty.{quota_note}"
    else:
        trains = network_state.get('trains', [])
        running = [t for t in trains if t.get('state') == 'RUNNING']
        waiting = [t for t in trains if t.get('state') in ('WAITING_PLAN', 'READY_TO_PROCEED')]
        reply_text = f"RailOps Local Status: {len(running)} train(s) running, {len(waiting)} waiting. (Add GEMINI_API_KEY to backend/.env to enable generative AI responses)."

    await sio.emit('chatbot:response', {'sender': 'ai', 'text': reply_text}, to=sid)


@app.on_event("startup")
async def startup_event():
    print("🚀 Server starting up... waiting for client to start simulation.")


if __name__ == "__main__":
    import uvicorn
    import argparse
    parser = argparse.ArgumentParser(description="FlowState-Rail Dispatch Server")
    parser.add_argument("--port", type=int, default=int(os.getenv("PORT", 8002)), help="Port to listen on")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Host to bind to")
    args = parser.parse_args()
    print(f"[START] Starting server on {args.host}:{args.port}...")
    uvicorn.run("main:socket_app", host=args.host, port=args.port, reload=False)
