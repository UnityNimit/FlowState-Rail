import React, { useState, useEffect } from 'react';
import './RightSidebar.css';
import { FiInfo, FiCpu, FiPlayCircle, FiCloudDrizzle } from 'react-icons/fi';
import socketService from '../services/socketService';
import ttsService from '../services/ttsService';

const RightSidebar = () => {
    const [recommendations, setRecommendations] = useState([]);
    const [isThinking, setIsThinking] = useState(false);
    const [considerWeather, setConsiderWeather] = useState(true);

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
        // Here you could also send the 'considerWeather' state if the AI uses it
        socketService.emit('ai:get-plan');
    };

    const handleSimulateClick = () => {
        console.log("Simulate Plan button clicked. (Functionality to be implemented)");
        // This is where you would trigger a "fast-forward" simulation of the current AI plan
    };

    const handleHoverJustification = (justificationText) => {
        ttsService.speak(justificationText);
    };

    const handleLeaveJustification = () => {
        ttsService.cancel();
    };

    return (
        <aside className="right-sidebar">
            {/* --- NEW: AI Plan Controls Panel --- */}
            <div className="panel">
                <div className="panel-header"><span>AI Plan Controls</span></div>
                <div className="panel-content plan-controls">
                    <div className="control-item">
                        <label htmlFor="weatherToggle" className="control-label">
                            <FiCloudDrizzle />
                            Consider Weather
                        </label>
                        <label className="switch">
                            <input 
                                id="weatherToggle"
                                type="checkbox" 
                                checked={considerWeather} 
                                onChange={() => setConsiderWeather(!considerWeather)} 
                            />
                            <span className="slider round"></span>
                        </label>
                    </div>
                    <button className="simulate-button" onClick={handleSimulateClick}>
                        <FiPlayCircle />
                        Simulate Plan
                    </button>
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
                            // --- NEW: Improved logic for human-readable details ---
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