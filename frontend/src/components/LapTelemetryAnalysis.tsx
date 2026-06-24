'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Telemetry, Driver, CompletedLap } from '../hooks/useWebSocket';

interface LapTelemetryAnalysisProps {
  completedLaps: Record<string, CompletedLap[]>;
  drivers: Driver[];
  stints?: any[];
}

export default function LapTelemetryAnalysis({
  completedLaps,
  drivers,
  stints
}: LapTelemetryAnalysisProps) {
  const [driverA, setDriverA] = useState<string>('VER');
  const [driverB, setDriverB] = useState<string>('NOR');
  const [selectedLapIndexA, setSelectedLapIndexA] = useState<number>(-1); // -1 means latest
  const [selectedLapIndexB, setSelectedLapIndexB] = useState<number>(-1); // -1 means latest

  const [hoverTime, setHoverTime] = useState<number | null>(null);

  const getDriverColor = (dId: string, fallback: string) => {
    const d = drivers.find(drv => drv.id === dId);
    if (!d) return fallback;
    let color = d.color;
    if (color.startsWith('FF')) color = color.substring(2);
    if (color.startsWith('#')) return color;
    return `#${color}`;
  };

  const getDriverCode = (dId: string) => {
    const d = drivers.find(drv => drv.id === dId);
    return d ? d.code : dId;
  };

  const colorA = getDriverColor(driverA, '#06b6d4');
  const colorB = getDriverColor(driverB, '#ef4444');

  const lapsA = completedLaps[driverA] || [];
  const lapsB = completedLaps[driverB] || [];

  // Get selected lap objects
  const getSelectedLap = (lapsList: CompletedLap[], index: number) => {
    if (lapsList.length === 0) return null;
    if (index === -1 || index >= lapsList.length) {
      return lapsList[lapsList.length - 1]; // return latest
    }
    return lapsList[index];
  };

  const lapA = getSelectedLap(lapsA, selectedLapIndexA);
  const lapB = getSelectedLap(lapsB, selectedLapIndexB);

  // Helper to map telemetry and compute elapsed time
  interface TelemetryWithTime extends Telemetry {
    elapsed: number;
  }

  const getTelemetryWithTime = (lap: CompletedLap | null): TelemetryWithTime[] => {
    if (!lap || lap.telemetry.length === 0) return [];
    const firstTime = new Date(lap.telemetry[0].timestamp).getTime();
    return lap.telemetry.map(pt => ({
      ...pt,
      elapsed: (new Date(pt.timestamp).getTime() - firstTime) / 1000.0
    }));
  };

  const telemetryA = getTelemetryWithTime(lapA);
  const telemetryB = getTelemetryWithTime(lapB);

  const durationA = telemetryA.length > 0 ? telemetryA[telemetryA.length - 1].elapsed : 0;
  const durationB = telemetryB.length > 0 ? telemetryB[telemetryB.length - 1].elapsed : 0;
  const maxDuration = Math.max(durationA, durationB, 1.0);

  // Find nearest value at hoverTime
  const getValueAtTime = (list: TelemetryWithTime[], time: number | null, metric: keyof TelemetryWithTime) => {
    if (list.length === 0) return 0;
    const targetTime = time !== null ? time : maxDuration;
    
    // Find closest item by elapsed time binary search or find closest
    let closestItem = list[0];
    let minDiff = Math.abs(closestItem.elapsed - targetTime);

    for (let i = 1; i < list.length; i++) {
      const diff = Math.abs(list[i].elapsed - targetTime);
      if (diff < minDiff) {
        minDiff = diff;
        closestItem = list[i];
      }
    }
    return closestItem[metric] as number;
  };

  const valA = (metric: keyof Telemetry) => getValueAtTime(telemetryA, hoverTime, metric as keyof TelemetryWithTime);
  const valB = (metric: keyof Telemetry) => getValueAtTime(telemetryB, hoverTime, metric as keyof TelemetryWithTime);

  // Stats for the laps
  const statMaxSpeedA = telemetryA.length ? Math.max(...telemetryA.map(t => t.speed)) : 0;
  const statMaxSpeedB = telemetryB.length ? Math.max(...telemetryB.map(t => t.speed)) : 0;
  const statAvgThrottleA = telemetryA.length ? (telemetryA.map(t => t.throttle).reduce((a, b) => a + b, 0) / telemetryA.length) * 100 : 0;
  const statAvgThrottleB = telemetryB.length ? (telemetryB.map(t => t.throttle).reduce((a, b) => a + b, 0) / telemetryB.length) * 100 : 0;
  const statAvgBrakeA = telemetryA.length ? (telemetryA.map(t => t.brake).reduce((a, b) => a + b, 0) / telemetryA.length) * 100 : 0;
  const statAvgBrakeB = telemetryB.length ? (telemetryB.map(t => t.brake).reduce((a, b) => a + b, 0) / telemetryB.length) * 100 : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px', overflow: 'hidden' }}>
      
      {/* Top Selectors Panel */}
      <div className="panel-card" style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ display: 'inline-block', width: '3px', height: '12px', backgroundColor: 'var(--accent-red)' }} />
            <span style={{ fontSize: '12px', fontWeight: 'bold', letterSpacing: '0.5px' }}>
              LAP TELEMETRY OVERLAY ANALYSIS
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
            {/* Driver A Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 'bold' }}>DRV A:</span>
                <select
                  value={driverA}
                  onChange={(e) => {
                    setDriverA(e.target.value);
                    setSelectedLapIndexA(-1); // Reset to latest
                  }}
                  className="dropdown-select"
                  style={{ padding: '2px 4px', fontSize: '11px' }}
                >
                  {drivers.map(d => (
                    <option key={d.id} value={d.id}>{d.code}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 'bold' }}>LAP:</span>
                <select
                  value={selectedLapIndexA}
                  onChange={(e) => setSelectedLapIndexA(Number(e.target.value))}
                  className="dropdown-select"
                  disabled={lapsA.length === 0}
                  style={{ padding: '2px 4px', fontSize: '11px' }}
                >
                  {lapsA.length === 0 ? (
                    <option value={-1}>No completed laps</option>
                  ) : (
                    lapsA.map((l, idx) => (
                      <option key={idx} value={idx}>Lap {l.lapNumber} (Latest {lapsA.length - idx - 1 === 0 ? '✓' : `-${lapsA.length - idx - 1}`})</option>
                    ))
                  )}
                </select>
              </div>
            </div>

            {/* Gap Display indicator */}
            {lapA && lapB && (
              <div style={{
                backgroundColor: 'rgba(255,255,255,0.03)',
                border: '1px dashed var(--border-color)',
                borderRadius: '4px',
                padding: '2px 8px',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                fontWeight: 'bold',
                color: '#fff'
              }}>
                LAP TIME A: <span style={{ color: colorA }}>{durationA.toFixed(3)}s</span> | B: <span style={{ color: colorB }}>{durationB.toFixed(3)}s</span>
              </div>
            )}

            {/* Driver B Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 'bold' }}>DRV B:</span>
                <select
                  value={driverB}
                  onChange={(e) => {
                    setDriverB(e.target.value);
                    setSelectedLapIndexB(-1); // Reset to latest
                  }}
                  className="dropdown-select"
                  style={{ padding: '2px 4px', fontSize: '11px' }}
                >
                  {drivers.map(d => (
                    <option key={d.id} value={d.id}>{d.code}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 'bold' }}>LAP:</span>
                <select
                  value={selectedLapIndexB}
                  onChange={(e) => setSelectedLapIndexB(Number(e.target.value))}
                  className="dropdown-select"
                  disabled={lapsB.length === 0}
                  style={{ padding: '2px 4px', fontSize: '11px' }}
                >
                  {lapsB.length === 0 ? (
                    <option value={-1}>No completed laps</option>
                  ) : (
                    lapsB.map((l, idx) => (
                      <option key={idx} value={idx}>Lap {l.lapNumber} (Latest {lapsB.length - idx - 1 === 0 ? '✓' : `-${lapsB.length - idx - 1}`})</option>
                    ))
                  )}
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Charts Body */}
      {(!lapA || !lapB) ? (
        <div className="panel-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '40px' }}>
          <div style={{ display: 'flex', gap: '12px' }}>
            <div className="f1-sector-pill" style={{ opacity: 0.3 }}><span className="f1-sector-label">S1</span><span className="f1-sector-time inactive">--.---</span></div>
            <div className="f1-sector-pill" style={{ opacity: 0.3 }}><span className="f1-sector-label">S2</span><span className="f1-sector-time inactive">--.---</span></div>
            <div className="f1-sector-pill" style={{ opacity: 0.3 }}><span className="f1-sector-label">S3</span><span className="f1-sector-time inactive">--.---</span></div>
          </div>
          <span style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>
            WAITING FOR COMPLETED LAPS FROM SELECTED DRIVERS...
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', opacity: 0.7, textAlign: 'center', maxWidth: '400px' }}>
            Let the replay or simulation run. Completed laps will automatically be recorded here (stores up to the last 5 completed laps).
          </span>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', overflow: 'hidden' }}>
          <div className="charts-scroll-container">
            {/* SPEED */}
            <LapChartRow
              title="SPEED"
              unit=" km/h"
              minY={0}
              maxY={360}
              valA={valA('speed')}
              valB={valB('speed')}
              codeA={getDriverCode(driverA)}
              codeB={getDriverCode(driverB)}
              colorA={colorA}
              colorB={colorB}
              telemetryA={telemetryA}
              telemetryB={telemetryB}
              maxDuration={maxDuration}
              hoverTime={hoverTime}
              onHoverChange={setHoverTime}
            />

            {/* THROTTLE */}
            <LapChartRow
              title="THROTTLE"
              unit="%"
              minY={0}
              maxY={100}
              valA={valA('throttle') * 100}
              valB={valB('throttle') * 100}
              codeA={getDriverCode(driverA)}
              codeB={getDriverCode(driverB)}
              colorA={colorA}
              colorB={colorB}
              telemetryA={telemetryA.map(t => ({ ...t, value: t.throttle * 100 }))}
              telemetryB={telemetryB.map(t => ({ ...t, value: t.throttle * 100 }))}
              maxDuration={maxDuration}
              hoverTime={hoverTime}
              onHoverChange={setHoverTime}
              customMetric="value"
            />

            {/* BRAKE */}
            <LapChartRow
              title="BRAKE"
              unit="%"
              minY={0}
              maxY={100}
              valA={valA('brake') * 100}
              valB={valB('brake') * 100}
              codeA={getDriverCode(driverA)}
              codeB={getDriverCode(driverB)}
              colorA={colorA}
              colorB={colorB}
              telemetryA={telemetryA.map(t => ({ ...t, value: t.brake * 100 }))}
              telemetryB={telemetryB.map(t => ({ ...t, value: t.brake * 100 }))}
              maxDuration={maxDuration}
              hoverTime={hoverTime}
              onHoverChange={setHoverTime}
              customMetric="value"
            />

            {/* GEAR */}
            <LapChartRow
              title="GEAR"
              unit=""
              minY={0}
              maxY={8}
              valA={valA('gear')}
              valB={valB('gear')}
              codeA={getDriverCode(driverA)}
              codeB={getDriverCode(driverB)}
              colorA={colorA}
              colorB={colorB}
              telemetryA={telemetryA}
              telemetryB={telemetryB}
              maxDuration={maxDuration}
              hoverTime={hoverTime}
              onHoverChange={setHoverTime}
              metric="gear"
              isStepped
              isGear
            />

            {/* RPM */}
            <LapChartRow
              title="ENGINE RPM"
              unit=" rpm"
              minY={4000}
              maxY={13500}
              valA={valA('rpm')}
              valB={valB('rpm')}
              codeA={getDriverCode(driverA)}
              codeB={getDriverCode(driverB)}
              colorA={colorA}
              colorB={colorB}
              telemetryA={telemetryA}
              telemetryB={telemetryB}
              maxDuration={maxDuration}
              hoverTime={hoverTime}
              onHoverChange={setHoverTime}
              metric="rpm"
              isRpm
            />

            {/* BATTERY */}
            <LapChartRow
              title="BATTERY (ERS)"
              unit="%"
              minY={0}
              maxY={100}
              valA={valA('battery')}
              valB={valB('battery')}
              codeA={getDriverCode(driverA)}
              codeB={getDriverCode(driverB)}
              colorA={colorA}
              colorB={colorB}
              telemetryA={telemetryA}
              telemetryB={telemetryB}
              maxDuration={maxDuration}
              hoverTime={hoverTime}
              onHoverChange={setHoverTime}
              metric="battery"
              showBottomScale
            />
          </div>

          {/* HUD Summary Box */}
          <div className="panel-card stats-summary-card">
            <span className="panel-header-title">COMPLETED LAP STATISTICAL OVERLAYS</span>
            <div className="stats-grid">
              <div className="stat-item-box">
                <span className="stat-metric-name">MAX SPEED</span>
                <div className="stat-row-values">
                  <div className="stat-driver-val-box">
                    <span className="stat-val-code">{getDriverCode(driverA)}:</span>
                    <span className={`stat-val-text ${statMaxSpeedA >= statMaxSpeedB ? 'winner' : ''}`} style={statMaxSpeedA >= statMaxSpeedB ? {} : { color: '#ffffff' }}>
                      {statMaxSpeedA.toFixed(0)} km/h
                    </span>
                  </div>
                  <div className="stat-driver-val-box">
                    <span className="stat-val-code">{getDriverCode(driverB)}:</span>
                    <span className={`stat-val-text ${statMaxSpeedB >= statMaxSpeedA ? 'winner' : ''}`} style={statMaxSpeedB >= statMaxSpeedA ? {} : { color: '#ffffff' }}>
                      {statMaxSpeedB.toFixed(0)} km/h
                    </span>
                  </div>
                </div>
              </div>

              <div className="stat-item-box">
                <span className="stat-metric-name">AVG THROTTLE DUTY</span>
                <div className="stat-row-values">
                  <div className="stat-driver-val-box">
                    <span className="stat-val-code">{getDriverCode(driverA)}:</span>
                    <span className={`stat-val-text ${statAvgThrottleA >= statAvgThrottleB ? 'winner' : ''}`} style={statAvgThrottleA >= statAvgThrottleB ? {} : { color: '#ffffff' }}>
                      {statAvgThrottleA.toFixed(0)}%
                    </span>
                  </div>
                  <div className="stat-driver-val-box">
                    <span className="stat-val-code">{getDriverCode(driverB)}:</span>
                    <span className={`stat-val-text ${statAvgThrottleB >= statAvgThrottleA ? 'winner' : ''}`} style={statAvgThrottleB >= statAvgThrottleA ? {} : { color: '#ffffff' }}>
                      {statAvgThrottleB.toFixed(0)}%
                    </span>
                  </div>
                </div>
              </div>

              <div className="stat-item-box">
                <span className="stat-metric-name">AVG BRAKE DUTY</span>
                <div className="stat-row-values">
                  <div className="stat-driver-val-box">
                    <span className="stat-val-code">{getDriverCode(driverA)}:</span>
                    <span className={`stat-val-text ${statAvgBrakeA <= statAvgBrakeB ? 'winner' : ''}`} style={statAvgBrakeA <= statAvgBrakeB ? {} : { color: '#ffffff' }}>
                      {statAvgBrakeA.toFixed(0)}%
                    </span>
                  </div>
                  <div className="stat-driver-val-box">
                    <span className="stat-val-code">{getDriverCode(driverB)}:</span>
                    <span className={`stat-val-text ${statAvgBrakeB <= statAvgBrakeA ? 'winner' : ''}`} style={statAvgBrakeB <= statAvgBrakeA ? {} : { color: '#ffffff' }}>
                      {statAvgBrakeB.toFixed(0)}%
                    </span>
                  </div>
                </div>
              </div>

              <div className="stat-item-box">
                <span className="stat-metric-name">LAP TIME</span>
                <div className="stat-row-values">
                  <div className="stat-driver-val-box">
                    <span className="stat-val-code">{getDriverCode(driverA)}:</span>
                    <span className={`stat-val-text ${durationA <= durationB ? 'winner' : ''}`} style={durationA <= durationB ? {} : { color: '#ffffff' }}>
                      {durationA.toFixed(3)}s
                    </span>
                  </div>
                  <div className="stat-driver-val-box">
                    <span className="stat-val-code">{getDriverCode(driverB)}:</span>
                    <span className={`stat-val-text ${durationB <= durationA ? 'winner' : ''}`} style={durationB <= durationA ? {} : { color: '#ffffff' }}>
                      {durationB.toFixed(3)}s
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Tyre Run Logs / Stints summary (Practice PACE diagnostics) */}
          {stints && stints.length > 0 && (
            <div className="panel-card" style={{ padding: '12px 14px', marginTop: '12px' }}>
              <span className="panel-header-title" style={{ marginBottom: '8px' }}>TYRE RUN LOGS (STINT PACE DIAGNOSTICS)</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                {/* Driver A Stints */}
                <div>
                  <span style={{ fontSize: '11px', fontWeight: 'bold', color: colorA, display: 'block', marginBottom: '8px' }}>
                    {getDriverCode(driverA)} RUN HISTORY
                  </span>
                  <table className="stint-table">
                    <thead>
                      <tr>
                        <th>STINT</th>
                        <th>TYRE</th>
                        <th>LAPS RUN</th>
                        <th>START</th>
                        <th>END</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stints.filter(s => s.driver_id === driverA).map((s, idx) => (
                        <tr key={idx}>
                          <td>#{s.stint_number}</td>
                          <td>
                            <span className={`tyre-badge ${s.compound[0]}`}>
                              {s.compound[0]}
                            </span>
                          </td>
                          <td style={{ fontWeight: 'bold' }}>{s.lap_end - s.lap_start + 1}</td>
                          <td>Lap {s.lap_start}</td>
                          <td>Lap {s.lap_end}</td>
                        </tr>
                      ))}
                      {stints.filter(s => s.driver_id === driverA).length === 0 && (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '10px', fontSize: '10px' }}>
                            No stints logged for this driver.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Driver B Stints */}
                <div>
                  <span style={{ fontSize: '11px', fontWeight: 'bold', color: colorB, display: 'block', marginBottom: '8px' }}>
                    {getDriverCode(driverB)} RUN HISTORY
                  </span>
                  <table className="stint-table">
                    <thead>
                      <tr>
                        <th>STINT</th>
                        <th>TYRE</th>
                        <th>LAPS RUN</th>
                        <th>START</th>
                        <th>END</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stints.filter(s => s.driver_id === driverB).map((s, idx) => (
                        <tr key={idx}>
                          <td>#{s.stint_number}</td>
                          <td>
                            <span className={`tyre-badge ${s.compound[0]}`}>
                              {s.compound[0]}
                            </span>
                          </td>
                          <td style={{ fontWeight: 'bold' }}>{s.lap_end - s.lap_start + 1}</td>
                          <td>Lap {s.lap_start}</td>
                          <td>Lap {s.lap_end}</td>
                        </tr>
                      ))}
                      {stints.filter(s => s.driver_id === driverB).length === 0 && (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '10px', fontSize: '10px' }}>
                            No stints logged for this driver.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------- LAP CHART ROW COMPONENT (CANVAS POWERED) ----------------
