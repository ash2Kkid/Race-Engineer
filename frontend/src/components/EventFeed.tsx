'use client';

import React from 'react';
import { EventFeedItem } from '../hooks/useWebSocket';

interface EventFeedProps {
  events: EventFeedItem[];
}

export default function EventFeed({ events }: EventFeedProps) {
  return (
    <div className="panel-card" style={{ height: '100%', flex: 1 }}>
      <span className="panel-header-title">RACE FEED TIMELINE</span>
      <div className="feed-list">
        {events.map((evt) => (
          <div key={evt.id} className={`feed-item ${evt.type === 'PIT_STOP' || evt.type === 'PIT_ENTRY' ? 'pit' : 'info'}`}>
            <div className="feed-item-header">
              <span style={{
                color: evt.type === 'PIT_STOP' || evt.type === 'PIT_ENTRY' ? 'var(--status-yellow)' : 'var(--accent-cyan)'
              }}>
                {evt.type}
              </span>
              <span style={{ color: 'var(--text-secondary)' }}>{evt.timestamp}</span>
            </div>
            <p style={{ color: 'var(--text-primary)', lineHeight: 1.4 }}>{evt.message}</p>
          </div>
        ))}
        {events.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '16px', fontSize: '11px' }}>
            Awaiting race milestones...
          </div>
        )}
      </div>
    </div>
  );
}
