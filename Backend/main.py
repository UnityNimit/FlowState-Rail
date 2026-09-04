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

ai_control_enabled = True 
manual_override_timestamps = {}
pending_signal_overrides = {}
MANUAL_OVERRIDE_GRACE_SECONDS = 15

current_ai_priorities = {
    'congestion': True, 
    'trainType': True,
    'punctuality': True,
    'trackCondition': True, 
    'weather': False
}

pending_track_statuses = {}
socket_workspaces = {}


def persist_simulation_checkpoint(sid):
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
    global manual_override_timestamps

    state = (state or 'RED').upper()
    signal_id = signal_id.strip().upper()

    if by == 'manual':
        manual_override_timestamps[signal_id] = time.time()
        if signal_id in sim.nodes_map:
            sim.nodes_map[signal_id]['state'] = state
        for n in sim.network['nodes']:
            if n['id'] == signal_id:
                n['state'] = state
        sim.plan_needed = True
        print(f"✋ Manual override applied: signal {signal_id} => {state}")
        try:
            asyncio.create_task(sio.emit('network-update', sim.get_state()))
        except Exception:
            pass
        return True
    else:
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
    if not ai_control_enabled:
        return (0, 0)

    greens_applied = 0
    desired_green_signals = set()

    for train in sim.active_trains:
        state = train.get('state')
        if state not in ('READY_TO_PROCEED', 'STOPPED_AWAITING_CLEARANCE'):
            continue
        route = train.get('route') or []
        node_path = train.get('node_path') or []
        if not route or not node_path:
            continue

        if state == 'READY_TO_PROCEED':
            departure_node = node_path[0]
            next_segment = route[0]
            next_node_after = node_path[1] if len(node_path) > 1 else None
        else:
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

        seg = sim.segments_map.get(next_segment, {})
        if sim._segment_unavailable(next_segment):
            continue
        if sim.current_ai_priorities.get('weather') and seg.get('weather') == 'BAD':
            continue
        if next_segment in sim.locked_resources:
            continue
        if next_node_after and next_node_after in sim.locked_resources:
            continue

        if _signal_overridden_recently(departure_node):
            continue

        desired_green_signals.add(departure_node.upper())

    for sig in desired_green_signals:
        applied_ok = apply_signal_state(sim, sig, 'GREEN', by='ai')
        if applied_ok:
            greens_applied += 1

    reds_applied = 0
    node_map = {n['id'].upper(): n for n in sim.network.get('nodes', [])}

    for node_id, node in node_map.items():
        if node.get('type') != 'SIGNAL':
            continue
        current_state = (node.get('state') or '').upper()
        if current_state != 'GREEN':
            continue  

        if node_id in desired_green_signals:
            continue

        if _signal_overridden_recently(node_id):
            continue

        block_safe = True
        for t in sim.active_trains:
            if t.get('state') != 'RUNNING':
                continue
            t_node_path = t.get('node_path') or []
            if node_id in [n.upper() for n in t_node_path]:
                try:
                    idx = t_node_path.index(node_id)
                    current_seg = t.get('currentSegmentId')
                    if current_seg:
                        t_route = t.get('route') or []
                        node_after_segments = sim._convert_segment_path_to_node_path(t_route)
                        if node_id in node_after_segments:
                            block_safe = False
                            break
                except Exception:
                    pass

        if not block_safe:
            continue

        try:
            neighbors = sim.adjacency_list.get(node_id, [])
            unsafe = False
            for nb in neighbors:
                seg_id = nb.get('segment_id')
                if seg_id and seg_id in sim.locked_resources:
                    unsafe = True
                    break
            if unsafe:
                continue
        except Exception:
            continue

        applied_ok = apply_signal_state(sim, node_id, 'RED', by='ai')
        if applied_ok:
            reds_applied += 1

    return (greens_applied, reds_applied)


async def simulation_loop(simulation_instance, optimizer_instance):
    global is_optimizing
    print(f"🏁 Simulation loop started for {simulation_instance.section_code}.")
    try:
        while True:
            try:
                await pause_event.wait()

                try:
                    if hasattr(simulation_instance, 'tick') and callable(getattr(simulation_instance, 'tick')):
                        simulation_instance.tick()
                    else:
                        print("⚠️ Warning: simulation_instance has no 'tick'. Attempting fallback internal step.")
                        if hasattr(simulation_instance, 'current_time_seconds') and hasattr(simulation_instance, 'tick_rate'):
                            simulation_instance.current_time_seconds += simulation_instance.tick_rate * max(1, getattr(simulation_instance, 'sim_speed', 1))
                        if hasattr(simulation_instance, '_spawn_trains'):
                            simulation_instance._spawn_trains()
                        if hasattr(simulation_instance, '_check_and_dispatch_trains'):
                            simulation_instance._check_and_dispatch_trains()
                        if hasattr(simulation_instance, '_update_train_positions'):
                            simulation_instance._update_train_positions()
                        if hasattr(simulation_instance, '_update_network_state'):
                            simulation_instance._update_network_state()
                except Exception as e:
                    print("❌ Exception during simulation tick/fallback:")
                    traceback.print_exc()
                    await sio.emit('simulation:error', {'message': 'Simulation tick error: ' + str(e)})
                    await asyncio.sleep(0.5)
                    continue

                try:
                    current_state = simulation_instance.get_state()
                except Exception as e:
                    print("❌ Exception while getting simulation state:")
                    traceback.print_exc()
                    current_state = {"timestamp": getattr(simulation_instance, 'current_time_seconds', 0), "network": getattr(simulation_instance, 'network', {}), "trains": getattr(simulation_instance, 'active_trains', [])}

                try:
                    if ai_control_enabled and not is_optimizing:
                        greens, reds = ai_try_clear_waiting_trains(simulation_instance)
                        if (greens + reds) > 0:
                            print(f"🤖 AI proactively opened {greens} signal(s) and closed {reds} signal(s) this tick.")
                            simulation_instance.plan_needed = True
                except Exception:
                    print("⚠️ Exception while running ai_try_clear_waiting_trains:")
                    traceback.print_exc()

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
                        if plan:
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
                                        traceback.print_exc()

                            try:
                                simulation_instance.apply_plan(plan)
                                await sio.emit('ai:plan-update', plan)
                            except Exception:
                                print("❌ Exception while applying plan:")
                                traceback.print_exc()
                                await sio.emit('simulation:error', {'message': 'Apply plan error'})
                    except Exception as e:
                        print("❌ Exception during optimizer.generate_plan():")
                        traceback.print_exc()
                        await sio.emit('simulation:error', {'message': 'Optimizer error: ' + str(e)})
                    finally:
                        # CHANGED: Absolute guarantee that optimization lock clears so it doesn't freeze the system
                        is_optimizing = False

                try:
                    await sio.emit('network-update', simulation_instance.get_state())
                except Exception:
                    print("❌ Exception while emitting network-update:")
                    traceback.print_exc()

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
        is_optimizing = False
        print(f"Simulation loop for {simulation_instance.section_code} has ended.")


