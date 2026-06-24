import asyncio
import json
import logging
import os
from datetime import datetime, timedelta
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import httpx

# Configure logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai_race_engineer_backend")

app = FastAPI(title="AI Race Engineer Backend")

# Allow CORS for Flutter Web client
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# OpenF1 default session: Barcelona GP 2026 Race (Session Key: 11307)
FALLBACK_SESSION_KEY = 11307
OPENF1_BASE_URL = "https://api.openf1.org/v1"

# In-memory session state
active_session_key = FALLBACK_SESSION_KEY
current_lap = 1
replay_status = "playing"  # "playing" or "paused"
replay_speed = 1.0         # 1.0, 2.0, 5.0, 10.0
current_session_time = None # datetime representing virtual race time
track_status = "GREEN"      # GREEN, YELLOW, VSC, SAFETY CAR
active_connections = []     # List of active WebSocket client connections
driver_battery = {}         # Track ERS battery levels for active drivers
driver_telemetry_state = {} # Persistent speed/gear/battery state for drivers

# Live Streaming variables for upcoming Austrian GP
is_using_mock_data = False
last_lap_timestamp = None
last_position_timestamp = None
last_pit_timestamp = None
last_race_control_timestamp = None
last_weather_timestamp = None

TRACK_SPEED_GATES = {
    "circuit de barcelona-catalunya": [
        (0.0, 290.0),
        (0.08, 320.0),
        (0.12, 135.0),
        (0.15, 125.0),
        (0.22, 240.0),
        (0.26, 150.0),
        (0.31, 105.0),
        (0.36, 220.0),
        (0.40, 140.0),
        (0.44, 180.0),
        (0.48, 260.0),
        (0.54, 290.0),
        (0.58, 85.0),
        (0.64, 160.0),
        (0.70, 120.0),
        (0.76, 90.0),
        (0.82, 220.0),
        (0.88, 280.0)
    ],
    "circuit de monaco": [
        (0.0, 220.0),
        (0.06, 270.0),
        (0.10, 100.0),
        (0.16, 210.0),
        (0.20, 240.0),
        (0.24, 140.0),
        (0.28, 120.0),
        (0.32, 50.0),
        (0.36, 80.0),
        (0.40, 120.0),
        (0.46, 280.0),
        (0.52, 290.0),
        (0.56, 80.0),
        (0.62, 180.0),
        (0.68, 210.0),
        (0.72, 110.0),
        (0.78, 130.0),
        (0.84, 85.0),
        (0.90, 100.0),
        (0.95, 180.0)
    ],
    "silverstone circuit": [
        (0.0, 290.0),
        (0.05, 310.0),
        (0.08, 120.0),
        (0.12, 100.0),
        (0.18, 260.0),
        (0.22, 300.0),
        (0.25, 240.0),
        (0.32, 280.0),
        (0.35, 220.0),
        (0.38, 160.0),
        (0.45, 315.0),
        (0.50, 325.0),
        (0.53, 150.0),
        (0.60, 240.0),
        (0.63, 85.0),
        (0.68, 120.0),
        (0.75, 270.0),
        (0.85, 290.0)
    ],
    "circuit de spa-francorchamps": [
        (0.0, 260.0),
        (0.03, 290.0),
        (0.06, 75.0),
        (0.12, 300.0),
        (0.15, 280.0),
        (0.22, 325.0),
        (0.26, 335.0),
        (0.30, 135.0),
        (0.34, 155.0),
        (0.38, 180.0),
        (0.42, 150.0),
        (0.48, 270.0),
        (0.52, 210.0),
        (0.58, 260.0),
        (0.64, 140.0),
        (0.70, 310.0),
        (0.78, 325.0),
        (0.82, 80.0),
        (0.90, 180.0)
    ],
    "autodromo nazionale monza": [
        (0.0, 300.0),
        (0.08, 345.0),
        (0.12, 75.0),
        (0.18, 280.0),
        (0.22, 310.0),
        (0.26, 110.0),
        (0.32, 240.0),
        (0.36, 160.0),
        (0.44, 320.0),
        (0.48, 335.0),
        (0.52, 170.0),
        (0.56, 220.0),
        (0.64, 330.0),
        (0.68, 340.0),
        (0.72, 180.0),
        (0.84, 290.0)
    ]
}

def get_interpolated_speed(track_name: str, prog: float, drs_active: bool) -> float:
    name = (track_name or "").lower()
    gates = None
    for k, v in TRACK_SPEED_GATES.items():
        if k in name:
            gates = v
            break
    if not gates:
        gates = [(0.0, 275.0), (0.2, 135.0), (0.8, 135.0), (0.88, 275.0), (1.0, 275.0)]
        
    gates = sorted(gates, key=lambda x: x[0])
    prog = prog % 1.0
    
    p1, v1 = gates[-1]
    p2, v2 = gates[0]
    
    for i in range(len(gates) - 1):
        if gates[i][0] <= prog <= gates[i+1][0]:
            p1, v1 = gates[i]
            p2, v2 = gates[i+1]
            break
            
    if p2 > p1:
        t = (prog - p1) / (p2 - p1)
    else:
        dist_total = (1.0 - p1) + p2
        if prog >= p1:
            dist_current = prog - p1
        else:
            dist_current = (1.0 - p1) + prog
        t = dist_current / dist_total
        
    import math
    cos_t = (1 - math.cos(t * math.pi)) / 2.0
    speed = v1 + (v2 - v1) * cos_t
    
    if drs_active and speed > 220.0:
        speed += 15.0
        
    return speed

# Cache of the currently active session data
session_cache = {
    "session_key": None,
    "track_name": "Circuit de Barcelona-Catalunya",
    "drivers": [],
    "laps_by_driver": {},
    "stints_by_driver": {},
    "positions_by_driver": {},
    "pit_stops": [],
    "race_control": [],
    "weather": [],
    "total_laps": 66
}

def parse_date(date_str):
    if not date_str:
        return None
    try:
        return datetime.fromisoformat(date_str.replace("Z", "+00:00"))
    except Exception:
        return None

CACHE_DIR = os.path.join(os.path.dirname(__file__), "cache")
os.makedirs(CACHE_DIR, exist_ok=True)

def read_cache(session_key: int, endpoint: str):
    try:
        s_key = int(session_key)
        if s_key in [11308, 11309, 11310, 11311, 11315] and endpoint not in ["sessions", "drivers"]:
            return None
    except Exception:
        pass
    path = os.path.join(CACHE_DIR, f"session_{session_key}_{endpoint}.json")
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error reading cache for {endpoint}: {e}")
    return None

def write_cache(session_key: int, endpoint: str, data):
    try:
        s_key = int(session_key)
        if s_key in [11308, 11309, 11310, 11311, 11315] and endpoint not in ["sessions", "drivers"]:
            return
    except Exception:
        pass
    path = os.path.join(CACHE_DIR, f"session_{session_key}_{endpoint}.json")
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error(f"Error writing cache for {endpoint}: {e}")

