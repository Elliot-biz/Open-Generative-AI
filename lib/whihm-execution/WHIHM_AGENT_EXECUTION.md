# Agent Execution Foundation v1

`AGENT_EXECUTE` / `agent-execution` / `agent_execute` is a model-neutral authoring
and control layer above Workflow Execution. External Astra/other harnesses supply
structured intent and actions. No model, prompt engine, provider client, model
ranking, fallback or autonomous action loop is embedded.

Upstream Open-Poe agent UI architects/executes hosted agent services; it does not
supply WHIHM's revision/asset/approval/session guarantees. V1 instead reuses the
canonical applyEditBatch, history writer, project compare-and-swap and existing
Workflow Execution instance. It does not implement another DAG runner.

## Structured contract

A plan requires schemaVersion=1, planId, projectId, workflowId,
expectedWorkflowHash, objective, actions, requirements and stopConditions.
Optional previousExecutionId names an existing agent session for explicit re-plan;
optional notes are annotations only. Private reasoning is never requested.

stopConditions must equal `["blocked","failed","awaiting_user","uncertain"]`.
Limits: 64 actions, 32 plans/project session, eight total execution/continuation
steps per agent record. Calls are explicit; observation/get does not execute.
All JSON is portable, bounded and checked for secret/path material. Canonical
parameterPath pointers use the existing edit validator rather than file-path rules.

Actions are ordered `{id,type,dependsOn,command?}`. IDs are unique. Dependencies
must refer backwards in the action array. All edits apply as one atomic batch;
there is no second action scheduler. Supported edit types are canonical add-node,
remove-node, set-node-parameter, add-edge, remove-edge; command.type must match.
The last action is run-workflow or stop; no earlier terminal action is allowed.
Run hands off only after apply; stop does not authorize run/resume.

Example parameter amendment:

```json
{"id":"adjust","type":"set-node-parameter","dependsOn":[],
 "command":{"type":"set-node-parameter","targetId":"mix",
 "parameterPath":"/definition/tracks/0/gainDb","value":-3}}
```

Use semantic JSON pointers supported by the canonical edit contract. No raw code,
host commands, arbitrary file operations or shell/media command syntax is accepted.
BIND_ASSET and BIND_LOGICAL_OUTPUT use existing `$asset`/`$nodeOutput` values and
canonical typed edges inside add-node/set-node-parameter/add-edge, rather than a
new reference system. No physical ID for a future output is invented. Future
inspection/image-finishing/mux inputs can bind upstream outputs; a future Timeline
requiring an unknown asset checksum needs a later explicit amendment after observation.

requirements covers every non-checkpoint node with
`{nodeId,capabilityId,executorKey}` from exact projection entries. The chosen
executor/provider/mode must match; unavailable/deferred/catalog-only entries reject.
Agent/workflow executors cannot recursively appear as child nodes. No substitution.

## Validation and boundaries

planAgentExecution validates the entire draft via canonical edits and Workflow
Execution.plan without writing project state or executing/probing providers/tools.
Ready nodes use existing authoritative input contracts. Pending local inspection,
Timeline, Audio Production and image-finishing/mux families use their independent
validators where available; unsupported pending parameter families reject. Unknown
future source technical facts/readiness remain required at Workflow dispatch.
This is a deliberate bounded v1 envelope, not universal provider authoring support.

Planning returns proposed edits, plan hash, originating/resulting workflow hashes,
conservative affected node IDs, exact bindings, effects, approval/readiness report.
Action plans are session-owned; returned JSON is a detached view, never authority.

applyAgentPlan requires the stored plan hash and allowExecution:true, revalidates
against current workflow hash/assets/readiness and reuses atomic applyEditBatch.
Any invalid edit rejects the whole draft. The canonical history record is appended
before existing project publication, with expected history head and workflow hash.
These stores are not a new multi-file transaction: publication failure reports a
blocked reconciliation state and the history record ID; it does not erase history
or automatically retry. Audit records retain plan ID/hash and edit commands.

Workflow definitions containing existing confirmation/checkpoint gates allow only
parameter amendments, not structural agent edits. This conservatively prevents
removing or routing around those gates. New checkpoints are ordinary canonical
control approval nodes, validated by Workflow Execution. Agent APIs never approve.

