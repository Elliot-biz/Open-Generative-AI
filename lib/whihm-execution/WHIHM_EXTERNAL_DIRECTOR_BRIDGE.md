# WHIHM External Director Bridge (“the Plug”)

The bridge adapts local structured calls to the canonical host. Agent Execution
owns authoring, Workflow Execution owns dispatch/continuation, Creative Revision
owns corrective translation, and Creative QC owns evaluation. No model or API SDK
is required. There are no new workflow, capability, provider or evidence registries.

## Transport decision and startup

The repository has a Wan2GP MCP **client**, renderer IPC controls, and upstream
CLI documentation; it has no suitable external WHIHM control server. Reusing the
canonical host with JSON-lines stdio is the smallest source-mode transport. A new
HTTP listener would need socket authentication and a new MCP server would need
protocol/dependency work with no benefit to these canonical controls. One future
MCP adapter can wrap this manifest; this version does not claim MCP compatibility.

Owner startup, from the repository root:

```sh
source node_modules/.cache/whihm-local-runtimes/env.sh
node scripts/external-director.mjs --project /absolute/registered/project
```

The approved runtime helper is optional when only discovery is needed. Startup
uses existing project integrity checks and the bounded multimedia readiness probe.
It emits a v1 `ready` envelope containing the session ID and full tool manifest.
Each following input line is `{ "tool": "get_project_context", "arguments": {} }`.
Each output line is a JSON response. EOF closes the session and disposes host
services. Incomplete/oversized framing closes safely; errors never print stacks.
The protocol also accepts a bounded `requestId` and echoes it on every response;
the request ID correlates transport replies, while an ACT's `arguments.commandId`
is the canonical side-effect identity.
Only the owner-supplied startup project is accessible. Requests cannot open/switch
projects or supply paths. The bridge is disabled until explicitly started.

Stdio pipe possession is the authorization boundary: the launching local process
and its children are trusted to control the selected project. No socket, listener,
port, bearer token, HTTP relay or internet exposure exists. This does not protect
against a compromised local account or hostile harness holding those pipes.

## Manifest and tools

`directorManifest()` is version 1. Every entry declares READ/PLAN/ACT, possible
provider effects, approvals, input/output schemas and canonical payload contracts.
Top-level fields/types/IDs are checked at the bridge; nested Agent, Revision, QC,
inspection, timing and parameter validation remains in the existing owning modules.
Unknown tools/fields are rejected. Objectives/notes are context, never commands.

| Class | Tools |
|---|---|
| READ | `get_project_context`, `get_capabilities`, `get_provider_center`, `get_provider_status`, `get_project_assets`, `inspect_media`, `get_workflow`, `get_workflow_run`, `get_agent_execution`, `get_creative_qc`, `get_creative_revision` |
| PLAN | `plan_agent_execution`, `plan_creative_revision` |
| ACT | `apply_agent_plan`, `run_agent_execution`, `continue_agent_execution`, `run_creative_revision`, `continue_creative_revision`, `evaluate_creative_qc` |

READ inspection may run the existing local probe but does not author workflows,
register output or call providers. PLAN validates without executing production.
ACT requires a unique `commandId` and literal `allowExecution: true`. Remote
execution retains canonical `allowRemoteExecution` and all existing checkpoints.
QC ACT writes immutable evidence; it cannot run production or revise a workflow.

Responses use `{schemaVersion:1,sessionId,status:"ok",data}` or
`{schemaVersion:1,sessionId,status:"error",error:{code,nativeCode}}`. Error classes
include INVALID_REQUEST, STALE_STATE, NOT_FOUND, NOT_READY, APPROVAL_REQUIRED,
PAID_ACTION_REQUIRES_CONFIRMATION, BLOCKED, LIMIT_REACHED,
EXTERNAL_REASONING_REQUIRED and INTERNAL_ERROR. Native blocked/paused/review states
remain visible inside successful dispatch data; dispatch success is not production
success. Unknown internals become sanitized errors.

## Project/context and discovery

Context reads current project/workflow identity and hashes, registered asset
checksums/roles/lineage, Provider Center readiness/spend summaries and only the
session's observed operation references. It is a view, not persisted project state.
Global capabilities come directly from host projection; providers directly from
Provider Center. Asset listing omits internal paths/original filenames. Workflow
reads retain canonical registered relative asset references and add current hash.
Media inspection accepts registered asset IDs only. No arbitrary browse/import,
shell, JavaScript, Python, network request or raw host-dispatch tool exists.

## Agent and revision flows

Read workflow/context → plan Agent v1 request → inspect effects/readiness →
`apply_agent_plan` with the returned plan hash → `run_agent_execution` → observe
Agent/workflow run. Apply and run remain separate explicit actions. Stale workflow
hashes reject through Agent Execution. Logical outputs remain canonical references.

Read QC → plan checksum/workflow-bound Creative Revision request → inspect proposal
→ run revision → observe revision/new QC. Revision delegates to Agent and the same
Workflow Execution run. Existing selective invalidation, unaffected work, cycle
limits, stale checks and append-only evidence remain authoritative. Subjective prose
alone cannot create a correction. Failed work requires explicit current-state re-plan.

