def _pid_num(pid):
    digits = "".join(c for c in pid if c.isdigit())
    return int(digits) if digits else 0


def _merge_segments(raw):
    """Collapse consecutive 1-unit slices of the same pid into one block."""
    merged = []
    for seg in raw:
        if merged and merged[-1]["pid"] == seg["pid"] and merged[-1]["end"] == seg["start"]:
            merged[-1]["end"] = seg["end"]
        else:
            merged.append(dict(seg))
    return merged


def _report(processes, segments, events):
    finish, first_start = {}, {}
    for seg in segments:
        if seg["pid"] == "IDLE":
            continue
        finish[seg["pid"]] = seg["end"]
        first_start.setdefault(seg["pid"], seg["start"])

    table, total_wait, total_turn = [], 0, 0
    for p in processes:
        end = finish[p["pid"]]
        turnaround = end - p["arrival"]
        waiting = turnaround - p["burst"]
        table.append({
            "pid": p["pid"], "arrival": p["arrival"], "burst": p["burst"],
            "priority": p.get("priority", 1),
            "start": first_start[p["pid"]], "end": end,
            "waiting": waiting, "turnaround": turnaround,
        })
        total_wait += waiting
        total_turn += turnaround

    table.sort(key=lambda r: _pid_num(r["pid"]))
    n = len(processes)
    span = max((s["end"] for s in segments), default=0)
    busy = sum(s["end"] - s["start"] for s in segments if s["pid"] != "IDLE")

    return {
        "segments": segments,
        "events": events,
        "table": table,
        "avg_waiting": round(total_wait / n, 2) if n else 0.0,
        "avg_turnaround": round(total_turn / n, 2) if n else 0.0,
        "cpu_utilization": round((busy / span * 100) if span else 0.0, 2),
    }


def _idle(segments, events, clock, until):
    if until > clock:
        segments.append({"pid": "IDLE", "start": clock, "end": until})
        events.append(f"t={clock}  CPU idle until t={until}")
        return until
    return clock


# --------------------------------------------------------- non-preemptive --
def fcfs(processes, **_):
    procs = sorted(processes, key=lambda p: (p["arrival"], _pid_num(p["pid"])))
    clock, segments, events = 0, [], []
    for p in procs:
        clock = _idle(segments, events, clock, p["arrival"])
        end = clock + p["burst"]
        segments.append({"pid": p["pid"], "start": clock, "end": end})
        events.append(f"t={clock}  dispatch {p['pid']} (burst={p['burst']}) -> runs to t={end}")
        clock = end
    return _report(processes, segments, events)


def _non_preemptive_by_key(processes, key_fn, describe):
    remaining, clock, segments, events = list(processes), 0, [], []
    while remaining:
        ready = [p for p in remaining if p["arrival"] <= clock]
        if not ready:
            clock = _idle(segments, events, clock, min(p["arrival"] for p in remaining))
            continue
        chosen = min(ready, key=lambda p: (key_fn(p), p["arrival"], _pid_num(p["pid"])))
        end = clock + chosen["burst"]
        segments.append({"pid": chosen["pid"], "start": clock, "end": end})
        events.append(describe(chosen, ready, clock, end))
        clock = end
        remaining.remove(chosen)
    return _report(processes, segments, events)


def sjf_non_preemptive(processes, **_):
    return _non_preemptive_by_key(
        processes, key_fn=lambda p: p["burst"],
        describe=lambda c, ready, t, e: (
            f"t={t}  {c['pid']} has the shortest burst ({c['burst']}) among "
            f"{[r['pid'] for r in ready]} -> dispatch, runs to t={e}"
        ),
    )


def priority_non_preemptive(processes, **_):
    return _non_preemptive_by_key(
        processes, key_fn=lambda p: p["priority"],
        describe=lambda c, ready, t, e: (
            f"t={t}  {c['pid']} has top priority ({c['priority']}) among "
            f"{[r['pid'] for r in ready]} -> dispatch, runs to t={e}"
        ),
    )


