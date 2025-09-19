import React, { useState, useEffect } from 'react';
import './MainContent.css';
import TrackDiagram from './TrackDiagram';
import socketService from '../services/socketService'; // Import our new service

const MainContent = () => {
    // This state will now hold the REAL-TIME data from the backend
    const [networkState, setNetworkState] = useState(null);

    useEffect(() => {
        // --- Setup Connection and Listeners ---
        socketService.connect();

        // Listen for the very first state payload from the server
        socketService.on('initial-state', (data) => {
            console.log("Received initial state");
            setNetworkState(data);
        });

        // Listen for ongoing real-time updates
        socketService.on('network-update', (data) => {
            // No console log here to avoid flooding the console
            setNetworkState(data);
        });

        // --- Cleanup on component unmount ---
        return () => {
            console.log("Disconnecting socket...");
            // Stop listening to events to prevent memory leaks
            socketService.off('initial-state');
            socketService.off('network-update');
            socketService.disconnect();
        };
    }, []); // The empty dependency array [] means this effect runs only once on mount

    // While waiting for the initial state, show a loading message
    if (!networkState) {
        return <div className="loading-message">Connecting to simulation server...</div>;
    }

    return (
        <main className="main-content">
            <div className="panel track-panel" id="panel-1">
                 <TrackDiagram 
                    network={networkState.network} 
                    trains={networkState.trains} 
                 />
            </div>
            <div className="panel track-panel" id="panel-2">
                {/* Placeholder for future content */}
            </div>
            <div className="panel track-panel" id="panel-3">
                 {/* Placeholder for future content */}
            </div>
        </main>
    );
};

export default MainContent;