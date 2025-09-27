import React, { useState, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import './App.css';
import HomePage from './pages/HomePage';
import DashboardPage from './pages/DashboardPage';
import Header from './components/Header';
import LeftSidebar from './components/LeftSidebar';
import RightSidebar from './components/RightSidebar';
import Footer from './components/Footer';
import socketService from './services/socketService';

const DashboardLayout = () => {
    // --- State initialized from sessionStorage for refresh-proof UI ---
    const [selectedStation, setSelectedStation] = useState(
        () => sessionStorage.getItem('selectedStation') || 'DLI'
    );
    const [simulationStatus, setSimulationStatus] = useState(
        () => sessionStorage.getItem('simulationStatus') || 'stopped'
    );
    // --- NEW: Add blockedTracks to the central, persistent state ---
    const [blockedTracks, setBlockedTracks] = useState(
        () => JSON.parse(sessionStorage.getItem('blockedTracks')) || []
    );

    const [simSpeed, setSimSpeed] = useState(1);
    const [liveData, setLiveData] = useState(null);

    // Persist ALL critical UI state changes to sessionStorage
    useEffect(() => {
        sessionStorage.setItem('selectedStation', selectedStation);
        sessionStorage.setItem('simulationStatus', simulationStatus);
        sessionStorage.setItem('blockedTracks', JSON.stringify(blockedTracks));
    }, [selectedStation, simulationStatus, blockedTracks]);

        useEffect(() => {
        socketService.connect();

        // --- Immediately re-apply persisted blocked tracks to backend (handles reloads) ---
        if (blockedTracks && blockedTracks.length > 0) {
            blockedTracks.forEach(trackId => {
                socketService.emit('controller_set_track_status', { trackId, status: 'FAULTY' });
            });
        }

        const handleSimStarted = () => setSimulationStatus('running');
        const handleStateChanged = ({ isPlaying }) => setSimulationStatus(isPlaying ? 'running' : 'paused');
        const handleSimStopped = () => {
            setSimulationStatus('stopped');
            setLiveData(null);
            setBlockedTracks([]); // Clear blocked tracks on definitive stop
            sessionStorage.removeItem('simulationStatus');
            sessionStorage.removeItem('blockedTracks');
        };

        const handleStateUpdate = (data) => {
            setLiveData(data);
            // Keep blockedTracks in UI synced with server (authoritative)
            if (data && data.network && data.network.trackSegments) {
                const faulty = data.network.trackSegments.filter(s => s.status === 'FAULTY').map(s => s.id);
                // Avoid unnecessary state updates
                const prev = JSON.stringify(blockedTracks || []);
                const next = JSON.stringify(faulty || []);
                if (prev !== next) setBlockedTracks(faulty);
            }
        };
        
        socketService.on('simulation:started', handleSimStarted);
        socketService.on('simulation:state_changed', handleStateChanged);
        socketService.on('simulation:stopped', handleSimStopped);
        socketService.on('initial-state', handleStateUpdate);
        socketService.on('network-update', handleStateUpdate);

        return () => {
            socketService.off('simulation:started');
            socketService.off('simulation:state_changed');
            socketService.off('simulation:stopped');
            socketService.off('initial-state');
            socketService.off('network-update');
            socketService.disconnect();
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps


    const handleStartSimulation = () => {
        if (simulationStatus === 'stopped') {
            setLiveData(null); 
            // When starting, immediately send all persistently blocked tracks to the backend
            blockedTracks.forEach(trackId => {
                socketService.emit('controller_set_track_status', { trackId, status: 'FAULTY' });
            });
            socketService.startSimulation(selectedStation);
        }
    };

    const handleTogglePause = (isPlaying) => socketService.togglePauseSimulation(isPlaying);
    const handleStopSimulation = () => socketService.stopSimulation();
    const handleSimSpeedChange = (speed) => {
        setSimSpeed(speed);
        if (simulationStatus !== 'stopped') {
            socketService.changeSimSpeed(speed);
        }
    };

    return (
        <div className="App-layout">
            <Header />
            <div className="main-body">
                <LeftSidebar 
                    simulationStatus={simulationStatus}
                    selectedStation={selectedStation}
                    onStationChange={setSelectedStation}
                    blockedTracks={blockedTracks}
                    onBlockedTracksChange={setBlockedTracks}
                />
                <DashboardPage
                    key={selectedStation}
                    selectedStation={selectedStation}
                    simulationStatus={simulationStatus}
                    liveData={liveData}
                />
                <RightSidebar 
                    simulationStatus={simulationStatus}
                    onStart={handleStartSimulation}
                    onTogglePause={handleTogglePause}
                    onStop={handleStopSimulation}
                    isSimRunning={simulationStatus !== 'stopped'}
                    simSpeed={simSpeed}
                    onSpeedChange={handleSimSpeedChange}
                />
            </div>
            <Footer />
        </div>
    );
};

function App() {
    return (
        <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/dashboard" element={<DashboardLayout />} />
        </Routes>
    );
}

export default App;