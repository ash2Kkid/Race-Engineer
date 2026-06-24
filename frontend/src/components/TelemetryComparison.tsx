'use client';

import React, { useRef, useEffect } from 'react';
import { Telemetry, Driver, DriverPosition } from '../hooks/useWebSocket';

interface TelemetryComparisonProps {
  driverA: string;
  driverB: string;
  historyA: Telemetry[];
  historyB: Telemetry[];
  drivers: Driver[];
  standings: DriverPosition[];
  hoverIndex: number | null;
  onHoverIndexChange: (idx: number | null) => void;
}

export default function TelemetryComparison({
  driverA,
  driverB,
  historyA,
  historyB,
  drivers,
  standings,
  hoverIndex,
  onHoverIndexChange
}: TelemetryComparisonProps) {

  const getDriverColor = (dId: string, fallback: string) => {
    const d = drivers.find(drv => drv.id === dId);
    if (!d) return fallback;
    let color = d.color;
    if (color.startsWith('FF')) color = color.substring(2);
    if (color.startsWith('#')) return color;
    return `#${color}`;
  };

  const getDriverName = (dId: string, fallback: string) => {
    const d = drivers.find(drv => drv.id === dId);
    return d ? d.name : fallback;
  };

  const colorA = getDriverColor(driverA, '#06b6d4'); // Cyan Accent
  const colorB = getDriverColor(driverB, '#ef4444'); // F1 FIA Red

  const maxPoints = Math.max(historyA.length, historyB.length, 40);
  const activeHoverIdx = hoverIndex !== null ? Math.round(hoverIndex) : maxPoints - 1;
  const offsetFromEnd = Math.max(0, (maxPoints - 1) - activeHoverIdx);
  const idxA = Math.max(0, historyA.length - 1 - offsetFromEnd);
  const idxB = Math.max(0, historyB.length - 1 - offsetFromEnd);

  // Current values at cursor
  const valA = (metric: keyof Telemetry) => (historyA[idxA] ? (historyA[idxA][metric] as number) : 0);
  const valB = (metric: keyof Telemetry) => (historyB[idxB] ? (historyB[idxB][metric] as number) : 0);

  // Statistics Summary Calculators
  const maxVal = (list: Telemetry[], key: 'speed' | 'rpm') => list.length ? Math.max(...list.map(t => t[key])) : 0;
  const avgVal = (list: Telemetry[], key: 'throttle' | 'brake') => list.length ? (list.map(t => t[key]).reduce((a, b) => a + b, 0) / list.length) * 100 : 0;

  const statMaxSpeedA = maxVal(historyA, 'speed');
  const statMaxSpeedB = maxVal(historyB, 'speed');
  const statMaxRpmA = maxVal(historyA, 'rpm');
  const statMaxRpmB = maxVal(historyB, 'rpm');
  const statAvgThrottleA = avgVal(historyA, 'throttle');
  const statAvgThrottleB = avgVal(historyB, 'throttle');
  const statAvgBrakeA = avgVal(historyA, 'brake');
  const statAvgBrakeB = avgVal(historyB, 'brake');

  // HUD Comparison Calculations
  const standingA = standings.find(s => s.driver_id === driverA);
  const standingB = standings.find(s => s.driver_id === driverB);

  const getTyreClass = (tyre: string) => {
    switch (tyre?.toUpperCase()) {
      case 'S': return 'soft';
      case 'M': return 'medium';
      case 'H': return 'hard';
      case 'I': return 'inter';
      case 'W': return 'wet';
      default: return 'medium';
    }
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

  const parseGap = (gapStr: string) => {
    if (!gapStr || gapStr === 'LEADER' || gapStr === 'INTERVAL') return 0;
    const val = parseFloat(gapStr.replace('+', '').replace('s', ''));
    return isNaN(val) ? 0 : val;
  };

  const gapA = standingA ? parseGap(standingA.gap) : 0;
  const gapB = standingB ? parseGap(standingB.gap) : 0;
  const relativeGap = Math.abs(gapA - gapB);
  
  let gapLeaderText = 'TIED';
  let gapValueText = '0.000s';
  if (standingA && standingB) {
    if (standingA.position < standingB.position) {
      gapLeaderText = `${driverA} AHEAD`;
      gapValueText = `+${relativeGap.toFixed(3)}s`;
    } else if (standingB.position < standingA.position) {
      gapLeaderText = `${driverB} AHEAD`;
      gapValueText = `+${relativeGap.toFixed(3)}s`;
    } else {
      gapLeaderText = 'TIED';
      gapValueText = '0.000s';
    }
  }

  // Live values at hover index
  const batteryA = historyA[idxA] ? historyA[idxA].battery : 0;
  const batteryB = historyB[idxB] ? historyB[idxB].battery : 0;

  const tyreAgeA = historyA[idxA] ? historyA[idxA].tyre_age : (standingA?.tyre_age || 0);
  const tyreAgeB = historyB[idxB] ? historyB[idxB].tyre_age : (standingB?.tyre_age || 0);

  const lapsA = historyA[idxA] ? historyA[idxA].laps : (standingA?.laps || 1);
  const lapsB = historyB[idxB] ? historyB[idxB].laps : (standingB?.laps || 1);

  const isPittingA = historyA[idxA] ? historyA[idxA].is_pitting : (standingA?.is_pitting || false);
  const isPittingB = historyB[idxB] ? historyB[idxB].is_pitting : (standingB?.is_pitting || false);

  return (
    <div className="telemetry-compare-layout">
      {/* Live Compare HUD */}
      <div className="telemetry-compare-hud">
        {/* Driver A Card */}
        <div className="hud-driver-card" style={{ '--team-color': colorA } as React.CSSProperties}>
          <div className="hud-header-info">
            <span className="hud-driver-name">
              {getDriverName(driverA, driverA)}
              <span className="hud-driver-laps" style={{ fontSize: '10px', color: 'var(--text-secondary)', marginLeft: '6px' }}>
                (LAP {lapsA})
              </span>
            </span>
            <span className="hud-driver-pos">P{standingA?.position || '--'}</span>
          </div>

          <div className="hud-metrics-row">
            <div className="hud-metric-item">
              <span className="hud-metric-label">TYRE STATUS</span>
              <div className="hud-metric-value" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {standingA?.tyre ? (
                  <span className={`tyre-badge ${getTyreClass(standingA.tyre)}`}>
                    {standingA.tyre}
                  </span>
                ) : (
                  <span style={{ color: 'var(--text-secondary)' }}>--</span>
                )}
                <span>{tyreAgeA} Laps</span>
                <span className={`hud-pit-status ${isPittingA ? 'pitting' : ''}`} style={{
                  backgroundColor: isPittingA ? 'var(--accent-red)' : '#1e293b',
                  color: '#ffffff',
                  padding: '1px 5px',
                  borderRadius: '3px',
                  fontSize: '8px',
                  fontWeight: 'bold',
                  textShadow: isPittingA ? '0 0 4px #fff' : 'none'
                }}>
                  {isPittingA ? 'IN PIT' : 'TRACK'}
                </span>
              </div>
            </div>

            <div className="hud-metric-item">
              <span className="hud-metric-label">BATTERY (ERS)</span>
              <div className="hud-metric-value">
                <span style={{ color: colorA }}>{batteryA.toFixed(1)}%</span>
                <div style={{
                  flex: 1,
                  height: '4px',
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  borderRadius: '2px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    height: '100%',
                    width: `${batteryA}%`,
                    backgroundColor: colorA
                  }} />
                </div>
              </div>
            </div>
          </div>

          <div className="hud-sectors-row">
            <div className="f1-sector-pill">
              <span className="f1-sector-label">S1</span>
              <span className={`f1-sector-time ${getSectorColorClass(standingA?.s1_color || '', standingA?.s1)}`}>
                {standingA?.s1 || '--.---'}
              </span>
            </div>
            <div className="f1-sector-pill">
              <span className="f1-sector-label">S2</span>
              <span className={`f1-sector-time ${getSectorColorClass(standingA?.s2_color || '', standingA?.s2)}`}>
                {standingA?.s2 || '--.---'}
              </span>
            </div>
            <div className="f1-sector-pill">
              <span className="f1-sector-label">S3</span>
              <span className={`f1-sector-time ${getSectorColorClass(standingA?.s3_color || '', standingA?.s3)}`}>
                {standingA?.s3 || '--.---'}
              </span>
            </div>
          </div>
        </div>

        {/* Center Gap Box */}
        <div className="hud-center-gap-box">
          <span className="center-gap-label">RELATIVE GAP</span>
          <span className="center-gap-value">{gapValueText}</span>
          <span className="center-gap-leader" style={{
            color: gapLeaderText.includes(driverA) ? colorA : (gapLeaderText.includes(driverB) ? colorB : 'var(--text-secondary)')
          }}>
            {gapLeaderText}
          </span>
        </div>

        {/* Driver B Card */}
        <div className="hud-driver-card" style={{ '--team-color': colorB } as React.CSSProperties}>
          <div className="hud-header-info">
            <span className="hud-driver-name">
              {getDriverName(driverB, driverB)}
              <span className="hud-driver-laps" style={{ fontSize: '10px', color: 'var(--text-secondary)', marginLeft: '6px' }}>
                (LAP {lapsB})
              </span>
            </span>
            <span className="hud-driver-pos">P{standingB?.position || '--'}</span>
          </div>

          <div className="hud-metrics-row">
            <div className="hud-metric-item">
              <span className="hud-metric-label">TYRE STATUS</span>
              <div className="hud-metric-value" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {standingB?.tyre ? (
                  <span className={`tyre-badge ${getTyreClass(standingB.tyre)}`}>
                    {standingB.tyre}
                  </span>
                ) : (
                  <span style={{ color: 'var(--text-secondary)' }}>--</span>
                )}
                <span>{tyreAgeB} Laps</span>
                <span className={`hud-pit-status ${isPittingB ? 'pitting' : ''}`} style={{
                  backgroundColor: isPittingB ? 'var(--accent-red)' : '#1e293b',
                  color: '#ffffff',
                  padding: '1px 5px',
                  borderRadius: '3px',
                  fontSize: '8px',
                  fontWeight: 'bold',
                  textShadow: isPittingB ? '0 0 4px #fff' : 'none'
                }}>
                  {isPittingB ? 'IN PIT' : 'TRACK'}
                </span>
              </div>
            </div>

            <div className="hud-metric-item">
              <span className="hud-metric-label">BATTERY (ERS)</span>
              <div className="hud-metric-value">
                <span style={{ color: colorB }}>{batteryB.toFixed(1)}%</span>
                <div style={{
                  flex: 1,
                  height: '4px',
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  borderRadius: '2px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    height: '100%',
                    width: `${batteryB}%`,
                    backgroundColor: colorB
                  }} />
                </div>
              </div>
            </div>
          </div>

          <div className="hud-sectors-row">
            <div className="f1-sector-pill">
              <span className="f1-sector-label">S1</span>
              <span className={`f1-sector-time ${getSectorColorClass(standingB?.s1_color || '', standingB?.s1)}`}>
                {standingB?.s1 || '--.---'}
              </span>
            </div>
            <div className="f1-sector-pill">
              <span className="f1-sector-label">S2</span>
              <span className={`f1-sector-time ${getSectorColorClass(standingB?.s2_color || '', standingB?.s2)}`}>
                {standingB?.s2 || '--.---'}
              </span>
            </div>
            <div className="f1-sector-pill">
              <span className="f1-sector-label">S3</span>
              <span className={`f1-sector-time ${getSectorColorClass(standingB?.s3_color || '', standingB?.s3)}`}>
                {standingB?.s3 || '--.---'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable Charts Stack */}
      <div className="charts-scroll-container">
        {/* SPEED Row */}
        <ChartRow
          title="SPEED"
          unit=" km/h"
          minY={0}
          maxY={360}
          valA={valA('speed')}
          valB={valB('speed')}
          driverA={driverA}
          driverB={driverB}
          colorA={colorA}
          colorB={colorB}
          historyA={historyA.map(t => t.speed)}
          historyB={historyB.map(t => t.speed)}
          hoverIndex={hoverIndex}
          onHoverChange={onHoverIndexChange}
        />

        {/* ENGINE RPM Row */}
        <ChartRow
          title="ENGINE RPM"
          unit=" rpm"
          minY={4000}
          maxY={13500}
          valA={valA('rpm')}
          valB={valB('rpm')}
          driverA={driverA}
          driverB={driverB}
          colorA={colorA}
          colorB={colorB}
          historyA={historyA.map(t => t.rpm)}
          historyB={historyB.map(t => t.rpm)}
          hoverIndex={hoverIndex}
          onHoverChange={onHoverIndexChange}
          isRpm
        />

        {/* GEAR Row */}
        <ChartRow
          title="GEAR"
          unit=""
          minY={0}
          maxY={8}
          valA={valA('gear')}
          valB={valB('gear')}
          driverA={driverA}
          driverB={driverB}
          colorA={colorA}
          colorB={colorB}
          historyA={historyA.map(t => t.gear)}
          historyB={historyB.map(t => t.gear)}
          hoverIndex={hoverIndex}
          onHoverChange={onHoverIndexChange}
          isStepped
          isGear
        />

        {/* THROTTLE Row */}
        <ChartRow
          title="THROTTLE"
          unit="%"
          minY={0}
          maxY={100}
          valA={valA('throttle') * 100}
          valB={valB('throttle') * 100}
          driverA={driverA}
          driverB={driverB}
          colorA={colorA}
          colorB={colorB}
          historyA={historyA.map(t => t.throttle * 100)}
          historyB={historyB.map(t => t.throttle * 100)}
          hoverIndex={hoverIndex}
          onHoverChange={onHoverIndexChange}
        />

        {/* BRAKE Row */}
        <ChartRow
          title="BRAKE"
          unit="%"
          minY={0}
          maxY={100}
          valA={valA('brake') * 100}
          valB={valB('brake') * 100}
          driverA={driverA}
          driverB={driverB}
          colorA={colorA}
          colorB={colorB}
          historyA={historyA.map(t => t.brake * 100)}
          historyB={historyB.map(t => t.brake * 100)}
          hoverIndex={hoverIndex}
          onHoverChange={onHoverIndexChange}
        />

        {/* BATTERY (ERS) Row */}
        <ChartRow
          title="BATTERY (ERS)"
          unit="%"
          minY={0}
          maxY={100}
          valA={valA('battery')}
          valB={valB('battery')}
          driverA={driverA}
          driverB={driverB}
          colorA={colorA}
          colorB={colorB}
          historyA={historyA.map(t => t.battery)}
          historyB={historyB.map(t => t.battery)}
          hoverIndex={hoverIndex}
          onHoverChange={onHoverIndexChange}
          showBottomScale
        />
      </div>

      {/* Stats comparison summaries */}
      <div className="panel-card stats-summary-card">
        <span className="panel-header-title">TELEMETRY STATISTICAL SUMMARY</span>
        <div className="stats-grid">
          <StatBox name="MAX SPEED" valA={`${statMaxSpeedA.toFixed(0)} km/h`} valB={`${statMaxSpeedB.toFixed(0)} km/h`} isAWinner={statMaxSpeedA >= statMaxSpeedB} codeA={driverA} codeB={driverB} colorA={colorA} colorB={colorB} />
          <StatBox name="MAX ENGINE RPM" valA={`${statMaxRpmA.toFixed(0)} rpm`} valB={`${statMaxRpmB.toFixed(0)} rpm`} isAWinner={statMaxRpmA >= statMaxRpmB} codeA={driverA} codeB={driverB} colorA={colorA} colorB={colorB} />
          <StatBox name="AVG THROTTLE DUTY" valA={`${statAvgThrottleA.toFixed(0)}%`} valB={`${statAvgThrottleB.toFixed(0)}%`} isAWinner={statAvgThrottleA >= statAvgThrottleB} codeA={driverA} codeB={driverB} colorA={colorA} colorB={colorB} />
          <StatBox name="AVG BRAKE PRESSURE" valA={`${statAvgBrakeA.toFixed(0)}%`} valB={`${statAvgBrakeB.toFixed(0)}%`} isAWinner={statAvgBrakeA <= statAvgBrakeB} codeA={driverA} codeB={driverB} colorA={colorA} colorB={colorB} />
        </div>
      </div>
    </div>
  );
}

// ---------------- CHART ROW COMPONENT (CANVAS POWERED) ----------------
interface ChartRowProps {
  title: string;
  unit: string;
  minY: number;
  maxY: number;
  valA: number;
  valB: number;
  driverA: string;
  driverB: string;
  colorA: string;
  colorB: string;
  historyA: number[];
  historyB: number[];
  hoverIndex: number | null;
  onHoverChange: (idx: number | null) => void;
  isStepped?: boolean;
  isGear?: boolean;
  isRpm?: boolean;
  showBottomScale?: boolean;
}

function ChartRow({
  title,
  unit,
  minY,
  maxY,
  valA,
  valB,
  driverA,
  driverB,
  colorA,
  colorB,
  historyA,
  historyB,
  hoverIndex,
  onHoverChange,
  isStepped = false,
  isGear = false,
  isRpm = false,
  showBottomScale = false
}: ChartRowProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const diff = valA - valB;
  const sign = diff >= 0 ? '+' : '';
  const diffColor = diff > 0 ? colorA : (diff < 0 ? colorB : '#94a3b8');

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

    // Clear background
    ctx.clearRect(0, 0, width, height);

    // Padding parameters
    const padLeft = 45;
    const padRight = 15;
    const padTop = 10;
    const padBottom = showBottomScale ? 25 : 10;
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
      
      // Draw grid line
      ctx.beginPath();
      ctx.moveTo(padLeft, yPixel);
      ctx.lineTo(width - padRight, yPixel);
      ctx.stroke();

      // Draw left axis title
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
    const pointsCount = Math.max(historyA.length, historyB.length, 40);
    const stepX = graphWidth / (pointsCount - 1);
    
    ctx.setLineDash([3, 3]);
    for (let i = 0; i < pointsCount; i += 10) {
      const xPixel = padLeft + i * stepX;
      ctx.beginPath();
      ctx.moveTo(xPixel, padTop);
      ctx.lineTo(xPixel, height - padBottom);
      ctx.stroke();

      // Bottom titles scale
      if (showBottomScale) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '8px var(--font-mono)';
        ctx.textAlign = 'center';
        ctx.setLineDash([]);
        
        const relativeIndex = i - (pointsCount - 1);
        const seconds = relativeIndex / 10.0;
        const text = seconds === 0 ? 'LIVE' : `${seconds.toFixed(1)}s`;
        ctx.fillText(text, xPixel, height - 8);
        ctx.setLineDash([3, 3]);
      }
    }
    ctx.setLineDash([]); // Reset line dash

    // Helper to map values to graph coordinates
    const getXPixel = (index: number) => padLeft + index * stepX;
    const getYPixel = (value: number) => {
      const frac = (value - minY) / (maxY - minY);
      const clamped = Math.max(0, Math.min(1, frac));
      return padTop + graphHeight * (1 - clamped);
    };

    // Draw curves
    const drawLine = (history: number[], color: string) => {
      if (history.length === 0) return;
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = color;
      ctx.beginPath();

      if (isStepped) {
        // Step lines for gear shifting curves
        ctx.moveTo(getXPixel(0), getYPixel(history[0]));
        for (let i = 1; i < history.length; i++) {
          ctx.lineTo(getXPixel(i), getYPixel(history[i - 1]));
          ctx.lineTo(getXPixel(i), getYPixel(history[i]));
        }
      } else {
        // Smooth lines
        ctx.moveTo(getXPixel(0), getYPixel(history[0]));
        for (let i = 1; i < history.length; i++) {
          ctx.lineTo(getXPixel(i), getYPixel(history[i]));
        }
      }
      ctx.stroke();
    };

    drawLine(historyA, colorA);
    drawLine(historyB, colorB);

    // Draw vertical Hover Cursor line & dots
    const activeHoverIdx = hoverIndex !== null ? Math.round(hoverIndex) : pointsCount - 1;
    const cursorX = getXPixel(activeHoverIdx);
    const offsetFromEnd = Math.max(0, (pointsCount - 1) - activeHoverIdx);
    
    // Vertical cursor line
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(cursorX, padTop);
    ctx.lineTo(cursorX, height - padBottom);
    ctx.stroke();
    ctx.setLineDash([]);

    // Hover dots on values
    const drawHoverDot = (history: number[], color: string) => {
      const idx = Math.max(0, history.length - 1 - offsetFromEnd);
      if (idx >= 0 && history.length > 0) {
        const dotY = getYPixel(history[idx]);
        ctx.fillStyle = color;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cursorX, dotY, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    };

    drawHoverDot(historyA, colorA);
    drawHoverDot(historyB, colorB);

  }, [historyA, historyB, hoverIndex, showBottomScale]);

  // Touch/MouseMove listener to set hoverIndex
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;

    const padLeft = 45;
    const padRight = 15;
    const graphWidth = rect.width - padLeft - padRight;
    const cursorX = Math.max(0, Math.min(graphWidth, x - padLeft));

    const pointsCount = Math.max(historyA.length, historyB.length, 40);
    const fraction = cursorX / graphWidth;
    const hoverIdx = fraction * (pointsCount - 1);
    
    onHoverChange(hoverIdx);
  };

  const handleMouseLeave = () => {
    onHoverChange(null);
  };

  const gearText = (val: number) => val === 0 ? 'N' : `G${val.toFixed(0)}`;

  return (
    <div className="chart-row" ref={containerRef}>
      <div className="chart-row-header">
        <span>{title}</span>
        <div className="chart-legends">
          {/* Driver A Legend */}
          <div className="legend-driver-val">
            <div className="legend-driver-dot" style={{ backgroundColor: colorA }} />
            <span className="legend-driver-code">{driverA}:</span>
            <span className="legend-driver-num" style={{ color: colorA }}>
              {isGear ? gearText(valA) : `${valA.toFixed(0)}${unit}`}
            </span>
          </div>

          {/* Driver B Legend */}
          <div className="legend-driver-val">
            <div className="legend-driver-dot" style={{ backgroundColor: colorB }} />
            <span className="legend-driver-code">{driverB}:</span>
            <span className="legend-driver-num" style={{ color: colorB }}>
              {isGear ? gearText(valB) : `${valB.toFixed(0)}${unit}`}
            </span>
          </div>

          {/* Delta Legend */}
          {!isGear && (
            <span className="legend-delta" style={{ color: diffColor }}>
              {`Δ ${sign}${diff.toFixed(0)}${unit}`}
            </span>
          )}
        </div>
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

// ---------------- STATS SUMMARY BOX HELPER ----------------
interface StatBoxProps {
  name: string;
  valA: string;
  valB: string;
  isAWinner: boolean;
  codeA: string;
  codeB: string;
  colorA: string;
  colorB: string;
}

function StatBox({ name, valA, valB, isAWinner, codeA, codeB, colorA, colorB }: StatBoxProps) {
  return (
    <div className="stat-item-box">
      <span className="stat-metric-name">{name}</span>
      <div className="stat-row-values">
        <div className="stat-driver-val-box">
          <span className="stat-val-code">{codeA}:</span>
          <span className={`stat-val-text ${isAWinner ? 'winner' : ''}`} style={isAWinner ? {} : { color: '#ffffff' }}>
            {valA}
          </span>
        </div>
        <div className="stat-driver-val-box">
          <span className="stat-val-code">{codeB}:</span>
          <span className={`stat-val-text ${!isAWinner ? 'winner' : ''}`} style={!isAWinner ? {} : { color: '#ffffff' }}>
            {valB}
          </span>
        </div>
      </div>
    </div>
  );
}
