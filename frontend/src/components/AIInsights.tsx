'use client';

import React from 'react';
import { AIInsight } from '../hooks/useWebSocket';

interface AIInsightsProps {
  insights: AIInsight[];
}

export default function AIInsights({ insights }: AIInsightsProps) {
  return (
    <div className="panel-card" style={{ height: '100%', flex: 1 }}>
      <span className="panel-header-title">AI STRATEGIST INSIGHTS</span>
      <div className="feed-list">
        {insights.map((ins) => (
          <div key={ins.id} className={`feed-item ${ins.severity}`}>
            <div className="feed-item-header">
              <span style={{
                color: ins.severity === 'high' ? 'var(--status-red)' :
                       ins.severity === 'medium' ? 'var(--status-yellow)' : 'var(--text-secondary)'
              }}>
                {ins.severity.toUpperCase()} ALERT
              </span>
              <span style={{ color: 'var(--text-secondary)' }}>{ins.timestamp}</span>
            </div>
            <p style={{ color: 'var(--text-primary)', lineHeight: 1.4 }}>{ins.message}</p>
          </div>
        ))}
        {insights.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '16px', fontSize: '11px' }}>
            No strategist insights generated yet.
          </div>
        )}
      </div>
    </div>
  );
}
