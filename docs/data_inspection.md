# Repository and trajectory inspection

Inspection performed before implementation, 2026-09-05. Only three source files were present: `Codex Prompt.txt`, `医生审核版.xlsx`, and `5 Golden Trajectories.jpg`. No application, dependency manifest, tests, or repository-specific agent instructions existed.

The workbook was opened read-only. Its SHA-256 is `23e067a5de05a5fe119a541cf90fcc2f40399b5b538131058f4a939497a2741d`. No source workbook changes or patient-level exports are required. The image is a schematic visual reference, not a replacement for structured source records.

## Workbook structure and provenance

| Sheet | Dimensions | Interpretation |
|---|---|---|
| 待标注数据 | A1:L3330 | Row 1 header; row 2 explicit field instructions; rows 3–3330 contain 3,328 trajectory nodes across 400 cases. |
| 两个例子 | A1:W8 | Two side-by-side instructional examples, separated by column L. These lack an action-type column and are excluded from the clinical trajectory cohort. |

There are no merged cells or Excel comments. The main sheet's source annotation columns are completely empty on all 3,328 data rows. Those optional labels are not needed to implement or execute the schemas, graph manager, agents, temporal gate, or runtime. The five selected cases are treated as golden *structural fixtures*. Clinical-acceptability metrics require labels if those endpoints are later claimed, without requiring an architecture or schema change.

| Source column | Canonical field | Source type / handling |
|---|---|---|
| A 病案标识 | case_id | String identifier; preserved locally. |
| B 步骤id | step_id | Positive integer; contiguous within each case. |
| C 父步骤id | parent_step_id | Integer, or missing for START. |
| D 路径关系 | relation | Exact canonical enum string. |
| E 动作类型 | action_type | Exact canonical enum string. |
| F 上一个决策动作后解锁的新信息 | new_evidence | Unicode narrative; retain verbatim locally. |
| G 决策（给医生的建议动作） | action | Unicode narrative; retain verbatim locally. |
| H 临床理由 | clinical_rationale | Unicode narrative; evaluation-only reference rationale. |
| I 医生_决策正确性… | decision review rating | Optional 1=correct, 2=correct with preferred alternative, 3=incorrect. All missing. |
| J 医生_修订决策 | revised action | Optional reviewer text. All missing. |
| K 医生_临床理由质量() | rationale review rating | Optional 1=sufficient, 2=partial, 3=incorrect. All missing. |
| L 医生_修订临床理由 | revised rationale | Optional reviewer text. All missing. |

The only automatically excluded non-data record is the explicit instruction row at Excel row 2, identified by its field markers. That exclusion must appear in the loader audit. No category recoding is necessary. In particular, no edges are silently corrected to match the image. Canonical enums use `DISCHARGE_FOLLOWUP`; the image header also mentions DISCHARGE/FOLLOWUP separately and is not an ontology authority.

Case lengths are 5–18 nodes (mean 8.32; median 8). All 400 source cases have exactly one START. All non-root parents exist within their case and precede their child numerically. There are no duplicate (case_id, step_id) keys, noncontiguous step sequences, parentless non-START nodes, or missing canonical narrative cells.

| Action | Count | Relation | Count |
|---|---:|---|---:|
| ASK_HISTORY | 399 | START | 400 |
| EXAM | 391 | CONTINUE | 2,205 |
| TEST | 788 | BRANCH | 408 |
| CONSULT | 34 | CONSULT | 34 |
| TRANSFER | 29 | TRANSFER | 29 |
| TREATMENT | 372 | RETURN | 252 |
| PROCEDURE | 253 | | |
| PATHOLOGY | 92 | | |
| REASSESS | 170 | | |
| DISCHARGE_FOLLOWUP | 800 | | |

## Five selected source trajectories

The following tables reconstruct the structured records exactly while avoiding duplication of patient narratives. `—` denotes the parentless START. Narrative themes were checked against controlled clinical concepts in the source and the supplied image. Image step identifiers are schematic labels such as S/G/E/V/P/N/B/I/U/R, not source integer IDs.

### Case 1

