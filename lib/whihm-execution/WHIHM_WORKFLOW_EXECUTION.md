# Workflow Execution Foundation v1

Capability **RUN_WORKFLOW**, local mode **run_workflow**, tool **workflow-execution**.
This is a WHIHM coordinator for an already-authored canonical workflow, not a model,
planner, agent, recipe builder or replacement for Open Generative AI execution.
Canonical workflow/project schemas, provider clients and all 13 remote modes are
unchanged. Source/development integration is supported; no live provider QA or
packaged production readiness is claimed.

## Architecture and graph contract

[workflow-execution.mjs](workflow-execution.mjs) owns session runs and transitions.
[workflow-bindings.mjs](workflow-bindings.mjs) adapts typed values; the existing core
validator and workflowDependencyMap own graph validation/dependency discovery.
[workflow-node-adapter.mjs](workflow-node-adapter.mjs) delegates to the existing
bridge, Media Inspection and Deterministic Finishing. The small discovery descriptor
is in [workflow-execution-contract.mjs](workflow-execution-contract.mjs).

There is no second graph format. Existing node IDs, ports, executor references,
asset references and schemaVersion 1 are authoritative. V1 rejects cycles (including
explicit and embedded dependencies), invalid endpoints/types, missing required inputs,
unknown executors/tools and unsupported scheduling policies. Static unavailable
executors produce blocked node plans, not a substituted executor. Unknown custom
port types and prototype-reserved IDs reject. Limits: 128 nodes, 512 edges, 1 MiB per
portable graph/value/result, 32 runs per host project session, 4096 transition events.

The deterministic Kahn traversal processes each ready frontier by ascending node ID.
Nodes run serially, only after every dependency completes. Edges, explicit dependencies,
structured `$nodeOutput` and canonical legacy references all use the core's dependency
map. No cycles, parallel worker pool, automatic retries/fallbacks or implicit branches.
Disabled nodes are skipped; an output/dependency on a skipped node remains blocked.

Supported node classes:

- Exact bound remote executors, including reviewed and already-eligible generic
  routes; availability is checked against binding and projection evidence, and
  the existing bridge validates effective inputs again before transport.
- Specialized routes such as Depth/Recast through the same existing bridge.
  Guided Suno has explicit continuation handling described below.
- Local inference through the same bridge, constrained by trusted operational
  readiness. The default desktop binding does not certify installed model/GPU
  readiness; it stays LOCAL_RUNTIME_UNVERIFIED. Internal host integrations may
  supply operational evidence; renderer requests cannot assert that evidence.
- Utility tools exactly `media-inspection` and `media-finishing`.
- Control tool exactly `approval`, with a nonblank `parameters.reason` and label
  from the canonical node title. No arbitrary script/control/utility execution.

Only existing executionPolicy.manual/optional booleans, maxAttempts 1 and fallback
allowed=false are admitted. Other retry/fallback policies and nonempty costPolicy
reject rather than being silently ignored. Workflow review/variant metadata remains
archival: no variant selection or policy engine is inferred.

## Typed bindings and outputs

Workflow input IDs bind through their canonical targets and defaults. Core input
typing remains authoritative, even for an `any` target. Required node fields must
have a parameter, input binding or upstream edge. Conflicting parameter/interface/
edge bindings reject rather than overwrite. Many ports aggregate in stable input-ID/
edge-ID order; list order and duplicate references remain meaningful.

Declare a tool source port `assetId` of type asset/image/video/audio. Registered
references use canonical `{$asset: id}`; asset-type workflow inputs can use their
declared registered ID. Remote media inputs use safe HTTP(S) URLs. Remote-only asset
declarations do not become verified project assets. Local declarations must match
registered ID/path/type/checksum and existing full-project integrity checks.

Structured `$nodeOutput` references and **whole-value** legacy
`{{ node.outputs[0].value }}` are supported. Partial string interpolation and nested
media references without an explicit typed input port reject. There is no expression
evaluator. Mixed URL/project arrays reject where the existing uploader cannot safely
represent them; homogeneous arrays preserve their typed identities and order.

