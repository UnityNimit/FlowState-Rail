import sys
import os

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import asyncio
import json
import socketio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from simulation import Simulation
from optimizer import Optimizer
import time
import traceback

try:
    from dotenv import load_dotenv
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
    load_dotenv(env_path)
except ImportError:
    pass

sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins="*")

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

pending_faulty_tracks = set()


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[SYS] FlowState-Rail Autonomous Dispatch Server initialized.")
    yield
    global simulation_task
    if simulation_task and not simulation_task.done():
        simulation_task.cancel()


app = FastAPI(
    title="FlowState-Rail Dispatch & Interlocking API",
    version="1.0.0",
    lifespan=lifespan
)


@app.get("/")
@app.get("/health")
def health_check():
    return {
        "status": "online",
        "service": "FlowState-Rail Interlocking Engine",
        "timestamp": time.time(),
        "interlocking": "operational"
    }


socket_app = socketio.ASGIApp(sio, app)


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
        print(f"[TRACK] Section {track_id} status updated to {status} in [{sim.section_code}].")


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
        print(f"[MANUAL] Signal override: {signal_id} -> {state}.")
        try:
            asyncio.create_task(sio.emit('network-update', sim.get_state()))
        except Exception:
            pass
        return True
    else:
        if not ai_control_enabled:
            return False
        if _signal_overridden_recently(signal_id):
            return False
        if signal_id in sim.nodes_map:
            sim.nodes_map[signal_id]['state'] = state
        for n in sim.network['nodes']:
            if n['id'] == signal_id:
                n['state'] = state
        sim.plan_needed = True
        print(f"[AI-SIGNAL] {signal_id} -> {state}.")
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
        else:
            try:
                idx = route.index(train.get('currentSegmentId'))
                departure_node = node_path[idx + 1] if (idx + 1) < len(node_path) else node_path[0]
                next_segment = route[idx + 1] if (idx + 1) < len(route) else None
            except Exception:
                departure_node = node_path[0]
                next_segment = route[0]

        if not next_segment:
            continue

        seg = sim.segments_map.get(next_segment, {})
        if seg.get('status') == 'FAULTY':
            continue
        if sim.current_ai_priorities.get('weather') and seg.get('weather') == 'BAD':
            continue
        if next_segment in sim.locked_resources:
            continue

        try:
            np_node_path = sim._convert_segment_path_to_node_path([next_segment])
            next_node_after = np_node_path[1] if len(np_node_path) > 1 else None
        except Exception:
            next_node_after = None

        if next_node_after and next_node_after in sim.locked_resources:
            continue
        if _signal_overridden_recently(departure_node):
            continue

        desired_green_signals.add(departure_node.upper())

    for sig in desired_green_signals:
        if apply_signal_state(sim, sig, 'GREEN', by='ai'):
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

        if apply_signal_state(sim, node_id, 'RED', by='ai'):
            reds_applied += 1

    return (greens_applied, reds_applied)


async def simulation_loop(simulation_instance, optimizer_instance):
    global is_optimizing
    print(f"[LOOP] Simulation loop started for [{simulation_instance.section_code}].")
    try:
        while True:
            try:
                await pause_event.wait()

                try:
                    simulation_instance.tick()
                except Exception as e:
                    print(f"[ERROR] Simulation tick failure: {e}")
                    traceback.print_exc()
                    await sio.emit('simulation:error', {'message': f'Simulation tick error: {str(e)}'})
                    await asyncio.sleep(0.5)
                    continue

                try:
                    current_state = simulation_instance.get_state()
                except Exception as e:
                    print(f"[ERROR] Simulation state extraction failure: {e}")
                    current_state = {
                        "timestamp": getattr(simulation_instance, 'current_time_seconds', 0),
                        "network": getattr(simulation_instance, 'network', {}),
                        "trains": getattr(simulation_instance, 'active_trains', [])
                    }

                try:
                    if ai_control_enabled and not is_optimizing:
                        greens, reds = ai_try_clear_waiting_trains(simulation_instance)
                        if (greens + reds) > 0:
                            simulation_instance.plan_needed = True
                except Exception:
                    pass

                trains_needing_plan = [
                    t for t in current_state.get('trains', [])
                    if t.get('state') == 'WAITING_PLAN'
                ]

                if trains_needing_plan and not is_optimizing and getattr(simulation_instance, 'plan_needed', False):
                    is_optimizing = True
                    simulation_instance.plan_needed = False
                    await sio.emit('ai:plan-thinking')

                    try:
                        plan = await asyncio.to_thread(
                            optimizer_instance.generate_plan,
                            trains_needing_plan,
                            current_state,
                            current_ai_priorities
                        )
                    except Exception as e:
                        print(f"[ERROR] Optimizer invocation failure: {e}")
                        traceback.print_exc()
                        await sio.emit('simulation:error', {'message': f'Optimizer error: {str(e)}'})
                        plan = []

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
                                    pass

                        try:
                            simulation_instance.apply_plan(plan)
                            await sio.emit('ai:plan-update', plan)
                        except Exception:
                            traceback.print_exc()
                            await sio.emit('simulation:error', {'message': 'Plan application error'})

                    is_optimizing = False

                try:
                    await sio.emit('network-update', simulation_instance.get_state())
                except Exception:
                    pass

                await asyncio.sleep(1 / max(1, getattr(simulation_instance, 'sim_speed', 1)))

            except asyncio.CancelledError:
                raise
            except Exception as exc:
                print(f"[ERROR] Exception in simulation loop: {exc}")
                traceback.print_exc()
                await asyncio.sleep(1)

    except asyncio.CancelledError:
        print(f"[LOOP] Simulation loop for [{simulation_instance.section_code}] stopped.")
    finally:
        print(f"[LOOP] Simulation loop terminated.")


