# Implementation plan

The repository initially contained only the specification, a workbook, and a reference image.
Read-only inspection identified 400 cases and 3,328 actual trajectory nodes. The review
columns are unpopulated; the filename is not evidence of completed clinician adjudication.
The image is a conceptual reference and differs from source edges in several cases.

1. Preserve the workbook byte-for-byte; report source anomalies and reconstruct all five
   exemplars without inferred clinical corrections (`data_inspection.md`).
2. Implement minimal immutable golden schemas and structural validation, separate from
   mutable clinical problem management and an append-only runtime decision graph.
3. Expose observations through an ordinal, prerequisite-based evidence gate. Keep reference
   actions, rationales, annotations, and future evidence outside agent context.
4. Implement structured agents, selective specialists, auditable uncalibrated action scoring,
   independent safety constraints, and mandatory physician acceptance/modification/rejection.
5. Adapt the method to LangGraph with checkpointed interruption; retain a framework-independent
   coordinator and an injectable model transport guarded against inadvertent PHI transmission.
6. Implement strict replay and explicit clinician-approved alternatives; unsupported paths stop.
7. Add case-level metrics, explicit missing-label handling, reproducible baseline/ablation
   configurations, safe aggregate manifests, synthetic offline runs, and source integration tests.
8. Run behavior tests, static checks, design audits, and adversarial review. Document empirical
   gaps without claiming clinical efficacy, comparative superiority, or publication readiness.

No UI, deployment, external model experiment, or patient-data upload is required for this phase.
