import React, { useState, useEffect } from 'react';
import './RightSidebar.css';
import { FiInfo, FiCpu, FiPlayCircle } from 'react-icons/fi';
import socketService from '../services/socketService';
import ttsService from '../services/ttsService';

const RightSidebar = () => {
    const [recommendations, setRecommendations] = useState([]);
    const [isThinking, setIsThinking] = useState(false);
    const [simSpeed, setSimSpeed] = useState(1);

    useEffect(() => {
        // --- THE CRITICAL FIX ---
        // The event name is changed to use an underscore, matching the
        // Python backend's event handler function name.
        socketService.emit('controller_set_sim_speed', { speed: simSpeed });
    }, [simSpeed]);

    useEffect(() => {
        socketService.on('ai:plan-thinking', () => {
            setIsThinking(true);
            setRecommendations([]);
        });

        socketService.on('ai:plan-update', (plan) => {
            setIsThinking(false);
            if (plan && !plan.error) {
                setRecommendations(plan);
            } else {
                const errorRec = {
                    trainId: "AI ERROR", action: "COULD NOT GENERATE PLAN", humanReadablePath: "Check backend console for errors.", priority: "!",
                    justification: plan?.details || "The AI could not generate a valid plan."
                };
                setRecommendations([errorRec]);
            }
        });

        return () => {
            ttsService.cancel();
            socketService.off('ai:plan-thinking');
            socketService.off('ai-plan-update');
        };
    }, []);

    const handleGetPlanClick = () => {
        socketService.emit('ai:get-plan');
    };
    
    const handleHoverJustification = (justificationText) => {
        ttsService.speak(justificationText);
    };

    const handleLeaveJustification = () => {
        ttsService.cancel();
    };

    return (
        <aside className="right-sidebar">
            <div className="panel">
                <div className="panel-header"><span>Simulation Controls</span></div>
                <div className="panel-content">
                    <div className="sim-controls-wrapper">
                        <span className="sim-label">Sim Speed:</span>
                        <div className="sim-speed-buttons">
                            {[1, 2, 8, 20].map(speed => (
                                <button
                                    key={speed}
                                    className={`sim-speed-btn ${simSpeed === speed ? 'active' : ''}`}
                                    onClick={() => setSimSpeed(speed)}
                                >
                                    {speed}x
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
            
            <div className="panel ai-assistant">
                <div className="panel-header">
                    <span>AI Recommended Sequence</span>
                    <div className="ai-controls"></div>
                </div>
                <div className="panel-content ai-feed">
                    <button className="ai-action-button" onClick={handleGetPlanClick} disabled={isThinking}>
                        <FiCpu /> {isThinking ? 'Optimizing...' : 'Apply AI Plan'}
                    </button>
                    <div className="ai-recommendation-list">
                        {isThinking && <div className="thinking-indicator">AI is analyzing network state...</div>}
                        
                        {!isThinking && recommendations.length === 0 && (
                             <div className="no-plan-message">Click "Apply AI Plan" to get the optimal train sequence.</div>
                        )}
                        
                        {recommendations.map((rec, index) => {
                            const isHoldAction = rec.action.includes('HOLD');
                            const displayAction = isHoldAction ? 'HOLD' : 'PROCEED VIA';
                            const displayDetails = isHoldAction 
                                ? `For: ${rec.releaseCondition?.checkTrainId || 'conflict'}`
                                : rec.humanReadablePath;

                            return (
                                <div key={rec.trainId + index} 
                                    className={`ai-recommendation-item ${isHoldAction ? 'action-hold' : 'action-proceed'}`}>
                                    <div className="rec-priority">{rec.priority}</div>
                                    <div className="rec-details">
                                        <span className="rec-train-id">{rec.trainId}</span>
                                        <span className="rec-action">
                                            {displayAction}
                                            <span className="rec-path">{displayDetails}</span>
                                        </span>
                                    </div>
                                    <div 
                                        className="rec-justification" 
                                        title={rec.justification}
                                        onMouseEnter={() => handleHoverJustification(rec.justification)}
                                        onMouseLeave={handleLeaveJustification}
                                    >
                                        <FiInfo />
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>
        </aside>
    );
};

export default RightSidebar;