import React, { useState, useEffect } from 'react';
import './MainContent.css';
import TrackDiagram from './TrackDiagram';
import socketService from '../services/socketService';

const MainContent = () => {
    const [networkState, setNetworkState] = useState(null);
    const [simSpeed, setSimSpeed] = useState(1); // Default speed is 1x

    useEffect(() => {
        socketService.connect();
        socketService.on('initial-state', (data) => setNetworkState(data));
        socketService.on('network-update', (data) => setNetworkState(data));

        return () => {
            socketService.off('initial-state');
            socketService.off('network-update');
            socketService.disconnect();
        };
    }, []);
    
    // Send speed update to backend whenever it changes
    useEffect(() => {
        socketService.emit('controller:set-sim-speed', { speed: simSpeed });
        console.log(`UI: Set simulation speed to ${simSpeed}x`);
    }, [simSpeed]);

    const handleSignalClick = (signalId) => {
        socketService.emit('controller:set-signal', { signalId });
    };

    if (!networkState) {
        return <div className="loading-message">Connecting to simulation server...</div>;
    }

    return (
        <main className="main-content">
            <div className="panel track-panel" id="panel-1">
                 {/* --- NEW: SIMULATION SPEED CONTROLS --- */}
                 <div className="sim-controls">
                    <span className="sim-label">Sim Speed:</span>
                    {[1, 2, 4, 8].map(speed => (
                        <button 
                            key={speed}
                            className={`sim-speed-btn ${simSpeed === speed ? 'active' : ''}`}
                            onClick={() => setSimSpeed(speed)}
                        >
                            {speed}x
                        </button>
                    ))}
                 </div>
                 <TrackDiagram 
                    network={networkState.network} 
                    trains={networkState.trains}
                    onSignalClick={handleSignalClick}
                 />
            </div>
            <div className="panel track-panel" id="panel-2"></div>
            <div className="panel track-panel" id="panel-3"></div>
        </main>
    );
};

export default MainContent;