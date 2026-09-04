import sys
import math

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from ortools.sat.python import cp_model


class Optimizer:
    def __init__(self, simulation_instance):
        self.simulation = simulation_instance
        self.priorities = {
            'Vande Bharat': 10,
            'Rajdhani':     9,
            'Shatabdi':     8,
            'SF Express':   7,
            'Express':      6,
            'Mail':         5,
            'MEMU':         4,
            'DMU':          3,
            'Passenger':    2,
            'Freight':      1
        }
        print("[OPTIMIZER] Constraint Programming Dispatch Solver (OR-Tools CP-SAT) initialized.")

    def generate_plan(self, trains_to_plan, current_state, current_priorities):
        if not trains_to_plan:
            return []

        print(f"[OPTIMIZER] Solving time-space pathing for {len(trains_to_plan)} train(s)...")

        model = cp_model.CpModel()
        current_time = int(current_state.get('timestamp', 0))
        all_active_trains = current_state.get('trains', [])

        horizon = 7200
        max_time = int(current_time + horizon)

        tasks = {}
        route_choices = {}
        resource_intervals = {}

        # ---------------------------------------------------------------------
        # Step 1: Account for active running trains as fixed reservations
        # ---------------------------------------------------------------------
        for train in all_active_trains:
            if train.get('state') != 'RUNNING' or not train.get('route'):
                continue

            curr_seg_id = train.get('currentSegmentId')
            if not curr_seg_id:
                continue

            segment = self.simulation.segments_map.get(curr_seg_id)
            if not segment:
                continue

            travel_time_per_segment = 14
            pos = max(0.0, min(1.0, float(train.get('positionOnSegment', 0.0))))
            remaining_time = max(1, int(travel_time_per_segment * (1.0 - pos)))

            start_time = current_time
            end_time = start_time + remaining_time

            interval = model.NewIntervalVar(
                start_time,
                remaining_time,
                end_time,
                f"fixed_i_{train['id']}_{curr_seg_id}"
            )
            resource_intervals.setdefault(curr_seg_id, []).append(interval)

            prev_end = end_time
            try:
                curr_idx = train['route'].index(curr_seg_id)
            except ValueError:
                continue

            future_segments = train['route'][curr_idx + 1:]
            node_path = self.simulation._convert_segment_path_to_node_path(train['route'])

            for i, segment_id in enumerate(future_segments):
                junction_duration = 10
                j_start = prev_end
                j_end = j_start + junction_duration

                node_idx = curr_idx + i + 1
                if node_idx < len(node_path):
                    junction_node_id = node_path[node_idx]
                    j_interval = model.NewIntervalVar(
                        j_start,
                        junction_duration,
                        j_end,
                        f"fixed_ji_{train['id']}_{junction_node_id}"
                    )
                    resource_intervals.setdefault(junction_node_id, []).append(j_interval)

                seg_start = j_end
                seg_end = seg_start + travel_time_per_segment
                seg_interval = model.NewIntervalVar(
                    seg_start,
                    travel_time_per_segment,
                    seg_end,
                    f"fixed_i_{train['id']}_{segment_id}"
                )
                resource_intervals.setdefault(segment_id, []).append(seg_interval)
                prev_end = seg_end

        # ---------------------------------------------------------------------
        # Step 2: Decision variables for trains awaiting plan
        # ---------------------------------------------------------------------
        for train in trains_to_plan:
            train['possible_routes'] = self.simulation.find_all_possible_routes(
                train['start_node'],
                train['end_node']
            )

            if not train['possible_routes']:
                print(f"[WARN] No viable route geometry for Train {train['id']}.")
                continue

            train_id = train['id']
            route_choices[train_id] = []

            for i, route in enumerate(train['possible_routes']):
                choice_var = model.NewBoolVar(f"{train_id}_chooses_route_{i}")
                route_choices[train_id].append(choice_var)

                previous_end = model.NewIntVar(current_time, max_time, f"{train_id}_r{i}_start")
                node_path = self.simulation._convert_segment_path_to_node_path(route)

                for seg_idx, segment_id in enumerate(route):
                    travel_time = 14
                    start = model.NewIntVar(current_time, max_time, f"s_{train_id}_{i}_{seg_idx}")
                    end = model.NewIntVar(current_time, max_time, f"e_{train_id}_{i}_{seg_idx}")

                    interval = model.NewOptionalIntervalVar(
                        start,
                        travel_time,
                        end,
                        choice_var,
                        f"i_{train_id}_{i}_{seg_idx}"
                    )
                    resource_intervals.setdefault(segment_id, []).append(interval)
                    tasks[(train_id, segment_id, i)] = interval
                    model.Add(start >= previous_end)

                    if (seg_idx + 1) < len(node_path):
                        junction_node = node_path[seg_idx + 1]
                        j_duration = 10
                        j_start = end
                        j_end = model.NewIntVar(current_time, max_time, f"je_{train_id}_{i}_{seg_idx}")

                        j_interval = model.NewOptionalIntervalVar(
                            j_start,
                            j_duration,
                            j_end,
                            choice_var,
                            f"ji_{train_id}_{i}_{seg_idx}"
                        )
                        resource_intervals.setdefault(junction_node, []).append(j_interval)
                        tasks[(train_id, junction_node, i)] = j_interval
                        previous_end = j_end
                    else:
                        previous_end = end

            if route_choices.get(train_id):
                model.Add(sum(route_choices[train_id]) == 1)

        # ---------------------------------------------------------------------
        # Step 3: Mutually exclusive block occupancy constraints (NoOverlap)
        # ---------------------------------------------------------------------
        for resource_id, intervals in resource_intervals.items():
            if len(intervals) > 1:
                model.AddNoOverlap(intervals)

        # ---------------------------------------------------------------------
        # Step 4: Objective: Minimize weighted delay relative to current time
        # ---------------------------------------------------------------------
        total_weighted_delay = []

        for train in trains_to_plan:
            t_id = train['id']
            if t_id not in route_choices or not route_choices[t_id]:
                continue

            train_end_times = []
            for i, route in enumerate(train['possible_routes']):
                node_path = self.simulation._convert_segment_path_to_node_path(route)
                last_resource = node_path[-1] if (t_id, node_path[-1], i) in tasks else route[-1]

                if (t_id, last_resource, i) in tasks:
                    train_end_times.append(tasks[(t_id, last_resource, i)].EndExpr())

            if train_end_times:
                train_end = model.NewIntVar(current_time, max_time, f"{t_id}_end")
                model.AddMaxEquality(train_end, train_end_times)

                base_priority = self.priorities.get(train.get('type'), 1) if current_priorities.get('trainType') else 1
                runtime_boost = int(train.get('dynamic_priority', 0))

                punctuality_boost = 0
                if current_priorities.get('punctuality'):
                    sched = train.get('scheduled_arrival')
                    if sched is not None:
                        lateness = int(current_time - sched)
                        if lateness > 0:
                            punctuality_boost = int(lateness / 60)

                weight = max(1, base_priority + runtime_boost + punctuality_boost)
                total_weighted_delay.append((train_end - current_time) * weight)

        if total_weighted_delay:
            model.Minimize(sum(total_weighted_delay))

        # ---------------------------------------------------------------------
        # Step 5: Execute CP-SAT Solver
        # ---------------------------------------------------------------------
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = 0.8
        solver.parameters.num_search_workers = 4

        status = solver.Solve(model)
        status_name = solver.StatusName(status)
        print(f"[SOLVER] Status: {status_name} (Search wall time: {solver.WallTime():.2f}s)")

        # ---------------------------------------------------------------------
        # Step 6: Plan extraction with deterministic greedy fallback
        # ---------------------------------------------------------------------
        if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            plan = []
            for train in trains_to_plan:
                t_id = train['id']
                if t_id not in route_choices:
                    continue

                for i, choice_var in enumerate(route_choices[t_id]):
                    if solver.Value(choice_var) == 1:
                        chosen_route = train['possible_routes'][i]
                        first_segment = chosen_route[0]
                        start_time = int(solver.Value(tasks[(t_id, first_segment, i)].StartExpr()))
                        action = "PROCEED" if start_time <= current_time else "HOLD"

                        plan.append({
                            "trainId": t_id,
                            "action": action,
                            "route": chosen_route,
                            "startTime": start_time,
                            "priority": self.priorities.get(train.get('type'), 1)
                        })
                        print(f"[PLAN] Train {t_id} -> {action} via {first_segment} @ T+{max(0, start_time - current_time)}s.")
                        break
            return plan

        print("[WARN] CP-SAT timeout/infeasible. Executing topological sorting fallback...")
        return self._fallback_priority_dispatch(trains_to_plan, current_time)

    def _fallback_priority_dispatch(self, trains_to_plan, current_time):
        plan = []
        sorted_trains = sorted(
            trains_to_plan,
            key=lambda t: self.priorities.get(t.get('type'), 1),
            reverse=True
        )

        occupied = set(self.simulation.locked_resources)

        for train in sorted_trains:
            routes = train.get('possible_routes') or self.simulation.find_all_possible_routes(
                train['start_node'],
                train['end_node']
            )
            if not routes:
                continue

            chosen_route = routes[0]
            first_seg = chosen_route[0]

            if first_seg not in occupied:
                action = "PROCEED"
                start_time = current_time
                occupied.add(first_seg)
            else:
                action = "HOLD"
                start_time = current_time + 30

            plan.append({
                "trainId": train['id'],
                "action": action,
                "route": chosen_route,
                "startTime": start_time,
                "priority": self.priorities.get(train.get('type'), 1)
            })
            print(f"[FALLBACK] Train {train['id']} -> {action} via {first_seg}.")

        return plan