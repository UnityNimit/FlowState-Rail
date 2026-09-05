import React, { useMemo, useEffect, useRef, useState } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import gsap from 'gsap';
import './TrackDiagram.css';

const trainColorMap = new Map([
  ['Shatabdi', '#2563eb'],
  ['Rajdhani', '#dc2626'],
  ['Vande Bharat', '#0284c7'],
  ['Passenger', '#15803d'],
  ['DMU', '#d97706'],
  ['MEMU', '#ea580c'],
  ['SF Express', '#0d9488'],
  ['Mail', '#b45309'],
  ['Express', '#3b82f6'],
  ['Freight', '#64748b']
]);

const getTrainColor = (trainType = '') => trainColorMap.get(trainType.trim()) || '#3b82f6';

/* --------------------------------------------------------------------------
   GSAP Animated Rolling Stock Capsule
   -------------------------------------------------------------------------- */
const TrainElement = ({ train, pos, color }) => {
  const trainRef = useRef(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (!trainRef.current || !pos) return;

    if (isFirstRender.current) {
      gsap.set(trainRef.current, {
        x: pos.x,
        y: pos.y,
        rotation: pos.angle,
        transformOrigin: "center center"
      });
      isFirstRender.current = false;
    } else {
      gsap.to(trainRef.current, {
        x: pos.x,
        y: pos.y,
        rotation: `${pos.angle}_short`,
        duration: 0.95,
        ease: "none",
        overwrite: "auto",
        transformOrigin: "center center"
      });
    }
  }, [pos.x, pos.y, pos.angle]);

  const isHeld = train.state === 'HOLD';
  const isBoarding = train.state === 'BOARDING_PASSENGERS';

  return (
    <g ref={trainRef} className="scada-train-unit">
      <polygon points="20,-5 48,-14 48,14 20,5" className="train-headlight-cone" />
      <rect x="-26" y="-8.5" width="52" height="17" rx="8.5" fill={color} className="train-hull" />
      <rect x="14" y="-5.5" width="8" height="11" rx="2.5" className="train-windshield" />
      <text x="-4" y="3.5" className="train-id-text">
        {train.id}
        {isBoarding ? ' [PAX]' : isHeld ? ' [HOLD]' : ''}
      </text>
    </g>
  );
};

/* --------------------------------------------------------------------------
   Master SCADA Section Diagram Canvas
   -------------------------------------------------------------------------- */
