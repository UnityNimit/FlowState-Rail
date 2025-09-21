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
                        /* Tracks */
                        .track {
                            stroke: #6b7280;
                            stroke-width: 3.5; /* Slightly thicker */
                            fill: none;
                            stroke-linecap: round; /* Smoother ends */
                            stroke-linejoin: round; /* Smoother joins */
                            transition: stroke 0.3s ease-in-out, stroke-width 0.3s ease-in-out;
                        }
                        .track-occupied {
                            stroke: var(--status-red); /* #f87171 */
                            stroke-width: 5; /* Thicker when occupied */
                            filter: drop-shadow(0 0 3px rgba(248, 113, 113, 0.7)); /* Subtle glow */
                        }
                        .track-route-locked {
                            stroke: var(--accent-cyan); /* #22d3ee */
                            stroke-width: 4.5;
                            filter: drop-shadow(0 0 2px rgba(34, 211, 238, 0.5)); /* Subtle glow */
                        }
                        .track-faulty {
                            stroke: #ff5252;
                            stroke-dasharray: 8, 8; /* Slightly longer dashes */
                            animation: faulty-blink 1.2s infinite ease-in-out; /* Slower, smoother blink */
                            filter: drop-shadow(0 0 4px rgba(255, 82, 82, 0.8)); /* Stronger red glow */
                        }

                        /* Signals */
                        .signal {
                            stroke: #d1d5db;
                            stroke-width: 1.5; /* Slightly thicker border */
                            transition: fill 0.3s ease-in-out, stroke-width 0.3s ease-in-out, transform 0.1s ease-out; /* Added transform */
                            transform-origin: center center; /* Ensure scaling from center */
                            filter: drop-shadow(0 0 1px rgba(0,0,0,0.3)); /* Subtle shadow for signals */
                        }
                        .signal-red {
                            fill: #f87171; /* Original red */
                            filter: drop-shadow(0 0 4px rgba(248, 113, 113, 0.8)); /* Stronger glow for red */
                        }
                        .signal-green {
                            fill: #4ade80; /* Original green */
                            filter: drop-shadow(0 0 4px rgba(74, 222, 128, 0.8)); /* Stronger glow for green */
                        }

                        /* Points */
                        .point {
                            fill: var(--accent-yellow); /* #fcd34d */
                            stroke: #a16207; /* Darker yellow border */
                            stroke-width: 1;
                            transition: fill 0.3s ease-in-out, transform 0.2s ease-out;
                            transform-origin: center center; /* For smooth transform */
                        }
                        .point-locked {
                            fill: var(--accent-orange); /* #fb923c */
                            stroke: #c2410c; /* Darker orange border */
                            transform: scale(1.1); /* Slightly larger when locked */
                            filter: drop-shadow(0 0 3px rgba(251, 146, 60, 0.6)); /* Subtle orange glow */
                        }
                        
                        /* Labels */
                        .label {
                            fill: #cbd5e1; /* Lighter text for better contrast */
                            font-size: 11px; /* Slightly larger */
                            font-family: var(--font-main); /* Using CSS variable */
                            text-anchor: middle;
                            text-shadow: 1px 1px 2px rgba(0,0,0,0.7); /* Text shadow for readability */
                            transition: fill 0.3s ease, font-size 0.1s ease; /* Transition for label hover */
                        }
                        
                        /* Speed Labels */
                        .speed-label {
                            fill: #94a3b8; /* Softer gray */
                            font-size: 10px; /* Slightly larger */
                            font-family: var(--font-main); /* Using CSS variable */
                            text-anchor: middle;
                            pointer-events: none;
                            transition: fill 0.3s ease, font-weight 0.3s ease;
                            text-shadow: 0.5px 0.5px 1px rgba(0,0,0,0.6);
                        }
                        .speed-label-restricted {
                            fill: var(--accent-yellow); /* #fcd34d */
                            font-weight: bold;
                            font-size: 11px; /* Even larger when restricted */
                            text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
                        }
                    `}
                </style>
            </defs>

            <g id="track-segments">
                {network.trackSegments.map(segment => {
                    const startNode = nodesMap.get(segment.startNodeId);
                    const endNode = nodesMap.get(segment.endNodeId);
                    if (!startNode || !endNode) return null;
                    
                    let statusClass = '';
                    if (segment.isOccupied) {
                        statusClass = 'track-occupied';
                    } else {
                        const route = network.routes.find(r => r.isLockedByTrainId && r.trackSegments.includes(segment.id));
                        if (route) {
                            statusClass = 'track-route-locked';
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