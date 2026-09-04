import React, { useState, useEffect, useCallback, useMemo } from 'react';
import './DashboardPage.css';
import TrackDiagram from '../components/TrackDiagram';
import socketService from '../services/socketService';
import { FiX } from 'react-icons/fi';

const DashboardPage = ({ selectedStation, simulationStatus, liveData, blockedTracks = [], onBlockedTracksChange }) => {
  const [staticNetwork, setStaticNetwork] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [showNames, setShowNames] = useState(true);
  const [showSpeeds, setShowSpeeds] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [aiControlEnabled, setAiControlEnabled] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Initial network topology fetch - cached in memory to prevent canvas unmounting
  useEffect(() => {
    let isMounted = true;
    const fetchLayout = async () => {
      const stationCode = selectedStation.toLowerCase();
      try {
        const backendUrl = socketService.getUrl();
        const response = await fetch(`${backendUrl}/api/network/${stationCode}`);
        if (!response.ok) throw new Error(`Layout for ${selectedStation} unavailable on backend.`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        const net = data.network || data;
        if (isMounted) {
          setStaticNetwork(net);
          setErrorMessage('');
        }
      } catch (error) {
        try {
          const relResp = await fetch(`/api/network/${stationCode}`);
          if (relResp.ok) {
            const relData = await relResp.json();
            const net = relData.network || relData;
            if (isMounted) {
              setStaticNetwork(net);
              setErrorMessage('');
              return;
            }
          }
        } catch (e) {
          /* ignore */
        }
        if (isMounted) {
          setErrorMessage(`Connecting to backend at ${socketService.getUrl()}...`);
        }
      }
    };

    fetchLayout();

    const handleNetworkLayout = (data) => {
      if (data && (data.station?.toUpperCase() === selectedStation.toUpperCase() || !data.station)) {
        const net = data.network || data;
        if (isMounted) {
          setStaticNetwork(net);
          setErrorMessage('');
        }
      }
    };

    socketService.on('network-layout', handleNetworkLayout);
    socketService.emit('get-network', { station: selectedStation });

    return () => {
      isMounted = false;
      socketService.off('network-layout', handleNetworkLayout);
    };
  }, [selectedStation]);

  const handleAiControlBroadcast = useCallback((data) => {
    if (data && typeof data.enabled === 'boolean') {
      setAiControlEnabled(data.enabled);
    }
  }, []);

  useEffect(() => {
    socketService.on('ai:control_state_changed', handleAiControlBroadcast);
    socketService.connect().catch(() => {});
    return () => {
      socketService.off('ai:control_state_changed', handleAiControlBroadcast);
    };
  }, [handleAiControlBroadcast]);

  // Persistent display state - guarantees <TrackDiagram /> NEVER unmounts on simulation transitions
  const activeNetwork = useMemo(() => {
    return liveData?.network || staticNetwork;
  }, [liveData, staticNetwork]);

  const activeTrains = useMemo(() => {
    return simulationStatus !== 'stopped' ? liveData?.trains || [] : [];
  }, [simulationStatus, liveData]);

  const handleToggleAiControl = () => {
    const next = !aiControlEnabled;
    socketService.toggleAiControl(next);
    setAiControlEnabled(next);
  };

  const handleTrackClick = (trackId) => {
    if (!trackId) {
      setSelectedAsset(null);
      return;
    }
    const segment = activeNetwork?.trackSegments?.find((s) => s.id === trackId) || {};
    setSelectedAsset({
      type: 'TRACK',
      id: trackId,
      line: segment.line || segment.lineId || 'MAIN',
      speed: segment.permissibleSpeedKph || segment.speedLimit || 60,
      status: segment.status || (blockedTracks.includes(trackId) ? 'FAULTY' : 'CLEAR')
    });
  };

  const handleSignalClick = (signalId) => {
    if (!signalId) {
      setSelectedAsset(null);
      return;
    }
    const node = activeNetwork?.nodes?.find((n) => n.id === signalId) || {};
    setSelectedAsset({
      type: 'SIGNAL',
      id: signalId,
      state: (node.state || 'RED').toUpperCase(),
      direction: node.direction || 'BI'
    });
  };

  const setTrackStatus = (trackId, status) => {
    socketService.emit('controller_set_track_status', { trackId, status });
    if (onBlockedTracksChange) {
      if (status === 'FAULTY' || status === 'MAINTENANCE') {
        if (!blockedTracks.includes(trackId)) onBlockedTracksChange([...blockedTracks, trackId]);
      } else {
        onBlockedTracksChange(blockedTracks.filter((id) => id !== trackId));
      }
    }
    setSelectedAsset(null);
  };

  const setSignalAspect = (signalId, state) => {
    socketService.emit('controller_set_signal', { signalId, state });
    setSelectedAsset(null);
  };

  return (
    <main className="main-content">
      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="settings-panel-overlay" onClick={() => setIsSettingsOpen(false)}>
          <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
            <div className="settings-header">
              <h3>SYSTEM TELEMETRY & DISPLAY CONFIGURATION</h3>
              <button
                className="close-icon-btn"
                onClick={() => setIsSettingsOpen(false)}
                title="Close"
                aria-label="Close"
              >
                <FiX />
              </button>
            </div>
            <div className="settings-content">
              <div className="settings-column">
                <h4>Display Settings</h4>
                <div className="settings-toggle-item">
                  <span>Show Node & Signal Identifiers</span>
                  <label className="switch">
                    <input type="checkbox" checked={showNames} onChange={() => setShowNames((s) => !s)} />
                    <span className="slider round"></span>
                  </label>
                </div>
                <div className="settings-toggle-item">
                  <span>Show Permissible Speed Limits</span>
                  <label className="switch">
                    <input type="checkbox" checked={showSpeeds} onChange={() => setShowSpeeds((s) => !s)} />
                    <span className="slider round"></span>
                  </label>
                </div>

                <h4>MACLS Signal Aspects</h4>
                <div className="legend-item"><div className="legend-swatch signal-green" /><span>Clear / Proceed (Green)</span></div>
                <div className="legend-item"><div className="legend-swatch signal-red" /><span>Danger / Stop (Red)</span></div>
                <div className="legend-item"><div className="legend-swatch point" /><span>Interlocking Point Switch</span></div>
              </div>

              <div className="settings-column">
                <h4>Track Circuit Status</h4>
                <div className="legend-item"><div className="legend-swatch rail-normal" /><span>Operational Circuit</span></div>
                <div className="legend-item"><div className="legend-swatch rail-locked" /><span>Route Locked (Reserved)</span></div>
                <div className="legend-item"><div className="legend-swatch rail-occupied" /><span>Occupied (Wheelset Shunted)</span></div>
                <div className="legend-item"><div className="legend-swatch rail-hazard" /><span>Maintenance / Hazard Block</span></div>

                <h4>Rolling Stock Precedence</h4>
                <div className="legend-item"><div className="legend-swatch" style={{ background: '#dc2626' }} /><span>Vande Bharat / Rajdhani (P10)</span></div>
                <div className="legend-item"><div className="legend-swatch" style={{ background: '#2563eb' }} /><span>Shatabdi Express (P8)</span></div>
                <div className="legend-item"><div className="legend-swatch" style={{ background: '#0d9488' }} /><span>Superfast / Express (P6)</span></div>
                <div className="legend-item"><div className="legend-swatch" style={{ background: '#525860' }} /><span>Freight Rake (P1)</span></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Track Vector Canvas */}
      <div className="panel track-panel" id="panel-1">
        {errorMessage && !activeNetwork && (
          <div className="loading-message error-message">
            {errorMessage}
          </div>
        )}

        {activeNetwork && (
          <TrackDiagram
            network={activeNetwork}
            trains={activeTrains}
            onSignalClick={handleSignalClick}
            onTrackClick={handleTrackClick}
            showNames={showNames}
            showSpeeds={showSpeeds}
            activeMaintenanceBlocks={blockedTracks}
            selectedAssetId={selectedAsset?.id}
          />
        )}

        {/* Bottom-Left Containerless Ghost Controls */}
        <div className="hud-canvas-controls">
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="hud-canvas-link"
            title="Display Legend & Settings"
          >
            LEGEND
          </button>
          <span className="hud-canvas-divider" />
          <button
            type="button"
            onClick={handleToggleAiControl}
            className={`hud-canvas-link ${aiControlEnabled ? 'auto' : 'manual'}`}
            title={aiControlEnabled ? "Autonomous Dispatch Engine: ACTIVE" : "Manual Interlocking Mode: ACTIVE"}
          >
            <span className="status-micro-dot" data-active={aiControlEnabled} />
            <span>{aiControlEnabled ? 'AI AUTONOMOUS' : 'MANUAL INTERLOCK'}</span>
          </button>
        </div>
      </div>

      {/* Container-Free Floating Telemetry & Control Strip */}
      {selectedAsset && (
        <div className="hud-asset-strip">
          <span className="asset-type-tag">{selectedAsset.type}</span>
          <span className="asset-id-code">{selectedAsset.id}</span>
          <span className="asset-state-dot" data-state={selectedAsset.status || selectedAsset.state} />
          <span className="asset-state-text">{selectedAsset.status || selectedAsset.state}</span>
          {selectedAsset.speed && (
            <span className="asset-meta-text">{selectedAsset.line} · {selectedAsset.speed} KM/H</span>
          )}

          <span className="strip-divider" />

          <div className="asset-actions-inline">
            {selectedAsset.type === 'TRACK' && (
              <>
                <button
                  type="button"
                  onClick={() => setTrackStatus(selectedAsset.id, 'FAULTY')}
                  className="asset-act-btn fault"
                >
                  ISOLATE
                </button>
                <button
                  type="button"
                  onClick={() => setTrackStatus(selectedAsset.id, 'MAINTENANCE')}
                  className="asset-act-btn maint"
                >
                  MAINT-BLOCK
                </button>
                <button
                  type="button"
                  onClick={() => setTrackStatus(selectedAsset.id, 'OPERATIONAL')}
                  className="asset-act-btn clear"
                >
                  RESTORE
                </button>
              </>
            )}

            {selectedAsset.type === 'SIGNAL' && (
              <>
                <button
                  type="button"
                  onClick={() => setSignalAspect(selectedAsset.id, 'GREEN')}
                  className="asset-act-btn clear"
                >
                  PROCEED
                </button>
                <button
                  type="button"
                  onClick={() => setSignalAspect(selectedAsset.id, 'RED')}
                  className="asset-act-btn fault"
                >
                  STOP
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => setSelectedAsset(null)}
              className="asset-dismiss-btn"
              title="Dismiss"
              aria-label="Dismiss"
            >
              <FiX />
            </button>
          </div>
        </div>
      )}
    </main>
  );
};

export default DashboardPage;