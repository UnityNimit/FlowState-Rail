import React from 'react';

// A utility function to get the class name for a signal based on its state
const getSignalClassName = (state) => {
    switch (state) {
        case 'GREEN': return 'signal-green';
        case 'YELLOW': return 'signal-yellow';
        case 'DOUBLE_YELLOW': return 'signal-yellow'; // Handle as needed
        case 'RED':
        default: return 'signal-red';
    }
};

const TrackDiagram = ({ network }) => {
    if (!network || !network.nodes || !network.trackSegments) {
        return <div>Loading network...</div>;
    }

    // Create a lookup map for node positions for efficient rendering.
    // This is much faster than searching the array for every track segment.
    const nodesMap = new Map(network.nodes.map(node => [node.id, node]));

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
                        .label-station { fill: #d1d5db; font-size: 12px; font-weight: 500; }
                    `}
                </style>
            </defs>

            <g id="track-segments">
                {network.trackSegments.map(segment => {
                    const startNode = nodesMap.get(segment.startNodeId);
                    const endNode = nodesMap.get(segment.endNodeId);

                    // Don't render if a node is missing (avoids errors)
                    if (!startNode || !endNode) return null;

                    const classNames = `track ${segment.isOccupied ? 'track-occupied' : ''}`;
                    
                    return (
                        <line
                            key={segment.id}
                            x1={startNode.position.x}
                            y1={startNode.position.y}
                            x2={endNode.position.x}
                            y2={endNode.position.y}
                            className={classNames}
                        />
                    );
                })}
            </g>

            <g id="nodes">
                {network.nodes.map(node => {
                    if (node.type === 'SIGNAL') {
                        return (
                            <g key={node.id}>
                                <circle
                                    cx={node.position.x}
                                    cy={node.position.y}
                                    r="6"
                                    className={`signal ${getSignalClassName(node.state)}`}
                                />
                                <text x={node.position.x} y={node.position.y + 18} className="label">{node.id}</text>
                            </g>
                        );
                    }
                    if (node.type === 'POINT_SWITCH') {
                        // For simplicity, we'll just mark the point's location.
                        // A more advanced version would draw the switch blades.
                        return (
                             <g key={node.id}>
                                <rect 
                                    x={node.position.x - 5} 
                                    y={node.position.y - 5} 
                                    width="10" 
                                    height="10" 
                                    fill="var(--accent-yellow)" 
                                />
                                <text x={node.position.x} y={node.position.y - 10} className="label">{node.id}</text>
                            </g>
                        )
                    }
                    // We don't need to visually render JUNCTION or TERMINAL nodes,
                    // as they are just logical connection points.
                    return null;
                })}
            </g>
        </svg>
    );
};

export default TrackDiagram;