@sio.event
async def connect(sid, environ):
    print(f"[NET] Client connected: {sid}")
    try:
        await sio.emit('ai:control_state_changed', {'enabled': ai_control_enabled}, to=sid)
    except Exception:
        pass

    if current_simulation:
        await sio.emit('initial-state', current_simulation.get_state(), to=sid)


@sio.event
async def disconnect(sid):
    print(f"[NET] Client disconnected: {sid}")


async def _start_sim_handler(sid, data):
    global simulation_task, current_simulation, pending_faulty_tracks, manual_override_timestamps, pending_signal_overrides
    station_code = data.get('station_code', 'CORRIDOR') if isinstance(data, dict) else 'CORRIDOR'

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

        if pending_faulty_tracks:
            for trackid in list(pending_faulty_tracks):
                apply_track_status_to_sim(simulation_instance, trackid, 'FAULTY')
            pending_faulty_tracks.clear()

        optimizer_instance = Optimizer(simulation_instance=simulation_instance)
        current_simulation = simulation_instance

        pause_event.set()
        simulation_task = asyncio.create_task(simulation_loop(simulation_instance, optimizer_instance))

        await sio.emit('simulation:started')
        await sio.emit('initial-state', current_simulation.get_state())
        await sio.emit('ai:control_state_changed', {'enabled': ai_control_enabled})

    except Exception as e:
        print(f"[ERROR] Failed to start simulation: {e}")
        await sio.emit('simulation:error', {'message': str(e)})


@sio.event
async def controller_start_simulation(sid, data):
    await _start_sim_handler(sid, data)


@sio.event
async def start_simulation(sid, data):
    await _start_sim_handler(sid, data)


@sio.event
async def controller_set_signal(sid, data):
    global manual_override_timestamps, pending_signal_overrides, current_simulation

    if not isinstance(data, dict):
        return

    sid_id = data.get('signalId') or data.get('signal_id') or data.get('nodeId') or data.get('id')
    desired = data.get('state')

    if not sid_id:
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
    else:
        desired = desired or 'GREEN'
        pending_signal_overrides[sid_id] = desired
        manual_override_timestamps[sid_id] = time.time()
        print(f"[QUEUE] Signal override stored: {sid_id} -> {desired}.")


@sio.event
async def controller_toggle_ai_control(sid, data):
    global ai_control_enabled
    enable = data.get('enabled') if isinstance(data, dict) else None
    if isinstance(enable, bool):
        ai_control_enabled = enable
    else:
        ai_control_enabled = not ai_control_enabled

    print(f"[AI] Autonomous signal control set to: {ai_control_enabled}")
    await sio.emit('ai:control_state_changed', {'enabled': ai_control_enabled})


async def _toggle_pause_handler(sid, data):
    is_playing = data.get('isPlaying', False) if isinstance(data, dict) else False
    if is_playing:
        pause_event.set()
        print("[CONTROL] Simulation resumed.")
    else:
        pause_event.clear()
        print("[CONTROL] Simulation paused.")
    await sio.emit('simulation:state_changed', {'isPlaying': is_playing})


