import React from 'react';
import './LeftSidebar.css';
import { FiSettings, FiMap, FiCpu, FiAlertTriangle, FiGitBranch } from 'react-icons/fi';
import { IoClose } from 'react-icons/io5';

// A reusable toggle switch component
const ToggleSwitch = ({ label, icon }) => (
    <div className="toggle-item">
        <div className="toggle-label">
            {icon}
            <span>{label}</span>
        </div>
        <label className="switch">
            <input type="checkbox" />
            <span className="slider round"></span>
        </label>
    </div>
);

const LeftSidebar = () => {
    return (
        <aside className="left-sidebar">
            <div className="panel">
                <div className="panel-header">
                    <span>Legend:</span>
                    <IoClose className="close-icon" />
                </div>
                <div className="panel-content">
                    <ul className="legend-list">
                        <li><span className="line-style bridge"></span> Bridge</li>
                        <li><span className="line-style tunnel"></span> Tunnel</li>
                        <li><span className="line-style railroad"></span> Railroad line</li>
                        <li><span className="line-style high-speed"></span> High-speed line</li>
                        <li><span className="line-style siding"></span> Siding</li>
                        <li><span className="line-style spur"></span> Spur</li>
                        <li><span className="line-style maintenance"></span> Under Maintenance</li>
                    </ul>
                </div>
            </div>

            <div className="panel">
                <div className="panel-header">
                    <span>AI Controls</span>
                    <IoClose className="close-icon" />
                </div>
                <div className="panel-content toggles">
                    <ToggleSwitch label="AI Route Optimization" icon={<FiGitBranch />} />
                    <ToggleSwitch label="Predictive Maintenance" icon={<FiSettings />} />
                    <ToggleSwitch label="Anomaly Detection" icon={<FiAlertTriangle />} />
                    <ToggleSwitch label="Smart Fleet Allocation" icon={<FiCpu />} />
                    <ToggleSwitch label="Crowd Analysis" icon={<FiMap />} />
                </div>
            </div>
            
            <div className="sidebar-footer">
                &larr; UP TRAIN APPROACH GZB
            </div>
        </aside>
    );
};

export default LeftSidebar;