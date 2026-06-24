import httpx
import json

TRACKS = {
    "monaco": "mc-1929.geojson",
    "monza": "it-1922.geojson",
    "silverstone": "gb-1948.geojson",
    "spa": "be-1925.geojson",
    "barcelona": "es-1991.geojson"
}

BASE_URL = "https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits"

def normalize_and_downsample(coordinates, target_points=45):
    # Flatten coordinates list if nested
    coords = []
    if len(coordinates) == 1 and isinstance(coordinates[0], list) and len(coordinates[0]) > 2:
        coords = coordinates[0]
    else:
        coords = coordinates

    # Filter out empty or invalid points
    coords = [c for c in coords if len(c) >= 2]
    if not coords:
        return []

    # Extract X (Longitude) and Y (Latitude)
    xs = [c[0] for c in coords]
    ys = [c[1] for c in coords]

    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)

    range_x = max_x - min_x if max_x - min_x != 0 else 1.0
    range_y = max_y - min_y if max_y - min_y != 0 else 1.0

    # Normalize coordinates to fit in 0.05 to 0.95 range (adds safe padding)
    normalized = []
    for c in coords:
        norm_x = 0.05 + 0.90 * ((c[0] - min_x) / range_x)
        # Flip Y coordinates because screen space has Y=0 at the top and geographical space has Lat increasing upwards
        norm_y = 0.95 - 0.90 * ((c[1] - min_y) / range_y)
        normalized.append((norm_x, norm_y))

    # Downsample points to target count using step-based sampling to maintain track shape
    n = len(normalized)
    if n <= target_points:
        return normalized

    step = n / target_points
    downsampled = []
    for i in range(target_points):
        idx = int(i * step)
        downsampled.append(normalized[idx])
        
    return downsampled

async def main():
    async with httpx.AsyncClient() as client:
        for name, filename in TRACKS.items():
            url = f"{BASE_URL}/{filename}"
            print(f"Fetching {name} from {url}...")
            r = await client.get(url)
            if r.status_code != 200:
                print(f"Error fetching {name}: status code {r.status_code}")
                # Try fallback for spa
                if name == "spa":
                    url = f"{BASE_URL}/be-1950.geojson" # try different year
                    r = await client.get(url)
                    if r.status_code != 200:
                        continue
                else:
                    continue
            
            data = r.json()
            # Extract coordinates from GeoJSON
            features = data.get("features", [])
            if not features:
                print(f"No features found in {name} GeoJSON")
                continue
                
            geom = features[0].get("geometry", {})
            coords = geom.get("coordinates", [])
            
            # GeoJSON polygons can be double nested
            if geom.get("type") == "Polygon":
                coords = coords[0]
                
            processed = normalize_and_downsample(coords)
            
            print(f"\n// DENSE ACCURATE COORDINATES FOR {name.upper()}")
            print(f"static final List<Offset> {name}Points = [")
            for p in processed:
                print(f"  const Offset({p[0]:.4f}, {p[1]:.4f}),")
            print("];\n")

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
