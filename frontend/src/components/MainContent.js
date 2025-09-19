import React, { useState } from 'react';
import './MainContent.css';
import TrackDiagram from './TrackDiagram';
// Import our data model
import layoutData from '../data/ghaziabad_layout';

const MainContent = () => {
    // In the future, this state will be updated by a WebSocket connection
    const [networkState, setNetworkState] = useState(layoutData);

    return (
        <main className="main-content">
            <div className="panel track-panel" id="panel-1">
                 {/* Pass the entire network object as a prop */}
                 <TrackDiagram network={networkState.network} />
            </div>
            <div className="panel track-panel" id="panel-2">
                {/* Placeholder for future content */}
            </div>
            <div className="panel track-panel" id="panel-3">
                 {/* Placeholder for future content */}
            </div>
        </main>
    );
};

export default MainContent;