Run bindings distinguish project_asset, remote_media, workflow value and
provider_identity. Project bindings carry logical path/ID/checksum, never machine
paths. Only declared provider-identifier ports can receive opaque identities; they
cannot become assets. Remote URLs are not downloaded/imported automatically. Local
file/data-URL outputs are not portable workflow artifacts in v1; explicit import is
a later boundary. Local/MCP executors with safe portable output references can run.

Inspection can output its registered source on a matching media/asset port and
its inspection result on json/object/result ports. Finishing outputs its registered
derived asset and/or explicit JSON result. An approval can expose boolean or JSON.
Remote output ports map normalized bridge artifacts: one port consumes one artifact
(or an ordered list for cardinality many); multiple ports require explicit nonnegative
`port.metadata.normalizedOutputIndex`. Missing/mismatched artifacts fail closed.
No arbitrary JSON-path extraction or invented result URL is supplied.

## Plan, execute and host API

```js
const request = { projectHandle, workflowId, inputs: {} };
const plan = await window.whihmHost.planWorkflowExecution(request);
const run = await window.whihmHost.runWorkflow({ ...request, allowExecution: true });
const state = await window.whihmHost.getWorkflowRun({ projectHandle, runId: run.runId });
```

Planning validates the graph/project and returns exact hash, stable order,
dependencies, executor route/assurance, required approvals and known blockers.
Nodes whose upstream results do not exist remain pending validation; the plan
does not invent those results. Direct node plans reuse existing validators and
may read technical headers. No credentials, uploads, probes, transforms, project
writes, provider jobs or approvals occur. Input-dependent validation runs again
when dependencies are available.

Execution requires literal allowExecution=true. Each node reuses its existing
execute operation. Finishing execution observes the existing multimedia status and
then still requires its own fresh baseline-ready lease. Missing/partial/incompatible/
unverified runtime blocks video/audio without counting a transform attempt; image
finishing stays independent. The development runtime currently remains missing.

Host reads and all six new IPC channels use the existing sender/window/frame checks.
The renderer supplies a project handle and registered workflow ID, not a replacement
graph or arbitrary paths. Start/resume/approval/invalidation require execution
permission. One active host execution and one transition lock per run reject
overlapping actions; expectedRevision guards stale callers and duplicate approvals.
Run lookup is read-only and never executes. Global definition-transition APIs also
reject while a host execution is active. The host rechecks the registered definition
before every new node; an external definition change blocks continuation.

## Run state, pauses and human boundaries

Runs are separate schemaVersion 1 state objects: runId, definition schema/hash and
initial hash, revision, input bindings, outputs, node states, timestamps, transition
events and controlled definition changes. The saved workflow is never mutated to
store transient state. A private canonical evaluation copy uses existing
setNodeApproval/get-production-evidence/readiness rules; it is not another saved
definition or an alternative approval policy.

Node states: pending, ready, running, awaiting_user, completed, blocked, failed,
stale, skipped. Run states additionally include paused after an explicit decision.
Blocked is not failed, runtime-unverified is not provider failure, and generic
approval is not provider liveness. A run stops at the first unsatisfied boundary.
Completed nodes are never restarted by ordinary resume.

```js
const decided = await window.whihmHost.approveWorkflowCheckpoint({
  projectHandle, runId: run.runId, nodeId: 'review',
  expectedRevision: run.revision, decision: 'approve', // or reject
  origin: 'human', allowExecution: true,
});
// Approval records the decision only; it does not execute downstream work.
const continued = await window.whihmHost.resumeWorkflow({
  projectHandle, runId: decided.runId,
  expectedRevision: decided.revision, allowExecution: true,
});
```

Manual/confirmation declarations recognized by the core pause before execution.
Approval/rejection uses existing production-evidence transitions with the exact
dependency scope. Rejection blocks descendants; repeat approval rejects. The human
origin is an explicit caller declaration, not identity authentication or a mechanism
that can prove a human clicked. No internal agent/reasoning code approves anything.
WHIHM approval does not replace provider consent, liveness or fresh spend approval.

