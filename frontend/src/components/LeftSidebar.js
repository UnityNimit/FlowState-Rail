import React, { useState, useEffect } from 'react';
import './LeftSidebar.css';
import {
  FiPlus,
  FiX,
  FiAlertTriangle,
  FiTool,
  FiTrendingDown,
  FiClock,
  FiCloudDrizzle,
  FiChevronsUp,
  FiLayers
} from 'react-icons/fi';
import socketService from '../services/socketService';

const ToggleSwitch = ({ label, icon, isChecked, onToggle, isDisabled = false }) => (
  <div className={`telemetry-toggle-row ${isDisabled ? 'disabled' : ''}`}>
    <div className="toggle-info">
      <span className="toggle-icon">{icon}</span>
      <span className="toggle-name">{label}</span>
    </div>
    <label className="scada-switch">
      <input type="checkbox" checked={isChecked} onChange={onToggle} disabled={isDisabled} />
      <span className="scada-slider"></span>
    </label>
  </div>
);

const priorityOrder = [
  { key: 'congestion', label: 'Network Headway Congestion', icon: <FiTrendingDown /> },
  { key: 'trainType', label: 'Rolling Stock Precedence', icon: <FiChevronsUp /> },
  { key: 'punctuality', label: 'Punctuality (Delay Penalties)', icon: <FiClock /> },
  { key: 'trackCondition', label: 'Track Geometry (TMS Safety)', icon: <FiTool /> },
  { key: 'weather', label: 'Adverse OHE & Micro-climate', icon: <FiCloudDrizzle /> }
];

const PRESET_ZONES = [
  { id: 'MZ-DSA-ANVR', name: 'DSA–ANVR Joint Possession', dept: 'ENG / S&T / TRD' },
  { id: 'MZ-SBB-GZB', name: 'SBB–GZB Integrated Block', dept: 'ENG / S&T / TRD' }
];

const LeftSidebar = ({
  simulationStatus,
  blockedTracks = [],
  onBlockedTracksChange
}) => {
  const [aiPriorities, setAiPriorities] = useState({
    congestion: true,
    trainType: true,
    punctuality: true,
    trackCondition: true,
    weather: false
  });
  const [circuitInput, setCircuitInput] = useState('');
  const [activeZones, setActiveZones] = useState(new Set());

  useEffect(() => {
    socketService.emit('controller_set_priorities', aiPriorities);
  }, [aiPriorities]);

  const handlePriorityToggle = (priorityKey) => {
    if (priorityKey === 'congestion' || priorityKey === 'trackCondition') return;
    setAiPriorities((prev) => ({ ...prev, [priorityKey]: !prev[priorityKey] }));
  };

  const handleAddTrackBlock = (e) => {
    e?.preventDefault();
    const trackId = circuitInput.toUpperCase().trim();
    if (trackId && !blockedTracks.includes(trackId)) {
      const updated = [...blockedTracks, trackId];
      onBlockedTracksChange(updated);
      socketService.emit('controller_set_track_status', { trackId, status: 'FAULTY' });
      setCircuitInput('');
    }
  };

  const handleRemoveTrackBlock = (trackId) => {
    const updated = blockedTracks.filter((t) => t !== trackId);
    onBlockedTracksChange(updated);
    socketService.emit('controller_set_track_status', { trackId, status: 'OPERATIONAL' });
  };

  const handleToggleZone = (zoneId) => {
    const nextZones = new Set(activeZones);
    const isActivating = !nextZones.has(zoneId);

    if (isActivating) {
      nextZones.add(zoneId);
    } else {
      nextZones.delete(zoneId);
    }

    setActiveZones(nextZones);
    socketService.emit('controller_set_maintenance_zone', {
      zoneId,
      active: isActivating
    });
  };

  return (
    <div className="assets-drawer-content">
      {/* 1. Coordinated Departmental Maintenance (SIH Problem Statement Focus) */}
      <section className="drawer-section">
        <div className="section-title-row">
          <FiLayers className="section-icon" />
          <span className="section-title">JOINT POSSESSION BLOCKS</span>
          <span className="section-meta">TMS · SMMS · TDMS</span>
        </div>
        <div className="zone-button-grid">
          {PRESET_ZONES.map((zone) => {
            const isActive = activeZones.has(zone.id);
            return (
              <button
                key={zone.id}
                onClick={() => handleToggleZone(zone.id)}
                className={`zone-chip ${isActive ? 'active' : ''}`}
                title={`Toggle joint possession for ${zone.id}`}
              >
                <div className="zone-chip-header">
                  <span className="zone-id">{zone.id}</span>
                  <span className={`zone-status-dot ${isActive ? 'active' : ''}`} />
                </div>
                <div className="zone-chip-name">{zone.name}</div>
                <div className="zone-chip-dept">{zone.dept}</div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 2. Single Track Circuit Isolation */}
      <section className="drawer-section">
        <div className="section-title-row">
          <FiAlertTriangle className="section-icon" />
          <span className="section-title">TRACK CIRCUIT ISOLATION</span>
          <span className="section-badge">{blockedTracks.length}</span>
        </div>

        <form onSubmit={handleAddTrackBlock} className="circuit-entry-form">
          <input
            type="text"
            className="circuit-input"
            placeholder="e.g. COR-UP_FAST-DSA-ANVR-TC2"
            value={circuitInput}
            onChange={(e) => setCircuitInput(e.target.value)}
          />
          <button type="submit" className="circuit-submit-btn" title="Isolate Circuit">
            <FiPlus />
          </button>
        </form>

        <div className="isolated-circuits-container">
          {blockedTracks.length === 0 ? (
            <div className="empty-circuits-hint">All block sections operational. Zero active circuit locks.</div>
          ) : (
            blockedTracks.map((trackId) => (
              <div key={trackId} className="isolated-circuit-row">
                <span className="circuit-hazard-strip" />
                <span className="circuit-name">{trackId}</span>
                <button
                  type="button"
                  className="circuit-release-btn"
                  onClick={() => handleRemoveTrackBlock(trackId)}
                  title="Release Section Isolation"
                >
                  <FiX />
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      {/* 3. Real-time Multi-Objective Solver Weights */}
      <section className="drawer-section">
        <div className="section-title-row">
          <FiTool className="section-icon" />
          <span className="section-title">SOLVER HEURISTICS & WEIGHTS</span>
        </div>
        <div className="telemetry-toggle-list">
          {priorityOrder.map((p) => (
            <ToggleSwitch
              key={p.key}
              label={p.label}
              icon={p.icon}
              isChecked={aiPriorities[p.key]}
              onToggle={() => handlePriorityToggle(p.key)}
              isDisabled={p.key === 'congestion' || p.key === 'trackCondition'}
            />
          ))}
        </div>
      </section>
    </div>
  );
};

export default LeftSidebar;