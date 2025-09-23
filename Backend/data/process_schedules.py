import pandas as pd
from sqlalchemy import create_engine, text
import re
import sys

# --- CONFIGURATION ---
CSV_FILE_PATH = 'backend/data/train_details.csv' # Make sure this points to your 241-row Delhi file
DB_CONNECTION_STRING = 'postgresql://postgres:flowstate1212$$12@db.yilzdhtjvfvslcmqmgum.supabase.co:5432/postgres'

class Simulation:
    def __init__(self, section_code='DLI'):
        self.section_code = section_code
        self.tick_rate = 1
        self.sim_speed = 1
        
        self.network = self._load_network_layout()
        if not self.network:
            raise ValueError("Failed to load network layout. Cannot start simulation.")
            
        self.nodes_map = {node['id']: node for node in self.network['nodes']}
        self.segments_map = {seg['id']: seg for seg in self.network['trackSegments']}
        self.adjacency_list = self._build_adjacency_list()
        
        self.active_trains = []
        self.master_schedule = self._load_master_schedule()
        
        self.current_time_seconds = 0
        
        print(f"✅ Simulation for section {self.section_code} initialized.")
        if self.master_schedule:
            print(f"✅ Loaded schedules for {len(self.master_schedule)} trains from Supabase.")

    def _load_network_layout(self):
        try:
            with open(LAYOUT_FILE_PATH, 'r') as f: return json.load(f)['network']
        except Exception as e:
            print(f"❌ FATAL: Could not load or parse layout file: {e}"); return None

    def _build_adjacency_list(self):
        adj = {node['id']: [] for node in self.network['nodes']}
        for seg in self.network['trackSegments']:
            start, end = seg['startNodeId'], seg['endNodeId']
            adj[start].append({'node': end, 'segment_id': seg['id']})
            adj[end].append({'node': start, 'segment_id': seg['id']})
        print("✅ Built network adjacency list for pathfinding.")
        return adj

    def _load_master_schedule(self):
        try:
            engine = create_engine(DB_CONNECTION_STRING)
            with engine.connect() as connection:
                query = text(f"SELECT DISTINCT train_no FROM stops WHERE station_code = '{self.section_code}'")
                trains_in_section_df = pd.read_sql(query, connection)
                train_numbers = trains_in_section_df['train_no'].tolist()
                if not train_numbers: return {}
                full_schedule_query = text("SELECT t.train_name, s.* FROM stops s JOIN trains t ON s.train_no = t.train_no WHERE s.train_no IN :train_numbers ORDER BY s.train_no, s.sequence")
                all_stops_df = pd.read_sql(full_schedule_query, connection, params={'train_numbers': tuple(train_numbers)})
                all_stops_df['arrival_seconds'] = pd.to_timedelta(all_stops_df['arrival_time']).dt.total_seconds()
                return {train: group.to_dict('records') for train, group in all_stops_df.groupby('train_no')}
        except Exception as e:
            print(f"❌ DATABASE ERROR in _load_master_schedule: {e}"); return {}

    def get_state(self):
        """ Returns the complete current state of the simulation. THIS IS THE MISSING FUNCTION. """
        sim_time_str = time.strftime('%H:%M:%S', time.gmtime(self.current_time_seconds % 86400))
        return {"timestamp": self.current_time_seconds, "sim_time_str": sim_time_str, "network": self.network, "trains": self.active_trains}

    def _find_path_bfs(self, start_node_id, end_node_id):
        if start_node_id not in self.adjacency_list or end_node_id not in self.adjacency_list: return None
        queue = deque([[start_node_id]]); visited = {start_node_id}
        while queue:
            path = queue.popleft(); node = path[-1]
            if node == end_node_id: return path
            for neighbor_info in self.adjacency_list.get(node, []):
                neighbor_node = neighbor_info['node']
                if neighbor_node not in visited:
                    visited.add(neighbor_node); new_path = list(path); new_path.append(neighbor_node); queue.append(new_path)
        return None

    def _convert_node_path_to_segment_path(self, node_path):
        segment_path = []
        for i in range(len(node_path) - 1):
            start_node, end_node = node_path[i], node_path[i+1]; found_segment = False
            for neighbor_info in self.adjacency_list[start_node]:
                if neighbor_info['node'] == end_node:
                    segment_path.append(neighbor_info['segment_id']); found_segment = True; break
            if not found_segment: print(f"⚠️ Pathfinding Error: Could not find a direct segment between {start_node} and {end_node}"); return None
        return segment_path

    def _find_route_for_train(self):
        entry_signals = [n['id'] for n in self.network['nodes'] if n['type'] == 'SIGNAL' and 'APP' in n['id']]
        platform_signals = [n['id'] for n in self.network['nodes'] if n['type'] == 'SIGNAL' and 'PF' in n['id']]
        exit_terminals = [n['id'] for n in self.network['nodes'] if n['type'] == 'TERMINAL']
        if not all([entry_signals, platform_signals, exit_terminals]): return None
        entry_point, platform_signal, exit_point = random.choice(entry_signals), random.choice(platform_signals), random.choice(exit_terminals)
        node_path_to_platform = self._find_path_bfs(entry_point, platform_signal)
        if not node_path_to_platform: return None
        node_path_from_platform = self._find_path_bfs(platform_signal, exit_point)
        if not node_path_from_platform: return None
        full_node_path = node_path_to_platform + node_path_from_platform[1:]
        return self._convert_node_path_to_segment_path(full_node_path)

    def _spawn_trains(self):
        for train_no, schedule in self.master_schedule.items():
            if any(t['id'] == str(train_no) for t in self.active_trains): continue
            delhi_stop = next((s for s in schedule if s['station_code'] == self.section_code), None)
            if not delhi_stop: continue
            spawn_time = delhi_stop['arrival_seconds'] - 300
            if spawn_time <= self.current_time_seconds < spawn_time + self.sim_speed:
                route = self._find_route_for_train()
                if not route: continue
                new_train = {"id": str(train_no), "name": schedule[0]['train_name'], "type": "Express", "priority": 8, "state": "RUNNING", "route": route, "current_route_segment_index": 0, "currentSegmentId": route[0], "positionOnSegment": 0.0, "speed_kph": 60}
                self.active_trains.append(new_train)
                print(f"🚂 Spawning train {new_train['id']} ({new_train['name']}) on route starting with: {route[0]}")

    def _update_train_positions(self):
        for train in self.active_trains:
            if train['state'] != "RUNNING": continue
            segment = self.segments_map.get(train['currentSegmentId'])
            if not segment: continue
            speed_mps = (train['speed_kph'] * 1000) / 3600
            distance_to_move = speed_mps * self.tick_rate * self.sim_speed
            position_delta = distance_to_move / segment.get('length', 1)
            train['positionOnSegment'] += position_delta
            if train['positionOnSegment'] >= 1.0: self._handle_train_at_node(train)
    
    def _handle_train_at_node(self, train):
        train.positionOnSegment = 1.0
        current_segment = self.segments_map[train['currentSegmentId']]
        end_node = self.nodes_map.get(current_segment['endNodeId'])
        if end_node and end_node.get('type') == 'SIGNAL' and end_node.get('state') == 'RED':
            print(f"🚦 Train {train['id']} is WAITING at red signal {end_node['id']}")
            train['state'] = 'WAITING_SIGNAL'; train['speed_kph'] = 0; return
        train.positionOnSegment = 0.0
        train['current_route_segment_index'] += 1
        if train['current_route_segment_index'] >= len(train['route']):
            print(f"✅ Train {train['id']} has exited."); train['state'] = 'EXITED'; return
        train['currentSegmentId'] = train['route'][train['current_route_segment_index']]

    def tick(self):
        self.current_time_seconds += self.tick_rate * self.sim_speed
        self._spawn_trains()
        self._update_train_positions()
        self.active_trains = [t for t in self.active_trains if t.get('state') != 'EXITED']

    def set_signal(self, signal_id):
        signal = self.nodes_map.get(signal_id)
        if not (signal and signal.get('type') == 'SIGNAL'): return False
        new_state = 'GREEN' if signal['state'] == 'RED' else 'RED'
        signal['state'], signal['isManuallyOverridden'] = new_state, True
        print(f"🎛️ Controller override: Signal {signal_id} to {new_state}")
        if new_state == 'GREEN':
            for train in self.active_trains:
                if train['state'] == 'WAITING_SIGNAL':
                    segment = self.segments_map.get(train['currentSegmentId'])
                    if segment and segment['endNodeId'] == signal_id:
                        print(f"🟢 Train {train['id']} proceeding through {signal_id}")
                        train['state'] = 'RUNNING'; train['speed_kph'] = 30
                        self._handle_train_at_node(train)
        return True