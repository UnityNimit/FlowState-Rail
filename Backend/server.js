const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const SimulationEngine = require('./simulationEngine');

// --- Server Setup ---
// Initialize express app and create an HTTP server
const app = express();
const server = http.createServer(app);
const PORT = 5001; // Use a different port than the frontend (React's default is 3000)

// --- CORS Configuration ---
// Enable Cross-Origin Resource Sharing to allow our React frontend
// (running on localhost:3000) to connect to this backend.
app.use(cors({ origin: "http://localhost:3000" }));

// --- WebSocket (Socket.io) Server Setup ---
// Initialize a new Socket.io server and attach it to the HTTP server.
// Configure CORS for the WebSocket connection as well.
const io = new Server(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"]
    }
});

// --- Simulation Engine Initialization ---
// Create a new instance of our simulation logic.
const engine = new SimulationEngine();
// Define the update frequency. The simulation will update every 1 second (1000ms).
const TICK_RATE = 1000;

// =============================================================================
// --- Real-time Logic ---
// =============================================================================

/**
 * The "Game Loop": This interval is the heartbeat of the simulation.
 * At every tick, it updates the simulation state and broadcasts it.
 */
setInterval(() => {
    // 1. Tell the engine to perform one step of the simulation
    //    (e.g., move trains, check for events).
    engine.update();
    
    // 2. Get the complete, latest state of the network from the engine.
    const currentState = engine.getState();
    
    // 3. Broadcast this new state to ALL connected clients using the 'network-update' event.
    //    The frontend will listen for this event to re-render the map.
    io.emit('network-update', currentState);

}, TICK_RATE);


/**
 * Connection Handler: This block runs whenever a new client (a web browser)
 * opens a WebSocket connection to this server.
 */
io.on('connection', (socket) => {
    console.log(`A user connected: ${socket.id}`);

    // When a new client connects, we immediately send them the current state.
    // This ensures their screen isn't blank until the next global update tick.
    // We use a different event name, 'initial-state', for this first payload.
    socket.emit('initial-state', engine.getState());

    // Set up a listener for when this specific client disconnects.
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
    });
});


// --- Start the HTTP Server ---
// Make the server listen for incoming connections on the specified port.
server.listen(PORT, () => {
    console.log(`Backend simulation server is running on http://localhost:${PORT}`);
});