async def load_session_data(session_key: int):
    global session_cache, current_lap, current_session_time
    global is_using_mock_data, last_lap_timestamp, last_position_timestamp, last_pit_timestamp, last_race_control_timestamp, last_weather_timestamp
    if session_cache["session_key"] == session_key:
        return
    
    logger.info(f"Loading data for session {session_key}...")
    
    new_cache = {
        "session_key": session_key,
        "track_name": "Circuit de Barcelona-Catalunya",
        "session_type": "Race",
        "drivers": [],
        "laps_by_driver": {},
        "stints_by_driver": {},
        "positions_by_driver": {},
        "pit_stops": [],
        "race_control": [],
        "weather": [],
        "total_laps": 66
    }
    
    async with httpx.AsyncClient() as client:
        # 1. Fetch Session Info
        try:
            s_data = read_cache(session_key, "sessions")
            if s_data is None:
                r = await client.get(f"{OPENF1_BASE_URL}/sessions?session_key={session_key}", timeout=10.0)
                if r.status_code == 200:
                    s_data = r.json()
                    write_cache(session_key, "sessions", s_data)
            if s_data:
                s_info = s_data[0]
                new_cache["session_type"] = s_info.get("session_type", "Race")
                location = s_info.get("location", "Circuit de Barcelona-Catalunya")
                if "monaco" in location.lower():
                    new_cache["track_name"] = "Circuit de Monaco"
                elif "silverstone" in location.lower():
                    new_cache["track_name"] = "Silverstone Circuit"
                elif "spa" in location.lower():
                    new_cache["track_name"] = "Circuit de Spa-Francorchamps"
                elif "monza" in location.lower():
                    new_cache["track_name"] = "Autodromo Nazionale Monza"
                elif "barcelona" in location.lower() or "catalunya" in location.lower():
                    new_cache["track_name"] = "Circuit de Barcelona-Catalunya"
                else:
                    new_cache["track_name"] = location
                logger.info(f"Track resolved to: {new_cache['track_name']}, Session type: {new_cache['session_type']}")
        except Exception as e:
            logger.error(f"Error fetching session info: {e}")
            
        # 2. Fetch Drivers
        try:
            drivers_data = read_cache(session_key, "drivers")
            if drivers_data is None:
                r = await client.get(f"{OPENF1_BASE_URL}/drivers?session_key={session_key}", timeout=10.0)
                if r.status_code == 200:
                    drivers_data = r.json()
                    write_cache(session_key, "drivers", drivers_data)
            if drivers_data:
                seen = set()
                for d in drivers_data:
                    acronym = d["name_acronym"]
                    if not acronym or acronym in seen:
                        continue
                    seen.add(acronym)
                    team_colour = d["team_colour"] or "FFFFFF"
                    color_hex = f"FF{team_colour}" if len(team_colour) == 6 else "FFFFFFFF"
                    new_cache["drivers"].append({
                        "id": acronym,
                        "name": d["broadcast_name"],
                        "team": d["team_name"],
                        "number": d["driver_number"],
                        "code": acronym,
                        "color": color_hex
                    })
                logger.info(f"Loaded {len(new_cache['drivers'])} drivers.")
        except Exception as e:
            logger.error(f"Error fetching drivers: {e}")

        # 3. Fetch Laps
        try:
            laps_data = read_cache(session_key, "laps")
            if laps_data is None:
                r = await client.get(f"{OPENF1_BASE_URL}/laps?session_key={session_key}", timeout=15.0)
                if r.status_code == 200:
                    laps_data = r.json()
                    write_cache(session_key, "laps", laps_data)
            if laps_data:
                max_lap = 66
                for lap in laps_data:
                    lap["parsed_date_start"] = parse_date(lap.get("date_start"))
                    d_num = lap["driver_number"]
                    if d_num not in new_cache["laps_by_driver"]:
                        new_cache["laps_by_driver"][d_num] = []
                    new_cache["laps_by_driver"][d_num].append(lap)
                    if lap["lap_number"] > max_lap:
                        max_lap = lap["lap_number"]
                new_cache["total_laps"] = max_lap
                logger.info(f"Loaded lap times. Max lap: {max_lap}")
        except Exception as e:
            logger.error(f"Error fetching laps: {e}")

        # 4. Fetch Stints (Tyres)
        try:
            stints_data = read_cache(session_key, "stints")
            if stints_data is None:
                r = await client.get(f"{OPENF1_BASE_URL}/stints?session_key={session_key}", timeout=15.0)
                if r.status_code == 200:
                    stints_data = r.json()
                    write_cache(session_key, "stints", stints_data)
            if stints_data:
                for stint in stints_data:
                    d_num = stint["driver_number"]
                    if d_num not in new_cache["stints_by_driver"]:
                        new_cache["stints_by_driver"][d_num] = []
                    new_cache["stints_by_driver"][d_num].append(stint)
                logger.info("Loaded stints.")
        except Exception as e:
            logger.error(f"Error fetching stints: {e}")

        # 5. Fetch Positions (Standings history)
        try:
            pos_data = read_cache(session_key, "position")
            if pos_data is None:
                r = await client.get(f"{OPENF1_BASE_URL}/position?session_key={session_key}", timeout=15.0)
                if r.status_code == 200:
                    pos_data = r.json()
                    write_cache(session_key, "position", pos_data)
            if pos_data:
                for pos in pos_data:
                    pos["parsed_date"] = parse_date(pos.get("date"))
                    d_num = pos["driver_number"]
                    if d_num not in new_cache["positions_by_driver"]:
                        new_cache["positions_by_driver"][d_num] = []
                    new_cache["positions_by_driver"][d_num].append(pos)
                logger.info("Loaded positions history.")
        except Exception as e:
            logger.error(f"Error fetching positions: {e}")

        # 6. Fetch Pit Stops
        try:
            pit_data = read_cache(session_key, "pit")
            if pit_data is None:
                r = await client.get(f"{OPENF1_BASE_URL}/pit?session_key={session_key}", timeout=15.0)
                if r.status_code == 200:
                    pit_data = r.json()
                    write_cache(session_key, "pit", pit_data)
            if pit_data:
                for pit in pit_data:
                    pit["parsed_date"] = parse_date(pit.get("date"))
                new_cache["pit_stops"] = pit_data
                logger.info("Loaded pit stops.")
        except Exception as e:
            logger.error(f"Error fetching pit stops: {e}")

        # 7. Fetch Race Control
        try:
            rc_data = read_cache(session_key, "race_control")
            if rc_data is None:
                r = await client.get(f"{OPENF1_BASE_URL}/race_control?session_key={session_key}", timeout=15.0)
                if r.status_code == 200:
                    rc_data = r.json()
                    write_cache(session_key, "race_control", rc_data)
            if rc_data:
                for event in rc_data:
                    event["parsed_date"] = parse_date(event.get("date"))
                new_cache["race_control"] = rc_data
                logger.info("Loaded race control events.")
            else:
                new_cache["race_control"] = []
        except Exception as e:
            logger.error(f"Error fetching race control: {e}")
            new_cache["race_control"] = []

        # 8. Fetch Weather
        try:
            weather_data = read_cache(session_key, "weather")
            if weather_data is None:
                r = await client.get(f"{OPENF1_BASE_URL}/weather?session_key={session_key}", timeout=15.0)
                if r.status_code == 200:
                    weather_data = r.json()
                    write_cache(session_key, "weather", weather_data)
            if weather_data:
                for record in weather_data:
                    record["parsed_date"] = parse_date(record.get("date"))
                new_cache["weather"] = weather_data
                logger.info(f"Loaded {len(weather_data)} weather records.")
            else:
                new_cache["weather"] = []
        except Exception as e:
            logger.error(f"Error fetching weather: {e}")
            new_cache["weather"] = []

    # Fallbacks if OpenF1 API is offline
    if not new_cache["drivers"]:
        logger.warning("No drivers loaded, loading standard fallbacks...")
        new_cache["drivers"] = [
            {"id": "VER", "name": "M. Verstappen", "team": "Red Bull Racing", "number": 1, "code": "VER", "color": "FF4781D7"},
            {"id": "NOR", "name": "L. Norris", "team": "McLaren", "number": 4, "code": "NOR", "color": "FFF47600"},
            {"id": "LEC", "name": "C. Leclerc", "team": "Ferrari", "number": 16, "code": "LEC", "color": "FFE10600"},
            {"id": "HAM", "name": "L. Hamilton", "team": "Mercedes AMG", "number": 44, "code": "HAM", "color": "FF27F4D2"},
            {"id": "PIA", "name": "O. Piastri", "team": "McLaren", "number": 81, "code": "PIA", "color": "FFF47600"},
        ]
        
    session_cache = new_cache
    current_lap = 1

    # Check if the session has real telemetry loaded
    has_real_data = False
    for driver_pos in session_cache["positions_by_driver"].values():
        if driver_pos:
            has_real_data = True
            break
            
    # Check if this is an upcoming/live session key
    if session_key in [11308, 11309, 11310, 11311, 11315]:
        if not has_real_data:
            generate_mock_live_data(session_cache)
            is_using_mock_data = True
            last_lap_timestamp = None
            last_position_timestamp = None
            last_pit_timestamp = None
            last_race_control_timestamp = None
            last_weather_timestamp = None
        else:
            is_using_mock_data = False
            laps_list = []
            for driver_laps in session_cache["laps_by_driver"].values():
                laps_list.extend(driver_laps)
            last_lap_timestamp = max(lp.get("date_start") for lp in laps_list) if laps_list else None
            
            pos_list = []
            for driver_pos in session_cache["positions_by_driver"].values():
                pos_list.extend(driver_pos)
            last_position_timestamp = max(p.get("date") for p in pos_list) if pos_list else None
            last_pit_timestamp = max(p.get("date") for p in session_cache["pit_stops"]) if session_cache["pit_stops"] else None
            last_race_control_timestamp = max(event.get("date") for event in session_cache["race_control"]) if session_cache["race_control"] else None
            last_weather_timestamp = max(w.get("date") for w in session_cache["weather"]) if session_cache["weather"] else None
    else:
        is_using_mock_data = False
    
    # Initialize virtual session time to start of Lap 1 of the leader
    min_date = None
    for driver_laps in session_cache["laps_by_driver"].values():
        for lap in driver_laps:
            if lap["lap_number"] == 1:
                lap_date = lap.get("parsed_date_start")
                if lap_date and (min_date is None or lap_date < min_date):
                    min_date = lap_date
                    
    current_session_time = min_date or datetime.now()
    logger.info(f"Session loading complete. Virtual start time: {current_session_time}")

def get_track_status_at_time(cur_time: datetime):
    if not cur_time:
        return "GREEN"
    
    events = session_cache.get("race_control", [])
    if not events:
        return "GREEN"
        
    status = "GREEN"
    
    # Sort events chronologically to process state transitions properly
    sorted_events = sorted(events, key=lambda x: x.get("parsed_date") or datetime.min)
    
    for event in sorted_events:
        evt_date = event.get("parsed_date")
        if not evt_date or evt_date > cur_time:
            continue
            
        category = event.get("category")
        flag = event.get("flag")
        msg = (event.get("message") or "").upper()
        
        # Check RED FLAG (suspends session)
        if flag == "RED" or "RED FLAG" in msg:
            status = "RED"
            continue
            
        # Check Safety Car / VSC (only if category is SafetyCar for deployment/ending events)
        if category == "SafetyCar":
            if "VSC DEPLOYED" in msg:
                status = "VSC"
            elif "VSC ENDING" in msg or "VSC END" in msg:
                status = "GREEN"
            elif "SAFETY CAR DEPLOYED" in msg or ("SAFETY CAR" in msg and "DEPLOYED" in msg):
                status = "SAFETY CAR"
            elif "SAFETY CAR IN THIS LAP" in msg or "ENDING" in msg or "IN THIS LAP" in msg or "RETURNING" in msg:
                status = "GREEN"
            continue
            
        # Check local track flags (only if not under global caution VSC or SAFETY CAR)
        if status not in ["VSC", "SAFETY CAR"]:
            if flag in ["YELLOW", "DOUBLE YELLOW"] or "YELLOW IN" in msg or "DOUBLE YELLOW IN" in msg:
                status = "YELLOW"
            elif flag == "GREEN" or "TRACK CLEAR" in msg or "CLEAR" in msg:
                status = "GREEN"
                
    return status

def get_weather_at_time(cur_time: datetime):
    default_weather = {
        "air_temperature": 26.5,
        "track_temperature": 38.2,
        "humidity": 54.0,
        "rainfall": 0
    }
    if not cur_time:
        return default_weather
        
    records = session_cache.get("weather", [])
    if not records:
        return default_weather
        
    # Sort chronologically
    sorted_records = sorted(records, key=lambda x: x.get("parsed_date") or datetime.min)
    
    latest_record = None
    for record in sorted_records:
        rec_date = record.get("parsed_date")
        if not rec_date or rec_date > cur_time:
            break
        latest_record = record
        
    if latest_record:
        return {
            "air_temperature": latest_record.get("air_temperature", 26.5),
            "track_temperature": latest_record.get("track_temperature", 38.2),
            "humidity": latest_record.get("humidity", 54.0),
            "rainfall": int(latest_record.get("rainfall", 0))
        }
        
    # If no record was before cur_time, return the first one or default
    if sorted_records:
        rec = sorted_records[0]
        return {
            "air_temperature": rec.get("air_temperature", 26.5),
            "track_temperature": rec.get("track_temperature", 38.2),
            "humidity": rec.get("humidity", 54.0),
            "rainfall": int(rec.get("rainfall", 0))
        }
        
    return default_weather

def get_driver_current_lap_info(d_num: int, cur_time: datetime):
    laps = session_cache["laps_by_driver"].get(d_num, [])
    if not laps or not cur_time:
        return None, 1, None
    
    sorted_laps = sorted(laps, key=lambda x: x["lap_number"])
    current_lap_record = None
    for lp in sorted_laps:
        start_date = lp.get("parsed_date_start")
        if start_date and start_date <= cur_time:
            current_lap_record = lp
        else:
            break
            
    if current_lap_record:
        return current_lap_record, current_lap_record["lap_number"], current_lap_record.get("parsed_date_start")
    
    if sorted_laps:
        return sorted_laps[0], 1, sorted_laps[0].get("parsed_date_start")
        
    return None, 1, None

def get_track_default_lap_duration(track_name: str):
    name = track_name.lower() if track_name else ""
    if "monaco" in name:
        return 75.0
    elif "silverstone" in name:
        return 90.0
    elif "spa" in name:
        return 105.0
    elif "monza" in name:
        return 80.0
    return 75.0

def get_driver_lap_duration(d_num: int, lap_num: int, track_name: str):
    laps = session_cache["laps_by_driver"].get(d_num, [])
    # Find the most recent completed lap prior to lap_num
    for lp in sorted(laps, key=lambda x: x["lap_number"], reverse=True):
        if lp["lap_number"] < lap_num and lp.get("lap_duration"):
            return lp["lap_duration"]
            
    # Fallback to the first completed lap if we are on lap 1
    for lp in sorted(laps, key=lambda x: x["lap_number"]):
        if lp.get("lap_duration"):
            return lp["lap_duration"]
            
    return get_track_default_lap_duration(track_name)

