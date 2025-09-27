import React, { useState, useEffect } from 'react';
import './LeftSidebar.css';
import {
    FiChevronsUp, FiClock, FiCloudDrizzle, FiTool, FiTrendingDown, FiAlertCircle
} from 'react-icons/fi';
import socketService from '../services/socketService';

const ToggleSwitch = ({ label, icon, isChecked, onToggle, isDisabled = false }) => (
    <div className={`toggle-item ${isDisabled ? 'disabled' : ''}`}>
        <div className="toggle-label">
            {icon}
            <span>{label}</span>
        </div>
        <label className="switch">
            <input type="checkbox" checked={isChecked} onChange={onToggle} disabled={isDisabled} />
            <span className="slider round"></span>
        </label>
    </div>
);

const priorityOrder = [
    { key: 'congestion', label: 'Network Congestion', icon: <FiTrendingDown /> },
    { key: 'trainType', label: 'Train Priority', icon: <FiChevronsUp /> },
    { key: 'punctuality', label: 'Punctuality (Schedule)', icon: <FiClock /> },
    { key: 'trackCondition', label: 'Track Condition', icon: <FiTool /> },
    { key: 'weather', label: 'Weather Conditions', icon: <FiCloudDrizzle /> },
];

const LeftSidebar = ({ simulationStatus, selectedStation, onStationChange, blockedTracks, onBlockedTracksChange }) => {
    const [aiPriorities, setAiPriorities] = useState({
        congestion: true,      // ALWAYS on
        trainType: true,
        punctuality: true,
        trackCondition: true,  // ALWAYS on
        weather: false,
    });
    const [faultyTrackInput, setFaultyTrackInput] = useState('');

    const isSimRunning = simulationStatus !== 'stopped';

    useEffect(() => {
        // emit the priorities whenever they change; server is authoritative and will reapply forced flags
        socketService.emit('controller_set_priorities', aiPriorities);
    }, [aiPriorities]);

    const handlePriorityToggle = (priorityKey) => {
        // prevent toggling congestion/trackCondition (they must remain ON)
        if (priorityKey === 'congestion' || priorityKey === 'trackCondition') return;
        setAiPriorities(prev => ({ ...prev, [priorityKey]: !prev[priorityKey] }));
    };

    const handleAddFaultyTrack = () => {
        const trackIdToAdd = faultyTrackInput.toUpperCase().trim();
        if (trackIdToAdd && !blockedTracks.includes(trackIdToAdd)) {
            const newFaultyTracks = [...blockedTracks, trackIdToAdd];
            onBlockedTracksChange(newFaultyTracks);
            socketService.emit('controller_set_track_status', { trackId: trackIdToAdd, status: 'FAULTY' });
            setFaultyTrackInput('');
        }
    };

    const handleRemoveFaultyTrack = (trackId) => {
        const newFaultyTracks = blockedTracks.filter(t => t !== trackId);
        onBlockedTracksChange(newFaultyTracks);
        socketService.emit('controller_set_track_status', { trackId: trackId, status: 'OPERATIONAL' });
    };

    return (
        <aside className="left-sidebar">
            <div className="sidebar-content">
                <div className="panel">
                    <div className="panel-header"><span>Station Selector</span></div>
                    <div className="panel-content">
                        <select
                            value={selectedStation}
                            onChange={(e) => onStationChange(e.target.value)}
                            className="map-dropdown"
                            disabled={isSimRunning}
                        >
                            <option value="DLI">Delhi Junction</option>
                            <option value="GZB">Ghaziabad Junction</option>
                            <option value="SBB">Shahibabad</option>
                            <option value="ANVR">Anand Vihar Terminal</option>
                        </select>
                        <div className="map-image-container">
                             <img
                                src={process.env.PUBLIC_URL + '/ghaziabad_junction.jpg'}
                                alt={`${selectedStation} Map`}
                                className="map-image"
                            />
                        </div>
                    </div>
                </div>

                <div className="panel">
                    <div className="panel-header"><span>AI Optimization Strategy</span></div>
                    <div className="panel-content toggles">
                        {priorityOrder.map(p => (
                            <ToggleSwitch
                                key={p.key} label={p.label} icon={p.icon}
                                isChecked={aiPriorities[p.key]}
                                onToggle={() => handlePriorityToggle(p.key)}
                                isDisabled={p.key === 'congestion' || p.key === 'trackCondition'}
                            />
                        ))}
                    </div>
                </div>

                <div className="panel">
                    <div className="panel-header"><span>Blocked Tracks</span></div>
                    <div className="panel-content">
                        <div className="track-control-input-group">
                            <input
                                type="text"
                                className="track-input"
                                placeholder="e.g., TS-APP-1"
                                value={faultyTrackInput}
                                onChange={(e) => setFaultyTrackInput(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handleAddFaultyTrack()}
                            />
                            <button className="track-add-btn" onClick={handleAddFaultyTrack}>
                                +
                            </button>
                        </div>
                        <div className="blocked-track-list">
                            {blockedTracks.length === 0 ? (
                                <div className="no-tracks-message">No tracks manually blocked.</div>
                            ) : (
                                blockedTracks.map(trackId => (
                                    <div key={trackId} className="blocked-track-item">
                                        <FiAlertCircle className="faulty-icon" />
                                        <span>{trackId}</span>
                                        <button className="track-remove-btn" onClick={() => handleRemoveFaultyTrack(trackId)}>
                                            &times;
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </aside>
    );
};

export default LeftSidebar;
