import sys, os, time, json, math, pandas as pd, random
from collections import deque

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

STATION_ALIASES = {
    'corridor': 'corridor',
    'delhi_gzb': 'corridor',
    'delhi_corridor': 'corridor',
    'gzb': 'ghaziabad',
    'ghaziabad': 'ghaziabad',
    'sbb': 'shahibabad',
    'shahibabad': 'shahibabad',
    'anvr': 'anand_vihar',
    'anand_vihar': 'anand_vihar',
    'dli': 'dli'
}

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')

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
        self.routes_map = {r['id']: dict(r) for r in self.network.get('routes', [])}
        self.routes_by_segments = {tuple(r['segments']): dict(r) for r in self.network.get('routes', [])}
        self.route_point_locks = {}
        self.isolated_ohe_groups = set()
        self.active_maintenance_zones = set()
        self.maintenance_resource_locks = {}

        start_time_str = time.strftime('%H:%M:%S', time.gmtime(self.current_time_seconds % 86400))
        print(f"🚀 Simulation for [{self.section_code}] ready at {start_time_str}.")
        print(f"✅ Definitive Interlocking Simulation Engine Initialized.")




    def get_route_definition(self, route):
        if isinstance(route, str):
            return self.routes_map.get(route)
        if isinstance(route, (list, tuple)):
            return self.routes_by_segments.get(tuple(route))
        return None

    def get_segment_travel_time(self, seg_id):
        seg = self.segments_map.get(seg_id, {})
        length = max(1.0, float(seg.get('lengthMeters', seg.get('length', 500))))
        speed = max(5.0, float(seg.get('permissibleSpeedKph', seg.get('maxSpeed', 60))))
        real_seconds = length / (speed / 3.6)
        demo_scale = float(self.network.get('metadata', {}).get('movementTimeScale', 0.16))
        return max(3, int(math.ceil(real_seconds * demo_scale)))

    def _required_points_for_segment(self, train, segment_id):
        """Only lock a point while the train is actually approaching or clearing it.

        A route may reserve a point in its definition, but holding every point from
        corridor entry to exit turns a route lock into a deadlock.  The train keeps
        the point through the two legs of its crossover and releases it once clear.
        """
        route_def = self.routes_map.get(train.get('routeDefinitionId')) or self.get_route_definition(train.get('route', [])) or {}
        required = set(route_def.get('requiredPointPositions', {}))
        segment = self.segments_map.get(segment_id, {})
        segment_nodes = {segment.get('startNodeId'), segment.get('endNodeId')}
        return required.intersection(segment_nodes)

    def _points_available_for_train(self, train, point_ids):
        owned = self.route_point_locks.get(train['id'], set())
        return not any(point_id in self.locked_resources and point_id not in owned for point_id in point_ids)

    def _lock_points_for_train(self, train, point_ids):
        if not point_ids:
            return
        owned = self.route_point_locks.setdefault(train['id'], set())
        owned.update(point_ids)
        self.locked_resources.update(point_ids)

    def _release_point_if_runtime_owned(self, train, point_id):
        owned = self.route_point_locks.get(train['id'], set())
        if point_id not in owned:
            return
        owned.discard(point_id)
        maintenance_owns_point = any(point_id in resources for resources in self.maintenance_resource_locks.values())
        if not maintenance_owns_point:
            self.locked_resources.discard(point_id)
        if not owned:
            self.route_point_locks.pop(train['id'], None)

    def _segment_unavailable(self, seg_id):
        seg = self.segments_map.get(seg_id, {})
        if seg.get('status') in ('FAULTY', 'MAINTENANCE'):
            return True
        if seg.get('oheIsolationGroup') in self.isolated_ohe_groups:
            return True
        if self.current_ai_priorities.get('weather') and seg.get('weather') == 'BAD':
            return True
        return False

    def set_maintenance_zone(self, zone_id, active):
        zone = next((z for z in self.network.get('maintenanceZones', []) if z['id'] == zone_id), None)
        if not zone:
            return False
        if active:
            self.active_maintenance_zones.add(zone_id)
            for seg_id in zone.get('affectedSegments', []):
                if seg_id in self.segments_map:
                    self.segments_map[seg_id]['status'] = 'MAINTENANCE'
                self.locked_resources.add(seg_id)
            for point_id in zone.get('affectedPoints', []):
                self.locked_resources.add(point_id)
            self.isolated_ohe_groups.update(zone.get('oheGroups', []))
            self.maintenance_resource_locks[zone_id] = set(zone.get('affectedSegments', []) + zone.get('affectedPoints', []))
        else:
            self.active_maintenance_zones.discard(zone_id)
            released = self.maintenance_resource_locks.pop(zone_id, set())
            for res_id in released:
                self.locked_resources.discard(res_id)
            for seg_id in zone.get('affectedSegments', []):
                if seg_id in self.segments_map and self.segments_map[seg_id].get('status') == 'MAINTENANCE':
                    self.segments_map[seg_id]['status'] = 'OPERATIONAL'
            active_groups = set()
            for active_id in self.active_maintenance_zones:
                az = next((z for z in self.network.get('maintenanceZones', []) if z['id'] == active_id), None)
                if az:
                    active_groups.update(az.get('oheGroups', []))
            self.isolated_ohe_groups = active_groups
        self.plan_needed = True
        return True

    def set_signal_state(self, node_id, state):
        """
        Set a node (signal) state in nodes_map & network copy so UI sees it.
        Valid states are strings like 'GREEN', 'RED', 'NORMAL' (switch), etc.
        """
        node_id = node_id.strip().upper()
        if node_id in self.locked_resources:
            print(f"⚠️ Point {node_id} is route-locked and cannot move.")
            return False
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
        op_state = self.network.get('operationalState', {})
        return {
            "timestamp": self.current_time_seconds,
            "network": self.network,
            "trains": self.active_trains,
            "activeConflicts": op_state.get('activeConflicts', []),
            "activeCrossovers": op_state.get('activeCrossovers', []),
        }

    def _resolve_data_path(self, suffix):
        code = self.section_code.lower()
        candidates = [f"{code}_{suffix}"]
        alias = STATION_ALIASES.get(code)
        if alias and alias != code:
            candidates.append(f"{alias}_{suffix}")
        
        for cand in candidates:
            # Check DATA_DIR
            p = os.path.join(DATA_DIR, cand)
            if os.path.exists(p):
                return p
            # Check relative data dir
            p_rel = os.path.join('.', 'data', cand)
            if os.path.exists(p_rel):
                return p_rel
        corridor_fallback = os.path.join(DATA_DIR, f"corridor_{suffix}")
        if os.path.exists(corridor_fallback):
            return corridor_fallback
        return os.path.join(DATA_DIR, candidates[0])

    def _load_network_layout(self):
        layout_path = self._resolve_data_path('layout.json')
        print(f"Attempting to load layout from: {layout_path}")
        try:
            with open(layout_path, 'r', encoding='utf-8') as f:
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
        csv_path = self._resolve_data_path('schedule.csv')
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
        matching_routes = [
            r for r in self.network.get('routes', [])
            if r.get('entrySignalId') == start_node and r.get('exitSignalId') == end_node
        ]
        if matching_routes:
            return [
                r['segments']
                for r in matching_routes
                if not any(self._segment_unavailable(seg_id) for seg_id in r.get('segments', []))
            ]
        node_paths = self._find_all_paths_bfs(start_node, end_node)
        return [self._convert_node_path_to_segment_path(p) for p in node_paths if p]

    def _find_all_paths_bfs(self, start, end, max_paths=6):
        start_node = self.nodes_map.get(start)
        end_node = self.nodes_map.get(end)
        desired_dir = None
        if start_node and end_node:
            if start_node['position']['x'] < end_node['position']['x']:
                desired_dir = 'EAST'
            elif start_node['position']['x'] > end_node['position']['x']:
                desired_dir = 'WEST'

        paths, queue = [], deque([[start]])
        while queue and len(paths) < max_paths:
            path = queue.popleft()
            if path[-1] == end:
                paths.append(path); continue
            if len(path) > 30: continue
            for neighbor in self.adjacency_list.get(path[-1], []):
                seg_id = neighbor['segment_id']
                if self._segment_unavailable(seg_id):
                    continue
                seg = self.segments_map.get(seg_id, {})
                seg_dir = seg.get('direction', 'BI')
                if desired_dir and seg_dir != 'BI' and seg_dir != desired_dir:
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

    def _convert_segment_path_to_node_path(self, segment_path, start_node=None):
        if not segment_path: return []
        first_segment = self.segments_map[segment_path[0]]
        if start_node in {first_segment['startNodeId'], first_segment['endNodeId']}:
            node_path = [start_node]
        else:
            node_path = [first_segment['startNodeId']]
        for seg_id in segment_path:
            segment = self.segments_map[seg_id]
            last_node = node_path[-1]
            if segment['startNodeId'] == last_node:
                node_path.append(segment['endNodeId'])
            else:
                node_path.append(segment['startNodeId'])
        return node_path

    def _spawn_trains(self):
        max_spawn_per_tick = 6
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
            if not train or train['state'] not in ('WAITING_PLAN', 'HOLD'): continue

            train['route'] = instruction['route']
            train['node_path'] = self._convert_segment_path_to_node_path(train['route'], train.get('start_node'))
            route_def = self.get_route_definition(train['route'])
            train['routeDefinitionId'] = route_def.get('id') if route_def else None
            train['priority'] = instruction.get('priority', train.get('priority', 1))
            train['planned_start_time'] = instruction.get('startTime', self.current_time_seconds)
            train['justification'] = instruction.get('justification', '')
            train['conflictInfo'] = instruction.get('conflictInfo')
            train['is_alternate_route'] = instruction.get('algorithmTrace', {}).get('isAlternateRoute', False)
            train['movementType'] = (route_def or {}).get('movementType', 'THROUGH')

            if instruction.get('action') == 'HOLD' and instruction.get('startTime', 0) > self.current_time_seconds:
                train['state'] = 'HOLD'
                if instruction.get('route'):
                    train['currentSegmentId'] = instruction['route'][0]
                    train['positionOnSegment'] = 0.0
                    train['speed_kph'] = 0
                print(f"  -> ⏸️ Plan for {train['id']}: HOLD until t={instruction['startTime']}s (delay {instruction['startTime'] - self.current_time_seconds}s).")
            else:
                train['state'] = 'READY_TO_PROCEED'
                print(f"  -> ✅ Plan for {train['id']} received. Is READY_TO_PROCEED.")

    def _update_train_positions(self):
        moved = []
        for train in list(self.active_trains):
            if train.get('state') != "RUNNING": continue

            travel_time = self.get_segment_travel_time(train.get('currentSegmentId'))
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
        # A point is released as soon as the train has cleared its outgoing leg;
        # it is never retained until the end of a corridor-length route.
        self._release_point_if_runtime_owned(train, cleared_node_id)
        self.plan_needed = True

        print(f"  -> ➡️ Train {train['id']} cleared {cleared_node_id} & {completed_segment_id}, arrived at {arrived_at_node_id}.")

        if current_route_index + 1 >= len(train['route']):
            final_node = train['node_path'][-1]
            self.locked_resources.discard(final_node)
            for resource_id in set(self.route_point_locks.pop(train['id'], set())):
                maintenance_owns_point = any(resource_id in resources for resources in self.maintenance_resource_locks.values())
                if not maintenance_owns_point:
                    self.locked_resources.discard(resource_id)
            print(f"✅ Train {train['id']} has EXITED. Final node {final_node} released.")
            train['state'] = 'EXITED'
            return

        if arrived_at_node_id.startswith("S-PF-") or "BERTH" in arrived_at_node_id or "PF-" in arrived_at_node_id:
            train['state'] = 'BOARDING_PASSENGERS'
            train['speed_kph'] = 0
            train['boarding_timer_ends_at'] = self.current_time_seconds + 12
            print(f"  -> boarding Train {train['id']} at {arrived_at_node_id}. Waiting for 12s.")
        else:
            train['state'] = 'STOPPED_AWAITING_CLEARANCE'
            train['speed_kph'] = 0
            train['waiting_since'] = self.current_time_seconds

    def _route_is_viable(self, segment_route, node_path, start_node_idx=0):
        # Runtime dispatch reserves only the next block and its immediate look-ahead.
        # Later blocks are evaluated again at their protecting signals, avoiding a
        # false "no route" when a distant train will clear before this one arrives.
        for seg_idx, seg_id in enumerate(segment_route[:2]):
            node_before = node_path[seg_idx]
            node_after = node_path[seg_idx + 1]

            if seg_idx != start_node_idx and node_before in self.locked_resources:
                return False

            seg = self.segments_map.get(seg_id, {})
            if seg_id in self.locked_resources:
                return False
            if self._segment_unavailable(seg_id):
                return False
            if node_after in self.locked_resources:
                return False
        return True

    def _score_route(self, route, node_path):
        score = sum(self.get_segment_travel_time(seg_id) for seg_id in route)
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
            node_path = self._convert_segment_path_to_node_path(route, current_node_id)
            if self._route_is_viable(route, node_path, start_node_idx=0):
                viable_routes.append((route, node_path))

        if not viable_routes:
            return False

        viable_routes.sort(key=lambda x: self._score_route(x[0], x[1]))
        chosen_route, chosen_node_path = viable_routes[0]

        first_segment = chosen_route[0]
        first_node_after = chosen_node_path[1]
        seg = self.segments_map.get(first_segment, {})

        route_def = self.get_route_definition(chosen_route)
        candidate_point_resources = set((route_def or {}).get('requiredPointPositions', {}).keys()).intersection({
            self.segments_map.get(first_segment, {}).get('startNodeId'),
            self.segments_map.get(first_segment, {}).get('endNodeId'),
        })
        if not self._points_available_for_train(train, candidate_point_resources):
            return False
        if first_segment not in self.locked_resources and first_node_after not in self.locked_resources and not self._segment_unavailable(first_segment):
            train['route'] = chosen_route
            train['node_path'] = chosen_node_path
            train['routeDefinitionId'] = route_def.get('id') if route_def else None
            self.locked_resources.add(first_segment)
            self.locked_resources.add(first_node_after)
            self._lock_points_for_train(train, candidate_point_resources)

            train['state'] = 'RUNNING'
            train['speed_kph'] = seg.get('permissibleSpeedKph', seg.get('maxSpeed', 60))
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
        # Check trains in HOLD: promote to READY_TO_PROCEED when planned start time is reached
        for train in self.active_trains:
            if train.get('state') == 'HOLD':
                if self.current_time_seconds >= train.get('planned_start_time', 0):
                    train['state'] = 'READY_TO_PROCEED'
                    print(f"  -> 🟢 HOLD released for Train {train['id']} at t={self.current_time_seconds}. Now READY_TO_PROCEED.")

        counts = {}
        for s in ['WAITING_PLAN', 'HOLD', 'READY_TO_PROCEED', 'RUNNING', 'STOPPED_AWAITING_CLEARANCE', 'BOARDING_PASSENGERS', 'EXITED']:
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
                if self._segment_unavailable(next_segment_id):
                    start_node = train['start_node']
                    rerouted = self._attempt_reroute_and_dispatch(train, start_node)
                    if not rerouted:
                        print(f"  -> ⛔ {train['id']} READY_TO_PROCEED: planned next segment {next_segment_id} is FAULTY; no alternate found.")
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

                point_resources = self._required_points_for_segment(train, next_segment_id)
                if next_segment_id not in self.locked_resources and next_node_id not in self.locked_resources and self._points_available_for_train(train, point_resources):
                    self.locked_resources.add(next_segment_id)
                    self.locked_resources.add(next_node_id)
                    self._lock_points_for_train(train, point_resources)
                    train['state'] = 'RUNNING'
                    train['speed_kph'] = seg.get('permissibleSpeedKph', seg.get('maxSpeed', 60))
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

                if self._segment_unavailable(next_segment_id):
                    current_node = train['node_path'][current_route_index + 1]
                    rerouted = self._attempt_reroute_and_dispatch(train, current_node)
                    if not rerouted:
                        print(f"  -> ⛔ STOPPED {train['id']} blocked at {current_node} because next segment {next_segment_id} is FAULTY.")
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

                point_resources = self._required_points_for_segment(train, next_segment_id)
                if next_segment_id not in self.locked_resources and next_node_id not in self.locked_resources and self._points_available_for_train(train, point_resources):
                    self.locked_resources.add(next_segment_id)
                    self.locked_resources.add(next_node_id)
                    self._lock_points_for_train(train, point_resources)
                    train['state'] = 'RUNNING'
                    train['speed_kph'] = seg.get('permissibleSpeedKph', seg.get('maxSpeed', 60))
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
        for zone in self.network.get('maintenanceZones', []):
            zone['active'] = zone['id'] in self.active_maintenance_zones

        active_conflicts = []
        for t in self.active_trains:
            if t.get('state') == 'HOLD':
                c_info = t.get('conflictInfo') or {}
                active_conflicts.append({
                    'trainId': t['id'],
                    'trainType': t['type'],
                    'priority': t.get('priority', 1),
                    'startNode': t.get('start_node'),
                    'contendedResource': c_info.get('contendedResource') or t.get('currentSegmentId'),
                    'conflictingTrainId': c_info.get('conflictingTrainId'),
                    'conflictingTrainType': c_info.get('conflictingTrainType'),
                    'conflictingTrainPriority': c_info.get('conflictingTrainPriority'),
                    'holdDurationSeconds': c_info.get('holdDurationSeconds', 0),
                    'heldUntil': t.get('planned_start_time', 0),
                    'secondsRemaining': max(0, int(t.get('planned_start_time', 0) - self.current_time_seconds)),
                    'resolution': c_info.get('resolution') or t.get('justification', ''),
                    'conflictType': c_info.get('conflictType', 'CONTENTION'),
                })

        active_crossovers = []
        for t in self.active_trains:
            if t.get('state') in ('RUNNING', 'STOPPED_AWAITING_CLEARANCE'):
                route = t.get('route') or []
                try:
                    current_index = route.index(t.get('currentSegmentId'))
                except ValueError:
                    current_index = -1
                # A crossover is active only while the train is on it or is in
                # the immediately protecting block—not merely because it occurs
                # somewhere later in the planned journey.
                active_window = route[max(0, current_index):current_index + 2] if current_index >= 0 else []
                xo_segs = [s for s in active_window if '-XO-' in s or (s in self.segments_map and self.segments_map[s].get('lineId') == 'CROSSOVER')]
                if xo_segs:
                    route_def = self.routes_map.get(t.get('routeDefinitionId')) or self.get_route_definition(route)
                    active_crossovers.append({
                        'trainId': t['id'],
                        'trainType': t['type'],
                        'routeId': (route_def or {}).get('id', t.get('routeDefinitionId')),
                        'crossoverSegments': xo_segs,
                        'pointPositions': (route_def or {}).get('requiredPointPositions', {}),
                        'movementType': t.get('movementType', (route_def or {}).get('movementType', 'MERGE_DIVERGE')),
                        'state': t.get('state'),
                        'currentSegment': t.get('currentSegmentId'),
                    })

        self.network['operationalState'] = {
            'activeMaintenanceZones': sorted(self.active_maintenance_zones),
            'isolatedOheGroups': sorted(self.isolated_ohe_groups),
            'lockedResourceCount': len(self.locked_resources),
            'activeConflicts': active_conflicts,
            'activeConflictCount': len(active_conflicts),
            'activeCrossovers': active_crossovers,
            'activeCrossoverCount': len(active_crossovers),
        }

    def tick(self):
        self.current_time_seconds += self.tick_rate * self.sim_speed
        self._spawn_trains()
        self._check_and_dispatch_trains()
        self._update_train_positions()
        self.active_trains = [t for t in self.active_trains if t.get('state') != 'EXITED']