def calculate_driver_progress(d_num: int, cur_time: datetime, track_name: str):
    # 1. Check if currently in a pit stop
    pit_stops = session_cache.get("pit_stops", [])
    for pit in pit_stops:
        if pit["driver_number"] == d_num:
            pit_date = pit.get("parsed_date")
            if pit_date:
                pit_dur = pit.get("pit_duration") or 22.0
                if pit_date <= cur_time <= pit_date + timedelta(seconds=pit_dur):
                    elapsed_pit = (cur_time - pit_date).total_seconds()
                    pit_fraction = elapsed_pit / pit_dur
                    
                    name = track_name.lower() if track_name else ""
                    if "silverstone" in name:
                        pit_entry, pit_box, pit_exit = 0.92, 0.96, 0.08
                    elif "monza" in name:
                        pit_entry, pit_box, pit_exit = 0.91, 0.95, 0.06
                    else:
                        pit_entry, pit_box, pit_exit = 0.90, 0.95, 0.05
                        
                    if pit_fraction <= 0.4:
                        t = pit_fraction / 0.4
                        prog = pit_entry + (pit_box - pit_entry) * t
                    elif pit_fraction <= 0.6:
                        prog = pit_box
                    else:
                        t = (pit_fraction - 0.6) / 0.4
                        dist = (1.0 - pit_box) + pit_exit
                        current_dist = dist * t
                        prog = (pit_box + current_dist) % 1.0
                    return prog, True, 80.0, pit_date.isoformat(), pit_dur

    # 2. Normal track progress
    lap_record, lap_num, lap_start = get_driver_current_lap_info(d_num, cur_time)
    if not lap_start:
        return 0.0, False, 80.0, None, 22.0
        
    elapsed = (cur_time - lap_start).total_seconds()
    
    # Resolve actual lap duration using start time of the next lap if available
    laps = session_cache["laps_by_driver"].get(d_num, [])
    next_lap = None
    for lp in laps:
        if lp["lap_number"] == lap_num + 1:
            next_lap = lp
            break
            
    actual_duration = None
    if next_lap:
        next_start = next_lap.get("parsed_date_start")
        if next_start:
            actual_duration = (next_start - lap_start).total_seconds()
            
    if not actual_duration or actual_duration <= 0:
        actual_duration = get_driver_lap_duration(d_num, lap_num, track_name)
        
    prog = elapsed / actual_duration
    prog = max(0.0, min(prog, 0.999))
    return prog, False, actual_duration, None, 22.0

