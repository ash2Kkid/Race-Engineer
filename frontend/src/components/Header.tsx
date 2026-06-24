'use client';

import React from 'react';
import { Session, Driver } from '../hooks/useWebSocket';

interface HeaderProps {
  activePageIndex: number;
  setActivePageIndex: (index: number) => void;
  isSimulation: boolean;
  setIsSimulation: (sim: boolean) => void;
  connectionStatus: 'connected' | 'connecting' | 'disconnected' | 'simulating';
  sessions: Session[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onConnectClick: () => void;
  sessionType: 'RACE' | 'QUALIFYING' | 'PRACTICE';
}

export default function Header({
  activePageIndex,
  setActivePageIndex,
  isSimulation,
  setIsSimulation,
  connectionStatus,
  sessions,
  activeSessionId,
  onSelectSession,
  onConnectClick,
  sessionType
}: HeaderProps) {

  const getStatusClass = () => {
    if (isSimulation) return 'sim';
    switch (connectionStatus) {
      case 'connected': return 'connected';
      case 'connecting': return 'connecting';
      case 'disconnected':
      default:
        return 'disconnected';
    }
  };

  const getStatusText = () => {
    if (isSimulation) return 'SIMULATION MODE';
    switch (connectionStatus) {
      case 'connected': return 'CONNECTED';
      case 'connecting': return 'CONNECTING';
      case 'disconnected':
      default:
        return 'DISCONNECTED';
    }
  };

  return (
    <header className="header">
      <div className="header-left">
        <div className="header-title">
          {/* F1 F-shape style red chevron indicator */}
          <span style={{ display: 'inline-block', width: '3px', height: '14px', backgroundColor: sessionType === 'QUALIFYING' ? '#a855f7' : 'var(--accent-red)' }} />
          <span>AI RACE ENGINEER</span>
        </div>
        
        {/* Navigation Tabs */}
        <div className="nav-tabs">
          <button
            className={`nav-tab ${activePageIndex === 0 ? 'active' : ''}`}
            onClick={() => setActivePageIndex(0)}
          >
            RACE CONTROL
          </button>
          <button
            className={`nav-tab ${activePageIndex === 1 ? 'active' : ''}`}
            onClick={() => setActivePageIndex(1)}
          >
            TELEMETRY CENTRE
          </button>
          <button
            className={`nav-tab ${activePageIndex === 2 ? 'active' : ''}`}
            onClick={() => setActivePageIndex(2)}
          >
            LAP ANALYSIS
          </button>
        </div>
      </div>

      <div className="header-right">
        {/* Session Type Badge */}
        <div className={`session-badge ${sessionType.toLowerCase()}`}>
          {sessionType}
        </div>

        {/* Session Selector */}
        <select
          value={activeSessionId}
          onChange={(e) => onSelectSession(e.target.value)}
          className="dropdown-select"
        >
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        {/* Simulation Toggle Switch */}
        <div className="toggle-switch-container">
          <span>SIMULATOR</span>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={isSimulation}
              onChange={(e) => setIsSimulation(e.target.checked)}
            />
            <span className="slider" />
          </label>
        </div>

        {/* Connection status indicator */}
        <div
          className={`connection-indicator ${getStatusClass()}`}
          onClick={connectionStatus === 'disconnected' ? onConnectClick : undefined}
          style={{ cursor: connectionStatus === 'disconnected' ? 'pointer' : 'default' }}
        >
          <div className="indicator-dot" />
          <span>{getStatusText()}</span>
          {connectionStatus === 'disconnected' && !isSimulation && (
            <span style={{ fontSize: '8px', marginLeft: '4px', textDecoration: 'underline' }}>⟳</span>
          )}
        </div>
      </div>
    </header>
  );
}
