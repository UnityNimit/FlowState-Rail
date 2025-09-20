import { io } from 'socket.io-client';

// The URL of our backend server
const SERVER_URL = "http://localhost:5001";

class SocketService {
    socket;

    // Establishes the connection
    connect() {
        console.log("Connecting to WebSocket server...");
        this.socket = io(SERVER_URL);

        this.socket.on('connect', () => {
            console.log(`Connected with socket ID: ${this.socket.id}`);
        });

        this.socket.on('disconnect', () => {
            console.log("Disconnected from WebSocket server.");
        });
    }

    // Disconnects from the server
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
        }
    }

    // A generic listener function. Components can use this to subscribe to events.
    // callback is the function to execute when the event is received.
    on(eventName, callback) {
        if (this.socket) {
            this.socket.on(eventName, callback);
        }
    }

    // A function to remove a listener, important for cleanup
    off(eventName) {
        if (this.socket) {
            this.socket.off(eventName);
        }
    }

    emit(eventName, data) {
        if (this.socket) {
            this.socket.emit(eventName, data);
        }
    }
    
}

// Export a single instance of the service
const socketService = new SocketService();
export default socketService;