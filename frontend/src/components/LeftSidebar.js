import React, { useState, useEffect } from 'react';
import './LeftSidebar.css';
import { 
    FiCloudDrizzle, FiChevronsUp, FiTool, FiClock, FiTrendingDown 
} from 'react-icons/fi';
import { IoClose } from 'react-icons/io5';
import socketService from '../services/socketService'; // Import the socket service

const ToggleSwitch = ({ label, icon, isChecked, onToggle }) => (
    <div className="toggle-item">
        <div className="toggle-label">
            {icon}
            <span>{label}</span>
        </div>
        <label className="switch">  
            <input type="checkbox" checked={isChecked} onChange={onToggle} />
            <span className="slider round"></span>
        </label>
    </div>
);

const LeftSidebar = () => {
    const [selectedMap, setSelectedMap] = useState('ghaziabad');
    const [aiPriorities, setAiPriorities] = useState({
        weather: true,
        trainType: true,
        trackCondition: false,
        punctuality: true,
        congestion: false,
    });

    // This effect runs whenever aiPriorities changes
    useEffect(() => {
        // Send the complete, updated priority object to the backend
        socketService.emit('ai:set-priorities', aiPriorities);
        console.log("Sent updated AI priorities to backend:", aiPriorities);
    }, [aiPriorities]); // The dependency array ensures this runs only when aiPriorities is updated

    const handleMapChange = (event) => {
        setSelectedMap(event.target.value);
    };

    const handlePriorityToggle = (priority) => {
        setAiPriorities(prev => ({
            ...prev,
            [priority]: !prev[priority]
        }));
    };

    return (
        <aside className="left-sidebar">
            <div className="panel">
                <div className="panel-header">
                    <span>Map Selector</span>
                    <IoClose className="close-icon" />
                </div>
                <div className="panel-content">
                    <select value={selectedMap} onChange={handleMapChange} className="map-dropdown">
                        <option value="ghaziabad">Ghaziabad Junction</option>
                        <option value="other" disabled>Other Map (Disabled)</option>
                    </select>
                </div>
            </div>

            <div className="panel">
                <div className="panel-header">
                    <span>AI Optimization Strategy</span>
                    <IoClose className="close-icon" />
                </div>
                <div className="panel-content toggles">
                    <ToggleSwitch 
                        label="Weather Conditions" 
                        icon={<FiCloudDrizzle />}
                        isChecked={aiPriorities.weather}
                        onToggle={() => handlePriorityToggle('weather')}
                    />
                    <ToggleSwitch 
                        label="Train Priority" 
                        icon={<FiChevronsUp />}
                        isChecked={aiPriorities.trainType}
                        onToggle={() => handlePriorityToggle('trainType')}
                    />
                    <ToggleSwitch 
                        label="Track Condition" 
                        icon={<FiTool />}
                        isChecked={aiPriorities.trackCondition}
                        onToggle={() => handlePriorityToggle('trackCondition')}
                    />
                    <ToggleSwitch 
                        label="Punctuality (Schedule)" 
                        icon={<FiClock />}
                        isChecked={aiPriorities.punctuality}
                        onToggle={() => handlePriorityToggle('punctuality')}
                    />
                    <ToggleSwitch 
                        label="Network Congestion" 
                        icon={<FiTrendingDown />}
                        isChecked={aiPriorities.congestion}
                        onToggle={() => handlePriorityToggle('congestion')}
                    />
                </div>
            </div>
            
            <div className="sidebar-footer">
                &larr; UP TRAIN APPROACH GZB
            </div>
        </aside>
    );
};

export default LeftSidebar;