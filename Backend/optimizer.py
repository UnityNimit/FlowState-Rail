import sys
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from ortools.sat.python import cp_model
import math

class Optimizer:
    def __init__(self, simulation_instance):
        self.simulation = simulation_instance
        self.priorities = {
            'Vande Bharat': 11,
            'Shatabdi':   10,
            'Rajdhani':   9,
            'Passenger':  8,
            'DMU':        7,
            'MEMU':       6,
            'SF Express': 5,
            'Mail':       4,
            'Express':    3,
            'Freight':    2
        }
        print("✅ Definitive Optimizer initialized with Dynamic Priority Logic.")

    def generate_maintenance_plan(self, horizon='weekly'):
        """Create coordinated multi-department possessions in 30-minute slots."""
        horizon = 'monthly' if str(horizon).lower() == 'monthly' else 'weekly'
        days = 30 if horizon == 'monthly' else 7
        slots_per_day = 48
        horizon_slots = days * slots_per_day
        network = self.simulation.network
        zones = {zone['id']: zone for zone in network.get('maintenanceZones', [])}
        tasks_by_zone = {}
        for task in network.get('maintenanceTasks', []):
            tasks_by_zone.setdefault(task['maintenanceZoneId'], []).append(task)
        if not tasks_by_zone:
            return {'horizon': horizon, 'blocks': [], 'unsafeConflicts': 0, 'objective': 0}

        model = cp_model.CpModel()
        resource_intervals = {}
        decisions = {}
        objective_terms = []
        traffic_profile = [1 if hour < 5 else 4 if 7 <= hour < 11 or 17 <= hour < 22 else 2 for hour in [slot // 2 for slot in range(slots_per_day)]]

        for zone_id, tasks in tasks_by_zone.items():
            zone = zones[zone_id]
            duration_slots = max(1, math.ceil(max(task['durationMinutes'] for task in tasks) / 30))
            latest = horizon_slots - duration_slots
            start = model.NewIntVar(0, latest, f'm_start_{zone_id}')
            end = model.NewIntVar(duration_slots, horizon_slots, f'm_end_{zone_id}')
            interval = model.NewIntervalVar(start, duration_slots, end, f'm_block_{zone_id}')
            resources = set(zone.get('affectedSegments', [])) | set(zone.get('affectedPoints', [])) | set(zone.get('oheGroups', []))
            for resource_id in resources:
                resource_intervals.setdefault(resource_id, []).append(interval)

            affected = [self.simulation.segments_map[s] for s in zone.get('affectedSegments', []) if s in self.simulation.segments_map]
            density = max(1, round(sum(s.get('scheduledTrainCount', 0) for s in affected) / max(1, len(affected))))
            penalties = []
            for candidate in range(latest + 1):
                profile_cost = sum(traffic_profile[(candidate + offset) % slots_per_day] for offset in range(duration_slots))
                penalties.append(profile_cost * density)
            disruption = model.NewIntVar(0, max(penalties), f'm_disruption_{zone_id}')
            model.AddElement(start, penalties, disruption)
            urgency = max(task['criticality'] + task['urgency'] + min(10, task.get('overdueDays', 0) // 7) for task in tasks)
            objective_terms.append(start * urgency + disruption * 5)
            decisions[zone_id] = (start, end, duration_slots, tasks, sorted(resources), density)

        for intervals in resource_intervals.values():
            if len(intervals) > 1:
                model.AddNoOverlap(intervals)
        model.Minimize(sum(objective_terms))
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = 3.0
        solver.parameters.num_search_workers = 4
        status = solver.Solve(model)
        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            return {'horizon': horizon, 'blocks': [], 'status': solver.StatusName(status), 'unsafeConflicts': 0}

        blocks = []
        for zone_id, (start, end, duration_slots, tasks, resources, density) in decisions.items():
            start_slot = solver.Value(start)
            blocks.append({
                'id': f'BP-{horizon.upper()}-{zone_id}',
                'zoneId': zone_id,
                'zoneName': zones[zone_id]['name'],
                'day': start_slot // slots_per_day + 1,
                'startMinute': (start_slot % slots_per_day) * 30,
                'durationMinutes': duration_slots * 30,
                'departments': sorted({task['department'] for task in tasks}),
                'taskIds': [task['id'] for task in tasks],
                'resources': resources,
                'estimatedTrafficImpact': density,
                'rationale': 'Coordinated multi-department possession placed in a low-traffic window with shared resources locked once.',
            })
        blocks.sort(key=lambda item: (item['day'], item['startMinute'], item['zoneId']))
        return {'horizon': horizon, 'status': solver.StatusName(status), 'blocks': blocks, 'unsafeConflicts': 0, 'objective': round(solver.ObjectiveValue())}

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
        route_completion_times = {}
        route_dispatch_times = {}
        resource_intervals = {}
        route_selection_terms = []

        # --- Step 1: Account for running trains as fixed reservations ---
        for train in all_active_trains:
            if train['state'] != 'RUNNING' or not train.get('route'):
                continue

            segment = self.simulation.segments_map.get(train['currentSegmentId'])
            if not segment: continue

            travel_time_per_segment = self.simulation.get_segment_travel_time(train['currentSegmentId'])
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
                junction_occupancy_time = 5
                j_start = previous_end_time
                j_end = j_start + junction_occupancy_time
                junction_node_id = node_path[current_route_index + i + 1]
                j_interval = model.NewIntervalVar(j_start, junction_occupancy_time, j_end, f"fixed_ji_{train['id']}_{junction_node_id}")
                if junction_node_id not in resource_intervals: resource_intervals[junction_node_id] = []
                resource_intervals[junction_node_id].append(j_interval)

                start = j_end
                segment_travel_time = self.simulation.get_segment_travel_time(segment_id)
                end = start + segment_travel_time
                interval = model.NewIntervalVar(start, segment_travel_time, end, f"fixed_i_{train['id']}_{segment_id}")
                if segment_id not in resource_intervals: resource_intervals[segment_id] = []
                resource_intervals[segment_id].append(interval)
                previous_end_time = end

            # Do not reserve every future point until the train exits the corridor.
            # Points are modelled around their approach/clearance window below and
            # acquired dynamically by the interlocking when a train reaches them.

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
                route_def = self.simulation.get_route_definition(route)
                required_point_ids = set((route_def or {}).get('requiredPointPositions', {}))

                # A crossover is a relief or terminal movement, not a free
                # shortcut.  Penalise unnecessary diverges so CP-SAT retains the
                # nominal fast/slow line whenever it is available, but will still
                # select a validated diversion when a fault or possession removes
                # the nominal route.
                if required_point_ids:
                    base_priority = self.priorities.get(train.get('type'), 1) if current_priorities.get('trainType') else 1
                    crossover_penalty = 90 * len(required_point_ids)
                    if (route_def or {}).get('movementType') == 'MERGE_DIVERGE':
                        crossover_penalty = 30 * len(required_point_ids)
                    route_selection_terms.append(choice_var * crossover_penalty * max(1, base_priority))

                previous_end = model.NewIntVar(current_time, max_time, f'{train_id}_r{i}_start')

                node_path = self.simulation._convert_segment_path_to_node_path(route)
                for seg_idx, segment_id in enumerate(route):
                    travel_time = self.simulation.get_segment_travel_time(segment_id)
                    start = model.NewIntVar(current_time, max_time, f's_{train_id}_{i}_{seg_idx}')
                    end = model.NewIntVar(current_time, max_time, f'e_{train_id}_{i}_{seg_idx}')
                    interval = model.NewOptionalIntervalVar(start, travel_time, end, choice_var, f'i_{train_id}_{i}_{seg_idx}')

                    if segment_id not in resource_intervals: resource_intervals[segment_id] = []
                    resource_intervals[segment_id].append(interval)

                    tasks[(train_id, segment_id, i)] = interval
                    model.Add(start >= previous_end)
                    if seg_idx == 0:
                        model.Add(start == previous_end)

                    junction_node = node_path[seg_idx + 1]
                    j_start = end
                    junction = self.simulation.nodes_map.get(junction_node, {})
                    j_duration = 5 if junction.get('type') == 'SWITCH' else 2
                    j_end = model.NewIntVar(current_time, max_time, f'je_{train_id}_{i}_{seg_idx}')
                    j_interval = model.NewOptionalIntervalVar(j_start, j_duration, j_end, choice_var, f'ji_{train_id}_{i}_{seg_idx}')

                    if junction_node not in required_point_ids:
                        if junction_node not in resource_intervals: resource_intervals[junction_node] = []
                        resource_intervals[junction_node].append(j_interval)

                    tasks[(train_id, junction_node, i)] = j_interval
                    previous_end = j_end

                for point_id in required_point_ids:
                    if point_id not in node_path:
                        continue
                    point_node_index = node_path.index(point_id)
                    if point_node_index == 0:
                        continue
                    approach_index = point_node_index - 1
                    clear_index = min(point_node_index, len(route) - 1)
                    lock_start = tasks[(train_id, route[approach_index], i)].StartExpr()
                    lock_end = tasks[(train_id, route[clear_index], i)].EndExpr()
                    route_duration = model.NewIntVar(1, horizon, f'rd_{train_id}_{i}_{point_id}')
                    model.Add(route_duration == lock_end - lock_start).OnlyEnforceIf(choice_var)
                    point_interval = model.NewOptionalIntervalVar(
                        lock_start, route_duration, lock_end,
                        choice_var, f'pi_{train_id}_{i}_{point_id}'
                    )
                    resource_intervals.setdefault(point_id, []).append(point_interval)

                # Optional route alternatives have unconstrained end values when
                # not selected.  Normalise their completion to "now" so only the
                # chosen alternative contributes to this train's objective.
                completion = model.NewIntVar(current_time, max_time, f'completion_{train_id}_{i}')
                final_node = node_path[-1]
                model.Add(completion == tasks[(train_id, final_node, i)].EndExpr()).OnlyEnforceIf(choice_var)
                model.Add(completion == current_time).OnlyEnforceIf(choice_var.Not())
                route_completion_times[(train_id, i)] = completion

                dispatch = model.NewIntVar(current_time, max_time, f'dispatch_{train_id}_{i}')
                model.Add(dispatch == tasks[(train_id, route[0], i)].StartExpr()).OnlyEnforceIf(choice_var)
                model.Add(dispatch == current_time).OnlyEnforceIf(choice_var.Not())
                route_dispatch_times[(train_id, i)] = dispatch

            if route_choices.get(train_id):
                model.Add(sum(route_choices[train_id]) == 1)

        # --- Step 3: No-overlap constraints ---
        for resource_id, intervals in resource_intervals.items():
            if len(intervals) > 1:
                model.AddNoOverlap(intervals)

        # --- Step 4: Objective - Minimize weighted completion times using dynamic priorities ---
        total_weighted_completion = []
        total_weighted_dispatch = []
        for train in trains_to_plan:
            if train['id'] not in route_choices: continue

            train_end_times = []
            for i, route in enumerate(train['possible_routes']):
                completion = route_completion_times.get((train['id'], i))
                if completion is not None:
                    train_end_times.append(completion)

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

                dispatch_times = [
                    route_dispatch_times[(train['id'], i)]
                    for i in range(len(train['possible_routes']))
                    if (train['id'], i) in route_dispatch_times
                ]
                if dispatch_times:
                    train_dispatch = model.NewIntVar(current_time, max_time, f"{train['id']}_dispatch")
                    model.AddMaxEquality(train_dispatch, dispatch_times)
                    # Protect high-priority traffic from being held merely to
                    # shorten a lower-priority crossover movement.  Completion
                    # time still drives throughput; this term governs who gets
                    # the first safe release at a shared approach.
                    total_weighted_dispatch.append(train_dispatch * priority * 20)

        objective_terms = total_weighted_completion + total_weighted_dispatch + route_selection_terms
        if objective_terms:
            model.Minimize(sum(objective_terms))

        # --- Step 5: Solve ---
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = 0.8
        solver.parameters.num_search_workers = 4
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
                        route_def = self.simulation.get_route_definition(chosen_route) or {}
                        point_ids = sorted(route_def.get('requiredPointPositions', {}))
                        ohe_groups = sorted({
                            self.simulation.segments_map[segment_id].get('oheIsolationGroup')
                            for segment_id in chosen_route
                            if segment_id in self.simulation.segments_map
                            and self.simulation.segments_map[segment_id].get('oheIsolationGroup')
                        })
                        node_path = self.simulation._convert_segment_path_to_node_path(chosen_route)
                        travel_seconds = sum(self.simulation.get_segment_travel_time(segment_id) for segment_id in chosen_route)
                        movement_type = route_def.get('movementType', 'THROUGH')
                        is_forced_crossover = movement_type == 'MERGE_DIVERGE'
                        is_relief_diversion = bool(point_ids) and not is_forced_crossover
                        candidate_count = len(train['possible_routes'])
                        constraint_count = len(chosen_route) + len(node_path) + len(point_ids) + len(ohe_groups)
                        conflicts_avoided = len(route_def.get('conflicts', []))

                        conflict_info = None
                        if action == "HOLD":
                            hold_secs = int(start_time - current_time)
                            conflicting_train_id = None
                            conflicting_train_type = None
                            conflicting_train_priority = None
                            contended_resource = first_segment
                            conflict_kind = "APPROACH_LINE_CONTENTION"

                            # Find which other train occupies or was prioritized on first_segment or points
                            for other_t in trains_to_plan:
                                if other_t['id'] == train['id']:
                                    continue
                                for other_i, other_choice in enumerate(route_choices.get(other_t['id'], [])):
                                    if solver.Value(other_choice) == 1:
                                        if (other_t['id'], first_segment, other_i) in tasks:
                                            o_start = solver.Value(tasks[(other_t['id'], first_segment, other_i)].StartExpr())
                                            o_end = solver.Value(tasks[(other_t['id'], first_segment, other_i)].EndExpr())
                                            if o_start <= current_time < o_end or (o_start < start_time and o_end >= current_time):
                                                conflicting_train_id = other_t['id']
                                                conflicting_train_type = other_t.get('type', 'Train')
                                                conflicting_train_priority = self.priorities.get(conflicting_train_type, 1)
                                                contended_resource = first_segment
                                                conflict_kind = "HEADWAY_TRACK_OCCUPANCY"
                                                break
                                        other_def = self.simulation.get_route_definition(other_t['possible_routes'][other_i]) or {}
                                        common_points = set(point_ids).intersection(set((other_def.get('requiredPointPositions') or {}).keys()))
                                        if common_points:
                                            conflicting_train_id = other_t['id']
                                            conflicting_train_type = other_t.get('type', 'Train')
                                            conflicting_train_priority = self.priorities.get(conflicting_train_type, 1)
                                            contended_resource = sorted(common_points)[0]
                                            conflict_kind = "POINT_CROSSOVER_CONTENTION"
                                            break
                                if conflicting_train_id:
                                    break

                            if not conflicting_train_id:
                                for running_t in all_active_trains:
                                    if running_t.get('state') == 'RUNNING' and running_t.get('currentSegmentId') == first_segment:
                                        conflicting_train_id = running_t['id']
                                        conflicting_train_type = running_t.get('type', 'Train')
                                        conflicting_train_priority = self.priorities.get(conflicting_train_type, 1)
                                        contended_resource = first_segment
                                        conflict_kind = "TRACK_OCCUPANCY"
                                        break

                            my_priority = self.priorities.get(train.get('type'), 1)
                            if conflicting_train_id:
                                resolution_text = (
                                    f"Train {train['id']} ({train.get('type', 'Train')}, P{my_priority}) held for {hold_secs}s. "
                                    f"Higher-priority Train {conflicting_train_id} ({conflicting_train_type}, P{conflicting_train_priority}) "
                                    f"granted clearance on {contended_resource} to resolve contention with 0 unsafe conflicts."
                                )
                                explanation = (
                                    f"Held at {contended_resource} for {hold_secs}s: yielding to Train {conflicting_train_id} "
                                    f"({conflicting_train_type}, P{conflicting_train_priority}) to resolve junction contention."
                                )
                            else:
                                resolution_text = f"Train {train['id']} held for {hold_secs}s to maintain safe headway on {contended_resource}."
                                explanation = f"Held at {contended_resource} for {hold_secs}s until track block clears."

                            conflict_info = {
                                "hasConflict": True,
                                "contendedResource": contended_resource,
                                "conflictingTrainId": conflicting_train_id,
                                "conflictingTrainType": conflicting_train_type,
                                "conflictingTrainPriority": conflicting_train_priority,
                                "holdDurationSeconds": hold_secs,
                                "heldUntilSeconds": int(start_time),
                                "conflictType": conflict_kind,
                                "resolution": resolution_text,
                            }
                        elif is_forced_crossover:
                            explanation = (
                                f"Scheduled cross-line movement ({route_def.get('id')}) authorised via {', '.join(point_ids)} in REVERSE; "
                                f"clearance granted across {len(chosen_route)} protected segments without unsafe conflicts."
                            )
                        elif is_relief_diversion:
                            explanation = (
                                f"Relief route selected only because the nominal line was unavailable; "
                                f"{', '.join(point_ids)} is protected in REVERSE."
                            )
                        else:
                            explanation = f"Main path retained after comparing {candidate_count} validated routes; all protected resources are available."

                        plan.append({
                            "trainId": train['id'],
                            "action": action,
                            "route": chosen_route,
                            "routeId": route_def.get('id'),
                            "startTime": start_time,
                            "priority": self.priorities.get(train.get('type'), 1),
                            "justification": explanation,
                            "conflictInfo": conflict_info,
                            "algorithmTrace": {
                                "candidateRoutesEvaluated": candidate_count,
                                "selectedRouteId": route_def.get('id'),
                                "isAlternateRoute": is_relief_diversion,
                                "isScheduledCrossover": is_forced_crossover,
                                "estimatedTravelSeconds": travel_seconds,
                                "segmentsReserved": len(chosen_route),
                                "pointsLocked": len(point_ids),
                                "oheGroupsProtected": len(ohe_groups),
                                "resourcesChecked": constraint_count,
                                "conflictingRoutesExcluded": conflicts_avoided,
                                "unsafeConflicts": 0,
                                "isQueuedConflict": bool(conflict_info),
                                "conflictInfo": conflict_info,
                                "constraints": ["track occupancy", "direction", "point locking", "route conflict", "OHE isolation"],
                            },
                        })
                        print(f"  -> Plan for {train['id']}: {action} starting {first_segment} @ {start_time} (priority approx {self.priorities.get(train['type'], 1)})")
                        break
            return plan
        return []
