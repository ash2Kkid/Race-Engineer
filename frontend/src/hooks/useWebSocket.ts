'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export interface Driver {
  id: string;
  name: string;
  team: string;
  number: string;
  code: string;
  color: string;
}

export interface Session {
  id: string;
  name: string;
  trackName: string;
  isActive: boolean;
  type?: 'RACE' | 'QUALIFYING' | 'PRACTICE';
}

export interface CompletedLap {
  lapNumber: number;
  driverId: string;
  telemetry: Telemetry[];
}

export interface DriverPosition {
  position: number;
  driver_id: string;
  driver_name: string;
  team: string;
  gap: string;
  interval: string;
  last_lap: string;
  best_lap: string;
  tyre: string;
  tyre_age: number;
  laps: number;
  track_progress: number;
  drs_active: boolean;
  delta: number;
  is_pitting: boolean;
  lap_start_time: string | null;
  lap_duration: number;
  pit_start_time: string | null;
  pit_duration: number;
  s1: string;
  s1_color: string;
  s2: string;
  s2_color: string;
  s3: string;
  s3_color: string;
}

export interface Telemetry {
  timestamp: string;
  driver_id: string;
  speed: number;
  rpm: number;
  throttle: number;
  brake: number;
  gear: number;
  tyre_age: number;
  last_lap: string;
  battery: number;
  track_progress: number;
  laps: number;
  is_pitting: boolean;
}

export interface ReplayStatus {
  status: 'playing' | 'paused';
  speed: number;
  currentLap: number;
  totalLaps: number;
  trackStatus: string;
}

export interface EventFeedItem {
  id: string;
  type: string;
  message: string;
  timestamp: string;
}

export interface AIInsight {
  id: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
  timestamp: string;
}

export interface WeatherInfo {
  air_temp: number;
  track_temp: number;
  humidity: number;
  rainfall: number;
}

const getUrls = () => {
  let isLocal = false;
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
  }

  // Local development points directly to localhost, production Vercel points to Hugging Face via server-side rewrite proxy
  const baseUrl = isLocal ? 'http://127.0.0.1:8000' : '/api/backend';
  const wsUrl = isLocal ? 'ws://127.0.0.1:8000/ws' : 'wss://ash2kkid-f1-race-engineer.hf.space/ws';
  return { baseUrl, wsUrl };
};


const timeToSeconds = (timeStr: string): number => {
  if (!timeStr || timeStr === 'N/A' || timeStr.includes('DN') || timeStr === '--') return Infinity;
  try {
    const parts = timeStr.split(':');
    if (parts.length === 2) {
      return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
    }
    return parseFloat(timeStr);
  } catch {
    return Infinity;
  }
};

const secondsToTime = (seconds: number): string => {
  if (seconds === Infinity || isNaN(seconds)) return '--';
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(3);
  return `${m}:${s.padStart(6, '0')}`;
};

// Default Mock Drivers
const mockDrivers: Driver[] = [
  { id: 'VER', name: 'Max Verstappen', team: 'Red Bull Racing', number: '1', code: 'VER', color: 'FF0600EF' },
  { id: 'HAM', name: 'Lewis Hamilton', team: 'Mercedes AMG', number: '44', code: 'HAM', color: 'FF00D2BE' },
  { id: 'LEC', name: 'Charles Leclerc', team: 'Ferrari', number: '16', code: 'LEC', color: 'FFE00400' },
  { id: 'NOR', name: 'Lando Norris', team: 'McLaren', number: '4', code: 'NOR', color: 'FFFF8700' },
  { id: 'SAI', name: 'Carlos Sainz', team: 'Ferrari', number: '55', code: 'SAI', color: 'FFE00400' },
  { id: 'RUS', name: 'George Russell', team: 'Mercedes AMG', number: '63', code: 'RUS', color: 'FF00D2BE' },
  { id: 'PIA', name: 'Oscar Piastri', team: 'McLaren', number: '81', code: 'PIA', color: 'FFFF8700' },
  { id: 'ALB', name: 'Alexander Albon', team: 'Williams Racing', number: '23', code: 'ALB', color: 'FF005AFF' },
  { id: 'SAR', name: 'Logan Sargeant', team: 'Williams Racing', number: '2', code: 'SAR', color: 'FF808080' },
];

// Default Mock Sessions
const mockSessions: Session[] = [
  { id: '11307', name: 'Barcelona GP 2026 - Race', trackName: 'Circuit de Barcelona-Catalunya', isActive: true, type: 'RACE' },
  { id: 'austria_2026', name: 'Austrian GP 2026 - Race', trackName: 'Red Bull Ring', isActive: false, type: 'RACE' },
  { id: 'austria_q', name: 'Austrian GP 2026 - Qualifying', trackName: 'Red Bull Ring', isActive: false, type: 'QUALIFYING' },
  { id: 'austria_fp2', name: 'Austrian GP 2026 - FP2', trackName: 'Red Bull Ring', isActive: false, type: 'PRACTICE' },
  { id: '9523', name: 'Monaco GP 2024 - Race', trackName: 'Circuit de Monaco', isActive: false, type: 'RACE' },
  { id: '9558', name: 'British GP 2024 - Race', trackName: 'Silverstone Circuit', isActive: false, type: 'RACE' },
  { id: '9574', name: 'Spa GP 2024 - Race', trackName: 'Circuit de Spa-Francorchamps', isActive: false, type: 'RACE' },
  { id: '9590', name: 'Monza GP 2024 - Race', trackName: 'Autodromo Nazionale Monza', isActive: false, type: 'RACE' },
];

