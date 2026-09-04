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
    activeMaintenanceBlocks = [],
    onStationSelect
}) => {
    const [errTimer, setErrTimer] = useState(120);
    const [selectedPoint, setSelectedPoint] = useState(null);
    const [clock, setClock] = useState(() => new Date());
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [viewScale, setViewScale] = useState(1);
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
            const route = train.route || [];
            const routeIndex = route.indexOf(train.currentSegmentId);
            if (routeIndex < 0) return;

            // Show the occupied circuit and one protecting circuit only.  The
            // old full-route paint made every future crossover look locked and
            // hid what the interlocking was actually doing at this instant.
            lockedSegmentIds.add(route[routeIndex]);
            if (['RUNNING', 'STOPPED_AWAITING_CLEARANCE'].includes(train.state) && route[routeIndex + 1]) {
                lockedSegmentIds.add(route[routeIndex + 1]);
            }
        });
    }

    const blockedSet = new Set(activeMaintenanceBlocks);
    const activeCrossoverSegments = new Set();
    const junctionActivity = new Map();
    (trains || []).forEach(train => {
        const route = train.route || [];
        const routeIndex = route.indexOf(train.currentSegmentId);
        const crossoverSegments = routeIndex >= 0 && ['RUNNING', 'STOPPED_AWAITING_CLEARANCE'].includes(train.state)
            ? route.slice(routeIndex, routeIndex + 2).filter(segmentId => segmentId.includes('-XO-'))
            : [];
        crossoverSegments.forEach(segmentId => {
            activeCrossoverSegments.add(segmentId);
            const match = segmentId.match(/^COR-XO-([A-Z]+)-(EAST|WEST)-/);
            if (!match) return;
            const key = `${match[1]}-${match[2]}`;
            const entry = junctionActivity.get(key) || { station: match[1], direction: match[2], trains: new Set(), held: 0 };
            entry.trains.add(train.id);
            if (train.state === 'HOLD') entry.held += 1;
            junctionActivity.set(key, entry);
        });
    });
    const activeJunctions = [...junctionActivity.values()]
        .map(activity => ({ ...activity, trains: [...activity.trains] }))
        .slice(0, 4);

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
        // The capsule is horizontally symmetric, so keep its visual heading in
        // the -90..90 range. Route segments may reverse their stored node order
        // at a crossover; using the raw 180/-180 angle makes SVG interpolation
        // appear as a full spin even though the train only changed track.
        let angle = Math.atan2(endNode.position.y - startNode.position.y, endNode.position.x - startNode.position.x) * (180 / Math.PI);
        if (angle > 90) angle -= 180;
        if (angle < -90) angle += 180;
        return { x, y, angle };
    };

    const stationMeta = network.station || null;
    const corridorMeta = network.corridor || null;
    const metadata = network.metadata || {};
    const platforms = stationMeta?.platforms || [];
    const tracksMeta = stationMeta?.tracksMeta || (corridorMeta?.lines || []).map((line, index) => ({ index: line.id, name: `${line.name} · ${line.direction}`, y: [135, 205, 295, 365][index] }));
    const semanticLabels = showNames || viewScale >= 1.45;
    const titleSuffix = stationMeta ? `${stationMeta.platformCount}-PLATFORM ${stationMeta.kind.replaceAll('-', ' ').toUpperCase()}` : 'FOUR-LINE CORRIDOR OVERVIEW';
    const westConnection = stationMeta?.westConnection || corridorMeta?.westConnection || 'WESTERN APPROACH';
    const eastConnection = stationMeta?.eastConnection || corridorMeta?.eastConnection || 'EASTERN APPROACH';
    const opState = network.operationalState || {};
    const maintenanceCount = opState.activeMaintenanceZones?.length || activeMaintenanceBlocks.length;
    const activeConflicts = opState.activeConflicts || [];
    const activeConflictsCount = activeConflicts.length || trains.filter(t => t.state === 'HOLD').length;
    // Derive the footer from the same current/next-segment window as the
    // junction panel.  Older backend snapshots may describe a whole planned
    // crossover route as active; the VDU must report only live point moves.
    const activeCrossoversCount = activeJunctions.length;

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
                    <div className="title-hindi">उत्तर रेलवे · {metadata.hindiName || metadata.name}</div>
                    <div className="title-main">{(metadata.name || 'RAILWAY NETWORK').toUpperCase()} · {titleSuffix}</div>
                    <div className="title-sub">SCHEMA v{network.schemaVersion || 2} · MULTI-TRACK INTERLOCKING & DYNAMIC CP-SAT OPTIMIZER</div>
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
                <button className={`vdu-btn ${maintenanceCount > 0 ? 'btn-bdms-active' : 'btn-bdms-idle'}`}>
                    BDMS: {maintenanceCount > 0 ? `${maintenanceCount} ACTIVE BLOCK${maintenanceCount > 1 ? 'S' : ''}` : 'NO ACTIVE BLOCK'}
                </button>
            </div>

            {/* CTC Interactive Vector Canvas */}
            <div className="track-diagram-wrapper">
                {activeJunctions.length > 0 && (
                    <div className="junction-activity-overlay" aria-live="polite">
                        <div className="junction-activity-title">🔀 ACTIVE JUNCTION ROUTES</div>
                        {activeJunctions.map(activity => (
                            <div key={`${activity.station}-${activity.direction}`} className="junction-activity-row">
                                <strong>{activity.station} · {activity.direction === 'EAST' ? 'UP' : 'DOWN'}</strong>
                                <span>P-REV · T{activity.trains.slice(0, 2).join(', T')}</span>
                                {activity.held > 0 && <em>{activity.held} queued</em>}
                            </div>
                        ))}
                    </div>
                )}
                <TransformWrapper
                    limitToBounds={false}
                    minScale={0.35}
                    maxScale={10}
                    initialScale={1}
                    centerOnInit={true}
                    wheel={{ step: 0.08 }}
                    doubleClick={{ disabled: true }}
                    onTransformed={(ref, state) => setViewScale(state?.scale || ref?.state?.scale || 1)}
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
                                <span><i className="legend-line crossover-locked" />Crossover Diverge [REV]</span>
                                <span><i className="legend-line occupied" />Occupied</span>
                                <span><i className="legend-line blocked" />Maintenance</span>
                                <span><i className="legend-line failure" />Equipment failure</span>
                                <span><i className="signal-aspect-icon proceed" />Proceed</span>
                                <span><i className="signal-aspect-icon stop" />Stop</span>
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
                                <filter id="amber-glow" x="-25%" y="-25%" width="150%" height="150%">
                                    <feGaussianBlur stdDeviation="3.5" result="blur" />
                                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                                </filter>
                            </defs>

                            {corridorMeta?.infrastructure?.map(item => (
                                <g key={item.id} className={`corridor-infrastructure ${item.type}`}>
                                    <rect x={item.x - item.width / 2} y="92" width={item.width} height="325" rx="6" />
                                    <text x={item.x} y="108">{item.name}</text>
                                </g>
                            ))}

                            {corridorMeta?.stations?.map(station => (
                                <g
                                    key={station.code}
                                    transform={`translate(${station.x}, 72)`}
                                    className="corridor-station-boundary"
                                    onClick={() => onStationSelect && onStationSelect(station.code)}
                                    role="button"
                                    tabIndex="0"
                                    aria-label={`Open ${station.name || station.code} schematic`}
                                    onKeyDown={(event) => event.key === 'Enter' && onStationSelect && onStationSelect(station.code)}
                                >
                                    <line x1="0" y1="18" x2="0" y2="330" />
                                    <rect x="-65" y="-18" width="130" height="34" rx="5" />
                                    <text x="0" y="-2">{station.code}</text>
                                    <text x="0" y="11" className="corridor-chainage">KM {station.chainageKm.toFixed(1)}</text>
                                </g>
                            ))}

                            {/* Section Corridor Markers */}
                            <g transform="translate(180, 42)">
                                <rect x="-10" y="-12" width="310" height="24" rx="4" className="vdu-corridor-plate-bg" />
                                <text className="vdu-corridor-plate-text" x="145" y="4">
                                    ⬅ WEST · {westConnection}
                                </text>
                            </g>
                            <g transform="translate(3050, 42)">
                                <rect x="-10" y="-12" width="320" height="24" rx="4" className="vdu-corridor-plate-bg" />
                                <text className="vdu-corridor-plate-text" x="150" y="4">
                                    {eastConnection} · EAST ➡
                                </text>
                            </g>

                            {/* Passenger Platforms 1 to 16 (Authentic IR VDU Platform Bays) */}
                            {platforms.map(pf => {
                                const isUp = pf.direction === 'EAST';
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

                            {/* Track Circuits (Clean Steel Lines / Route Yellow / Amber Crossover / Solid Red Occupied) */}
                            <g id="track-segments">
                                {network.trackSegments.map(segment => {
                                    const startNode = nodesMap.get(segment.startNodeId);
                                    const endNode = nodesMap.get(segment.endNodeId);
                                    if (!startNode || !endNode) return null;

                                    const isFailure = segment.status === 'FAULTY' || segment.status === 'FAILURE';
                                    const isMaintenance = segment.status === 'MAINTENANCE' || blockedSet.has(segment.id);
                                    const isLocked = lockedSegmentIds.has(segment.id);
                                    const isOccupied = segment.isOccupied;
                                    const isCrossover = segment.lineId === 'CROSSOVER' || segment.id.includes('-XO-');
                                    const isActiveCrossover = isCrossover && activeCrossoverSegments.has(segment.id);

                                    const midX = (startNode.position.x + endNode.position.x) / 2;
                                    const midY = (startNode.position.y + endNode.position.y) / 2;

                                    return (
                                        <g 
                                            key={segment.id} 
                                            className={`segment-group ${isCrossover ? 'crossover-segment' : ''} ${isActiveCrossover ? 'active-crossover-segment' : ''}`}
                                            onClick={() => onTrackClick && onTrackClick(segment.id)}
                                            role="button"
                                            tabIndex="0"
                                            aria-label={`Track asset ${segment.id}`}
                                            onKeyDown={(event) => event.key === 'Enter' && onTrackClick && onTrackClick(segment.id)}
                                        >
                                            {/* Base Crisp White/Grey Track Circuit Line */}
                                            <line
                                                x1={startNode.position.x}
                                                y1={startNode.position.y}
                                                x2={endNode.position.x}
                                                y2={endNode.position.y}
                                                className={`vdu-track-base ${isCrossover ? 'crossover-base' : ''}`}
                                            />

                                            {/* Dynamic VDU State Rendering */}
                                            {isMaintenance ? (
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
                                            ) : isFailure ? (
                                                <line
                                                    x1={startNode.position.x}
                                                    y1={startNode.position.y}
                                                    x2={endNode.position.x}
                                                    y2={endNode.position.y}
                                                    className="vdu-track-failure"
                                                />
                                            ) : isOccupied ? (
                                                /* SOLID GLOWING RED (Crossover or Standard) */
                                                isCrossover ? (
                                                    <line
                                                        x1={startNode.position.x}
                                                        y1={startNode.position.y}
                                                        x2={endNode.position.x}
                                                        y2={endNode.position.y}
                                                        className="vdu-track-crossover-occupied"
                                                        filter="url(#red-glow)"
                                                    />
                                                ) : (
                                                    <line
                                                        x1={startNode.position.x}
                                                        y1={startNode.position.y}
                                                        x2={endNode.position.x}
                                                        y2={endNode.position.y}
                                                        className="vdu-track-occupied"
                                                        filter="url(#red-glow)"
                                                    />
                                                )
                                            ) : isLocked ? (
                                                /* Crossover Amber Dash Flow or Main Yellow Route Locked */
                                                isCrossover ? (
                                                    <>
                                                        <line
                                                            x1={startNode.position.x}
                                                            y1={startNode.position.y}
                                                            x2={endNode.position.x}
                                                            y2={endNode.position.y}
                                                            className="vdu-track-crossover-locked"
                                                            filter="url(#amber-glow)"
                                                        />
                                                        <g transform={`translate(${midX}, ${midY - 14})`} className="vdu-crossover-badge">
                                                            <rect x="-42" y="-7" width="84" height="15" rx="3" className="vdu-crossover-badge-bg" />
                                                            <text x="0" y="3.5" className="vdu-crossover-badge-text">🔀 XO ACTIVE [REV]</text>
                                                        </g>
                                                    </>
                                                ) : (
                                                    <line
                                                        x1={startNode.position.x}
                                                        y1={startNode.position.y}
                                                        x2={endNode.position.x}
                                                        y2={endNode.position.y}
                                                        className="vdu-track-locked"
                                                        filter="url(#cyan-glow)"
                                                    />
                                                )
                                            ) : null}

                                            {/* Track Circuit Name Label */}
                                            {semanticLabels && segment.trackCircuit && (
                                                <text x={midX} y={midY - 6} className="vdu-tc-name">
                                                    {segment.trackCircuit}
                                                </text>
                                            )}
                                            {(showSpeeds || viewScale >= 2.1) && (
                                                <text x={midX} y={midY + 14} className="vdu-speed-label">
                                                    {segment.permissibleSpeedKph || segment.maxSpeed} km/h
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
                                        const isEast = node.direction !== 'WEST';
                                        return (
                                            <g 
                                                key={node.id} 
                                                transform={`translate(${node.position.x}, ${node.position.y})`}
                                                className="vdu-signal-mast"
                                                onClick={() => onSignalClick && onSignalClick(node.id)}
                                                role="button"
                                                tabIndex="0"
                                                aria-label={`${node.label || node.id}: ${isGreen ? 'green proceed' : 'red stop'}`}
                                                onKeyDown={(event) => event.key === 'Enter' && onSignalClick && onSignalClick(node.id)}
                                            >
                                                <line className="signal-mast-stem" x1="0" y1="0" x2="0" y2="-8" />
                                                <line className="signal-mast-foot" x1="-5" y1="0" x2="5" y2="0" />
                                                <rect className="signal-head" x="-7" y="-34" width="14" height="27" rx="6" />
                                                <circle cx="0" cy="-27" r="4" className={`signal-lamp red ${!isGreen ? 'active' : 'dim'}`} filter={!isGreen ? "url(#red-glow)" : undefined} />
                                                <circle cx="0" cy="-15" r="4" className={`signal-lamp green ${isGreen ? 'active' : 'dim'}`} filter={isGreen ? "url(#cyan-glow)" : undefined} />
                                                <polygon className={`signal-direction ${isGreen ? 'proceed' : 'stop'}`} points={isEast ? "8,-19 14,-15 8,-11" : "-8,-19 -14,-15 -8,-11"} />
                                                {semanticLabels && (
                                                    <text x="0" y="-39" className="vdu-device-id">
                                                        {node.label || node.id}
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
                                                {semanticLabels && (
                                                    <text x="0" y="14" className="vdu-point-label">
                                                        {node.id.replace('SW-', 'P')}
                                                    </text>
                                                )}
                                            </g>
                                        );
                                    } else if (node.type === 'BUFFER_STOP') {
                                        return <g key={node.id} transform={`translate(${node.position.x}, ${node.position.y})`} className="vdu-buffer-stop"><line x1="0" y1="-8" x2="0" y2="8" /><line x1="-5" y1="-8" x2="5" y2="-8" /></g>;
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
                                    const conflict = train.conflictInfo || {};

                                    return (
                                        <g 
                                            key={train.id} 
                                            transform={`translate(${pos.x}, ${pos.y}) rotate(${pos.angle})`} 
                                            className={`vdu-train-capsule ${isHeld ? 'held-capsule' : ''}`}
                                        >
                                            {/* Forward High-Intensity Headlight Beam */}
                                            {!isHeld && (
                                                <polygon
                                                    points="22,-6 56,-16 56,16 22,6"
                                                    fill="rgba(255, 255, 255, 0.22)"
                                                    filter="url(#cyan-glow)"
                                                />
                                            )}
                                            {/* Held Pulsing Aura */}
                                            {isHeld && (
                                                <rect
                                                    x="-34"
                                                    y="-13"
                                                    width="68"
                                                    height="26"
                                                    rx="13"
                                                    className="vdu-train-hold-halo"
                                                />
                                            )}
                                            {/* Train Hull */}
                                            <rect
                                                x="-28" 
                                                y="-9" 
                                                width="56" 
                                                height="18" 
                                                rx="9" 
                                                fill={color} 
                                                className={`vdu-train-hull ${isHeld ? 'vdu-train-hull-held' : ''}`}
                                            />
                                            {/* Cockpit Visor */}
                                            <rect x="16" y="-6" width="9" height="12" rx="3" fill="#020617" />
                                            {/* Train ID Tag */}
                                            <text x="-2" y="3" className="vdu-train-id-text">
                                                {train.id} {isBoarding ? '👥' : isHeld ? '⏸' : ''}
                                            </text>
                                            {/* Upright Informative Callout above Held Train */}
                                            {isHeld && (
                                                <g transform={`translate(0, -22) rotate(${-pos.angle})`} className="vdu-train-conflict-callout">
                                                    <rect x="-65" y="-9" width="130" height="18" rx="4" className="callout-bg" />
                                                    <text x="0" y="3.5" className="callout-text">
                                                        {conflict.conflictingTrainId
                                                            ? `⚡ YIELD T-${conflict.conflictingTrainId} (P${conflict.conflictingTrainPriority || '?'})`
                                                            : '⚡ QUEUED: SAFE HEADWAY'}
                                                    </text>
                                                </g>
                                            )}
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
                <div className="telemetry-block attribution-block" title={metadata.disclaimer}>
                    <span className="telemetry-label">MAP SOURCE:</span>
                    <a href={metadata.licenseUrl || 'https://www.openstreetmap.org/copyright'} target="_blank" rel="noreferrer">{metadata.attribution || '© OpenStreetMap contributors'}</a>
                    <span> · snapshot {metadata.snapshotDate || 'offline'} · representative operations</span>
                </div>
                <div className="telemetry-block">
                    <span className="telemetry-label">DN MAIN BLOCK:</span>
                    <span className="telemetry-value-tol">TRAIN ON LINE (TOL)</span>
                </div>
                <div className="telemetry-block">
                    <span className="telemetry-label">JUNCTION CONTENTION:</span>
                    <span className={activeConflictsCount > 0 ? "telemetry-value-warn" : "telemetry-value-clear"}>
                        {activeConflictsCount > 0 ? `${activeConflictsCount} QUEUED (OR-TOOLS)` : '0 CONTENTION'} · 0 UNSAFE
                    </span>
                </div>
                <div className="telemetry-block">
                    <span className="telemetry-label">CROSSOVERS:</span>
                    <span className={activeCrossoversCount > 0 ? "telemetry-value-auto" : "telemetry-value-clear"}>
                        {activeCrossoversCount > 0 ? `${activeCrossoversCount} ACTIVE (P-REV)` : 'NORMAL'}
                    </span>
                </div>
                <div className="telemetry-block">
                    <span className="telemetry-label">ACTIVE IN YARD:</span>
                    <span className="telemetry-value-count">{trains.filter(t => t.currentSegmentId).length}</span>
                </div>
                <div className="telemetry-block">
                    <span className="telemetry-label">SELECTED POINT:</span>
                    <span className="telemetry-value-auto">{selectedPoint || 'POINT 101 (N)'}</span>
                </div>
                <div className="telemetry-block">
                    <span className="telemetry-label">MAINTENANCE (BDMS):</span>
                    <span className={maintenanceCount > 0 ? "telemetry-value-warn" : "telemetry-value-clear"}>
                        {maintenanceCount} ACTIVE
                    </span>
                </div>
            </div>
        </div>
    );
};

export default TrackDiagram;
