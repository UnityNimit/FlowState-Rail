import React, { useState, useEffect } from 'react';
import './DashboardPage.css';
import TrackDiagram from '../components/TrackDiagram';
import Chatbot from '../components/Chatbot';// Import the new Chatbot component
import socketService from '../services/socketService';

const MainContent = () => {
    const [networkState, setNetworkState] = useState(null);
    const [simSpeed, setSimSpeed] = useState(1);

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
    
    useEffect(() => {
        socketService.emit('controller:set-sim-speed', { speed: simSpeed });
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

            {/* --- MERGED PANEL with Chatbot --- */}
            <div className="panel" id="panel-chat">
                <Chatbot networkState={networkState} />
            </div>
        </main>
    );
};

export default MainContent;