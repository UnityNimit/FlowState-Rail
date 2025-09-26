import React, { useState, useEffect } from 'react';
import './DashboardPage.css';
import TrackDiagram from '../components/TrackDiagram';
import Chatbot from '../components/Chatbot';
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

    // The simSpeed state and useEffect have been removed from this component.

    const handleSignalClick = (signalId) => {
        socketService.emit('controller:set-signal', { signalId });
    };

    if (!networkState) {
        return <div className="loading-message">Connecting to simulation server...</div>;
    }

    return (
        <main className="main-content">
            <div className="panel track-panel" id="panel-1">
                 {/* The sim-controls div has been removed from here. */}
                 <TrackDiagram 
                    network={networkState.network} 
                    trains={networkState.trains}
                    onSignalClick={handleSignalClick}
                 />
            </div>

            <div className="panel" id="panel-chat">
                <Chatbot networkState={networkState} />
            </div>
        </main>
    );
};

export default MainContent;