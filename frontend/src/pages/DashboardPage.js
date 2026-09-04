// DashboardPage.js
import React, { useState, useEffect, useCallback } from 'react';
import './DashboardPage.css';
import TrackDiagram from '../components/TrackDiagram';
import Chatbot from '../components/Chatbot';
import socketService from '../services/socketService';
import { FiSettings } from 'react-icons/fi';

const DashboardPage = ({ selectedStation, simulationStatus, liveData, onStationChange, blockedTracks = [] }) => {
    const [previewData, setPreviewData] = useState(null);
    const [errorMessage, setErrorMessage] = useState('');
    const [showNames, setShowNames] = useState(false);
    const [showSpeeds, setShowSpeeds] = useState(false);
    const [selectedTrack, setSelectedTrack] = useState(null);
    const [signalClickBlocked, setSignalClickBlocked] = useState(false);
    const [aiControlEnabled, setAiControlEnabled] = useState(true);
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
    const markTrackMaintenance = (trackId) => {
        socketService.emit('controller_set_track_status', { trackId, status: 'MAINTENANCE' });
        setSelectedTrack(null);
    };
    const markTrackOperational = (trackId) => {
        socketService.emit('controller_set_track_status', { trackId, status: 'OPERATIONAL' });
        setSelectedTrack(null);
    };
    const setMaintenanceZone = (zoneId, active) => {
        socketService.emit('controller_set_maintenance_zone', { zoneId, active });
    };

    const displayData = simulationStatus !== 'stopped' ? liveData : previewData;
    const selectedSegment = displayData?.network?.trackSegments?.find(segment => segment.id === selectedTrack);
    const affectingZones = displayData?.network?.maintenanceZones?.filter(zone => zone.affectedSegments?.includes(selectedTrack)) || [];
    const scheduledTrains = displayData?.trains?.filter(train => train.route?.includes(selectedTrack)) || [];
    const opState = displayData?.network?.operationalState || {};
    const activeConflicts = opState.activeConflicts || displayData?.activeConflicts || [];
    const activeCrossovers = opState.activeCrossovers || displayData?.activeCrossovers || [];

    const renderSettingsPanel = () => {
        const SettingsToggle = ({ label, isChecked, onToggle }) => (
            <div className="settings-toggle-item">
                <span>{label}</span>
                <label className="switch">
                    <input type="checkbox" checked={isChecked} onChange={onToggle} />
                    <span className="slider round"></span>
                </label>
            </div>
        );
        
        const LegendItem = ({ styleClass, label }) => (
            <div className="legend-item">
                <svg width="40" height="10" viewBox="0 0 40 10">
                    <line x1="0" y1="5" x2="40" y2="5" className={styleClass} />
                </svg>
                <span>{label}</span>
            </div>
        );
        
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
                            <LegendItem styleClass="track track-crossover-locked" label="Crossover Diverge (REV)" />
                            <LegendItem styleClass="track track-occupied" label="Occupied by a Train" />
                            <LegendItem styleClass="track track-faulty" label="Manually Blocked (Faulty)" />
                            <LegendItem styleClass="track track-weather-bad" label="Affected by Bad Weather" />
                            
                            <h4>Train Legend (by Priority)</h4>
                            <ColorSwatchLegend color="#00f0ff" label="Vande Bharat (P11)" />
                            <ColorSwatchLegend color="#38bdf8" label="Shatabdi (P10)" />
                            <ColorSwatchLegend color="#c084fc" label="Rajdhani (P9)" />
                            <ColorSwatchLegend color="#34d399" label="Passenger (P8)" />
                            <ColorSwatchLegend color="#fb923c" label="MEMU (P6)" />
                            <ColorSwatchLegend color="#94a3b8" label="Freight (P1)" />
                            <div className="legend-item">
                                <div className="legend-swatch" style={{ backgroundColor: '#ef4444', border: '1px dashed #f59e0b' }}></div>
                                <span>Held Train (Contention Queue)</span>
                            </div>
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
                    {selectedStation !== 'CORRIDOR' && (
                        <button
                            type="button"
                            className="corridor-breadcrumb"
                            disabled={simulationStatus !== 'stopped'}
                            onClick={() => onStationChange && onStationChange('CORRIDOR')}
                        >
                            Delhi–Ghaziabad Corridor / {selectedStation}
                        </button>
                    )}
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

                    {/* Dynamic CP-SAT Contention & Interlocking Resolution HUD */}
                    <div className={`vdu-contention-hud ${activeConflicts.length > 0 ? 'contention-alert' : activeCrossovers.length > 0 ? 'crossover-active' : 'all-clear'}`}>
                        <div className="hud-indicator">
                            <span className="hud-pulse" />
                            <span className="hud-badge">
                                {activeConflicts.length > 0 ? '⚡ CONTENTION RESOLUTION' : activeCrossovers.length > 0 ? '🔀 CROSSOVER ROUTE' : '🛡️ INTERLOCKING SUPERVISORY'}
                            </span>
                        </div>
                        <div className="hud-ticker">
                            {activeConflicts.length > 0 ? (
                                <span>
                                    <strong>Junction Contention Resolved:</strong> Train {activeConflicts[0].trainId} (P{activeConflicts[0].priority}) held on {activeConflicts[0].contendedResource || 'switch throat'} ➔ Train {activeConflicts[0].conflictingTrainId || 'preceding'} granted clearance ({activeConflicts[0].secondsRemaining != null ? activeConflicts[0].secondsRemaining : activeConflicts[0].holdDurationSeconds}s wait) · <strong>0 UNSAFE CONFLICTS</strong>
                                </span>
                            ) : activeCrossovers.length > 0 ? (
                                <span>
                                    <strong>Active Crossover Diverge:</strong> Train {activeCrossovers[0].trainId} ({activeCrossovers[0].trainType}) crossing tracks via {activeCrossovers[0].crossoverSegments?.join(', ')} · Switch: REVERSE
                                </span>
                            ) : (
                                <span>
                                    4-Line Automatic Block Interlocking Active · Dynamic Headway & Route Conflict Prevention · <strong>0 UNSAFE CONFLICTS</strong>
                                </span>
                            )}
                        </div>
                        <div className="hud-metrics">
                            <span>QUEUED: <strong>{activeConflicts.length}</strong></span>
                            <span>CROSSOVER: <strong>{activeCrossovers.length}</strong></span>
                            <span className="hud-safety">INTERLOCKING: <strong>SECURED</strong></span>
                        </div>
                    </div>

                    <TrackDiagram 
                        network={displayData.network} 
                        trains={displayData.trains}
                        onSignalClick={handleSignalClick}
                        onTrackClick={handleTrackClick}
                        showNames={showNames}
                        showSpeeds={showSpeeds}
                        activeMaintenanceBlocks={blockedTracks}
                        onStationSelect={(code) => simulationStatus === 'stopped' && onStationChange && onStationChange(code)}
                    />
                </div>
                <div className="panel" id="panel-chat">
                    <Chatbot networkState={simulationStatus !== 'stopped' ? displayData : null} />
                </div>

                {selectedSegment && (
                    <aside className="asset-drawer" aria-label="Selected railway asset details">
                        <div className="asset-drawer-header">
                            <div><span className="asset-kicker">TRACK ASSET</span><strong>{selectedSegment.id}</strong></div>
                            <button onClick={() => setSelectedTrack(null)} aria-label="Close asset panel">&times;</button>
                        </div>
                        <dl className="asset-grid">
                            <div><dt>Line</dt><dd>{selectedSegment.lineId}</dd></div>
                            <div><dt>Track circuit</dt><dd>{selectedSegment.trackCircuit}</dd></div>
                            <div><dt>Length</dt><dd>{selectedSegment.lengthMeters?.toLocaleString()} m</dd></div>
                            <div><dt>Permissible speed</dt><dd>{selectedSegment.permissibleSpeedKph} km/h</dd></div>
                            <div><dt>Direction</dt><dd>{selectedSegment.direction}</dd></div>
                            <div><dt>Block section</dt><dd>{selectedSegment.blockSection}</dd></div>
                            <div><dt>Platform</dt><dd>{selectedSegment.platform || '—'}</dd></div>
                            <div><dt>OHE group</dt><dd>{selectedSegment.oheIsolationGroup}</dd></div>
                            <div><dt>Occupancy</dt><dd>{selectedSegment.isOccupied ? 'OCCUPIED' : 'CLEAR'}</dd></div>
                            <div><dt>Condition</dt><dd>{selectedSegment.condition} · {selectedSegment.status}</dd></div>
                            <div><dt>Defects</dt><dd>{selectedSegment.defects?.length ? selectedSegment.defects.join(', ') : 'None recorded'}</dd></div>
                        </dl>
                        <section className="asset-list">
                            <h4>Scheduled / active trains</h4>
                            <p>{selectedSegment.scheduledTrainCount || 0} timetable services · {selectedSegment.scheduledTrainIds?.join(', ') || 'none'}</p>
                            <p>{scheduledTrains.length ? `Active: ${scheduledTrains.map(t => `${t.id} (${t.type})`).join(', ')}` : 'No active train is currently routed over this circuit.'}</p>
                        </section>
                        <section className="asset-list">
                            <h4>Compatible maintenance zones</h4>
                            {affectingZones.length ? affectingZones.map(zone => (
                                <button key={zone.id} className={`zone-action ${zone.active ? 'active' : ''}`} onClick={() => setMaintenanceZone(zone.id, !zone.active)}>
                                    {zone.active ? 'Release' : 'Apply'} · {zone.name} · {zone.compatibleDepartments?.join(' + ')}
                                </button>
                            )) : <p>No predefined integrated zone.</p>}
                        </section>
                        <div className="asset-provenance">Geometry: {selectedSegment.provenance?.geometry} · Operations: representative</div>
                        <div className="asset-actions">
                            <button onClick={() => markTrackMaintenance(selectedTrack)} className="popup-btn maintenance">Apply maintenance</button>
                            <button onClick={() => markTrackFaulty(selectedTrack)} className="popup-btn danger">Report failure</button>
                            <button onClick={() => markTrackOperational(selectedTrack)} className="popup-btn">Return to service</button>
                        </div>
                    </aside>
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
