import React from 'react';
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import './TrackDiagram.css';

// NEW: Advanced function to generate a color from a yellow-to-red gradient
// based on the train's priority.
const priorityOrder = [
    'Shatabdi', 'Rajdhani', 'Passenger', 'DMU', 'MEMU', 
    'SF Express', 'Mail', 'Express'
];
const startColor = { r: 241, g: 196, b: 15 }; // Yellow for highest priority
const endColor = { r: 231, g: 76, b: 60 };   // Red for lowest priority

const getTrainColor = (trainType = '') => {
    // Find the exact index of the train type in the priority list.
    const priorityIndex = priorityOrder.findIndex(p => trainType.trim() === p.trim());

    // If the train type is not in our priority list, return a default gray color.
    if (priorityIndex === -1) {
        return '#95a5a6'; 
    }

    // Calculate the interpolation factor (0.0 for highest priority, 1.0 for lowest)
    const factor = priorityIndex / (priorityOrder.length - 1);

    // Linearly interpolate each color channel (Red, Green, Blue)
    const r = Math.round(startColor.r + (endColor.r - startColor.r) * factor);
    const g = Math.round(startColor.g + (endColor.g - startColor.g) * factor);
    const b = Math.round(startColor.b + (endColor.b - startColor.b) * factor);

    return `rgb(${r}, ${g}, ${b})`;
};


const TrackDiagram = ({ network, trains }) => {
    if (!network) return null;

    const nodesMap = new Map(network.nodes.map(node => [node.id, node]));

    const lockedSegmentIds = new Set();
    trains.forEach(train => {
        if (train.route) train.route.forEach(id => lockedSegmentIds.add(id));
    });

    const calculateTrainPosition = (train) => {
        if (!train.currentSegmentId) return null;
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
                <svg width="1200" height="400" viewBox="0 0 1200 400">
                    <defs>
                        <style>{`
                            .track { stroke: #6b7280; stroke-width: 3; fill: none; transition: stroke 0.3s; }
                            .track-occupied { stroke: var(--status-red); stroke-width: 4.5; }
                            .track-route-locked { stroke: var(--accent-cyan); stroke-width: 4; }
                            .signal { stroke: #d1d5db; stroke-width: 1.5; }
                            .signal-red { fill: #f87171; }
                            .signal-green { fill: #4ade80; }
                            .point { fill: var(--accent-yellow); }
                            .label { fill: #cbd5e1; font-size: 11px; text-anchor: middle; pointer-events: none; }
                            .train-body { stroke: black; stroke-width: 1; rx: 3px; }
                            .train-label { text-anchor: middle; dominant-baseline: middle; fill: white; font-size: 9px; font-weight: bold; text-shadow: 1px 1px 2px black; }
                        `}</style>
                    </defs>

                    <g id="track-segments">
                        {network.trackSegments.map(segment => {
                            const startNode = nodesMap.get(segment.startNodeId);
                            const endNode = nodesMap.get(segment.endNodeId);
                            if (!startNode || !endNode) return null;
                            const classNames = `track ${segment.isOccupied ? 'track-occupied' : lockedSegmentIds.has(segment.id) ? 'track-route-locked' : ''}`;
                            return <line key={segment.id} x1={startNode.position.x} y1={startNode.position.y} x2={endNode.position.x} y2={endNode.position.y} className={classNames} />;
                        })}
                    </g>

                    <g id="nodes">
                        {network.nodes.map(node => (
                            <g key={node.id}>
                                {node.type === 'SIGNAL' && <circle cx={node.position.x} cy={node.position.y} r="6" className={`signal signal-red`} />}
                                {node.type === 'SWITCH' && <rect x={node.position.x - 5} y={node.position.y - 5} width="10" height="10" className="point" />}
                                <text x={node.position.x} y={node.position.y > 200 ? node.position.y + 20 : node.position.y - 10} className="label">{node.id}</text>
                            </g>
                        ))}
                    </g>
                    
                    <g id="trains">
                         {trains.filter(t => t.currentSegmentId).map(train => {
                            const pos = calculateTrainPosition(train);
                            if (!pos) return null;
                            const statusSymbol = train.state === 'HOLD' ? '⏸️' : '';
                            return (
                                <g key={train.id} className="train-group" style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}>
                                    <rect className="train-body" fill={getTrainColor(train.type)} x="-20" y="-6" width="40" height="12" />
                                    <text className="train-label">{train.id} {statusSymbol}</text>
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