def get_standings_for_lap(lap_num: int, cur_time=None):
    standings = []
    temp_list = []
    
    for idx, d in enumerate(session_cache["drivers"]):
        d_num = d["number"]
        acronym = d["code"]
        lap_list = session_cache["laps_by_driver"].get(d_num, [])
        
        # 1. Resolve current lap info
        if cur_time:
            lap_record, resolved_lap_num, lap_start = get_driver_current_lap_info(d_num, cur_time)
            lap_date = lap_start
            lap_duration = lap_record["lap_duration"] if lap_record else None
        else:
            lap_date = None
            lap_duration = None
            resolved_lap_num = lap_num
            for lp in lap_list:
                if lp["lap_number"] == lap_num:
                    lap_date = lp.get("parsed_date_start")
                    lap_duration = lp["lap_duration"]
                    break
            
        # 2. Find position record closest to the start of this lap
        pos_list = session_cache["positions_by_driver"].get(d_num, [])
        pos_val = idx + 1
        
        sorted_pos = sorted(pos_list, key=lambda x: x.get("parsed_date") or datetime.min) if pos_list else []
        if sorted_pos:
            pos_val = sorted_pos[0]["position"] # Default to starting grid position
            
        if cur_time and sorted_pos:
            for p in sorted_pos:
                p_date = p.get("parsed_date")
                if p_date and p_date <= cur_time:
                    pos_val = p["position"]
                else:
                    break
        elif lap_date and sorted_pos:
            for p in sorted_pos:
                p_date = p.get("parsed_date")
                if p_date and p_date <= lap_date:
                    pos_val = p["position"]
                else:
                    break
        elif sorted_pos:
            pos_val = sorted_pos[-1]["position"]
            
        # 3. Format last completed lap string
        last_lap_duration = None
        for lp in lap_list:
            if lp["lap_number"] == resolved_lap_num - 1:
                last_lap_duration = lp["lap_duration"]
                break
        if not last_lap_duration:
            for lp in sorted(lap_list, key=lambda x: x["lap_number"], reverse=True):
                if lp["lap_number"] < resolved_lap_num and lp.get("lap_duration"):
                    last_lap_duration = lp["lap_duration"]
                    break
                    
        lap_str = "N/A"
        if last_lap_duration:
            minutes = int(last_lap_duration // 60)
            seconds = last_lap_duration % 60
            lap_str = f"{minutes}:{seconds:06.3f}" if minutes > 0 else f"{seconds:05.3f}"
            
        # 4. Find best lap up to this lap
        best_duration = float("inf")
        for lp in lap_list:
            if lp["lap_number"] <= resolved_lap_num and lp.get("lap_duration"):
                if lp["lap_duration"] < best_duration:
                    best_duration = lp["lap_duration"]
        best_lap_str = "N/A"
        if best_duration != float("inf"):
            minutes = int(best_duration // 60)
            seconds = best_duration % 60
            best_lap_str = f"{minutes}:{seconds:06.3f}" if minutes > 0 else f"{seconds:05.3f}"
            
        # 5. Tyre stint info
        compound = "M"
        tyre_age = 8
        stint_list = session_cache["stints_by_driver"].get(d_num, [])
        found_stint = False
        for stint in stint_list:
            if stint["lap_start"] <= resolved_lap_num <= stint["lap_end"]:
                comp = stint["compound"] or "MEDIUM"
                compound = comp[0] if comp else "M"
                tyre_age = stint["tyre_age_at_start"] + (resolved_lap_num - stint["lap_start"])
                found_stint = True
                break
        if not found_stint and stint_list:
            comp = stint_list[-1]["compound"] or "MEDIUM"
            compound = comp[0] if comp else "M"
            tyre_age = stint_list[-1]["tyre_age_at_start"] + max(0, resolved_lap_num - stint_list[-1]["lap_start"])
            
        # 6. Check if currently in a pit stop
        is_pitting = False
        if cur_time:
            pit_stops = session_cache.get("pit_stops", [])
            for pit in pit_stops:
                if pit["driver_number"] == d_num:
                    pit_date = pit.get("parsed_date")
                    if pit_date:
                        pit_dur = pit.get("pit_duration") or 22.0
                        if pit_date <= cur_time <= pit_date + timedelta(seconds=pit_dur):
                            is_pitting = True
                            break
                            
        # Resolve track progress for dynamic realtime gap calculations
        prog = 0.0
        calculated_lap_duration = 75.0
        if cur_time:
            try:
                prog, _, calc_dur, _, _ = calculate_driver_progress(int(d_num), cur_time, session_cache["track_name"])
                if calc_dur:
                    calculated_lap_duration = calc_dur
            except Exception:
                prog = 0.0

        # Resolve retirement/DNS status
        d_status = "ACTIVE"
        session_type_upper = session_cache.get("session_type", "Race").upper()
        is_time_trial = "QUALIFYING" in session_type_upper or "PRACTICE" in session_type_upper
        
        if not lap_list:
            d_status = "DNS" if not is_time_trial else "ACTIVE"
        elif cur_time and not is_time_trial:
            max_lap_num = max(lp["lap_number"] for lp in lap_list) if lap_list else 0
            if max_lap_num > 0:
                last_lap_rec = next(lp for lp in lap_list if lp["lap_number"] == max_lap_num)
                last_lap_start = last_lap_rec.get("parsed_date_start")
                last_lap_dur = last_lap_rec.get("lap_duration") or 80.0
                
                if last_lap_start:
                    last_lap_end = last_lap_start + timedelta(seconds=last_lap_dur)
                    time_since_end = (cur_time - last_lap_end).total_seconds()
                    
                    # Determine if driver eventually DNFs in this session
                    max_laps_any = 1
                    for lps in session_cache["laps_by_driver"].values():
                        if lps:
                            m_lp = max(lp["lap_number"] for lp in lps)
                            if m_lp > max_laps_any:
                                max_laps_any = m_lp
                    
                    driver_max_laps = max_lap_num
                    
                    if driver_max_laps < max_laps_any:
                        if cur_time >= last_lap_end + timedelta(seconds=5):
                            d_status = "DNF"
                    else:
                        if max_lap_num < session_cache.get("total_laps", 66):
                            laps_behind = lap_num - max_lap_num
                            if laps_behind > 4 or time_since_end > 300.0:
                                d_status = "DNF"

        temp_list.append({
            "position": pos_val,
            "driver_id": acronym,
            "driver_name": d["name"],
            "team": d["team"],
            "last_lap": lap_str,
            "best_lap": best_lap_str,
            "best_duration": best_duration,
            "tyre": compound,
            "tyre_age": tyre_age,
            "lap_date": lap_date,
            "is_pitting": is_pitting,
            "lap_num": resolved_lap_num,
            "prog": prog,
            "lap_duration": calculated_lap_duration if calculated_lap_duration else (lap_duration or 75.0),
            "status": d_status
        })
        
    session_type_upper = session_cache.get("session_type", "Race").upper()
    is_time_trial = "QUALIFYING" in session_type_upper or "PRACTICE" in session_type_upper

    if is_time_trial:
        temp_list.sort(key=lambda x: x.get("best_duration", float("inf")))
    else:
        temp_list.sort(key=lambda x: x["position"])
    
    # Pre-calculate best sector times across all drivers up to cur_time
    best_s1_all = float("inf")
    best_s2_all = float("inf")
    best_s3_all = float("inf")
    
    driver_pbs = {}  # d_no -> (best_s1, best_s2, best_s3)
    
    for d in session_cache["drivers"]:
        d_no = d["number"]
        lps = session_cache["laps_by_driver"].get(d_no, [])
        d_best_s1 = float("inf")
        d_best_s2 = float("inf")
        d_best_s3 = float("inf")
        
        for lp in lps:
            lp_start = lp.get("parsed_date_start")
            lp_dur = lp.get("lap_duration")
            if lp_start and lp_dur and cur_time and lp_start + timedelta(seconds=lp_dur) <= cur_time:
                s1 = lp.get("duration_sector_1")
                s2 = lp.get("duration_sector_2")
                s3 = lp.get("duration_sector_3")
                
                if s1 and s1 > 0:
                    if s1 < best_s1_all:
                        best_s1_all = s1
                    if s1 < d_best_s1:
                        d_best_s1 = s1
                if s2 and s2 > 0:
                    if s2 < best_s2_all:
                        best_s2_all = s2
                    if s2 < d_best_s2:
                        d_best_s2 = s2
                if s3 and s3 > 0:
                    if s3 < best_s3_all:
                        best_s3_all = s3
                    if s3 < d_best_s3:
                        d_best_s3 = s3

        # Also check current active lap sectors if they have been crossed already
        curr_rec, _, curr_start = get_driver_current_lap_info(d_no, cur_time)
        if curr_rec and curr_start:
            curr_elapsed = (cur_time - curr_start).total_seconds()
            s1_curr = curr_rec.get("duration_sector_1")
            s2_curr = curr_rec.get("duration_sector_2")
            if s1_curr and s1_curr > 0 and curr_elapsed >= s1_curr:
                if s1_curr < best_s1_all:
                    best_s1_all = s1_curr
                if s1_curr < d_best_s1:
                    d_best_s1 = s1_curr
            if s1_curr and s2_curr and s1_curr > 0 and s2_curr > 0 and curr_elapsed >= s1_curr + s2_curr:
                if s2_curr < best_s2_all:
                    best_s2_all = s2_curr
                if s2_curr < d_best_s2:
                    d_best_s2 = s2_curr

        driver_pbs[d_no] = (d_best_s1, d_best_s2, d_best_s3)
    
    leader_item = temp_list[0] if temp_list else None
    
    for idx, item in enumerate(temp_list):
        gap = "LEADER"
        gap_seconds = 0.0
        interval = "0.000s"
        interval_seconds = 0.0
        
        assigned_pos = idx + 1 if is_time_trial else item["position"]
        
        driver_status = item.get("status", "ACTIVE")
        if driver_status in ["DNF", "DNS"]:
            gap = driver_status
            interval = driver_status
            gap_seconds = 9999.0
            interval_seconds = 9999.0
        else:
            if is_time_trial:
                curr_best = item.get("best_duration", float("inf"))
                leader_best = leader_item.get("best_duration", float("inf")) if leader_item else float("inf")
                
                if curr_best == float("inf"):
                    gap = "N/A"
                    interval = "N/A"
                else:
                    if idx == 0:
                        gap = "FASTEST"
                        interval = "FASTEST"
                    else:
                        if leader_best != float("inf"):
                            diff = curr_best - leader_best
                            gap = f"+{diff:.3f}s"
                            gap_seconds = diff
                        
                        prev_best = float("inf")
                        for p_idx in range(idx - 1, -1, -1):
                            p_b = temp_list[p_idx].get("best_duration", float("inf"))
                            if p_b != float("inf"):
                                prev_best = p_b
                                break
                        if prev_best != float("inf"):
                            diff_int = curr_best - prev_best
                            interval = f"+{diff_int:.3f}s"
                            interval_seconds = diff_int
            else:
                if idx > 0 and leader_item:
                    leader_total = leader_item["lap_num"] + leader_item["prog"]
                    item_total = item["lap_num"] + item["prog"]
                    lap_diff = leader_total - item_total
                    
                    if lap_diff >= 0.9:
                        laps_behind = int(round(lap_diff))
                        gap = f"+{laps_behind} LAP" if laps_behind == 1 else f"+{laps_behind} LAPS"
                        gap_seconds = laps_behind * 80.0
                    else:
                        leader_lap_dur = leader_item.get("lap_duration") or 75.0
                        diff_seconds = lap_diff * leader_lap_dur
                        if diff_seconds > 0.0:
                            gap = f"+{diff_seconds:.3f}s"
                            gap_seconds = diff_seconds
                        else:
                            gap = "0.000s"
                            gap_seconds = 0.0
                
                if idx == 0:
                    interval = "LEADER"
                else:
                    prev_item = temp_list[idx - 1]
                    prev_total = prev_item["lap_num"] + prev_item["prog"]
                    item_total = item["lap_num"] + item["prog"]
                    int_diff = prev_total - item_total
                    
                    if int_diff >= 0.9:
                        laps_behind = int(round(int_diff))
                        interval = f"+{laps_behind} LAP" if laps_behind == 1 else f"+{laps_behind} LAPS"
                        interval_seconds = laps_behind * 80.0
                    else:
                        prev_lap_dur = prev_item.get("lap_duration") or 75.0
                        diff_seconds = int_diff * prev_lap_dur
                        if diff_seconds > 0.0:
                            interval = f"+{diff_seconds:.3f}s"
                            interval_seconds = diff_seconds
                        else:
                            interval = "0.000s"
                            interval_seconds = 0.0
            
        s1_str = "N/A"
        s1_color = "GRAY"
        s2_str = "N/A"
        s2_color = "GRAY"
        s3_str = "N/A"
        s3_color = "GRAY"
        
        d_num = next((d["number"] for d in session_cache["drivers"] if d["code"] == item["driver_id"]), None)
        if d_num:
            lap_list = session_cache["laps_by_driver"].get(d_num, [])
            last_lap_record = None
            for lp in lap_list:
                if lp["lap_number"] == item["lap_num"] - 1:
                    last_lap_record = lp
                    break
            if not last_lap_record:
                for lp in sorted(lap_list, key=lambda x: x["lap_number"], reverse=True):
                    if lp["lap_number"] < item["lap_num"] and lp.get("lap_duration"):
                        last_lap_record = lp
                        break
                        
            current_lap_record = None
            elapsed = 0.0
            if cur_time:
                current_lap_record, _, lap_start = get_driver_current_lap_info(d_num, cur_time)
                if lap_start:
                    elapsed = (cur_time - lap_start).total_seconds()

            is_flying_lap = False
            if current_lap_record and not item["is_pitting"]:
                if not current_lap_record.get("is_pit_out_lap", False):
                    is_flying_lap = True

            d_pb_s1, d_pb_s2, d_pb_s3 = driver_pbs.get(d_num, (float("inf"), float("inf"), float("inf")))
            
            def get_sec_color(val, d_pb, s_pb):
                if not val or val <= 0:
                    return "GRAY"
                if val <= s_pb + 0.0005:
                    return "PURPLE"
                if val <= d_pb + 0.0005:
                    return "GREEN"
                return "YELLOW"

            if is_flying_lap and current_lap_record:
                s1_val = current_lap_record.get("duration_sector_1")
                s2_val = current_lap_record.get("duration_sector_2")
                s3_val = current_lap_record.get("duration_sector_3")

                if s1_val and s1_val > 0:
                    if elapsed >= s1_val:
                        s1_str = f"{s1_val:.2f}s"
                        s1_color = get_sec_color(s1_val, d_pb_s1, best_s1_all)
                    else:
                        s1_str = ""
                        s1_color = "GRAY"
                else:
                    if last_lap_record and last_lap_record.get("duration_sector_1"):
                        s1_str = f"{last_lap_record['duration_sector_1']:.2f}s"
                        s1_color = get_sec_color(last_lap_record['duration_sector_1'], d_pb_s1, best_s1_all)

                if s1_val and s2_val and s1_val > 0 and s2_val > 0:
                    if elapsed >= s1_val + s2_val:
                        s2_str = f"{s2_val:.2f}s"
                        s2_color = get_sec_color(s2_val, d_pb_s2, best_s2_all)
                    else:
                        s2_str = ""
                        s2_color = "GRAY"
                else:
                    if last_lap_record and last_lap_record.get("duration_sector_2"):
                        s2_str = f"{last_lap_record['duration_sector_2']:.2f}s"
                        s2_color = get_sec_color(last_lap_record['duration_sector_2'], d_pb_s2, best_s2_all)

                if elapsed <= 10.0 and last_lap_record and last_lap_record.get("duration_sector_3"):
                    s3_val_last = last_lap_record["duration_sector_3"]
                    if s3_val_last and s3_val_last > 0:
                        s3_str = f"{s3_val_last:.2f}s"
                        s3_color = get_sec_color(s3_val_last, d_pb_s3, best_s3_all)
                else:
                    s3_str = ""
                    s3_color = "GRAY"
            else:
                if last_lap_record:
                    s1 = last_lap_record.get("duration_sector_1")
                    s2 = last_lap_record.get("duration_sector_2")
                    s3 = last_lap_record.get("duration_sector_3")
                    
                    if s1 and s1 > 0:
                        s1_str = f"{s1:.2f}s"
                        s1_color = get_sec_color(s1, d_pb_s1, best_s1_all)
                    if s2 and s2 > 0:
                        s2_str = f"{s2:.2f}s"
                        s2_color = get_sec_color(s2, d_pb_s2, best_s2_all)
                    if s3 and s3 > 0:
                        s3_str = f"{s3:.2f}s"
                        s3_color = get_sec_color(s3, d_pb_s3, best_s3_all)

        standings.append({
            "position": assigned_pos,
            "driver_id": item["driver_id"],
            "driver_name": item["driver_name"],
            "team": item["team"],
            "gap": gap,
            "interval": interval,
            "last_lap": item["last_lap"],
            "best_lap": item["best_lap"],
            "tyre": item["tyre"],
            "tyre_age": item["tyre_age"],
            "track_progress": 0.0,
            "drs_active": False,
            "delta": interval_seconds,
            "gap_seconds": gap_seconds,
            "is_pitting": item["is_pitting"],
            "lap_start_time": item["lap_date"].isoformat() if item["lap_date"] else None,
            "lap_num": item["lap_num"],
            "lap_duration": 80.0,
            "pit_start_time": None,
            "pit_duration": 22.0,
            "s1": s1_str,
            "s1_color": s1_color,
            "s2": s2_str,
            "s2_color": s2_color,
            "s3": s3_str,
            "s3_color": s3_color
        })
        
    return standings

def recalculate_gaps_and_intervals(standings, is_time_trial=False):
    if not standings:
        return
    
    leader_item = standings[0]
    for idx, item in enumerate(standings):
        # Check if retired/DNS from gap value or status
        is_retired = item.get("gap") in ["DNF", "DNS", "DNQ"] or item.get("status") in ["DNF", "DNS"]
        if is_retired:
            status_val = "DNF" if (item.get("gap") == "DNF" or item.get("status") == "DNF") else "DNS"
            item["gap"] = status_val
            item["interval"] = status_val
            item["gap_seconds"] = 9999.0
            item["delta"] = 9999.0
            continue
            
        if is_time_trial:
            curr_best = item.get("best_duration", float("inf"))
            leader_best = leader_item.get("best_duration", float("inf"))
            
            if curr_best == float("inf"):
                item["gap"] = "N/A"
                item["interval"] = "N/A"
                item["gap_seconds"] = 9999.0
                item["delta"] = 9999.0
            else:
                if idx == 0:
                    item["gap"] = "FASTEST"
                    item["interval"] = "FASTEST"
                    item["gap_seconds"] = 0.0
                    item["delta"] = 0.0
                else:
                    if leader_best != float("inf"):
                        diff = curr_best - leader_best
                        item["gap"] = f"+{diff:.3f}s"
                        item["gap_seconds"] = diff
                    else:
                        item["gap"] = "N/A"
                        item["gap_seconds"] = 9999.0
                    
                    prev_best = float("inf")
                    for p_idx in range(idx - 1, -1, -1):
                        p_item = standings[p_idx]
                        p_is_retired = p_item.get("gap") in ["DNF", "DNS", "DNQ"] or p_item.get("status") in ["DNF", "DNS"]
                        if not p_is_retired:
                            p_b = p_item.get("best_duration", float("inf"))
                            if p_b != float("inf"):
                                prev_best = p_b
                                break
                    if prev_best != float("inf"):
                        diff_int = curr_best - prev_best
                        item["interval"] = f"+{diff_int:.3f}s"
                        item["delta"] = diff_int
                    else:
                        item["interval"] = "N/A"
                        item["delta"] = 9999.0
        else:
            if idx == 0:
                item["gap"] = "LEADER"
                item["interval"] = "LEADER"
                item["gap_seconds"] = 0.0
                item["delta"] = 0.0
            else:
                # Gap to leader
                leader_lap = leader_item.get("lap_num") or 1
                leader_prog = leader_item.get("track_progress") or 0.0
                leader_total = leader_lap + leader_prog
                
                item_lap = item.get("lap_num") or 1
                item_prog = item.get("track_progress") or 0.0
                item_total = item_lap + item_prog
                
                lap_diff = leader_total - item_total
                
                if lap_diff >= 0.9:
                    laps_behind = int(round(lap_diff))
                    item["gap"] = f"+{laps_behind} LAP" if laps_behind == 1 else f"+{laps_behind} LAPS"
                    item["gap_seconds"] = laps_behind * 80.0
                else:
                    leader_lap_dur = leader_item.get("lap_duration") or 75.0
                    diff_seconds = lap_diff * leader_lap_dur
                    if diff_seconds > 0.0:
                        item["gap"] = f"+{diff_seconds:.3f}s"
                        item["gap_seconds"] = diff_seconds
                    else:
                        item["gap"] = "0.000s"
                        item["gap_seconds"] = 0.0
                
                # Interval to car ahead
                prev_item = None
                for p_idx in range(idx - 1, -1, -1):
                    p_item = standings[p_idx]
                    p_is_retired = p_item.get("gap") in ["DNF", "DNS", "DNQ"] or p_item.get("status") in ["DNF", "DNS"]
                    if not p_is_retired:
                        prev_item = p_item
                        break
                
                if not prev_item:
                    item["interval"] = "LEADER"
                    item["delta"] = 0.0
                else:
                    prev_lap = prev_item.get("lap_num") or 1
                    prev_prog = prev_item.get("track_progress") or 0.0
                    prev_total = prev_lap + prev_prog
                    
                    int_diff = prev_total - item_total
                    
                    if int_diff >= 0.9:
                        laps_behind = int(round(int_diff))
                        item["interval"] = f"+{laps_behind} LAP" if laps_behind == 1 else f"+{laps_behind} LAPS"
                        item["delta"] = laps_behind * 80.0
                    else:
                        prev_lap_dur = prev_item.get("lap_duration") or 75.0
                        diff_seconds = int_diff * prev_lap_dur
                        if diff_seconds > 0.0:
                            item["interval"] = f"+{diff_seconds:.3f}s"
                            item["delta"] = diff_seconds
                        else:
                            item["interval"] = "0.000s"
                            item["delta"] = 0.0

async def run_central_simulation_loop():
    global current_lap, current_session_time, track_status, replay_status
    import time
    last_tick_time = time.time()
    tick = 0
    while True:
        try:
            now = time.time()
            dt = now - last_tick_time
            last_tick_time = now
            
            # Skip if session data is not loaded yet
            if not session_cache.get("drivers"):
                await asyncio.sleep(0.1)
                continue
                
            # Advance virtual session time if playing
            if replay_status == "playing" and current_session_time:
                end_time = get_session_end_time()
                if end_time and current_session_time >= end_time:
                    current_session_time = end_time
                    replay_status = "paused"
                    await broadcast_replay_status()
                else:
                    next_time = current_session_time + timedelta(seconds=dt * replay_speed)
                    if end_time and next_time >= end_time:
                        current_session_time = end_time
                        replay_status = "paused"
                        await broadcast_replay_status()
                    else:
                        current_session_time = next_time
                
                # Resolve current_lap based on current_session_time
                standings = get_standings_for_lap(current_lap, current_session_time)
                if standings:
                    leader_id = standings[0]["driver_id"]
                    leader_num = None
                    for d in session_cache["drivers"]:
                        if d["code"] == leader_id:
                            leader_num = d["number"]
                            break
                    if leader_num:
                        leader_laps = session_cache["laps_by_driver"].get(leader_num, [])
                        resolved_lap = 1
                        for lp in sorted(leader_laps, key=lambda x: x["lap_number"]):
                            lp_date = lp.get("parsed_date_start")
                            if lp_date and lp_date <= current_session_time:
                                resolved_lap = lp["lap_number"]
                            else:
                                break
                        current_lap = resolved_lap
            else:
                standings = get_standings_for_lap(current_lap, current_session_time)
                
            if not standings:
                await asyncio.sleep(0.1)
                continue
                
            # Map progress and active aerodynamics (DRS) for all drivers
            for item in standings:
                d_num = None
                for d in session_cache["drivers"]:
                    if d["code"] == item["driver_id"]:
                        d_num = d["number"]
                        break
                
                is_retired = item.get("gap") in ["DNF", "DNS", "DNQ"] or item.get("status") in ["DNF", "DNS"]
                if is_retired:
                    state = driver_telemetry_state.get(item["driver_id"])
                    if state and "last_progress" in state:
                        prog = state["last_progress"]
                    else:
                        try:
                            num_val = int(d_num) if d_num else 0
                        except ValueError:
                            num_val = 0
                        prog = 0.90 + (num_val % 17) * 0.005 if (item.get("gap") == "DNF" or item.get("status") == "DNF") else 0.0
                    is_pitting = False
                    lap_dur = 80.0
                    pit_start = None
                    pit_dur = 22.0
                    drs_active = False
                else:
                    if d_num:
                        prog, is_pitting, lap_dur, pit_start, pit_dur = calculate_driver_progress(d_num, current_session_time, session_cache["track_name"])
                    else:
                        prog, is_pitting, lap_dur, pit_start, pit_dur = 0.0, False, 80.0, None, 22.0
                    
                    # Store last progress
                    state = driver_telemetry_state.get(item["driver_id"])
                    if not state:
                        state = {
                            "prev_speed": 0.0,
                            "current_gear": 1,
                            "battery": 80.0
                        }
                        driver_telemetry_state[item["driver_id"]] = state
                    state["last_progress"] = prog
                    
                    # Check DRS zone
                    track_location = session_cache["track_name"].lower()
                    drs_active = False
                    if not is_pitting:
                        if "monza" in track_location:
                            drs_active = (prog >= 0.82 or prog <= 0.18) or (prog >= 0.50 and prog <= 0.65)
                        elif "silverstone" in track_location:
                            drs_active = (prog >= 0.22 and prog <= 0.38) or (prog >= 0.70 and prog <= 0.88)
                        elif "spa" in track_location:
                            drs_active = (prog >= 0.42 and prog <= 0.60) or (prog >= 0.90 or prog <= 0.12)
                        elif "barcelona" in track_location:
                            drs_active = (prog >= 0.88 or prog <= 0.12) or (prog >= 0.40 and prog <= 0.55)
                        else:
                            drs_active = (prog >= 0.85 or prog <= 0.15)
                
                item["track_progress"] = prog
                item["drs_active"] = drs_active
                item["is_pitting"] = is_pitting
                item["lap_duration"] = lap_dur
                item["pit_start_time"] = pit_start
                item["pit_duration"] = pit_dur

            # Sort standings by actual distance covered (lap number + track progress) descending
            standings.sort(key=lambda x: (x.get("lap_num") or 1) + (x.get("track_progress") or 0.0), reverse=True)
            
            # Re-assign positions
            for idx, item in enumerate(standings):
                item["position"] = idx + 1

            session_type_upper = session_cache.get("session_type", "Race").upper()
            is_time_trial = "QUALIFYING" in session_type_upper or "PRACTICE" in session_type_upper
            recalculate_gaps_and_intervals(standings, is_time_trial)

            if replay_status == "playing":
                track_status = get_track_status_at_time(current_session_time)

            if active_connections:
                # 1. Telemetry curves for all drivers on every tick (0.1s)
                telemetry_all_packet = {
                    "type": "telemetry_all",
                    "data": {}
                }
                for idx, item in enumerate(standings):
                    d_id = item["driver_id"]
                    prog = item["track_progress"]
                    is_pitting = item["is_pitting"]
                    drs_active = item["drs_active"]
                    
                    is_retired = item.get("gap") in ["DNF", "DNS", "DNQ"] or item.get("status") in ["DNF", "DNS"]
                    
                    if is_retired:
                        speed = 0.0
                    elif is_pitting:
                        speed = 0.0
                    else:
                        speed = get_interpolated_speed(session_cache["track_name"], prog, drs_active)
                        
                    # Get persistent state
                    state = driver_telemetry_state.get(d_id)
                    if not state:
                        state = {
                            "prev_speed": speed,
                            "current_gear": 0 if is_retired else 1,
                            "battery": 80.0
                        }
                        driver_telemetry_state[d_id] = state
                        
                    prev_speed = state["prev_speed"]
                    current_gear = state["current_gear"]
                    bat = state["battery"]
                    
                    if is_retired:
                        throttle = 0.0
                        brake = 0.0
                        current_gear = 0
                        rpm = 0
                        state["prev_speed"] = 0.0
                        state["current_gear"] = 0
                    else:
                        # Calculate acceleration (km/h change per 0.1s tick)
                        accel = speed - prev_speed
                        state["prev_speed"] = speed
                        
                        # Determine Throttle and Brake
                        if is_pitting:
                            throttle = 0.0
                            brake = 1.0
                        else:
                            if accel > 0.5:
                                throttle = min(1.0, 0.3 + (accel / 5.0))
                                brake = 0.0
                            elif accel < -0.5:
                                throttle = 0.0
                                brake = min(1.0, 0.2 + (abs(accel) / 10.0))
                            else:
                                # Add tiny speed noise to throttle to make graphs look natural
                                throttle = max(0.1, min(0.6, 0.25 + (tick % 3) * 0.02))
                                brake = 0.0
                                
                        # Gear Shifting logic (limit shift rate to at most 1 gear per 0.1s tick)
                        if speed < 10.0:
                            target_gear = 1
                        elif speed < 80.0:
                            target_gear = 1
                        elif speed < 110.0:
                            target_gear = 2
                        elif speed < 140.0:
                            target_gear = 3
                        elif speed < 170.0:
                            target_gear = 4
                        elif speed < 200.0:
                            target_gear = 5
                        elif speed < 240.0:
                            target_gear = 6
                        elif speed < 280.0:
                            target_gear = 7
                        else:
                            target_gear = 8
                            
                        if target_gear > current_gear:
                            current_gear += 1
                        elif target_gear < current_gear:
                            current_gear -= 1
                        state["current_gear"] = current_gear
                        
                        # RPM calculation (sweeping realistically with gear range fraction)
                        max_speed_in_gear = [0, 80, 110, 140, 170, 200, 240, 280, 360]
                        if speed < 10.0:
                            rpm = 4200
                            if is_pitting:
                                current_gear = 0
                                state["current_gear"] = 0
                        else:
                            g = max(1, min(8, current_gear))
                            prev_gear_max = max_speed_in_gear[g-1]
                            cur_gear_max = max_speed_in_gear[g]
                            
                            fraction = (speed - prev_gear_max) / (cur_gear_max - prev_gear_max)
                            fraction = max(0.0, min(1.0, fraction))
                            rpm = int(8500 + fraction * 6300 + (tick % 4) * 25)
                            
                        # ERS battery usage
                        if replay_status == "playing":
                            if is_pitting or speed < 5.0:
                                # ERS is inactive when pitting or stationary
                                pass
                            elif brake > 0.1:
                                # Kinetic harvesting scales with brake force
                                bat += 0.8 * brake * replay_speed
                            elif throttle > 0.1:
                                # ERS deployment scales with throttle
                                bat -= 0.35 * throttle * replay_speed
                            else:
                                # Minor charge/neutral state from engine/MGU-H recovery when coasting
                                bat += 0.02 * replay_speed
                            bat = max(0.0, min(100.0, bat))
                            state["battery"] = bat

                    telemetry_all_packet["data"][d_id] = {
                        "timestamp": datetime.now().isoformat(),
                        "driver_id": d_id,
                        "speed": round(speed, 1),
                        "rpm": rpm,
                        "throttle": round(throttle, 2),
                        "brake": round(brake, 2),
                        "gear": current_gear,
                        "tyre_age": item["tyre_age"],
                        "last_lap": item["last_lap"],
                        "battery": round(bat, 1),
                        "track_progress": round(prog, 5),
                        "is_pitting": is_pitting,
                        "laps": item["lap_num"]
                    }
                    
                msg_str = json.dumps(telemetry_all_packet)
                for ws in list(active_connections):
                    try:
                        await ws.send_text(msg_str)
                    except Exception:
                        pass

                # 2. Send standings table and virtual session time (every tick / 100ms)
                positions_packet = {
                    "type": "positions",
                    "data": [
                        {
                            "position": item["position"],
                            "driver_id": item["driver_id"],
                            "driver_name": item["driver_name"],
                            "team": item["team"],
                            "gap": item["gap"],
                            "interval": item["interval"],
                            "last_lap": item["last_lap"],
                            "best_lap": item["best_lap"],
                            "tyre": item["tyre"],
                            "tyre_age": item["tyre_age"],
                            "laps": item["lap_num"],
                            "track_progress": item["track_progress"],
                            "drs_active": item["drs_active"],
                            "delta": item["delta"],
                            "is_pitting": item["is_pitting"],
                            "lap_start_time": item["lap_start_time"],
                            "lap_duration": item["lap_duration"],
                            "pit_start_time": item["pit_start_time"],
                            "pit_duration": item["pit_duration"],
                            "s1": item["s1"],
                            "s1_color": item["s1_color"],
                            "s2": item["s2"],
                            "s2_color": item["s2_color"],
                            "s3": item["s3"],
                            "s3_color": item["s3_color"]
                        }
                        for item in standings
                    ],
                    "current_session_time": current_session_time.isoformat() if current_session_time else None,
                    "weather": get_weather_at_time(current_session_time)
                }
                msg_str = json.dumps(positions_packet)
                for ws in list(active_connections):
                    try:
                        await ws.send_text(msg_str)
                    except Exception:
                        pass
                            
                # 3. Send replay details (every 5 seconds / 50 ticks)
                if tick % 50 == 0:
                    replay_packet = {
                        "type": "replay",
                        "data": {
                            "status": replay_status,
                            "speed": replay_speed,
                            "current_lap": current_lap,
                            "total_laps": session_cache["total_laps"],
                            "track_status": track_status
                        }
                    }
                    msg_str = json.dumps(replay_packet)
                    for ws in list(active_connections):
                        try:
                            await ws.send_text(msg_str)
                        except Exception:
                            pass
                            
                # 4. Send live AI Strategist insights and sector events (only when playing)
                if replay_status == "playing" and tick % 100 == 0:
                    d_id = standings[tick % len(standings)]["driver_id"] if standings else "VER"
                    is_pit_event = standings[tick % len(standings)]["is_pitting"] if standings else False
                    
                    msg = f"AI Strategist: Monitor tyre degradation on {d_id}. Pace delta stable."
                    if is_pit_event:
                        msg = f"AI Strategist: {d_id} currently in pit lane. Executing pit stop."
                        
                    insight_packet = {
                        "type": "insight",
                        "data": {
                            "message": msg,
                            "severity": "medium" if is_pit_event else "low"
                        }
                    }
                    event_packet = {
                        "type": "event",
                        "data": {
                            "type": "PIT_ENTRY" if is_pit_event else "INFO",
                            "message": f"{d_id} in the pits." if is_pit_event else f"{d_id} completing Lap {current_lap}."
                        }
                    }
                    for ws in list(active_connections):
                        try:
                            await ws.send_text(json.dumps(insight_packet))
                            await ws.send_text(json.dumps(event_packet))
                        except Exception:
                            pass

            tick += 1
            await asyncio.sleep(0.1)
        except Exception as e:
            logger.error(f"Error in central simulation loop: {e}")
            await asyncio.sleep(1.0)

def is_session_live(session_key) -> bool:
    # Spielberg GP 2026 sessions key list
    AUSTRIAN_GP_2026_KEYS = {11308, 11309, 11310, 11311, 11315}
    try:
        s_key = int(session_key)
        return s_key in AUSTRIAN_GP_2026_KEYS
    except (ValueError, TypeError):
        return False

def generate_mock_live_data(new_cache):
    logger.info("Generating simulated telemetry for Austrian GP (pre-session fallback)...")
    import random
    from datetime import datetime, timedelta
    
    drivers = new_cache.get("drivers", [])
    if not drivers:
        drivers = [
            {"id": "VER", "name": "M. Verstappen", "team": "Red Bull Racing", "number": 3, "code": "VER", "color": "FF4781D7"},
            {"id": "NOR", "name": "L. Norris", "team": "McLaren", "number": 1, "code": "NOR", "color": "FFF47600"},
            {"id": "LEC", "name": "C. Leclerc", "team": "Ferrari", "number": 16, "code": "LEC", "color": "FFE10600"},
            {"id": "HAM", "name": "L. Hamilton", "team": "Mercedes AMG", "number": 44, "code": "HAM", "color": "FF27F4D2"},
            {"id": "PIA", "name": "O. Piastri", "team": "McLaren", "number": 81, "code": "PIA", "color": "FFF47600"},
            {"id": "RUS", "name": "G. Russell", "team": "Mercedes AMG", "number": 63, "code": "RUS", "color": "FF27F4D2"},
            {"id": "SAI", "name": "C. Sainz", "team": "Ferrari", "number": 55, "code": "SAI", "color": "FFE10600"},
            {"id": "PER", "name": "S. Perez", "team": "Red Bull Racing", "number": 11, "code": "PER", "color": "FF4781D7"},
            {"id": "ALO", "name": "F. Alonso", "team": "Aston Martin", "number": 14, "code": "ALO", "color": "FF229971"},
            {"id": "ALB", "name": "A. Albon", "team": "Williams", "number": 23, "code": "ALB", "color": "FF37BEDD"}
        ]
        new_cache["drivers"] = drivers

    session_start = datetime.now() - timedelta(minutes=15)
    new_cache["total_laps"] = 71
    
    # Red Bull Ring base lap time is ~68.0s
    base_lap_duration = 68.0
    
    for idx, d in enumerate(drivers):
        d_num = d["number"]
        new_cache["laps_by_driver"][d_num] = []
        new_cache["positions_by_driver"][d_num] = []
        
        # tyre stints
        new_cache["stints_by_driver"][d_num] = [
            {"stint_number": 1, "driver_number": d_num, "lap_start": 1, "lap_end": 35, "compound": "MEDIUM", "tyre_age_at_start": 0},
            {"stint_number": 2, "driver_number": d_num, "lap_start": 36, "lap_end": 71, "compound": "HARD", "tyre_age_at_start": 0}
        ]
        
        lap_start = session_start + timedelta(seconds=idx * 2)
        for lap_no in range(1, 72):
            lap_dur = base_lap_duration + random.uniform(0.1, 1.2) + (idx * 0.08)
            s1 = lap_dur * 0.32
            s2 = lap_dur * 0.41
            s3 = lap_dur * 0.27
            
            lap_rec = {
                "meeting_key": 1288,
                "session_key": new_cache["session_key"],
                "driver_number": d_num,
                "lap_number": lap_no,
                "date_start": lap_start.isoformat(),
                "parsed_date_start": lap_start,
                "lap_duration": lap_dur,
                "duration_sector_1": s1,
                "duration_sector_2": s2,
                "duration_sector_3": s3,
                "is_pit_out_lap": lap_no == 1 or lap_no == 36
            }
            new_cache["laps_by_driver"][d_num].append(lap_rec)
            
            pos_rec = {
                "date": lap_start.isoformat(),
                "parsed_date": lap_start,
                "session_key": new_cache["session_key"],
                "driver_number": d_num,
                "position": idx + 1,
                "meeting_key": 1288
            }
            new_cache["positions_by_driver"][d_num].append(pos_rec)
            lap_start += timedelta(seconds=lap_dur)
            
    new_cache["weather"] = []
    weather_start = session_start
    for i in range(100):
        new_cache["weather"].append({
            "date": weather_start.isoformat(),
            "parsed_date": weather_start,
            "session_key": new_cache["session_key"],
            "meeting_key": 1288,
            "air_temperature": 23.5 + random.uniform(-0.4, 0.4),
            "track_temperature": 35.8 + random.uniform(-0.8, 0.8),
            "humidity": 48.0 + random.uniform(-1.5, 1.5),
            "rainfall": 0
        })
        weather_start += timedelta(minutes=1)
    
    logger.info("Generated simulated telemetry successfully.")

async def poll_live_openf1_data_loop():
    global session_cache, last_lap_timestamp, last_position_timestamp, last_pit_timestamp
    global last_race_control_timestamp, last_weather_timestamp, current_session_time, track_status
    global is_using_mock_data
    
    logger.info("Initializing live OpenF1 polling loop...")
    async with httpx.AsyncClient() as client:
        while True:
            try:
                session_key = session_cache.get("session_key")
                if not session_key or not is_session_live(session_key):
                    await asyncio.sleep(5.0)
                    continue
                
                # Check weather
                try:
                    url = f"{OPENF1_BASE_URL}/weather?session_key={session_key}"
                    if last_weather_timestamp:
                        url += f"&date>{last_weather_timestamp}"
                    r = await client.get(url, timeout=5.0)
                    if r.status_code == 200 and r.json():
                        new_weather = r.json()
                        # If we were using mock data, discard it on arrival of real data
                        if is_using_mock_data:
                            logger.info("Real weather data detected! Clearing simulation fallbacks.")
                            session_cache["weather"] = []
                            is_using_mock_data = False
                        
                        for w in new_weather:
                            w["parsed_date"] = parse_date(w.get("date"))
                            session_cache["weather"].append(w)
                        last_weather_timestamp = max(w.get("date") for w in new_weather)
                        logger.info(f"Polled {len(new_weather)} new weather records.")
                except Exception as e:
                    logger.error(f"Error polling weather: {e}")

                # Check race control
                try:
                    url = f"{OPENF1_BASE_URL}/race_control?session_key={session_key}"
                    if last_race_control_timestamp:
                        url += f"&date>{last_race_control_timestamp}"
                    r = await client.get(url, timeout=5.0)
                    if r.status_code == 200 and r.json():
                        new_rc = r.json()
                        if is_using_mock_data:
                            session_cache["race_control"] = []
                            is_using_mock_data = False
                        for event in new_rc:
                            event["parsed_date"] = parse_date(event.get("date"))
                            session_cache["race_control"].append(event)
                        last_race_control_timestamp = max(event.get("date") for event in new_rc)
                        logger.info(f"Polled {len(new_rc)} new race control events.")
                except Exception as e:
                    logger.error(f"Error polling race control: {e}")

                # Check stints (always fetch full stints, merge)
                try:
                    url = f"{OPENF1_BASE_URL}/stints?session_key={session_key}"
                    r = await client.get(url, timeout=5.0)
                    if r.status_code == 200 and r.json():
                        new_stints = r.json()
                        new_stints_by_driver = {}
                        for stint in new_stints:
                            d_num = stint["driver_number"]
                            if d_num not in new_stints_by_driver:
                                new_stints_by_driver[d_num] = []
                            new_stints_by_driver[d_num].append(stint)
                        session_cache["stints_by_driver"] = new_stints_by_driver
                except Exception as e:
                    logger.error(f"Error polling stints: {e}")

                # Check pit stops
                try:
                    url = f"{OPENF1_BASE_URL}/pit?session_key={session_key}"
                    if last_pit_timestamp:
                        url += f"&date>{last_pit_timestamp}"
                    r = await client.get(url, timeout=5.0)
                    if r.status_code == 200 and r.json():
                        new_pits = r.json()
                        if is_using_mock_data:
                            session_cache["pit_stops"] = []
                            is_using_mock_data = False
                        for p in new_pits:
                            p["parsed_date"] = parse_date(p.get("date"))
                            session_cache["pit_stops"].append(p)
                        last_pit_timestamp = max(p.get("date") for p in new_pits)
                        logger.info(f"Polled {len(new_pits)} new pit stops.")
                except Exception as e:
                    logger.error(f"Error polling pits: {e}")

                # Check position telemetry
                try:
                    url = f"{OPENF1_BASE_URL}/position?session_key={session_key}"
                    if last_position_timestamp:
                        url += f"&date>{last_position_timestamp}"
                    r = await client.get(url, timeout=5.0)
                    if r.status_code == 200 and r.json():
                        new_pos = r.json()
                        if is_using_mock_data:
                            logger.info("Real live position telemetry detected! Switching to Live Feed.")
                            session_cache["positions_by_driver"] = {}
                            session_cache["laps_by_driver"] = {}
                            is_using_mock_data = False
                            
                        for pos in new_pos:
                            pos["parsed_date"] = parse_date(pos.get("date"))
                            d_num = pos["driver_number"]
                            if d_num not in session_cache["positions_by_driver"]:
                                session_cache["positions_by_driver"][d_num] = []
                            if not any(p["parsed_date"] == pos["parsed_date"] for p in session_cache["positions_by_driver"][d_num]):
                                session_cache["positions_by_driver"][d_num].append(pos)
                        last_position_timestamp = max(pos.get("date") for pos in new_pos)
                        logger.info(f"Polled {len(new_pos)} new positions.")
                        
                        if last_position_timestamp:
                            latest_dt = parse_date(last_position_timestamp)
                            if latest_dt:
                                current_session_time = latest_dt
                except Exception as e:
                    logger.error(f"Error polling positions: {e}")

                # Check laps
                try:
                    url = f"{OPENF1_BASE_URL}/laps?session_key={session_key}"
                    if last_lap_timestamp:
                        url += f"&date_start>{last_lap_timestamp}"
                    r = await client.get(url, timeout=5.0)
                    if r.status_code == 200 and r.json():
                        new_laps = r.json()
                        max_lap = session_cache.get("total_laps", 71)
                        for lap in new_laps:
                            lap["parsed_date_start"] = parse_date(lap.get("date_start"))
                            d_num = lap["driver_number"]
                            if d_num not in session_cache["laps_by_driver"]:
                                session_cache["laps_by_driver"][d_num] = []
                            if not any(l["lap_number"] == lap["lap_number"] for l in session_cache["laps_by_driver"][d_num]):
                                session_cache["laps_by_driver"][d_num].append(lap)
                            if lap["lap_number"] > max_lap:
                                max_lap = lap["lap_number"]
                        session_cache["total_laps"] = max_lap
                        last_lap_timestamp = max(lap.get("date_start") for lap in new_laps)
                        logger.info(f"Polled {len(new_laps)} new laps.")
                except Exception as e:
                    logger.error(f"Error polling laps: {e}")

            except Exception as e:
                logger.error(f"Error in OpenF1 polling loop: {e}")
            
            await asyncio.sleep(5.0)

@app.on_event("startup")
async def startup_event():
    await load_session_data(active_session_key)
    asyncio.create_task(run_central_simulation_loop())
    asyncio.create_task(poll_live_openf1_data_loop())

@app.get("/")
async def root():
    return {
        "status": "online",
        "message": "F1 Race Engineer Backend API is running successfully on Hugging Face Spaces!"
    }

@app.get("/api/sessions")
async def get_sessions():
    return [
        {"id": "11315", "name": "Austrian GP 2026 - Race [LIVE]", "track_name": "Red Bull Ring", "is_active": str(active_session_key) == "11315", "type": "RACE"},
        {"id": "11311", "name": "Austrian GP 2026 - Qualifying [LIVE]", "track_name": "Red Bull Ring", "is_active": str(active_session_key) == "11311", "type": "QUALIFYING"},
        {"id": "11308", "name": "Austrian GP 2026 - Practice 1 [LIVE]", "track_name": "Red Bull Ring", "is_active": str(active_session_key) == "11308", "type": "PRACTICE"},
        {"id": "11309", "name": "Austrian GP 2026 - Practice 2 [LIVE]", "track_name": "Red Bull Ring", "is_active": str(active_session_key) == "11309", "type": "PRACTICE"},
        {"id": "11310", "name": "Austrian GP 2026 - Practice 3 [LIVE]", "track_name": "Red Bull Ring", "is_active": str(active_session_key) == "11310", "type": "PRACTICE"},
        {"id": "11307", "name": "Barcelona GP 2026 - Race", "track_name": "Circuit de Barcelona-Catalunya", "is_active": str(active_session_key) == "11307", "type": "RACE"},
        {"id": "11303", "name": "Barcelona GP 2026 - Qualifying", "track_name": "Circuit de Barcelona-Catalunya", "is_active": str(active_session_key) == "11303", "type": "QUALIFYING"},
        {"id": "9523", "name": "Monaco GP 2024 - Race", "track_name": "Circuit de Monaco", "is_active": str(active_session_key) == "9523", "type": "RACE"},
        {"id": "9558", "name": "British GP 2024 - Race", "track_name": "Silverstone Circuit", "is_active": str(active_session_key) == "9558", "type": "RACE"},
        {"id": "9574", "name": "Spa GP 2024 - Race", "track_name": "Circuit de Spa-Francorchamps", "is_active": str(active_session_key) == "9574", "type": "RACE"},
        {"id": "9590", "name": "Monza GP 2024 - Race", "track_name": "Autodromo Nazionale Monza", "is_active": str(active_session_key) == "9590", "type": "RACE"},
    ]

@app.get("/api/stints")
async def get_active_session_stints():
    if not session_cache.get("drivers"):
        return []
    driver_map = {d["number"]: d["code"] for d in session_cache["drivers"]}
    res = []
    for d_num, stint_list in session_cache.get("stints_by_driver", {}).items():
        acronym = driver_map.get(d_num, str(d_num))
        for stint in stint_list:
            res.append({
                "driver_id": acronym,
                "stint_number": stint["stint_number"],
                "lap_start": stint["lap_start"],
                "lap_end": stint["lap_end"],
                "compound": stint["compound"],
                "tyre_age_at_start": stint["tyre_age_at_start"]
            })
    return res

@app.post("/api/sessions/select/{session_key}")
async def select_session(session_key: str):
    global active_session_key
    active_session_key = session_key
    if session_key.isdigit():
        await load_session_data(int(session_key))
    else:
        await load_session_data(FALLBACK_SESSION_KEY)
        if "austria" in session_key:
            session_cache["track_name"] = "Red Bull Ring"
        if "_q" in session_key:
            session_cache["session_type"] = "Qualifying"
        elif "_fp" in session_key:
            session_cache["session_type"] = "Practice"
        else:
            session_cache["session_type"] = "Race"
    logger.info(f"Active session changed to: {active_session_key}")
    return {"status": "success", "session_key": active_session_key}


async def broadcast_replay_status():
    payload = json.dumps({
        "type": "replay",
        "data": {
            "status": replay_status,
            "speed": replay_speed,
            "current_lap": current_lap,
            "total_laps": session_cache["total_laps"],
            "track_status": track_status
        }
    })
    for ws in list(active_connections):
        try:
            await ws.send_text(payload)
        except Exception as e:
            logger.error(f"Error broadcasting replay status: {e}")

@app.post("/api/replay/play")
async def replay_play():
    global replay_status
    replay_status = "playing"
    logger.info("Replay set to PLAYING")
    await broadcast_replay_status()
    return {"status": "success", "replay_status": replay_status}

@app.post("/api/replay/pause")
async def replay_pause():
    global replay_status
    replay_status = "paused"
    logger.info("Replay set to PAUSED")
    await broadcast_replay_status()
    return {"status": "success", "replay_status": replay_status}

@app.post("/api/replay/speed/{speed}")
async def replay_speed_select(speed: float):
    global replay_speed
    replay_speed = speed
    logger.info(f"Replay speed set to: {replay_speed}")
    await broadcast_replay_status()
    return {"status": "success", "replay_speed": replay_speed}

def get_session_start_time():
    min_date = None
    if "laps_by_driver" in session_cache:
        for driver_laps in session_cache["laps_by_driver"].values():
            for lap in driver_laps:
                if lap["lap_number"] == 1:
                    lap_date = lap.get("parsed_date_start")
                    if lap_date and (min_date is None or lap_date < min_date):
                        min_date = lap_date
    return min_date

def get_session_end_time():
    max_date = None
    if "laps_by_driver" in session_cache:
        for driver_laps in session_cache["laps_by_driver"].values():
            for lap in driver_laps:
                lap_date = lap.get("parsed_date_start")
                if lap_date and (max_date is None or lap_date > max_date):
                    max_date = lap_date
    return max_date

@app.post("/api/replay/start")
async def replay_go_to_start():
    global current_session_time, current_lap
    start_time = get_session_start_time()
    if start_time:
        current_session_time = start_time
    current_lap = 1
    logger.info(f"Replay jumped to START: {current_session_time}")
    await broadcast_replay_status()
    return {"status": "success", "current_session_time": current_session_time.isoformat() if current_session_time else None}

@app.post("/api/replay/end")
async def replay_go_to_end():
    global current_session_time, current_lap
    end_time = get_session_end_time()
    if end_time:
        current_session_time = end_time
    current_lap = session_cache.get("total_laps", 78)
    logger.info(f"Replay jumped to END: {current_session_time}")
    await broadcast_replay_status()
    return {"status": "success", "current_session_time": current_session_time.isoformat() if current_session_time else None}

@app.get("/api/drivers/{driver_code}/laps")
async def get_driver_laps(driver_code: str):
    global current_session_time
    driver_num = None
    for d in session_cache["drivers"]:
        if d["code"] == driver_code:
            driver_num = d["number"]
            break
            
    if driver_num is None:
        try:
            driver_num = int(driver_code)
        except ValueError:
            return []
            
    all_completed_laps = []
    for d_no, d_laps in session_cache["laps_by_driver"].items():
        for lap in d_laps:
            lap_start = lap.get("parsed_date_start")
            if lap_start and current_session_time and lap_start <= current_session_time:
                dur = lap.get("lap_duration") or 80.0
                if lap_start + timedelta(seconds=dur) <= current_session_time:
                    all_completed_laps.append((d_no, lap))
                    
    best_s1_all = float("inf")
    best_s2_all = float("inf")
    best_s3_all = float("inf")
    
    for d_no, lap in all_completed_laps:
        s1 = lap.get("duration_sector_1")
        s2 = lap.get("duration_sector_2")
        s3 = lap.get("duration_sector_3")
        if s1 and s1 > 0 and s1 < best_s1_all:
            best_s1_all = s1
        if s2 and s2 > 0 and s2 < best_s2_all:
            best_s2_all = s2
        if s3 and s3 > 0 and s3 < best_s3_all:
            best_s3_all = s3
            
    best_s1_driver = float("inf")
    best_s2_driver = float("inf")
    best_s3_driver = float("inf")
    
    driver_completed_laps = []
    for d_no, lap in all_completed_laps:
        if d_no == driver_num:
            driver_completed_laps.append(lap)
            s1 = lap.get("duration_sector_1")
            s2 = lap.get("duration_sector_2")
            s3 = lap.get("duration_sector_3")
            if s1 and s1 > 0 and s1 < best_s1_driver:
                best_s1_driver = s1
            if s2 and s2 > 0 and s2 < best_s2_driver:
                best_s2_driver = s2
            if s3 and s3 > 0 and s3 < best_s3_driver:
                best_s3_driver = s3
                
    result = []
    driver_completed_laps.sort(key=lambda x: x["lap_number"])
    
    for lap in driver_completed_laps:
        s1 = lap.get("duration_sector_1")
        s2 = lap.get("duration_sector_2")
        s3 = lap.get("duration_sector_3")
        lap_dur = lap.get("lap_duration")
        
        def get_sector_color(val, driver_pb, session_pb):
            if not val or val <= 0:
                return "YELLOW"
            if val <= session_pb + 0.0005:
                return "PURPLE"
            if val <= driver_pb + 0.0005:
                return "GREEN"
            return "YELLOW"
            
        result.append({
            "lap_number": lap["lap_number"],
            "lap_duration": lap_dur,
            "s1": s1,
            "s1_color": get_sector_color(s1, best_s1_driver, best_s1_all),
            "s2": s2,
            "s2_color": get_sector_color(s2, best_s2_driver, best_s2_all),
            "s3": s3,
            "s3_color": get_sector_color(s3, best_s3_driver, best_s3_all)
        })
        
    return result

@app.get("/api/drivers")
async def get_drivers():
    return session_cache["drivers"]

@app.get("/api/positions")
async def get_positions():
    standings = get_standings_for_lap(current_lap, current_session_time)
    if standings:
        for item in standings:
            d_num = next((d["number"] for d in session_cache["drivers"] if d["code"] == item["driver_id"]), None)
            if d_num:
                prog, is_pitting, lap_dur, pit_start, pit_dur = calculate_driver_progress(d_num, current_session_time, session_cache["track_name"])
            else:
                prog, is_pitting, lap_dur, pit_start, pit_dur = 0.0, False, 80.0, None, 22.0
            item["track_progress"] = prog
            item["drs_active"] = False
            item["is_pitting"] = is_pitting
            item["lap_duration"] = lap_dur
            item["pit_start_time"] = pit_start
            item["pit_duration"] = pit_dur
        
        standings.sort(key=lambda x: (x.get("lap_num") or 1) + (x.get("track_progress") or 0.0), reverse=True)
        for idx, item in enumerate(standings):
            item["position"] = idx + 1
        
        session_type_upper = session_cache.get("session_type", "Race").upper()
        is_time_trial = "QUALIFYING" in session_type_upper or "PRACTICE" in session_type_upper
        recalculate_gaps_and_intervals(standings, is_time_trial)
    return standings

@app.get("/api/telemetry/latest")
async def get_latest_telemetry():
    standings = get_standings_for_lap(current_lap, current_session_time)
    if standings:
        for item in standings:
            d_num = next((d["number"] for d in session_cache["drivers"] if d["code"] == item["driver_id"]), None)
            if d_num:
                prog, _, _, _, _ = calculate_driver_progress(d_num, current_session_time, session_cache["track_name"])
            else:
                prog = 0.0
            item["track_progress"] = prog
        standings.sort(key=lambda x: (x.get("lap_num") or 1) + (x.get("track_progress") or 0.0), reverse=True)
        leader = standings[0]
        return {
            "timestamp": datetime.now().isoformat(),
            "driver_id": leader["driver_id"],
            "speed": 280.5,
            "rpm": 11500,
            "throttle": 0.98,
            "brake": 0.0,
            "gear": 7,
            "tyre_age": leader["tyre_age"],
            "last_lap": leader["last_lap"],
            "battery": 75.0
        }
    return {
        "timestamp": datetime.now().isoformat(),
        "driver_id": "VER",
        "speed": 0.0,
        "rpm": 0,
        "throttle": 0.0,
        "brake": 0.0,
        "gear": 0,
        "tyre_age": 1,
        "last_lap": "N/A",
        "battery": 100.0
    }

@app.get("/api/replay/status")
async def get_replay_status():
    return {
        "status": replay_status,
        "speed": replay_speed,
        "current_lap": current_lap,
        "total_laps": session_cache["total_laps"],
        "track_status": track_status,
        "current_session_time": current_session_time.isoformat() if current_session_time else None
    }

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    logger.info("WebSocket client connected")
    active_connections.append(websocket)
    
    try:
        # Send initial standings and replay state instantly
        standings = get_standings_for_lap(current_lap, current_session_time)
        if standings:
            # Map progress and active aerodynamics (DRS) for all drivers
            for item in standings:
                d_num = None
                for d in session_cache["drivers"]:
                    if d["code"] == item["driver_id"]:
                        d_num = d["number"]
                        break
                
                if d_num:
                    prog, is_pitting, lap_dur, pit_start, pit_dur = calculate_driver_progress(d_num, current_session_time, session_cache["track_name"])
                else:
                    prog, is_pitting, lap_dur, pit_start, pit_dur = 0.0, False, 80.0, None, 22.0
                
                track_location = session_cache["track_name"].lower()
                drs_active = False
                if not is_pitting:
                    if "monza" in track_location:
                        drs_active = (prog >= 0.82 or prog <= 0.18) or (prog >= 0.50 and prog <= 0.65)
                    elif "silverstone" in track_location:
                        drs_active = (prog >= 0.22 and prog <= 0.38) or (prog >= 0.70 and prog <= 0.88)
                    elif "spa" in track_location:
                        drs_active = (prog >= 0.42 and prog <= 0.60) or (prog >= 0.90 or prog <= 0.12)
                    elif "barcelona" in track_location:
                        drs_active = (prog >= 0.88 or prog <= 0.12) or (prog >= 0.40 and prog <= 0.55)
                    else:
                        drs_active = (prog >= 0.85 or prog <= 0.15)
                
                item["track_progress"] = prog
                item["drs_active"] = drs_active
                item["is_pitting"] = is_pitting
                item["lap_duration"] = lap_dur
                item["pit_start_time"] = pit_start
                item["pit_duration"] = pit_dur

            standings.sort(key=lambda x: (x.get("lap_num") or 1) + (x.get("track_progress") or 0.0), reverse=True)
            for idx, item in enumerate(standings):
                item["position"] = idx + 1

            session_type_upper = session_cache.get("session_type", "Race").upper()
            is_time_trial = "QUALIFYING" in session_type_upper or "PRACTICE" in session_type_upper
            recalculate_gaps_and_intervals(standings, is_time_trial)

            positions_packet = {
                "type": "positions",
                "data": [
                    {
                        "position": item["position"],
                        "driver_id": item["driver_id"],
                        "driver_name": item["driver_name"],
                        "team": item["team"],
                        "gap": item["gap"],
                        "interval": item["interval"],
                        "last_lap": item["last_lap"],
                        "best_lap": item["best_lap"],
                        "tyre": item["tyre"],
                        "tyre_age": item["tyre_age"],
                        "laps": item["lap_num"],
                        "track_progress": item["track_progress"],
                        "drs_active": item["drs_active"],
                        "delta": item["delta"],
                        "is_pitting": item["is_pitting"],
                        "lap_start_time": item["lap_start_time"],
                        "lap_duration": item["lap_duration"],
                        "pit_start_time": item["pit_start_time"],
                        "pit_duration": item["pit_duration"],
                        "s1": item["s1"],
                        "s1_color": item["s1_color"],
                        "s2": item["s2"],
                        "s2_color": item["s2_color"],
                        "s3": item["s3"],
                        "s3_color": item["s3_color"]
                    }
                    for item in standings
                ],
                "current_session_time": current_session_time.isoformat() if current_session_time else None,
                "weather": get_weather_at_time(current_session_time)
            }
            await websocket.send_text(json.dumps(positions_packet))

        # Send initial replay status
        replay_packet = {
            "type": "replay",
            "data": {
                "status": replay_status,
                "speed": replay_speed,
                "current_lap": current_lap,
                "total_laps": session_cache["total_laps"],
                "track_status": track_status
            }
        }
        await websocket.send_text(json.dumps(replay_packet))
    except Exception as e:
        logger.error(f"Error sending initial WebSocket payloads: {e}")
        
    try:
        while True:
            # Maintain connection, listen for text in case of keep-alive pings
            await websocket.receive_text()
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        try:
            active_connections.remove(websocket)
        except ValueError:
            pass
