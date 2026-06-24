'use client';

import React from 'react';
import { ReplayStatus, WeatherInfo } from '../hooks/useWebSocket';

interface RaceStatusProps {
  replayStatus: ReplayStatus;
  currentSessionTime: string | null;
  playReplay: () => void;
  pauseReplay: () => void;
  setReplaySpeed: (speed: number) => void;
  goReplayToStart: () => void;
  goReplayToEnd: () => void;
  sessionType: 'RACE' | 'QUALIFYING' | 'PRACTICE';
  trackName: string;
  weather?: WeatherInfo;
}

export default function RaceStatus({
  replayStatus,
  currentSessionTime,
  playReplay,
  pauseReplay,
  setReplaySpeed,
  goReplayToStart,
  goReplayToEnd,
  sessionType,
  trackName,
  weather
}: RaceStatusProps) {

  const { timezone: trackTimeZone, label: trackLabel } = React.useMemo(() => {
    const name = (trackName || '').toLowerCase();
    if (name.includes('monza') || name.includes('italy') || name.includes('italian')) {
      return { timezone: 'Europe/Rome', label: 'MONZA (LOCAL)' };
    } else if (name.includes('silverstone') || name.includes('britain') || name.includes('british')) {
      return { timezone: 'Europe/London', label: 'SILVER (LOCAL)' };
    } else if (name.includes('spa') || name.includes('belgian') || name.includes('belgium') || name.includes('francorchamps')) {
      return { timezone: 'Europe/Brussels', label: 'SPA (LOCAL)' };
    } else if (name.includes('barcelona') || name.includes('spain') || name.includes('spanish') || name.includes('catalunya')) {
      return { timezone: 'Europe/Madrid', label: 'BARC (LOCAL)' };
    } else if (name.includes('austria') || name.includes('austrian') || name.includes('red bull ring') || name.includes('spielberg')) {
      return { timezone: 'Europe/Vienna', label: 'SPIEL (LOCAL)' };
    } else if (name.includes('monaco')) {
      return { timezone: 'Europe/Monaco', label: 'MONACO (LOCAL)' };
    } else {
      return { timezone: 'Europe/Madrid', label: 'TRACK (LOCAL)' };
    }
  }, [trackName]);

  const getFormattedTime = (isoStr: string | null, timeZone: string) => {
    if (!isoStr) return '00:00:00';
    try {
      const date = new Date(isoStr);
      return new Intl.DateTimeFormat('en-GB', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).format(date);
    } catch {
      return '00:00:00';
    }
  };

  const getSessionCountdown = () => {
    if (!currentSessionTime) return '--:--';
    const sessionLength = sessionType === 'QUALIFYING' ? 18 * 60 : sessionType === 'PRACTICE' ? 60 * 60 : 0;
    if (sessionLength === 0) return null;

    try {
      const date = new Date(currentSessionTime);
      const minutes = date.getUTCMinutes();
      const seconds = date.getUTCSeconds();
      const elapsed = minutes * 60 + seconds;
      const remaining = Math.max(0, sessionLength - elapsed);
      const remMin = Math.floor(remaining / 60);
      const remSec = Math.floor(remaining % 60);
      return `${remMin.toString().padStart(2, '0')}:${remSec.toString().padStart(2, '0')}`;
    } catch {
      return '--:--';
    }
  };

  const getFlagText = (status: string) => {
    switch (status.toUpperCase()) {
      case 'GREEN': return '🟢 TRACK CLEAR';
      case 'YELLOW': return '🟡 YELLOW FLAG';
      case 'YELLOW_S1': return '🟡 YELLOW FLAG (SEC 1)';
      case 'YELLOW_S2': return '🟡 YELLOW FLAG (SEC 2)';
      case 'YELLOW_S3': return '🟡 YELLOW FLAG (SEC 3)';
      case 'VSC': return '🟡 VIRTUAL SAFETY CAR';
      case 'SAFETY CAR': return '🟡 SAFETY CAR';
      case 'RED': return '🔴 RED FLAG';
      default: return status.toUpperCase();
    }
  };

  const getFlagClass = (status: string) => {
    const s = status.toUpperCase();
    if (s.includes('GREEN')) return 'GREEN';
    if (s.includes('RED')) return 'RED';
    if (s.includes('VSC')) return 'VSC';
    if (s.includes('SAFETY')) return 'SAFETY-CAR';
    if (s.includes('YELLOW')) return 'YELLOW';
    return 'YELLOW';
  };

  const userTimeZone = React.useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return 'UTC';
    }
  }, []);

  const userTzLabel = React.useMemo(() => {
    if (!currentSessionTime) return 'YOUR TIME';
    try {
      const date = new Date(currentSessionTime);
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: userTimeZone,
        timeZoneName: 'short'
      }).formatToParts(date);
      const tzPart = parts.find(p => p.type === 'timeZoneName');
      const tzName = tzPart ? tzPart.value : 'LOCAL';
      return `YOUR TIME (${tzName})`;
    } catch {
      return 'YOUR TIME';
    }
  }, [currentSessionTime, userTimeZone]);

  const trackTzLabel = React.useMemo(() => {
    if (!currentSessionTime) return trackLabel;
    try {
      const date = new Date(currentSessionTime);
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: trackTimeZone,
        timeZoneName: 'short'
      }).formatToParts(date);
      const tzPart = parts.find(p => p.type === 'timeZoneName');
      const tzName = tzPart ? tzPart.value : 'LOCAL';
      return `${trackLabel} (${tzName})`;
    } catch {
      return `${trackLabel} (LOCAL)`;
    }
  }, [currentSessionTime, trackTimeZone, trackLabel]);

  const isPlaying = replayStatus.status === 'playing';

  const trackTime = getFormattedTime(currentSessionTime, trackTimeZone);
  const userTime = getFormattedTime(currentSessionTime, userTimeZone);

  return (
    <div className="panel-card" style={{ height: '100%', justifyContent: 'center' }}>
      <div className="status-panel-row">
        {/* Weather Info widget */}
        {weather && (
          <div className="weather-widget" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            borderRadius: '4px',
            padding: '4px 10px',
            fontSize: '11px',
            fontWeight: '600',
            color: 'var(--text-primary)',
            height: '28px',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {weather.rainfall === 1 ? '🌧️' : '☀️'}
            </span>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '8px', fontWeight: '800' }}>AIR</span>
              <span>{weather.air_temp.toFixed(1)}°C</span>
            </div>
            <div style={{ width: '1px', height: '10px', backgroundColor: 'var(--border-color)', opacity: 0.3 }} />
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '8px', fontWeight: '800' }}>TRACK</span>
              <span style={{ color: sessionType === 'QUALIFYING' ? '#c084fc' : 'var(--text-primary)' }}>
                {weather.track_temp.toFixed(1)}°C
              </span>
            </div>
            <div style={{ width: '1px', height: '10px', backgroundColor: 'var(--border-color)', opacity: 0.3 }} />
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '8px', fontWeight: '800' }}>HUMIDITY</span>
              <span>{weather.humidity.toFixed(0)}%</span>
            </div>
            {weather.rainfall === 1 && (
              <>
                <div style={{ width: '1px', height: '10px', backgroundColor: 'var(--border-color)', opacity: 0.3 }} />
                <span style={{ color: 'var(--accent-red)', fontWeight: '800', fontSize: '9px', letterSpacing: '0.5px' }}>WET</span>
              </>
            )}
          </div>
        )}

        {/* Lap counts / Session Badge */}
        {sessionType === 'RACE' ? (
          <div>
            <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 'bold' }}>LAP </span>
            <span style={{ fontSize: '20px', fontWeight: '800', fontFamily: 'var(--font-mono)' }}>
              {replayStatus.currentLap}
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 'bold' }}>
              /{replayStatus.totalLaps}
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span className={`session-indicator-badge ${sessionType.toLowerCase()}`}>
              {sessionType === 'QUALIFYING' ? 'Q1' : 'PRACTICE'}
            </span>
          </div>
        )}

        {/* Virtual Session clocks / Countdown */}
        {sessionType === 'RACE' ? (
          <div style={{ display: 'flex', gap: '18px', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '96px' }}>
              <span style={{ fontSize: '8px', color: 'var(--text-secondary)', fontWeight: '800', letterSpacing: '0.5px', textTransform: 'uppercase' }}>{trackTzLabel}</span>
              <span style={{ fontSize: '15px', fontWeight: '800', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{trackTime}</span>
            </div>
            <div style={{ width: '1px', height: '18px', backgroundColor: 'var(--border-color)', opacity: 0.3 }} />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '110px' }}>
              <span style={{ fontSize: '8px', color: 'var(--text-secondary)', fontWeight: '800', letterSpacing: '0.5px', textTransform: 'uppercase' }}>{userTzLabel}</span>
              <span style={{ fontSize: '15px', fontWeight: '800', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{userTime}</span>
            </div>
          </div>
        ) : (
          <div className="time-ticker" style={{ fontFamily: 'var(--font-mono)', fontWeight: 'bold', fontSize: '20px', color: sessionType === 'QUALIFYING' ? '#c084fc' : '#06b6d4' }}>
            {getSessionCountdown()}
          </div>
        )}

        {/* Replay controller action buttons */}
        <div className="replay-controls">
          {/* Go to start */}
          <button onClick={goReplayToStart} className="control-btn" title="Jump to Start">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" />
            </svg>
          </button>

          {/* Play / Pause Toggle */}
          <button
            onClick={isPlaying ? pauseReplay : playReplay}
            className="control-btn play-pause"
            title={isPlaying ? 'Pause Replay' : 'Play Replay'}
          >
            {isPlaying ? (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
                <rect x="9" y="8" width="2" height="8" rx="1" />
                <rect x="13" y="8" width="2" height="8" rx="1" />
              </svg>
            ) : (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
                <polygon points="10,8 16,12 10,16" />
              </svg>
            )}
          </button>

          {/* Go to end */}
          <button onClick={goReplayToEnd} className="control-btn" title="Jump to End">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M13 17l5-5-5-5M6 17l5-5-5-5" />
            </svg>
          </button>

          {/* Speed Selector */}
          <select
            value={replayStatus.speed}
            onChange={(e) => setReplaySpeed(parseFloat(e.target.value))}
            className="dropdown-select"
            style={{ width: '56px', padding: '2px 4px', fontSize: '10px' }}
          >
            <option value="1">1x</option>
            <option value="2">2x</option>
            <option value="5">5x</option>
            <option value="10">10x</option>
          </select>
        </div>
      </div>
    </div>
  );
}
