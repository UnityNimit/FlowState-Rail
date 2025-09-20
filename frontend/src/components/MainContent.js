import React, { useState, useEffect } from 'react';
import './MainContent.css';
import TrackDiagram from './TrackDiagram';
import socketService from '../services/socketService';

const MainContent = () => {
    const [networkState, setNetworkState] = useState(null);

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

    // --- NEW: Handler for sending signal click commands ---
    const handleSignalClick = (signalId) => {
        console.log(`UI: Clicked signal ${signalId}. Sending command to backend.`);
        socketService.emit('controller:set-signal', { signalId });
    };

    if (!networkState) {
        return <div className="loading-message">Connecting to simulation server...</div>;
    }

    return (
        <main className="main-content">
            <div className="panel track-panel" id="panel-1">
                 <TrackDiagram 
                    network={networkState.network} 
                    trains={networkState.trains}
                    onSignalClick={handleSignalClick} // Pass handler down
                 />
            </div>
            <div className="panel track-panel" id="panel-2"></div>
            <div className="panel track-panel" id="panel-3"></div>
        </main>
    );
};

export default MainContent;