runAgentExecution requires explicit allowExecution and the exact applied revision;
remote/provider effects additionally require literal allowRemoteExecution:true.
Native cost remains unknown unless the existing result reports it. Effects distinguish
local execution, remote provider work and approval gates; edits are local mutations.
Notes/prose do not grant execution permission. Repeated run cannot start again.

getAgentExecution is read-only. continueAgentExecution uses engine.get/current
revision and engine.resume, preserving the same run and completed work. Generic
human checkpoints summarize as awaiting_approval; provider user/liveness boundaries
remain awaiting_user. Approve/confirm via existing external human workflow APIs.
Agent continuation permits known polling only; it cannot confirm Suno liveness.

Uncertain provider state blocks continuation and blind restart/re-plan. Known
operation polling delegates to existing engine semantics, never a new submit.
Unconfirmed control-call exceptions also leave an execution barrier. No automatic
retry, fallback, executor switch or node recreation is performed.

## Re-plan, state and audit

A new explicit plan references previousExecutionId and the current project hash.
It cannot cross project/workflow sessions. After safe edits, engine.invalidate marks
actual affected results stale and preserves unaffected completed work. A subsequent
explicit continue may supply rerunNodeIds; stale work is not automatically regenerated.
Failed reconciliation blocks further execution. Removed/changed provider operations
cannot be restarted while their previous outcome is uncertain.

Agent summaries are validated, ready, applying, executing, completed, blocked,
failed, awaiting_approval/awaiting_user; native run state remains authoritative in
the returned run snapshot. Diagnostic categories preserve native execution failure,
readiness, authorization, provider, output and dependency evidence; invalid/stale
plans and limits have stable control-layer codes. Failures are never an implicit
retry instruction.

Audit includes plan/version, source/result revision, actions, conservative affected
nodes, exact capabilities/bindings/effects, durable edit record ID, run ID, observed
approvals, diagnostics and agent summary. No hidden chain of thought or new global
provenance is stored. Session maps/continuation state do not survive restart.
History survives only as edit evidence, not as trusted run rehydration state.

## APIs, discovery and acceptance

Fixed host/preload surface: planAgentExecution, applyAgentPlan, runAgentExecution,
getAgentExecution, continueAgentExecution. All calls use projectHandle; apply/run/
continue require execution permission. Both agent and direct host operations use
the same project-scoped Workflow Execution instance and host transition lock.
Projection adds one entry/group (52 groups /620 entries), dynamically consumed by
Astra planning without a parallel registry or model-specific branch.

compileAgentWorkflowPlan deterministically translates an explicitly authored
canonical graph into ordered canonical edit actions for an empty registered
workflow. It infers no artistic intent, provider preference or graph structure.
The existing action benchmark's structured production decisions already produce
its graph; a tiny dispatch seam lets acceptance send that graph through agent
plan/apply/run. Its cuts, pitch, ducking, riser, output inspection and objective
metrics remain unchanged. Direct benchmark execution remains the default.

Unsupported v1: arbitrary natural-language-to-workflow inference, general update-node/
set-executor commands, structural changes around existing gates, unresolved remote
parameter families, automatic model selection, generic retries, paid QA, durable
agent/workflow runs, Creative QC and packaging repair. Broader authoring needs must
add owner-provided validators rather than weaken this validation boundary.

Machine-added nodes may not carry metadata.production approval/derived records;
only the existing human/workflow mechanisms can supply those. Disabled generic
approval nodes and any amendment removing an existing gate's dependency reachability
are rejected. Project-session uncertainty is checked across agent records, so a
new plan/workflow cannot disguise a retry. Remote confirmation actions are external,
not agent-authored operations. The resolved Workflow binding mode must match the
selected projected entry exactly.

Implementation QA: 22 new tests pass, including a real agent-authored action-edit
benchmark, explicit external approval, atomic rejection, same-run re-plan, mocked
uncertainty/polling, remote permission and forged-approval rejection. 973 unique
targeted tests pass across affected suites. Syntax/ESLint pass for all 17 touched
JS/MJS files; no provider calls, paid jobs, dependencies, renderer/browser work or
packaging changes. The current real runtime is the existing staged 7.0.2 pair.
