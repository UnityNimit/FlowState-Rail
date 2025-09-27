import React, { useState, useEffect, useRef } from 'react';
import './RightSidebar.css';
import { FiInfo, FiPlay, FiPause, FiSquare, FiClock } from 'react-icons/fi';
import socketService from '../services/socketService';
import ttsService from '../services/ttsService';

const MAX_CARDS = 30;
const CARD_MIN_HEIGHT = 74; // css ensures consistent look

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

const RouteSummary = ({ route }) => {
    if (!route || route.length === 0) return <span className="route-empty">—</span>;
    return <span className="route-summary">{route.length} seg{route.length>1?'s':''}</span>;
};

function clampTooltipPosition(x, y, width, height) {
    const padding = 8;
    const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);

    let left = x;
    let top = y;

    if (left + width + padding > vw) left = vw - width - padding;
    if (left < padding) left = padding;

    if (top + height + padding > vh) top = vh - height - padding;
    if (top < padding) top = padding;

    return { left, top };
}

const RightSidebar = ({ simulationStatus, onStart, onTogglePause, onStop, isSimRunning, simSpeed, onSpeedChange }) => {
    const [recommendations, setRecommendations] = useState([]); // newest first
    const [isThinking, setIsThinking] = useState(false);
    const [networkState, setNetworkState] = useState(null);
    const [trainsState, setTrainsState] = useState([]);
    const [tooltip, setTooltip] = useState({ visible: false, left: 0, top: 0, html: null });
    const tooltipTimeoutRef = useRef(null);
    const ttsTimeoutRef = useRef(null);
    const containerRef = useRef(null);

    useEffect(() => {
        const onThinking = () => {
            setIsThinking(true);
        };
        const onPlanUpdate = (plan) => {
            setIsThinking(false);
            if (!plan || !Array.isArray(plan)) {
                // clear or keep existing
                return;
            }
            // Ensure newest-first ordering and cap length
            const enriched = plan.map((rec, idx) => enrichRec(rec, idx));
            // Use plan order (assuming optimizer orders by importance)
            const newList = enriched.slice(0, MAX_CARDS);
            setRecommendations(newList);
        };

        const onNetworkUpdate = (data) => {
            if (!data) return;
            setNetworkState(data.network || null);
            setTrainsState(data.trains || []);
        };

        socketService.on('ai:plan-thinking', onThinking);
        socketService.on('ai:plan-update', onPlanUpdate);
        socketService.on('network-update', onNetworkUpdate);
        socketService.on('initial-state', onNetworkUpdate);

        return () => {
            socketService.off('ai:plan-thinking', onThinking);
            socketService.off('ai:plan-update', onPlanUpdate);
            socketService.off('network-update', onNetworkUpdate);
            socketService.off('initial-state', onNetworkUpdate);
        };
    }, []);

    // Keep sim speed buttons visible and working
    const speeds = [1, 2, 8, 20];

    function enrichRec(rec, idx) {
        const route = rec.route || [];
        const startTime = typeof rec.startTime === 'number' ? rec.startTime : null;
        const humanPath = route.join(' → ');
        const reason = rec.justification || rec.reason || '';
        return {
            raw: rec,
            trainId: rec.trainId || `T-${idx}`,
            action: (rec.action || 'PROCEED').toUpperCase(),
            route,
            startTime,
            humanPath,
            reason,
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

    // Tooltip logic: position and content, show path on hover (if requested)
    const showTooltip = (event, rec, showFullRoute = false) => {
        // cancel existing timeouts
        if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
        if (ttsTimeoutRef.current) clearTimeout(ttsTimeoutRef.current);

        const node = event.currentTarget;
        const rect = node.getBoundingClientRect();
        requestAnimationFrame(() => {
            const tooltipWidth = Math.min(420, Math.max(260, Math.floor(window.innerWidth * 0.28)));
            const tooltipHeight = Math.min(420, Math.max(120, Math.floor(window.innerHeight * 0.35)));
            // initial left/top near the element
            let left = rect.left + rect.width / 2 - tooltipWidth / 2;
            let top = rect.top - tooltipHeight - 10;
            // clamp into viewport
            const clamped = clampTooltipPosition(left, top, tooltipWidth, tooltipHeight);
            const content = buildTooltipContent(rec, showFullRoute);
            setTooltip({ visible: true, left: clamped.left, top: clamped.top, html: content, width: tooltipWidth, height: tooltipHeight });

            // TTS: speak a short reason (debounced slightly)
            ttsTimeoutRef.current = setTimeout(() => {
                const speakText = buildTtsText(rec);
                if (speakText) {
                    ttsService.speak(speakText, { forceCancel: true }).catch(()=>{/*ignore*/});
                }
            }, 180);
        });
    };

    const hideTooltip = () => {
        if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
        if (ttsTimeoutRef.current) {
            clearTimeout(ttsTimeoutRef.current);
            ttsTimeoutRef.current = null;
        }
        ttsService.cancel();
        setTooltip({ visible: false, left: 0, top: 0, html: null });
    };

    function buildTooltipContent(rec, showFullRoute) {
        // Prefer server justification if present
        const lines = [];
        lines.push(<div key="h" className="tooltip-title">Decision — {rec.trainId}</div>);
        lines.push(<div key="a"><strong>Action:</strong> {rec.action}</div>);
        if (rec.reason && rec.reason.trim()) {
            lines.push(<div key="why"><strong>Why:</strong> {rec.reason}</div>);
        } else {
            // create concise conflict analysis
            const conflicts = analyzeConflicts(rec);
            if (conflicts.length) {
                lines.push(<div key="conf"><strong>Conflicts:</strong> {conflicts.map((c,i) => <div key={i} className="tooltip-conflict">• {c}</div>)}</div>);
            } else {
                lines.push(<div key="why2"><strong>Why:</strong> Preferred route or scheduling consideration.</div>);
            }
        }
        if (showFullRoute && rec.route && rec.route.length) {
            lines.push(<div key="route"><strong>Full route:</strong> <div className="tooltip-route">{rec.humanPath}</div></div>);
        } else if (rec.route && rec.route.length) {
            lines.push(<div key="r2"><strong>Route:</strong> {rec.route.length} segment{rec.route.length>1?'s':''}</div>);
        }
        if (rec.startTime != null && networkState) {
            const now = networkState.timestamp || 0;
            lines.push(<div key="sched"><strong>Planned start:</strong> t={rec.startTime}s ({computeETA(rec.startTime)}) — now t={now}s</div>);
        }
        const blocked = getBlockedSegments();
        if (blocked.length) lines.push(<div key="b"><strong>Blocked:</strong> {blocked.join(', ')}</div>);
        const weather = getWeatherBadSegments();
        if (weather.length) lines.push(<div key="w"><strong>Bad weather:</strong> {weather.join(', ')}</div>);
        return <div className="tooltip-contents">{lines}</div>;
    }

    function buildTtsText(rec) {
        if (!rec) return '';
        if (rec.reason && rec.reason.trim()) return `${rec.trainId}: ${rec.reason}`;
        // fallback summarised text (short)
        const conflicts = analyzeConflicts(rec);
        if (conflicts.length) return `${rec.trainId}: blocked by ${conflicts[0]}`;
        if (rec.route && rec.route.length) return `${rec.trainId}: proceed via ${rec.route.length} segments`;
        return `${rec.trainId}: proceed`;
    }

    function analyzeConflicts(rec) {
        // Inspect networkState and trainsState to derive exact conflicts for rec.route
        const out = [];
        if (!networkState || !rec.route || rec.route.length === 0) return out;

        // map segments for quick lookup
        const segMap = {};
        networkState.trackSegments.forEach(s => segMap[s.id] = s);

        // find any segment in the route that is FAULTY or has BAD weather or is occupied
        rec.route.forEach(segId => {
            const seg = segMap[segId];
            if (!seg) return;
            if (seg.status && seg.status.toUpperCase() === 'FAULTY') out.push(`${segId} is FAULTY`);
            if (seg.weather && seg.weather.toUpperCase() === 'BAD') out.push(`${segId} has BAD weather`);
            if (seg.isOccupied) {
                // find which train occupies it
                const occupying = trainsState.find(t => t.currentSegmentId === segId);
                if (occupying) out.push(`${segId} occupied by ${occupying.id}`);
                else out.push(`${segId} currently occupied`);
            }
        });
        return out;
    }

    function getBlockedSegments() {
        if (!networkState) return [];
        return (networkState.trackSegments || []).filter(s => s.status && s.status.toUpperCase() === 'FAULTY').map(s => s.id);
    }
    function getWeatherBadSegments() {
        if (!networkState) return [];
        return (networkState.trackSegments || []).filter(s => s.weather && s.weather.toUpperCase() === 'BAD').map(s => s.id);
    }

    // UI action handlers for speed buttons
    const handleSpeedClick = (s) => {
        if (onSpeedChange) onSpeedChange(s);
    };

    // header control buttons rendering
    const renderControlButtons = () => {
        if (simulationStatus === 'running') {
            return (
                <>
                    <ControlButton kind="pause" onClick={() => onTogglePause(false)} />
                    <ControlButton kind="stop" onClick={onStop} />
                </>
            );
        }
        if (simulationStatus === 'paused') {
            return (
                <>
                    <ControlButton kind="resume" onClick={() => onTogglePause(true)} />
                    <ControlButton kind="stop" onClick={onStop} />
                </>
            );
        }
        return <ControlButton kind="start" onClick={onStart} />;
    };

    // small helper to render card list
    const renderCards = () => {
        if (!isSimRunning && recommendations.length === 0) {
            return <div className="no-plan-message">Start the simulation to see AI decisions here.</div>;
        }
        if (isSimRunning && isThinking) {
            return <div className="thinking-block"><div className="spinner" /> AI optimizing...</div>;
        }
        if (isSimRunning && recommendations.length === 0) {
            return <div className="no-plan-message">No actionable recommendations right now.</div>;
        }

        return (
            <div className="cards-list">
                {recommendations.map((rec, idx) => (
                    <div
                        key={`${rec.trainId}-${idx}`}
                        className="ai-card"
                        style={{ minHeight: CARD_MIN_HEIGHT }}
                        onMouseEnter={(e) => showTooltip(e, rec, false)}
                        onMouseLeave={() => hideTooltip()}
                    >
                        <div className="left">
                            <div className="trainId">{rec.trainId}</div>
                            <div className={`actionBadge ${rec.action.includes('HOLD') ? 'hold' : 'proceed'}`}>
                                {rec.action.includes('HOLD') ? 'HOLD' : 'PROCEED'}
                            </div>
                        </div>

                        <div className="center">
                            <div className="meta">
                                <span className="prio">Priority: <strong>{rec.priority}</strong></span>
                                <span className="eta"> ETA: <strong>{computeETA(rec.startTime)}</strong></span>
                                <span className="segments"><RouteSummary route={rec.route} /></span>
                            </div>
                            <div className="muted-line">{rec.route && rec.route.length ? `First segment: ${rec.route[0]}` : ''}</div>
                        </div>

                        <div className="right">
                            <button
                                className="info-btn"
                                onMouseEnter={(e) => showTooltip(e, rec, true)} // show full route when hovering the info icon
                                onMouseLeave={() => hideTooltip()}
                                onFocus={(e) => showTooltip(e, rec, true)}
                                onBlur={() => hideTooltip()}
                                aria-label={`Details for ${rec.trainId}`}
                            >
                                <FiInfo />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <aside className="right-sidebar enhanced fixed-width" ref={containerRef}>
            <div className="panel merged-panel">
                <div className="panel-header merged-header">
                    <div className="header-left">
                        <h3>Simulation & AI Decisions</h3>
                        <div className="header-sub">Live — why the system chose each action</div>
                    </div>
                    <div className="header-right">
                        <div className="speed-controls">
                            {speeds.map(s => (
                                <button key={s} className={`sim-speed-btn ${simSpeed === s ? 'active' : ''}`} onClick={() => handleSpeedClick(s)}>{s}x</button>
                            ))}
                        </div>
                        <div className="control-btns">
                            {renderControlButtons()}
                        </div>
                    </div>
                </div>

                <div className="panel-content merged-content">
                    <div className="status-row">
                        <div className={`status-pill ${simulationStatus}`}>{(simulationStatus || '').toUpperCase()}</div>
                        <div className="thinking-pill">{isThinking ? 'AI: Thinking…' : 'AI: Idle'}</div>
                    </div>

                    <div className="ai-recommendation-list improved">
                        {renderCards()}
                    </div>
                </div>
            </div>

            {tooltip.visible && (
                <div
                    className="tooltip-popup"
                    style={{
                        left: tooltip.left,
                        top: tooltip.top,
                        width: tooltip.width,
                        maxHeight: tooltip.height,
                    }}
                    role="dialog"
                    onMouseEnter={() => { /* keep open */ }}
                    onMouseLeave={() => hideTooltip()}
                >
                    <div className="tooltip-inner">{tooltip.html}</div>
                </div>
            )}
        </aside>
    );
};

export default RightSidebar;