@sio.event
async def connect(sid, environ, auth=None):
    workspace_id = "default-workspace"
    if auth and isinstance(auth, dict) and auth.get('workspaceToken'):
        try:
            workspace_id = resolve_workspace_token(auth.get('workspaceToken'))
        except Exception as exc:
            print(f"Notice: workspaceToken resolution for {sid}: {exc}")
    socket_workspaces[sid] = workspace_id
    try:
        await sio.enter_room(sid, workspace_id)
    except Exception:
        pass
    print(f"✅ Client connected: {sid}")
    try:
        await sio.emit('ai:control_state_changed', {'enabled': ai_control_enabled}, to=sid)
    except Exception:
        pass

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
async def start_simulation(sid, data):
    await controller_start_simulation(sid, data)


@sio.event
async def controller_start_simulation(sid, data):
    # CHANGED: Ensure the global is_optimizing lock is wiped clean whenever we start the simulation!
    global simulation_task, current_simulation, pending_track_statuses, manual_override_timestamps, pending_signal_overrides, is_optimizing
    is_optimizing = False
    
    if isinstance(data, dict):
        station_code = data.get('station_code') or data.get('station') or data.get('stationCode') or 'CORRIDOR'
    elif isinstance(data, str) and data.strip():
        station_code = data.strip()
    else:
        station_code = 'CORRIDOR'
    if simulation_task and not simulation_task.done():
        simulation_task.cancel()

    try:
        simulation_instance = Simulation(section_code=station_code)
        simulation_instance.set_ai_priorities(current_ai_priorities)

        if pending_signal_overrides:
            for sig_id, state in list(pending_signal_overrides.items()):
                simulation_instance.set_signal_state(sig_id, state)
                manual_override_timestamps[sig_id] = time.time()
            pending_signal_overrides.clear()

        if pending_track_statuses:
            for trackid, status in list(pending_track_statuses.items()):
                apply_track_status_to_sim(simulation_instance, trackid, status)
            pending_track_statuses.clear()

        for sid_id, ts_or_state in list(manual_override_timestamps.items()):
            if sid_id in simulation_instance.nodes_map:
                pass

        optimizer_instance = Optimizer(simulation_instance=simulation_instance)
        current_simulation = simulation_instance

        pause_event.set()
        simulation_task = asyncio.create_task(simulation_loop(simulation_instance, optimizer_instance))

        await sio.emit('simulation:started')
        await sio.emit('initial-state', current_simulation.get_state())
        persist_simulation_checkpoint(sid)

        try:
            await sio.emit('ai:control_state_changed', {'enabled': ai_control_enabled})
        except Exception:
            pass

    except ValueError as e:
        await sio.emit('simulation:error', {'message': str(e)})


@sio.event
async def controller_set_signal(sid, data):
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

    if current_simulation:
        current_state = current_simulation.nodes_map.get(sid_id, {}).get('state', 'RED')
        if not desired:
            desired = 'GREEN' if current_state != 'GREEN' else 'RED'
        apply_signal_state(current_simulation, sid_id, desired, by='manual')
        await sio.emit('network-update', current_simulation.get_state())
        persist_simulation_checkpoint(sid)
    else:
        desired = desired or 'GREEN'
        pending_signal_overrides[sid_id] = desired
        manual_override_timestamps[sid_id] = time.time()
        print(f"🕓 Queued manual signal override {sid_id} => {desired} (simulation not running).")


@sio.event
async def controller_toggle_ai_control(sid, data):
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
    # CHANGED: Ensure stopping the simulation clears the lock so restarting it works
    global simulation_task, current_simulation, is_optimizing
    if simulation_task:
        simulation_task.cancel()
        simulation_task = None
    current_simulation = None
    is_optimizing = False
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
    global current_ai_priorities, current_simulation
    if not isinstance(data, dict):
        print("⚠️ controller_set_priorities got invalid payload:", data)
        return

    user_priorities = dict(data)
    user_priorities['congestion'] = True
    user_priorities['trackCondition'] = True
    current_ai_priorities = user_priorities

    print("🎛️ Updated AI priorities (server authoritative):", current_ai_priorities)

    if current_simulation:
        current_simulation.set_ai_priorities(current_ai_priorities)
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


@sio.event
async def controller_set_all_signals_red(sid, data):
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