export function useWebSocket() {
  const { baseUrl: BASE_URL, wsUrl: WS_URL } = getUrls();
  // App States
  const [activePageIndex, setActivePageIndex] = useState<number>(0); // 0 = Race Control, 1 = Telemetry
  const [isSimulation, setIsSimulation] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'connecting' | 'disconnected' | 'simulating'>('disconnected');
  
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [sessionType, setSessionType] = useState<'RACE' | 'QUALIFYING' | 'PRACTICE'>('RACE');
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [standings, setStandings] = useState<DriverPosition[]>([]);
  
  const [telemetryHistory, setTelemetryHistory] = useState<Record<string, Telemetry[]>>({});
  const [replayStatus, setReplayStatus] = useState<ReplayStatus>({
    status: 'playing',
    speed: 1.0,
    currentLap: 1,
    totalLaps: 66,
    trackStatus: 'GREEN'
  });
  const [currentSessionTime, setCurrentSessionTime] = useState<string | null>(null);
  const [weather, setWeather] = useState<WeatherInfo>({
    air_temp: 25.0,
    track_temp: 35.0,
    humidity: 50.0,
    rainfall: 0
  });
  
  const [selectedDriverId, setSelectedDriverId] = useState<string>('VER');
  const [compareDriverA, setCompareDriverA] = useState<string>('VER');
  const [compareDriverB, setCompareDriverB] = useState<string>('NOR');
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  
  const [events, setEvents] = useState<EventFeedItem[]>([]);
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [completedLaps, setCompletedLaps] = useState<Record<string, CompletedLap[]>>({});
  const [stints, setStints] = useState<any[]>([]);

  const [raceFinished, setRaceFinished] = useState<boolean>(false);
  const [showVictoryPodium, setShowVictoryPodium] = useState<boolean>(false);
  const [lights, setLights] = useState<number>(-1);
  const lightsRef = useRef<number>(-1);

  const activeLapTelemetryRef = useRef<Record<string, Telemetry[]>>({});
  const prevLapStartTimeRef = useRef<Record<string, string | null>>({});
  const driverLapCounterRef = useRef<Record<string, number>>({});

  // Refs for tracking simulation sectors
  const simDriverSectorsRef = useRef<Record<string, { s1: number; s2: number; s3: number }>>({});
  const simBestSectorsRef = useRef<{ s1: number; s2: number; s3: number }>({ s1: Infinity, s2: Infinity, s3: Infinity });
  const simDriverBestSectorsRef = useRef<Record<string, { s1: number; s2: number; s3: number }>>({});
  const simDriverLastCompletedSectorsRef = useRef<Record<string, { s1: number; s2: number; s3: number }>>({});
  const simDriverStintsRef = useRef<Record<string, any[]>>({});

  const generateSectorTargets = (driverId: string, trackName: string) => {
    const name = trackName.toLowerCase();
    const isBarcelona = name.includes('barcelona') || name.includes('catalunya');
    const isMonaco = name.includes('monaco');
    const isSilverstone = name.includes('silverstone');
    const isSpa = name.includes('spa');
    const isMonza = name.includes('monza');

    let baseS1 = 22.0;
    let baseS2 = 29.5;
    let baseS3 = 23.0;

    if (isMonaco) {
      baseS1 = 19.5;
      baseS2 = 34.5;
      baseS3 = 20.0;
    } else if (isSilverstone) {
      baseS1 = 28.0;
      baseS2 = 35.5;
      baseS3 = 26.5;
    } else if (isSpa) {
      baseS1 = 31.5;
      baseS2 = 47.0;
      baseS3 = 26.5;
    } else if (isMonza) {
      baseS1 = 26.8;
      baseS2 = 28.0;
      baseS3 = 27.2;
    } else if (name.includes('ring') || name.includes('austria')) {
      baseS1 = 16.8;
      baseS2 = 17.8;
      baseS3 = 28.9;
    }

    let driverBonus = 0.0;
    if (driverId === 'VER') driverBonus = -0.4;
    else if (driverId === 'NOR') driverBonus = -0.3;
    else if (driverId === 'LEC') driverBonus = -0.2;
    else if (driverId === 'SAI') driverBonus = -0.15;
    else if (driverId === 'HAM') driverBonus = -0.1;
    else if (driverId === 'RUS') driverBonus = -0.05;
    
    const deviation = () => (Math.random() * 0.4 - 0.2); // +/- 0.2s

    return {
      s1: Number((baseS1 + deviation() + (driverBonus * 0.3)).toFixed(3)),
      s2: Number((baseS2 + deviation() + (driverBonus * 0.4)).toFixed(3)),
      s3: Number((baseS3 + deviation() + (driverBonus * 0.3)).toFixed(3))
    };
  };

  const runLightsSequence = useCallback(() => {
    setLights(0);
    lightsRef.current = 0;
    
    // Rev the engines during lights sequence!
    setTelemetryHistory(hist => {
      const updated = { ...hist };
      Object.keys(updated).forEach(dId => {
        const list = updated[dId] ? [...updated[dId]] : [];
        if (list.length > 0) {
          const lastItem = { ...list[list.length - 1] };
          lastItem.rpm = 11700 + Math.round(Math.random() * 300);
          lastItem.throttle = 1.0;
          lastItem.speed = 0.0;
          lastItem.gear = 1;
          list[list.length - 1] = lastItem;
        }
      });
      return updated;
    });

    let currentLight = 0;
    const intervalId = setInterval(() => {
      currentLight++;
      if (currentLight <= 5) {
        setLights(currentLight);
        lightsRef.current = currentLight;
      } else {
        clearInterval(intervalId);
        // Random lights out delay (0.8s to 2.2s)
        const delay = 800 + Math.random() * 1400;
        setTimeout(() => {
          setLights(6);
          lightsRef.current = 6;
          // After 3 seconds, turn off the lights overlay
          setTimeout(() => {
            setLights(-1);
            lightsRef.current = -1;
          }, 3000);
        }, delay);
      }
    }, 1000);
  }, []);

  const clearCompletedLaps = useCallback(() => {
    setCompletedLaps({});
    setTelemetryHistory({});
    setStandings([]);
    setEvents([]);
    setInsights([]);
    setRaceFinished(false);
    setShowVictoryPodium(false);
    activeLapTelemetryRef.current = {};
    prevLapStartTimeRef.current = {};
    driverLapCounterRef.current = {};
  }, []);

  const processPositionsForLaps = useCallback((positionsList: DriverPosition[]) => {
    positionsList.forEach(pos => {
      const dId = pos.driver_id;
      const currentStart = pos.lap_start_time;
      const prevStart = prevLapStartTimeRef.current[dId];

      if (currentStart && prevStart && currentStart !== prevStart) {
        // Lap changed! Let's package the completed lap
        const rawTelemetry = activeLapTelemetryRef.current[dId] || [];
        if (rawTelemetry.length > 5) {
          // Increment completed lap counter
          const lapNum = (driverLapCounterRef.current[dId] || 0) + 1;
          driverLapCounterRef.current[dId] = lapNum;

          const newCompletedLap: CompletedLap = {
            lapNumber: lapNum,
            driverId: dId,
            telemetry: [...rawTelemetry]
          };

          setCompletedLaps(prev => {
            const list = prev[dId] ? [...prev[dId]] : [];
            const updated = [...list, newCompletedLap].slice(-5);
            return { ...prev, [dId]: updated };
          });
        }
        // Clear active telemetry for new lap
        activeLapTelemetryRef.current[dId] = [];
      }

      if (currentStart) {
        prevLapStartTimeRef.current[dId] = currentStart;
      }
    });
  }, []);

  // Refs for tracking mutable data in loop
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const simTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Refs to avoid dependency recreation loops
  const sessionsRef = useRef<Session[]>(sessions);
  const activeSessionIdRef = useRef<string>(activeSessionId);
  const driversRef = useRef<Driver[]>(drivers);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  useEffect(() => {
    driversRef.current = drivers;
  }, [drivers]);
  
  // Refs for simulation state variables
  const simTimeRef = useRef<number>(0.0);
  const simLapRef = useRef<number>(24);
  const simStatusRef = useRef<'playing' | 'paused'>('playing');
  const simSpeedRef = useRef<number>(1.0);
  const simTrackStatusRef = useRef<string>('GREEN');
  const simSCProgressRef = useRef<number>(0.0);
  const simFlagTicksRemainingRef = useRef<number>(0);
  const simSessionTypeRef = useRef<'RACE' | 'QUALIFYING' | 'PRACTICE'>('RACE');
  const driverBestLapRef = useRef<Record<string, number>>({});
  const driverProgressRef = useRef<Record<string, number>>({});
  const driverLapsCompletedRef = useRef<Record<string, number>>({});
  const driverPitStartTimesRef = useRef<Record<string, Date>>({});
  const driverPitDurationsRef = useRef<Record<string, number>>({});
  const driverLapStartTimesRef = useRef<Record<string, Date>>({});
  const driverBatteryRef = useRef<Record<string, number>>({});
  const simStartSessionTimeRef = useRef<Date | null>(null);

  // 1. Fetch initial REST data from FastAPI
  const fetchData = useCallback(async () => {
    if (isSimulation) return;
    try {
      const resSessions = await fetch(`${BASE_URL}/api/sessions`);
      if (resSessions.ok) {
        const data = await resSessions.json();
        const mapped = data.map((s: any) => ({
          id: s.id,
          name: s.name,
          trackName: s.track_name,
          isActive: s.is_active,
          type: s.type
        }));
        setSessions(mapped);
        const active = mapped.find((s: any) => s.isActive) || mapped[0];
        if (active) {
          setActiveSessionId(active.id);
          setSessionType(active.type || 'RACE');
        }
      }

      const resDrivers = await fetch(`${BASE_URL}/api/drivers`);
      if (resDrivers.ok) {
        const data = await resDrivers.json();
        setDrivers(data);
      }

      const resStints = await fetch(`${BASE_URL}/api/stints`);
      if (resStints.ok) {
        const data = await resStints.json();
        setStints(data);
      }
    } catch (e) {
      console.warn('REST API unavailable, loading mock definitions', e);
      setSessions(mockSessions);
      setActiveSessionId('11307');
      setDrivers(mockDrivers);
    }
  }, [isSimulation]);

  // 2. Select Session REST
  const selectSession = async (sessionId: string) => {
    setActiveSessionId(sessionId);
    clearCompletedLaps();
    
    const found = sessionsRef.current.find(s => s.id === sessionId) || mockSessions.find(s => s.id === sessionId);
    if (found) {
      setSessionType(found.type || 'RACE');
    } else {
      setSessionType('RACE');
    }

    if (isSimulation) {
      startSimulation();
      if (found?.type === 'RACE' || !found?.type) {
        runLightsSequence();
      }
      return;
    }
    try {
      await fetch(`${BASE_URL}/api/sessions/select/${sessionId}`, { method: 'POST' });
      // Invalidate data
      setStandings([]);
      setTelemetryHistory({});
      setEvents([]);
      setInsights([]);
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  // 3. Control API Calls (Play, Pause, Speed, Start, End)
  const playReplay = async () => {
    if (isSimulation) {
      simStatusRef.current = 'playing';
      setReplayStatus(prev => ({ ...prev, status: 'playing' }));
      return;
    }
    try {
      await fetch(`${BASE_URL}/api/replay/play`, { method: 'POST' });
    } catch (e) { console.error(e); }
  };

  const pauseReplay = async () => {
    if (isSimulation) {
      simStatusRef.current = 'paused';
      setReplayStatus(prev => ({ ...prev, status: 'paused' }));
      return;
    }
    try {
      await fetch(`${BASE_URL}/api/replay/pause`, { method: 'POST' });
    } catch (e) { console.error(e); }
  };

  const setReplaySpeed = async (speed: number) => {
    if (isSimulation) {
      simSpeedRef.current = speed;
      setReplayStatus(prev => ({ ...prev, speed }));
      return;
    }
    try {
      await fetch(`${BASE_URL}/api/replay/speed/${speed}`, { method: 'POST' });
    } catch (e) { console.error(e); }
  };

  const goReplayToStart = async () => {
    clearCompletedLaps();
    if (isSimulation) {
      simTimeRef.current = 0.0;
      simLapRef.current = 1;
      driverLapsCompletedRef.current = {};
      const activeDrivers = driversRef.current.length > 0 ? driversRef.current : mockDrivers;
      activeDrivers.forEach((d, idx) => {
        if (d.id === 'ALB' || d.id === 'SAR') {
          driverProgressRef.current[d.id] = 0.0;
        } else {
          driverProgressRef.current[d.id] = 0.95 - (idx * 0.04);
        }
        driverLapsCompletedRef.current[d.id] = 0;
        driverBatteryRef.current[d.id] = 80.0;
        driverLapStartTimesRef.current[d.id] = new Date();
      });
      runLightsSequence();
      return;
    }
    try {
      await fetch(`${BASE_URL}/api/replay/start`, { method: 'POST' });
    } catch (e) { console.error(e); }
  };

  const goReplayToEnd = async () => {
    if (isSimulation) {
      simTimeRef.current = 66.0 * 75.0; // 66 laps * 75s avg
      simLapRef.current = 66;
      const activeDrivers = driversRef.current.length > 0 ? driversRef.current : mockDrivers;
      
      activeDrivers.forEach((d, idx) => {
        if (d.id === 'SAR' || d.id === 'ALB') {
          driverProgressRef.current[d.id] = 0.0;
          driverLapsCompletedRef.current[d.id] = 0;
        } else if (d.id === 'HAM') {
          driverProgressRef.current[d.id] = 0.45;
          driverLapsCompletedRef.current[d.id] = 28;
        } else if (d.id === 'PIA') {
          driverProgressRef.current[d.id] = 0.72;
          driverLapsCompletedRef.current[d.id] = 45;
        } else {
          driverProgressRef.current[d.id] = 0.01 + (idx * 0.001); // crossed finish line
          driverLapsCompletedRef.current[d.id] = 66;
        }
      });

      setRaceFinished(true);
      setShowVictoryPodium(true);
      simStatusRef.current = 'paused';
      setReplayStatus(prev => ({
        ...prev,
        status: 'paused',
        currentLap: 66,
      }));
      return;
    }
    try {
      await fetch(`${BASE_URL}/api/replay/end`, { method: 'POST' });
    } catch (e) { console.error(e); }
  };

  // --- WebSocket Connection ---
  const connectWebSocket = useCallback(() => {
    if (isSimulation) return;
    
    setConnectionStatus('connecting');
    if (wsRef.current) {
      wsRef.current.close();
    }

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus('connected');
      console.log('WS Connected');
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const { type, data: payload } = data;

        if (type === 'telemetry_all') {
          setReplayStatus(prev => {
            if (prev.status === 'paused') return prev; // Freeze updates if paused client-side
            
            setTelemetryHistory(hist => {
              const updated = { ...hist };
              Object.entries(payload).forEach(([dId, value]: [string, any]) => {
                const item: Telemetry = {
                  timestamp: value.timestamp,
                  driver_id: value.driver_id,
                  speed: value.speed,
                  rpm: value.rpm,
                  throttle: value.throttle,
                  brake: value.brake,
                  gear: value.gear,
                  tyre_age: value.tyre_age,
                  last_lap: value.last_lap,
                  battery: value.battery,
                  track_progress: value.track_progress,
                  laps: value.laps || 1,
                  is_pitting: value.is_pitting || false,
                };
                const list = updated[dId] ? [...updated[dId]] : [];
                list.push(item);
                if (list.length > 45) list.shift();
                updated[dId] = list;

                // Also accumulate active lap telemetry
                if (!activeLapTelemetryRef.current[dId]) {
                  activeLapTelemetryRef.current[dId] = [];
                }
                activeLapTelemetryRef.current[dId].push(item);
              });
              return updated;
            });
            return prev;
          });
        } 
        else if (type === 'positions') {
          const rawPositions: any[] = payload;
          const mappedPositions: DriverPosition[] = rawPositions.map(p => ({
            position: p.position,
            driver_id: p.driver_id,
            driver_name: p.driver_name,
            team: p.team,
            gap: p.gap,
            interval: p.interval,
            last_lap: p.last_lap,
            best_lap: p.best_lap,
            tyre: p.tyre,
            tyre_age: p.tyre_age,
            laps: p.laps || 1,
            track_progress: p.track_progress,
            drs_active: p.drs_active,
            delta: p.delta,
            is_pitting: p.is_pitting,
            lap_start_time: p.lap_start_time,
            lap_duration: p.lap_duration,
            pit_start_time: p.pit_start_time,
            pit_duration: p.pit_duration,
            s1: p.s1,
            s1_color: p.s1_color,
            s2: p.s2,
            s2_color: p.s2_color,
            s3: p.s3,
            s3_color: p.s3_color,
          }));
          setStandings(mappedPositions);
          processPositionsForLaps(mappedPositions);
          if (data.current_session_time) {
            setCurrentSessionTime(data.current_session_time);
          }
          if (data.weather) {
            setWeather({
              air_temp: typeof data.weather.air_temp === 'number' ? data.weather.air_temp : (data.weather.air_temperature ?? 25.0),
              track_temp: typeof data.weather.track_temp === 'number' ? data.weather.track_temp : (data.weather.track_temperature ?? 35.0),
              humidity: data.weather.humidity ?? 50.0,
              rainfall: data.weather.rainfall ?? 0,
            });
          }
        } 
        else if (type === 'replay') {
          setReplayStatus({
            status: payload.status,
            speed: payload.speed,
            currentLap: payload.current_lap,
            totalLaps: payload.total_laps,
            trackStatus: payload.track_status
          });
        } 
        else if (type === 'event') {
          setEvents(prev => [payload, ...prev].slice(0, 50));
        } 
        else if (type === 'insight') {
          setInsights(prev => [payload, ...prev].slice(0, 50));
        }
      } catch (err) {
        console.error('Error parsing WS message', err);
      }
    };

    ws.onclose = () => {
      setConnectionStatus('disconnected');
      console.warn('WS Disconnected, scheduled reconnect...');
      reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = (e) => {
      console.error('WS Connection error', e);
      ws.close();
    };

  }, [isSimulation]);

  // --- Local high-fidelity simulation engine ---
  const stopSimulation = useCallback(() => {
    if (simTimerRef.current) {
      clearInterval(simTimerRef.current);
      simTimerRef.current = null;
    }
  }, []);

  const startSimulation = useCallback(() => {
    stopSimulation();
    setConnectionStatus('simulating');

    simTimeRef.current = 0.0;
    simLapRef.current = 1;
    simStatusRef.current = 'playing';
    simSpeedRef.current = 1.0;
    simTrackStatusRef.current = 'GREEN';
    
    const activeSession = sessionsRef.current.find(s => s.id === activeSessionIdRef.current) || mockSessions.find(s => s.id === activeSessionIdRef.current) || mockSessions[0];
    simSessionTypeRef.current = activeSession.type || 'RACE';
    driverBestLapRef.current = {};

    simDriverSectorsRef.current = {};
    simBestSectorsRef.current = { s1: Infinity, s2: Infinity, s3: Infinity };
    simDriverBestSectorsRef.current = {};
    simDriverLastCompletedSectorsRef.current = {};
    simDriverStintsRef.current = {};

    simStartSessionTimeRef.current = new Date();
    driverProgressRef.current = {};
    driverLapsCompletedRef.current = {};
    driverPitStartTimesRef.current = {};
    driverPitDurationsRef.current = {};
    driverLapStartTimesRef.current = {};
    driverBatteryRef.current = {};

    const driversList = driversRef.current.length > 0 ? driversRef.current : mockDrivers;

    driversList.forEach((d, idx) => {
      if (d.id === 'SAR' || d.id === 'ALB') {
        driverProgressRef.current[d.id] = 0.0;
      } else {
        const startingProgress = 0.95 - (idx * 0.04);
        driverProgressRef.current[d.id] = startingProgress;
      }
      driverLapsCompletedRef.current[d.id] = 0;
      driverBatteryRef.current[d.id] = 80.0;
      driverLapStartTimesRef.current[d.id] = new Date(simStartSessionTimeRef.current!.getTime() - ((driverProgressRef.current[d.id] || 0.0) * 75 * 1000));
      
      simDriverSectorsRef.current[d.id] = generateSectorTargets(d.id, activeSession.trackName);
      simDriverStintsRef.current[d.id] = [
        {
          driver_id: d.id,
          stint_number: 1,
          lap_start: 1,
          lap_end: 1,
          compound: 'M',
          tyre_age_at_start: 0
        }
      ];
    });

    let tickCount = 0;

    simTimerRef.current = setInterval(() => {
      const isPlaying = simStatusRef.current === 'playing';
      const speed = simSpeedRef.current;

      if (!isPlaying) return;

      tickCount++;
      const isCountdown = lightsRef.current >= 0 && lightsRef.current <= 5;

      if (!isCountdown) {
        simTimeRef.current += 0.1 * speed;
      }

      const currentVirtualTime = new Date(simStartSessionTimeRef.current!.getTime() + (simTimeRef.current * 1000));
      setCurrentSessionTime(currentVirtualTime.toISOString());

      // Safety Car / Flag State Machine scheduler
      if (!isCountdown) {
        if (simTrackStatusRef.current !== 'GREEN') {
          simFlagTicksRemainingRef.current -= 1;
          if (simFlagTicksRemainingRef.current <= 0) {
            if (simTrackStatusRef.current === 'SC') {
              simTrackStatusRef.current = 'SC_ENDING';
              simFlagTicksRemainingRef.current = 40; // 4 seconds of SC ending
              setEvents(prev => [{
                id: Math.random().toString(),
                type: 'INFO',
                message: `🚨 SAFETY CAR IN THIS LAP: Safety car returning to pit lane. Resuming...`,
                timestamp: new Date().toLocaleTimeString()
              }, ...prev].slice(0, 50));
            } else {
              simTrackStatusRef.current = 'GREEN';
              setEvents(prev => [{
                id: Math.random().toString(),
                type: 'INFO',
                message: `🟢 TRACK CLEAR: Green Flag, race resumes.`,
                timestamp: new Date().toLocaleTimeString()
              }, ...prev].slice(0, 50));
            }
          }
        } else {
          // GREEN flag: check random event triggers (only after lap 1 completed by leader VER)
          const leaderLaps = driverLapsCompletedRef.current['VER'] || 0;
          if (leaderLaps >= 1 && Math.random() < 0.001) {
            const rand = Math.random();
            if (rand < 0.5) {
              const sec = Math.floor(Math.random() * 3) + 1;
              simTrackStatusRef.current = sec === 1 ? 'YELLOW_S1' : sec === 2 ? 'YELLOW_S2' : 'YELLOW_S3';
              simFlagTicksRemainingRef.current = 150 + Math.floor(Math.random() * 150);
              setEvents(prev => [{
                id: Math.random().toString(),
                type: 'WARNING',
                message: `🟡 YELLOW FLAG: Sector ${sec} hazard detected. Drivers must slow down.`,
                timestamp: new Date().toLocaleTimeString()
              }, ...prev].slice(0, 50));
            } else if (rand < 0.8) {
              simTrackStatusRef.current = 'VSC';
              simFlagTicksRemainingRef.current = 250 + Math.floor(Math.random() * 200);
              setEvents(prev => [{
                id: Math.random().toString(),
                type: 'WARNING',
                message: `⚠️ VIRTUAL SAFETY CAR DEPLOYED: Reduce speed and maintain delta.`,
                timestamp: new Date().toLocaleTimeString()
              }, ...prev].slice(0, 50));
            } else {
              simTrackStatusRef.current = 'SC';
              simFlagTicksRemainingRef.current = 400 + Math.floor(Math.random() * 250);
              const verProg = driverProgressRef.current['VER'] || 0.0;
              simSCProgressRef.current = (verProg + 0.15) % 1.0; // Join slightly in front of leader
              setEvents(prev => [{
                id: Math.random().toString(),
                type: 'WARNING',
                message: `🚨 SAFETY CAR DEPLOYED: Queue behind Safety Car. Overtaking prohibited.`,
                timestamp: new Date().toLocaleTimeString()
              }, ...prev].slice(0, 50));
            }
          }
        }

        // Advance Safety Car if active
        if (simTrackStatusRef.current === 'SC') {
          simSCProgressRef.current = (simSCProgressRef.current + 0.0011) % 1.0;
        } else if (simTrackStatusRef.current === 'SC_ENDING') {
          simSCProgressRef.current = (simSCProgressRef.current + 0.0018) % 1.0; // accelerate away
        }
      }

      // Compute running order of drivers (sorted by laps desc, progress desc)
      const runningDrivers = driversList
        .filter(d => d.id !== 'ALB' && d.id !== 'SAR' && !(d.id === 'HAM' && (driverLapsCompletedRef.current['HAM'] || 0) >= 28) && !(d.id === 'PIA' && (driverLapsCompletedRef.current['PIA'] || 0) >= 45))
        .map(d => ({
          id: d.id,
          laps: driverLapsCompletedRef.current[d.id] || 0,
          progress: driverProgressRef.current[d.id] || 0.0
        }));
      runningDrivers.sort((a, b) => {
        if (b.laps !== a.laps) return b.laps - a.laps;
        return b.progress - a.progress;
      });
      const runningOrder = runningDrivers.map(x => x.id);

      // Helper to generate simulated telemetry
      const generateSimulatedTelemetry = (driverId: string, progress: number, isPitting: boolean): Telemetry => {
        const stateBattery = driverBatteryRef.current[driverId] || 80.0;
        
        let throttle = 0.0;
        let brake = 0.0;
        let gear = 1;
        let speedVal = 0.0;
        let rpmVal = 1000;

        const sec = progress < 0.33 ? 1 : progress < 0.66 ? 2 : 3;
        const isYellowInMySector = 
          (simTrackStatusRef.current === 'YELLOW_S1' && sec === 1) ||
          (simTrackStatusRef.current === 'YELLOW_S2' && sec === 2) ||
          (simTrackStatusRef.current === 'YELLOW_S3' && sec === 3);

        const isVSCOrSCActive = simTrackStatusRef.current === 'VSC' || simTrackStatusRef.current === 'SC' || simTrackStatusRef.current === 'SC_ENDING';

        if (isCountdown) {
          throttle = 1.0;
          brake = 1.0;
          speedVal = 0.0;
          gear = 1;
          rpmVal = 11500 + Math.random() * 300;
        } else if (isPitting) {
          brake = 1.0;
          speedVal = 0.0;
          gear = 0;
          rpmVal = 3000 + Math.random() * 200;
        } else {
          // Dynamic throttle / brake profiles based on position progress wave
          const wave = Math.sin(progress * 2.0 * Math.PI * 4.0); // 4 sectors/corners
          if (isVSCOrSCActive) {
            speedVal = 100.0 + (wave * 6.0) + (Math.random() * 2.0);
            throttle = 0.25 + (wave * 0.08);
            brake = 0.0;
          } else if (isYellowInMySector) {
            speedVal = 120.0 + (wave * 12.0) + (Math.random() * 3.0);
            throttle = 0.35 + (wave * 0.12);
            brake = 0.0;
          } else {
            if (wave > 0.1) {
              throttle = 0.3 + (wave * 0.7);
              brake = 0.0;
            } else if (wave < -0.1) {
              throttle = 0.0;
              brake = 0.2 + (Math.abs(wave) * 0.8);
            } else {
              throttle = 0.25 + (Math.random() * 0.1);
              brake = 0.0;
            }

            // speed mapping
            const baseSpeed = 240.0;
            speedVal = baseSpeed + (wave * 100.0) + (Math.random() * 5.0);
          }
          if (speedVal < 50) speedVal = 50;
          if (speedVal > 350) speedVal = 350;

          // gear shifting
          if (speedVal < 80) gear = 1;
          else if (speedVal < 110) gear = 2;
          else if (speedVal < 140) gear = 3;
          else if (speedVal < 175) gear = 4;
          else if (speedVal < 210) gear = 5;
          else if (speedVal < 250) gear = 6;
          else if (speedVal < 290) gear = 7;
          else gear = 8;

          // RPM mapping
          const baseRPM = 8000;
          if (isVSCOrSCActive || isYellowInMySector) {
            rpmVal = 4000 + (speedVal * 20) + (Math.random() * 100);
          } else {
            rpmVal = baseRPM + ((speedVal % 45) / 45) * 5000 + (Math.random() * 150);
          }
        }

        // Battery drainage
        let bat = stateBattery;
        if (isCountdown) {
          // static
        } else if (isPitting || speedVal < 5.0) {
          // ERS is inactive when pitting or stationary
        } else if (brake > 0.1) {
          bat += 0.8 * brake * speed;
        } else if (throttle > 0.1) {
          // ERS deployment: capped under flags to save battery
          const deployRate = isVSCOrSCActive || isYellowInMySector ? 0.08 : 0.35;
          bat -= deployRate * throttle * speed;
        } else {
          bat += 0.02 * speed;
        }
        bat = Math.max(0.0, Math.min(100.0, bat));
        driverBatteryRef.current[driverId] = bat;

        return {
          timestamp: currentVirtualTime.toISOString(),
          driver_id: driverId,
          speed: Math.round(speedVal * 10) / 10,
          rpm: Math.round(rpmVal),
          throttle: Math.round(throttle * 100) / 100,
          brake: Math.round(brake * 100) / 100,
          gear,
          tyre_age: driverLapsCompletedRef.current[driverId] || 0,
          last_lap: driverId === 'VER' ? '1:14.256' : '1:14.912',
          battery: Math.round(bat * 10) / 10,
          track_progress: progress,
          laps: driverLapsCompletedRef.current[driverId] || 0,
          is_pitting: isPitting
        };
      };

      // 1. Advance drivers progress
      driversList.forEach((d, idx) => {
        // ALB is DNS
        if (d.id === 'ALB') {
          driverProgressRef.current[d.id] = 0.0;
          driverLapsCompletedRef.current[d.id] = 0;
          const telItem: Telemetry = {
            timestamp: currentVirtualTime.toISOString(),
            driver_id: d.id,
            speed: 0.0,
            rpm: 0,
            throttle: 0.0,
            brake: 0.0,
            gear: 0,
            tyre_age: 0,
            last_lap: 'DNS',
            battery: 0.0,
            track_progress: 0.0,
            laps: 0,
            is_pitting: false
          };
          setTelemetryHistory(hist => {
            const list = hist[d.id] ? [...hist[d.id]] : [];
            list.push(telItem);
            if (list.length > 40) list.shift();
            return { ...hist, [d.id]: list };
          });
          return;
        }

        // SAR is DNQ
        if (d.id === 'SAR') {
          driverProgressRef.current[d.id] = 0.0;
          driverLapsCompletedRef.current[d.id] = 0;
          const telItem: Telemetry = {
            timestamp: currentVirtualTime.toISOString(),
            driver_id: d.id,
            speed: 0.0,
            rpm: 0,
            throttle: 0.0,
            brake: 0.0,
            gear: 0,
            tyre_age: 0,
            last_lap: 'DNQ',
            battery: 0.0,
            track_progress: 0.0,
            laps: 0,
            is_pitting: false
          };
          setTelemetryHistory(hist => {
            const list = hist[d.id] ? [...hist[d.id]] : [];
            list.push(telItem);
            if (list.length > 40) list.shift();
            return { ...hist, [d.id]: list };
          });
          return;
        }

        const laps = driverLapsCompletedRef.current[d.id] || 0;
        const isHAM_DNF = d.id === 'HAM' && laps >= 28;
        const isPIA_DNF = d.id === 'PIA' && laps >= 45;

        // If DNF
        if (isHAM_DNF || isPIA_DNF) {
          if (isHAM_DNF && driverProgressRef.current[d.id] !== 0.45) {
            driverProgressRef.current[d.id] = 0.45;
          }
          if (isPIA_DNF && driverProgressRef.current[d.id] !== 0.72) {
            driverProgressRef.current[d.id] = 0.72;
          }
          const progress = driverProgressRef.current[d.id] || 0.0;
          const telItem: Telemetry = {
            timestamp: currentVirtualTime.toISOString(),
            driver_id: d.id,
            speed: 0.0,
            rpm: 0,
            throttle: 0.0,
            brake: 0.0,
            gear: 0,
            tyre_age: laps,
            last_lap: 'DNF',
            battery: 0.0,
            track_progress: progress,
            laps,
            is_pitting: false
          };
          setTelemetryHistory(hist => {
            const list = hist[d.id] ? [...hist[d.id]] : [];
            list.push(telItem);
            if (list.length > 40) list.shift();
            return { ...hist, [d.id]: list };
          });
          return;
        }

        let progress = driverProgressRef.current[d.id];
        if (progress === undefined) {
          progress = 0.95 - (idx * 0.04);
          driverProgressRef.current[d.id] = progress;
        }

        let isPitting = false;

        // If countdown, hold progress
        if (isCountdown) {
          const telItem = generateSimulatedTelemetry(d.id, progress, false);
          setTelemetryHistory(hist => {
            const list = hist[d.id] ? [...hist[d.id]] : [];
            list.push(telItem);
            if (list.length > 40) list.shift();
            return { ...hist, [d.id]: list };
          });
          return;
        }

        const pitStart = driverPitStartTimesRef.current[d.id];
        const pitDur = driverPitDurationsRef.current[d.id] || 22.0;

        if (pitStart) {
          const elapsedPit = (currentVirtualTime.getTime() - pitStart.getTime()) / 1000.0;
          if (elapsedPit <= pitDur) {
            isPitting = true;
            const pitFraction = elapsedPit / pitDur;
            if (pitFraction <= 0.4) {
              progress = 0.90 + (0.05) * (pitFraction / 0.4);
            } else if (pitFraction <= 0.6) {
              progress = 0.95;
            } else {
              const t = (pitFraction - 0.6) / 0.4;
              progress = (0.95 + (0.10) * t) % 1.0;
            }
            driverProgressRef.current[d.id] = progress;
          } else {
            delete driverPitStartTimesRef.current[d.id];
            delete driverPitDurationsRef.current[d.id];
          }
        }

        if (!isPitting) {
          let step = 0.0025;
          if (d.id === 'VER') step = 0.0027;
          if (d.id === 'NOR') step = 0.0029;
          if (d.id === 'LEC') step = 0.0026;

          const isVSCOrSCActive = simTrackStatusRef.current === 'VSC' || simTrackStatusRef.current === 'SC' || simTrackStatusRef.current === 'SC_ENDING';
          const sec = progress < 0.33 ? 1 : progress < 0.66 ? 2 : 3;
          const isYellowInMySector = 
            (simTrackStatusRef.current === 'YELLOW_S1' && sec === 1) ||
            (simTrackStatusRef.current === 'YELLOW_S2' && sec === 2) ||
            (simTrackStatusRef.current === 'YELLOW_S3' && sec === 3);

          let isCapped = false;

          if (simTrackStatusRef.current === 'SC' || simTrackStatusRef.current === 'SC_ENDING') {
            const runIdx = runningOrder.indexOf(d.id);
            if (runIdx === 0) {
              const distToSC = (simSCProgressRef.current - progress + 1.0) % 1.0;
              if (distToSC < 0.02) {
                progress = (simSCProgressRef.current - 0.02 + 1.0) % 1.0;
                step = 0.0011;
                isCapped = true;
              } else if (distToSC > 0.035) {
                step = 0.0016; // Catching up
              } else {
                step = 0.0011;
              }
            } else if (runIdx > 0) {
              const leadId = runningOrder[runIdx - 1];
              const leadProg = driverProgressRef.current[leadId] || 0.0;
              const distToLead = (leadProg - progress + 1.0) % 1.0;
              if (distToLead < 0.02) {
                progress = (leadProg - 0.02 + 1.0) % 1.0;
                step = 0.0011;
                isCapped = true;
              } else if (distToLead > 0.035) {
                step = 0.0016; // Catching up
              } else {
                step = 0.0011;
              }
            }
          } else if (simTrackStatusRef.current === 'VSC') {
            step = 0.0010;
          } else if (isYellowInMySector) {
            step = 0.0012;
          }

          const oldProgress = progress;
          if (!isCapped) {
            progress = (progress + step + (Math.random() * 0.0002 - 0.0001)) % 1.0;
          }
          driverProgressRef.current[d.id] = progress;

          // Pit strategy trigger randomly at line 0.90
          if (oldProgress < 0.90 && progress >= 0.90) {
            if (Math.random() < 0.05 && !Object.values(driverPitStartTimesRef.current).some(t => (currentVirtualTime.getTime() - t.getTime()) < 30000)) {
              driverPitStartTimesRef.current[d.id] = currentVirtualTime;
              driverPitDurationsRef.current[d.id] = 20.0 + Math.random() * 4;
              isPitting = true;
              progress = 0.90;
              driverProgressRef.current[d.id] = progress;

              setEvents(prev => [{
                id: Math.random().toString(),
                type: 'PIT_STOP',
                message: `${d.id} enters the pit lane.`,
                timestamp: new Date().toLocaleTimeString()
              }, ...prev].slice(0, 50));

              // Stint updates on pit entry
              const stintsList = simDriverStintsRef.current[d.id] || [];
              if (stintsList.length > 0) {
                stintsList[stintsList.length - 1].lap_end = laps;
              }
              const compounds = ['S', 'M', 'H'];
              const currentComp = stintsList.length > 0 ? stintsList[stintsList.length - 1].compound : 'M';
              const nextComp = compounds.find(c => c !== currentComp) || 'S';
              stintsList.push({
                driver_id: d.id,
                stint_number: stintsList.length + 1,
                lap_start: laps + 1,
                lap_end: laps + 1,
                compound: nextComp,
                tyre_age_at_start: 0
              });
              simDriverStintsRef.current[d.id] = stintsList;
            }
          }

          // Lap completed trigger
          if (oldProgress > 0.90 && progress < 0.10) {
            driverLapStartTimesRef.current[d.id] = currentVirtualTime;
            const newLaps = (driverLapsCompletedRef.current[d.id] || 0) + 1;
            driverLapsCompletedRef.current[d.id] = newLaps;

            // Retrieve sector targets and calculate completed lap time
            const targets = simDriverSectorsRef.current[d.id] || generateSectorTargets(d.id, activeSession.trackName);
            const lapSeconds = targets.s1 + targets.s2 + targets.s3;

            // Update personal best sector times
            const dBest = simDriverBestSectorsRef.current[d.id] || { s1: Infinity, s2: Infinity, s3: Infinity };
            if (targets.s1 < dBest.s1) dBest.s1 = targets.s1;
            if (targets.s2 < dBest.s2) dBest.s2 = targets.s2;
            if (targets.s3 < dBest.s3) dBest.s3 = targets.s3;
            simDriverBestSectorsRef.current[d.id] = dBest;

            // Update session best sector times
            const sBest = simBestSectorsRef.current;
            if (targets.s1 < sBest.s1) sBest.s1 = targets.s1;
            if (targets.s2 < sBest.s2) sBest.s2 = targets.s2;
            if (targets.s3 < sBest.s3) sBest.s3 = targets.s3;

            // Save last completed sector times and generate new ones for the next lap!
            simDriverLastCompletedSectorsRef.current[d.id] = { ...targets };
            simDriverSectorsRef.current[d.id] = generateSectorTargets(d.id, activeSession.trackName);

            // Update stint lap count
            const stintsList = simDriverStintsRef.current[d.id] || [];
            if (stintsList.length > 0) {
              stintsList[stintsList.length - 1].lap_end = newLaps;
            }

            const currentBest = driverBestLapRef.current[d.id] || Infinity;
            if (lapSeconds < currentBest) {
              driverBestLapRef.current[d.id] = lapSeconds;
              
              if (simSessionTypeRef.current === 'QUALIFYING' || simSessionTypeRef.current === 'PRACTICE') {
                setEvents(prev => [{
                  id: Math.random().toString(),
                  type: 'INFO',
                  message: `🟣 PB: ${d.id} sets a ${secondsToTime(lapSeconds)}!`,
                  timestamp: new Date().toLocaleTimeString()
                }, ...prev].slice(0, 50));
              }
            }

            if (d.id === 'VER') {
              setEvents(prev => [{
                id: Math.random().toString(),
                type: 'INFO',
                message: `VER completing Lap ${newLaps}.`,
                timestamp: new Date().toLocaleTimeString()
              }, ...prev].slice(0, 50));

              if (simSessionTypeRef.current === 'RACE' && newLaps >= 66) {
                setRaceFinished(true);
                setShowVictoryPodium(true);
                simStatusRef.current = 'paused';
                setReplayStatus(prev => ({
                  ...prev,
                  status: 'paused',
                  currentLap: 66,
                }));
                setEvents(prev => [{
                  id: Math.random().toString(),
                  type: 'INFO',
                  message: `CHEQUERED FLAG: Max Verstappen wins the Spanish Grand Prix!`,
                  timestamp: new Date().toLocaleTimeString()
                }, ...prev].slice(0, 50));
                return;
              }
            }
          }
        }

        const telItem = generateSimulatedTelemetry(d.id, progress, isPitting);
        setTelemetryHistory(hist => {
          const list = hist[d.id] ? [...hist[d.id]] : [];
          list.push(telItem);
          if (list.length > 40) list.shift();
          return { ...hist, [d.id]: list };
        });

        if (!activeLapTelemetryRef.current[d.id]) {
          activeLapTelemetryRef.current[d.id] = [];
        }
        activeLapTelemetryRef.current[d.id].push(telItem);
      });

      // 2. Generate simulated standings list and sort
      const generateSimulatedPositions = (): DriverPosition[] => {
        const isTimeTrial = simSessionTypeRef.current === 'QUALIFYING' || simSessionTypeRef.current === 'PRACTICE';
        
        const sortedList = driversList.map((d, index) => {
          const progress = driverProgressRef.current[d.id] || 0.0;
          const laps = driverLapsCompletedRef.current[d.id] || 0;
          const lapStart = driverLapStartTimesRef.current[d.id] || currentVirtualTime;
          const elapsedSec = (currentVirtualTime.getTime() - lapStart.getTime()) / 1000.0;
          const isPitting = driverPitStartTimesRef.current[d.id] !== undefined;

          // Check status
          let statusText: 'RUNNING' | 'DNF' | 'DNS' | 'DNQ' = 'RUNNING';
          if (d.id === 'SAR') statusText = 'DNQ';
          else if (d.id === 'ALB') statusText = 'DNS';
          else if (d.id === 'HAM' && laps >= 28) statusText = 'DNF';
          else if (d.id === 'PIA' && laps >= 45) statusText = 'DNF';

          // Get dynamic sector targets
          let targets = simDriverSectorsRef.current[d.id];
          if (!targets) {
            targets = generateSectorTargets(d.id, activeSession.trackName);
            simDriverSectorsRef.current[d.id] = targets;
          }

          const lastCompleted = simDriverLastCompletedSectorsRef.current[d.id];
          const dBest = simDriverBestSectorsRef.current[d.id];
          const sBest = simBestSectorsRef.current;

          let s1 = '';
          let s1_color = 'GRAY';
          let s2 = '';
          let s2_color = 'GRAY';
          let s3 = '';
          let s3_color = 'GRAY';

          const getSecColor = (val: number, bestVal: number, sessionBestVal: number) => {
            if (val <= sessionBestVal + 0.0005) return 'PURPLE';
            if (val <= bestVal + 0.0005) return 'GREEN';
            return 'YELLOW';
          };

          const isFlying = statusText === 'RUNNING' && !isPitting && laps >= 0;

          if (isFlying) {
            if (elapsedSec >= targets.s1) {
              s1 = targets.s1.toFixed(2) + 's';
              s1_color = getSecColor(targets.s1, dBest?.s1 || Infinity, sBest.s1);
            } else {
              s1 = '';
              s1_color = 'GRAY';
            }

            if (elapsedSec >= targets.s1 + targets.s2) {
              s2 = targets.s2.toFixed(2) + 's';
              s2_color = getSecColor(targets.s2, dBest?.s2 || Infinity, sBest.s2);
            } else {
              s2 = '';
              s2_color = 'GRAY';
            }

            s3 = '';
            s3_color = 'GRAY';
          } else {
            // Show last completed lap
            if (lastCompleted) {
              s1 = lastCompleted.s1.toFixed(2) + 's';
              s1_color = getSecColor(lastCompleted.s1, dBest?.s1 || Infinity, sBest.s1);
              s2 = lastCompleted.s2.toFixed(2) + 's';
              s2_color = getSecColor(lastCompleted.s2, dBest?.s2 || Infinity, sBest.s2);
              s3 = lastCompleted.s3.toFixed(2) + 's';
              s3_color = getSecColor(lastCompleted.s3, dBest?.s3 || Infinity, sBest.s3);
            } else {
              s1 = '--';
              s1_color = 'GRAY';
              s2 = '--';
              s2_color = 'GRAY';
              s3 = '--';
              s3_color = 'GRAY';
            }
          }

          let bestLapStr = 'N/A';
          if (driverBestLapRef.current[d.id] && driverBestLapRef.current[d.id] !== Infinity) {
            bestLapStr = secondsToTime(driverBestLapRef.current[d.id]);
          } else if (statusText === 'RUNNING') {
            bestLapStr = d.id === 'VER' ? '1:13.910' : d.id === 'NOR' ? '1:14.052' : '1:14.412';
          }

          let lastLapStr = 'N/A';
          if (statusText !== 'RUNNING') {
            lastLapStr = statusText;
          } else if (lastCompleted) {
            lastLapStr = secondsToTime(lastCompleted.s1 + lastCompleted.s2 + lastCompleted.s3);
          } else {
            lastLapStr = 'N/A';
          }

          // Resolve active compound from stints
          const driverStintsList = simDriverStintsRef.current[d.id] || [];
          const activeStint = driverStintsList[driverStintsList.length - 1];
          const compound = activeStint ? activeStint.compound : 'M';
          const tyreAge = activeStint ? (laps - activeStint.lap_start + activeStint.tyre_age_at_start + 1) : laps + 1;

          return {
            driver_id: d.id,
            driver_name: d.name,
            team: d.team,
            track_progress: progress,
            laps,
            lapStart,
            elapsedSec,
            isPitting,
            origIndex: index,
            tyre: compound,
            tyre_age: statusText === 'RUNNING' ? tyreAge : 99,
            best_lap: bestLapStr,
            last_lap: lastLapStr,
            s1, s1_color,
            s2, s2_color,
            s3, s3_color,
            status: statusText,
          };
        });

        // Sort: RUNNING first, DNF next, DNS next, DNQ last.
        // For time trials: RUNNING are sorted by best lap duration (ascending).
        sortedList.sort((a, b) => {
          if (a.status === 'RUNNING' && b.status === 'RUNNING') {
            if (isTimeTrial) {
              const bestA = driverBestLapRef.current[a.driver_id] || Infinity;
              const bestB = driverBestLapRef.current[b.driver_id] || Infinity;
              if (bestA !== bestB) return bestA - bestB;
              return (b.laps + b.track_progress) - (a.laps + a.track_progress);
            }
            return (b.laps + b.track_progress) - (a.laps + a.track_progress);
          }
          if (a.status === 'RUNNING') return -1;
          if (b.status === 'RUNNING') return 1;
          
          if (a.status === 'DNF' && b.status === 'DNF') {
            return b.laps - a.laps;
          }
          if (a.status === 'DNF') return -1;
          if (b.status === 'DNF') return 1;

          if (a.status === 'DNS' && b.status === 'DNS') return 0;
          if (a.status === 'DNS') return -1;
          if (b.status === 'DNS') return 1;

          return 0;
        });

        const positions: DriverPosition[] = sortedList.map((item, idx) => {
          const isPitting = item.isPitting;
          let gap = 'LEADER';
          let interval = 'LEADER';

          if (item.status === 'DNQ') {
            gap = 'DNQ';
            interval = 'DNQ';
          } else if (item.status === 'DNS') {
            gap = 'DNS';
            interval = 'DNS';
          } else if (item.status === 'DNF') {
            gap = 'DNF';
            interval = 'DNF';
          } else {
            const leader = sortedList[0];
            if (idx > 0) {
              if (isTimeTrial) {
                const bestCurr = driverBestLapRef.current[item.driver_id] || Infinity;
                const bestLeader = driverBestLapRef.current[leader.driver_id] || Infinity;
                
                if (bestCurr === Infinity) {
                  gap = 'N/A';
                  interval = 'N/A';
                } else {
                  if (idx === 0) {
                    gap = 'FASTEST';
                    interval = 'FASTEST';
                  } else {
                    if (bestLeader !== Infinity) {
                      gap = `+${(bestCurr - bestLeader).toFixed(3)}s`;
                    }
                    
                    let prevBestIdx = idx - 1;
                    while (prevBestIdx >= 0 && sortedList[prevBestIdx].status !== 'RUNNING') {
                      prevBestIdx--;
                    }
                    if (prevBestIdx >= 0) {
                      const prevBest = driverBestLapRef.current[sortedList[prevBestIdx].driver_id] || Infinity;
                      if (prevBest !== Infinity) {
                        interval = `+${(bestCurr - prevBest).toFixed(3)}s`;
                      }
                    } else {
                      interval = gap;
                    }
                  }
                }
              } else {
                const gapProgress = (leader.laps + leader.track_progress) - (item.laps + item.track_progress);
                gap = `+${(gapProgress * 75.0).toFixed(3)}s`;
                
                let prevRunningIdx = idx - 1;
                while (prevRunningIdx >= 0 && sortedList[prevRunningIdx].status !== 'RUNNING') {
                  prevRunningIdx--;
                }
                if (prevRunningIdx >= 0) {
                  const prev = sortedList[prevRunningIdx];
                  interval = `+${(((prev.laps + prev.track_progress) - (item.laps + item.track_progress)) * 75.0).toFixed(3)}s`;
                } else {
                  interval = gap;
                }
              }
            } else if (idx === 0 && isTimeTrial) {
              gap = 'FASTEST';
              interval = 'FASTEST';
            }
          }

          return {
            position: idx + 1,
            driver_id: item.driver_id,
            driver_name: item.driver_name,
            team: item.team,
            gap,
            interval,
            last_lap: item.last_lap,
            best_lap: item.best_lap,
            tyre: item.tyre,
            tyre_age: item.tyre_age,
            laps: item.laps,
            track_progress: item.track_progress,
            drs_active: item.status === 'RUNNING' && ((item.track_progress >= 0.88 || item.track_progress <= 0.12) || (item.track_progress >= 0.40 && item.track_progress <= 0.55)),
            delta: idx === 0 ? 0.0 : -0.05,
            is_pitting: isPitting,
            lap_start_time: item.lapStart.toISOString(),
            lap_duration: 75.0,
            pit_start_time: isPitting ? driverPitStartTimesRef.current[item.driver_id]?.toISOString() || null : null,
            pit_duration: isPitting ? driverPitDurationsRef.current[item.driver_id] || 22.0 : 22.0,
            s1: item.s1, s1_color: item.s1_color,
            s2: item.s2, s2_color: item.s2_color,
            s3: item.s3, s3_color: item.s3_color,
          };
        });

        if (simTrackStatusRef.current === 'SC' || simTrackStatusRef.current === 'SC_ENDING') {
          positions.push({
            position: 0,
            driver_id: 'SC',
            driver_name: 'Safety Car',
            team: 'FIA',
            gap: 'SC',
            interval: 'SC',
            last_lap: 'SC',
            best_lap: 'SC',
            tyre: 'SC',
            tyre_age: 0,
            laps: 0,
            track_progress: simSCProgressRef.current,
            drs_active: false,
            delta: 0,
            is_pitting: false,
            lap_start_time: new Date().toISOString(),
            lap_duration: 0,
            pit_start_time: null,
            pit_duration: 0,
            s1: '', s1_color: '',
            s2: '', s2_color: '',
            s3: '', s3_color: '',
          });
        }

        return positions;
      };

      const simPositions = generateSimulatedPositions();
      setStandings(simPositions);
      processPositionsForLaps(simPositions);

      // 3. Emit ReplayStatus
      const leaderLaps = driverLapsCompletedRef.current['VER'] || 0;
      const currentLapVal = Math.min(66, leaderLaps + 1);
      simLapRef.current = currentLapVal;

      setReplayStatus({
        status: simStatusRef.current,
        speed: simSpeedRef.current,
        currentLap: currentLapVal,
        totalLaps: 66,
        trackStatus: simTrackStatusRef.current
      });

    }, 100);

  }, [stopSimulation, runLightsSequence]);

  // Handle mode transitions (Simulation vs Real-time)
  useEffect(() => {
    clearCompletedLaps();
    if (isSimulation) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      
      // Seed initial metadata so simulation doesn't wait
      setSessions(mockSessions);
      setActiveSessionId('11307');
      setDrivers(mockDrivers);
      
      startSimulation();
      runLightsSequence();
    } else {
      stopSimulation();
      fetchData();
      connectWebSocket();
    }

    return () => {
      stopSimulation();
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, [isSimulation, startSimulation, stopSimulation, fetchData, connectWebSocket]);

  return {
    activePageIndex,
    setActivePageIndex,
    isSimulation,
    setIsSimulation,
    connectionStatus,
    sessions,
    activeSessionId,
    selectSession,
    drivers,
    standings,
    telemetryHistory,
    replayStatus,
    currentSessionTime,
    selectedDriverId,
    setSelectedDriverId,
    compareDriverA,
    setCompareDriverA,
    compareDriverB,
    setCompareDriverB,
    hoverIndex,
    setHoverIndex,
    events,
    insights,
    completedLaps,
    stints,
    sessionType,
    
    // Controls
    playReplay,
    pauseReplay,
    setReplaySpeed,
    goReplayToStart,
    goReplayToEnd,

    // Start Lights & Victory
    lights,
    runLightsSequence,
    raceFinished,
    showVictoryPodium,
    setShowVictoryPodium,
    weather
  };
}
