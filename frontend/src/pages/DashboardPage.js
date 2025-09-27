// DashboardPage.js (toolbar moved inside track-panel)
import React, { useState, useEffect, useCallback } from 'react';
import './DashboardPage.css';
import TrackDiagram from '../components/TrackDiagram';
import Chatbot from '../components/Chatbot';
import socketService from '../services/socketService';
// NEW: Importing an icon for the new settings button
import { FiSettings } from 'react-icons/fi';

const DashboardPage = ({ selectedStation, simulationStatus, liveData }) => {
    const [previewData, setPreviewData] = useState(null);
    const [errorMessage, setErrorMessage] = useState('');
    const [showNames, setShowNames] = useState(true);
    const [showSpeeds, setShowSpeeds] = useState(false);
    const [selectedTrack, setSelectedTrack] = useState(null);
    const [signalClickBlocked, setSignalClickBlocked] = useState(false);
    const [aiControlEnabled, setAiControlEnabled] = useState(true);

    // NEW: State to control the visibility of the new settings panel
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

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

    const handleAiControlBroadcast = useCallback((data) => {
        if (data && typeof data.enabled === 'boolean') {
            setAiControlEnabled(data.enabled);
        }
    }, []);

    useEffect(() => {
        socketService.on('ai:control_state_changed', handleAiControlBroadcast);
        socketService.connect().catch(() => {/* ignore */});
        return () => {
            socketService.off('ai:control_state_changed', handleAiControlBroadcast);
        };
    }, [handleAiControlBroadcast]);
    
    // All handler functions remain the same
    const handleSignalClick = (signalId) => { 
        if (signalClickBlocked) return;
        setSignalClickBlocked(true);
        setTimeout(() => setSignalClickBlocked(false), 300);
        socketService.emit('controller_set_signal', { signalId });
     };
    const handleAllRed = () => { socketService.emit('controller_set_all_signals_red', {}); };
    const handleToggleAiControl = () => { 
        const next = !aiControlEnabled;
        socketService.toggleAiControl(next);
        setAiControlEnabled(next);
     };
    const handleTrackClick = (trackId) => { setSelectedTrack(trackId); };
    const markTrackFaulty = (trackId) => {
        socketService.emit('controller_set_track_status', { trackId, status: 'FAULTY' });
        setSelectedTrack(null);
    };
    const markTrackOperational = (trackId) => {
        socketService.emit('controller_set_track_status', { trackId, status: 'OPERATIONAL' });
        setSelectedTrack(null);
    };

    const displayData = simulationStatus !== 'stopped' ? liveData : previewData;

    // A dedicated render function for the beautiful new settings panel and legend
    const renderSettingsPanel = () => {
        // A small helper component for the toggles inside the panel
        const SettingsToggle = ({ label, isChecked, onToggle }) => (
            <div className="settings-toggle-item">
                <span>{label}</span>
                <label className="switch">
                    <input type="checkbox" checked={isChecked} onChange={onToggle} />
                    <span className="slider round"></span>
                </label>
            </div>
        );
        
        // A helper for track legend items
        const LegendItem = ({ styleClass, label }) => (
            <div className="legend-item">
                <svg width="40" height="10" viewBox="0 0 40 10">
                    <line x1="0" y1="5" x2="40" y2="5" className={styleClass} />
                </svg>
                <span>{label}</span>
            </div>
        );
        
        // A helper for color swatch items
        const ColorSwatchLegend = ({ color, label }) => (
            <div className="legend-item">
                <div className="legend-swatch" style={{ backgroundColor: color }}></div>
                <span>{label}</span>
            </div>
        );


        return (
            <div className="settings-panel-overlay" onClick={() => setIsSettingsOpen(false)}>
                <div className="settings-panel" onClick={e => e.stopPropagation()}>
                    <div className="settings-header">
                        <h3>Diagram Settings & Legend</h3>
                        <button className="close-btn" onClick={() => setIsSettingsOpen(false)} title="Close">&times;</button>
                    </div>
                    <div className="settings-content">
                        <div className="settings-column">
                            <h4>Display Options</h4>
                            <SettingsToggle label="Show Node/Signal Names" isChecked={showNames} onToggle={() => setShowNames(s => !s)} />
                            <SettingsToggle label="Show Max Speed on Tracks" isChecked={showSpeeds} onToggle={() => setShowSpeeds(s => !s)} />

                            <h4>Signal & Node Legend</h4>
                            <div className="legend-item"><div className="legend-swatch signal-green"></div><span>Signal: Proceed (Green)</span></div>
                            <div className="legend-item"><div className="legend-swatch signal-red"></div><span>Signal: Stop (Red)</span></div>
                            <div className="legend-item"><div className="legend-swatch point"></div><span>Switch / Point</span></div>
                        </div>
                        <div className="settings-column">
                            <h4>Track Legend</h4>
                            <LegendItem styleClass="track" label="Operational" />
                            <LegendItem styleClass="track track-route-locked" label="Route Locked by AI" />
                            <LegendItem styleClass="track track-occupied" label="Occupied by a Train" />
                            <LegendItem styleClass="track track-faulty" label="Manually Blocked (Faulty)" />
                            <LegendItem styleClass="track track-weather-bad" label="Affected by Bad Weather" />
                            
                            {/* --- FIX: Train Legend is now accurate --- */}
                            <h4>Train Legend (by Priority)</h4>
                            <ColorSwatchLegend color="#FF0000" label="Shatabdi" />
                            <ColorSwatchLegend color="#0000FF" label="Rajdhani" />
                            <ColorSwatchLegend color="#228B22" label="Passenger" />
                            <ColorSwatchLegend color="#FFD700" label="DMU" />
                            <ColorSwatchLegend color="#FF8C00" label="MEMU" />
                            <ColorSwatchLegend color="#800080" label="SF Express" />
                            <ColorSwatchLegend color="#A52A2A" label="Mail" />
                            <ColorSwatchLegend color="#808080" label="Express" />
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderContent = () => {
        if (errorMessage) {
            return <div className="loading-message error-message">Error: {errorMessage}</div>;
        }
        if (!displayData) {
            return <div className="loading-message">Select a station and press 'Start' to begin.</div>;
        }
        return (
            <>
                {isSettingsOpen && renderSettingsPanel()}

                <div className="panel track-panel" id="panel-1">
                    <div className="toolbar-floating">
                        <button title="Settings & Legend" onClick={() => setIsSettingsOpen(true)} className="toolbar-btn icon-btn">
                            <FiSettings />
                        </button>
                        
                        <button title="All lights red (manual override)" onClick={handleAllRed} className="toolbar-btn danger">All Red</button>
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