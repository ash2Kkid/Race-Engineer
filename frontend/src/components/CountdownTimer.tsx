'use client';

import React, { useState, useEffect } from 'react';

interface CountdownTimerProps {
  sessionName: string;
  startTime: string;
  onDismiss: () => void;
}

export default function CountdownTimer({ sessionName, startTime, onDismiss }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    isOver: boolean;
  }>({ days: 0, hours: 0, minutes: 0, seconds: 0, isOver: false });

  useEffect(() => {
    const targetDate = new Date(startTime);

    const calculateTimeLeft = () => {
      const difference = targetDate.getTime() - new Date().getTime();
      
      if (difference <= 0) {
        return { days: 0, hours: 0, minutes: 0, seconds: 0, isOver: true };
      }

      return {
        days: Math.floor(difference / (1000 * 60 * 60 * 24)),
        hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((difference / 1000 / 60) % 60),
        seconds: Math.floor((difference / 1000) % 60),
        isOver: false
      };
    };

    setTimeLeft(calculateTimeLeft());
    const interval = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime]);

  if (timeLeft.isOver) {
    return (
      <div className="countdown-overlay">
        <div className="countdown-card">
          <div className="countdown-accent-stripe" />
          <h2 className="countdown-session-title">{sessionName}</h2>
          <div className="countdown-live-badge">LIVE</div>
          <p className="countdown-subtitle">The session has started! Waiting for live OpenF1 broadcast stream...</p>
          <button className="countdown-dismiss-btn pulse" onClick={onDismiss}>
            Enter Race Dashboard
          </button>
        </div>
      </div>
    );
  }

  const formatNumber = (num: number) => num.toString().padStart(2, '0');

  return (
    <div className="countdown-overlay">
      <div className="countdown-card">
        <div className="countdown-accent-stripe" />
        <div className="countdown-session-tag">UPCOMING LIVE SESSION</div>
        <h2 className="countdown-session-title">{sessionName}</h2>
        <p className="countdown-subtitle">
          Scheduled for: {new Date(startTime).toLocaleString(undefined, {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short'
          })}
        </p>

        <div className="countdown-grid">
          <div className="countdown-item">
            <span className="countdown-val">{formatNumber(timeLeft.days)}</span>
            <span className="countdown-label">DAYS</span>
          </div>
          <div className="countdown-colon">:</div>
          <div className="countdown-item">
            <span className="countdown-val">{formatNumber(timeLeft.hours)}</span>
            <span className="countdown-label">HOURS</span>
          </div>
          <div className="countdown-colon">:</div>
          <div className="countdown-item">
            <span className="countdown-val">{formatNumber(timeLeft.minutes)}</span>
            <span className="countdown-label">MINUTES</span>
          </div>
          <div className="countdown-colon">:</div>
          <div className="countdown-item">
            <span className="countdown-val">{formatNumber(timeLeft.seconds)}</span>
            <span className="countdown-label">SECONDS</span>
          </div>
        </div>

        <div className="countdown-actions">
          <button className="countdown-dismiss-btn" onClick={onDismiss}>
            Launch Pre-Session Simulator
          </button>
        </div>
      </div>
    </div>
  );
}
