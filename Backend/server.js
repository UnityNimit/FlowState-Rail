const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const SimulationEngine = require('./simulationEngine');
const { getOptimalRoutingPlan } = require('./geminiDispatcher');
const { getChatbotResponse } = require('./geminiChat');

const app = express();
const server = http.createServer(app);
const PORT = 5001;
app.use(cors({ origin: "http://localhost:3000" }));
const io = new Server(server, {
    cors: { origin: "http://localhost:3000", methods: ["GET", "POST"] }
});

const engine = new SimulationEngine();
const TICK_RATE = 1000;
let currentAiPriorities = {};
let currentSimSpeed = 1;

// --- NEW: Global flag to prevent API spam ---
let isAiThinking = false;

let gameLoopInterval = setInterval(runGameTick, TICK_RATE);

function runGameTick() {
    engine.update();
    io.emit('network-update', engine.getState());
}

function setSimSpeed(speed) {
    if (speed !== currentSimSpeed) {
        console.log(`Controller set simulation speed to ${speed}x`);
        currentSimSpeed = speed;
        clearInterval(gameLoopInterval);
        if (speed > 0) {
            gameLoopInterval = setInterval(runGameTick, TICK_RATE / speed);
        }
    }
}

io.on('connection', (socket) => {
    console.log(`A user connected: ${socket.id}`);
    socket.emit('initial-state', engine.getState());

    socket.on('controller:set-signal', (data) => {
        engine.handleSignalClick(data.signalId);
        io.emit('network-update', engine.getState());
    });

    socket.on('ai:set-priorities', (priorities) => {
        currentAiPriorities = priorities;
    });

    // --- UPGRADED: This listener now has a lock to prevent multiple requests ---
    socket.on('ai:get-plan', async () => {
        // 1. Check if the AI is already working on a plan
        if (isAiThinking) {
            console.log("AI is already processing a plan. Ignoring new request.");
            return; // Exit early
        }

        // 2. Set the lock
        isAiThinking = true;
        console.log("Controller requested a new AI plan. Locking AI.");
        io.emit('ai:plan-thinking');

        const currentState = engine.getState();
        const plan = await getOptimalRoutingPlan(currentState, currentAiPriorities);
        
        if (plan && !plan.error) {
            engine.applyAiPlan(plan);
        }

        io.emit('ai:plan-update', plan);
        io.emit('network-update', engine.getState());
        
        // 3. Release the lock after the process is complete
        isAiThinking = false;
        console.log("AI plan processed. Unlocking AI.");
    });

    socket.on('controller:set-track-status', (data) => {
        engine.setTrackStatus(data.trackId, data.status);
        io.emit('network-update', engine.getState());
    });

    socket.on('controller:set-sim-speed', (data) => {
        setSimSpeed(data.speed);
    });

    socket.on('chatbot:query', async ({ question, networkState }) => {
        console.log(`Received chatbot query: "${question}"`);
        socket.emit('chatbot:thinking');
        const responseText = await getChatbotResponse(question, networkState);
        socket.emit('chatbot:response', { sender: 'ai', text: responseText });
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
    });
});

server.listen(PORT, () => {
    console.log(`Backend simulation server is running on http://localhost:${PORT}`);
});