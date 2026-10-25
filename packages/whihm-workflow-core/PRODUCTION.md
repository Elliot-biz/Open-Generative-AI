# Production evidence, approvals and selective invalidation

This is a pure, local control layer. Readiness remains the authoritative assessment;
these APIs neither authorize provider calls nor execute a workflow. Canonical v1,
the existing command engine, semantic diff, serializer, hashing and project/history
stores remain authoritative. No schema, project format or history migration is needed.

## Renderer consumer

`src/lib/whihmReadinessClient.mjs` exports
`assessCurrentWorkflowReadiness(request, { host = window.whihmHost } = {})`.
It calls only the fixed `host.assessWorkflowReadiness` preload operation, snapshots
JSON input/output, preserves structured host rejections and sanitizes exceptions.
It accepts the existing host request fields: `workflow`, `workflowId`, `projectHandle`,
`evaluatedAt`, `inputs`, `nodeStates`, `quoteContext`, `quotePolicy`, `budget`,
`localState`. Unknown fields, non-JSON data and arbitrary project roots are rejected.
A READY result is data and causes no action. No new IPC or UI is introduced.

## Evidence format and API

Node `metadata.production` is a reserved, versioned metadata extension:

```json
{
  "schemaVersion": 1,
  "workflowId": "campaign",
  "approval": {
    "workflowId": "campaign",
    "workflowHash": "<full canonical SHA-256 at decision time>",
    "nodeId": "storyboard",
    "scopeHash": "<dependency scope SHA-256>",
    "decision": "APPROVED",
    "decidedAt": "2026-10-25T12:00:00Z",
    "actor": { "source": "local-review" },
    "note": "Review decision"
  }
}
```

`approval` and `derived` are optional. Derived evidence contains `workflowId`,
`nodeId`, `workflowHash`, `scopeHash`, `status` (VALID/STALE), `outputHash` and
`recordedAt`. `outputHash` is a caller-supplied SHA-256 identity for the result
or output bundle. This layer does not inspect or create media. Changing that
identity invalidates dependent results and reviews, including an approval of
that node's own output. No physical file is deleted or rewritten.

Public APIs:

- `setNodeApproval(workflow, {nodeId, decision, timestamp, expectedWorkflowHash,
  inputs?, actor?, note?})`: PENDING/APPROVED/REJECTED decision on a declared gate.
- `recordNodeOutput(workflow, {nodeId, outputHash, timestamp, expectedWorkflowHash,
  inputs?})`: record supplied output identity/validity.
- `getNodeProductionEvidence(workflow, nodeId, {inputs?, evaluatedAt?})`: effective approval
  state, derived validity, original records and current scope hashes.
- `hashNodeProductionScope(workflow, nodeId, {inputs?, includeOwnOutput?})`:
  canonical hash of the dependency projection; approval scopes include own outputs.
- `invalidateWorkflowProduction(before, after, {evaluatedAt, beforeInputs?,
  afterInputs?, quoteContext?})`: detect material scope changes and mark existing
  evidence STALE. Returns existing applied edit-result fields plus `batch`,
  `sourceDiff`, `affectedNodeIds`, `removedNodeIds`, `invalidatedPaths` and optional
  normalized `quoteContext`/`retiredQuotes`.
- `bindWorkflowQuotes(workflow, quoteContext, {evaluatedAt, inputs?})`: bind
  externally supplied quotes for this exact workflow hash to node scopes.

Mutation APIs return detached standard `applyEditBatch` results and their exact
replayable command `batch`. Invalid input returns `status: rejected` with structured
errors. Expected hashes reject stale decisions. Every time is explicit. Reserved
evidence is validated separately from canonical schema validation; malformed
evidence blocks readiness with PRODUCTION_STATE_INVALID. No secrets, machine paths
or raw errors are included. Decisions are audit evidence, not identity signatures
or a user-authentication/permissions system.

## Approval enforcement

Readiness recognizes the same manual/control declarations as before. Missing or
PENDING approval gives APPROVAL_PENDING and downstream WAITING_MANUAL. APPROVED
resolves the gate only when workflow/node identity and its production scope match.
REJECTED gives hard APPROVAL_REJECTED and downstream UPSTREAM_BLOCKED. A materially
outdated approval is effectively STALE even before explicit invalidation is saved;
readiness reports APPROVAL_STALE plus APPROVAL_PENDING. A stale derived output
gives hard OUTPUT_STALE until current output evidence is supplied.

