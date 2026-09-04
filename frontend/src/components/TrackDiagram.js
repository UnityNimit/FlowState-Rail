import React, { useMemo, useEffect, useRef } from 'react';
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
  ['Freight', '#525860']
]);

const getTrainColor = (trainType = '') => trainColorMap.get(trainType.trim()) || '#3b82f6';

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
    <g ref={trainRef} className="minimal-train">
      <polygon points="18,-4 42,-11 42,11 18,4" className="train-light-beam" />
      <rect x="-24" y="-7.5" width="48" height="15" rx="7.5" fill={color} className="train-capsule-body" />
      <rect x="12" y="-4.5" width="7" height="9" rx="2.5" className="train-cockpit-window" />
      <text x="-2" y="3" className="train-label-text">
        {train.id}
        {isBoarding ? ' [PAX]' : isHeld ? ' [HOLD]' : ''}
      </text>
    </g>
  );
};

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
  const nodesMap = useMemo(() => {
    if (!network?.nodes) return new Map();
    return new Map(network.nodes.map((n) => [n.id, n]));
  }, [network]);

  const { viewBox, safeMinX, safeMaxX } = useMemo(() => {
    if (!network?.nodes?.length) return { viewBox: '0 0 2600 600', safeMinX: 0, safeMaxX: 2600 };
    
    let minX = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    network.nodes.forEach((n) => {
      if (n.position.x < minX) minX = n.position.x;
      if (n.position.x > maxX) maxX = n.position.x;
      if (n.position.y > maxY) maxY = n.position.y;
    });

    const paddingX = 140; 
    const paddingBottom = 160; 
    
    const safeMinX = minX - paddingX;
    const safeMaxX = maxX + paddingX;
    const width = safeMaxX - safeMinX;
    const height = maxY + paddingBottom;
    
    return { 
      viewBox: `${safeMinX} 0 ${width} ${height}`, 
      safeMinX, 
      safeMaxX 
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
    y: [135, 205, 295, 365][index] || (130 + index * 70)
  }));
  const westConnection = stationMeta?.westConnection || corridorMeta?.westConnection || 'WESTERN APPROACH';
  const eastConnection = stationMeta?.eastConnection || corridorMeta?.eastConnection || 'EASTERN APPROACH';

  return (
    <div className="track-canvas-container">
      <TransformWrapper
        limitToBounds={false}
        minScale={0.15}    
        maxScale={8}
        initialScale={5}
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
              <pattern id="maint-hazard" width="12" height="12" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
                <line x1="0" y1="0" x2="0" y2="12" stroke="#f59e0b" strokeWidth="4" />
                <line x1="6" y1="0" x2="6" y2="12" stroke="#121417" strokeWidth="4" />
              </pattern>
            </defs>

            <rect id="canvas-bg-target" x="-1000" y="-1000" width="10000" height="4000" fill="transparent" />

            {corridorMeta?.infrastructure?.map((item) => (
              <g key={item.id} className="minimal-corridor-infra">
                <rect x={item.x - item.width / 2} y="86" width={item.width} height="340" rx="3" className="infra-landmark-rect" />
                <text x={item.x} y="102" textAnchor="middle" className="infra-landmark-label">{item.name.toUpperCase()}</text>
              </g>
            ))}

            {corridorMeta?.stations?.map((station) => (
              <g key={station.code} transform={`translate(${station.x}, 52)`} className="minimal-station-gantry">
                <line x1="0" y1="20" x2="0" y2="380" className="station-boundary-guide" />
                <rect x="-42" y="-10" width="84" height="20" rx="3" className="station-code-box" />
                <text x="0" y="0" textAnchor="middle" className="station-code-text">{station.code}</text>
                <text x="0" y="8" textAnchor="middle" className="station-km-text">
                  KM {station.chainageKm !== undefined ? station.chainageKm.toFixed(1) : ''}
                </text>
              </g>
            ))}

            <g transform={`translate(${safeMinX + 40}, 38)`}>
              <text className="corridor-direction-text">WEST APPROACH · {westConnection.toUpperCase()}</text>
            </g>
            <g transform={`translate(${safeMaxX - 250}, 38)`}>
              <text className="corridor-direction-text">EAST DEPARTURE · {eastConnection.toUpperCase()}</text>
            </g>

            {platforms.map((pf) => {
              const isUp = pf.direction === 'WEST';
              return (
                <g key={pf.number} className="platform-island-group">
                  <rect x={pf.x_start} y={pf.y - 10} width={pf.x_end - pf.x_start} height={20} rx="3" className={isUp ? 'pf-island-up' : 'pf-island-dn'} />
                  <text x={pf.x_start + 65} y={pf.y + 3.5} className="pf-number-text">{`PF ${pf.number} ${isUp ? 'UP' : 'DN'}`}</text>
                </g>
              );
            })}

            {tracksMeta.map((tm) => (
              <g key={tm.index} transform={`translate(${safeMinX + 10}, ${tm.y})`} className="minimal-line-label">
                <text x="0" y="3.5" className="minimal-line-text">{tm.name}</text>
              </g>
            ))}

            <g id="track-segments">
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
                  <g key={segment.id} className="segment-render-group">
                    <line
                      x1={startNode.position.x} y1={startNode.position.y} x2={endNode.position.x} y2={endNode.position.y}
                      className="rail-hitbox-target"
                      onClick={(e) => { e.stopPropagation(); if (onTrackClick) onTrackClick(segment.id); }}
                    />
                    <line
                      x1={startNode.position.x} y1={startNode.position.y} x2={endNode.position.x} y2={endNode.position.y}
                      className={`minimal-rail-base ${isCrossover ? 'crossover' : ''} ${isSelected ? 'selected' : ''}`}
                    />
                    {isBlocked ? (
                      <line x1={startNode.position.x} y1={startNode.position.y} x2={endNode.position.x} y2={endNode.position.y} className="minimal-rail-hazard" stroke="url(#maint-hazard)" />
                    ) : isOccupied ? (
                      <line x1={startNode.position.x} y1={startNode.position.y} x2={endNode.position.x} y2={endNode.position.y} className="minimal-rail-occupied" />
                    ) : isLocked ? (
                      <line x1={startNode.position.x} y1={startNode.position.y} x2={endNode.position.x} y2={endNode.position.y} className="minimal-rail-locked" />
                    ) : null}

                    {showSpeeds && (
                      <text x={midX} y={midY - 6} className="minimal-speed-text">
                        {segment.permissibleSpeedKph || segment.speedLimit || 60}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>

            <g id="interlocking-nodes">
              {network.nodes.map((node) => {
                const isSelected = selectedAssetId === node.id;

                if (node.type === 'SIGNAL') {
                  const isGreen = (node.state || 'RED').toUpperCase() === 'GREEN';
                  return (
                    <g
                      key={node.id}
                      transform={`translate(${node.position.x}, ${node.position.y})`}
                      className={`minimal-signal ${isSelected ? 'selected' : ''}`}
                      onClick={(e) => { e.stopPropagation(); if (onSignalClick) onSignalClick(node.id); }}
                    >
                      <circle cx="0" cy="-10" r="14" fill="transparent" />
                      <line x1="0" y1="0" x2="0" y2="-10" className="signal-mast" />
                      <circle cx="0" cy="-10" r="4.5" className={isGreen ? 'sig-dot-green' : 'sig-dot-red'} />
                      {showNames && <text x="0" y="-17" className="sig-name-text">{node.label || node.id}</text>}
                    </g>
                  );
                }

                if (node.type === 'SWITCH') {
                  const isReverse = (node.state || 'NORMAL').toUpperCase() === 'REVERSE';
                  return (
                    <g key={node.id} transform={`translate(${node.position.x}, ${node.position.y})`} className="minimal-switch">
                      <polygon points="-3.5,-3.5 0,-6 3.5,-3.5 0,6" className={`switch-blade-solid ${isReverse ? 'reverse' : 'normal'}`} />
                    </g>
                  );
                }

                if (node.type === 'BUFFER_STOP') {
                  return (
                    <g key={node.id} transform={`translate(${node.position.x}, ${node.position.y})`} className="minimal-buffer-stop">
                      <line x1="0" y1="-8" x2="0" y2="8" className="buffer-bar" />
                      <polygon points="-4,-4 0,0 -4,4" className="buffer-bracket" />
                    </g>
                  );
                }

                return null;
              })}
            </g>

            <g id="trains">
              {/* CHANGED: Now trains show immediately as soon as they get a plan (WAITING_PLAN -> READY_TO_PROCEED) */}
              {trains?.filter((t) => t.state !== 'WAITING_PLAN' && t.state !== 'EXITED').map((train) => {
                const pos = calculateTrainPosition(train);
                if (!pos) return null;
                const color = getTrainColor(train.type);
                return <TrainElement key={train.id} train={train} pos={pos} color={color} />;
              })}
            </g>
          </svg>
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
};

export default TrackDiagram;