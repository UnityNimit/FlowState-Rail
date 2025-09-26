import time, json, pandas as pd
from collections import deque

LAYOUT_FILE_PATH = './data/delhi_schematic_layout.json'

class Simulation:
    def __init__(self, section_code='DLI'):
        self.section_code = section_code
        self.tick_rate = 1
        self.sim_speed = 1
        
        self.network = self._load_network_layout()
        if not self.network: raise ValueError("Failed to load layout.")
        self.nodes_map = {n['id']: n for n in self.network['nodes']}
        self.segments_map = {s['id']: s for s in self.network['trackSegments']}
        self.adjacency_list = self._build_adjacency_list()
        self.master_schedule = self._load_master_schedule()
        
        self.priorities = {
            'Shatabdi':   10,
            'Rajdhani':   9,
            'Passenger':  8,
            'DMU':        7,
            'MEMU':       6,
            'SF Express': 5,
            'Mail':       4,
            'Express':    3
        }

        self.active_trains = []
        self.processed_train_ids = set()
        self.locked_resources = set()

        self.plan_needed = True

        self.current_time_seconds = 0
        start_time_str = time.strftime('%H:%M:%S', time.gmtime(self.current_time_seconds % 86400))
        print(f"🚀 Simulation starting at {start_time_str}.")
        print(f"✅ Definitive Interlocking Simulation Engine Initialized with Passenger Boarding Logic.")

    def get_state(self):
        self._update_network_state()
        return {"timestamp": self.current_time_seconds, "network": self.network, "trains": self.active_trains}

    def _load_network_layout(self):
        try:
            with open(LAYOUT_FILE_PATH, 'r') as f: return json.load(f)['network']
        except Exception: return None

    def _build_adjacency_list(self):
        adj = {n['id']: [] for n in self.network['nodes']}
        for seg in self.network['trackSegments']:
            adj[seg['startNodeId']].append({'node': seg['endNodeId'], 'segment_id': seg['id']})
            adj[seg['endNodeId']].append({'node': seg['startNodeId'], 'segment_id': seg['id']})
        return adj
        
    def _load_master_schedule(self):
        try:
            csv_path = './data/intelligent_schedule.csv'
            df = pd.read_csv(csv_path)
            df['arrival_seconds'] = pd.to_timedelta(df['Arrival time'], errors='coerce').dt.total_seconds()
            df.dropna(subset=['arrival_seconds'], inplace=True)
            print(f"✅ Loaded {len(df)} schedule entries from {csv_path}")
            return df.to_dict('records')
        except Exception as e:
            print(f"❌ FATAL ERROR: Could not load schedule from CSV: {e}"); return []

    def find_all_possible_routes(self, start_node, end_node):
        node_paths = self._find_all_paths_bfs(start_node, end_node)
        return [self._convert_node_path_to_segment_path(p) for p in node_paths if p]

    def _find_all_paths_bfs(self, start, end, max_paths=5):
        paths, queue = [], deque([[start]])
        while queue and len(paths) < max_paths:
            path = queue.popleft()
            if path[-1] == end: paths.append(path); continue
            if len(path) > 15: continue
            for neighbor in self.adjacency_list.get(path[-1], []):
                if neighbor['node'] not in path:
                    new_path = list(path); new_path.append(neighbor['node']); queue.append(new_path)
        return paths

    def _convert_node_path_to_segment_path(self, node_path):
        path = []
        for i in range(len(node_path) - 1):
            for neighbor in self.adjacency_list[node_path[i]]:
                if neighbor['node'] == node_path[i+1]: path.append(neighbor['segment_id']); break
        return path
    
    def _convert_segment_path_to_node_path(self, segment_path):
        if not segment_path: return []
        node_path = [self.segments_map[segment_path[0]]['startNodeId']]
        for seg_id in segment_path:
            segment = self.segments_map[seg_id]
            last_node = node_path[-1]
            if segment['startNodeId'] == last_node:
                node_path.append(segment['endNodeId'])
            else:
                node_path.append(segment['startNodeId'])
        return node_path

    def _spawn_trains(self):
        for train_data in self.master_schedule:
            train_id = str(train_data['Train No'])
            if train_id in self.processed_train_ids: continue
            
            if train_data['arrival_seconds'] <= self.current_time_seconds:
                new_train = {
                    "id": train_id, "type": train_data['Type'],
                    "start_node": train_data['Start Node'], "end_node": train_data['End Node'],
                    "state": "WAITING_PLAN", "route": [], "node_path": [], "currentSegmentId": None,
                    "positionOnSegment": 0.0, "speed_kph": 0,
                    "waiting_since": self.current_time_seconds,
                    "boarding_timer_ends_at": None # NEW: Timer for boarding
                }
                self.active_trains.append(new_train)
                self.processed_train_ids.add(train_id)
                self.plan_needed = True
                print(f"📅 Train {new_train['id']} ({new_train['type']}) needs plan.")

    def apply_plan(self, plan):
        for instruction in plan:
            train = next((t for t in self.active_trains if t['id'] == instruction['trainId']), None)
            if not train or train['state'] != 'WAITING_PLAN': continue

            train['route'] = instruction['route']
            train['node_path'] = self._convert_segment_path_to_node_path(train['route'])
            train['state'] = 'READY_TO_PROCEED'
            print(f"  -> ✅ Plan for {train['id']} received. Is READY_TO_PROCEED.")

    def _update_train_positions(self):
        for train in self.active_trains:
            if train.get('state') != "RUNNING": continue
            
            travel_time = 30 
            increment = 1.0 / travel_time
            
            train['positionOnSegment'] += increment * self.tick_rate
            
            if train['positionOnSegment'] >= 1.0:
                train['positionOnSegment'] = 1.0
                self._handle_train_at_node(train)

    def _handle_train_at_node(self, train):
        completed_segment_id = train['currentSegmentId']
        current_route_index = train['route'].index(completed_segment_id)
        
        cleared_node_id = train['node_path'][current_route_index]
        arrived_at_node_id = train['node_path'][current_route_index + 1]

        self.locked_resources.discard(completed_segment_id)
        self.locked_resources.discard(cleared_node_id)
        self.plan_needed = True
        
        print(f"  -> ➡️ Train {train['id']} cleared {cleared_node_id} & {completed_segment_id}, arrived at {arrived_at_node_id}.")

        if current_route_index + 1 >= len(train['route']):
            final_node = train['node_path'][-1]
            self.locked_resources.discard(final_node)
            print(f"✅ Train {train['id']} has EXITED. Final node {final_node} released.")
            train['state'] = 'EXITED'
            return
        
        # --- NEW: Check if the arrival node is a platform ---
        if arrived_at_node_id.startswith("S-PF-"):
            train['state'] = 'BOARDING_PASSENGERS'
            train['speed_kph'] = 0
            train['boarding_timer_ends_at'] = self.current_time_seconds + 100  # 100 seconds boarding time
            print(f"  ->  boarding Train {train['id']} at {arrived_at_node_id}. Waiting for 100s.")
        else:
            # Original logic for non-platform nodes
            train['state'] = 'STOPPED_AWAITING_CLEARANCE'
            train['speed_kph'] = 0
            train['waiting_since'] = self.current_time_seconds

    def _check_and_dispatch_trains(self):
        # Check all trains that are waiting for some condition
        dispatchable_trains = [
            t for t in self.active_trains if t['state'] in ['READY_TO_PROCEED', 'STOPPED_AWAITING_CLEARANCE', 'BOARDING_PASSENGERS']
        ]
        dispatchable_trains.sort(key=lambda t: self.priorities.get(t['type'], 0), reverse=True)

        for train in dispatchable_trains:
            if train['state'] == 'READY_TO_PROCEED':
                next_segment_id = train['route'][0]
                next_node_id = train['node_path'][1]
                
                if next_segment_id not in self.locked_resources and next_node_id not in self.locked_resources:
                    self.locked_resources.add(next_segment_id)
                    self.locked_resources.add(next_node_id)
                    
                    train['state'] = 'RUNNING'
                    train['speed_kph'] = 60
                    train['currentSegmentId'] = next_segment_id
                    train['positionOnSegment'] = 0.0
                    train['waiting_since'] = None
                    print(f"  -> 🟢 DISPATCHED Train {train['id']} ({train['type']}) onto {next_segment_id}.")

            elif train['state'] == 'BOARDING_PASSENGERS':
                # --- NEW: Handle the boarding state ---
                if self.current_time_seconds >= train['boarding_timer_ends_at']:
                    train['state'] = 'STOPPED_AWAITING_CLEARANCE'
                    train['boarding_timer_ends_at'] = None
                    train['waiting_since'] = self.current_time_seconds # Start punctuality timer now
                    print(f"  -> ✅ Boarding complete for {train['id']}. Now awaiting clearance.")

            elif train['state'] == 'STOPPED_AWAITING_CLEARANCE':
                current_route_index = train['route'].index(train['currentSegmentId'])
                next_segment_id = train['route'][current_route_index + 1]
                next_node_id = train['node_path'][current_route_index + 2]
                
                if next_segment_id not in self.locked_resources and next_node_id not in self.locked_resources:
                    self.locked_resources.add(next_segment_id)
                    self.locked_resources.add(next_node_id)

                    train['state'] = 'RUNNING'
                    train['speed_kph'] = 60
                    train['currentSegmentId'] = next_segment_id
                    train['positionOnSegment'] = 0.0
                    train['waiting_since'] = None
                    print(f"  -> 🟢 CLEARED Train {train['id']} ({train['type']}) to proceed onto {next_segment_id}.")

    def _update_network_state(self):
        occupied_segments = {
            t['currentSegmentId'] for t in self.active_trains if t.get('currentSegmentId')
        }
        for seg in self.network['trackSegments']:
            seg['isOccupied'] = seg['id'] in occupied_segments

    def tick(self):
        self.current_time_seconds += self.tick_rate
        
        self._spawn_trains()
        self._check_and_dispatch_trains()
        self._update_train_positions()
        self.active_trains = [t for t in self.active_trains if t.get('state') != 'EXITED']