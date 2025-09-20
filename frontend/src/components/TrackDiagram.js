import React from 'react';
import './TrackDiagram.css'; // Ensure this CSS file is imported

const getSignalClassName = (state) => {
    return state === 'GREEN' ? 'signal-green' : 'signal-red';
};

const TrackDiagram = ({ network, trains, onSignalClick }) => {
    if (!network) return null;

    const nodesMap = new Map(network.nodes.map(node => [node.id, node]));

    const calculateTrainPosition = (train) => {
        if (!train.currentSegmentId) return null;
        const segment = network.trackSegments.find(s => s.id === train.currentSegmentId);
        if (!segment) return null;
        const startNode = nodesMap.get(segment.startNodeId);
        const endNode = nodesMap.get(segment.endNodeId);
        if (!startNode || !endNode) return null;
        const x = startNode.position.x + (endNode.position.x - startNode.position.x) * train.positionOnSegment;
        const y = startNode.position.y + (endNode.position.y - startNode.position.y) * train.positionOnSegment;
        return { x, y };
    };

    return (
        <svg width="100%" height="100%" viewBox="0 0 1200 400">
            <defs>
                <style>
                    {`
                        .track { stroke: #6b7280; stroke-width: 2.5; fill: none; transition: stroke 0.3s; }
                        .track-occupied { stroke: var(--status-red); stroke-width: 4; }
                        .track-route-locked { stroke: var(--accent-cyan); stroke-width: 4; }
                        .track-faulty { stroke: #ff5252; stroke-dasharray: 5, 5; animation: faulty-blink 1s infinite; }

                        .signal { stroke: #d1d5db; stroke-width: 1; transition: fill 0.3s; }
                        .signal-red { fill: #f87171; }
                        .signal-green { fill: #4ade80; }

                        .point { fill: var(--accent-yellow); transition: fill 0.3s; }
                        .point-locked { fill: var(--accent-orange); }
                        
                        .label { fill: #a1a5ab; font-size: 10px; font-family: var(--font-main); text-anchor: middle; }
                        
                        .speed-label { fill: #828a99; font-size: 9px; font-family: var(--font-main); text-anchor: middle; pointer-events: none; }
                        .speed-label-restricted { fill: var(--accent-yellow); font-weight: bold; }
                    `}
                </style>
            </defs>

            <g id="track-segments">
                {network.trackSegments.map(segment => {
                    const startNode = nodesMap.get(segment.startNodeId);
                    const endNode = nodesMap.get(segment.endNodeId);
                    if (!startNode || !endNode) return null;
                    
                    // ==================================================================
                    // FIX: Changed the logic to give priority to 'occupied'.
                    // This 'if/else if' structure ensures only one special state is shown.
                    // ==================================================================
                    let statusClass = '';
                    if (segment.isOccupied) {
                        statusClass = 'track-occupied'; // Priority 1: Red
                    } else {
                        const route = network.routes.find(r => r.isLockedByTrainId && r.trackSegments.includes(segment.id));
                        if (route) {
                            statusClass = 'track-route-locked'; // Priority 2: Cyan
                        }
                    }

                    const classNames = `track 
                        ${statusClass}
                        ${segment.status === 'FAULTY' ? 'track-faulty' : ''}`;
                    
                    return <line key={segment.id} x1={startNode.position.x} y1={startNode.position.y} x2={endNode.position.x} y2={endNode.position.y} className={classNames} />;
                })}
            </g>

            <g id="speed-labels">
                {network.trackSegments.map(segment => {
                    const startNode = nodesMap.get(segment.startNodeId);
                    const endNode = nodesMap.get(segment.endNodeId);
                    if (!startNode || !endNode) return null;

                    const midX = (startNode.position.x + endNode.position.x) / 2;
                    const midY = (startNode.position.y + endNode.position.y) / 2;
                    
                    const isRestricted = segment.tempSpeedRestriction !== null;
                    const speed = isRestricted ? segment.tempSpeedRestriction : segment.maxSpeed;
                    const speedLabelClass = `speed-label ${isRestricted ? 'speed-label-restricted' : ''}`;

                    return (
                        <text key={`speed-${segment.id}`} x={midX} y={midY - 5} className={speedLabelClass}>
                            {speed}
                        </text>
                    );
                })}
            </g>

            <g id="nodes">
                {network.nodes.map(node => {
                    if (node.type === 'SIGNAL') {
                        return (
                            <g key={node.id} onClick={() => onSignalClick(node.id)} className="signal-group">
                                <circle cx={node.position.x} cy={node.position.y} r="6" className={`signal ${getSignalClassName(node.state)}`} />
                                {node.isManuallyOverridden && <circle cx={node.position.x} cy={node.position.y} r="10" className="manual-override-indicator" />}
                                <text x={node.position.x} y={node.position.y + 18} className="label">{node.id}</text>
                            </g>
                        );
                    }
                    if (node.type === 'POINT_SWITCH') {
                         return (
                             <g key={node.id}>
                                <rect x={node.position.x - 5} y={node.position.y - 5} width="10" height="10" className={`point ${node.isLocked ? 'point-locked' : ''}`} />
                                <text x={node.position.x} y={node.position.y - 10} className="label">{node.id}</text>
                            </g>
                        )
                    }
                    return null;
                })}
            </g>
            
            <g id="trains">
                 {trains.filter(t => t.state !== 'STOPPED').map(train => {
                    const pos = calculateTrainPosition(train);
                    if (!pos) return null;

                    return (
                        <g key={train.id} className="train-group" transform={`translate(${pos.x}, ${pos.y})`}>
                            <rect className={`train-body train-type-${train.type.toLowerCase()}`} x="-20" y="-6" width="40" height="12" />
                            <text className="train-label">{train.id.split('-')[0]} {train.state === 'WAITING_SIGNAL' ? '🛑' : ''}</text>
                        </g>
                    );
                })}
            </g>
        </svg>
    );
};

export default TrackDiagram;