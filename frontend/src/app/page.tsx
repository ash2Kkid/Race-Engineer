'use client';

import React, { useState } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import Header from '../components/Header';
import RaceStatus from '../components/RaceStatus';
import StandingsTable from '../components/StandingsTable';
import CircuitMap from '../components/CircuitMap';
import DriverCockpit from '../components/DriverCockpit';
import TelemetryComparison from '../components/TelemetryComparison';
import LapTelemetryAnalysis from '../components/LapTelemetryAnalysis';
import PodiumBar from '../components/PodiumBar';
import ConfettiCanvas from '../components/ConfettiCanvas';

export default function Home() {
  const ws = useWebSocket();
  const [isComparisonMode, setIsComparisonMode] = useState<boolean>(true);

  // Helper to find track name from sessions list
  const getActiveTrackName = () => {
    const activeSession = ws.sessions.find(s => s.id === ws.activeSessionId);
    return activeSession ? activeSession.trackName : 'Circuit de Barcelona-Catalunya';
  };

  const activeTrack = getActiveTrackName();
  
  // History for selected driver (Individual Mode)
  const selectedHistory = ws.telemetryHistory[ws.selectedDriverId] || [];
  
  // Histories for comparison drivers (Comparison Mode)
  const historyA = ws.telemetryHistory[ws.compareDriverA] || [];
  const historyB = ws.telemetryHistory[ws.compareDriverB] || [];

  const maxPoints = isComparisonMode
    ? Math.max(historyA.length, historyB.length, 40)
    : Math.max(selectedHistory.length, 40);

  // Override standing progress coordinates when hovering over telemetry charts
  const getHoveredStandings = () => {
    const hoverIdx = ws.hoverIndex;
    if (hoverIdx === null) return ws.standings;
    const offsetFromEnd = Math.max(0, (maxPoints - 1) - hoverIdx);

    return ws.standings.map(pos => {
      const dId = pos.driver_id;
      const history = ws.telemetryHistory[dId] || [];
      if (history.length > 0) {
        const idx = Math.max(0, history.length - 1 - Math.round(offsetFromEnd));
        const hoveredPoint = history[idx];
        if (hoveredPoint && hoveredPoint.track_progress !== undefined) {
          return {
            ...pos,
            track_progress: hoveredPoint.track_progress
          };
        }
      }
      return pos;
    });
  };

  const mapStandings = getHoveredStandings();

  const getDriverColor = (driverId: string) => {
    const driver = ws.drivers.find(d => d.id === driverId);
    if (!driver) return '#94a3b8';
    let color = driver.color;
    if (color.startsWith('FF')) color = color.substring(2);
    if (color.startsWith('#')) return color;
    return `#${color}`;
  };

  const getDriverCode = (driverId: string) => {
    const driver = ws.drivers.find(d => d.id === driverId);
    return driver ? driver.code : driverId;
  };

  return (
    <div className="dashboard-container">
      {/* F1 Start Lights HUD */}
      {ws.lights !== -1 && (
        <div className="lights-overlay">
          <div className="lights-card">
            <div className="lights-title">START SEQUENCE</div>
            <div className="lights-row">
              {[0, 1, 2, 3, 4].map((index) => {
                const isOn = index < ws.lights && ws.lights <= 5;
                const isLightsOut = ws.lights === 6;
                return (
                  <div key={index} className="light-container">
                    <div className={`light-circle ${isOn ? 'red-on' : isLightsOut ? 'green-on' : 'off'}`} />
                    <div className={`light-circle ${isOn ? 'red-on' : isLightsOut ? 'green-on' : 'off'}`} />
                  </div>
                );
              })}
            </div>
            <div className="lights-status">
              {ws.lights === 0 && 'READY...'}
              {ws.lights > 0 && ws.lights <= 5 && 'GET READY...'}
              {ws.lights === 6 && <span className="lights-out-text">LIGHTS OUT! AWAY WE GO!</span>}
            </div>
          </div>
        </div>
      )}

      {/* Victory Podium & Canvas Confetti Overlay */}
      {ws.showVictoryPodium && (
        <div className="victory-overlay">
          <ConfettiCanvas />
          <div className="victory-card">
            <div className="victory-title">🏆 SPANISH GRAND PRIX VICTORY PODIUM 🏆</div>

            <div className="podium-container">
              {/* 2nd Place */}
              {ws.standings[1] && (
                <div className="podium-column second">
                  <div className="podium-driver-info">
                    <span className="podium-number">2</span>
                    <span className="podium-driver-code" style={{ color: getDriverColor(ws.standings[1].driver_id) }}>
                      {getDriverCode(ws.standings[1].driver_id)}
                    </span>
                    <span className="podium-driver-name">{ws.standings[1].driver_name}</span>
                    <span className="podium-driver-team">{ws.standings[1].team}</span>
                  </div>
                  <div className="podium-step">
                    <span className="podium-placement">2nd</span>
                  </div>
                </div>
              )}

              {/* 1st Place (Gold) */}
              {ws.standings[0] && (
                <div className="podium-column first">
                  <div className="podium-driver-info">
                    <span className="podium-number">1</span>
                    <span className="podium-driver-code" style={{ color: getDriverColor(ws.standings[0].driver_id) }}>
                      {getDriverCode(ws.standings[0].driver_id)}
                    </span>
                    <span className="podium-driver-name">{ws.standings[0].driver_name}</span>
                    <span className="podium-driver-team">{ws.standings[0].team}</span>
                  </div>
                  <div className="podium-step">
                    <span className="podium-placement">1st</span>
                  </div>
                </div>
              )}

              {/* 3rd Place */}
              {ws.standings[2] && (
                <div className="podium-column third">
                  <div className="podium-driver-info">
                    <span className="podium-number">3</span>
                    <span className="podium-driver-code" style={{ color: getDriverColor(ws.standings[2].driver_id) }}>
                      {getDriverCode(ws.standings[2].driver_id)}
                    </span>
                    <span className="podium-driver-name">{ws.standings[2].driver_name}</span>
                    <span className="podium-driver-team">{ws.standings[2].team}</span>
                  </div>
                  <div className="podium-step">
                    <span className="podium-placement">3rd</span>
                  </div>
                </div>
              )}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', marginBottom: '24px' }}>
              <div className="victory-score-title">TOP 10 FINISHERS</div>
              <table className="victory-table">
                <thead>
                  <tr>
                    <th>POS</th>
                    <th>DRIVER</th>
                    <th>TEAM</th>
                    <th>GAP</th>
                    <th>LAPS</th>
                    <th>BEST LAP</th>
                  </tr>
                </thead>
                <tbody>
                  {ws.standings.filter(pos => pos.driver_id !== 'SC').slice(0, 10).map((pos) => {
                    const isRetired = pos.gap === 'DNF' || pos.gap === 'DNS' || pos.gap === 'DNQ';
                    return (
                      <tr key={pos.driver_id}>
                        <td style={{ fontWeight: 'bold' }}>{pos.position}</td>
                        <td style={{ fontWeight: 'bold' }}>
                          <span
                            className="driver-color-stripe"
                            style={{
                              backgroundColor: getDriverColor(pos.driver_id),
                              display: 'inline-block',
                              width: '3px',
                              height: '10px',
                              marginRight: '6px'
                            }}
                          />
                          {getDriverCode(pos.driver_id)}
                          <span style={{ fontSize: '10px', color: 'var(--text-secondary)', marginLeft: '6px', fontWeight: 'normal' }}>
                            {pos.driver_name}
                          </span>
                        </td>
                        <td>{pos.team}</td>
                        <td style={{ color: isRetired ? 'var(--accent-red)' : 'inherit', fontWeight: 'bold' }}>
                          {pos.gap}
                        </td>
                        <td>{pos.laps}</td>
                        <td style={{ color: '#c084fc', fontWeight: 'bold' }}>
                          {isRetired ? 'N/A' : pos.best_lap}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <button className="dismiss-btn" onClick={() => ws.setShowVictoryPodium(false)}>
              Close & View Telemetry
            </button>
          </div>
        </div>
      )}
      {/* Top Controls Header */}
      <Header
        activePageIndex={ws.activePageIndex}
        setActivePageIndex={ws.setActivePageIndex}
        isSimulation={ws.isSimulation}
        setIsSimulation={ws.setIsSimulation}
        connectionStatus={ws.connectionStatus}
        sessions={ws.sessions}
        activeSessionId={ws.activeSessionId}
        onSelectSession={ws.selectSession}
        onConnectClick={() => {}}
        sessionType={ws.sessionType}
      />

      {/* Persistent Live Podium HUD Ticker */}
      <PodiumBar standings={ws.standings} drivers={ws.drivers} sessionType={ws.sessionType} />

      <main className="main-content">
        {ws.activePageIndex === 0 ? (
          // PAGE 1: RACE CONTROL LAYOUT
          <div className="grid-race-control">
            {/* Column 1: Live Standings Grid */}
            <StandingsTable
              standings={ws.standings}
              drivers={ws.drivers}
              selectedDriverId={ws.selectedDriverId}
              onSelectDriver={ws.setSelectedDriverId}
              currentSessionTime={ws.currentSessionTime}
              sessionType={ws.sessionType}
            />

            {/* Column 2: Status, Map, Feeds */}
            <div className="grid-right-col">
              {/* Row 1: Session stopwatch and control buttons */}
              <div style={{ minHeight: '70px', height: 'auto', flexShrink: 0 }}>
                <RaceStatus
                  replayStatus={ws.replayStatus}
                  currentSessionTime={ws.currentSessionTime}
                  playReplay={ws.playReplay}
                  pauseReplay={ws.pauseReplay}
                  setReplaySpeed={ws.setReplaySpeed}
                  goReplayToStart={ws.goReplayToStart}
                  goReplayToEnd={ws.goReplayToEnd}
                  sessionType={ws.sessionType}
                  trackName={activeTrack}
                  weather={ws.weather}
                />
              </div>

              {/* Row 2: Vector track map & moving dots */}
              <div style={{ flex: 1, minHeight: '280px', display: 'flex', flexDirection: 'column' }}>
                <CircuitMap
                  trackName={activeTrack}
                  standings={mapStandings}
                  drivers={ws.drivers}
                  selectedDriverId={ws.selectedDriverId}
                  onSelectDriver={ws.setSelectedDriverId}
                  replayStatus={ws.replayStatus.status}
                  trackStatus={ws.replayStatus.trackStatus}
                />
              </div>
            </div>
          </div>
        ) : ws.activePageIndex === 1 ? (
          // PAGE 2: TELEMETRY ANALYSIS CENTRE
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px', overflow: 'hidden' }}>
            
            {/* Telemetry Sub-header Controls card */}
            <div className="panel-card" style={{ padding: '12px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ display: 'inline-block', width: '3px', height: '12px', backgroundColor: ws.sessionType === 'QUALIFYING' ? '#a855f7' : 'var(--accent-red)' }} />
                  <span style={{ fontSize: '12px', fontWeight: 'bold', letterSpacing: '0.5px' }}>
                    TELEMETRY CENTRE
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                  {/* Selectors */}
                  {isComparisonMode ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 'bold' }}>DRIVER A:</span>
                        <select
                          value={ws.compareDriverA}
                          onChange={(e) => ws.setCompareDriverA(e.target.value)}
                          className="dropdown-select"
                          style={{ padding: '2px 4px', fontSize: '11px' }}
                        >
                          {ws.drivers.map(d => (
                            <option key={d.id} value={d.id}>{d.code}</option>
                          ))}
                        </select>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 'bold' }}>DRIVER B:</span>
                        <select
                          value={ws.compareDriverB}
                          onChange={(e) => ws.setCompareDriverB(e.target.value)}
                          className="dropdown-select"
                          style={{ padding: '2px 4px', fontSize: '11px' }}
                        >
                          {ws.drivers.map(d => (
                            <option key={d.id} value={d.id}>{d.code}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 'bold' }}>DRIVER:</span>
                      <select
                        value={ws.selectedDriverId}
                        onChange={(e) => ws.setSelectedDriverId(e.target.value)}
                        className="dropdown-select"
                        style={{ padding: '2px 4px', fontSize: '11px' }}
                      >
                        {ws.drivers.map(d => (
                          <option key={d.id} value={d.id}>{d.code}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Mode Toggles button group */}
                  <div style={{
                    display: 'flex',
                    backgroundColor: 'var(--bg-color)',
                    padding: '2px',
                    borderRadius: '4px',
                    border: '1px solid var(--border-color)'
                  }}>
                    <button
                      onClick={() => setIsComparisonMode(false)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: !isComparisonMode ? '#ffffff' : 'var(--text-secondary)',
                        fontSize: '9px',
                        fontWeight: 'bold',
                        padding: '6px 12px',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        backgroundColor: !isComparisonMode ? 'var(--card-bg)' : 'transparent'
                      }}
                    >
                      INDIVIDUAL
                    </button>
                    <button
                      onClick={() => setIsComparisonMode(true)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: isComparisonMode ? '#ffffff' : 'var(--text-secondary)',
                        fontSize: '9px',
                        fontWeight: 'bold',
                        padding: '6px 12px',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        backgroundColor: isComparisonMode ? 'var(--card-bg)' : 'transparent'
                      }}
                    >
                      COMPARISON
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Split layout: charts left, track map right */}
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '65fr 35fr', gap: '16px', overflow: 'hidden' }}>
              {/* Left Column: Telemetry Charts */}
              <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {isComparisonMode ? (
                  <TelemetryComparison
                    driverA={ws.compareDriverA}
                    driverB={ws.compareDriverB}
                    historyA={historyA}
                    historyB={historyB}
                    drivers={ws.drivers}
                    standings={ws.standings}
                    hoverIndex={ws.hoverIndex}
                    onHoverIndexChange={ws.setHoverIndex}
                  />
                ) : (
                  <DriverCockpit
                    driverId={ws.selectedDriverId}
                    history={selectedHistory}
                    drivers={ws.drivers}
                    standings={ws.standings}
                    hoverIndex={ws.hoverIndex}
                    onHoverIndexChange={ws.setHoverIndex}
                  />
                )}
              </div>

              {/* Right Column: Track Map displaying only selected driver(s) */}
              <div className="panel-card" style={{ display: 'flex', flexDirection: 'column', padding: '12px' }}>
                <span className="panel-header-title" style={{ marginBottom: '8px' }}>TRACK POSITION</span>
                <div style={{ flex: 1, minHeight: '200px', display: 'flex', flexDirection: 'column' }}>
                  <CircuitMap
                    trackName={activeTrack}
                    standings={mapStandings}
                    drivers={ws.drivers}
                    selectedDriverId={isComparisonMode ? ws.compareDriverA : ws.selectedDriverId}
                    onSelectDriver={isComparisonMode ? ws.setCompareDriverA : ws.setSelectedDriverId}
                    replayStatus={ws.replayStatus.status}
                    trackStatus={ws.replayStatus.trackStatus}
                    filterDriverIds={isComparisonMode ? [ws.compareDriverA, ws.compareDriverB] : [ws.selectedDriverId]}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          // PAGE 3: LAP TELEMETRY ANALYSIS
          <LapTelemetryAnalysis
            completedLaps={ws.completedLaps}
            drivers={ws.drivers}
            stints={ws.stints}
          />
        )}
      </main>
    </div>
  );
}