Legacy `nodeStates[id].manualResolved` remains accepted input for compatibility but
cannot resolve or override a gate. Approval records in canonical metadata are the
only resolution evidence. Approving requires current known derived inputs and
approved upstream gates; known stale inputs give APPROVAL_INPUT_UNRESOLVED. This
does not demand invented output evidence for a manually reviewed item with no
recorded artifact. Reapproving is an explicit new version transition. Readiness
uses its explicit evaluation time: future-dated decisions cannot resolve a gate.

## Dependency scopes

The canonical validator discovers edges, explicit dependencies, embedded parameter
and fallback references, and workflow-input defaults. Readiness and production
scopes share the extracted `workflowDependencyMap`; no second dependency parser
exists. The current node and its transitive ancestors determine its scope.
Reconnect/removal is captured by recomputing the scope, so former dependencies
cannot silently survive. Disabled disconnected branches have no active-path effect;
an explicit edge from an inactive source remains a real blocked dependency.

The scope projection uses the existing canonical SHA-256 implementation. It includes
executor/model/tool, settings, port/interface definitions and order, relevant inputs
(including supplied values), asset bindings/declarations/checksums, edges,
dependencies and ancestor output identities. Node logical identity is preserved.
Workflow-wide execution/review/variant settings and unknown definition metadata
remain conservative material inputs. Workflow ID namespaces every scope.

Names/titles/labels, canvas positions, document timestamps and explicitly reserved
`metadata.presentation` are cosmetic. Node `metadata.production` is excluded from
definition hashing to avoid circular hashes; ancestor output identities are added
separately. Other metadata (including `oga.mode`) remains material. The full
`workflowHash` remains the historical version reference, not the freshness test.
Different runtime input evidence must be supplied consistently when approving,
recording results and assessing. External media content changes must update its
canonical checksum or output identity. Unrecorded external changes cannot be inferred.

## Quotes

Quote envelopes stay external, preserving source, amount/currency, timestamps,
expiry, provider/model and original full workflow hash. A current envelope can be
explicitly enriched with `quote.metadata.whihmScope`:
`{schemaVersion: 1, scopeHash, status: "BOUND"}`. Readiness checks that scope per node,
plus the existing age/expiry/model/provider/currency rules. Unrelated or cosmetic
edits preserve those bindings. Changed node/dependency scopes are STALE; unknown
costs never become zero and cannot prove budget compliance.

Legacy quotes without this binding keep the original whole-workflow hash rule.
Explicit invalidation can attach scopes to unbound entries when their envelope hash
exactly matches the supplied BEFORE document. It reports
`quoteBindingSource: "verified-before-workflow"` and preserves the original envelope
hash, prices and timestamps. Without that exact historical state, no binding is inferred.
Old or stale envelopes are never automatically rebound to a new hash. Explicit
invalidation preserves their original values and marks affected bound entries
STALE with `invalidatedAt`. Quotes for removed nodes are returned losslessly in
`retiredQuotes` and excluded from the current envelope. The original input envelope
is unchanged. Quote fetch, repricing and automatic refresh are absent.

## Persistence and history

Approval/output/invalidation transitions use ordinary `update-node` metadata
commands. Persist with the existing sequence:

```js
const before = (await project.getProjectWorkflow(id)).workflow;
const result = setNodeApproval(before, {
  nodeId: 'storyboard', decision: 'APPROVED', timestamp,
  expectedWorkflowHash: hashWorkflow(before),
});
// Check result.status before using it. Existing stores enforce freshness again.
await history.recordEdit({ before, result, batch: result.batch });
await project.updateWorkflowInProject({
  workflow: result.workflow, expectedHash: hashWorkflow(before),
});
```

Record a creative edit normally, then record explicit invalidation as the next
normal evidence transition using `before: creativeEdit.workflow`. This keeps both
exact requested edits and derived-evidence changes inspectable. Historical snapshots
retain old approvals/results. Existing append-only rollback, hashes, store locks,
atomic persistence and drift/reconciliation rules apply; no cross-store transaction
or automatic writer is introduced. Skip an empty invalidation batch if no evidence
changed. If preserving external quote changes, include supplied/invalidated envelopes
and retired quotes in existing history record metadata or a project preset; there is
no parallel quote store. Project relocation carries canonical metadata and history.

## Deliberate boundaries

No execution, scheduling, approvals UI, rendering, provider authentication, automatic
downloads, network requests or installer changes. Low-level execution APIs still
require their existing explicit authorization; this task enforces production gates
in readiness. Future execution consumers must use the authoritative readiness report.
