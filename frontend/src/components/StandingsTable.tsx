'use client';

import React from 'react';
import { DriverPosition, Driver } from '../hooks/useWebSocket';

interface StandingsTableProps {
  standings: DriverPosition[];
  drivers: Driver[];
  selectedDriverId: string;
  onSelectDriver: (driverId: string) => void;
  currentSessionTime: string | null;
  sessionType: 'RACE' | 'QUALIFYING' | 'PRACTICE';
}

export default function StandingsTable({
  standings,
  drivers,
  selectedDriverId,
  onSelectDriver,
  currentSessionTime,
  sessionType
}: StandingsTableProps) {

  // Helper to parse driver team color stripe
  const getDriverColor = (driverId: string) => {
    const driver = drivers.find(d => d.id === driverId);
    if (!driver) return '#94a3b8';
    let color = driver.color;
    if (color.startsWith('FF')) color = color.substring(2);
    if (color.startsWith('#')) return color;
    return `#${color}`;
  };

  const getDriverCode = (driverId: string) => {
    const driver = drivers.find(d => d.id === driverId);
    return driver ? driver.code : driverId;
  };

  // Helper to calculate live lap timer
  const getLiveLapTime = (pos: DriverPosition) => {
    if (pos.is_pitting) return 'PIT BOX';
    if (!pos.lap_start_time || !currentSessionTime) return '--:--.-';

    try {
      const start = new Date(pos.lap_start_time).getTime();
      const current = new Date(currentSessionTime).getTime();
      const diffMs = current - start;

      if (diffMs < 0 || diffMs > 10 * 60 * 1000) return '--:--.-';

      const minutes = Math.floor(diffMs / 60000);
      const seconds = Math.floor((diffMs % 60000) / 1000);
      const tenths = Math.floor((diffMs % 1000) / 100);

      return `${minutes}:${seconds.toString().padStart(2, '0')}.${tenths}`;
    } catch {
      return '--:--.-';
    }
  };

  return (
    <div className="panel-card" style={{ height: '100%' }}>
      <span className="panel-header-title">
        {sessionType === 'QUALIFYING' ? 'QUALIFYING CLASSIFICATION' : 'LIVE STANDINGS'}
      </span>
      <div className="standings-table-container">
        <table className="standings-table">
          <thead>
            <tr>
              <th>POS</th>
              <th>DRIVER</th>
              <th>TEAM</th>
              <th>{sessionType === 'RACE' ? 'GAP' : 'GAP TO P1'}</th>
              <th>INT</th>
              <th>LAST LAP</th>
              <th>S1</th>
              <th>S2</th>
              <th>S3</th>
              <th>LIVE LAP</th>
              <th>BEST LAP</th>
              <th>TYRE</th>
            </tr>
          </thead>
          <tbody>
            {standings.filter(pos => pos.driver_id !== 'SC').map((pos, idx) => {
              const isSelected = pos.driver_id === selectedDriverId;
              const color = getDriverColor(pos.driver_id);
              const code = getDriverCode(pos.driver_id);
              const isRetired = pos.gap === 'DNF' || pos.gap === 'DNS' || pos.gap === 'DNQ';

              return (
                <React.Fragment key={pos.driver_id}>
                  <tr
                    onClick={() => onSelectDriver(pos.driver_id)}
                    className={`standings-row ${isSelected ? 'selected' : ''} ${isRetired ? 'retired' : ''}`}
                  >
                    <td style={{ fontWeight: 'bold', width: '36px' }}>{pos.position}</td>
                    <td style={{ fontWeight: 'bold', width: '130px', whiteSpace: 'nowrap' }}>
                      <span className="driver-color-stripe" style={{ backgroundColor: color }} />
                      <span style={{ fontFamily: 'var(--font-mono)' }}>{code}</span>
                      <span style={{ fontSize: '10px', color: 'var(--text-secondary)', marginLeft: '6px', fontWeight: 'normal' }}>
                        {pos.driver_name}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>{pos.team}</td>
                    <td style={{
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 'bold',
                      color: isRetired ? 'var(--accent-red)' : 'var(--text-primary)'
                    }}>{pos.gap}</td>
                    <td style={{
                      fontFamily: 'var(--font-mono)',
                      color: isRetired ? 'var(--accent-red)' : 'var(--text-secondary)'
                    }}>{pos.interval}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>
                      {isRetired ? pos.gap : (pos.last_lap || 'N/A')}
                    </td>
                    
                    {/* Sectors */}
                    <td>
                      {!isRetired && pos.s1 && (
                        <span className={`sector-time-pill ${pos.s1_color}`}>
                          {pos.s1}
                        </span>
                      )}
                    </td>
                    <td>
                      {!isRetired && pos.s2 && (
                        <span className={`sector-time-pill ${pos.s2_color}`}>
                          {pos.s2}
                        </span>
                      )}
                    </td>
                    <td>
                      {!isRetired && pos.s3 && (
                        <span className={`sector-time-pill ${pos.s3_color}`}>
                          {pos.s3}
                        </span>
                      )}
                    </td>
                    
                    {/* Live stopwatch */}
                    <td className={`lap-time-stopwatch ${isRetired ? 'red' : 'green'}`} style={{
                      color: isRetired ? 'var(--accent-red)' : 'var(--status-green)'
                    }}>
                      {isRetired ? pos.gap : getLiveLapTime(pos)}
                    </td>
                    
                    <td style={{ fontFamily: 'var(--font-mono)', color: isRetired ? 'var(--text-secondary)' : '#c084fc', fontWeight: 'bold' }}>
                      {isRetired ? 'N/A' : pos.best_lap}
                    </td>
                    
                    {/* Tyre compound */}
                    <td style={{ width: '65px' }}>
                      {!isRetired ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div className={`tyre-badge ${pos.tyre}`} title={`${pos.tyre} Compound`}>
                            {pos.tyre}
                          </div>
                          <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }} title="Tyre Age (Laps)">
                            {pos.tyre_age}L
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)', fontSize: '10px' }}>--</span>
                      )}
                    </td>
                  </tr>

                  {sessionType === 'QUALIFYING' && idx === 9 && (
                    <tr className="cutoff-row q3-cutoff">
                      <td colSpan={12}>
                        <div className="cutoff-line">
                          <span className="cutoff-label q3">Q3 CUTOFF (TOP 10)</span>
                        </div>
                      </td>
                    </tr>
                  )}

                  {sessionType === 'QUALIFYING' && idx === 14 && (
                    <tr className="cutoff-row q2-cutoff">
                      <td colSpan={12}>
                        <div className="cutoff-line">
                          <span className="cutoff-label q2">Q2 CUTOFF (TOP 15)</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {standings.length === 0 && (
              <tr>
                <td colSpan={12} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '24px' }}>
                  Awaiting standings packet...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
