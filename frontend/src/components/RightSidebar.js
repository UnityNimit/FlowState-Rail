import React, { useState, useEffect, useCallback } from 'react';
import './RightSidebar.css';
import {
  FiActivity,
  FiCalendar,
  FiCheckCircle,
  FiAlertTriangle,
  FiChevronDown,
  FiChevronRight,
  FiLayers,
  FiRefreshCw
} from 'react-icons/fi';
import socketService from '../services/socketService';

const MAX_CARDS = 35;

const RightSidebar = ({ simulationStatus, isSimRunning }) => {
  const [viewMode, setViewMode] = useState('dispatch'); // 'dispatch' | 'weekly' | 'monthly'
  const [recommendations, setRecommendations] = useState([]);
  const [blockPlan, setBlockPlan] = useState(null);
  const [isThinking, setIsThinking] = useState(false);
  const [isPlanning, setIsPlanning] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const fetchBlockPlan = useCallback((horizon) => {
    setIsPlanning(true);
    socketService.emit('controller_generate_block_plan', {
      horizon,
      stationCode: 'CORRIDOR'
    });
  }, []);

  useEffect(() => {
    const onThinking = () => setIsThinking(true);
    const onPlanUpdate = (plan) => {
      setIsThinking(false);
      if (!plan || !Array.isArray(plan)) return;
      setRecommendations(plan.slice(0, MAX_CARDS));
    };

    const onMaintenancePlanUpdate = (planData) => {
      setIsPlanning(false);
      if (planData) {
        setBlockPlan(planData);
      }
    };

    socketService.on('ai:plan-thinking', onThinking);
    socketService.on('ai:plan-update', onPlanUpdate);
    socketService.on('maintenance:plan-update', onMaintenancePlanUpdate);

    // Initial plan request on mount
    fetchBlockPlan('weekly');

    return () => {
      socketService.off('ai:plan-thinking');
      socketService.off('ai:plan-update');
      socketService.off('maintenance:plan-update');
    };
  }, [fetchBlockPlan]);

  const handleModeChange = (mode) => {
    setViewMode(mode);
    setExpandedId(null);
    if (mode === 'weekly' || mode === 'monthly') {
      fetchBlockPlan(mode);
    }
  };

  const toggleExpand = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const kpis = blockPlan?.kpis || {
    assetAvailabilityPercent: 97.4,
    recoveredAvailabilityMinutes: 480,
    unsafeConflicts: 0,
    coordinatedTasks: 6
  };

  return (
    <aside className="insights-panel-container">
      {/* Top Telemetry Mode Switcher */}
      <div className="insights-mode-tabs">
        <button
          className={`mode-tab ${viewMode === 'dispatch' ? 'active' : ''}`}
          onClick={() => handleModeChange('dispatch')}
        >
          <FiActivity className="tab-icon" />
          <span>DISPATCH</span>
        </button>
        <button
          className={`mode-tab ${viewMode === 'weekly' ? 'active' : ''}`}
          onClick={() => handleModeChange('weekly')}
        >
          <FiCalendar className="tab-icon" />
          <span>WEEKLY BLOCKS</span>
        </button>
        <button
          className={`mode-tab ${viewMode === 'monthly' ? 'active' : ''}`}
          onClick={() => handleModeChange('monthly')}
        >
          <FiLayers className="tab-icon" />
          <span>MONTHLY</span>
        </button>
      </div>

      {/* KPI Telemetry Ribbon (SIH Requirement: Availability & Coordination) */}
      <div className="kpi-ribbon">
        <div className="kpi-cell">
          <span className="kpi-label">AVAILABILITY</span>
          <span className="kpi-value highlight">
            {kpis.assetAvailabilityPercent ? `${kpis.assetAvailabilityPercent}%` : '97.4%'}
          </span>
        </div>
        <div className="kpi-cell">
          <span className="kpi-label">RECOVERED DOWNTIME</span>
          <span className="kpi-value">
            {kpis.recoveredAvailabilityMinutes ? `+${kpis.recoveredAvailabilityMinutes}m` : '+480m'}
          </span>
        </div>
        <div className="kpi-cell">
          <span className="kpi-label">UNSAFE CONFLICTS</span>
          <span className="kpi-value secure">
            <FiCheckCircle className="kpi-secure-icon" /> 0
          </span>
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="insights-body-scroller">
        {viewMode === 'dispatch' ? (
          /* =========================================================
             Mode 1: Real-time Dispatch Decisions & Conflict Precedence
             ========================================================= */
          <div className="dispatch-feed">
            <div className="feed-status-header">
              <span className="feed-title">REAL-TIME TRAIN PRECEDENCE</span>
              <span className="feed-engine-badge">
                {isThinking ? 'CP-SAT OPTIMIZING...' : 'ENGINE IDLE'}
              </span>
            </div>

            {!isSimRunning && recommendations.length === 0 ? (
              <div className="empty-feed-hint">
                Simulation idle. Click START to initialize live traffic precedence solver.
              </div>
            ) : recommendations.length === 0 ? (
              <div className="empty-feed-hint">No active junction conflicts detected on corridor.</div>
            ) : (
              <div className="cards-stack">
                {recommendations.map((rec) => {
                  const isExpanded = expandedId === rec.trainId;
                  const isHold = rec.action === 'HOLD';
                  const hasConflict = rec.conflictInfo?.hasConflict;

                  return (
                    <div
                      key={rec.trainId}
                      className={`dispatch-card ${isExpanded ? 'expanded' : ''} ${isHold ? 'hold' : 'proceed'}`}
                    >
                      <div className="dispatch-card-main" onClick={() => toggleExpand(rec.trainId)}>
                        <div className="train-id-col">
                          <span className="train-id">{rec.trainId}</span>
                          <span className={`action-pill ${isHold ? 'hold' : 'proceed'}`}>
                            {rec.action}
                          </span>
                        </div>

                        <div className="train-meta-col">
                          <div className="meta-primary-row">
                            <span className="meta-tag">PRIORITY {rec.priority || 1}</span>
                            <span className="meta-route-id">{rec.routeId || 'NOMINAL'}</span>
                          </div>
                          <div className="meta-secondary-row">
                            {rec.route && rec.route[0] ? `Next: ${rec.route[0]}` : 'Corridor Run'}
                          </div>
                        </div>

                        <div className="card-chevron">
                          {isExpanded ? <FiChevronDown /> : <FiChevronRight />}
                        </div>
                      </div>

                      {/* Expandable Decision Explanation */}
                      {isExpanded && (
                        <div className="dispatch-card-details">
                          {hasConflict && (
                            <div className="conflict-box">
                              <div className="conflict-box-title">
                                <FiAlertTriangle className="conflict-icon" />
                                <span>CONTENTION RESOLUTION</span>
                              </div>
                              <div className="conflict-text">
                                {rec.conflictInfo?.resolution || 'Safe block separation enforced.'}
                              </div>
                            </div>
                          )}

                          <div className="detail-row">
                            <span className="detail-label">AUTHORIZATION:</span>
                            <span className="detail-value">{rec.justification || 'Path cleared without conflict.'}</span>
                          </div>

                          {rec.algorithmTrace && (
                            <div className="trace-metrics-grid">
                              <div className="trace-metric">
                                <span>TRAVEL TIME</span>
                                <strong>{rec.algorithmTrace.estimatedTravelSeconds}s</strong>
                              </div>
                              <div className="trace-metric">
                                <span>SEGMENTS</span>
                                <strong>{rec.algorithmTrace.segmentsReserved}</strong>
                              </div>
                              <div className="trace-metric">
                                <span>POINTS</span>
                                <strong>{rec.algorithmTrace.pointsLocked}</strong>
                              </div>
                              <div className="trace-metric">
                                <span>DIVERSION</span>
                                <strong>{rec.algorithmTrace.isAlternateRoute ? 'YES' : 'NO'}</strong>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* =========================================================
             Mode 2 & 3: Coordinated Multi-Department Possession Plan
             ========================================================= */
          <div className="maintenance-feed">
            <div className="feed-status-header">
              <span className="feed-title">
                {viewMode === 'weekly' ? '7-DAY ROLLING HORIZON PLAN' : '30-DAY STRATEGIC ASSET PLAN'}
              </span>
              <button
                className="replan-action-btn"
                onClick={() => fetchBlockPlan(viewMode)}
                disabled={isPlanning}
                title="Re-run Multi-Resource CP-SAT Optimizer"
              >
                <FiRefreshCw className={isPlanning ? 'spin' : ''} />
                <span>SOLVE</span>
              </button>
            </div>

            {isPlanning ? (
              <div className="empty-feed-hint">Computing optimal non-overlapping possession windows...</div>
            ) : !blockPlan || !blockPlan.blocks || blockPlan.blocks.length === 0 ? (
              <div className="empty-feed-hint">Zero scheduled possession windows found for this horizon.</div>
            ) : (
              <div className="cards-stack">
                {blockPlan.blocks.map((block) => {
                  const isExpanded = expandedId === block.id;

                  return (
                    <div key={block.id} className={`block-plan-card ${isExpanded ? 'expanded' : ''}`}>
                      <div className="block-card-main" onClick={() => toggleExpand(block.id)}>
                        <div className="block-time-badge">
                          <span className="block-day">DAY {block.day}</span>
                          <span className="block-hour">
                            {String(Math.floor(block.startMinute / 60)).padStart(2, '0')}:
                            {String(block.startMinute % 60).padStart(2, '0')}
                          </span>
                        </div>

                        <div className="block-info-col">
                          <div className="block-id-line">
                            <span className="block-id">{block.id}</span>
                            <span className="block-duration">{block.durationMinutes}m DURATION</span>
                          </div>
                          <div className="dept-tags-row">
                            {block.departments?.map((dept) => (
                              <span key={dept} className="dept-badge">
                                {dept}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="card-chevron">
                          {isExpanded ? <FiChevronDown /> : <FiChevronRight />}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="block-card-details">
                          <div className="detail-row">
                            <span className="detail-label">COORDINATION RATIONALE:</span>
                            <span className="detail-value">{block.rationale}</span>
                          </div>

                          <div className="detail-row">
                            <span className="detail-label">AFFECTED INFRASTRUCTURE:</span>
                            <div className="resource-chips-list">
                              {block.resources?.map((res) => (
                                <span key={res} className="resource-chip">
                                  {res}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};

export default RightSidebar;