import React, { useState, useEffect, useCallback } from 'react';
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
  const [blockedTracks, setBlockedTracks] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem('blockedTracks')) || [];
    } catch {
      return [];
    }
  });

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

  const handleStateUpdate = useCallback((data) => {
    setLiveData(data);
    if (data && data.network && data.network.trackSegments) {
      const serverFaulty = data.network.trackSegments
        .filter((s) => s.status === 'FAULTY')
        .map((s) => s.id);

      setBlockedTracks((prev) => {
        const prevSorted = [...prev].sort().join(',');
        const nextSorted = [...serverFaulty].sort().join(',');
        return prevSorted !== nextSorted ? serverFaulty : prev;
      });
    }
  }, []);

  useEffect(() => {
    socketService.connect();

    const handleSimStarted = () => setSimulationStatus('running');
    const handleStateChanged = ({ isPlaying }) =>
      setSimulationStatus(isPlaying ? 'running' : 'paused');
    const handleSimStopped = () => {
      setSimulationStatus('stopped');
      setLiveData(null);
      setBlockedTracks([]);
      sessionStorage.removeItem('simulationStatus');
      sessionStorage.removeItem('blockedTracks');
    };

    socketService.on('simulation:started', handleSimStarted);
    socketService.on('simulation:state_changed', handleStateChanged);
    socketService.on('simulation:stopped', handleSimStopped);
    socketService.on('initial-state', handleStateUpdate);
    socketService.on('network-update', handleStateUpdate);

    return () => {
      socketService.off('simulation:started', handleSimStarted);
      socketService.off('simulation:state_changed', handleStateChanged);
      socketService.off('simulation:stopped', handleSimStopped);
      socketService.off('initial-state', handleStateUpdate);
      socketService.off('network-update', handleStateUpdate);
    };
  }, [handleStateUpdate]);

  const handleStartSimulation = () => {
    if (simulationStatus === 'stopped') {
      setLiveData(null);
      blockedTracks.forEach((trackId) => {
        socketService.emit('controller_set_track_status', {
          trackId,
          status: 'FAULTY',
        });
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
    const next = window.prompt(
      'Enter Backend Port to connect (e.g. 8000, 8001, 8002, 8080):',
      current
    );
    if (next && next !== current) {
      socketService.changePort(next.trim());
      setActivePort(next.trim());
    }
  };

  return (
    <div className="fullscreen-dashboard">
      {/* SCADA Floating Header HUD */}
      <header className="minimal-floating-hud">
        <div className="hud-left-group">
          <Link to="/" className="hud-brand" title="Return to Launch Screen">
            <span style={{ fontWeight: 800, letterSpacing: '1.5px', color: '#f8fafc', fontSize: '11px' }}>
              FLOWSTATE
            </span>
          </Link>

          <select
            value={selectedStation}
            onChange={(e) => setSelectedStation(e.target.value)}
            className="hud-station-select"
            disabled={simulationStatus !== 'stopped'}
          >
            <option value="DLI">Old Delhi Junction (DLI - 16 Platforms)</option>
            <option value="CORRIDOR">Delhi-Ghaziabad Quadruple Line Corridor</option>
            <option value="ANVR">Anand Vihar Terminal (ANVR)</option>
            <option value="SBB">Sahibabad Junction (SBB)</option>
            <option value="GZB">Ghaziabad Junction (GZB)</option>
          </select>
        </div>

        <div className="hud-center-group">
          {simulationStatus === 'stopped' ? (
            <button onClick={handleStartSimulation} className="hud-btn hud-btn-primary">
              START
            </button>
          ) : simulationStatus === 'running' ? (
            <button onClick={() => handleTogglePause(false)} className="hud-btn">
              PAUSE
            </button>
          ) : (
            <button onClick={() => handleTogglePause(true)} className="hud-btn hud-btn-primary">
              RESUME
            </button>
          )}

          {simulationStatus !== 'stopped' && (
            <button onClick={handleStopSimulation} className="hud-btn hud-btn-danger">
              STOP
            </button>
          )}

          <div className="hud-speed-group">
            {[1, 2, 8, 20].map((s) => (
              <button
                key={s}
                onClick={() => handleSimSpeedChange(s)}
                className={`hud-speed-btn ${simSpeed === s ? 'active' : ''}`}
              >
                {s}X
              </button>
            ))}
          </div>
        </div>

        <div className="hud-right-group">
          <button
            onClick={handlePortChange}
            className="hud-btn hud-port-chip"
            title="Switch Backend Socket Port"
          >
            <span className="live-pulse"></span> :{activePort}
          </button>
          <button
            onClick={() => setIsLeftOpen((v) => !v)}
            className={`hud-btn ${isLeftOpen ? 'active' : ''}`}
            title="Toggle Station Assets and Maintenance Panels"
          >
            ASSETS
          </button>
          <button
            onClick={() => setIsRightOpen((v) => !v)}
            className={`hud-btn ${isRightOpen ? 'active' : ''}`}
            title="Toggle AI Recommendations and Solvers"
          >
            AI FEED
          </button>
          <button
            onClick={() => setIsChatOpen((v) => !v)}
            className={`hud-btn ${isChatOpen ? 'active' : ''}`}
            title="Toggle Natural Language Section Assistant"
          >
            ASSISTANT
          </button>
        </div>
      </header>

      {/* 100% Vector SCADA Canvas Layer */}
      <main className="canvas-viewport">
        <DashboardPage
          key={selectedStation}
          selectedStation={selectedStation}
          simulationStatus={simulationStatus}
          liveData={liveData}
          blockedTracks={blockedTracks}
          onBlockedTracksChange={setBlockedTracks}
        />
      </main>

      {/* Retractable Left Drawer: Station Topology & Maintenance */}
      {isLeftOpen && (
        <aside className="floating-drawer drawer-left">
          <div className="drawer-header">
            <span>INFRASTRUCTURE & TRACK CIRCUITS</span>
            <button onClick={() => setIsLeftOpen(false)} className="drawer-close" title="Close Panel">
              CLOSE
            </button>
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
        </aside>
      )}

      {/* Retractable Right Drawer: Optimization & Timeline Decisions */}
      {isRightOpen && (
        <aside className="floating-drawer drawer-right">
          <div className="drawer-header">
            <span>OPTIMIZATION ENGINE & PRECEDENCE FEED</span>
            <button onClick={() => setIsRightOpen(false)} className="drawer-close" title="Close Panel">
              CLOSE
            </button>
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
        </aside>
      )}

      {/* Floating Section Assistant Drawer */}
      {isChatOpen && (
        <aside className="floating-chat-box">
          <div className="drawer-header">
            <span>SECTION CONTROLLER ASSISTANT</span>
            <button onClick={() => setIsChatOpen(false)} className="drawer-close" title="Close Assistant">
              CLOSE
            </button>
          </div>
          <div className="chat-body">
            <Chatbot networkState={simulationStatus !== 'stopped' ? liveData : null} />
          </div>
        </aside>
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