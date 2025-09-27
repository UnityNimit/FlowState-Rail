// socketService.js
import { io } from 'socket.io-client';

// Backend URL — change if your backend is on a different host or port.
const SOCKET_URL = 'http://localhost:8000';

class SocketService {
    constructor() {
        this.socket = null;
        this._connected = false;
        this._emitQueue = [];   // queue of {event, data}
        this._listenerQueue = []; // queue of {event, func, once}
        this._connectPromise = null;
        this._reconnectionAttempts = 5;
        this._reconnectionDelay = 1000;
    }

    connect() {
        // idempotent
        if (this.socket) {
            console.log('SocketService: socket already created. connected=', this.isConnected());
            return this._connectPromise || Promise.resolve();
        }

        console.log(`SocketService: Attempting to connect to socket server at ${SOCKET_URL}...`);
        this.socket = io(SOCKET_URL, {
            reconnection: true,
            reconnectionAttempts: this._reconnectionAttempts,
            reconnectionDelay: this._reconnectionDelay,
            transports: ['websocket', 'polling'],
        });

        this._connectPromise = new Promise((resolve, reject) => {
            // on connect
            this.socket.on('connect', () => {
                this._connected = true;
                console.log(`SocketService: connected (id=${this.socket.id})`);
                // attach any queued listeners
                this._listenerQueue.forEach(l => {
                    if (l.once) this.socket.once(l.event, l.func);
                    else this.socket.on(l.event, l.func);
                });
                // flush emit queue
                this._flushEmitQueue();
                resolve();
            });

            this.socket.on('disconnect', (reason) => {
                this._connected = false;
                console.warn('SocketService: disconnected. reason=', reason);
            });

            this.socket.on('connect_error', (err) => {
                this._connected = false;
                console.error('SocketService: connect_error', err);
                // Let retry logic of socket.io handle reconnection attempts.
            });

            this.socket.on('error', (err) => {
                console.error('SocketService: socket error', err);
            });
        });

        return this._connectPromise;
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this._connected = false;
            this._connectPromise = null;
            console.log('SocketService: disconnected (manual).');
        }
    }

    isConnected() {
        return !!(this.socket && this.socket.connected);
    }

    // Emit safely: flush immediately if connected, otherwise queue and attempt connect.
    emit(event, data) {
        if (this.isConnected()) {
            try {
                this.socket.emit(event, data);
                return true;
            } catch (e) {
                console.error(`SocketService: emit failed for '${event}'`, e);
            }
        }

        // Not connected: queue the emit for when connect occurs
        console.warn(`SocketService: socket not connected — queuing emit '${event}'`);
        this._emitQueue.push({ event, data });

        // proactively try to connect if not already connecting
        try {
            this.connect().catch(() => {/* ignore */});
        } catch (e) {
            // connect may throw in some environments — ignore here
        }
        return false;
    }

    // Register listener; if socket not created yet, queue it to register on connect.
    on(event, func) {
        if (!event || typeof func !== 'function') return;
        // if socket already connected, attach immediately
        if (this.socket && this.socket.connected) {
            this.socket.on(event, func);
        } else {
            // queue for later attachment
            this._listenerQueue.push({ event, func, once: false });
            // also ensure socket creation
            this.connect().catch(() => {/* ignore */});
        }
    }

    once(event, func) {
        if (!event || typeof func !== 'function') return;
        if (this.socket && this.socket.connected) {
            this.socket.once(event, func);
        } else {
            this._listenerQueue.push({ event, func, once: true });
            this.connect().catch(() => {/* ignore */});
        }
    }

    // Remove a listener both from the live socket and from the queued listeners.
    off(event, func) {
        if (!event) return;
        if (this.socket) {
            if (typeof func === 'function') {
                this.socket.off(event, func);
            } else {
                // remove all listeners for this event if func not provided
                this.socket.removeAllListeners(event);
            }
        }
        // remove from queued listeners
        this._listenerQueue = this._listenerQueue.filter(l => !(l.event === event && (typeof func !== 'function' || l.func === func)));
    }

    // Internal: flush queued emits
    _flushEmitQueue() {
        if (!this.isConnected()) return;
        while (this._emitQueue.length > 0) {
            const { event, data } = this._emitQueue.shift();
            try {
                this.socket.emit(event, data);
            } catch (e) {
                console.error('SocketService: failed flushing queued emit', event, e);
            }
        }
    }

    // --- Methods for Simulation Control (compatible with your existing API) ---
    startSimulation(stationCode) {
        this.emit('controller_start_simulation', { station_code: stationCode });
    }

    togglePauseSimulation(isPlaying) {
        this.emit('controller_toggle_pause_simulation', { isPlaying });
    }

    stopSimulation() {
        this.emit('controller_stop_simulation', {});
    }

    changeSimSpeed(speed) {
        this.emit('controller_set_sim_speed', { speed });
    }

    // NEW: toggle AI control (frontend -> backend)
    toggleAiControl(enabled) {
        // accept boolean or undefined (server will toggle if undefined)
        this.emit('controller_toggle_ai_control', { enabled });
    }
}

const socketService = new SocketService();
export default socketService;
