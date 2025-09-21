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

const LeftSidebar = () => {
    const [selectedMap, setSelectedMap] = useState('ghaziabad');
    const [aiPriorities, setAiPriorities] = useState({
        congestion: true,
        trainType: true,
        punctuality: true,
        trackCondition: false,
        weather: true,
    });
    const [faultyTrackInput, setFaultyTrackInput] = useState('');
    const [faultyTracks, setFaultyTracks] = useState(['TC-PF4']);

    useEffect(() => {
        socketService.emit('ai:set-priorities', aiPriorities);
    }, [aiPriorities]);

    const handlePriorityToggle = (priorityKey) => {
        if (priorityKey === 'congestion') return;
        setAiPriorities(prev => ({ ...prev, [priorityKey]: !prev[priorityKey] }));
    };

    const handleAddFaultyTrack = () => {
        const trackIdToAdd = faultyTrackInput.toUpperCase().trim();
        if (trackIdToAdd && !faultyTracks.includes(trackIdToAdd)) {
            const newFaultyTracks = [...faultyTracks, trackIdToAdd];
            setFaultyTracks(newFaultyTracks);
            socketService.emit('controller:set-track-status', { trackId: trackIdToAdd, status: 'FAULTY' });
            setFaultyTrackInput('');
        }
    };

    const handleRemoveFaultyTrack = (trackId) => {
        const newFaultyTracks = faultyTracks.filter(t => t !== trackId);
        setFaultyTracks(newFaultyTracks);
        socketService.emit('controller:set-track-status', { trackId: trackId, status: 'OPERATIONAL' });
    };

    return (
        <aside className="left-sidebar">
            <div className="sidebar-content">
                <div className="panel">
                    <div className="panel-header"><span>Map Selector</span></div>
                    <div className="panel-content">
                        <select
                            value={selectedMap}
                            onChange={(e) => setSelectedMap(e.target.value)}
                            className="map-dropdown"
                        >
                            <option value="ghaziabad">Ghaziabad Junction</option>
                            <option value="other" disabled>Other Map</option>
                        </select>
                        <div className="map-image-container">
                            {selectedMap === 'ghaziabad' && (
                                <img
                                    src={process.env.PUBLIC_URL + '/ghaziabad_junction.jpg'}
                                    alt="Ghaziabad Junction Map"
                                    className="map-image"
                                />
                            )}
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
                                isDisabled={p.key === 'congestion'}
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
                                placeholder="e.g., TC-PF5"
                                value={faultyTrackInput}
                                onChange={(e) => setFaultyTrackInput(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handleAddFaultyTrack()}
                            />
                            <button className="track-add-btn" onClick={handleAddFaultyTrack}>
                                +
                            </button>
                        </div>
                        <div className="blocked-track-list">
                            {faultyTracks.length === 0 ? (
                                <div className="no-tracks-message">No tracks manually blocked.</div>
                            ) : (
                                faultyTracks.map(trackId => (
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