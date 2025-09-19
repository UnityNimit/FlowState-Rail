import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import TrackMap from './TrackMap';
import AIDecisionPanel from './AIDecisionPanel';

const dashboardStyle = {
    display: 'flex',
    flex: 1,
    padding: '24px',
    gap: '24px',
};

const socket = io("http://localhost:5000");

function Dashboard() {
    const [trains, setTrains] = useState([]);
    const [conflict, setConflict] = useState(null);

    useEffect(() => {
        // Listen for initial data
        socket.on('initialData', (data) => {
            setTrains(data.trains);
        });

        // Listen for real-time updates
        socket.on('updateData', (data) => {
            setTrains(data.trains);
        });

        // Listen for conflicts
        socket.on('conflictDetected', (conflictData) => {
            console.log("Conflict Detected:", conflictData);
            setConflict(conflictData);
        });

        // Clean up the connection when the component unmounts
        return () => {
            socket.off('initialData');
            socket.off('updateData');
            socket.off('conflictDetected');
        };
    }, []);

    return (
        <div style={dashboardStyle}>
            <TrackMap trains={trains} />
            <AIDecisionPanel conflict={conflict} setConflict={setConflict} currentState={{ trains: trains }}/>
        </div>
    );
}

export default Dashboard;