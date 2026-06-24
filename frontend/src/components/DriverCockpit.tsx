'use client';

import React, { useRef, useEffect } from 'react';
import { Telemetry, Driver, DriverPosition } from '../hooks/useWebSocket';

interface DriverCockpitProps {
  driverId: string;
  history: Telemetry[];
  drivers: Driver[];
  standings: DriverPosition[];
  hoverIndex: number | null;
  onHoverIndexChange: (idx: number | null) => void;
}

export default function DriverCockpit({
  driverId,
  history,
  drivers,
  standings,
  hoverIndex,
  onHoverIndexChange
}: DriverCockpitProps) {

  const getDriverColor = (dId: string, fallback: string) => {
    const d = drivers.find(drv => drv.id === dId);
    if (!d) return fallback;
    let color = d.color;
    if (color.startsWith('FF')) color = color.substring(2);
    if (color.startsWith('#')) return color;
    return `#${color}`;
  };

  const getDriverName = (dId: string) => {
    const d = drivers.find(drv => drv.id === dId);
    return d ? d.name : dId;
  };

  const getSectorColorClass = (colorStr: string, timeVal: string | undefined) => {
    if (!timeVal || timeVal === '--.---') return 'inactive';
    switch (colorStr?.toUpperCase()) {
      case 'PURPLE': return 'purple';
      case 'GREEN': return 'green';
      case 'YELLOW': return 'yellow';
      default: return 'inactive';
    }
  };

  const color = getDriverColor(driverId, '#ef4444');
  const name = getDriverName(driverId);

  // Latest telemetry data points (fallback)
  const latest = history[history.length - 1] || {
    speed: 0,
    rpm: 0,
    throttle: 0,
    brake: 0,
    gear: 1,
    battery: 80,
    last_lap: '0:00.000',
    tyre_age: 0,
    laps: 1,
    is_pitting: false
  };

  // Find standings details for the driver
  const standing = standings.find(s => s.driver_id === driverId);

  const maxPoints = Math.max(history.length, 40);
  const activeHoverIdx = hoverIndex !== null ? Math.round(hoverIndex) : maxPoints - 1;
  const offsetFromEnd = Math.max(0, (maxPoints - 1) - activeHoverIdx);
  const idx = Math.max(0, history.length - 1 - offsetFromEnd);

  // Hovered telemetry data points
  const hoveredPoint = history[idx] || latest;

  const throttlePercent = Math.round(hoveredPoint.throttle * 100);
  const brakePercent = Math.round(hoveredPoint.brake * 100);
  const batteryPercent = Math.round(hoveredPoint.battery);

  const lapsCompleted = hoveredPoint.laps || (standing ? standing.laps : 0);
  const tyreCompound = standing ? standing.tyre : 'M';
  const tyreAge = hoveredPoint.tyre_age !== undefined ? hoveredPoint.tyre_age : (standing ? standing.tyre_age : 0);
  const isPitting = hoveredPoint.is_pitting !== undefined ? hoveredPoint.is_pitting : (standing ? standing.is_pitting : false);

  // Simulated settings based on driver configuration
  const getDriverBBias = (dId: string) => {
    switch (dId) {
      case 'VER': return 58.5;
      case 'HAM': return 59.0;
      case 'LEC': return 58.2;
      case 'NOR': return 57.5;
      case 'SAI': return 58.0;
      case 'RUS': return 58.8;
      case 'PIA': return 57.8;
      default: return 58.0;
    }
  };

  const getDriverDiff = (dId: string) => {
    switch (dId) {
      case 'VER': return 55;
      case 'HAM': return 54;
      case 'LEC': return 56;
      case 'NOR': return 53;
      case 'SAI': return 55;
      default: return 54;
    }
  };

  const isRetired = standing?.gap === 'DNF' || standing?.gap === 'DNS' || standing?.gap === 'DNQ';
  const bbias = getDriverBBias(driverId);
  const diff = getDriverDiff(driverId);

  // Calculate dynamic systems status based on telemetry at hover point
  let ersMode = 'RECOVERY (MGU-H)';
  if (isRetired) {
    ersMode = 'DISABLED';
  } else if (isPitting || hoveredPoint.speed < 5.0) {
    ersMode = 'ERS INACTIVE';
  } else if (hoveredPoint.brake > 0.1) {
    ersMode = 'HARVEST (MGU-K)';
  } else if (hoveredPoint.throttle > 0.8) {
    ersMode = 'OVERTAKE (DEPLOY)';
  } else if (hoveredPoint.throttle > 0.1) {
    ersMode = 'DEPLOY (BALANCED)';
  }

  let engineMode = 'MAP 2 (RACE - STD)';
  if (isRetired) {
    engineMode = 'SHUTDOWN';
  } else if (isPitting) {
    engineMode = 'MAP 1 (PIT LANE)';
  } else if (standing?.drs_active) {
    engineMode = 'MAP 3 (DRS BOOST)';
  } else if (hoveredPoint.throttle > 0.8) {
    engineMode = 'MAP 2 (RACE - HOT)';
  }

  const drsStatus = isRetired ? 'N/A' : (standing?.drs_active ? 'DRS DEPLOYED' : 'DRS INACTIVE');

  // Dynamic simulations for the new Tyre & Brake temperatures card
  const speedRatio = hoveredPoint.speed / 300.0;
  const flBrakeTemp = isRetired ? 35 : Math.round(200 + (hoveredPoint.brake * 550) + (speedRatio * 80));
  const frBrakeTemp = isRetired ? 35 : Math.round(200 + (hoveredPoint.brake * 540) + (speedRatio * 75));
  const rlBrakeTemp = isRetired ? 35 : Math.round(160 + (hoveredPoint.brake * 380) + (speedRatio * 60));
  const rrBrakeTemp = isRetired ? 35 : Math.round(160 + (hoveredPoint.brake * 370) + (speedRatio * 55));

  const baseTyreTemp = 85;
  const flTyreTemp = isRetired ? 35 : Math.round(baseTyreTemp + (speedRatio * 20) + (hoveredPoint.brake * 8));
  const frTyreTemp = isRetired ? 35 : Math.round(baseTyreTemp + (speedRatio * 21) + (hoveredPoint.brake * 8));
  const rlTyreTemp = isRetired ? 35 : Math.round(baseTyreTemp - 2 + (speedRatio * 23) + (hoveredPoint.throttle * 12));
  const rrTyreTemp = isRetired ? 35 : Math.round(baseTyreTemp - 2 + (speedRatio * 22) + (hoveredPoint.throttle * 12));

  const longG = isRetired ? 0.0 : (hoveredPoint.brake > 0.1 
    ? -(hoveredPoint.brake * 4.5) - (speedRatio * 0.8)
    : (hoveredPoint.throttle > 0.5 ? (hoveredPoint.throttle * 2.2) : 0.2));
  const latG = isRetired ? 0.0 : (hoveredPoint.speed > 100 
    ? (Math.sin(hoveredPoint.track_progress * Math.PI * 8) * (1.8 + speedRatio * 3.0)) 
    : 0.1);

  return (
    <div className="cockpit-grid">
      {/* Row 1: Steering LCD on left, Stacked analysis details on right */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '16px', alignItems: 'stretch' }}>
        {/* 1. Visual LCD Steering Wheel Panel */}
        <div className="panel-card wheel-card" style={{ height: '100%', margin: 0, justifyContent: 'center' }}>
          <div className="panel-header-title">{name} — COCKPIT DISPLAY</div>
          <div className={`wheel-lcd ${isRetired ? 'retired' : ''}`} style={isRetired ? {
            borderColor: 'rgba(239, 68, 68, 0.4)',
            boxShadow: '0 0 15px rgba(239, 68, 68, 0.15)',
            opacity: 0.8
          } : {}}>
            {/* LCD TOP (Driver id & lap info) */}
            <div className="lcd-top">
              <span className="lcd-driver-code" style={{ color: isRetired ? 'var(--text-secondary)' : color }}>{driverId}</span>
              <span className="lcd-lap">
                {isRetired ? `STATUS: ${standing?.gap || 'DNF'}` : `LAP: ${lapsCompleted} | ${hoveredPoint.last_lap || latest.last_lap}`}
              </span>
            </div>

            {/* LCD CENTER (Gear & Speed) */}
            {isRetired ? (
              <div className="lcd-center" style={{ flexDirection: 'column', gap: '2px', height: '60px', justifyContent: 'center' }}>
                <span className="lcd-retired-text" style={{
                  fontSize: '28px',
                  fontWeight: 'bold',
                  color: 'var(--accent-red)',
                  textShadow: '0 0 8px rgba(239, 68, 68, 0.6)',
                  letterSpacing: '1px'
                }}>
                  {standing?.gap || 'DNF'}
                </span>
                <span style={{ fontSize: '8px', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>
                  RETIRED FROM RACE
                </span>
              </div>
            ) : (
              <div className="lcd-center">
                <span className="lcd-gear">{hoveredPoint.gear === 0 ? 'N' : hoveredPoint.gear}</span>
                <div className="lcd-speed-container">
                  <span className="lcd-speed">{Math.round(hoveredPoint.speed)}</span>
                  <span className="lcd-speed-unit">KM/H</span>
                </div>
              </div>
            )}

            {/* LCD BARS (Throttle, Brake, ERS) */}
            <div className="lcd-bars" style={isRetired ? { opacity: 0.3 } : {}}>
              <div className="bar-row">
                <span className="bar-label">THR</span>
                <div className="bar-outer">
                  <div className="bar-inner throttle" style={{ width: `${isRetired ? 0 : throttlePercent}%` }} />
                </div>
                <span>{isRetired ? 0 : throttlePercent}%</span>
              </div>
              <div className="bar-row">
                <span className="bar-label">BRK</span>
                <div className="bar-outer">
                  <div className="bar-inner brake" style={{ width: `${isRetired ? 0 : brakePercent}%` }} />
                </div>
                <span>{isRetired ? 0 : brakePercent}%</span>
              </div>
              <div className="bar-row">
                <span className="bar-label">ERS</span>
                <div className="bar-outer">
                  <div className="bar-inner ers" style={{ width: `${isRetired ? 0 : batteryPercent}%` }} />
                </div>
                <span>{isRetired ? 0 : batteryPercent}%</span>
              </div>
            </div>

            {/* LCD BOTTOM (RPM & Tyre compound/status) */}
            <div className="lcd-bottom">
              <span>RPM: {isRetired ? 0 : hoveredPoint.rpm}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                TYRE: {isRetired ? (
                  <span style={{ color: 'var(--text-secondary)' }}>--</span>
                ) : (
                  <>
                    <span className={`tyre-badge ${tyreCompound}`} style={{ transform: 'scale(0.85)', margin: '0 -2px' }}>{tyreCompound}</span> ({tyreAge}L)
                  </>
                )}
              </span>
              <span className={`lcd-pit-status ${isRetired ? 'retired' : (isPitting ? 'pitting' : '')}`} style={{
                backgroundColor: isRetired ? 'var(--accent-red)' : (isPitting ? 'var(--accent-red)' : '#1e293b'),
                color: '#ffffff',
                padding: '1px 5px',
                borderRadius: '3px',
                fontSize: '8px',
                fontWeight: 'bold',
                textShadow: (isRetired || isPitting) ? '0 0 4px #fff' : 'none'
              }}>
                {isRetired ? 'OUT' : (isPitting ? 'IN PIT' : 'TRACK')}
              </span>
            </div>
          </div>
        </div>

        {/* Column 2: Stacked Analysis Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', justifyContent: 'space-between' }}>
          {/* 2. Driver Systems & Stats Analysis Card */}
          <div className="panel-card" style={{ display: 'flex', flexDirection: 'column', padding: '10px 14px', margin: 0, flex: 1 }}>
            <span className="panel-header-title" style={{ marginBottom: '8px', fontSize: '10px' }}>DRIVER SYSTEMS STATUS & SECTOR ANALYSIS</span>
            
            <div className="systems-grid">
              {/* Col 1: Timing & Gaps */}
              <div className="systems-col">
                <span className="systems-header">SESSION & TIMING</span>
                <div className="systems-item">
                  <span className="systems-item-label">Position</span>
                  <span className="systems-value" style={{ color }}>P{standing?.position || '--'}</span>
                </div>
                <div className="systems-item">
                  <span className="systems-item-label">Laps Completed</span>
                  <span className="systems-value">{lapsCompleted} / 66</span>
                </div>
                <div className="systems-item">
                  <span className="systems-item-label">Relative Gap</span>
                  <span className="systems-value" style={{ fontFamily: 'var(--font-mono)' }}>{standing?.gap || 'LEADER'}</span>
                </div>
                <div className="systems-item">
                  <span className="systems-item-label">Best Lap Time</span>
                  <span className="systems-value" style={{ color: '#c084fc' }}>{standing?.best_lap || '1:13.910'}</span>
                </div>
              </div>

              {/* Col 2: Settings & Bias */}
              <div className="systems-col">
                <span className="systems-header">CAR SETTINGS & BIAS</span>
                <div className="systems-item">
                  <span className="systems-item-label">Brake Bias (BBIAS)</span>
                  <span className="systems-value">{bbias.toFixed(1)}%</span>
                </div>
                <div className="systems-item">
                  <span className="systems-item-label">Differential (DIFF)</span>
                  <span className="systems-value">{diff}%</span>
                </div>
                <div className="systems-item">
                  <span className="systems-item-label">Engine Map</span>
                  <span className="systems-value" style={{ fontSize: '9px' }}>{engineMode}</span>
                </div>
                <div className="systems-item">
                  <span className="systems-item-label">DRS Status</span>
                  <span className="systems-value" style={{ color: standing?.drs_active ? 'var(--status-green)' : 'var(--text-secondary)' }}>
                    {drsStatus}
                  </span>
                </div>
              </div>

              {/* Col 3: Sectors & ERS */}
              <div className="systems-col">
                <span className="systems-header">SECTORS & POWERTRAIN</span>
                <div className="systems-item" style={{ fontSize: '9px' }}>
                  <span className="systems-item-label">Sector 1 (S1)</span>
                  <span className={`f1-sector-time ${getSectorColorClass(standing?.s1_color || '', standing?.s1)}`} style={{ padding: '1px 6px', borderRadius: '3px', fontSize: '9px' }}>
                    {standing?.s1 || '--.---'}
                  </span>
                </div>
                <div className="systems-item" style={{ fontSize: '9px' }}>
                  <span className="systems-item-label">Sector 2 (S2)</span>
                  <span className={`f1-sector-time ${getSectorColorClass(standing?.s2_color || '', standing?.s2)}`} style={{ padding: '1px 6px', borderRadius: '3px', fontSize: '9px' }}>
                    {standing?.s2 || '--.---'}
                  </span>
                </div>
                <div className="systems-item" style={{ fontSize: '9px' }}>
                  <span className="systems-item-label">Sector 3 (S3)</span>
                  <span className={`f1-sector-time ${getSectorColorClass(standing?.s3_color || '', standing?.s3)}`} style={{ padding: '1px 6px', borderRadius: '3px', fontSize: '9px' }}>
                    {standing?.s3 || '--.---'}
                  </span>
                </div>
                <div className="systems-item">
                  <span className="systems-item-label">Active ERS Mode</span>
                  <span className="systems-value" style={{ fontSize: '9px', color:ersMode.includes('DEPLOY') ? 'var(--accent-cyan)' : 'var(--status-yellow)' }}>
                    {ersMode}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Tyre & Brake Thermal Analysis Card */}
          <div className="panel-card" style={{ display: 'flex', flexDirection: 'column', padding: '10px 14px', margin: 0, flex: 1 }}>
            <span className="panel-header-title" style={{ marginBottom: '8px', fontSize: '10px' }}>TYRE & BRAKE THERMAL ANALYSIS</span>
            
            <div className="dynamics-container">
              {/* Tyre temperatures 2x2 grid */}
              <div className="tyre-grid">
                {/* Front Left */}
                <div className="tyre-temp-box FL">
                  <span className="tyre-pos-label">FL</span>
                  <div className="temp-values">
                    <span className="temp-val tyre-t">{flTyreTemp}°C</span>
                    <span className="temp-val brake-t">{flBrakeTemp}°C BRK</span>
                  </div>
                </div>
                {/* Front Right */}
                <div className="tyre-temp-box FR">
                  <span className="tyre-pos-label">FR</span>
                  <div className="temp-values">
                    <span className="temp-val tyre-t">{frTyreTemp}°C</span>
                    <span className="temp-val brake-t">{frBrakeTemp}°C BRK</span>
                  </div>
                </div>
                {/* Rear Left */}
                <div className="tyre-temp-box RL">
                  <span className="tyre-pos-label">RL</span>
                  <div className="temp-values">
                    <span className="temp-val tyre-t">{rlTyreTemp}°C</span>
                    <span className="temp-val brake-t">{rlBrakeTemp}°C BRK</span>
                  </div>
                </div>
                {/* Rear Right */}
                <div className="tyre-temp-box RR">
                  <span className="tyre-pos-label">RR</span>
                  <div className="temp-values">
                    <span className="temp-val tyre-t">{rrTyreTemp}°C</span>
                    <span className="temp-val brake-t">{rrBrakeTemp}°C BRK</span>
                  </div>
                </div>
              </div>

              {/* Dynamics info (G-forces) */}
              <div className="gforce-box">
                <span className="gforce-header">G-FORCE</span>
                <div className="gforce-readings">
                  <div className="g-reading">
                    <span className="g-label">LAT</span>
                    <span className="g-value">{latG.toFixed(1)}G</span>
                  </div>
                  <div className="g-reading">
                    <span className="g-label">LON</span>
                    <span className="g-value">{longG.toFixed(1)}G</span>
                  </div>
                </div>
                <div className="gforce-viz">
                  <div className="g-viz-circle">
                    <div className="g-viz-crosshair-h" />
                    <div className="g-viz-crosshair-v" />
                    <div className="g-viz-dot" style={{
                      transform: `translate(${Math.max(-16, Math.min(16, latG * 4.5))}px, ${Math.max(-16, Math.min(16, -longG * 4.5))}px)`
                    }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Row 2: Scrolling Telemetry Curves Stack */}
      <div className="panel-card" style={{ flex: 1, minHeight: '300px' }}>
        <div className="panel-header-title">COCKPIT DATA STRIPS (LAST 4s)</div>
        <div className="charts-scroll-container" style={{ flex: 1 }}>
          <SingleChartRow title="SPEED (km/h)" minY={0} maxY={360} value={hoveredPoint.speed} history={history.map(t => t.speed)} color={color} hoverIndex={hoverIndex} onHoverChange={onHoverIndexChange} />
          <SingleChartRow title="ENGINE RPM" minY={4000} maxY={13500} value={hoveredPoint.rpm} history={history.map(t => t.rpm)} color={color} isRpm hoverIndex={hoverIndex} onHoverChange={onHoverIndexChange} />
          <SingleChartRow title="GEAR" minY={0} maxY={8} value={hoveredPoint.gear} history={history.map(t => t.gear)} color={color} isStepped isGear hoverIndex={hoverIndex} onHoverChange={onHoverIndexChange} />
          <SingleChartRow title="THROTTLE (%)" minY={0} maxY={100} value={throttlePercent} history={history.map(t => t.throttle * 100)} color="#10b981" hoverIndex={hoverIndex} onHoverChange={onHoverIndexChange} />
          <SingleChartRow title="BRAKE (%)" minY={0} maxY={100} value={brakePercent} history={history.map(t => t.brake * 100)} color="#ef4444" hoverIndex={hoverIndex} onHoverChange={onHoverIndexChange} />
        </div>
      </div>
    </div>
  );
}

