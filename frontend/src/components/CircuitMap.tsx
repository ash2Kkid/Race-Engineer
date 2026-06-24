'use client';

import React, { useEffect, useRef } from 'react';
import { getPointsForTrack, isDrsZone, getSectorForProgress, getSectorSplits, Point } from '../core/circuitData';
import { DriverPosition, Driver } from '../hooks/useWebSocket';

interface CircuitMapProps {
  trackName: string;
  standings: DriverPosition[];
  drivers: Driver[];
  selectedDriverId: string;
  onSelectDriver: (driverId: string) => void;
  replayStatus: string;
  trackStatus: string;
  filterDriverIds?: string[];
}

export default function CircuitMap({
  trackName,
  standings,
  drivers,
  selectedDriverId,
  onSelectDriver,
  replayStatus,
  trackStatus,
  filterDriverIds
}: CircuitMapProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const requestRef = useRef<number | null>(null);

  const [hoveredTrack, setHoveredTrack] = React.useState<{
    x: number;
    y: number;
    sector: number;
    isDrs: boolean;
    progress: number;
  } | null>(null);
  const hoveredTrackRef = useRef<{
    x: number;
    y: number;
    sector: number;
    isDrs: boolean;
    progress: number;
  } | null>(null);

  // Helper to parse Hex color to CSS color
  const getDriverColor = (driverId: string) => {
    const driver = drivers.find(d => d.id === driverId);
    if (!driver) return '#94a3b8';
    // Color is typically "FF0600EF"
    let color = driver.color;
    if (color.startsWith('FF')) color = color.substring(2);
    if (color.startsWith('#')) return color;
    return `#${color}`;
  };

  const getDriverCode = (driverId: string) => {
    const driver = drivers.find(d => d.id === driverId);
    return driver ? driver.code : driverId;
  };

  // Interpolation helper
  const getPositionOnPath = (points: Point[], progress: number): Point => {
    if (points.length === 0) return { x: 0, y: 0 };
    
    // Normalize progress to [0.0, 1.0] range to prevent out-of-bounds math
    const clampedProgress = Math.max(0, Math.min(0.9999, progress));
    
    const lengths: number[] = [];
    let totalLength = 0;

    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      lengths.push(dist);
      totalLength += dist;
    }

    const targetDist = clampedProgress * totalLength;
    let currentDist = 0;

    for (let i = 0; i < points.length; i++) {
      const len = lengths[i];
      if (currentDist + len >= targetDist) {
        const segProgress = (targetDist - currentDist) / len;
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        return {
          x: p1.x + (p2.x - p1.x) * segProgress,
          y: p1.y + (p2.y - p1.y) * segProgress
        };
      }
      currentDist += len;
    }
    return points[0];
  };

  // Convert normalized track point [0.0 - 1.0] to canvas pixel offset, preserving 1:1 aspect ratio
  const mapToCanvas = (norm: Point, width: number, height: number) => {
    const padding = 35;
    const drawWidth = width - padding * 2;
    const drawHeight = height - padding * 2;
    
    // Scale factor to preserve 1:1 aspect ratio
    const scale = Math.min(drawWidth, drawHeight);
    
    // Centering offsets
    const offsetX = padding + (drawWidth - scale) / 2;
    const offsetY = padding + (drawHeight - scale) / 2;
    
    return {
      x: offsetX + norm.x * scale,
      y: offsetY + norm.y * scale
    };
  };

  // Live drawing logic
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI retina screens
    const handleResize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    handleResize();

    window.addEventListener('resize', handleResize);

    const rawPoints = getPointsForTrack(trackName);

    const render = () => {
      const width = canvas.width / window.devicePixelRatio;
      const height = canvas.height / window.devicePixelRatio;

      // Clear Canvas
      ctx.clearRect(0, 0, width, height);

      if (rawPoints.length === 0) return;

      // 1. Draw Outer Border Track Layout (Dark Outline)
      ctx.lineWidth = 6.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#0f172a'; // darker background border
      ctx.beginPath();
      
      const firstPixel = mapToCanvas(rawPoints[0], width, height);
      ctx.moveTo(firstPixel.x, firstPixel.y);
      for (let i = 1; i < rawPoints.length; i++) {
        const pixel = mapToCanvas(rawPoints[i], width, height);
        ctx.lineTo(pixel.x, pixel.y);
      }
      ctx.closePath();
      ctx.stroke();

      // 1b. Draw Sector-Wise Colors with Neon Glow
      ctx.lineWidth = 3.5;
      const getSectorColor = (sectorNum: number) => {
        if (sectorNum === 1) return '#38bdf8'; // Cyan
        if (sectorNum === 2) return '#ec4899'; // Pink/Rose
        return '#fbbf24'; // Amber
      };

      for (let i = 0; i < rawPoints.length; i++) {
        const p1 = rawPoints[i];
        const p2 = rawPoints[(i + 1) % rawPoints.length];
        const progress = (i + 0.5) / rawPoints.length;
        const sector = getSectorForProgress(trackName, progress);
        
        ctx.save();
        ctx.strokeStyle = getSectorColor(sector);
        ctx.shadowColor = getSectorColor(sector);
        ctx.shadowBlur = 4;
        
        ctx.beginPath();
        const pixel1 = mapToCanvas(p1, width, height);
        const pixel2 = mapToCanvas(p2, width, height);
        ctx.moveTo(pixel1.x, pixel1.y);
        ctx.lineTo(pixel2.x, pixel2.y);
        ctx.stroke();
        ctx.restore();
      }

      // 1c. Draw Sector boundary markers & labels
      const splits = getSectorSplits(trackName);
      const drawBoundaryMarker = (progress: number, label: string) => {
        const normPos = getPositionOnPath(rawPoints, progress);
        const pixelPos = mapToCanvas(normPos, width, height);
        
        const normAhead = getPositionOnPath(rawPoints, (progress + 0.005) % 1.0);
        const pixelAhead = mapToCanvas(normAhead, width, height);
        const dx = pixelAhead.x - pixelPos.x;
        const dy = pixelAhead.y - pixelPos.y;
        const len = Math.hypot(dx, dy);
        
        if (len > 0) {
          const nx = -dy / len;
          const ny = dx / len;
          const tickLen = 6.5;
          
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(pixelPos.x - nx * tickLen, pixelPos.y - ny * tickLen);
          ctx.lineTo(pixelPos.x + nx * tickLen, pixelPos.y + ny * tickLen);
          ctx.stroke();
          
          ctx.fillStyle = '#64748b';
          ctx.font = 'bold 8px var(--font-mono)';
          ctx.textAlign = 'center';
          const textOffset = 15;
          ctx.fillText(label, pixelPos.x + nx * textOffset, pixelPos.y + ny * textOffset + 3);
        }
      };

      drawBoundaryMarker(splits.s1End, 'S1 | S2');
      drawBoundaryMarker(splits.s2End, 'S2 | S3');

      // 1b. Draw Start/Finish Line (checking first segment direction)
      if (rawPoints.length > 1) {
        const p1 = rawPoints[0];
        const p2 = rawPoints[1];
        const pixel1 = mapToCanvas(p1, width, height);
        const pixel2 = mapToCanvas(p2, width, height);
        
        const dx = pixel2.x - pixel1.x;
        const dy = pixel2.y - pixel1.y;
        const len = Math.hypot(dx, dy);
        if (len > 0) {
          const nx = -dy / len;
          const ny = dx / len;
          const lineLen = 8; // length of finish line on each side
          
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(pixel1.x - nx * lineLen, pixel1.y - ny * lineLen);
          ctx.lineTo(pixel1.x + nx * lineLen, pixel1.y + ny * lineLen);
          ctx.stroke();
        }
      }

      // 2. Highlight active DRS zones on track (parallel offset line to keep sector colors visible)
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = '#10b981'; // neon green status-green
      
      for (let i = 0; i < rawPoints.length; i++) {
        const p1 = rawPoints[i];
        const p2 = rawPoints[(i + 1) % rawPoints.length];
        const progress = (i + 0.5) / rawPoints.length;
        
        if (isDrsZone(trackName, progress)) {
          const pixel1 = mapToCanvas(p1, width, height);
          const pixel2 = mapToCanvas(p2, width, height);
          
          const dx = pixel2.x - pixel1.x;
          const dy = pixel2.y - pixel1.y;
          const len = Math.hypot(dx, dy);
          
          if (len > 0) {
            // Offset perpendicular to the segment by 5.5px (outward/inward)
            const offset = 5.5;
            const nx = -dy / len;
            const ny = dx / len;
            
            ctx.beginPath();
            ctx.moveTo(pixel1.x + nx * offset, pixel1.y + ny * offset);
            ctx.lineTo(pixel2.x + nx * offset, pixel2.y + ny * offset);
            ctx.stroke();
          }
        }
      }

      // 3. Extrapolate and Animate Driver Positions
      const activePositions = filterDriverIds
        ? standings.filter(s => filterDriverIds.includes(s.driver_id))
        : standings;

      // Sort to draw selected driver and Safety Car on top of others
      const sortedDrawList = [...activePositions].sort((a, b) => {
        if (a.driver_id === 'SC') return 1;
        if (b.driver_id === 'SC') return -1;
        if (a.driver_id === selectedDriverId) return 1;
        if (b.driver_id === selectedDriverId) return -1;
        const aRetired = a.gap === 'DNF' || a.gap === 'DNS' || a.gap === 'DNQ';
        const bRetired = b.gap === 'DNF' || b.gap === 'DNS' || b.gap === 'DNQ';
        if (aRetired && !bRetired) return -1;
        if (!aRetired && bRetired) return 1;
        return 0;
      });

      sortedDrawList.forEach(pos => {
        const extProg = pos.track_progress;
        const normPos = getPositionOnPath(rawPoints, extProg);
        const pixelPos = mapToCanvas(normPos, width, height);
        const color = getDriverColor(pos.driver_id);
        const code = getDriverCode(pos.driver_id);
        const isSelected = pos.driver_id === selectedDriverId;

        const isRetired = pos.gap === 'DNF' || pos.gap === 'DNS' || pos.gap === 'DNQ';
        const isDNF = pos.gap === 'DNF';
        const isDNS = pos.gap === 'DNS';
        const isDNQ = pos.gap === 'DNQ';

        let dotColor = color;
        if (pos.driver_id === 'SC') {
          dotColor = '#fbbf24'; // Bright amber for Safety Car
        } else if (isRetired) {
          dotColor = '#64748b'; // Slate grey for retired drivers
        }

        // Draw selection halo / safety car flashing lights
        if (pos.driver_id === 'SC') {
          const flash = Math.sin(Date.now() / 150) > 0;
          ctx.strokeStyle = flash ? '#ef4444' : '#3b82f6'; // Flashing red/blue
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(pixelPos.x, pixelPos.y, 11, 0, Math.PI * 2);
          ctx.stroke();
        } else if (isSelected && !isRetired) {
          ctx.fillStyle = `${color}25`; // Alpha mask
          ctx.beginPath();
          ctx.arc(pixelPos.x, pixelPos.y, 16, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = color;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(pixelPos.x, pixelPos.y, 16, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Draw dot
        ctx.fillStyle = dotColor;
        ctx.strokeStyle = pos.driver_id === 'SC' ? '#fbbf24' : (isRetired ? '#64748b' : '#ffffff');
        ctx.lineWidth = isSelected ? 2 : 1.5;
        ctx.beginPath();
        ctx.arc(pixelPos.x, pixelPos.y, pos.driver_id === 'SC' ? 8 : (isSelected ? 7 : 6), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Draw a small visual indicator for status
        if (isDNF) {
          ctx.strokeStyle = '#ef4444'; // Red 'X' for retired
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(pixelPos.x - 3, pixelPos.y - 3);
          ctx.lineTo(pixelPos.x + 3, pixelPos.y + 3);
          ctx.moveTo(pixelPos.x + 3, pixelPos.y - 3);
          ctx.lineTo(pixelPos.x - 3, pixelPos.y + 3);
          ctx.stroke();
        } else if (isDNS) {
          ctx.strokeStyle = '#94a3b8'; // Grey center dot for DNS
          ctx.lineWidth = 1;
          ctx.fillStyle = '#1e293b';
          ctx.beginPath();
          ctx.arc(pixelPos.x, pixelPos.y, 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else if (isDNQ) {
          ctx.strokeStyle = '#94a3b8'; // Grey horizontal line for DNQ
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(pixelPos.x - 4, pixelPos.y);
          ctx.lineTo(pixelPos.x + 4, pixelPos.y);
          ctx.stroke();
        }

        // Draw driver tag label capsule (Official broadcast styling)
        ctx.font = `bold ${pos.driver_id === 'SC' || isSelected ? '10px' : '9px'} var(--font-mono)`;
        
        let labelText = code;
        if (pos.driver_id === 'SC') labelText = '🚨 SAFETY CAR';
        else if (isDNF) labelText = `${code} (DNF)`;
        else if (isDNS) labelText = `${code} (DNS)`;
        else if (isDNQ) labelText = `${code} (DNQ)`;

        const textWidth = ctx.measureText(labelText).width;
        const boxWidth = textWidth + (pos.driver_id === 'SC' ? 10 : 8);
        const boxHeight = pos.driver_id === 'SC' || isSelected ? 15 : 13;
        
        const boxX = pixelPos.x + 9;
        const boxY = pixelPos.y - boxHeight / 2;

        // Draw capsule background
        ctx.fillStyle = 'rgba(12, 18, 33, 0.88)';
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 2.5);
        } else {
          ctx.rect(boxX, boxY, boxWidth, boxHeight);
        }
        ctx.fill();

        // Draw left accent line (team color stripe)
        ctx.fillStyle = pos.driver_id === 'SC' ? '#fbbf24' : color;
        ctx.beginPath();
        ctx.rect(boxX, boxY, 2.5, boxHeight);
        ctx.fill();

        // Draw capsule border
        ctx.strokeStyle = isSelected ? color : 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = isSelected ? 1.2 : 0.8;
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 2.5);
        } else {
          ctx.rect(boxX, boxY, boxWidth, boxHeight);
        }
        ctx.stroke();

        // Draw text inside capsule
        ctx.fillStyle = pos.driver_id === 'SC' ? '#fbbf24' : (isSelected ? '#ffffff' : (isRetired ? '#94a3b8' : '#e2e8f0'));
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelText, boxX + 6, boxY + boxHeight / 2);
      });
      // 4. Draw hover crosshair if active
      const hoverVal = hoveredTrackRef.current;
      if (hoverVal) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        
        const crosshairSize = 10;
        ctx.beginPath();
        ctx.moveTo(hoverVal.x - crosshairSize, hoverVal.y);
        ctx.lineTo(hoverVal.x + crosshairSize, hoverVal.y);
        ctx.moveTo(hoverVal.x, hoverVal.y - crosshairSize);
        ctx.lineTo(hoverVal.x, hoverVal.y + crosshairSize);
        ctx.stroke();

        ctx.fillStyle = hoverVal.isDrs ? '#10b981' : '#ffffff';
        ctx.shadowColor = hoverVal.isDrs ? '#10b981' : '#ffffff';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(hoverVal.x, hoverVal.y, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      requestRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [trackName, standings, drivers, selectedDriverId, filterDriverIds]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const width = rect.width;
    const height = rect.height;
    const rawPoints = getPointsForTrack(trackName);
    if (rawPoints.length === 0) return;

    // Find the closest point along the path
    let closestProgress = 0;
    let minDistance = Infinity;
    const steps = 300;
    for (let i = 0; i < steps; i++) {
      const prog = i / steps;
      const pt = getPositionOnPath(rawPoints, prog);
      const px = mapToCanvas(pt, width, height);
      const dist = Math.hypot(mx - px.x, my - px.y);
      if (dist < minDistance) {
        minDistance = dist;
        closestProgress = prog;
      }
    }

    if (minDistance < 18) {
      const pt = getPositionOnPath(rawPoints, closestProgress);
      const px = mapToCanvas(pt, width, height);
      const sector = getSectorForProgress(trackName, closestProgress);
      const isDrs = isDrsZone(trackName, closestProgress);
      const stateObj = {
        x: px.x,
        y: px.y,
        sector,
        isDrs,
        progress: closestProgress
      };
      hoveredTrackRef.current = stateObj;
      setHoveredTrack(stateObj);
    } else {
      hoveredTrackRef.current = null;
      setHoveredTrack(null);
    }
  };

  const handleMouseLeave = () => {
    hoveredTrackRef.current = null;
    setHoveredTrack(null);
  };

  // Click-to-select driver logic
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const width = rect.width;
    const height = rect.height;
    const rawPoints = getPointsForTrack(trackName);

    let closestDriverId: string | null = null;
    let closestDist = Infinity;

    const activePositions = filterDriverIds
      ? standings.filter(s => filterDriverIds.includes(s.driver_id))
      : standings;

    activePositions.forEach(pos => {
      const extProg = pos.track_progress;
      const normPos = getPositionOnPath(rawPoints, extProg);
      const pixelPos = mapToCanvas(normPos, width, height);

      const dist = Math.hypot(clickX - pixelPos.x, clickY - pixelPos.y);
      if (dist < closestDist && dist < 22) { // 22px threshold
        closestDist = dist;
        closestDriverId = pos.driver_id;
      }
    });

    if (closestDriverId) {
      onSelectDriver(closestDriverId);
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

  return (
    <div className="map-canvas-container" style={{ position: 'relative' }}>
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ width: '100%', height: '100%', cursor: 'pointer', display: 'block' }}
      />

      {/* Dynamic Track Status Overlay */}
      {trackStatus && (
        <div 
          className={`flag-box ${getFlagClass(trackStatus)}`} 
          style={{
            position: 'absolute',
            bottom: '12px',
            left: '12px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(8px)',
            zIndex: 5
          }}
        >
          {getFlagText(trackStatus)}
        </div>
      )}

      {/* Glassmorphic Live Tooltip */}
      {hoveredTrack && (
        <div style={{
          position: 'absolute',
          left: `${hoveredTrack.x + 12}px`,
          top: `${hoveredTrack.y - 45}px`,
          backgroundColor: 'rgba(15, 23, 42, 0.88)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '4px',
          padding: '6px 8px',
          pointerEvents: 'none',
          boxShadow: '0 4px 10px rgba(0, 0, 0, 0.4)',
          zIndex: 10,
          fontFamily: 'var(--font-mono)',
          fontSize: '9px',
          color: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
          whiteSpace: 'nowrap'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 'bold' }}>
            <span style={{
              width: '5px',
              height: '5px',
              borderRadius: '50%',
              backgroundColor: hoveredTrack.sector === 1 ? '#38bdf8' : (hoveredTrack.sector === 2 ? '#ec4899' : '#fbbf24')
            }} />
            SECTOR {hoveredTrack.sector}
          </div>
          <div style={{ fontSize: '8px', color: 'var(--text-secondary)' }}>
            LAP PROGRESS: {(hoveredTrack.progress * 100).toFixed(1)}%
          </div>
          <div style={{
            fontSize: '8px',
            fontWeight: 'bold',
            color: hoveredTrack.isDrs ? '#10b981' : '#64748b',
            marginTop: '2px'
          }}>
            {hoveredTrack.isDrs ? '⚡ DRS ZONE ACTIVE' : 'DRS DISABLED'}
          </div>
        </div>
      )}

      <div className="map-legend">
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: '#38bdf8' }} />
          <span>Sector 1</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: '#ec4899' }} />
          <span>Sector 2</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: '#fbbf24' }} />
          <span>Sector 3</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ height: '3px', backgroundColor: '#10b981', borderRadius: '1.5px' }} />
          <span>DRS Zone</span>
        </div>
      </div>
    </div>
  );
}