Excel rows 3–10; 8 nodes. The source and image both describe a predominantly linear breast procedure pathway.

| Step | Parent | Relation | Action |
|---:|---:|---|---|
| 1 | — | START | ASK_HISTORY |
| 2 | 1 | CONTINUE | EXAM |
| 3 | 2 | CONTINUE | TEST |
| 4 | 3 | CONTINUE | PROCEDURE |
| 5 | 4 | CONTINUE | PATHOLOGY |
| 6 | 5 | CONTINUE | REASSESS |
| 7 | 6 | CONTINUE | DISCHARGE_FOLLOWUP |
| 8 | 7 | CONTINUE | DISCHARGE_FOLLOWUP |

### Case 2

Excel rows 1424–1433; 10 nodes. Source narrative concepts support gastrointestinal care and an ENT consultation. **The source contains no RETURN edge**, despite the prompt/image requiring reintegration. Every parent is the immediately preceding step, so the two BRANCH labels do not create separate source graph topology. The CONSULT relation follows the CONSULT action; it must not be automatically interpreted as ownership transfer.

| Step | Parent | Relation | Action |
|---:|---:|---|---|
| 1 | — | START | ASK_HISTORY |
| 2 | 1 | CONTINUE | EXAM |
| 3 | 2 | BRANCH | TEST |
| 4 | 3 | BRANCH | PROCEDURE |
| 5 | 4 | CONTINUE | PATHOLOGY |
| 6 | 5 | CONTINUE | TREATMENT |
| 7 | 6 | CONTINUE | CONSULT |
| 8 | 7 | CONSULT | REASSESS |
| 9 | 8 | CONTINUE | DISCHARGE_FOLLOWUP |
| 10 | 9 | CONTINUE | DISCHARGE_FOLLOWUP |

### Case 3

Excel rows 1768–1782; 15 nodes. Source concepts support pulmonary infection and vertebral/fracture care, specialty advice, subsequent transfers, and procedural care. The image displays two explicitly parallel problem pathways; the source instead forks at step 6 with edges to 7 and 9. The RETURN is 6→9 and does not incorporate the later reassessment at 8 as a second parent. All source edges remain forward in recorded order.

| Step | Parent | Relation | Action |
|---:|---:|---|---|
| 1 | — | START | ASK_HISTORY |
| 2 | 1 | CONTINUE | EXAM |
| 3 | 2 | BRANCH | TEST |
| 4 | 3 | CONTINUE | TEST |
| 5 | 4 | CONTINUE | CONSULT |
| 6 | 5 | CONSULT | TRANSFER |
| 7 | 6 | TRANSFER | TREATMENT |
| 8 | 7 | CONTINUE | REASSESS |
| 9 | 6 | RETURN | TRANSFER |
| 10 | 9 | TRANSFER | TEST |
| 11 | 10 | CONTINUE | PROCEDURE |
| 12 | 11 | CONTINUE | REASSESS |
| 13 | 12 | CONTINUE | PROCEDURE |
| 14 | 13 | CONTINUE | DISCHARGE_FOLLOWUP |
| 15 | 14 | CONTINUE | DISCHARGE_FOLLOWUP |

### Case 4

Excel rows 52–65; 14 nodes. Initial neurological symptoms and a breast lesion are represented. The source contains BRANCH, CONSULT, TRANSFER, and RETURN, but its parent/action alignment is not the clean neurological/breast split in the schematic. In particular, source 5→8 is TRANSFER to a CONSULT action; 7→9 is CONSULT from a TRANSFER action; 8→12 is RETURN into PATHOLOGY and omits the immediately preceding procedure at 11 as a parent. Ownership, stable problem IDs, and integration ancestry cannot be recovered from these labels alone.