@sio.event
async def controller_toggle_pause_simulation(sid, data):
    await _toggle_pause_handler(sid, data)


@sio.event
async def pause_simulation(sid, data):
    await _toggle_pause_handler(sid, data)


async def _stop_sim_handler(sid, data):
    global simulation_task, current_simulation
    if simulation_task:
        simulation_task.cancel()
        simulation_task = None
    current_simulation = None
    print("[CONTROL] Simulation stopped and reset.")
    await sio.emit('simulation:stopped')


@sio.event
async def controller_stop_simulation(sid, data):
    await _stop_sim_handler(sid, data)


@sio.event
async def stop_simulation(sid, data):
    await _stop_sim_handler(sid, data)


async def _set_speed_handler(sid, data):
    if current_simulation and isinstance(data, dict):
        speed = data.get('speed', 1)
        current_simulation.sim_speed = max(1, speed)
        print(f"[CONTROL] Speed set to {current_simulation.sim_speed}X.")


@sio.event
async def controller_set_sim_speed(sid, data):
    await _set_speed_handler(sid, data)


@sio.event
async def set_sim_speed(sid, data):
    await _set_speed_handler(sid, data)


@sio.event
async def controller_set_priorities(sid, data):
    global current_ai_priorities, current_simulation
    if not isinstance(data, dict):
        return

    user_priorities = dict(data)
    user_priorities['congestion'] = True
    user_priorities['trackCondition'] = True
    current_ai_priorities = user_priorities

    print(f"[AI] Weights updated: {current_ai_priorities}")

    if current_simulation:
        current_simulation.set_ai_priorities(current_ai_priorities)
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
        return

    track_id = track_id.strip().upper()

    if current_simulation:
        apply_track_status_to_sim(current_simulation, track_id, status)
        await sio.emit('network-update', current_simulation.get_state())
    else:
        if status == 'FAULTY':
            pending_faulty_tracks.add(track_id)
            print(f"[QUEUE] Track block stored: {track_id}.")
        else:
            pending_faulty_tracks.discard(track_id)


@sio.event
async def controller_get_plan(sid, data):
    if current_simulation:
        current_simulation.plan_needed = True


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
        print(f"[EMERGENCY] Section signal drop executed. {count} signals set to RED.")
    else:
        pending_signal_overrides['_ALL_SIGNALS_RED_'] = True


@sio.on('chatbot:query')
async def handle_chatbot_query(sid, data):
    question = data.get('question', '') if isinstance(data, dict) else ''
    network_state = data.get('networkState', {}) if isinstance(data, dict) else {}
    print(f"[CHAT] Query from {sid}: {question}")
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
            err_str = str(err)
            quota_note = " (Quota limit reached)" if "429" in err_str or "Quota" in err_str else ""
            trains = network_state.get('trains', [])
            running = [t for t in trains if t.get('state') == 'RUNNING']
            waiting = [t for t in trains if t.get('state') in ('WAITING_PLAN', 'READY_TO_PROCEED')]
            faulty = [s for s in network_state.get('network', {}).get('trackSegments', []) if s.get('status') == 'FAULTY']
            reply_text = f"Section Status: {len(running)} train(s) running, {len(waiting)} waiting dispatch, {len(faulty)} track segment(s) blocked.{quota_note}"
    else:
        trains = network_state.get('trains', [])
        running = [t for t in trains if t.get('state') == 'RUNNING']
        waiting = [t for t in trains if t.get('state') in ('WAITING_PLAN', 'READY_TO_PROCEED')]
        reply_text = f"Section Status: {len(running)} train(s) running, {len(waiting)} waiting dispatch. (Set GEMINI_API_KEY in .env for natural language explanation)."

    await sio.emit('chatbot:response', {'sender': 'ai', 'text': reply_text}, to=sid)


if __name__ == "__main__":
    import uvicorn
    import argparse
    parser = argparse.ArgumentParser(description="FlowState-Rail Dispatch Server")
    parser.add_argument("--port", type=int, default=int(os.getenv("PORT", 8002)), help="Port to listen on")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Host to bind to")
    args = parser.parse_args()
    print(f"[START] Starting server on {args.host}:{args.port}...")
    uvicorn.run("main:socket_app", host=args.host, port=args.port, reload=False)