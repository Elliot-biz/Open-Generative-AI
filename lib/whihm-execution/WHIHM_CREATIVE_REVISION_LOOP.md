# Bounded Creative QC → Agent Revision

Creative QC evaluates. Agent Execution authors workflow edits. Workflow Execution
owns dispatch, approvals, continuation, invalidation and asset outputs. This bridge
creates constrained Agent plans and requests a fresh QC evaluation after successful
execution. It neither runs a DAG nor implements provider transport or retry.

Existing Agent re-planning (`previousExecutionId`), canonical edit batches/history,
same-run invalidation and explicit stale reruns already supply the required control
machinery. Upstream Studio agent/chat retry controls do not provide checksum-bound
QC correction or canonical workflow-revision safety. They are unchanged; no second
agent, QC system or executor is introduced.

## Discovery and API

Capability `PLAN_CREATIVE_REVISION`, tool `creative-revision`, mode
`plan_creative_revision` are dynamically projected. Astra's generic progressive
planning context exposes the structured families, stop policies, approval boundaries,
Agent dependency and limits. No reasoning model is embedded.

Fixed host/preload APIs:

- `planCreativeRevision({projectHandle,request})`: inspect/validate only; no project
  writes or execution. Session-owned proposals and Agent validations are retained.
- `runCreativeRevision({projectHandle,revisionId,planHash,allowExecution:true,
  approveProposal?,allowRemoteExecution?})`: explicitly consume one cycle, append
  proposal evidence, apply through Agent, explicitly rerun its stale scope, recheck.
- `getCreativeRevision({projectHandle,revisionId})`: detached session snapshot.
- `continueCreativeRevision({projectHandle,revisionId,allowExecution:true,
  allowRemoteExecution?,continuation?})`: existing Agent continuation only; no new
  edits or caller-supplied rerun list. Optional continuation is a known provider poll,
  validated by Agent/Workflow; human/provider confirmation is never synthesized.

`approveProposal:true` acknowledges inspecting the proposal. It is not workflow
approval, provider liveness, authenticated human review or Creative QC acceptance.
Actual workflow checkpoints are approved through the existing human Workflow API.

## Request v1

```json
{
  "schemaVersion": 1,
  "requestId": "repair_impact",
  "projectId": "registered-project-id",
  "workflowId": "action_production",
  "expectedWorkflowHash": "64-lowercase-hex",
  "sourceQc": {"assetId": "qc_asset", "checksum": "64-lowercase-hex"},
  "agentExecutionId": "original_agent_plan",
  "runId": "same_session_run",
  "findingIds": ["impact_sync"],
  "scope": {"nodeIds": ["mix"], "families": ["audio_event"]},
  "cycle": 1,
  "maxCycles": 2,
  "executionPolicy": "safe_deterministic",
  "stopPolicy": ["pass","review","blocked","failed","uncertain","limit","stale"],
  "intents": []
}
```

The hash placeholders are explanatory; requests require real hashes. Optional
`instructions` are context, never executable. Later cycles additionally specify
`previousRevisionId`, the prior revision's new QC asset, and its Agent execution ID.

Limits: 128 KiB requests, 8 selected findings/intents, 8 scoped nodes, 32 session
proposals, 8 explicit continuations per revision. Production is cycle 0. Revisions
are cycles 1 and 2; callers may choose a lower maximum but cannot raise it beyond 2.
No call recursively starts another cycle. A required new cycle is a new explicit
request. The session chain prevents root-reset, skipped-cycle and forked execution.
A still-failing recheck at the bound produces `LIMIT_REACHED`.

## Trust and stale review

QC must be a registered `creative-qc-result` with verified byte/result/definition/
evidence hashes. Source QC must identify this project, workflow hash and run. The
same live Agent execution and completed Workflow run must match. An unfinished
source run is not adopted, preventing incidental dispatch of unrelated pending work. Every artifact and registered
evidence checksum is reverified. Selected artifacts must still be exact outputs of
the current run; an older immutable output cannot authorize changing newer work.
These checks repeat immediately before applying the proposal.

