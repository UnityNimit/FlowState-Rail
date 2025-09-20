import React, { useState, useEffect } from 'react';
import './RightSidebar.css';
import { IoClose } from 'react-icons/io5';
import { FiMinimize2, FiMaximize2, FiInfo, FiCpu } from 'react-icons/fi';
import socketService from '../services/socketService';

// ... (StatusItem component remains the same)

const RightSidebar = () => {
    const [recommendations, setRecommendations] = useState([]);
    const [isThinking, setIsThinking] = useState(false);

    useEffect(() => {
        // ... (socket listeners remain the same)
    }, []);

    const handleGetPlanClick = () => {
        socketService.emit('ai:get-plan');
    };

    return (
        <aside className="right-sidebar">
            {/* ... (System Status panel remains the same) */}
            
            <div className="panel ai-assistant">
                <div className="panel-header">
                    <span>AI Assistant: RailOps</span>
                    <div className="ai-controls"></div>
                </div>
                <div className="panel-content ai-feed">
                    <button className="ai-action-button" onClick={handleGetPlanClick} disabled={isThinking}>
                        <FiCpu /> {isThinking ? 'Optimizing...' : 'Apply AI Plan'}
                    </button>
                    <div className="ai-recommendation-list">
                        {isThinking && <div className="thinking-indicator">AI is analyzing network state...</div>}
                        
                        {!isThinking && recommendations.length === 0 && (
                             <div className="no-plan-message">Click "Apply AI Plan" to get recommendations.</div>
                        )}
                        
                        {recommendations.map((rec, index) => (
                            <div key={rec.trainId + index} 
                                 className={`ai-recommendation-item ${rec.action.includes('HOLD') ? 'action-hold' : 'action-proceed'}`}>
                                <div className="rec-priority">{rec.priority}</div>
                                <div className="rec-details">
                                    <span className="rec-train-id">{rec.trainId}</span>
                                    <span className="rec-action">
                                        {rec.action.includes('HOLD') ? `HOLD AT ${rec.details}` : rec.action}
                                        <span className="rec-path">{rec.humanReadablePath !== 'N/A' && rec.humanReadablePath}</span>
                                    </span>
                                </div>
                                <div className="rec-justification" title={rec.justification}>
                                    <FiInfo />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </aside>
    );
};

export default RightSidebar;