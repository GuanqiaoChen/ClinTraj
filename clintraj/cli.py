"""Local aggregate inspection, physician HITL demonstration, and synthetic experiments."""

import argparse
import json
from pathlib import Path

from pydantic import ValidationError

from clintraj.agents.schemas import CandidateAction, PhysicianDecision, PhysicianResponse
from clintraj.data import DataValidationError, load_workbook
from clintraj.evaluation.protocol import ExperimentConfig, load_experiment
from clintraj.evaluation.runner import build_workflow, run_synthetic_experiment


def main() -> int:
    parser = argparse.ArgumentParser(description="ClinTraj local clinical decision research framework")
    sub = parser.add_subparsers(dest="command", required=True)
    inspect = sub.add_parser("inspect", help="Read a local workbook; emit structural metadata only")
    inspect.add_argument("workbook", type=Path)
    demo = sub.add_parser("demo", help="Synthetic physician-facing workflow; pauses for each decision")
    demo.add_argument("--decision", choices=["accept", "reject"], help="Explicit synthetic test response")
    demo.add_argument("--steps", type=int, default=3)
    experiment = sub.add_parser("experiment", help="Run a synthetic baseline/ablation engineering check")
    experiment.add_argument("--config", required=True,
                            help="YAML path or packaged name such as multi_agent_graph_safety")
    experiment.add_argument("--output", type=Path, default=Path("experiments/runs"))
    args = parser.parse_args()
    if args.command == "inspect":
        try:
            dataset = load_workbook(args.workbook)
        except DataValidationError as exc:
            parser.error(str(exc))
        print(dataset.report.model_dump_json(indent=2))
        return 0
    if args.command == "experiment":
        try:
            path = run_synthetic_experiment(load_experiment(args.config), output_directory=args.output)
        except (FileNotFoundError, NotImplementedError, ValidationError, ValueError) as exc:
            parser.error(str(exc))
        print(f"Synthetic engineering run saved: {path}")
        return 0
    if args.steps < 1:
        parser.error("--steps must be positive")
    _, environment, runtime = build_workflow(ExperimentConfig(name="interactive-synthetic-demo"))
    workflow = runtime.start(environment.observe(), "synthetic-demo")
    print("SYNTHETIC engineering workflow. No real patient and no external model call.")
    for _ in range(args.steps):
        recommendation = workflow["recommendation"]
        selected = next((c for c in recommendation["candidates"]
                         if c["candidate_id"] == recommendation["selected_candidate_id"]), None)
        print(json.dumps({"recommendation": selected, "uncertainty": recommendation["uncertainty"]}, indent=2))
        try:
            raw_response = args.decision.upper() if args.decision else input("Physician decision [ACCEPT/MODIFY/REJECT]: ").strip().upper()
            response = PhysicianResponse(raw_response)
            modified = None
            if response == PhysicianResponse.MODIFY:
                modified = CandidateAction.model_validate_json(input("Replacement CandidateAction JSON: "))
            decision = PhysicianDecision(response=response, physician_ref="local-synthetic-reviewer",
                recommendation_id=recommendation["recommendation_id"],
                rationale="Explicit decision in synthetic engineering demo.", modified_action=modified)
        except EOFError:
            print("Workflow remains paused; no action executed.")
            return 0
        except (ValueError, ValidationError):
            parser.error("Invalid physician response or modified action schema")
        workflow = runtime.resume("synthetic-demo", decision)
        print(json.dumps({"status": workflow["status"], "completed_steps": environment.completed_steps}))
        if workflow["status"] != "executed" or environment.complete:
            break
        workflow = runtime.advance("synthetic-demo")
    return 0