Each ACT `commandId` is reserved before delegation. Identical replay returns the
cached response; conflicting reuse rejects. A thrown/interrupted dispatch consumes
the ID and cannot be retried through replay. This is session-only duplicate
protection; callers must inspect canonical state before any reconciliation. A new
command ID never overrides canonical run, uncertainty, revision or approval guards.
There is no automatic continuation, retry, fallback or provider substitution.

## Approvals, paid work and credentials

Plans expose canonical side effects and unknown native costs stay unknown. Remote
permission is never inferred from a plan or generic approval. Human checkpoints
surface paused state and must be satisfied via the existing owner approval API.
There is deliberately no bridge approval tool. Uncertain provider work blocks
canonical progression, including re-plans. The source CLI cannot service MuAPI's
renderer-owned transport; that execution fails closed. No credential migration is
performed. No paid/provider calls are used in acceptance.

No credential setter/remover/getter is exposed. Provider status retains safe
presence/source metadata only. Host credential resolvers remain private. An output
boundary drops credential/header/ciphertext/path-owner fields and redacts known
environment secret values and the selected root. Audit contains only session/tool,
side-effect class, project/workflow, plan/run/revision IDs and outcome, never request
bodies, objectives, evidence bodies or credentials. Audit is bounded in-memory
metadata; durable Agent/QC/Revision records remain canonical. It is not a cost ledger.

## QC external evidence

`evaluate_creative_qc` accepts the existing v1 request with references to already
registered, checksum-bound external assessments. Evaluator ID/type/version,
confidence and target binding retain their existing semantics. Model assessment
never becomes deterministic evidence and cannot satisfy mandatory human review.
Uploading/importing new external assessment bytes through this bridge is deferred;
owner/project tooling must register them first. No human acceptance is fabricated.

## Limits and support

Maximum request: 1 MiB; calls: 512; action IDs: 128; calls serialize. Existing
Agent action/continuation and Revision cycle bounds also apply. All sessions/plans/
run handles are lost on process exit. Do not resubmit remote work after restart
without explicit reconciliation. Durable recovery is deferred.

Source/dev mode works with installed repository dependencies. Trusted Electron host
code can inject its canonical host instance into `createExternalDirector`; this
milestone adds no Electron listener, renderer/preload privilege or browser API.
Standalone CLI uses environment credentials and does not decrypt the Electron
credential store. Browser control and packaged Electron dependency closure remain
unsupported. It does not adopt runs from another Electron/process session. Owner
approval of a paused CLI run requires a trusted embedding using the same host;
the standalone pipe deliberately provides no human-approval attestation tool.
No renderer changes or visual QA are needed.

`tests/externalDirector.test.mjs` exercises the actual stdio process, trusted project
discovery, local Agent/audio/inspection/QC/revision flow with real approved FFmpeg,
immutable old QC, stale rejection, duplicate protection, human pause, external
assessment provenance and secret/error boundaries. Existing control-layer suites
retain provider uncertainty, revision bounds and unaffected-branch acceptance.
Future Work/Astra/Codex integrations need only translate this fixed manifest into
their tool protocol; no application model integration is required.

## External client harness

`plan_creative_revision.arguments.request.structuredIntent` accepts Structured
Creative Revision Intent v1. Its schema is discoverable in the tool manifest and
capability projection. Keep `request.intents` empty when using it. The enclosing
revision request still binds project, workflow hash, QC asset/checksum, selected
findings, scope, run and cycle. See `WHIHM_STRUCTURED_CREATIVE_INTENT.md`.

`lib/whihm-execution/external-director-client.mjs` is a reusable child-process
client. It starts the source bridge, negotiates and validates the v1 manifest,
validates calls against the received schemas, assigns request/action IDs, parses
stdout separately from stderr, correlates replies, refreshes project context, and
tracks only session hashes, IDs and registered asset checksums. It never stores
credential values. `CLIENT_ACT_AMBIGUOUS` is raised after an ACT timeout, lost
process response or transport failure; the client never resends that command ID.
Identical completed action calls reuse the cached response, while conflicting
reuse fails before transport. READ/PLAN timeouts remain ordinary request errors.

The small read demonstration is:

```sh
node scripts/external-director-client.mjs --project /absolute/registered/project --scenario read
```

The client is deliberately not a reasoning engine and has no model SDK. A future
Work/Codex/Astra adapter can call `start()`, `getManifest()`, `call(tool,args)` and
`refreshContext()` while retaining the same structured result/error envelopes.

# Semantic creative review

`plan_semantic_creative_qc` returns an evidence snapshot for an external reasoner.
`evaluate_semantic_creative_qc` accepts a validated external submission and writes
a canonical Creative QC record. Schemas and review policy are in the manifest;
see `WHIHM_SEMANTIC_CREATIVE_QC.md`. Existing client call/action IDs, ambiguity
handling and local stdio boundaries apply. No model API or credential privilege
is added. Semantic review is also described in the generic planning overview.
