import time, json, pandas as pd, random
from collections import deque

class Simulation:
    def __init__(self, section_code='DLI'):
        self.section_code = section_code.upper()
        self.tick_rate = 1
        self.sim_speed = 1

        self.network = self._load_network_layout()
        if not self.network: raise ValueError(f"Failed to load layout for {self.section_code}.")

        self.nodes_map = {n['id']: dict(n) for n in self.network['nodes']}
        self.segments_map = {s['id']: dict(s) for s in self.network['trackSegments']}
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

        # runtime state
        self.active_trains = []
        self.processed_train_ids = set()
        self.locked_resources = set()
        self.plan_needed = True
        self.current_time_seconds = 0

        # AI control flags (server will set). defaults: congestion & trackCondition enforced.
        self.current_ai_priorities = {
            'congestion': True,
            'trainType': True,
            'punctuality': True,
            'trackCondition': True,
            'weather': False
        }

        # dynamic per-train boost (increases when lower priority trains are deferred)
        self.train_boosts = {}  # train_id -> int

        start_time_str = time.strftime('%H:%M:%S', time.gmtime(self.current_time_seconds % 86400))
        print(f"🚀 Simulation for [{self.section_code}] ready at {start_time_str}.")
        print(f"✅ Definitive Interlocking Simulation Engine Initialized.")




    def set_signal_state(self, node_id, state):
        """
        Set a node (signal) state in nodes_map & network copy so UI sees it.
        Valid states are strings like 'GREEN', 'RED', 'NORMAL' (switch), etc.
        """
        node_id = node_id.strip().upper()
        if node_id in self.nodes_map:
            self.nodes_map[node_id]['state'] = state
            # reflect into network nodes list for get_state / UI
            for n in self.network.get('nodes', []):
                if n.get('id') == node_id:
                    n['state'] = state
            print(f"🔔 Signal {node_id} set to {state} in simulation.")
            # changing signals can require replanning
            self.plan_needed = True
            return True
        else:
            print(f"⚠️ Attempted to set unknown node {node_id} to {state}.")
            return False

        
            

    def set_ai_priorities(self, priorities: dict):
        # server-side authoritative set
        self.current_ai_priorities.update(priorities)
        # ensure required flags are always on
        self.current_ai_priorities['congestion'] = True
        self.current_ai_priorities['trackCondition'] = True
        print("Simulation: AI priorities set:", self.current_ai_priorities)

    def get_state(self):
        self._update_network_state()
        return {"timestamp": self.current_time_seconds, "network": self.network, "trains": self.active_trains}

    def _load_network_layout(self):
        layout_path = f'./data/{self.section_code.lower()}_layout.json'
        print(f"Attempting to load layout from: {layout_path}")
        try:
            with open(layout_path, 'r') as f:
                return json.load(f)['network']
        except FileNotFoundError:
            print(f"❌ FATAL ERROR: Layout file not found at {layout_path}")
            return None
        except Exception as e:
            print(f"❌ FATAL ERROR: Could not parse layout file {layout_path}: {e}")
            return None

    def _build_adjacency_list(self):
        adj = {n['id']: [] for n in self.network['nodes']}
        for seg in self.network['trackSegments']:
            adj[seg['startNodeId']].append({'node': seg['endNodeId'], 'segment_id': seg['id']})
            adj[seg['endNodeId']].append({'node': seg['startNodeId'], 'segment_id': seg['id']})
            self.segments_map[seg['id']] = dict(seg)
            self.segments_map[seg['id']].setdefault('status', seg.get('status'))
            self.segments_map[seg['id']].setdefault('weather', seg.get('weather', 'GOOD'))
        return adj

    def _load_master_schedule(self):
        csv_path = f'./data/{self.section_code.lower()}_schedule.csv'
        print(f"Attempting to load schedule from: {csv_path}")
        try:
            df = pd.read_csv(csv_path)
            if 'Arrival time' in df.columns:
                df['arrival_seconds'] = pd.to_timedelta(df['Arrival time'], errors='coerce').dt.total_seconds()
            elif 'ArrivalTime' in df.columns:
                df['arrival_seconds'] = pd.to_timedelta(df['ArrivalTime'], errors='coerce').dt.total_seconds()
            else:
                if 'arrival_seconds' not in df.columns and 'Arrival' in df.columns:
                    df['arrival_seconds'] = pd.to_timedelta(df['Arrival'], errors='coerce').dt.total_seconds()
                df['arrival_seconds'] = df.get('arrival_seconds', pd.Series([0]*len(df)))

            df.dropna(subset=['arrival_seconds'], inplace=True)
            print(f"✅ Loaded {len(df)} schedule entries from {csv_path}")
            return df.to_dict('records')
        except FileNotFoundError:
            print(f"⚠️ WARNING: Schedule file not found at {csv_path}. No trains will be spawned.")
            return []
        except Exception as e:
            print(f"❌ FATAL ERROR: Could not load schedule from CSV {csv_path}: {e}"); return []

    def find_all_possible_routes(self, start_node, end_node):
        node_paths = self._find_all_paths_bfs(start_node, end_node)
        return [self._convert_node_path_to_segment_path(p) for p in node_paths if p]

    def _find_all_paths_bfs(self, start, end, max_paths=6):
        paths, queue = [], deque([[start]])
        while queue and len(paths) < max_paths:
            path = queue.popleft()
            if path[-1] == end:
                paths.append(path); continue
            if len(path) > 30: continue
            for neighbor in self.adjacency_list.get(path[-1], []):
                seg_id = neighbor['segment_id']
                seg = self.segments_map.get(seg_id, {})
                if seg.get('status') == 'FAULTY': continue
                if self.current_ai_priorities.get('weather') and seg.get('weather') == 'BAD':
                    continue
                if neighbor['node'] not in path:
                    new_path = list(path); new_path.append(neighbor['node']); queue.append(new_path)
        return paths

    def _convert_node_path_to_segment_path(self, node_path):
        path = []
        for i in range(len(node_path) - 1):
            for neighbor in self.adjacency_list[node_path[i]]:
                if neighbor['node'] == node_path[i+1]:
                    path.append(neighbor['segment_id']); break
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
        max_spawn_per_tick = 3
        eligible = []
        for train_data in self.master_schedule:
            train_id = str(train_data.get('Train No'))
            if train_id in self.processed_train_ids:
                continue
            arrival = train_data.get('arrival_seconds', 0)
            if arrival <= self.current_time_seconds:
                eligible.append(train_data)

        if not eligible:
            return

        for train_data in eligible[:max_spawn_per_tick]:
            train_id = str(train_data['Train No'])
            new_train = {
                "id": train_id,
                "type": train_data.get('Type', 'Passenger'),
                "start_node": train_data.get('Start Node'),
                "end_node": train_data.get('End Node'),
                "state": "WAITING_PLAN",
                "route": [], "node_path": [], "currentSegmentId": None,
                "positionOnSegment": 0.0, "speed_kph": 0,
                "waiting_since": self.current_time_seconds,
                "boarding_timer_ends_at": None,
                "scheduled_arrival": int(train_data.get('arrival_seconds', 0))
            }
            self.active_trains.append(new_train)
            self.train_boosts[new_train['id']] = 0
            self.processed_train_ids.add(train_id)
            self.plan_needed = True
            print(f"📅 Train {new_train['id']} ({new_train['type']}) needs plan. Scheduled arrival: {new_train['scheduled_arrival']}")

    def apply_plan(self, plan):
        for instruction in plan:
            train = next((t for t in self.active_trains if t['id'] == instruction['trainId']), None)
            if not train or train['state'] != 'WAITING_PLAN': continue

            train['route'] = instruction['route']
            train['node_path'] = self._convert_segment_path_to_node_path(train['route'])
            train['state'] = 'READY_TO_PROCEED'
            print(f"  -> ✅ Plan for {train['id']} received. Is READY_TO_PROCEED.")

    def _update_train_positions(self):
        moved = []
        for train in list(self.active_trains):
            if train.get('state') != "RUNNING": continue

            travel_time = 30
            increment = 1.0 / travel_time
            prev_pos = train['positionOnSegment']
            train['positionOnSegment'] += increment * self.tick_rate * self.sim_speed

            if train['positionOnSegment'] >= 1.0:
                train['positionOnSegment'] = 1.0
                self._handle_train_at_node(train)
                moved.append((train['id'], train.get('currentSegmentId'), train['positionOnSegment']))
            else:
                # report small progress
                moved.append((train['id'], train.get('currentSegmentId'), round(train['positionOnSegment'], 3)))

        if moved:
            s = ", ".join([f"{tid}:{seg}@{pos}" for (tid, seg, pos) in moved])
            print(f"[tick {self.current_time_seconds}] RUNNING progress -> {s}")

    def _handle_train_at_node(self, train):
        completed_segment_id = train['currentSegmentId']
        try:
            current_route_index = train['route'].index(completed_segment_id)
        except ValueError:
            print(f"  -> ⚠️ Train {train['id']} had malformed route.")
            train['state'] = 'STOPPED_AWAITING_CLEARANCE'
            return

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

        if arrived_at_node_id.startswith("S-PF-"):
            train['state'] = 'BOARDING_PASSENGERS'
            train['speed_kph'] = 0
            train['boarding_timer_ends_at'] = self.current_time_seconds + 100
            print(f"  -> boarding Train {train['id']} at {arrived_at_node_id}. Waiting for 100s.")
        else:
            train['state'] = 'STOPPED_AWAITING_CLEARANCE'
            train['speed_kph'] = 0
            train['waiting_since'] = self.current_time_seconds

    def _route_is_viable(self, segment_route, node_path, start_node_idx=0):
        for seg_idx, seg_id in enumerate(segment_route):
            node_before = node_path[seg_idx]
            node_after = node_path[seg_idx + 1]

            if seg_idx != start_node_idx and node_before in self.locked_resources:
                return False

            seg = self.segments_map.get(seg_id, {})
            if seg_id in self.locked_resources:
                return False
            if seg.get('status') == 'FAULTY':
                return False
            if self.current_ai_priorities.get('weather') and seg.get('weather') == 'BAD':
                return False
            if node_after in self.locked_resources:
                return False
        return True

    def _score_route(self, route, node_path):
        score = len(route)
        if self.current_ai_priorities.get('congestion'):
            occupied = sum(1 for seg in route if seg in self.locked_resources)
            score += occupied * 5
        if self.current_ai_priorities.get('trackCondition'):
            bad_condition = sum(1 for seg in route if self.segments_map.get(seg, {}).get('status') != 'OPERATIONAL' and self.segments_map.get(seg, {}).get('status') != None)
            score += bad_condition * 3
        return score

    def _attempt_reroute_and_dispatch(self, train, current_node_id):
        possible_routes = self.find_all_possible_routes(current_node_id, train['end_node'])
        if not possible_routes:
            return False

        viable_routes = []
        for route in possible_routes:
            node_path = self._convert_segment_path_to_node_path(route)
            if self._route_is_viable(route, node_path, start_node_idx=0):
                viable_routes.append((route, node_path))

        if not viable_routes:
            return False

        viable_routes.sort(key=lambda x: self._score_route(x[0], x[1]))
        chosen_route, chosen_node_path = viable_routes[0]

        first_segment = chosen_route[0]
        first_node_after = chosen_node_path[1]
        seg = self.segments_map.get(first_segment, {})

        if first_segment not in self.locked_resources and first_node_after not in self.locked_resources and seg.get('status') != 'FAULTY' and (not (self.current_ai_priorities.get('weather') and seg.get('weather') == 'BAD')):
            train['route'] = chosen_route
            train['node_path'] = chosen_node_path
            self.locked_resources.add(first_segment)
            self.locked_resources.add(first_node_after)

            train['state'] = 'RUNNING'
            train['speed_kph'] = 60
            train['currentSegmentId'] = first_segment
            train['positionOnSegment'] = 0.0
            train['waiting_since'] = None
            print(f"  -> 🔁 REROUTED & DISPATCHED Train {train['id']} onto alternate route starting with {first_segment}.")
            if self.current_ai_priorities.get('trainType') and self.current_ai_priorities.get('punctuality'):
                for other in self.active_trains:
                    if other['id'] != train['id'] and other['state'] in ['READY_TO_PROCEED', 'STOPPED_AWAITING_CLEARANCE']:
                        self.train_boosts[other['id']] = self.train_boosts.get(other['id'], 0) + 1
            return True
        return False

    def _dispatch_sort_key(self, train):
        waiting_since = train.get('waiting_since')
        if waiting_since is None:
            waiting_since = self.current_time_seconds

        at_start = (train.get('state') == 'READY_TO_PROCEED' and not train.get('currentSegmentId'))

        entering_end_node = False
        if train.get('state') == 'STOPPED_AWAITING_CLEARANCE' and train.get('route') and train.get('currentSegmentId'):
            try:
                current_route_index = train['route'].index(train['currentSegmentId'])
                if (current_route_index + 2) < len(train.get('node_path', [])):
                    next_node = train['node_path'][current_route_index + 2]
                    entering_end_node = (next_node == train.get('end_node'))
            except ValueError:
                entering_end_node = False

        if at_start or entering_end_node:
            group_rank = 0
            priority_component = 0
        else:
            group_rank = 1
            base = self.priorities.get(train.get('type'), 1) if self.current_ai_priorities.get('trainType') else 1
            boost = self.train_boosts.get(train['id'], 0)
            punctuality_boost = 0
            if self.current_ai_priorities.get('punctuality'):
                scheduled = train.get('scheduled_arrival')
                if scheduled is not None:
                    lateness = int(self.current_time_seconds - scheduled)
                    if lateness > 0:
                        punctuality_boost = int(lateness / 60)
            priority_value = base + boost + punctuality_boost
            priority_component = -priority_value

        return (group_rank, priority_component, waiting_since)

    def _check_and_dispatch_trains(self):
        # --- DEBUG: snapshot before dispatch ---
        counts = {}
        for s in ['WAITING_PLAN','READY_TO_PROCEED','RUNNING','STOPPED_AWAITING_CLEARANCE','BOARDING_PASSENGERS','EXITED']:
            counts[s] = sum(1 for t in self.active_trains if t.get('state')==s)
        running_info = [(t['id'], t.get('currentSegmentId'), round(t.get('positionOnSegment',0),3)) for t in self.active_trains if t.get('state')=='RUNNING']
        print(f"[tick {self.current_time_seconds}] snapshot -> locked:{sorted(list(self.locked_resources))[:8]} | counts:{counts} | running:{running_info[:6]}")

        dispatchable_trains = [
            t for t in self.active_trains if t['state'] in ['READY_TO_PROCEED', 'STOPPED_AWAITING_CLEARANCE', 'BOARDING_PASSENGERS']
        ]
        dispatchable_trains.sort(key=self._dispatch_sort_key)

        for train in dispatchable_trains:
            # show debug info for READY trains
            if train['state'] == 'READY_TO_PROCEED':
                if not train['route']:
                    print(f"  -> Debug: {train['id']} READY with no route; skipping.")
                    continue
                next_segment_id = train['route'][0]
                next_node_id = train['node_path'][1]
                departure_node = train['node_path'][0]

                # NOTE: only treat a node's state as a signal if the node type is SIGNAL
                dep_node_obj = self.nodes_map.get(departure_node, {})
                dep_type = dep_node_obj.get('type')
                dep_state = dep_node_obj.get('state', 'RED') if dep_type == 'SIGNAL' else 'N/A'

                seg_status = self.segments_map.get(next_segment_id, {}).get('status', None)
                seg_locked = next_segment_id in self.locked_resources
                node_locked = next_node_id in self.locked_resources
                print(f"  -> Consider {train['id']} -> next_seg:{next_segment_id} next_node:{next_node_id} dep_node:{departure_node} dep_type:{dep_type} dep_state:{dep_state} seg_status:{seg_status} seg_locked:{seg_locked} node_locked:{node_locked}")

            if train['state'] == 'READY_TO_PROCEED':
                if not train['route']:
                    continue
                next_segment_id = train['route'][0]
                next_node_id = train['node_path'][1]

                seg = self.segments_map.get(next_segment_id, {})
                if seg.get('status') == 'FAULTY':
                    start_node = train['start_node']
                    rerouted = self._attempt_reroute_and_dispatch(train, start_node)
                    if not rerouted:
                        print(f"  -> ⛔ {train['id']} READY_TO_PROCEED: planned next segment {next_segment_id} is FAULTY; no alternate found.")
                    continue

                if self.current_ai_priorities.get('weather') and seg.get('weather') == 'BAD':
                    start_node = train['start_node']
                    rerouted = self._attempt_reroute_and_dispatch(train, start_node)
                    if not rerouted:
                        print(f"  -> ⛔ {train['id']} READY_TO_PROCEED: planned next segment {next_segment_id} has BAD weather; no alternate found.")
                    continue

                departure_node = train['node_path'][0]
                dep_node_obj = self.nodes_map.get(departure_node, {})
                # only enforce green on actual SIGNAL nodes
                if dep_node_obj.get('type') == 'SIGNAL':
                    departure_node_state = dep_node_obj.get('state', 'RED')
                    if departure_node_state != 'GREEN':
                        print(f"  -> ⛔ {train['id']} blocked: departure SIGNAL {departure_node} is {departure_node_state}.")
                        continue
                # non-signal nodes are allowed to proceed

                if next_segment_id not in self.locked_resources and next_node_id not in self.locked_resources:
                    self.locked_resources.add(next_segment_id)
                    self.locked_resources.add(next_node_id)
                    train['state'] = 'RUNNING'
                    train['speed_kph'] = 60
                    train['currentSegmentId'] = next_segment_id
                    train['positionOnSegment'] = 0.0
                    train['waiting_since'] = None
                    print(f"  -> 🟢 DISPATCHED Train {train['id']} ({train['type']}) onto {next_segment_id}.")
                    if self.current_ai_priorities.get('trainType') and self.current_ai_priorities.get('punctuality'):
                        for other in self.active_trains:
                            if other['id'] != train['id'] and other['state'] in ['READY_TO_PROCEED', 'STOPPED_AWAITING_CLEARANCE']:
                                self.train_boosts[other['id']] = self.train_boosts.get(other['id'], 0) + 1
                else:
                    start_node = train['start_node']
                    rerouted = self._attempt_reroute_and_dispatch(train, start_node)
                    if not rerouted:
                        print(f"  -> ⛔ {train['id']} READY_TO_PROCEED blocked on {next_segment_id}. No immediate alternate route found.")

            elif train['state'] == 'BOARDING_PASSENGERS':
                if self.current_time_seconds >= train['boarding_timer_ends_at']:
                    train['state'] = 'STOPPED_AWAITING_CLEARANCE'
                    train['boarding_timer_ends_at'] = None
                    train['waiting_since'] = self.current_time_seconds
                    print(f"  -> ✅ Boarding complete for {train['id']}. Now awaiting clearance.")

            elif train['state'] == 'STOPPED_AWAITING_CLEARANCE':
                try:
                    current_route_index = train['route'].index(train['currentSegmentId'])
                except ValueError:
                    current_node = train['node_path'][-1] if train['node_path'] else train.get('start_node')
                    rerouted = self._attempt_reroute_and_dispatch(train, current_node)
                    if not rerouted:
                        print(f"  -> ⚠️ STOPPED train {train['id']} has inconsistent route and couldn't reroute.")
                    continue

                if current_route_index + 1 >= len(train['route']):
                    continue

                next_segment_id = train['route'][current_route_index + 1]
                if current_route_index + 2 >= len(train['node_path']):
                    current_node = train['node_path'][current_route_index + 1]
                    rerouted = self._attempt_reroute_and_dispatch(train, current_node)
                    if not rerouted:
                        print(f"  -> ⚠️ STOPPED {train['id']} has a malformed node_path and couldn't reroute.")
                    continue

                next_node_id = train['node_path'][current_route_index + 2]
                seg = self.segments_map.get(next_segment_id, {})

                if seg.get('status') == 'FAULTY':
                    current_node = train['node_path'][current_route_index + 1]
                    rerouted = self._attempt_reroute_and_dispatch(train, current_node)
                    if not rerouted:
                        print(f"  -> ⛔ STOPPED {train['id']} blocked at {current_node} because next segment {next_segment_id} is FAULTY.")
                    continue

                if self.current_ai_priorities.get('weather') and seg.get('weather') == 'BAD':
                    current_node = train['node_path'][current_route_index + 1]
                    rerouted = self._attempt_reroute_and_dispatch(train, current_node)
                    if not rerouted:
                        print(f"  -> ⛔ STOPPED {train['id']} blocked at {current_node} because next segment {next_segment_id} has BAD weather.")
                    continue

                current_node_id = train['node_path'][current_route_index + 1]
                current_node_obj = self.nodes_map.get(current_node_id, {})
                # only block on non-GREEN when node is a SIGNAL
                if current_node_obj.get('type') == 'SIGNAL':
                    current_node_state = current_node_obj.get('state', 'RED')
                    if current_node_state != 'GREEN':
                        print(f"  -> ⛔ STOPPED {train['id']} blocked at {current_node_id} because SIGNAL is {current_node_state}.")
                        continue
                # else non-signal node -> proceed if resources free

                if next_segment_id not in self.locked_resources and next_node_id not in self.locked_resources:
                    self.locked_resources.add(next_segment_id)
                    self.locked_resources.add(next_node_id)
                    train['state'] = 'RUNNING'
                    train['speed_kph'] = 60
                    train['currentSegmentId'] = next_segment_id
                    train['positionOnSegment'] = 0.0
                    train['waiting_since'] = None
                    print(f"  -> 🟢 CLEARED Train {train['id']} ({train['type']}) to proceed onto {next_segment_id}.")
                    if self.current_ai_priorities.get('trainType') and self.current_ai_priorities.get('punctuality'):
                        for other in self.active_trains:
                            if other['id'] != train['id'] and other['state'] in ['READY_TO_PROCEED', 'STOPPED_AWAITING_CLEARANCE']:
                                self.train_boosts[other['id']] = self.train_boosts.get(other['id'], 0) + 1
                else:
                    current_node = train['node_path'][current_route_index + 1]
                    rerouted = self._attempt_reroute_and_dispatch(train, current_node)
                    if not rerouted:
                        print(f"  -> ⛔ STOPPED {train['id']} blocked at {current_node}. No alternate found currently.")

    def assign_random_weather(self, choose_count=3):
        segment_ids = [sid for sid in self.segments_map.keys() if self.segments_map[sid].get('status') != 'FAULTY']
        if not segment_ids:
            return
        choose_count = min(choose_count, len(segment_ids))
        chosen = random.sample(segment_ids, choose_count)
        for sid in self.segments_map:
            self.segments_map[sid]['weather'] = 'GOOD'
        for sid in chosen:
            self.segments_map[sid]['weather'] = 'BAD'
            self.locked_resources.add(sid)
        for seg in self.network['trackSegments']:
            seg['weather'] = self.segments_map[seg['id']].get('weather', 'GOOD')
        print(f"🌧️ Weather assigned BAD on segments: {chosen}")
        self.plan_needed = True

    def clear_weather(self):
        for sid in self.segments_map:
            self.segments_map[sid]['weather'] = 'GOOD'
            self.locked_resources.discard(sid)
        for seg in self.network['trackSegments']:
            seg['weather'] = 'GOOD'
        print("🌤️ Weather cleared on all segments")
        self.plan_needed = True

    def _update_network_state(self):
        occupied_segments = {
            t['currentSegmentId'] for t in self.active_trains if t.get('currentSegmentId')
        }
        for seg in self.network['trackSegments']:
            seg['isOccupied'] = seg['id'] in occupied_segments
            m = self.segments_map.get(seg['id'])
            if m:
                seg['status'] = m.get('status', seg.get('status'))
                seg['weather'] = m.get('weather', seg.get('weather', 'GOOD'))

        for node in self.network['nodes']:
            mapnode = self.nodes_map.get(node['id'])
            if mapnode:
                node['state'] = mapnode.get('state', node.get('state'))

    def tick(self):
        self.current_time_seconds += self.tick_rate * self.sim_speed
        self._spawn_trains()
        self._check_and_dispatch_trains()
        self._update_train_positions()
        self.active_trains = [t for t in self.active_trains if t.get('state') != 'EXITED']
