#!/usr/bin/env python3
"""Append a round entry to progress/status.json. Atomic + lock-safe for parallel agents."""
import json, os, sys, time, fcntl, argparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(ROOT, "progress", "status.json")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--piece", required=True)
    ap.add_argument("--role", default="builder", choices=["builder", "critic", "lead"])
    ap.add_argument("--round", type=int, required=True)
    ap.add_argument("--state", default="building",
                    choices=["queued", "building", "critiquing", "gap", "passed"])
    ap.add_argument("--note", default="")
    ap.add_argument("--gap", default="")
    ap.add_argument("--verdict", default="")
    ap.add_argument("--shot", default="")
    a = ap.parse_args()

    os.makedirs(os.path.dirname(P), exist_ok=True)
    with open(P, "a+") as fh:
        fcntl.flock(fh, fcntl.LOCK_EX)
        fh.seek(0)
        raw = fh.read().strip()
        d = json.loads(raw) if raw else {"pieces": {}, "log": []}
        pc = d["pieces"].setdefault(a.piece, {"round": 0, "state": "queued", "shots": [], "gaps": []})
        pc["round"] = max(pc["round"], a.round)
        pc["state"] = a.state
        pc["updated"] = time.time()
        if a.note: pc["note"] = a.note
        if a.gap:
            pc["gap"] = a.gap
            pc["gaps"].append({"round": a.round, "text": a.gap})
        if a.verdict: pc["verdict"] = a.verdict
        if a.shot:
            rel = a.shot if a.shot.startswith("../") else "../" + a.shot.lstrip("./")
            if not any(s["path"] == rel for s in pc["shots"]):
                pc["shots"].append({"round": a.round, "path": rel, "t": time.time()})
        d["log"].insert(0, {"t": time.time(), "piece": a.piece, "role": a.role,
                            "round": a.round, "state": a.state,
                            "text": a.gap or a.note or a.verdict})
        d["log"] = d["log"][:120]
        d["updated"] = time.time()
        fh.seek(0); fh.truncate()
        json.dump(d, fh, indent=1)
        fcntl.flock(fh, fcntl.LOCK_UN)
    print(f"logged {a.piece} r{a.round} {a.state}")

main()
