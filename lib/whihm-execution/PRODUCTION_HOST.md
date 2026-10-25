# Fixed desktop production transitions

The existing `window.whihmHost` preload surface now exposes two additional fixed
operations. They use the same trusted window/frame checks and source-checkout ESM
loader as readiness. They do not use the renderer runtime transport, provider keys,
uploads, model calls or media processing. No UI, generic RPC, raw fs or shell API
is added. Electron security flags are unchanged.

## Approval

```js
await window.whihmHost.applyWorkflowApproval({
  projectHandle, workflowId, nodeId,
  expectedWorkflowHash,
  expectedLatestRecordId: null, // optional; null means no history yet
  decision: 'APPROVED', // PENDING / APPROVED / REJECTED
  timestamp: '2026-10-25T12:00:00Z',
  actor: { source: 'local-review', id: 'reviewer' }, // optional narrow annotations
  note: 'Review decision', // optional
  inputs: {}, // optional portable input evidence used in dependency scopes
});
```

The host reopens the project with its saved project ID, verifies integrity, loads
the registered canonical workflow, checks the expected hash/history head and calls
existing `setNodeApproval`. A REJECTED decision is a successful persisted transition
whose meaning is rejection; a `status: rejected` response means no successful new
transition was applied. Existing gate/scope/ancestor checks remain authoritative.
Actor annotations accept only string `id`/`source`; arbitrary reference-bearing
metadata is not accepted over this fixed host API.

## Invalidation

```js
await window.whihmHost.applyWorkflowInvalidation({
  projectHandle, workflowId,
  transitionRecordId, // existing latest history record for the known creative edit
  expectedWorkflowHash, // its afterHash and the registered current workflow hash
  expectedLatestRecordId: transitionRecordId, // optional additional guard
  evaluatedAt: '2026-10-25T12:00:00Z',
  beforeInputs: {}, afterInputs: {}, quoteContext, // all optional passive evidence
});
```

The creative change must already be recorded and registered through existing core
project/history APIs. This operation accepts no renderer-supplied workflow replacement,
edit commands, path or function name. It verifies that `transitionRecordId` is the
current history head, reconstructs its before-snapshot, uses the registered workflow
as after-state, and calls existing `invalidateWorkflowProduction`. A new ordinary
history entry preserves its relation to the original transition, affected node IDs,
supplied normalized quotes and retired quote evidence. Semantic paths are already
preserved in the normal record diff; they are not mis-stored as filesystem annotations.

This intentionally exposes evidence persistence, not another workflow-edit API.
Graphs can have any valid node/branch/asset shape, including no assets. No fixed
production pipeline is assumed. Unaffected branches remain unchanged. No physical
asset/output files or old history are deleted.

## Persistence, results and failure boundaries

Both operations return structured `status: applied`, workflow identity, new
`recordId`, before/after hashes, detached canonical workflow, semantic diff,
diagnostics and existing store warnings. Invalidation additionally returns its
existing affected/removed node IDs, invalidated paths and optional quote evidence.
The old history entries/snapshots remain readable. Unknown/malformed fields, unsafe
data, foreign handles, missing workflows/nodes, corrupt projects and stale hashes
fail before a successful transition. A stale `transitionRecordId` cannot be replayed
after a later history entry exists. Same-session overlapping writes return
`HOST_TRANSITION_BUSY`; existing store locks and head guards protect the write boundary.

Persistence uses the established sequence: `history.recordEdit`, then
`project.updateWorkflowInProject`, with expected hashes/head IDs. Existing stores
provide individual atomic writes, not a new cross-store transaction. If history
commits and project publication then fails, the response is `status: partial`,
`PROJECT_COMMIT_INCOMPLETE`, the durable record ID and recoverable canonical workflow.
Do not automatically retry, delete history or pretend the operation was rolled back.
Reconcile through the existing trusted project API using the returned/history snapshot
and the actual registered expected hash. Normal project reopen fails closed on
history/registry drift until that explicit recovery. This task does not add generic
renderer recovery/filesystem access or change the storage format.

The functions persist canonical evidence. Readiness enforces decision meaning;
there is no automatic execution after an approval or invalidation result.
Packaged-app source inclusion remains the pre-existing packaging limitation.

The companion [media audit](./DETERMINISTIC_MEDIA_AUDIT.md) records existing media
capabilities and a probe-first future milestone; none of that recommendation is
implemented here.
