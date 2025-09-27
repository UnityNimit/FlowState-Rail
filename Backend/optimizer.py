from ortools.sat.python import cp_model
import math

class Optimizer:
    def __init__(self, simulation_instance):
        self.simulation = simulation_instance
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
        print("✅ Definitive Optimizer initialized with Dynamic Priority Logic.")

    def generate_plan(self, trains_to_plan, current_state, current_priorities):
        print(f"🧠 Optimizer: Planning for {len(trains_to_plan)} train(s) with priorities: {current_priorities}")
        if not trains_to_plan:
            return []

        model = cp_model.CpModel()
        current_time = current_state['timestamp']
        all_active_trains = current_state['trains']

        horizon = 7200
        max_time = int(current_time + horizon)

        tasks = {}
        route_choices = {}
        resource_intervals = {}

        # --- Step 1: Account for running trains as fixed reservations ---
        for train in all_active_trains:
            if train['state'] != 'RUNNING' or not train.get('route'):
                continue

            segment = self.simulation.segments_map.get(train['currentSegmentId'])
            if not segment: continue

            travel_time_per_segment = 30
            remaining_time_on_segment = int(travel_time_per_segment * (1 - train['positionOnSegment']))

            start_time = int(current_time)
            end_time = start_time + remaining_time_on_segment
            interval = model.NewIntervalVar(start_time, remaining_time_on_segment, end_time, f"fixed_i_{train['id']}_{train['currentSegmentId']}")
            if train['currentSegmentId'] not in resource_intervals: resource_intervals[train['currentSegmentId']] = []
            resource_intervals[train['currentSegmentId']].append(interval)

            previous_end_time = end_time
            current_route_index = train['route'].index(train['currentSegmentId'])
            future_segments = train['route'][current_route_index + 1:]
            node_path = self.simulation._convert_segment_path_to_node_path(train['route'])

            for i, segment_id in enumerate(future_segments):
                junction_occupancy_time = 10
                j_start = previous_end_time
                j_end = j_start + junction_occupancy_time
                junction_node_id = node_path[current_route_index + i + 1]
                j_interval = model.NewIntervalVar(j_start, junction_occupancy_time, j_end, f"fixed_ji_{train['id']}_{junction_node_id}")
                if junction_node_id not in resource_intervals: resource_intervals[junction_node_id] = []
                resource_intervals[junction_node_id].append(j_interval)

                start = j_end
                end = start + travel_time_per_segment
                interval = model.NewIntervalVar(start, travel_time_per_segment, end, f"fixed_i_{train['id']}_{segment_id}")
                if segment_id not in resource_intervals: resource_intervals[segment_id] = []
                resource_intervals[segment_id].append(interval)
                previous_end_time = end

        # --- Step 2: Decision variables for trains WAITING_PLAN ---
        for train in trains_to_plan:
            train['possible_routes'] = self.simulation.find_all_possible_routes(train['start_node'], train['end_node'])
            if not train['possible_routes']:
                print(f"⚠️ No routes found for train {train['id']}. It will remain waiting.")
                continue

            train_id = train['id']
            route_choices[train_id] = []

            for i, route in enumerate(train['possible_routes']):
                choice_var = model.NewBoolVar(f'{train_id}_chooses_route_{i}')
                route_choices[train_id].append(choice_var)

                previous_end = model.NewIntVar(current_time, max_time, f'{train_id}_r{i}_start')

                node_path = self.simulation._convert_segment_path_to_node_path(route)
                for seg_idx, segment_id in enumerate(route):
                    travel_time = 30
                    start = model.NewIntVar(current_time, max_time, f's_{train_id}_{i}_{seg_idx}')
                    end = model.NewIntVar(current_time, max_time, f'e_{train_id}_{i}_{seg_idx}')
                    interval = model.NewOptionalIntervalVar(start, travel_time, end, choice_var, f'i_{train_id}_{i}_{seg_idx}')

                    if segment_id not in resource_intervals: resource_intervals[segment_id] = []
                    resource_intervals[segment_id].append(interval)

                    tasks[(train_id, segment_id, i)] = interval
                    model.Add(start >= previous_end)

                    junction_node = node_path[seg_idx + 1]
                    j_start = end
                    j_duration = 10
                    j_end = model.NewIntVar(current_time, max_time, f'je_{train_id}_{i}_{seg_idx}')
                    j_interval = model.NewOptionalIntervalVar(j_start, j_duration, j_end, choice_var, f'ji_{train_id}_{i}_{seg_idx}')

                    if junction_node not in resource_intervals: resource_intervals[junction_node] = []
                    resource_intervals[junction_node].append(j_interval)

                    tasks[(train_id, junction_node, i)] = j_interval
                    previous_end = j_end

            if route_choices.get(train_id):
                model.Add(sum(route_choices[train_id]) == 1)

        # --- Step 3: No-overlap constraints ---
        for resource_id, intervals in resource_intervals.items():
            if len(intervals) > 1:
                model.AddNoOverlap(intervals)

        # --- Step 4: Objective - Minimize weighted completion times using dynamic priorities ---
        total_weighted_completion = []
        for train in trains_to_plan:
            if train['id'] not in route_choices: continue

            train_end_times = []
            for i, route in enumerate(train['possible_routes']):
                last_node = self.simulation._convert_segment_path_to_node_path(route)[-1]
                if (train['id'], last_node, i) in tasks:
                    train_end_times.append(tasks[(train['id'], last_node, i)].EndExpr())

            if train_end_times:
                train_end = model.NewIntVar(current_time, max_time, f"{train['id']}_end")
                model.AddMaxEquality(train_end, train_end_times)

                # determine dynamic priority value
                # 1) base type priority
                base_priority = self.priorities.get(train.get('type'), 1) if current_priorities.get('trainType') else 1
                # 2) traineruntime boost if present (the simulation may pass it in 'dynamic_priority')
                runtime_boost = int(train.get('dynamic_priority', 0))
                # 3) punctuality boost if enabled
                punctuality_boost = 0
                if current_priorities.get('punctuality'):
                    scheduled = train.get('scheduled_arrival')
                    if scheduled is not None:
                        lateness = int(current_time - scheduled)
                        if lateness > 0:
                            punctuality_boost = int(lateness / 60)

                priority = base_priority + runtime_boost + punctuality_boost

                # safety clamp
                if priority < 1: priority = 1

                total_weighted_completion.append(train_end * priority)

        if total_weighted_completion:
            model.Minimize(sum(total_weighted_completion))

        # --- Step 5: Solve ---
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = 10.0
        status = solver.Solve(model)
        print(f"🧠 Optimizer: Solver finished with status: {solver.StatusName(status)}")

        # --- Step 6: Extract plan ---
        if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            plan = []
            for train in trains_to_plan:
                if train['id'] not in route_choices: continue
                for i, choice_var in enumerate(route_choices[train['id']]):
                    if solver.Value(choice_var) == 1:
                        chosen_route = train['possible_routes'][i]
                        first_segment = chosen_route[0]
                        start_time = solver.Value(tasks[(train['id'], first_segment, i)].StartExpr())

                        action = "PROCEED" if start_time <= current_time else "HOLD"

                        plan.append({
                            "trainId": train['id'],
                            "action": action,
                            "route": chosen_route,
                            "startTime": start_time
                        })
                        print(f"  -> Plan for {train['id']}: {action} starting {first_segment} @ {start_time} (priority approx {self.priorities.get(train['type'], 1)})")
                        break
            return plan
        return []
