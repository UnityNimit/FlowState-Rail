const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
require('dotenv').config();

const decisionRoutes = require('./routes/decisionRoutes');

const app = express();
const server = http.createServer(app);

// Use CORS to allow your frontend to connect
app.use(cors({
    origin: "http://localhost:3000" // The default for Create React App
}));

app.use(express.json());

// API Routes
app.use('/api/decisions', decisionRoutes);

// WebSocket Server
const io = new Server(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"]
    }
});

// This is a mock simulation of real-time train data.
// In a real system, this would come from actual railway sensors.
let trainData = [
    { id: '12345 Exp', position: 10, speed: 80, status: 'On Time' },
    { id: '67890 Fght', position: 5, speed: 50, status: 'On Time' },
    { id: '54321 Lcl', position: 8, speed: 60, status: 'Delayed' },
];

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    // Send the initial data immediately on connection
    socket.emit('initialData', { trains: trainData });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

// Simulate train movement every 3 seconds
setInterval(() => {
    trainData = trainData.map(train => {
        // Simple linear movement for simulation
        let newPosition = train.position + (train.speed / 100);
        if (newPosition > 100) newPosition = 0; // Loop back
        return { ...train, position: newPosition };
    });

    // Broadcast the updated data to all connected clients
    io.emit('updateData', { trains: trainData });
    
    // Check for a simulated conflict
    if (trainData[0].position > 48 && trainData[0].position < 52 && trainData[1].position > 45 && trainData[1].position < 49) {
        io.emit('conflictDetected', {
            conflictId: `C${Date.now()}`,
            description: `Precedence conflict at Ghaziabad Junction. Train ${trainData[0].id} and ${trainData[1].id} are approaching the same junction.`,
            involved: [trainData[0].id, trainData[1].id],
            location: 'Ghaziabad Junction'
        });
    }

}, 3000);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});