Guided Suno preserves the exact returned challenge and same live provider session.
Generic approval cannot advance it. An explicit resume continuation is:
`{nodeId,action:'confirm',confirmationAssetId,recordingOrigin:'user_recorded_challenge'}`,
or `{nodeId,action:'poll'}`. State/request ID comes from the retained provider result,
never caller replacement. Existing bridge/Suno service validate the distinct audio
asset, checksum, session, phrase and provider stage. Continuation preflight failures
do not consume an attempt; no auto-confirmation, synthesized recording, TTS or restart.
Completion exposes voice_id as a provider_identity on a selection output with
`metadata.providerIdentifier:true`, never an audio artifact. Unknown/pending generic
provider results block with their request ID; v1 adds no generic polling/retry layer.

## Invalidation, lineage and persistence

Definition edits still use existing commands/history/rollback, outside this executor.
Resume requires the captured current definition hash and source scopes. Changes do
not silently reinterpret completed work. `invalidateWorkflowRun` requires runId,
projectHandle, expectedRevision and allowExecution=true, with optional replacement
workflow `inputs` or `changedOutputNodeIds`.

The host loads the current saved definition; callers cannot inject one. The engine
uses hashNodeProductionScope, registered source identity, existing production
invalidation/diff and the actual old/new dependency maps. Changed settings, executor,
input asset/checksum or reported output reference mark producers and descendants
stale, preserving unaffected branches and prior result records. changedOutputNodeIds
reports an external output change; it never adopts caller-provided artifacts.
Added/removed node IDs require a new run. Cosmetic changes can preserve valid results.

No stale node auto-runs. Explicit `resumeWorkflow(...,rerunNodeIds:[...])` authorizes
selected stale nodes; unchanged completed branches retain their results/attempt counts.
Previous outputs/approvals remain in run-scoped history. Uncertain attempts and active
provider continuations cannot be rerun through invalidation. Failed/pending provider
work is never generically retried by ordinary resume; no executor substitution occurs.

Run lineage records exact definition hash/version, node executor/binding/route,
normalized typed inputs/effective options, dependencies, outputs/hashes, request and
continuation IDs, statuses, attempts and timestamps. Safe actual provider cost fields
are preserved per node without estimates, totals or a cost ledger. Existing finishing
assets retain their own immediate-parent metadata. No global provenance graph.

**Session-only durability:** state is retained in the owning host/project session and
can be serialized for inspection, but returned JSON cannot rehydrate trusted runs.
Restart/navigation/disposal yields RUN_NOT_FOUND; Suno session loss remains blocked.
Never retry runWorkflow blindly after an uncertain response. An explicit new start
creates a distinct run, not request-level cross-session deduplication. Existing
project/history schemas have no run store; durable journaling/recovery is a follow-up.
Workflow rollback restores definitions only, never undoes a provider-side generation.

## Discovery and next boundaries

Projection/planning derive this descriptor automatically: **43 capability groups /
604 entries**, 139 available reviewed and 396 available generic. Prior 603 executor
entries retain their binding semantics. Overview, RUN_WORKFLOW context and exact
workflow-execution detail expose DAG/pause/approval/invalidation and session limits.
No planning-specific registry, ranking, Agent Execution or fallback was added.

Tests use local temporary project media, real inspection/Sharp and mocked existing
bridge/provider services, including guided Suno. No live provider, upload, paid job,
FFmpeg install, project schema change, UI or packaging repair occurs. Real provider
fidelity, local GPU health and packaged distribution remain unverified. Full provenance,
durable run recovery, autonomous agents, recipes, selective regeneration policies and
delivery systems remain later extensions.

## Targeted QA

**54 new cases / 980 unique targeted tests pass**: 52 workflow execution, 243 workflow-core,
616 existing projection/planning/inspection/finishing/runtime/bridge/Depth/Suno/
high-value-video regressions, and 69 full host tests (including two new fixed IPC
cases). Eight affected host cases were rerun after the final scoped guards.
All 14 touched JS/MJS files pass syntax checks and ESLint; workflow-core check and
git diff --check pass. No renderer/Studio build input changed, so no Vite/browser
build was needed. Provider transport and uploads are mocked; no paid operation.
No dependencies, binaries, project/workflow schemas or submodule revisions changed.