interface LapChartRowProps {
  title: string;
  unit: string;
  minY: number;
  maxY: number;
  valA: number;
  valB: number;
  codeA: string;
  codeB: string;
  colorA: string;
  colorB: string;
  telemetryA: any[];
  telemetryB: any[];
  maxDuration: number;
  hoverTime: number | null;
  onHoverChange: (time: number | null) => void;
  metric?: string;
  customMetric?: string;
  isStepped?: boolean;
  isGear?: boolean;
  isRpm?: boolean;
  showBottomScale?: boolean;
}

function LapChartRow({
  title,
  unit,
  minY,
  maxY,
  valA,
  valB,
  codeA,
  codeB,
  colorA,
  colorB,
  telemetryA,
  telemetryB,
  maxDuration,
  hoverTime,
  onHoverChange,
  metric = 'speed',
  customMetric,
  isStepped = false,
  isGear = false,
  isRpm = false,
  showBottomScale = false
}: LapChartRowProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const diff = valA - valB;
  const sign = diff >= 0 ? '+' : '';
  const diffColor = diff > 0 ? colorA : (diff < 0 ? colorB : '#94a3b8');
  const metricKey = customMetric || metric;

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

    // Draw Grid Lines (Vertical - Time intervals every 10 seconds)
    ctx.setLineDash([3, 3]);
    const gridStepSeconds = 10.0;
    for (let t = 0.0; t <= maxDuration; t += gridStepSeconds) {
      const xPixel = padLeft + (t / maxDuration) * graphWidth;
      
      ctx.beginPath();
      ctx.moveTo(xPixel, padTop);
      ctx.lineTo(xPixel, height - padBottom);
      ctx.stroke();

      // Bottom time labels scale
      if (showBottomScale) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '8px var(--font-mono)';
        ctx.textAlign = 'center';
        ctx.setLineDash([]);
        ctx.fillText(`${t.toFixed(0)}s`, xPixel, height - 8);
        ctx.setLineDash([3, 3]);
      }
    }
    ctx.setLineDash([]); // Reset line dash

    // Helpers to map values to coordinates
    const getXPixel = (elapsedTime: number) => padLeft + (elapsedTime / maxDuration) * graphWidth;
    const getYPixel = (value: number) => {
      const frac = (value - minY) / (maxY - minY);
      const clamped = Math.max(0, Math.min(1, frac));
      return padTop + graphHeight * (1 - clamped);
    };

    // Draw curves
    const drawLine = (history: any[], color: string) => {
      if (history.length === 0) return;
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = color;
      ctx.beginPath();

      if (isStepped) {
        ctx.moveTo(getXPixel(history[0].elapsed), getYPixel(history[0][metricKey]));
        for (let i = 1; i < history.length; i++) {
          ctx.lineTo(getXPixel(history[i].elapsed), getYPixel(history[i - 1][metricKey]));
          ctx.lineTo(getXPixel(history[i].elapsed), getYPixel(history[i][metricKey]));
        }
      } else {
        ctx.moveTo(getXPixel(history[0].elapsed), getYPixel(history[0][metricKey]));
        for (let i = 1; i < history.length; i++) {
          ctx.lineTo(getXPixel(history[i].elapsed), getYPixel(history[i][metricKey]));
        }
      }
      ctx.stroke();
    };

    drawLine(telemetryA, colorA);
    drawLine(telemetryB, colorB);

    // Draw vertical Hover Cursor line & dots
    if (hoverTime !== null) {
      const cursorX = getXPixel(hoverTime);
      
      // Vertical cursor line
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(cursorX, padTop);
      ctx.lineTo(cursorX, height - padBottom);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw dots at exact hovered times
      const drawHoverDot = (history: any[], color: string) => {
        if (history.length === 0) return;
        
        // Find closest point by elapsed time
        let closest = history[0];
        let minDiff = Math.abs(closest.elapsed - hoverTime);
        for (let i = 1; i < history.length; i++) {
          const diff = Math.abs(history[i].elapsed - hoverTime);
          if (diff < minDiff) {
            minDiff = diff;
            closest = history[i];
          }
        }

        const dotY = getYPixel(closest[metricKey]);
        ctx.fillStyle = color;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cursorX, dotY, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      };

      drawHoverDot(telemetryA, colorA);
      drawHoverDot(telemetryB, colorB);
    }

  }, [telemetryA, telemetryB, hoverTime, maxDuration, showBottomScale]);

  // Mouse move listener to set hoverTime
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;

    const padLeft = 45;
    const padRight = 15;
    const graphWidth = rect.width - padLeft - padRight;
    const cursorX = Math.max(0, Math.min(graphWidth, x - padLeft));

    const fraction = cursorX / graphWidth;
    const timeVal = fraction * maxDuration;
    
    onHoverChange(timeVal);
  };

  const handleMouseLeave = () => {
    onHoverChange(null);
  };

  const gearText = (val: number) => val === 0 ? 'N' : `G${val.toFixed(0)}`;

  return (
    <div className="chart-row">
      <div className="chart-row-header">
        <span>{title}</span>
        <div className="chart-legends">
          {/* Driver A Legend */}
          <div className="legend-driver-val">
            <div className="legend-driver-dot" style={{ backgroundColor: colorA }} />
            <span className="legend-driver-code">{codeA}:</span>
            <span className="legend-driver-num" style={{ color: colorA }}>
              {isGear ? gearText(valA) : `${valA.toFixed(0)}${unit}`}
            </span>
          </div>

          {/* Driver B Legend */}
          <div className="legend-driver-val">
            <div className="legend-driver-dot" style={{ backgroundColor: colorB }} />
            <span className="legend-driver-code">{codeB}:</span>
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
