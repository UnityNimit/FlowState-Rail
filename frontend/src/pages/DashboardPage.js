// DashboardPage.js (toolbar moved inside track-panel)
import React, { useState, useEffect, useCallback } from 'react';
import './DashboardPage.css';
import TrackDiagram from '../components/TrackDiagram';
import Chatbot from '../components/Chatbot';
import socketService from '../services/socketService';

const DashboardPage = ({ selectedStation, simulationStatus, liveData }) => {
    const [previewData, setPreviewData] = useState(null);
    const [errorMessage, setErrorMessage] = useState('');
    const [showNames, setShowNames] = useState(true);
    const [showSpeeds, setShowSpeeds] = useState(false);

    // track selection popup
    const [selectedTrack, setSelectedTrack] = useState(null);
    const [signalClickBlocked, setSignalClickBlocked] = useState(false);

    // NEW: AI control state (assume true by default to match server)
    const [aiControlEnabled, setAiControlEnabled] = useState(true);

    useEffect(() => {
        if (simulationStatus === 'stopped') {
            const fetchPreviewLayout = async () => {
                try {
                    const response = await fetch(`/data/${selectedStation.toLowerCase()}_layout.json`);
                    if (!response.ok) throw new Error(`Layout for ${selectedStation} not found.`);
                    const data = await response.json();
                    setPreviewData({ network: data.network, trains: [] });
                    setErrorMessage('');
                } catch (error) {
                    setErrorMessage(error.message);
                    setPreviewData(null);
                }
            };
            fetchPreviewLayout();
        }
    }, [selectedStation, simulationStatus]);

    // Listen for server broadcast about AI control state
    const handleAiControlBroadcast = useCallback((data) => {
        if (data && typeof data.enabled === 'boolean') {
            setAiControlEnabled(data.enabled);
        }
    }, []);

    useEffect(() => {
        // register listener reliably and clean up with exact function reference
        socketService.on('ai:control_state_changed', handleAiControlBroadcast);
        // ensure socket connection is active (this will attach queued listeners if needed)
        socketService.connect().catch(() => {/* ignore */});

        return () => {
            socketService.off('ai:control_state_changed', handleAiControlBroadcast);
        };
    }, [handleAiControlBroadcast]);

    const handleSignalClick = (signalId) => {
        if (signalClickBlocked) return;
        setSignalClickBlocked(true);
        setTimeout(() => setSignalClickBlocked(false), 300);
        // send a toggle to server; server will treat as manual and stamp override time
        socketService.emit('controller_set_signal', { signalId });
    };

    const handleAllRed = () => {
        socketService.emit('controller_set_all_signals_red', {});
    };

    // NEW: toggle AI control via socketService
    const handleToggleAiControl = () => {
        const next = !aiControlEnabled;
        socketService.toggleAiControl(next);
        // optimistically update UI; server will broadcast authoritative state back
        setAiControlEnabled(next);
    };

    const handleTrackClick = (trackId) => {
        setSelectedTrack(trackId);
    };

    const markTrackFaulty = (trackId) => {
        socketService.emit('controller_set_track_status', { trackId, status: 'FAULTY' });
        setSelectedTrack(null);
    };

    const markTrackOperational = (trackId) => {
        socketService.emit('controller_set_track_status', { trackId, status: 'OPERATIONAL' });
        setSelectedTrack(null);
    };

    const displayData = simulationStatus !== 'stopped' ? liveData : previewData;

    const renderContent = () => {
        if (errorMessage) {
            return <div className="loading-message error-message">Error: {errorMessage}</div>;
        }
        if (!displayData) {
            return <div className="loading-message">Select a station and press 'Start' to begin.</div>;
        }
        return (
            <>
                <div className="panel track-panel" id="panel-1">
                    {/* toolbar is intentionally inside the track-panel so its absolute position is relative to the panel */}
                    <div className="toolbar-floating">
                        <button title="Toggle speed legends" onClick={() => setShowSpeeds(s => !s)} className="toolbar-btn">Speed</button>
                        <button title="Toggle names" onClick={() => setShowNames(s => !s)} className="toolbar-btn">Names</button>
                        <button title="All lights red (manual override)" onClick={handleAllRed} className="toolbar-btn danger">All Red</button>

                        {/* NEW: AI control toggle */}
                        <button
                            title={aiControlEnabled ? "AI automatic control: ON" : "AI automatic control: OFF (manual mode)"}
                            onClick={handleToggleAiControl}
                            className={`toolbar-btn ${aiControlEnabled ? '' : 'danger'}`}>
                            {aiControlEnabled ? 'AI: ON' : 'AI: OFF'}
                        </button>
                    </div>

                    <TrackDiagram 
                        network={displayData.network} 
                        trains={displayData.trains}
                        onSignalClick={handleSignalClick}
                        onTrackClick={handleTrackClick}
                        showNames={showNames}
                        showSpeeds={showSpeeds}
                    />
                </div>
                <div className="panel" id="panel-chat">
                    <Chatbot networkState={simulationStatus !== 'stopped' ? displayData : null} />
                </div>

                {selectedTrack && (
                    <div className="track-popup">
                        <div><strong>{selectedTrack}</strong></div>
                        <div style={{marginTop:8}}>
                            <button onClick={() => markTrackFaulty(selectedTrack)} className="popup-btn danger">Mark Damaged</button>
                            <button onClick={() => markTrackOperational(selectedTrack)} className="popup-btn">Mark OK</button>
                            <button onClick={() => setSelectedTrack(null)} className="popup-btn">Close</button>
                        </div>
                    </div>
                )}
            </>
        );
    };

    return (
        <main className="main-content">
            {renderContent()}
        </main>
    );
};

export default DashboardPage;
