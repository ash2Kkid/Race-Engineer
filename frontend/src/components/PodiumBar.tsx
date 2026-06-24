'use client';

import React from 'react';
import { DriverPosition, Driver } from '../hooks/useWebSocket';

interface PodiumBarProps {
  standings: DriverPosition[];
  drivers: Driver[];
  sessionType?: 'RACE' | 'QUALIFYING' | 'PRACTICE';
}

export default function PodiumBar({ standings, drivers, sessionType }: PodiumBarProps) {
  const isQualifying = sessionType === 'QUALIFYING' || sessionType === 'PRACTICE';

  // Get top 10 drivers
  const ranking = standings.filter(pos => pos.driver_id !== 'SC').slice(0, 10);

  const getDriverColor = (dId: string) => {
    const d = drivers.find(drv => drv.id === dId);
    if (!d) return '#94a3b8';
    let color = d.color;
    if (color.startsWith('FF')) color = color.substring(2);
    if (color.startsWith('#')) return color;
    return `#${color}`;
  };

  const getDriverNumber = (dId: string) => {
    const d = drivers.find(drv => drv.id === dId);
    return d ? d.number : '';
  };

  return (
    <div className={`podium-bar ${isQualifying ? 'qualifying' : ''}`}>
      <div className="podium-label" style={{ color: isQualifying ? '#c084fc' : 'var(--accent-red)' }}>
        <span className="podium-pulse-dot" style={{
          backgroundColor: isQualifying ? '#a855f7' : 'var(--accent-red)',
          boxShadow: `0 0 6px ${isQualifying ? '#a855f7' : 'var(--accent-red)'}`
        }} />
        <span>{isQualifying ? 'FASTEST LAPS' : 'POINTS RANKING'}</span>
      </div>

      <div className="podium-items" style={{ gap: '16px' }}>
        {ranking.length === 0 ? (
          <div className="podium-empty">WAITING FOR REPLAY START...</div>
        ) : (
          ranking.map((pos, idx) => {
            const color = getDriverColor(pos.driver_id);
            const num = getDriverNumber(pos.driver_id);
            const isPitting = pos.is_pitting;
            const tyre = pos.tyre || 'M';

            // Custom positioning class for gold, silver, bronze styling
            const posClass = idx === 0 ? 'pos-1' : idx === 1 ? 'pos-2' : idx === 2 ? 'pos-3' : '';

            return (
              <React.Fragment key={pos.driver_id}>
                <div className={`podium-item ${posClass}`} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="podium-pos" style={{ color: isQualifying && idx === 0 ? '#c084fc' : undefined }}>{idx + 1}</span>
                  <span className="podium-driver-stripe" style={{ backgroundColor: color, width: '4px', height: '14px', borderRadius: '2px' }} />
                  <span className="podium-code" style={{ fontSize: '12px', fontWeight: 'bold' }}>{pos.driver_id}</span>
                  <span className="podium-number" style={{ color: 'var(--text-primary)', fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>
                    #{num}
                  </span>
                  
                  <span className={`tyre-badge ${tyre}`} style={{ transform: 'scale(0.85)', margin: '0 2px' }}>
                    {tyre}
                  </span>

                  {isPitting ? (
                    <span className="podium-pit-badge" style={{ fontSize: '8px', padding: '1px 4px', borderRadius: '2px', fontWeight: 'bold' }}>PIT</span>
                  ) : (
                    <span className="podium-gap" style={{ fontSize: '10px', fontWeight: '600', color: isQualifying && idx === 0 ? '#c084fc' : undefined }}>
                      {isQualifying 
                        ? (idx === 0 ? (pos.best_lap || 'FASTEST') : pos.gap) 
                        : (idx === 0 ? 'LEADER' : pos.gap)}
                    </span>
                  )}
                </div>
                {idx < ranking.length - 1 && (
                  <div style={{ width: '1px', height: '14px', backgroundColor: 'var(--border-color)', opacity: 0.3 }} />
                )}
              </React.Fragment>
            );
          })
        )}
      </div>
    </div>
  );
}