// ---------------- SINGLE CHART ROW COMPONENT (CANVAS POWERED) ----------------
interface SingleChartRowProps {
  title: string;
  minY: number;
  maxY: number;
  value: number;
  history: number[];
  color: string;
  isStepped?: boolean;
  isGear?: boolean;
  isRpm?: boolean;
  hoverIndex: number | null;
  onHoverChange: (idx: number | null) => void;
}

function SingleChartRow({
  title,
  minY,
  maxY,
  value,
  history,
  color,
  isStepped = false,
  isGear = false,
  isRpm = false,
  hoverIndex,
  onHoverChange
}: SingleChartRowProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const handleResize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    handleResize();

    const width = canvas.width / window.devicePixelRatio;
    const height = canvas.height / window.devicePixelRatio;

    ctx.clearRect(0, 0, width, height);

    const padLeft = 45;
    const padRight = 15;
    const padTop = 10;
    const padBottom = 10;
    const graphWidth = width - padLeft - padRight;
    const graphHeight = height - padTop - padBottom;

    // Draw Grid Lines (Horizontal)
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = '#1e293b';
    ctx.setLineDash([3, 3]);

    const steps = 3;
    for (let i = 0; i <= steps; i++) {
      const yVal = minY + ((maxY - minY) * i) / steps;
      const yPixel = padTop + graphHeight * (1 - i / steps);

      ctx.beginPath();
      ctx.moveTo(padLeft, yPixel);
      ctx.lineTo(width - padRight, yPixel);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '8px var(--font-mono)';
      ctx.textAlign = 'right';

      let label = yVal.toFixed(0);
      if (isRpm) label = `${(yVal / 1000).toFixed(1)}k`;
      else if (isGear && yVal === 0) label = 'N';

      ctx.fillText(label, padLeft - 8, yPixel + 3);
      ctx.setLineDash([3, 3]);
    }

    // Draw Grid Lines (Vertical)
    const pointsCount = Math.max(history.length, 40);
    const stepX = graphWidth / (pointsCount - 1);
    ctx.setLineDash([3, 3]);
    for (let i = 0; i < pointsCount; i += 10) {
      const xPixel = padLeft + i * stepX;
      ctx.beginPath();
      ctx.moveTo(xPixel, padTop);
      ctx.lineTo(xPixel, height - padBottom);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Mapping helpers
    const getXPixel = (index: number) => padLeft + index * stepX;
    const getYPixel = (val: number) => {
      const frac = (val - minY) / (maxY - minY);
      const clamped = Math.max(0, Math.min(1, frac));
      return padTop + graphHeight * (1 - clamped);
    };

    // Draw curve
    if (history.length > 0) {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = color;
      ctx.beginPath();

      if (isStepped) {
        ctx.moveTo(getXPixel(0), getYPixel(history[0]));
        for (let i = 1; i < history.length; i++) {
          ctx.lineTo(getXPixel(i), getYPixel(history[i - 1]));
          ctx.lineTo(getXPixel(i), getYPixel(history[i]));
        }
      } else {
        ctx.moveTo(getXPixel(0), getYPixel(history[0]));
        for (let i = 1; i < history.length; i++) {
          ctx.lineTo(getXPixel(i), getYPixel(history[i]));
        }
      }
      ctx.stroke();

      // Draw vertical Hover Cursor line
      const activeHoverIdx = hoverIndex !== null ? Math.round(hoverIndex) : pointsCount - 1;
      const cursorX = getXPixel(activeHoverIdx);
      
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(cursorX, padTop);
      ctx.lineTo(cursorX, height - padBottom);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw cursor dot on the hovered value
      const offsetFromEnd = Math.max(0, (pointsCount - 1) - activeHoverIdx);
      const latestIdx = Math.max(0, history.length - 1 - Math.round(offsetFromEnd));
      if (latestIdx >= 0 && history.length > 0) {
        const dotX = getXPixel(latestIdx);
        const dotY = getYPixel(history[latestIdx]);
        
        ctx.fillStyle = color;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(dotX, dotY, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

  }, [history, hoverIndex, showBottomScale]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;

    const padLeft = 45;
    const padRight = 15;
    const graphWidth = rect.width - padLeft - padRight;
    const cursorX = Math.max(0, Math.min(graphWidth, x - padLeft));

    const pointsCount = Math.max(history.length, 40);
    const fraction = cursorX / graphWidth;
    const hoverIdx = fraction * (pointsCount - 1);
    
    onHoverChange(hoverIdx);
  };

  const handleMouseLeave = () => {
    onHoverChange(null);
  };

  return (
    <div className="chart-row" style={{ height: '90px' }}>
      <div className="chart-row-header">
        <span>{title}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 'bold', color }}>
          {isGear ? (value === 0 ? 'N' : `G${value}`) : value.toFixed(0)}
        </span>
      </div>
      <div className="canvas-container">
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="canvas-element"
        />
      </div>
    </div>
  );
}

// Dummy showBottomScale
const showBottomScale = false;