const TrackDiagram = ({
  network,
  trains = [],
  onSignalClick,
  onTrackClick,
  showNames = false,
  showSpeeds = false,
  activeMaintenanceBlocks = [],
  selectedAssetId = null
}) => {
  const [hoveredTrack, setHoveredTrack] = useState(null);

  const nodesMap = useMemo(() => {
    if (!network?.nodes) return new Map();
    return new Map(network.nodes.map((n) => [n.id, n]));
  }, [network]);

  // CHANGED: Tight vertical framing to eliminate empty black void
  const { viewBox, safeMinX, safeMaxX, safeMinY } = useMemo(() => {
    if (!network?.nodes?.length) return { viewBox: '0 0 3600 500', safeMinX: 0, safeMaxX: 3600, safeMinY: 0 };

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    network.nodes.forEach((n) => {
      if (n.position.x < minX) minX = n.position.x;
      if (n.position.x > maxX) maxX = n.position.x;
      if (n.position.y < minY) minY = n.position.y;
      if (n.position.y > maxY) maxY = n.position.y;
    });

    const paddingX = 140;
    const paddingY = 70;

    const safeMinX = Math.max(0, minX - paddingX);
    const safeMaxX = maxX + paddingX;
    const width = safeMaxX - safeMinX;

    // Tight vertical crop directly around the active rails
    const safeMinY = Math.max(0, minY - paddingY);
    const height = (maxY - safeMinY) + paddingY * 2;

    return {
      viewBox: `${safeMinX} ${safeMinY} ${width} ${height}`,
      safeMinX,
      safeMaxX,
      safeMinY
    };
  }, [network]);

  const lockedSegmentIds = useMemo(() => {
    const locked = new Set();
    if (!trains) return locked;
    trains.forEach((train) => {
      const route = train.route || [];
      const routeIndex = route.indexOf(train.currentSegmentId);
      if (routeIndex >= 0) {
        locked.add(route[routeIndex]);
        if (['RUNNING', 'STOPPED_AWAITING_CLEARANCE'].includes(train.state) && route[routeIndex + 1]) {
          locked.add(route[routeIndex + 1]);
        }
      }
    });
    return locked;
  }, [trains]);

  const blockedSet = useMemo(() => new Set(activeMaintenanceBlocks), [activeMaintenanceBlocks]);

  const calculateTrainPosition = (train) => {
    if (!train.route || !train.node_path || !network?.trackSegments) return null;

    let startNodeId, endNodeId, posFraction;

    if (!train.currentSegmentId) {
      if (train.node_path.length < 2) return null;
      startNodeId = train.node_path[0];
      endNodeId = train.node_path[1];
      posFraction = 0;
    } else {
      const routeIndex = train.route.indexOf(train.currentSegmentId);
      if (routeIndex < 0) return null;
      startNodeId = train.node_path[routeIndex];
      endNodeId = train.node_path[routeIndex + 1];
      posFraction = Math.max(0, Math.min(1, train.positionOnSegment || 0));
    }

    const startNode = nodesMap.get(startNodeId);
    const endNode = nodesMap.get(endNodeId);
    if (!startNode || !endNode) return null;

    const x = startNode.position.x + (endNode.position.x - startNode.position.x) * posFraction;
    const y = startNode.position.y + (endNode.position.y - startNode.position.y) * posFraction;
    const angle = Math.atan2(endNode.position.y - startNode.position.y, endNode.position.x - startNode.position.x) * (180 / Math.PI);

    return { x, y, angle };
  };

  const handleSvgBackgroundClick = (e) => {
    if (e.target.classList.contains('minimal-svg-canvas') || e.target.id === 'canvas-bg-target') {
      if (onTrackClick) onTrackClick(null);
    }
  };

  if (!network?.nodes || !network?.trackSegments) return null;

  const stationMeta = network.station || null;
  const corridorMeta = network.corridor || null;
  const platforms = stationMeta?.platforms || [];
  const tracksMeta = stationMeta?.tracksMeta || (corridorMeta?.lines || []).map((line, index) => ({
    index: line.id,
    name: `${line.name} · ${line.direction}`,
    y: [150, 210, 310, 370][index] || (150 + index * 60)
  }));
  const westConnection = stationMeta?.westConnection || corridorMeta?.westConnection || 'DELHI JN';
  const eastConnection = stationMeta?.eastConnection || corridorMeta?.eastConnection || 'GHAZIABAD JN';

  return (
    <div className="track-canvas-container">
      <TransformWrapper
        limitToBounds={false}
        minScale={0.2}
        maxScale={8}
        initialScale={4.7}
        centerOnInit={true}
        doubleClick={{ disabled: true }}
      >
        <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }}>
          <svg
            width="100%"
            height="100%"
            viewBox={viewBox}
            preserveAspectRatio="xMidYMid meet"
            className="minimal-svg-canvas"
            onClick={handleSvgBackgroundClick}
          >
            <defs>
              <pattern id="maint-hazard-heavy" width="16" height="16" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
                <line x1="0" y1="0" x2="0" y2="16" stroke="#f59e0b" strokeWidth="6" />
                <line x1="8" y1="0" x2="8" y2="16" stroke="#0a0c0e" strokeWidth="6" />
              </pattern>
            </defs>

            {/* Clickable Background Target */}
            <rect id="canvas-bg-target" x="-2000" y="-1000" width="12000" height="5000" fill="transparent" />

            {/* =========================================================
                1. CLEAN OVERHEAD LANDMARKS (ZERO GIANT BLACK BLOCKS)
                ========================================================= */}
            {corridorMeta?.infrastructure?.map((item) => (
              <g key={item.id} className="scada-infra-marker" transform={`translate(${item.x}, ${safeMinY + 20})`}>
                <line x1="-60" y1="0" x2="60" y2="0" className="infra-header-line" />
                <text x="0" y="-8" textAnchor="middle" className="scada-landmark-title">
                  {item.name}
                </text>
              </g>
            ))}

            {/* =========================================================
                2. STATION GANTRY POSTS & CHAINAGE MARKERS
                ========================================================= */}
            {corridorMeta?.stations?.map((station) => (
              <g key={station.code} transform={`translate(${station.x}, ${safeMinY + 45})`} className="scada-station-gantry">
                <line x1="0" y1="18" x2="0" y2="340" className="station-boundary-guide" />
                <text x="0" y="0" textAnchor="middle" className="station-monolith-code">
                  {station.code}
                </text>
                <text x="0" y="14" textAnchor="middle" className="station-chainage-text">
                  KM {station.chainageKm !== undefined ? station.chainageKm.toFixed(1) : '0.0'}
                </text>
              </g>
            ))}

            {/* Section Outer Flanks */}
            <g transform={`translate(${safeMinX + 30}, ${safeMinY + 45})`}>
              <text className="scada-boundary-label">&lt;-- {westConnection.toUpperCase()}</text>
            </g>
            <g transform={`translate(${safeMaxX - 220}, ${safeMinY + 45})`}>
              <text className="scada-boundary-label">{eastConnection.toUpperCase()} --&gt;</text>
            </g>

            {/* Station Platforms (Platform Islands) */}
            {platforms.map((pf) => {
              const isUp = pf.direction === 'EAST';
              return (
                <g key={pf.number} className="scada-platform-island">
                  <rect
                    x={pf.x_start}
                    y={pf.y - 10}
                    width={pf.x_end - pf.x_start}
                    height={20}
                    rx="2"
                    className="platform-slab"
                  />
                  <text x={pf.x_start + 65} y={pf.y + 3.5} className="platform-code-text">
                    {`PF ${pf.number} ${isUp ? 'UP' : 'DN'}`}
                  </text>
                </g>
              );
            })}

            {/* Line Identifiers on West Flank */}
            {tracksMeta.map((tm) => (
              <g key={tm.index} transform={`translate(${safeMinX + 15}, ${tm.y})`} className="scada-track-identifier">
                <text x="0" y="3.5" className="scada-track-name">
                  {tm.name}
                </text>
              </g>
            ))}

            {/* =========================================================
                3. TRACK CIRCUITS (THICK VISIBLE RAILS)
                ========================================================= */}
            <g id="track-circuits-layer">
              {network.trackSegments.map((segment) => {
                const startNode = nodesMap.get(segment.startNodeId);
                const endNode = nodesMap.get(segment.endNodeId);
                if (!startNode || !endNode) return null;

                const isBlocked = segment.status === 'FAULTY' || segment.status === 'MAINTENANCE' || blockedSet.has(segment.id);
                const isLocked = lockedSegmentIds.has(segment.id);
                const isOccupied = segment.isOccupied;
                const isSelected = selectedAssetId === segment.id;
                const isCrossover = segment.lineId === 'CROSSOVER' || segment.id.includes('-XO-');

                const midX = (startNode.position.x + endNode.position.x) / 2;
                const midY = (startNode.position.y + endNode.position.y) / 2;

                return (
                  <g
                    key={segment.id}
                    className="scada-segment-group"
                    onMouseEnter={() => setHoveredTrack(segment)}
                    onMouseLeave={() => setHoveredTrack(null)}
                  >
                    {/* Layer A: Heavy Ballast Underbed */}
                    <line
                      x1={startNode.position.x}
                      y1={startNode.position.y}
                      x2={endNode.position.x}
                      y2={endNode.position.y}
                      className="track-ballast-bed"
                    />

                    {/* Layer B: Steel Rail Core */}
                    <line
                      x1={startNode.position.x}
                      y1={startNode.position.y}
                      x2={endNode.position.x}
                      y2={endNode.position.y}
                      className={`scada-rail-core ${isCrossover ? 'crossover' : ''} ${isSelected ? 'selected' : ''}`}
                    />

                    {/* Layer C: Active Interlocking States */}
                    {isBlocked ? (
                      <line
                        x1={startNode.position.x}
                        y1={startNode.position.y}
                        x2={endNode.position.x}
                        y2={endNode.position.y}
                        className="rail-state-hazard"
                        stroke="url(#maint-hazard-heavy)"
                      />
                    ) : isOccupied ? (
                      <line
                        x1={startNode.position.x}
                        y1={startNode.position.y}
                        x2={endNode.position.x}
                        y2={endNode.position.y}
                        className="rail-state-occupied"
                      />
                    ) : isLocked ? (
                      <line
                        x1={startNode.position.x}
                        y1={startNode.position.y}
                        x2={endNode.position.x}
                        y2={endNode.position.y}
                        className="rail-state-locked"
                      />
                    ) : null}

                    {/* Layer D: 26px Wide Click Target */}
                    <line
                      x1={startNode.position.x}
                      y1={startNode.position.y}
                      x2={endNode.position.x}
                      y2={endNode.position.y}
                      className="rail-interactive-hitbox"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onTrackClick) onTrackClick(segment.id);
                      }}
                    />

                    {/* Line Speed Limit */}
                    {showSpeeds && (
                      <text x={midX} y={midY - 8} className="scada-speed-label">
                        {segment.permissibleSpeedKph || segment.speedLimit || 60}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>

            {/* =========================================================
                4. INTERLOCKING SIGNALS & POINTS
                ========================================================= */}
            <g id="interlocking-nodes-layer">
              {network.nodes.map((node) => {
                const isSelected = selectedAssetId === node.id;

                /* --- High-Contrast Optical Signals --- */
                if (node.type === 'SIGNAL') {
                  const state = (node.state || 'RED').toUpperCase();
                  const isGreen = state === 'GREEN';
                  const isAmber = state === 'AMBER' || state === 'CAUTION';
                  const isDoubleAmber = state === 'DOUBLE_AMBER';

                  return (
                    <g
                      key={node.id}
                      transform={`translate(${node.position.x}, ${node.position.y})`}
                      className={`scada-signal-gantry ${isSelected ? 'selected' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onSignalClick) onSignalClick(node.id);
                      }}
                    >
                      {/* Generous 22px click target */}
                      <circle cx="0" cy="-15" r="22" fill="transparent" />
                      
                      {/* Signal Mast */}
                      <line x1="0" y1="0" x2="0" y2="-15" className="scada-signal-pole" />

                      {/* Optical Signal Housing */}
                      <circle cx="0" cy="-15" r="10.5" className="signal-housing-plate" />

                      {/* Bright Active Lamp Lens */}
                      <circle
                        cx="0"
                        cy="-15"
                        r="7.5"
                        className={`signal-lamp ${
                          isGreen ? 'green' : isDoubleAmber ? 'double-amber' : isAmber ? 'amber' : 'red'
                        }`}
                      />

                      {/* Monospaced ID Tag */}
                      {showNames && (
                        <text x="0" y="-28" textAnchor="middle" className="signal-id-tag">
                          {node.label || node.id}
                        </text>
                      )}
                    </g>
                  );
                }

                /* --- Motorized Interlocking Turnout Points --- */
                if (node.type === 'SWITCH') {
                  const isReverse = (node.state || 'NORMAL').toUpperCase() === 'REVERSE';
                  return (
                    <g
                      key={node.id}
                      transform={`translate(${node.position.x}, ${node.position.y})`}
                      className="scada-point-machine"
                    >
                      <rect x="-4" y="-4" width="8" height="8" rx="1.5" className="point-actuator-box" />
                      <polygon
                        points="-4,-3 0,-7 4,-3 0,7"
                        className={`switch-blade ${isReverse ? 'reverse' : 'normal'}`}
                      />
                    </g>
                  );
                }

                /* --- Dead-End Hydraulic Buffer Stops --- */
                if (node.type === 'BUFFER_STOP') {
                  return (
                    <g
                      key={node.id}
                      transform={`translate(${node.position.x}, ${node.position.y})`}
                      className="scada-buffer-stop"
                    >
                      <line x1="0" y1="-8" x2="0" y2="8" className="buffer-post" />
                      <polygon points="-5,-5 0,0 -5,5" className="buffer-stanchion" />
                    </g>
                  );
                }

                return null;
              })}
            </g>

            {/* =========================================================
                5. ROLLING STOCK TRAIN CARRIAGES (GSAP ANIMATED)
                ========================================================= */}
            <g id="trains-traffic-layer">
              {trains
                ?.filter((t) => t.state !== 'WAITING_PLAN' && t.state !== 'EXITED')
                .map((train) => {
                  const pos = calculateTrainPosition(train);
                  if (!pos) return null;
                  const color = getTrainColor(train.type);
                  return <TrainElement key={train.id} train={train} pos={pos} color={color} />;
                })}
            </g>
          </svg>
        </TransformComponent>
      </TransformWrapper>

      {/* Floating Micro-Telemetry Inspection HUD */}
      {hoveredTrack && (
        <aside className="track-inspection-hud">
          <span className="hud-code">{hoveredTrack.id}</span>
          <span className="hud-metric">{hoveredTrack.permissibleSpeedKph || 60} KM/H</span>
          <span className={`hud-status-badge ${(hoveredTrack.status || 'OPERATIONAL').toLowerCase()}`}>
            {hoveredTrack.status || 'OPERATIONAL'}
          </span>
        </aside>
      )}
    </div>
  );
};

export default TrackDiagram;