# ------------------------------------------------------------- preemptive --
def _preemptive_simulate(processes, key_fn):
    """1ms-tick simulation with preemption; ties broken by arrival then pid."""
    remaining = {p["pid"]: p["burst"] for p in processes}
    n, completed, clock = len(processes), 0, 0
    raw, events, running = [], [], None
    horizon = sum(p["burst"] for p in processes) + max(p["arrival"] for p in processes) + 1

    while completed < n and clock <= horizon:
        ready = [p for p in processes if p["arrival"] <= clock and remaining[p["pid"]] > 0]
        if not ready:
            raw.append({"pid": "IDLE", "start": clock, "end": clock + 1})
            if running is not None:
                events.append(f"t={clock}  CPU idle")
            running = "IDLE"
            clock += 1
            continue

        chosen = min(ready, key=lambda p: (key_fn(p, remaining[p["pid"]]), p["arrival"], _pid_num(p["pid"])))
        pid = chosen["pid"]
        if pid != running:
            events.append(f"t={clock}  dispatch {pid} (remaining={remaining[pid]}ms)")
        raw.append({"pid": pid, "start": clock, "end": clock + 1})
        remaining[pid] -= 1
        clock += 1
        running = pid
        if remaining[pid] == 0:
            events.append(f"t={clock}  {pid} completed")
            completed += 1

    return _report(processes, _merge_segments(raw), events)


def srtf(processes, **_):
    return _preemptive_simulate(processes, key_fn=lambda p, rem: rem)


def priority_preemptive(processes, **_):
    return _preemptive_simulate(processes, key_fn=lambda p, rem: p["priority"])


def round_robin(processes, quantum, **_):
    if not quantum or quantum <= 0:
        raise ValueError("Time quantum must be a positive number.")

    remaining = {p["pid"]: p["burst"] for p in processes}
    arrivals = sorted(processes, key=lambda p: (p["arrival"], _pid_num(p["pid"])))
    not_arrived, queue = list(arrivals), []
    clock, segments, events = 0, [], []

    def admit(up_to):
        while not_arrived and not_arrived[0]["arrival"] <= up_to:
            queue.append(not_arrived.pop(0))

    admit(clock)
    if not queue and not_arrived:
        clock = _idle(segments, events, clock, not_arrived[0]["arrival"])
        admit(clock)

    while queue or not_arrived:
        if not queue:
            clock = _idle(segments, events, clock, not_arrived[0]["arrival"])
            admit(clock)
            continue

        current = queue.pop(0)
        run_time = min(quantum, remaining[current["pid"]])
        end = clock + run_time
        segments.append({"pid": current["pid"], "start": clock, "end": end})
        remaining[current["pid"]] -= run_time
        clock = end
        admit(clock)  # arrivals during this slice queue up before re-adding current

        if remaining[current["pid"]] > 0:
            queue.append(current)
            events.append(f"t={end - run_time}  dispatch {current['pid']} for {run_time}ms -> t={end}, re-queued ({remaining[current['pid']]}ms left)")
        else:
            events.append(f"t={end - run_time}  dispatch {current['pid']} for {run_time}ms -> t={end}, completed")

    return _report(processes, segments, events)


ALGORITHMS = {
    "fcfs": {"label": "FCFS", "category": "NPP", "fn": fcfs},
    "sjf": {"label": "SJF", "category": "NPP", "fn": sjf_non_preemptive},
    "priority_npp": {"label": "Priority", "category": "NPP", "fn": priority_non_preemptive, "uses_priority": True},
    "srtf": {"label": "SRTF", "category": "PP", "fn": srtf},
    "rr": {"label": "Round Robin", "category": "PP", "fn": round_robin, "uses_quantum": True},
    "priority_pp": {"label": "Priority", "category": "PP", "fn": priority_preemptive, "uses_priority": True},
}