The finding's target node must be explicitly scoped and be the artifact producer
or its canonical dependency ancestor. The bridge preserves exact Agent capability
requirements/bindings. Agent validates canonical parameters, current assets/readiness,
approval topology and the atomic batch. No raw parameter pointer, source replacement,
executor change, arbitrary code, raw FFmpeg, structural workflow edit or prose command
is accepted by this bridge.

Imported QC evidence remains recorded evidence, not independently attested measurement
truth. Scope/intent and explicit run permission provide authority; QC remediation is
advisory. Existing human/model/provider provenance boundaries remain intact.

## Bounded mappings and structured external intent

Automatic mapping is deliberately narrow: a failed required or optional
TECHNICAL/OBJECTIVE_INTENT `lineage_event` requirement with no mandatory human review
can restore its explicit `startFrame` and optional `durationFrames`. The event/item
ID comes from that rule; it is not inferred from remediation prose. These checks
prove authored lineage, not perceived media quality. End-to-end benchmark measurements
separately verify real production behavior.

Other changes need a structured intent:

```json
{
  "findingId": "canvas_size",
  "nodeId": "timeline",
  "family": "timeline_output",
  "capabilityId": "COMPOSE_TIMELINE",
  "changes": {"canvas": {"width": 32, "height": 32}},
  "expectedOutcome": "Deliver the explicitly required dimensions"
}
```

Supported families and fields:

| Family | Target | Allowed changes |
| --- | --- | --- |
| audio_event | Audio event ID | start/duration/source-in frames, gain, pan, fades, manipulation |
| timeline_item | Timeline item ID | start/duration/source-in frames, gain, placement |
| audio_master | Audio master | gain, processors |
| timeline_output | Timeline definition | canvas, durationFrames |

Event families also require `elementId`, respecting a declared QC audio/Timeline
item target. Owner contracts validate all ranges, timing, pitch/stretch, processors
and dimensions. Source identity, routing and executor selection are not editable.

Selected failed findings are ordered by required status, severity and stable ID.
Compatible changes merge into one atomic parameter edit per node/document.
Conflicting writes reject for reconciliation; no last-write winner exists.
Subjective criticism cannot derive a correction. Explicit external reasoning may
supply the above intent, constrained to the scoped failed finding/target. Human-only
requirements and unresolved overall human-review states stop; no assessment is
invented. Structural repairs, missing-node creation and general finishing/provider
parameter repair remain unsupported rather than broadening mutation authority.

## Execution and stops

Proposals expose finding/action mapping and its hash, normal Agent plan, affected
nodes, expected stale descendants, preserved branches, readiness/capability requirements,
approvals and side effects. Classification is `SAFE_DETERMINISTIC` or
`APPROVAL_REQUIRED`; unsupported corrections return `EXTERNAL_REASONING_REQUIRED`
or `HUMAN_REVIEW_REQUIRED`. A review-policy proposal needs explicit acknowledgement.

`safe_deterministic` permits a local proposal's explicit run call without another
proposal acknowledgement. Workflow approvals remain mandatory. Because Agent uses
conservative workflow-wide remote permission checks, any remote effect in its plan
also requires separate remote permission and proposal acknowledgement, even when
that branch is expected to remain completed. Native cost remains unknown unless
existing execution evidence reports it; nothing estimates prices.

Uncertain provider work blocks planning/apply/continuation; active provider operations
also block amendments. Known status polling stays in Agent/Workflow. There is no
retry, substitution, fallback or direct provider call. Failed local execution stops
and preserves valid completed work; continuation does not rerun a failed node.
A new explicit Agent plan against current state is needed where safe. This bridge
accepts fresh QC from completed production runs; repair of an unfinished/failed run
remains an explicit direct Agent re-plan, not an inferred QC retry.

