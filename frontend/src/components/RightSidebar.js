import React, { useState, useEffect, useRef } from 'react';
import './RightSidebar.css';
import { FiInfo, FiPlay, FiPause, FiSquare } from 'react-icons/fi';
import socketService from '../services/socketService';

const MAX_CARDS = 30;

// This is a helper component, it remains unchanged.
const ControlButton = ({ kind, onClick, disabled }) => {
    const icons = {
        start: <><FiPlay /> Start</>,
        pause: <><FiPause /> Pause</>,
        resume: <><FiPlay /> Resume</>,
        stop: <><FiSquare /> Stop</>
    };
    return (
        <button className={`sim-action-btn ${kind}`} onClick={onClick} disabled={disabled}>
            {icons[kind]}
        </button>
    );
};

// Updated RouteSummary to match new design
const RouteSummary = ({ route }) => {
    if (!route || route.length === 0) return null;
    const segs = route.length;
    return <div className="meta-item route-summary"><span>Route</span><strong>{segs} seg{segs > 1 ? 's' : ''}</strong></div>;
};

// Clamp function remains the same
function clampTooltipPosition(x, y, width, height) {
    const padding = 8;
    const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
    let left = x - width - 10; // Position to the left
    let top = y;
    if (left < padding) left = x + 40; // Flip to the right if no space
    if (left + width + padding > vw) left = vw - width - padding;
    if (top + height + padding > vh) top = vh - height - padding;
    if (top < padding) top = padding;
    return { left, top };
}


