// TrackDiagram.js - Ultra-Minimal High-Contrast Vector Digital Twin
import React from 'react';
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import './TrackDiagram.css';

const trainColorMap = new Map([
    ['Shatabdi', '#2563eb'],
    ['Rajdhani', '#dc2626'],
    ['Vande Bharat', '#0284c7'],
    ['Passenger', '#15803d'],
    ['DMU', '#d97706'],
    ['MEMU', '#ea580c'],
    ['SF Express', '#0d9488'],
    ['Mail', '#b45309'],
    ['Express', '#3b82f6'],
    ['Freight', '#475569']
]);

const getTrainColor = (trainType = '') => {
    return trainColorMap.get(trainType.trim()) || '#3b82f6';
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
    if (!network || !network.nodes || !network.trackSegments) return null;

    const nodesMap = new Map(network.nodes.map(node => [node.id, node]));

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    network.nodes.forEach(n => {
        if (n.position.x < minX) minX = n.position.x;
        if (n.position.x > maxX) maxX = n.position.x;
        if (n.position.y < minY) minY = n.position.y;
        if (n.position.y > maxY) maxY = n.position.y;
    });

    const viewBoxWidth = Math.max(1400, maxX - minX + 260);
    const viewBoxHeight = Math.max(450, maxY + 120);
    const originX = Math.max(0, minX - 100);

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
        <div className="track-canvas-container">
            <TransformWrapper 
                limitToBounds={false} 
                minScale={0.2} 
                maxScale={8} 
                initialScale={0.58}
                centerOnInit={true}
            >
                <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }}>
                    <svg 
                        width="100%" 
                        height="100%" 
                        viewBox={`${originX} 0 ${viewBoxWidth} ${viewBoxHeight}`} 
                        preserveAspectRatio="xMidYMid meet"
                        className="minimal-svg-canvas"
                    >
                        <defs>
                            <pattern id="maint-hazard" width="14" height="14" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
                                <line x1="0" y1="0" x2="0" y2="14" stroke="#f59e0b" strokeWidth="5" />
                                <line x1="7" y1="0" x2="7" y2="14" stroke="#18181b" strokeWidth="5" />
                            </pattern>
                        </defs>

                        {/* Minimalist Corridor Direction Labels */}
                        <g transform="translate(180, 42)">
                            <text className="corridor-direction-text" x="0" y="0">
                                WEST APPROACH (AMBALA / ROHTAK)
                            </text>
                        </g>
                        <g transform="translate(3060, 42)">
                            <text className="corridor-direction-text" x="0" y="0">
                                EAST DEPARTURE (GHAZIABAD / HOWRAH)
                            </text>
                        </g>

                        {/* Architectural Platform Island Shelters */}
                        {platforms.map(pf => {
                            const isUp = pf.direction === 'WEST';
                            return (
                                <g key={pf.number} className="platform-island-group">
                                    <rect
                                        x={pf.x_start}
                                        y={pf.y - 12}
                                        width={pf.x_end - pf.x_start}
                                        height={24}
                                        rx={4}
                                        className={isUp ? "pf-island-up" : "pf-island-dn"}
                                    />
                                    <text 
                                        x={pf.x_start + 65} 
                                        y={pf.y + 3.5} 
                                        className="pf-number-text"
                                    >
                                        {`PF ${pf.number} ${isUp ? 'UP' : 'DN'}`}
                                    </text>
                                </g>
                            );
                        })}

                        {/* Left Margin Operational Line Identifiers */}
                        {tracksMeta.map(tm => (
                            <g key={tm.index} transform={`translate(24, ${tm.y})`} className="minimal-line-label">
                                <text x="0" y="3.5" className="minimal-line-text">
                                    {tm.name}
                                </text>
                            </g>
                        ))}

                        {/* Steel Rails & Track Circuits (No blur/glow - clean vector lines) */}
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
                                        {/* Crisp Matte Base Rail */}
                                        <line
                                            x1={startNode.position.x}
                                            y1={startNode.position.y}
                                            x2={endNode.position.x}
                                            y2={endNode.position.y}
                                            className="minimal-rail-base"
                                        />

                                        {/* State Overlays */}
                                        {isBlocked ? (
                                            <>
                                                <line
                                                    x1={startNode.position.x}
                                                    y1={startNode.position.y}
                                                    x2={endNode.position.x}
                                                    y2={endNode.position.y}
                                                    className="minimal-rail-hazard"
                                                    stroke="url(#maint-hazard)"
                                                    strokeWidth="7"
                                                />
                                                <g transform={`translate(${midX}, ${midY - 12})`} className="minimal-block-badge">
                                                    <rect x="-42" y="-8" width="84" height="16" rx="3" className="block-badge-bg" />
                                                    <text x="0" y="3" className="block-badge-text">
                                                        BLOCK ACTIVE
                                                    </text>
                                                </g>
                                            </>
                                        ) : isOccupied ? (
                                            /* Solid High-Contrast Red (Occupied) */
                                            <line
                                                x1={startNode.position.x}
                                                y1={startNode.position.y}
                                                x2={endNode.position.x}
                                                y2={endNode.position.y}
                                                className="minimal-rail-occupied"
                                            />
                                        ) : isLocked ? (
                                            /* Solid Amber (Route Locked) */
                                            <line
                                                x1={startNode.position.x}
                                                y1={startNode.position.y}
                                                x2={endNode.position.x}
                                                y2={endNode.position.y}
                                                className="minimal-rail-locked"
                                            />
                                        ) : null}

                                        {showSpeeds && (
                                            <text x={midX} y={midY - 6} className="minimal-speed-text">
                                                {segment.speedLimit || 50}
                                            </text>
                                        )}
                                    </g>
                                );
                            })}
                        </g>

                        {/* Signals & Turnouts */}
                        <g id="interlocking-nodes">
                            {network.nodes.map(node => {
                                if (node.type === 'SIGNAL') {
                                    const isGreen = ((node.state || 'RED').toUpperCase() === 'GREEN');
                                    return (
                                        <g 
                                            key={node.id} 
                                            transform={`translate(${node.position.x}, ${node.position.y})`}
                                            className="minimal-signal"
                                            onClick={() => onSignalClick && onSignalClick(node.id)}
                                        >
                                            <line x1="0" y1="0" x2="0" y2="-10" stroke="#475569" strokeWidth="1.5" />
                                            <circle
                                                cx="0"
                                                cy="-10"
                                                r="4.5"
                                                className={isGreen ? "sig-dot-green" : "sig-dot-red"}
                                            />
                                            {showNames && (
                                                <text x="0" y="-16" className="sig-name-text">
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
                                            className="minimal-switch"
                                        >
                                            <polygon 
                                                points="-3.5,-3.5 0,-6 3.5,-3.5 0,6" 
                                                className="switch-blade-solid" 
                                            />
                                        </g>
                                    );
                                }
                                return null;
                            })}
                        </g>

                        {/* Streamlined Minimal Train Bodies */}
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
                                        className="minimal-train"
                                    >
                                        {/* Crisp Directional Light Beam */}
                                        <polygon 
                                            points="18,-4 45,-12 45,12 18,4" 
                                            fill="rgba(255, 255, 255, 0.12)" 
                                        />
                                        {/* Solid Train Capsule */}
                                        <rect 
                                            x="-24" 
                                            y="-8" 
                                            width="48" 
                                            height="16" 
                                            rx="8" 
                                            fill={color} 
                                            className="train-capsule-body" 
                                        />
                                        {/* Cockpit Window */}
                                        <rect x="12" y="-5" width="8" height="10" rx="3" fill="#0f172a" />
                                        {/* Train ID */}
                                        <text x="-2" y="3" className="train-label-text">
                                            {train.id}{isBoarding ? ' [PAX]' : isHeld ? ' [HOLD]' : ''}
                                        </text>
                                    </g>
                                );
                            })}
                        </g>
                    </svg>
                </TransformComponent>
            </TransformWrapper>
        </div>
    );
};

export default TrackDiagram;
