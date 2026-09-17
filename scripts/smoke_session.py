"""Run the real HTTP/model/SSE pipeline with synthetic input; retain an aggregate report."""
import argparse
import json
import threading
import time
from pathlib import Path

import httpx


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://localhost:3000")
    parser.add_argument("--provider", choices=["local", "deepseek"], default="local")
    parser.add_argument("--timeout", type=int, default=900)
    args = parser.parse_args()
    client = httpx.Client(base_url=args.url, timeout=240, trust_env=False)
    sample = client.get("/api/synthetic-cases").json()[1]
    response = client.post("/api/sessions", json={"title": "Synthetic HTTP verification", "problem": sample["problem"],
        "evidence": sample["text"], "synthetic": True, "provider": args.provider})
    response.raise_for_status()
    sid = response.json()["id"]
    event_types, event_ids, finished = [], [], threading.Event()

    def consume():
        with httpx.stream("GET", args.url + f"/api/sessions/{sid}/events", timeout=args.timeout) as stream:
            for line in stream.iter_lines():
                if line.startswith("data: "):
                    event = json.loads(line[6:])
                    event_types.append(event["type"])
                    event_ids.append(event["id"])
                if finished.is_set():
                    break

    thread = threading.Thread(target=consume, daemon=True)
    thread.start()
    started = time.monotonic()
    client.post(f"/api/sessions/{sid}/runs", json={}).raise_for_status()
    deadline = time.monotonic() + args.timeout
    while time.monotonic() < deadline:
        snapshot = client.get(f"/api/sessions/{sid}").json()
        if snapshot["status"] != "running":
            break
        time.sleep(2)
    run = snapshot["runs"][0]
    if run["status"] != "awaiting_physician":
        raise RuntimeError(run["error"] or "Proposal timeout")
    rec = run["recommendation"]
    assert len(rec["candidates"]) == 3
    elapsed = time.monotonic() - started
    before_clock = snapshot["state"]["clock"]
    body = {"recommendation_id": rec["recommendation_id"], "response": "ACCEPT",
            "selected_candidate_ids": [c["candidate_id"] for c in rec["candidates"][:2]],
            "physician_ref": "synthetic-verification", "rationale": "Technical synthetic verification; no real patient action."}
    route = f"/api/sessions/{sid}/runs/{run['id']}/decision"
    approved = client.post(route, json=body)
    approved.raise_for_status()
    while time.monotonic() < deadline:
        snapshot = client.get(f"/api/sessions/{sid}").json()
        if snapshot["status"] == "ready":
            break
        time.sleep(1)
    assert snapshot["status"] == "ready"
    assert snapshot["state"]["clock"] == before_clock + 2
    simulated = [e for e in snapshot["state"]["available_evidence"] if e.get("provenance", {}).get("run_id") == run["id"]]
    assert len(simulated) == 1 and simulated[0]["synthetic"]
    assert client.post(route, json=body).json()["state"] == snapshot["state"]
    # Allow the SSE reader to receive the final committed events.
    event_deadline = time.monotonic() + 5
    while "SIMULATION_COMPLETED" not in event_types and time.monotonic() < event_deadline:
        time.sleep(.1)
    assert {"AGENT_STARTED", "RETRIEVAL_COMPLETED", "GRAPH_UPDATE", "SIMULATION_COMPLETED"} <= set(event_types)
    assert len(event_ids) == len(set(event_ids))
    report = {"provider": args.provider, "session_id": sid, "status": approved.json()["runs"][0]["status"],
        "graph_nodes": len(snapshot["state"]["clinical_graph"]), "trace_events": len(event_ids),
        "candidates": len(rec["candidates"]), "accepted_count": 2, "proposal_wall_seconds": round(elapsed, 2),
        "generation_mode": rec["generation_mode"], "elapsed_ms": rec["elapsed_ms"],
        "simulation_mode": simulated[0]["provenance"]["generation_mode"],
        "citations": len(rec["citation_ids"]), "retrieval_channels": run["bundle"]["channels"],
        "retrieval_metadata": run["bundle"].get("retrieval_metadata"),
        "idempotency": "passed", "synthetic_only": True}
    Path("outputs").mkdir(exist_ok=True)
    Path(f"outputs/smoke-{args.provider}.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    finished.set()
    print(json.dumps(report))


if __name__ == "__main__":
    main()
