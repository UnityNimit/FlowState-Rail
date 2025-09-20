const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const SimulationEngine = require('./simulationEngine');
const { getOptimalRoutingPlan } = require('./geminiDispatcher');

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

setInterval(() => {
    engine.update();
    io.emit('network-update', engine.getState());
}, TICK_RATE);

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

    socket.on('ai:get-plan', async () => {
        console.log("Controller requested a new AI plan.");
        io.emit('ai:plan-thinking');

        const currentState = engine.getState();
        const plan = await getOptimalRoutingPlan(currentState, currentAiPriorities);
        
        if (plan && !plan.error) {
            // The engine now handles all the complex application logic
            engine.applyAiPlan(plan);
        }

        io.emit('ai:plan-update', plan);
        io.emit('network-update', engine.getState());
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
    });
});

server.listen(PORT, () => {
    console.log(`Backend simulation server is running on http://localhost:${PORT}`);
});