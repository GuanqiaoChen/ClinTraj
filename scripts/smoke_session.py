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
    client = httpx.Client(base_url=args.url, timeout=240)
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
    body = {"recommendation_id": rec["recommendation_id"], "response": "ACCEPT" if rec["selected_candidate_id"] else "REJECT",
            "physician_ref": "synthetic-verification", "rationale": "Technical synthetic verification; no real patient action."}
    route = f"/api/sessions/{sid}/runs/{run['id']}/decision"
    approved = client.post(route, json=body)
    approved.raise_for_status()
    assert client.post(route, json=body).json()["state"] == approved.json()["state"]
    assert "AGENT_STARTED" in event_types and "RETRIEVAL_COMPLETED" in event_types
    assert len(event_ids) == len(set(event_ids))
    report = {"provider": args.provider, "session_id": sid, "status": approved.json()["runs"][0]["status"],
        "graph_nodes": len(approved.json()["state"]["clinical_graph"]), "trace_events": len(event_ids),
        "citations": len(rec["citation_ids"]), "retrieval_channels": run["bundle"]["channels"],
        "idempotency": "passed", "synthetic_only": True}
    Path("outputs").mkdir(exist_ok=True)
    Path(f"outputs/smoke-{args.provider}.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    finished.set()
    print(json.dumps(report))


if __name__ == "__main__":
    main()