const RightSidebar = ({ simulationStatus, onStart, onTogglePause, onStop, isSimRunning, simSpeed, onSpeedChange }) => {
    // State and useEffect hooks remain the same as they handle logic, not layout.
    const [recommendations, setRecommendations] = useState([]);
    const [isThinking, setIsThinking] = useState(false);
    const [networkState, setNetworkState] = useState(null);
    const [tooltip, setTooltip] = useState({ visible: false, left: 0, top: 0, html: null });
    const tooltipTimeoutRef = useRef(null);

    useEffect(() => {
        const onThinking = () => setIsThinking(true);
        const onPlanUpdate = (plan) => {
            setIsThinking(false);
            if (!plan || !Array.isArray(plan)) return;
            const enriched = plan.map((rec, idx) => enrichRec(rec, idx));
            setRecommendations(enriched.slice(0, MAX_CARDS));
        };
        const onNetworkUpdate = (data) => {
            if (!data) return;
            setNetworkState(data.network || null);
        };

        socketService.on('ai:plan-thinking', onThinking);
        socketService.on('ai:plan-update', onPlanUpdate);
        socketService.on('network-update', onNetworkUpdate);
        socketService.on('initial-state', onNetworkUpdate);

        return () => {
            socketService.off('ai:plan-thinking');
            socketService.off('ai:plan-update');
            socketService.off('network-update');
            socketService.off('initial-state');
        };
    }, []);

    const speeds = [1, 2, 8, 20];

    function enrichRec(rec, idx) {
        return {
            raw: rec,
            trainId: rec.trainId || `T-${idx}`,
            action: (rec.action || 'PROCEED').toUpperCase(),
            route: rec.route || [],
            startTime: typeof rec.startTime === 'number' ? rec.startTime : null,
            humanPath: (rec.route || []).join(' → '),
            reason: rec.justification || rec.reason || '',
            priority: rec.priority ?? rec.trainType ?? 'N/A'
        };
    }

    function computeETA(startTime) {
        if (startTime == null || !networkState) return '—';
        const now = networkState.timestamp ?? 0;
        const dt = startTime - now;
        if (dt <= 0) return 'now';
        if (dt < 60) return `${Math.round(dt)}s`;
        const m = Math.round(dt / 60);
        return `${m}m`;
    }

    // Tooltip logic updated for better positioning
    const showTooltip = (event, rec) => {
        if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
        const node = event.currentTarget;
        const rect = node.getBoundingClientRect();
        const { left, top } = clampTooltipPosition(rect.left, rect.top, 300, 150);
        setTooltip({ visible: true, left, top, html: buildTooltipContent(rec) });
    };

    const hideTooltip = () => {
        tooltipTimeoutRef.current = setTimeout(() => {
            setTooltip({ visible: false, left: 0, top: 0, html: null });
        }, 150);
    };

    function buildTooltipContent(rec) {
        return (
            <div className="tooltip-contents">
                <div className="tooltip-title">Decision Rationale — {rec.trainId}</div>
                <div><strong>Action:</strong> {rec.action}</div>
                {rec.reason && <div><strong>Why:</strong> {rec.reason}</div>}
                {rec.route.length > 0 && <div className="tooltip-route"><strong>Route:</strong> {rec.humanPath}</div>}
            </div>
        );
    }
    
    const handleSpeedClick = (s) => onSpeedChange && onSpeedChange(s);
    
    const renderControlButtons = () => {
        if (simulationStatus === 'running') return <><ControlButton kind="pause" onClick={() => onTogglePause(false)} /><ControlButton kind="stop" onClick={onStop} /></>;
        if (simulationStatus === 'paused') return <><ControlButton kind="resume" onClick={() => onTogglePause(true)} /><ControlButton kind="stop" onClick={onStop} /></>;
        return <ControlButton kind="start" onClick={onStart} />;
    };

    const renderCards = () => {
        if (!isSimRunning && recommendations.length === 0) return <div className="no-plan-message">Start the simulation to see AI decisions.</div>;
        if (isSimRunning && isThinking) return <div className="thinking-block"><div className="spinner" /> AI optimizing...</div>;
        if (isSimRunning && recommendations.length === 0) return <div className="no-plan-message">No actionable recommendations right now.</div>;

        return (
            <div className="cards-list">
                {recommendations.map((rec, idx) => (
                    <div key={`${rec.trainId}-${idx}`} className="ai-card">
                        <div className="left">
                            <div className="trainId">{rec.trainId}</div>
                            <div className={`actionBadge ${rec.action.includes('HOLD') ? 'hold' : 'proceed'}`}>{rec.action}</div>
                        </div>
                        <div className="center">
                            <div className="meta">
                                <div className="meta-item"><span>Priority</span><strong>{rec.priority}</strong></div>
                                <div className="meta-item"><span>ETA</span><strong>{computeETA(rec.startTime)}</strong></div>
                                <RouteSummary route={rec.route} />
                            </div>
                            <div className="muted-line">{rec.route.length ? `First segment: ${rec.route[0]}` : 'No route assigned'}</div>
                        </div>
                        <div className="right">
                            <button className="info-btn" onMouseEnter={(e) => showTooltip(e, rec)} onMouseLeave={hideTooltip} aria-label={`Details for ${rec.trainId}`}>
                                <FiInfo />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <aside className="right-sidebar enhanced fixed-width">
            {/* THIS IS THE CORRECTED STRUCTURE */}
            <div className="main-panel">
                <div className="panel-header">
                    <h3>Simulation & AI Decisions</h3>
                    <div className="header-sub">Live analysis of system choices</div>
                </div>
                <div className="panel-body">
                    <div className="status-row">
                        <div className={`status-pill ${simulationStatus}`}>{(simulationStatus || '').toUpperCase()}</div>
                        <div className="thinking-pill">{isThinking ? 'AI: Thinking…' : 'AI: Idle'}</div>
                    </div>
                    {renderCards()}
                </div>
                <div className="panel-footer">
                    <div className="speed-control-group">
                        <span className="speed-label">SIM Speed</span>
                        <div className="speed-controls">
                            {speeds.map(s => (
                                <button key={s} className={`sim-speed-btn ${simSpeed === s ? 'active' : ''}`} onClick={() => handleSpeedClick(s)}>{s}x</button>
                            ))}
                        </div>
                    </div>
                    <div className="control-btns">
                        {renderControlButtons()}
                    </div>
                </div>
            </div>

            {tooltip.visible && (
                <div className="tooltip-popup" style={{ left: tooltip.left, top: tooltip.top }} role="dialog" onMouseEnter={() => clearTimeout(tooltipTimeoutRef.current)} onMouseLeave={hideTooltip}>
                    <div className="tooltip-inner">{tooltip.html}</div>
                </div>
            )}
        </aside>
    );
};

export default RightSidebar;