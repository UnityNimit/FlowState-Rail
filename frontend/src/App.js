import React, { useState, useEffect } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import './App.css';
import SplashScreen from './components/SplashScreen/SplashScreen';
import DashboardPage from './pages/DashboardPage';
import LeftSidebar from './components/LeftSidebar';
import RightSidebar from './components/RightSidebar';
import Chatbot from './components/Chatbot';
import socketService from './services/socketService';

const DashboardLayout = () => {
    const [selectedStation, setSelectedStation] = useState(
        () => sessionStorage.getItem('selectedStation') || 'DLI'
    );
    const [simulationStatus, setSimulationStatus] = useState(
        () => sessionStorage.getItem('simulationStatus') || 'stopped'
    );
    const [blockedTracks, setBlockedTracks] = useState(
        () => JSON.parse(sessionStorage.getItem('blockedTracks')) || []
    );

    const [simSpeed, setSimSpeed] = useState(1);
    const [liveData, setLiveData] = useState(null);
    const [isLeftOpen, setIsLeftOpen] = useState(false);
    const [isRightOpen, setIsRightOpen] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [activePort, setActivePort] = useState(socketService.getPort());

    useEffect(() => {
        sessionStorage.setItem('selectedStation', selectedStation);
        sessionStorage.setItem('simulationStatus', simulationStatus);
        sessionStorage.setItem('blockedTracks', JSON.stringify(blockedTracks));
    }, [selectedStation, simulationStatus, blockedTracks]);

    useEffect(() => {
        socketService.connect();

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
            setBlockedTracks([]);
            sessionStorage.removeItem('simulationStatus');
            sessionStorage.removeItem('blockedTracks');
        };

        const handleStateUpdate = (data) => {
            setLiveData(data);
            if (data && data.network && data.network.trackSegments) {
                const faulty = data.network.trackSegments.filter(s => s.status === 'FAULTY').map(s => s.id);
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

    const handlePortChange = () => {
        const current = socketService.getPort();
        const next = window.prompt("Enter Backend Port to connect (e.g. 8000, 8001, 8002, 8080):", current);
        if (next && next !== current) {
            socketService.changePort(next);
            setActivePort(next);
        }
    };

    return (
        <div className="fullscreen-dashboard">
            {/* Minimal Floating Top Bar */}
            <header className="minimal-floating-hud">
                <div className="hud-left-group">
                    <Link to="/" className="hud-brand" title="Return to Launch">FLOW</Link>
                    <select
                        value={selectedStation}
                        onChange={(e) => setSelectedStation(e.target.value)}
                        className="hud-station-select"
                        disabled={simulationStatus !== 'stopped'}
                    >
                        <option value="DLI">Old Delhi Junction (16 Platforms)</option>
                        <option value="CORRIDOR">Delhi–Ghaziabad Quadruple Corridor</option>
                    </select>
                </div>

                <div className="hud-center-group">
                    {simulationStatus === 'stopped' ? (
                        <button onClick={handleStartSimulation} className="hud-btn hud-btn-primary">
                            ▶ START
                        </button>
                    ) : simulationStatus === 'running' ? (
                        <button onClick={() => handleTogglePause(false)} className="hud-btn">
                            ⏸ PAUSE
                        </button>
                    ) : (
                        <button onClick={() => handleTogglePause(true)} className="hud-btn hud-btn-primary">
                            ▶ RESUME
                        </button>
                    )}

                    {simulationStatus !== 'stopped' && (
                        <button onClick={handleStopSimulation} className="hud-btn hud-btn-danger">
                            ⏹ STOP
                        </button>
                    )}

                    <div className="hud-speed-group">
                        {[1, 2, 8, 20].map(s => (
                            <button
                                key={s}
                                onClick={() => handleSimSpeedChange(s)}
                                className={`hud-speed-btn ${simSpeed === s ? 'active' : ''}`}
                            >
                                {s}x
                            </button>
                        ))}
                    </div>
                </div>

                <div className="hud-right-group">
                    <button 
                        onClick={handlePortChange} 
                        className="hud-btn hud-port-chip" 
                        title="Click to switch backend port"
                    >
                        <span className="live-pulse"></span> :{activePort}
                    </button>
                    <button
                        onClick={() => setIsLeftOpen(v => !v)}
                        className={`hud-btn ${isLeftOpen ? 'active' : ''}`}
                        title="Toggle Station & Assets Panel"
                    >
                        ☰ ASSETS
                    </button>
                    <button
                        onClick={() => setIsRightOpen(v => !v)}
                        className={`hud-btn ${isRightOpen ? 'active' : ''}`}
                        title="Toggle AI Recommendations & Timeline"
                    >
                        ⚡ AI FEED
                    </button>
                    <button
                        onClick={() => setIsChatOpen(v => !v)}
                        className={`hud-btn ${isChatOpen ? 'active' : ''}`}
                        title="Toggle AI Section Assistant"
                    >
                        💬 CHAT
                    </button>
                </div>
            </header>

            {/* 100% Full-Screen Canvas */}
            <main className="canvas-viewport">
                <DashboardPage
                    key={selectedStation}
                    selectedStation={selectedStation}
                    simulationStatus={simulationStatus}
                    liveData={liveData}
                />
            </main>

            {/* Retractable Floating Left Drawer */}
            {isLeftOpen && (
                <div className="floating-drawer drawer-left">
                    <div className="drawer-header">
                        <span>STATION & INFRASTRUCTURE</span>
                        <button onClick={() => setIsLeftOpen(false)} className="drawer-close" title="Close Panel">✕</button>
                    </div>
                    <div className="drawer-body">
                        <LeftSidebar
                            simulationStatus={simulationStatus}
                            selectedStation={selectedStation}
                            onStationChange={setSelectedStation}
                            blockedTracks={blockedTracks}
                            onBlockedTracksChange={setBlockedTracks}
                        />
                    </div>
                </div>
            )}

            {/* Retractable Floating Right Drawer */}
            {isRightOpen && (
                <div className="floating-drawer drawer-right">
                    <div className="drawer-header">
                        <span>AI DECISIONS & REVENUE OPTIMIZER</span>
                        <button onClick={() => setIsRightOpen(false)} className="drawer-close" title="Close Panel">✕</button>
                    </div>
                    <div className="drawer-body">
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
                </div>
            )}

            {/* Retractable Floating Bottom-Right Assistant */}
            {isChatOpen && (
                <div className="floating-chat-box">
                    <div className="drawer-header">
                        <span>RAILWAY OPERATIONAL ASSISTANT</span>
                        <button onClick={() => setIsChatOpen(false)} className="drawer-close" title="Close Chat">✕</button>
                    </div>
                    <div className="chat-body">
                        <Chatbot networkState={simulationStatus !== 'stopped' ? liveData : null} />
                    </div>
                </div>
            )}
        </div>
    );
};

function App() {
    return (
        <Routes>
            <Route path="/" element={<SplashScreen />} />
            <Route path="/dashboard" element={<DashboardLayout />} />
        </Routes>
    );
}

export default App;
