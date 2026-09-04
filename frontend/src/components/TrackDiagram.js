// TrackDiagram.js - Authentic Indian Railways Electronic Interlocking (EI) VDU Digital Twin
import React, { useState, useEffect, useRef } from 'react';
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { FiMaximize2, FiMinimize2, FiMinus, FiPlus, FiTarget } from 'react-icons/fi';
import './TrackDiagram.css';

const trainColorMap = new Map([
    ['Shatabdi', '#38bdf8'],
    ['Rajdhani', '#c084fc'],
    ['Vande Bharat', '#00f0ff'],
    ['Passenger', '#34d399'],
    ['DMU', '#facc15'],
    ['MEMU', '#fb923c'],
    ['SF Express', '#f43f5e'],
    ['Mail', '#818cf8'],
    ['Express', '#60a5fa'],
    ['Freight', '#94a3b8']
]);

const getTrainColor = (trainType = '') => {
    return trainColorMap.get(trainType.trim()) || '#38bdf8';
};

const TrackDiagram = ({ 
    network, 
    trains = [], 
    onSignalClick, 
    onTrackClick, 
    showNames = false, 
    showSpeeds = false,
    activeMaintenanceBlocks = []
}) => {
    const [errTimer, setErrTimer] = useState(120);
    const [selectedPoint, setSelectedPoint] = useState(null);
    const [clock, setClock] = useState(() => new Date());
    const [isFullscreen, setIsFullscreen] = useState(false);
    const screenRef = useRef(null);

    useEffect(() => {
        const interval = setInterval(() => {
            setErrTimer(prev => (prev > 0 ? prev - 1 : 120));
            setClock(new Date());
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(document.fullscreenElement === screenRef.current);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    const toggleFullscreen = async () => {
        if (!screenRef.current) return;
        if (document.fullscreenElement === screenRef.current) {
            await document.exitFullscreen();
        } else {
            await screenRef.current.requestFullscreen();
        }
    };

    if (!network || !network.nodes || !network.trackSegments) return null;

    const nodesMap = new Map(network.nodes.map(node => [node.id, node]));

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    network.nodes.forEach(n => {
        if (n.position.x < minX) minX = n.position.x;
        if (n.position.x > maxX) maxX = n.position.x;
        if (n.position.y < minY) minY = n.position.y;
        if (n.position.y > maxY) maxY = n.position.y;
    });

    const viewBoxWidth = Math.max(1400, maxX - minX + 280);
    const viewBoxHeight = Math.max(450, maxY + 140);
    const originX = Math.max(0, minX - 120);

    const lockedSegmentIds = new Set();
    if (trains) {
        trains.forEach(train => {
            if (train.route) train.route.forEach(id => lockedSegmentIds.add(id));
        });
    }

    const blockedSet = new Set(activeMaintenanceBlocks);

    const calculateTrainPosition = (train) => {
        if (!train.currentSegmentId || !train.route) return null;
        const segment = network.trackSegments.find(s => s.id === train.currentSegmentId);
        if (!segment) return null;

        let startNodeId = segment.startNodeId, endNodeId = segment.endNodeId;
        const routeIndex = train.route.indexOf(train.currentSegmentId);

        if (routeIndex > 0) {
            const prevSegment = network.trackSegments.find(s => s.id === train.route[routeIndex - 1]);
            if (prevSegment) {
                const commonNode = [segment.startNodeId, segment.endNodeId].find(id => id === prevSegment.startNodeId || id === prevSegment.endNodeId);
                startNodeId = commonNode;
                endNodeId = (segment.startNodeId === commonNode) ? segment.endNodeId : segment.startNodeId;
            }
        }

        const startNode = nodesMap.get(startNodeId);
        const endNode = nodesMap.get(endNodeId);
        if (!startNode || !endNode) return null;

        const posFraction = Math.max(0, Math.min(1, train.positionOnSegment || 0));
        const x = startNode.position.x + (endNode.position.x - startNode.position.x) * posFraction;
        const y = startNode.position.y + (endNode.position.y - startNode.position.y) * posFraction;
        const angle = Math.atan2(endNode.position.y - startNode.position.y, endNode.position.x - startNode.position.x) * (180 / Math.PI);
        return { x, y, angle };
    };

    const stationMeta = network.station || null;
    const platforms = stationMeta?.platforms || [];
    const tracksMeta = stationMeta?.tracksMeta || [];

    return (
        <div className="vdu-screen-container" ref={screenRef}>
            {/* Representative railway control display for the planning simulation. */}
            <div className="vdu-top-bar">
                <div className="vdu-header-left">
                    <span className="ei-system-badge">EI DIGITAL TWIN</span>
                    <span className="ei-doc-badge">DEMONSTRATION DATA</span>
                    <span className="ei-clock">
                        {clock.toLocaleTimeString('en-IN', { hour12: false, timeZone: 'Asia/Kolkata' })} IST
                    </span>
                </div>

                <div className="vdu-station-titleplate">
                    <div className="title-hindi">उत्तर रेलवे · पुरानी दिल्ली जंक्शन</div>
                    <div className="title-main">OLD DELHI JUNCTION (DLI) · 16-PLATFORM YARD</div>
                    <div className="title-sub">REPRESENTATIVE ELECTRONIC INTERLOCKING CONTROL VIEW</div>
                </div>

                <div className="vdu-header-right">
                    <span className="north-arrow">⬆ N</span>
                    <span className="system-health-ok">● SYSTEM HEALTH: NORMAL</span>
                    <span className="block-status-tag">CTC DUAL DUPLEX</span>
                </div>
            </div>

            {/* Route-control shortcuts remain available without consuming canvas height. */}
            <div className="vdu-buttons-strip">
                <button className="vdu-btn btn-sig-clear">SIGNAL CLEAR (KL)</button>
                <button className="vdu-btn btn-sig-cancel">CANCEL ROUTE (KR)</button>
                <button className="vdu-btn btn-err">
                    EMERGENCY ROUTE RELEASE <span className="timer-tag">({errTimer}s)</span>
                </button>
                <button className="vdu-btn btn-co">CALLING ON (CO)</button>
                <button className="vdu-btn btn-epo">EMERGENCY POINT (EPO)</button>
                <button className="vdu-btn btn-ch">CRANK HANDLE UNLOCK</button>
                <button className="vdu-btn btn-ac-reset">AXLE COUNTER RESET</button>
                <button className="vdu-btn btn-ohe">25kV OHE ENERGIZED</button>
                <button className={`vdu-btn ${activeMaintenanceBlocks.length > 0 ? 'btn-bdms-active' : 'btn-bdms-idle'}`}>
                    BDMS: {activeMaintenanceBlocks.length > 0 ? `${activeMaintenanceBlocks.length} ACTIVE BLOCK${activeMaintenanceBlocks.length > 1 ? 'S' : ''}` : 'NO ACTIVE BLOCK'}
                </button>
            </div>

            {/* CTC Interactive Vector Canvas */}
            <div className="track-diagram-wrapper">
                <TransformWrapper
                    limitToBounds={false}
                    minScale={0.35}
                    maxScale={10}
                    initialScale={1}
                    centerOnInit={true}
                    wheel={{ step: 0.08 }}
                    doubleClick={{ disabled: true }}
                >
                    {({ zoomIn, zoomOut, resetTransform }) => (
                        <>
                            <div className="diagram-view-controls" aria-label="Track diagram view controls">
                                <button type="button" onClick={() => zoomIn(0.35)} title="Zoom in" aria-label="Zoom in"><FiPlus /></button>
                                <button type="button" onClick={() => zoomOut(0.35)} title="Zoom out" aria-label="Zoom out"><FiMinus /></button>
                                <button type="button" onClick={() => resetTransform(250)} title="Fit entire yard" aria-label="Fit entire yard"><FiTarget /></button>
                                <span className="view-control-divider" />
                                <button type="button" onClick={toggleFullscreen} title={isFullscreen ? 'Exit full screen' : 'Open full screen'} aria-label={isFullscreen ? 'Exit full screen' : 'Open full screen'}>
                                    {isFullscreen ? <FiMinimize2 /> : <FiMaximize2 />}
                                </button>
                            </div>
                            <div className="diagram-state-legend" aria-label="Track state legend">
                                <span><i className="legend-line clear" />Clear</span>
                                <span><i className="legend-line locked" />Route locked</span>
                                <span><i className="legend-line occupied" />Occupied</span>
                                <span><i className="legend-line blocked" />Maintenance</span>
                            </div>
                            <TransformComponent
                                wrapperStyle={{ width: '100%', height: '100%' }}
                                contentStyle={{ width: '100%', height: '100%' }}
                            >
                                <svg
                                    width="100%"
                                    height="100%"
                                    viewBox={`${originX} 0 ${viewBoxWidth} ${viewBoxHeight}`}
                                    preserveAspectRatio="xMidYMid meet"
                                    className="ctc-svg-canvas"
                                >
                            <defs>
                                <pattern id="maint-hazard" width="16" height="16" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
                                    <line x1="0" y1="0" x2="0" y2="16" stroke="#f59e0b" strokeWidth="6" />
                                    <line x1="8" y1="0" x2="8" y2="16" stroke="#1e293b" strokeWidth="6" />
                                </pattern>

                                <filter id="cyan-glow" x="-20%" y="-20%" width="140%" height="140%">
                                    <feGaussianBlur stdDeviation="3" result="blur" />
                                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                                </filter>
                                <filter id="hazard-glow" x="-20%" y="-20%" width="140%" height="140%">
                                    <feGaussianBlur stdDeviation="4" result="blur" />
                                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                                </filter>
                                <filter id="red-glow" x="-30%" y="-30%" width="160%" height="160%">
                                    <feGaussianBlur stdDeviation="4" result="blur" />
                                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                                </filter>
                            </defs>

                            {/* Section Corridor Markers */}
                            <g transform="translate(180, 42)">
                                <rect x="-10" y="-12" width="310" height="24" rx="4" className="vdu-corridor-plate-bg" />
                                <text className="vdu-corridor-plate-text" x="145" y="4">
                                    ⬅️ WEST ENTRY (AMBALA / ROHTAK / REWARI)
                                </text>
                            </g>
                            <g transform="translate(3050, 42)">
                                <rect x="-10" y="-12" width="320" height="24" rx="4" className="vdu-corridor-plate-bg" />
                                <text className="vdu-corridor-plate-text" x="150" y="4">
                                    EAST EXIT (YAMUNA BRIDGE / GHAZIABAD) ➡️
                                </text>
                            </g>

                            {/* Passenger Platforms 1 to 16 (Authentic IR VDU Platform Bays) */}
                            {platforms.map(pf => {
                                const isUp = pf.direction === 'WEST';
                                return (
                                    <g key={pf.number} className="platform-vdu-group">
                                        {/* Frosted Platform Island */}
                                        <rect
                                            x={pf.x_start}
                                            y={pf.y - 14}
                                            width={pf.x_end - pf.x_start}
                                            height={28}
                                            rx={4}
                                            className={isUp ? "vdu-platform-bay-up" : "vdu-platform-bay-dn"}
                                        />
                                        {/* Platform Identification Plaque */}
                                        <g transform={`translate(${pf.x_start + 110}, ${pf.y})`}>
                                            <rect x="-65" y="-10" width="130" height="20" rx="3" className="vdu-pf-badge-bg" />
                                            <text className="vdu-pf-badge-text" x="0" y="4">
                                                {`PF ${pf.number} [${isUp ? 'UP ▲' : 'DN ▼'}]`}
                                            </text>
                                        </g>
                                    </g>
                                );
                            })}

                            {/* Left Margin: Operational Line Names & Shunting Necks */}
                            {tracksMeta.map(tm => (
                                <g key={tm.index} transform={`translate(20, ${tm.y})`} className="vdu-line-label">
                                    <rect x="0" y="-9" width="210" height="18" rx="3" className="vdu-line-label-bg" />
                                    <text x="6" y="3.5" className="vdu-line-label-text">
                                        {tm.name}
                                    </text>
                                </g>
                            ))}

                            {/* Track Circuits (Clean Steel Lines / Route Yellow / Solid Red Occupied) */}
                            <g id="track-segments">
                                {network.trackSegments.map(segment => {
                                    const startNode = nodesMap.get(segment.startNodeId);
                                    const endNode = nodesMap.get(segment.endNodeId);
                                    if (!startNode || !endNode) return null;

                                    const isBlocked = segment.status === 'FAULTY' || blockedSet.has(segment.id);
                                    const isLocked = lockedSegmentIds.has(segment.id);
                                    const isOccupied = segment.isOccupied;

                                    const midX = (startNode.position.x + endNode.position.x) / 2;
                                    const midY = (startNode.position.y + endNode.position.y) / 2;

                                    return (
                                        <g 
                                            key={segment.id} 
                                            className="segment-group" 
                                            onClick={() => onTrackClick && onTrackClick(segment.id)}
                                        >
                                            {/* Base Crisp White/Grey Track Circuit Line */}
                                            <line
                                                x1={startNode.position.x}
                                                y1={startNode.position.y}
                                                x2={endNode.position.x}
                                                y2={endNode.position.y}
                                                className="vdu-track-base"
                                            />

                                            {/* Dynamic VDU State Rendering */}
                                            {isBlocked ? (
                                                <>
                                                    <line
                                                        x1={startNode.position.x}
                                                        y1={startNode.position.y}
                                                        x2={endNode.position.x}
                                                        y2={endNode.position.y}
                                                        className="vdu-track-blocked"
                                                        stroke="url(#maint-hazard)"
                                                        strokeWidth="8"
                                                    />
                                                    <g transform={`translate(${midX}, ${midY - 14})`} className="maint-badge">
                                                        <rect x="-56" y="-9" width="112" height="18" rx="4" className="maint-badge-bg" />
                                                        <text x="0" y="3" className="maint-badge-text">
                                                            🚧 BDMS BLOCK
                                                        </text>
                                                    </g>
                                                </>
                                            ) : isOccupied ? (
                                                /* SOLID GLOWING RED (Exact Indian Railways VDU standard!) */
                                                <line
                                                    x1={startNode.position.x}
                                                    y1={startNode.position.y}
                                                    x2={endNode.position.x}
                                                    y2={endNode.position.y}
                                                    className="vdu-track-occupied"
                                                    filter="url(#red-glow)"
                                                />
                                            ) : isLocked ? (
                                                /* Interlocking Yellow Route Locked Line */
                                                <line
                                                    x1={startNode.position.x}
                                                    y1={startNode.position.y}
                                                    x2={endNode.position.x}
                                                    y2={endNode.position.y}
                                                    className="vdu-track-locked"
                                                    filter="url(#cyan-glow)"
                                                />
                                            ) : null}

                                            {/* Track Circuit Name Label */}
                                            {showNames && segment.trackCircuit && (
                                                <text x={midX} y={midY - 6} className="vdu-tc-name">
                                                    {segment.trackCircuit}
                                                </text>
                                            )}
                                        </g>
                                    );
                                })}
                            </g>

                            {/* Interlocking Points (Switches) & Signals */}
                            <g id="interlocking-devices">
                                {network.nodes.map(node => {
                                    if (node.type === 'SIGNAL') {
                                        const isGreen = ((node.state || 'RED').toUpperCase() === 'GREEN');
                                        return (
                                            <g 
                                                key={node.id} 
                                                transform={`translate(${node.position.x}, ${node.position.y})`}
                                                className="vdu-signal-mast"
                                                onClick={() => onSignalClick && onSignalClick(node.id)}
                                            >
                                                {/* Mast stem */}
                                                <line x1="0" y1="0" x2="0" y2="-12" stroke="#64748b" strokeWidth="2" />
                                                {/* Aspect Head */}
                                                <circle
                                                    cx="0"
                                                    cy="-12"
                                                    r="5"
                                                    className={isGreen ? "vdu-signal-green" : "vdu-signal-red"}
                                                    filter={isGreen ? "url(#cyan-glow)" : "url(#red-glow)"}
                                                />
                                                {showNames && (
                                                    <text x="0" y="-18" className="vdu-device-id">
                                                        {node.id}
                                                    </text>
                                                )}
                                            </g>
                                        );
                                    } else if (node.type === 'SWITCH') {
                                        return (
                                            <g 
                                                key={node.id} 
                                                transform={`translate(${node.position.x}, ${node.position.y})`}
                                                className="vdu-switch-point"
                                                onClick={() => setSelectedPoint(node.id)}
                                            >
                                                {/* Point Normal/Reverse Blade */}
                                                <polygon 
                                                    points="-4,-4 0,-7 4,-4 0,7" 
                                                    className="vdu-switch-blade" 
                                                />
                                                {showNames && (
                                                    <text x="0" y="14" className="vdu-point-label">
                                                        {node.id.replace('SW-', 'P')}
                                                    </text>
                                                )}
                                            </g>
                                        );
                                    }
                                    return null;
                                })}
                            </g>

                            {/* High-Precision Streamlined Train Capsules */}
                            <g id="trains">
                                {trains && trains.filter(t => t.currentSegmentId).map(train => {
                                    const pos = calculateTrainPosition(train);
                                    if (!pos) return null;
                                    const color = getTrainColor(train.type);
                                    const isHeld = train.state === 'HOLD';
                                    const isBoarding = train.state === 'BOARDING_PASSENGERS';

                                    return (
                                        <g 
                                            key={train.id} 
                                            transform={`translate(${pos.x}, ${pos.y}) rotate(${pos.angle})`} 
                                            className="vdu-train-capsule"
                                        >
                                            {/* Forward High-Intensity Headlight Beam */}
                                            <polygon 
                                                points="22,-6 56,-16 56,16 22,6" 
                                                fill="rgba(255, 255, 255, 0.22)" 
                                                filter="url(#cyan-glow)" 
                                            />
                                            {/* Train Hull */}
                                            <rect 
                                                x="-28" 
                                                y="-9" 
                                                width="56" 
                                                height="18" 
                                                rx="9" 
                                                fill={color} 
                                                className="vdu-train-hull" 
                                            />
                                            {/* Cockpit Visor */}
                                            <rect x="16" y="-6" width="9" height="12" rx="3" fill="#020617" />
                                            {/* Train ID Tag */}
                                            <text x="-2" y="3" className="vdu-train-id-text">
                                                {train.id} {isBoarding ? '👥' : isHeld ? '⏸' : ''}
                                            </text>
                                        </g>
                                    );
                                })}
                            </g>
                                </svg>
                            </TransformComponent>
                        </>
                    )}
                </TransformWrapper>
            </div>

            {/* Authentic VDU Bottom Telemetry Bar */}
            <div className="vdu-bottom-bar">
                <div className="telemetry-block">
                    <span className="telemetry-label">UP MAIN BLOCK:</span>
                    <span className="telemetry-value-clear">LINE CLEAR</span>
                </div>
                <div className="telemetry-block">
                    <span className="telemetry-label">DN MAIN BLOCK:</span>
                    <span className="telemetry-value-tol">TRAIN ON LINE (TOL)</span>
                </div>
                <div className="telemetry-block">
                    <span className="telemetry-label">STATION CONTROLLER:</span>
                    <span className="telemetry-value-auto">AUTOMATIC AI ROUTE SETTING (OR-TOOLS)</span>
                </div>
                <div className="telemetry-block">
                    <span className="telemetry-label">ACTIVE TRAINS IN YARD:</span>
                    <span className="telemetry-value-count">{trains.filter(t => t.currentSegmentId).length}</span>
                </div>
                <div className="telemetry-block">
                    <span className="telemetry-label">SELECTED POINT:</span>
                    <span className="telemetry-value-auto">{selectedPoint || 'POINT 101 (N)'}</span>
                </div>
                <div className="telemetry-block">
                    <span className="telemetry-label">MAINTENANCE BLOCKS (BDMS):</span>
                    <span className={activeMaintenanceBlocks.length > 0 ? "telemetry-value-warn" : "telemetry-value-clear"}>
                        {activeMaintenanceBlocks.length} ACTIVE
                    </span>
                </div>
            </div>
        </div>
    );
};

export default TrackDiagram;
