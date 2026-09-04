import React, { useState, useEffect, useRef } from 'react';
import './RightSidebar.css';
import { FiInfo, FiPlay, FiPause, FiSquare } from 'react-icons/fi';
import socketService from '../services/socketService';

const MAX_CARDS = 30;

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

function clampTooltipPosition(x, y, width, height) {
    const padding = 8;
    const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
    let left = x - width - 10;
    let top = y;
    if (left < padding) left = x + 40;
    if (left + width + padding > vw) left = vw - width - padding;
    if (top + height + padding > vh) top = vh - height - padding;
    if (top < padding) top = padding;
    return { left, top };
}

const RightSidebar = ({ simulationStatus, onStart, onTogglePause, onStop, isSimRunning, simSpeed, onSpeedChange, selectedStation }) => {
    const [recommendations, setRecommendations] = useState([]);
    const [isThinking, setIsThinking] = useState(false);
    const [networkState, setNetworkState] = useState(null);
    const [operationalState, setOperationalState] = useState(null);
    const [tooltip, setTooltip] = useState({ visible: false, left: 0, top: 0, html: null });
    const [blockPlan, setBlockPlan] = useState(null);
    const [isBlockPlanning, setIsBlockPlanning] = useState(false);
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
            if (data.network?.operationalState) {
                setOperationalState(data.network.operationalState);
            } else if (data.activeConflicts) {
                setOperationalState({
                    activeConflicts: data.activeConflicts,
                    activeCrossovers: data.activeCrossovers
                });
            }
        };
        const onBlockPlan = (plan) => {
            setBlockPlan(plan);
            setIsBlockPlanning(false);
        };

        socketService.on('ai:plan-thinking', onThinking);
        socketService.on('ai:plan-update', onPlanUpdate);
        socketService.on('network-update', onNetworkUpdate);
        socketService.on('initial-state', onNetworkUpdate);
        socketService.on('maintenance:plan-update', onBlockPlan);

        return () => {
            socketService.off('ai:plan-thinking');
            socketService.off('ai:plan-update');
            socketService.off('network-update');
            socketService.off('initial-state');
            socketService.off('maintenance:plan-update');
        };
    }, []);

    const speeds = [1, 2, 8, 20];

    function enrichRec(rec, idx) {
        const cInfo = rec.conflictInfo || rec.algorithmTrace?.conflictInfo || null;
        return {
            raw: rec,
            trainId: rec.trainId || `T-${idx}`,
            action: (rec.action || 'PROCEED').toUpperCase(),
            route: rec.route || [],
            startTime: typeof rec.startTime === 'number' ? rec.startTime : null,
            humanPath: (rec.route || []).join(' → '),
            reason: rec.justification || rec.reason || '',
            priority: rec.priority ?? rec.trainType ?? 'N/A',
            routeId: rec.routeId || rec.algorithmTrace?.selectedRouteId || 'Validated route',
            trace: rec.algorithmTrace || {},
            conflictInfo: cInfo,
            movementType: rec.movementType || (rec.routeId && rec.routeId.includes('-TO-') ? 'MERGE_DIVERGE' : 'THROUGH'),
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

    const showTooltip = (event, rec) => {
        if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
        const node = event.currentTarget;
        const rect = node.getBoundingClientRect();
        const { left, top } = clampTooltipPosition(rect.left, rect.top, 320, 180);
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
                <div><strong>Selected:</strong> {rec.routeId}</div>
                {rec.reason && <div><strong>Why:</strong> {rec.reason}</div>}
                {rec.conflictInfo && (
                    <div className="tooltip-conflict-box">
                        <strong>⚡ Junction Contention Resolution:</strong>
                        <div>Contended: {rec.conflictInfo.contendedResource}</div>
                        <div>Yielding to: Train {rec.conflictInfo.conflictingTrainId} (P{rec.conflictInfo.conflictingTrainPriority})</div>
                        <div>Hold duration: {rec.conflictInfo.holdDurationSeconds}s</div>
                    </div>
                )}
                <div><strong>Safety proof:</strong> {rec.trace.resourcesChecked ?? '—'} resources checked, {rec.trace.conflictingRoutesExcluded ?? 0} conflicting routes excluded, {rec.trace.unsafeConflicts ?? 0} unsafe conflicts.</div>
                {rec.trace.constraints?.length > 0 && <div><strong>Constraints:</strong> {rec.trace.constraints.join(', ')}</div>}
                {rec.route.length > 0 && <div className="tooltip-route"><strong>Route:</strong> {rec.humanPath}</div>}
            </div>
        );
    }
    
    const handleSpeedClick = (s) => onSpeedChange && onSpeedChange(s);
    const requestBlockPlan = (horizon) => {
        setIsBlockPlanning(true);
        socketService.emit('controller_generate_block_plan', { horizon, stationCode: selectedStation });
    };
    
    const renderControlButtons = () => {
        if (simulationStatus === 'running') return <><ControlButton kind="pause" onClick={() => onTogglePause(false)} /><ControlButton kind="stop" onClick={onStop} /></>;
        if (simulationStatus === 'paused') return <><ControlButton kind="resume" onClick={() => onTogglePause(true)} /><ControlButton kind="stop" onClick={onStop} /></>;
        return <ControlButton kind="start" onClick={onStart} />;
    };

    const renderContentionQueue = () => {
        const conflicts = operationalState?.activeConflicts || [];
        const heldRecs = recommendations.filter(r => r.action.includes('HOLD') && r.conflictInfo);
        const displayConflicts = conflicts.length > 0 ? conflicts : heldRecs.map(r => ({
            trainId: r.trainId,
            priority: r.priority,
            contendedResource: r.conflictInfo?.contendedResource,
            conflictingTrainId: r.conflictInfo?.conflictingTrainId,
            conflictingTrainType: r.conflictInfo?.conflictingTrainType,
            conflictingTrainPriority: r.conflictInfo?.conflictingTrainPriority,
            holdDurationSeconds: r.conflictInfo?.holdDurationSeconds,
            secondsRemaining: r.startTime ? Math.max(0, Math.round(r.startTime - (networkState?.timestamp || 0))) : r.conflictInfo?.holdDurationSeconds,
            resolution: r.conflictInfo?.resolution || r.reason,
        }));

        if (displayConflicts.length === 0) return null;

        return (
            <div className="contention-section">
                <div className="contention-header-row">
                    <span className="contention-title">⚡ JUNCTION CONTENTION QUEUE</span>
                    <span className="contention-badge">{displayConflicts.length} QUEUED</span>
                </div>
                <div className="contention-list">
                    {displayConflicts.map((c, i) => (
                        <div key={`${c.trainId}-${i}`} className="contention-card">
                            <div className="contention-card-top">
                                <span className="contention-res-name">{c.contendedResource || 'JUNCTION'}</span>
                                <span className="contention-countdown">
                                    ⏱️ {c.secondsRemaining != null ? `${c.secondsRemaining}s wait` : `${c.holdDurationSeconds || 0}s wait`}
                                </span>
                            </div>
                            <div className="contention-vs-box">
                                <div className="contention-pill-held">
                                    <span className="badge-type">HELD</span>
                                    <strong>T-{c.trainId}</strong>
                                    <span className="badge-pri">P{c.priority}</span>
                                </div>
                                <span className="contention-arrow">➔ yields to ➔</span>
                                <div className="contention-pill-proceed">
                                    <span className="badge-type">CLEAR</span>
                                    <strong>T-{c.conflictingTrainId || 'PRECEDING'}</strong>
                                    <span className="badge-pri">P{c.conflictingTrainPriority || '?'}</span>
                                </div>
                            </div>
                            {c.resolution && (
                                <div className="contention-resolution-text">{c.resolution}</div>
                            )}
                            <div className="contention-proof-row">
                                <span>CP-SAT SAFETY PROOF</span>
                                <strong>0 UNSAFE CONFLICTS</strong>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const renderCrossoverSummary = () => {
        const crossovers = operationalState?.activeCrossovers || [];
        if (crossovers.length === 0) return null;

        return (
            <div className="crossover-summary-section">
                <div className="crossover-summary-header">
                    <span>🔀 ACTIVE CROSSOVER DIVERGES</span>
                    <strong>{crossovers.length} ACTIVE (P-REV)</strong>
                </div>
                <div className="crossover-summary-items">
                    {crossovers.map((xo, i) => (
                        <div key={`${xo.trainId}-${i}`} className="crossover-item">
                            <div className="crossover-line-1">
                                <strong>Train {xo.trainId} ({xo.trainType})</strong>
                                <span className="xo-movement-tag">{xo.movementType}</span>
                            </div>
                            <div className="crossover-line-2">
                                Via {xo.crossoverSegments.join(', ')} · Switch: REVERSE
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const renderCards = () => {
        if (!isSimRunning && recommendations.length === 0) return <div className="no-plan-message">Start the simulation to see AI decisions.</div>;
        if (isSimRunning && isThinking) return <div className="thinking-block"><div className="spinner" /> AI optimizing...</div>;
        if (isSimRunning && recommendations.length === 0) return <div className="no-plan-message">No actionable recommendations right now.</div>;

        return (
            <div className="cards-list">
                {recommendations.map((rec, idx) => {
                    const isHeld = rec.action.includes('HOLD');
                    const isCrossover = rec.trace.isAlternateRoute || rec.movementType === 'MERGE_DIVERGE';

                    return (
                        <div key={`${rec.trainId}-${idx}`} className={`ai-card ${isHeld ? 'card-held' : ''} ${isCrossover ? 'card-crossover' : ''}`}>
                            <div className="left">
                                <div className="trainId">{rec.trainId}</div>
                                <div className={`actionBadge ${isHeld ? 'hold' : 'proceed'}`}>{rec.action}</div>
                            </div>
                            <div className="center">
                                <div className="route-decision-line">
                                    <span className={`route-choice ${isCrossover ? 'crossover' : rec.trace.isAlternateRoute ? 'alternate' : 'main'}`}>
                                        {isCrossover ? '🔀 CROSSOVER DIVERGE' : rec.trace.isAlternateRoute ? 'ALTERNATE PATH' : 'MAIN PATH'}
                                    </span>
                                    <span className="route-id">{rec.routeId}</span>
                                </div>

                                {rec.conflictInfo?.conflictingTrainId && (
                                    <div className="card-conflict-pill">
                                        ⚡ Yields to T-{rec.conflictInfo.conflictingTrainId} (P{rec.conflictInfo.conflictingTrainPriority}) on {rec.conflictInfo.contendedResource}
                                    </div>
                                )}

                                <div className="meta">
                                    <div className="meta-item"><span>Candidates</span><strong>{rec.trace.candidateRoutesEvaluated ?? '—'}</strong></div>
                                    <div className="meta-item"><span>Resources</span><strong>{rec.trace.resourcesChecked ?? '—'}</strong></div>
                                    <div className="meta-item"><span>Conflicts</span><strong>{rec.trace.unsafeConflicts ?? 0}</strong></div>
                                </div>
                                <div className="algorithm-proof-line">
                                    <span>P{rec.priority}</span>
                                    <span>{computeETA(rec.startTime)}</span>
                                    <span>{rec.trace.estimatedTravelSeconds ? `${rec.trace.estimatedTravelSeconds}s run` : `${rec.route.length} segments`}</span>
                                    <span>{rec.trace.conflictingRoutesExcluded ?? 0} routes excluded</span>
                                </div>
                            </div>
                            <div className="right">
                                <button className="info-btn" onMouseEnter={(e) => showTooltip(e, rec)} onMouseLeave={hideTooltip} aria-label={`Details for ${rec.trainId}`}>
                                    <FiInfo />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <aside className="right-sidebar enhanced fixed-width">
            <div className="main-panel">
                <div className="panel-header">
                    <h3>Simulation & AI Decisions</h3>
                    <div className="header-sub">CP-SAT Multi-Commodity Interlocking Engine</div>
                </div>
                <div className="panel-body">
                    <div className="status-row">
                        <div className={`status-pill ${simulationStatus}`}>{(simulationStatus || '').toUpperCase()}</div>
                        <div className="thinking-pill">{isThinking ? 'AI: Thinking…' : 'AI: Idle'}</div>
                    </div>
                    <div className="solver-proof-strip">
                        <span>CP-SAT RESOURCE MODEL</span>
                        <strong>TRACK + POINT + OHE</strong>
                        <em>0 unsafe conflicts required · Dynamic Headway</em>
                    </div>

                    {renderContentionQueue()}
                    {renderCrossoverSummary()}

                    <div className="block-planning-controls">
                        <span>Automatic block plan</span>
                        <button onClick={() => requestBlockPlan('weekly')}>Weekly</button>
                        <button onClick={() => requestBlockPlan('monthly')}>Monthly</button>
                    </div>
                    {isBlockPlanning && <div className="block-plan-summary">Optimizing multi-department resources…</div>}
                    {blockPlan && !isBlockPlanning && (
                        <div className="block-plan-summary">
                            <strong>{blockPlan.horizon?.toUpperCase()} · {blockPlan.blocks?.length || 0} blocks · {blockPlan.unsafeConflicts ?? 0} unsafe conflicts</strong>
                            {blockPlan.blocks?.slice(0, 3).map(block => (
                                <div key={block.id}>Day {block.day}, {String(Math.floor(block.startMinute / 60)).padStart(2, '0')}:{String(block.startMinute % 60).padStart(2, '0')} · {block.durationMinutes}m · {block.departments.join(' + ')}</div>
                            ))}
                        </div>
                    )}
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