| Step | Parent | Relation | Action |
|---:|---:|---|---|
| 1 | — | START | ASK_HISTORY |
| 2 | 1 | CONTINUE | EXAM |
| 3 | 2 | CONTINUE | TEST |
| 4 | 3 | CONTINUE | TEST |
| 5 | 4 | BRANCH | TEST |
| 6 | 3 | RETURN | TREATMENT |
| 7 | 6 | CONTINUE | TRANSFER |
| 8 | 5 | TRANSFER | CONSULT |
| 9 | 7 | CONSULT | TREATMENT |
| 10 | 9 | CONTINUE | TEST |
| 11 | 10 | CONTINUE | PROCEDURE |
| 12 | 8 | RETURN | PATHOLOGY |
| 13 | 12 | CONTINUE | DISCHARGE_FOLLOWUP |
| 14 | 13 | CONTINUE | DISCHARGE_FOLLOWUP |

### Case 5

Excel rows 2127–2144; 18 nodes. Source themes support urologic care, infection deterioration, critical-care transfer, further transfers, urologic procedure/pathology, reassessment, and follow-up. The schematic compresses several transfers and explicitly resumes the original problem through a new integrated reassessment. The source has RETURN 10→16 into a new REASSESS and RETURN 15→17 into DISCHARGE_FOLLOWUP; both are temporally forward. Neither represents a backward jump. Source reassessment 16 follows procedure/pathology 13–14 in recorded order; it cannot be moved earlier without an explicit clinician-reviewed amendment.

| Step | Parent | Relation | Action |
|---:|---:|---|---|
| 1 | — | START | ASK_HISTORY |
| 2 | 1 | CONTINUE | EXAM |
| 3 | 2 | CONTINUE | TEST |
| 4 | 3 | CONTINUE | TREATMENT |
| 5 | 4 | BRANCH | TRANSFER |
| 6 | 5 | TRANSFER | TRANSFER |
| 7 | 5 | TRANSFER | TEST |
| 8 | 7 | CONTINUE | TEST |
| 9 | 8 | CONTINUE | TRANSFER |
| 10 | 9 | TRANSFER | TRANSFER |
| 11 | 4 | TRANSFER | TRANSFER |
| 12 | 11 | TRANSFER | TEST |
| 13 | 12 | CONTINUE | PROCEDURE |
| 14 | 13 | CONTINUE | PATHOLOGY |
| 15 | 14 | CONTINUE | TREATMENT |
| 16 | 10 | RETURN | REASSESS |
| 17 | 15 | RETURN | DISCHARGE_FOLLOWUP |
| 18 | 17 | CONTINUE | DISCHARGE_FOLLOWUP |

## Scientific implications and data limitations

1. Preserve exact source graphs and expose discrepancies through an auditable report. Test the five supplied conceptual patterns using **separate synthetic semantic scenarios**, explicitly labeled as assumptions from the prompt/image. They must never be presented as corrected or physician-validated source records.
2. The main table supplies one incoming edge per row and cannot encode multiple-parent reintegration directly. Runtime clinical graphs should support multiple parents, while source loader fidelity must remain exact.
3. Across the cohort, 30/34 CONSULT relations follow a CONSULT parent action; 23/29 TRANSFER relations follow a TRANSFER parent action. These frequently label the consequence of the prior action, rather than the type of the child action. The remaining patterns require clinical adjudication; do not force action-edge equality.
4. All 252 RETURN edges are forward: 216 refer to a parent earlier than the immediately preceding step and 36 to the immediately preceding step. Their labels alone do not identify the originating problem, destination owner, or completed branch.
5. The workbook lacks reliable event/release timestamps, explicit problem IDs, ownership identifiers, action completion times, evidence IDs, and counterfactual outcomes. Recorded step order is an ordinal replay assumption, not validated real-world availability time.
6. The new-evidence column is an annotation claim about what becomes available after a preceding decision. Some early evidence mentions historical pathology or procedures; a keyword match cannot distinguish legitimate prior history from future leakage. Prospective admissibility still requires source-event provenance and physician review. A software gate can enforce release order but cannot prove that prewritten narratives are free from hindsight.
7. Exact recorded-action replay can test temporal and software invariants. It cannot estimate outcomes of a modified or alternative action: unsupported actions must stop or require an independently specified simulator/event source.
8. Local clinical text, identifiers, reference rationales, and reviewer content must not appear in default logs, remote model requests, or synthetic fixtures. Aggregate counts, source hashes, and pseudonymous case references suffice for routine reproducibility reports.
