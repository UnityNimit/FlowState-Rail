// TrackDiagram.js (fixed)
import React from 'react';
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import './TrackDiagram.css';

const priorityOrder = [
    'Shatabdi', 'Rajdhani', 'Passenger', 'DMU', 'MEMU',
    'SF Express', 'Mail', 'Express'
];
const startColor = { r: 241, g: 196, b: 15 };
const endColor = { r: 231, g: 76, b: 60 };

const getTrainColor = (trainType = '') => {
    const priorityIndex = priorityOrder.findIndex(p => trainType.trim() === p.trim());
    if (priorityIndex === -1) return '#95a5a6';
    const factor = priorityIndex / (priorityOrder.length - 1);
    const r = Math.round(startColor.r + (endColor.r - startColor.r) * factor);
    const g = Math.round(startColor.g + (endColor.g - startColor.g) * factor);
    const b = Math.round(startColor.b + (endColor.b - startColor.b) * factor);
    return `rgb(${r}, ${g}, ${b})`;
};

const TrackDiagram = ({ network, trains, onSignalClick, onTrackClick, showNames = true, showSpeeds = false }) => {
    if (!network) return null;

    const nodesMap = new Map(network.nodes.map(node => [node.id, node]));

    const lockedSegmentIds = new Set();
    if (trains) {
        trains.forEach(train => {
            if (train.route) train.route.forEach(id => lockedSegmentIds.add(id));
        });
    }

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

        const x = startNode.position.x + (endNode.position.x - startNode.position.x) * train.positionOnSegment;
        const y = startNode.position.y + (endNode.position.y - startNode.position.y) * train.positionOnSegment;
        return { x, y };
    };

    return (
        <TransformWrapper limitToBounds={false} minScale={0.2} maxScale={15}>
            <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }}>
                <svg width="1200" height="400" viewBox="0 0 1200 400" preserveAspectRatio="xMidYMid meet">
                    <defs>
                        <style>{`
                            .track { stroke: #6b7280; stroke-width: 3; fill: none; transition: stroke 0.3s; cursor: pointer; }
                            .track-occupied { stroke: var(--status-red); stroke-width: 4.5; }
                            .track-route-locked { stroke: var(--accent-cyan); stroke-width: 4; }
                            .track-faulty { stroke: var(--status-red); stroke-width: 3; stroke-dasharray: 8 4; }
                            .track-weather-bad { stroke: #1f2937; stroke-width: 4; stroke-opacity: 0.85; }
                            .signal { stroke: #d1d5db; stroke-width: 1.5; cursor: pointer; }
                            .signal-red { fill: #f87171; }
                            .signal-green { fill: #4ade80; }
                            .point { fill: var(--accent-yellow); }
                            .label { fill: #cbd5e1; font-size: 11px; text-anchor: middle; pointer-events: none; }
                            .train-body { stroke: black; stroke-width: 1; rx: 3px; }
                            .train-label { text-anchor: middle; dominant-baseline: middle; fill: white; font-size: 9px; font-weight: bold; pointer-events: none; }
                            .speed-label { font-size: 9px; fill: #e5e7eb; pointer-events: none; }
                        `}</style>
                    </defs>

                    <g id="track-segments">
                        {network.trackSegments.map(segment => {
                            const startNode = nodesMap.get(segment.startNodeId);
                            const endNode = nodesMap.get(segment.endNodeId);
                            if (!startNode || !endNode) return null;

                            let classNames = 'track';
                            if (segment.status === 'FAULTY') {
                                classNames += ' track-faulty';
                            } else if (segment.weather === 'BAD') {
                                classNames += ' track-weather-bad';
                            } else if (segment.isOccupied) {
                                classNames += ' track-occupied';
                            } else if (lockedSegmentIds.has(segment.id)) {
                                classNames += ' track-route-locked';
                            }

                            const midX = (startNode.position.x + endNode.position.x) / 2;
                            const midY = (startNode.position.y + endNode.position.y) / 2;
                            const speedText = `Max: 60 km/h`;

                            return (
                                <g key={segment.id}>
                                    <line
                                        x1={startNode.position.x}
                                        y1={startNode.position.y}
                                        x2={endNode.position.x}
                                        y2={endNode.position.y}
                                        className={classNames}
                                        onClick={() => onTrackClick && onTrackClick(segment.id)}
                                        title={`${segment.id}`}
                                    />
                                    {showSpeeds && <text x={midX} y={midY - 8} className="speed-label">{speedText}</text>}
                                </g>
                            );
                        })}
                    </g>

                    <g id="nodes">
                        {network.nodes.map(node => (
                            <g key={node.id}>
                                {node.type === 'SIGNAL' &&
                                    <circle
                                        cx={node.position.x}
                                        cy={node.position.y}
                                        r="6"
                                        className={`signal ${((node.state||'RED').toUpperCase()==='GREEN') ? 'signal-green' : 'signal-red'}`}
                                        onClick={() => onSignalClick && onSignalClick(node.id)}
                                        title={`${node.id} (${(node.state||'RED')})`}
                                    />
                                }
                                {node.type === 'SWITCH' && <rect x={node.position.x - 5} y={node.position.y - 5} width="10" height="10" className="point" />}
                                {showNames && <text x={node.position.x} y={node.position.y > 200 ? node.position.y + 20 : node.position.y - 10} className="label">{node.id}</text>}
                            </g>
                        ))}
                    </g>

                    <g id="trains">
                         {trains && trains.filter(t => t.currentSegmentId).map(train => {
                            const pos = calculateTrainPosition(train);
                            if (!pos) return null;
                            const statusSymbol = train.state === 'HOLD' ? '⏸️' : '';
                            return (
                                // IMPORTANT: use SVG transform attribute (not style.transform) to avoid jitter with zoom/pan
                                <g key={train.id} transform={`translate(${pos.x}, ${pos.y})`} className="train-group">
                                    <rect className="train-body" fill={getTrainColor(train.type)} x="-20" y="-6" width="40" height="12" rx="3" />
                                    <text className="train-label" x="0" y="0">{train.id} {statusSymbol}</text>
                                </g>
                            );
                        })}
                    </g>
                </svg>
            </TransformComponent>
        </TransformWrapper>
    );
};

export default TrackDiagram;
