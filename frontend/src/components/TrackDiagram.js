import React from 'react';
import './TrackDiagram.css'; // We'll create this file for train styles

// A utility function to get the class name for a signal based on its state
const getSignalClassName = (state) => {
    switch (state) {
        case 'GREEN': return 'signal-green';
        case 'YELLOW': return 'signal-yellow';
        case 'RED':
        default: return 'signal-red';
    }
};

const TrackDiagram = ({ network, trains }) => {
    if (!network || !network.nodes || !network.trackSegments) {
        return null; // Don't render if network data is not available yet
    }

    // Create a lookup map for node positions for efficient rendering.
    const nodesMap = new Map(network.nodes.map(node => [node.id, node]));

    // A helper function to calculate a train's exact x,y position
    const calculateTrainPosition = (train) => {
        const segment = network.trackSegments.find(s => s.id === train.currentSegmentId);
        if (!segment) return null;

        const startNode = nodesMap.get(segment.startNodeId);
        const endNode = nodesMap.get(segment.endNodeId);
        if (!startNode || !endNode) return null;

        // Linear interpolation to find the position along the track segment
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
                        
                        .signal { stroke: #d1d5db; stroke-width: 1; transition: fill 0.3s; }
                        .signal-red { fill: #f87171; }
                        .signal-yellow { fill: #facc15; }
                        .signal-green { fill: #4ade80; }

                        .point { stroke: #a1a5ab; stroke-width: 2.5; fill: none; }
                        
                        .label { fill: #a1a5ab; font-size: 10px; font-family: var(--font-main); text-anchor: middle; }
                    `}
                </style>
            </defs>

            <g id="track-segments">
                {network.trackSegments.map(segment => {
                    const startNode = nodesMap.get(segment.startNodeId);
                    const endNode = nodesMap.get(segment.endNodeId);
                    if (!startNode || !endNode) return null;
                    
                    const route = network.routes.find(r => r.state === 'LOCKED' && r.trackSegments.includes(segment.id));
                    const classNames = `track ${segment.isOccupied ? 'track-occupied' : ''} ${route ? 'track-route-locked' : ''}`;
                    
                    return <line key={segment.id} x1={startNode.position.x} y1={startNode.position.y} x2={endNode.position.x} y2={endNode.position.y} className={classNames} />;
                })}
            </g>

            <g id="nodes">
                {network.nodes.map(node => {
                    if (node.type === 'SIGNAL') {
                        return (
                            <g key={node.id}>
                                <circle cx={node.position.x} cy={node.position.y} r="6" className={`signal ${getSignalClassName(node.state)}`} />
                                <text x={node.position.x} y={node.position.y + 18} className="label">{node.id}</text>
                            </g>
                        );
                    }
                    if (node.type === 'POINT_SWITCH') {
                        return (
                             <g key={node.id}>
                                <rect x={node.position.x - 5} y={node.position.y - 5} width="10" height="10" fill="var(--accent-yellow)" />
                                <text x={node.position.x} y={node.position.y - 10} className="label">{node.id}</text>
                            </g>
                        )
                    }
                    return null;
                })}
            </g>

            <g id="trains">
                {trains.filter(t => t.state === 'MOVING').map(train => {
                    const pos = calculateTrainPosition(train);
                    if (!pos) return null;

                    return (
                        <g key={train.id} className="train-group" transform={`translate(${pos.x}, ${pos.y})`}>
                            <rect className="train-body" x="-15" y="-6" width="30" height="12" />
                            <text className="train-label">{train.id.split('-')[0]}</text>
                        </g>
                    );
                })}
            </g>
        </svg>
    );
};

export default TrackDiagram;