States summarize the bridge: PLANNED/READY, EXECUTING, AWAITING_APPROVAL,
RECHECKING, PASS, REVISION_NEEDED, HUMAN_REVIEW_REQUIRED,
EXTERNAL_REASONING_REQUIRED, BLOCKED, LIMIT_REACHED, FAILED and STALE. Invalid
contracts return rejected diagnostics. Stale review never applies changes. QC PASS,
missing evidence, unresolved review, rejected approval, uncertainty, execution
failure and cycle bounds stop progression.

## Rerun, recheck and immutable audit

Agent applies the normal history-backed atomic edit batch and invalidates its prior
run. The bridge passes only actual stale nodes within the predicted dependency
closure to Agent continuation. Unchanged analysis, completed independent branches,
registered sources and valid outputs remain intact. Unexpected stale scope blocks.

On completion, known original QC artifact roles are rebound only to those same-run
producer outputs. Source requirements remain unchanged. The workflow hash/run
association is refreshed; old human-review references are cleared. Recorded external
measurement evidence is NOT rewritten or declared fresh: obsolete checksum-bound
benchmark/model evidence causes BLOCKED. Renewal/reconciliation requires explicit
QC/Agent work; this bridge neither mints fresh measurements nor resets a stopped chain. Thus automated
recheck is immediately useful for direct inspection and authored-lineage checks.
QC creates a NEW registered result; the old QC/artifact is never overwritten.

Revision proposal/observation/stopped snapshots are new immutable project JSON
assets (`creative-revision-record`). They include source QC/ref/hash, original
workflow/run, request/cycle, mapping, Agent plan/hash, resulting workflow revision,
actual run outputs, approvals/audit and subsequent QC/ref. Prior-record refs chain
snapshots. Canonical JSON pointers in durable audit use portable segment arrays
because project evidence rejects slash-prefixed path strings. Live Agent actions
keep the validated canonical pointers. Audit records never rehydrate authority.

Request/mapping/plan hashes use canonical stable hashing. Plan identity includes
structured actions, source QC result, workflow revision, scope and effects; transient
readiness observation timestamps are reported but excluded from plan identity.
Storage failure stops execution/progression; consumed cycles are not silently reset.
Project history/publication retains existing reconciliation behavior, not a new
multi-store transaction. No hidden model reasoning is stored.

## Acceptance and limits

Real local acceptance injects a +2-frame shift into the existing action benchmark's
three first-impact SFX events. QC fails authored timing, one atomic Agent revision
restores the explicit frames, mix/mux/inspection rerun in the same Workflow run,
analysis/Timeline outputs remain completed, and new QC plus the existing benchmark
measurements pass. A separate real 64→32 canvas correction demonstrates explicit
non-timing intent and objective inspection recheck. Tests also cover human checkpoint
continuation, conflict/atomic rejection, stale checksums/revisions, uncertainty,
subjective stops and the two-cycle bound. No paid/provider execution is used.

Session proposals, cycle guards and Agent/Workflow continuation do not survive
restart. Immutable audit/QC/history persist as evidence only. Fresh sessions cannot
resume jobs from JSON. Direct Workflow runs without a live Agent origin are not
adopted. General semantic remediation, autonomous creative decisions, revision
optimization, arbitrary structural repair, provider ranking, external subjective
models, authenticated reviewers and durable orchestration remain deferred.

## Validation

The final revision suite passes 26 tests with no skips, including real local action
benchmark repair, canvas repair, host execution, approvals, immutable recheck,
uncertainty, stale evidence, structured subjective intent and cycle bounds.
Targeted existing regression suites pass 707 +356 tests (1,089 unique tests total).
All 16 touched JS/MJS files pass syntax and ESLint; git diff --check passes.
Real media tests reuse the approved staged FFmpeg/ffprobe 7.0.2-static pair via
node_modules/.cache/whihm-local-runtimes/env.sh. No dependencies, renderer changes,
provider calls, uploads, paid usage or runtime installations are involved.
