import json
import math

# --- CONFIGURATION ---
INPUT_GEOJSON_PATH = './backend/data/delhi_osm_data.json'
OUTPUT_LAYOUT_PATH = './backend/data/delhi_layout.json'
SVG_WIDTH = 1200  # Target width of our SVG canvas for the visualization
SVG_HEIGHT = 600 # Target height of our SVG canvas

def scale_coords(coords, min_lon, max_lon, min_lat, max_lat):
    """
    Converts longitude/latitude coordinates to fit within the SVG canvas.
    Flips the Y-axis because SVG's origin (0,0) is at the top-left.
    """
    lon, lat = coords
    x = (lon - min_lon) / (max_lon - min_lon) * SVG_WIDTH
    y = (1 - (lat - min_lat) / (max_lat - min_lat)) * SVG_HEIGHT
    return round(x), round(y)

def main():
    print("--- Starting OpenStreetMap GeoJSON Processing ---")

    try:
        with open(INPUT_GEOJSON_PATH, 'r') as f:
            data = json.load(f)
        print(f"✅ Loaded GeoJSON with {len(data['features'])} features.")
    except FileNotFoundError:
        print(f"❌ ERROR: GeoJSON file not found at '{INPUT_GEOJSON_PATH}'")
        return

    # --- Pass 1: Extract all unique coordinate points and find the map boundaries ---
    all_coords = []
    osm_nodes = {}  # Store nodes that have special properties (signals, switches)
    
    # First, process Point features to identify them as special nodes
    for feature in data['features']:
        if feature['geometry']['type'] == 'Point':
            node_id = feature['id']
            coords = tuple(feature['geometry']['coordinates'])
            all_coords.append(coords)
            osm_nodes[node_id] = {
                'coords': coords,
                'type': feature['properties'].get('railway', 'JUNCTION').upper(),
                'properties': feature['properties']
            }
    
    # Then, loop through all LineString features to get their points for boundary calculation
    for feature in data['features']:
        if feature['geometry']['type'] == 'LineString':
            for coords in feature['geometry']['coordinates']:
                all_coords.append(tuple(coords))

    if not all_coords:
        print("❌ No coordinates found in GeoJSON. Exiting.")
        return

    # Calculate the bounding box of the entire layout
    min_lon = min(c[0] for c in all_coords)
    max_lon = max(c[0] for c in all_coords)
    min_lat = min(c[1] for c in all_coords)
    max_lat = max(c[1] for c in all_coords)
    print(f"Coordinate boundaries determined.")

    # --- Pass 2: Create our final, structured node list with scaled coordinates ---
    final_nodes = []
    coord_to_id_map = {}
    node_counter = 1

    # First, add the special nodes (signals, switches) we identified
    for node_data in osm_nodes.values():
        x, y = scale_coords(node_data['coords'], min_lon, max_lon, min_lat, max_lat)
        
        node_type_prefix = {'SWITCH': 'P', 'SIGNAL': 'S'}.get(node_data['type'], 'J')
        simple_id = f"{node_type_prefix}-{node_counter}"
        node_counter += 1
        
        final_nodes.append({
            "id": simple_id,
            "type": node_data['type'],
            "position": {"x": x, "y": y},
            "state": "NORMAL" if node_data['type'] == 'SWITCH' else "RED",
            "isLocked": False,
            "isManuallyOverridden": False
        })
        coord_to_id_map[node_data['coords']] = simple_id

    # Now, add any remaining coordinate points from tracks as simple JUNCTIONs
    for coords_tuple in set(all_coords):
        if coords_tuple not in coord_to_id_map:
            x, y = scale_coords(coords_tuple, min_lon, max_lon, min_lat, max_lat)
            simple_id = f"J-{node_counter}"
            node_counter += 1
            final_nodes.append({
                "id": simple_id,
                "type": "JUNCTION",
                "position": {"x": x, "y": y}
            })
            coord_to_id_map[coords_tuple] = simple_id
            
    print(f"✅ Created {len(final_nodes)} unique network nodes.")

    # --- Pass 3: Create track segments by connecting the nodes ---
    final_segments = []
    segment_counter = 1
    
    for feature in data['features']:
        if feature['geometry']['type'] == 'LineString':
            coords_list = feature['geometry']['coordinates']
            # Create segments between each pair of points in the LineString
            for i in range(len(coords_list) - 1):
                start_coords = tuple(coords_list[i])
                end_coords = tuple(coords_list[i+1])
                
                start_node_id = coord_to_id_map.get(start_coords)
                end_node_id = coord_to_id_map.get(end_coords)

                if start_node_id and end_node_id:
                    final_segments.append({
                        "id": f"TC-{segment_counter}",
                        "startNodeId": start_node_id,
                        "endNodeId": end_node_id,
                        "length": 100,  # Placeholder length, can be calculated with haversine formula if needed
                        "maxSpeed": 60,   # Placeholder speed, can be inferred from OSM tags later
                        "status": "OPERATIONAL",
                        "isOccupied": False,
                        "tempSpeedRestriction": None,
                    })
                    segment_counter += 1
    
    print(f"✅ Created {len(final_segments)} track segments.")

    # --- Assemble the final layout JSON object ---
    final_layout = {
        "network": {
            "nodes": final_nodes,
            "trackSegments": final_segments,
            "routes": [] # Routes will be defined logically later
        }
    }

    # --- Write the final result to the output file ---
    with open(OUTPUT_LAYOUT_PATH, 'w') as f:
        json.dump(final_layout, f, indent=2)
    
    print(f"🎉 Successfully created final layout file at '{OUTPUT_LAYOUT_PATH}'")

if __name__ == '__main__':
    main()
