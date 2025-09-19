import React from 'react';
import './RightSidebar.css';
import { IoClose, IoStar } from 'react-icons/io5';
import { FiMinimize2, FiMaximize2 } from 'react-icons/fi';

// A reusable status item component
const StatusItem = ({ label, status, toggled }) => (
    <div className="status-item">
        <div className="status-label">
            <span className={`status-dot ${status}`}></span>
            {label}
        </div>
        <label className="switch">
            <input type="checkbox" defaultChecked={toggled} />
            <span className="slider round"></span>
        </label>
    </div>
);

const RightSidebar = () => {
    return (
        <aside className="right-sidebar">
            <div className="panel">
                <div className="panel-header">
                    <span>System Status</span>
                </div>
                <div className="panel-content status-list">
                    <StatusItem label="Communication Link" status="green" toggled={true} />
                    <StatusItem label="Primary Power Supply" status="green" toggled={true} />
                    <StatusItem label="Backup Power Supply" status="green" toggled={false} />
                    <StatusItem label="Signal Health" status="yellow" toggled={true} />
                    <StatusItem label="Manual Override" status="yellow" toggled={false} />
                    <StatusItem label="Emergency Override" status="green" toggled={false} />
                </div>
            </div>

            <div className="panel">
                <div className="panel-header">
                    <span>Emergency Controls</span>
                </div>
                <div className="panel-content emergency-controls">
                    <button>ALL SIGNALS HALT</button>
                    <button>SECTION POWER OFF</button>
                    <button>BROADCAST ALERT</button>
                </div>
            </div>
            
            <div className="panel ai-assistant">
                <div className="panel-header">
                    <span>AI Assistant: RailOps</span>
                    <div className="ai-controls">
                        <FiMinimize2 />
                        <FiMaximize2 />
                        <IoClose />
                    </div>
                </div>
                <div className="panel-content ai-feed">
                    <div className="ai-message">
                        <IoStar className="star-icon" />
                        <span>High-priority train 12417 approaching Sahibabad Jn.</span>
                    </div>
                    <div className="ai-message">
                        <IoStar className="star-icon" />
                        <span>Potential congestion detected on Line 3 in 15 mins.</span>
                    </div>
                    <div className="ai-message alert">
                        <IoStar className="star-icon" />
                        <span>Signal S14B unresponsive. Suggest rerouting freight 58210 via siding.</span>
                    </div>
                </div>
            </div>
        </aside>
    );
};

export default RightSidebar;