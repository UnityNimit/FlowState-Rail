import React, { useState, useEffect } from 'react';
import axios from 'axios';

const panelStyle = {
    flex: 1.5,
    backgroundColor: 'var(--bg-panel)',
    borderRadius: '8px',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    border: '1px solid var(--border-color)',
};

const buttonStyle = {
    padding: '10px 15px',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 'bold',
};

function AIDecisionPanel({ conflict, setConflict, currentState }) {
    const [recommendation, setRecommendation] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (conflict && !recommendation) {
            setIsLoading(true);
            const getDecision = async () => {
                try {
                    const response = await axios.post('http://localhost:5000/api/decisions/resolve-conflict', {
                        currentState: currentState,
                        conflictDescription: conflict.description,
                    });
                    setRecommendation(response.data);
                } catch (error) {
                    console.error("Error getting AI recommendation:", error);
                    setRecommendation({ error: 'Failed to fetch recommendation.' });
                } finally {
                    setIsLoading(false);
                }
            };
            getDecision();
        }
    }, [conflict, currentState, recommendation]);

    const handleApply = () => {
        console.log("Applying recommendation:", recommendation);
        // Here you would emit a socket event to the backend to execute the action
        // e.g., socket.emit('executeAction', { action: recommendation.recommendation });
        setRecommendation(null);
        setConflict(null);
    };

    const handleOverride = () => {
        console.log("Manual override chosen.");
        setRecommendation(null);
        setConflict(null);
    };

    if (!conflict) {
        return (
            <div style={panelStyle}>
                <h3>AI Decision Panel</h3>
                <p style={{ color: 'var(--text-secondary)' }}>Monitoring... No active conflicts.</p>
            </div>
        );
    }

    return (
        <div style={panelStyle}>
            <h3 style={{ color: 'var(--accent-red)' }}>Conflict Detected!</h3>
            <p><strong>Location:</strong> {conflict.location}</p>
            <p><strong>Details:</strong> {conflict.description}</p>
            <hr style={{borderColor: 'var(--border-color)'}}/>

            {isLoading && <p>AI is analyzing the situation...</p>}
            
            {recommendation && !recommendation.error && (
                <div>
                    <h4>AI Recommended Action:</h4>
                    <div style={{backgroundColor: 'rgba(0, 255, 170, 0.1)', padding: '15px', borderRadius: '6px', borderLeft: '3px solid var(--accent-green)'}}>
                        <p style={{margin: 0, fontWeight: 'bold'}}>{recommendation.recommendation}</p>
                    </div>

                    <h5>Reasoning:</h5>
                    <p style={{color: 'var(--text-secondary)'}}>{recommendation.reasoning}</p>
                    
                    <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                        <button onClick={handleApply} style={{...buttonStyle, backgroundColor: 'var(--accent-green)', color: 'var(--bg-dark)'}}>Apply Recommendation</button>
                        <button onClick={handleOverride} style={{...buttonStyle, backgroundColor: '#ff9900'}}>Manual Override</button>
                    </div>
                </div>
            )}
            {recommendation && recommendation.error && (
                 <p style={{color: 'var(--accent-red)'}}>Could not retrieve AI recommendation.</p>
            )}
        </div>
    );
}

export default AIDecisionPanel;