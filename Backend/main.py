import asyncio
import socketio
from fastapi import FastAPI
from simulation import Simulation
from optimizer import Optimizer

# --- SETUP ---
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins="*")
app = FastAPI()
socket_app = socketio.ASGIApp(sio, app)

simulation = Simulation(section_code='DLI')
optimizer = Optimizer(simulation_instance=simulation)
is_optimizing = False

# NEW: Store the AI priority settings from the frontend
current_ai_priorities = {
    'congestion': True,
    'trainType': True,
    'punctuality': True,
    'trackCondition': False,
    'weather': True,
}

# --- SOCKET.IO EVENTS ---
@sio.event
async def connect(sid, environ):
    print(f"✅ Client connected: {sid}")
    await sio.emit('initial-state', simulation.get_state(), to=sid)

@sio.event
async def disconnect(sid):
    print(f"🔌 Client disconnected: {sid}")

@sio.event
async def controller_set_sim_speed(sid, data):
    speed = data.get('speed', 1)
    simulation.sim_speed = speed
    print(f"Simulation speed set to: {speed}x")

# NEW: Event handler to receive priority updates from the frontend
@sio.event
async def controller_set_priorities(sid, data):
    global current_ai_priorities
    print(f"✅ Received new AI priorities: {data}")
    current_ai_priorities = data

# --- THE DEFINITIVE CONTROL LOOP ---
async def simulation_loop():
    global is_optimizing
    while True:
        simulation.tick()
        
        current_state = simulation.get_state()
        trains_needing_plan = [t for t in current_state['trains'] if t['state'] == 'WAITING_PLAN']
        
        if trains_needing_plan and not is_optimizing and simulation.plan_needed:
            is_optimizing = True
            simulation.plan_needed = False
            
            await sio.emit('ai:plan-thinking')
            
            # MODIFIED: Pass the current priorities to the optimizer
            plan = optimizer.generate_plan(trains_needing_plan, current_state, current_ai_priorities)
            
            if plan:
                simulation.apply_plan(plan)
                await sio.emit('ai:plan-update', plan)
            else:
                print("⚠️ Optimizer returned no plan, trains will continue to wait.")

            is_optimizing = False

        await sio.emit('network-update', simulation.get_state())
        await asyncio.sleep(1 / simulation.sim_speed)

@app.on_event("startup")
async def startup_event():
    print("🚀 Server starting up...")
    asyncio.create_task(simulation_loop())