# Deterministic workflow edit commands v1

The command layer transforms WHIHM Workflow Document v1; it is not a second source
of truth, execution engine, provider integration, planner, CLI or history store.
No clocks, random IDs, filesystem writes, network calls or side-effecting tools run.

## Public API

- `hashWorkflow(document)` → lowercase SHA-256 hex.
- `diffWorkflows(before, after)` → ordered semantic change records.
- `validateCommandBatch(batch)` → `{valid, errors}`.
- `applyEditBatch(document, batch)` → structured result below.
- `commandSchema` → frozen machine-readable schema.
- Package export `whihm-workflow-core/commands-schema` → `commands.schema.json`.

The Draft 2020-12 command schema references canonical entity definitions by
`urn:whihm:workflow:v1`; register both exported schemas with an external schema tool.
Runtime checks also reject non-JSON/credential material, unsafe pointer segments and
unknown fields. Canonical entity semantics and references are checked on the final
candidate. Complete entity values are recommended; temporary graph-binding
inconsistency within a batch is permitted, but never returned as applied state.

## Example command file (plain JSON)

```json
{
  "commandVersion": 1,
  "allowedPaths": ["/nodes/video/executor/model"],
  "preconditions": [{"at": "/nodes/video", "exists": true}],
  "commands": [
    {
      "type": "set-model",
      "targetId": "video",
      "value": "future-model-x",
      "preconditions": [{"at": "/nodes/video/executor/model", "equals": "illustrative-specialist"}],
      "reason": "Use the requested specialist model"
    }
  ],
  "dryRun": true,
  "metadata": {"requestId": "example-request"}
}
```

Supply `expectedWorkflowHash: hashWorkflow(currentDocument)` to guard the entire
state. There is no automatically managed revision number. Hashes cover the exact
UTF-8 output of canonical `exportWorkflow`, including its final newline. Object-key
ordering and JSON formatting do not matter; array order, canonical metadata and
timestamps do. Future hash-format changes require an explicit version transition.

## Commands

All support optional `preconditions`, `reason` (text), and `metadata` (object).
All IDs and entity values are provided by the caller; no implicit creation/repair.

| Type | Required operands | Effect |
|---|---|---|
| add-node | value: canonical node | Append a node |
| remove-node | targetId | Remove an unreferenced node |
| update-node | targetId, changes | Shallow field replacement; ID patch forbidden |
| rename-node-title | targetId, value: string | Change title only |
| enable-node / disable-node | targetId | Set enabled boolean |
| set-executor | targetId, value: executor | Replace executor object only |
| set-provider / set-model | targetId, value: string | Change executor.provider/model only |
| set-node-parameter | targetId, parameterPath, value | Set one parameter location |
| remove-node-parameter | targetId, parameterPath | Remove an existing parameter |
| add-edge | value: canonical edge | Append an edge |
| remove-edge | targetId | Remove an edge |
| reconnect-edge | targetId, changes: source and/or target | Replace complete endpoint(s) only |
| add-workflow-input / add-workflow-output | value: declaration | Append interface declaration |
| remove-workflow-input / remove-workflow-output | targetId | Remove declaration |
| add-asset | value: canonical asset | Append asset declaration |
| update-asset | targetId, changes | Shallow field replacement; ID patch forbidden |
| remove-asset | targetId | Remove an unreferenced asset |
| attach-asset-to-node | targetId, assetId | Append to assetRefs if not attached |
| detach-asset-from-node | targetId, assetId | Remove existing attachment |
| set-node-position | targetId, value: {x,y} | Set position only |

Parameters use JSON Pointer relative to `node.parameters`, e.g. `/duration` or
`/export/fps`. Escape literal `/` as `~1` and `~` as `~0`. Parent containers must
already exist. Existing array indexes can be set/removed; removing an array item
shifts following entries. Replace the array explicitly to append. No implicit
parent creation. Empty string parameter keys use `/`.

Changing model identity never rewrites ports/params/edges or titles. Known canonical
incompatibilities fail validation; provider/model-specific capability compatibility
is still a future layer and cannot be certified by this provider-neutral core.

## Atomicity, order and preconditions

1. Validate original workflow and serializable command request.
2. Check expected workflow hash and batch preconditions against original state.
3. Clone the document; process commands in supplied order.
4. Check each command's preconditions immediately before that command on the draft.
5. Validate the complete candidate, compute diff/hash, enforce allowed scope.
6. Return applied document only if every check succeeds.

Preconditions are `{at: semanticPath, exists: boolean}` and/or `{at, equals: JSON}`.
Equality ignores object-key order, preserves array order and distinguishes missing
from null. `exists: false` cannot be combined with equals. A failed precondition is
never overridden. Earlier command changes are visible to later preconditions.

Forward node references in new edges/interfaces can be resolved by later commands
in the same batch. In contrast, removal is checked at its command position: remove
connections/dependencies first, then remove their node. Removal never cascades.
Guards cover edge endpoints, interface bindings, explicit node dependencies, legacy
parameter expressions, structured `$nodeOutput` and `$asset` references, including
fallback policies and workflow-input defaults. Opaque metadata remains archival;
putting executable references there is outside the canonical contract.

A batch is an in-memory transaction. There is no persisted commit/lock/CAS here.
Future storage must compare the expected hash again at its write boundary to prevent
concurrent writers from overwriting each other after this function returns.

## Semantic paths, diff and allowed scope

Top-level entity collections use logical IDs rather than array indexes:

- `/nodes/video/title`
- `/nodes/video/executor/model` (not `/nodes/video/model`)
- `/nodes/video/parameters/duration`
- `/edges/clip_to_compositor/source/nodeId`
- `/outputs/final/source/portId`
- `/assets/logo/localPath`

Nested arrays still use numeric indexes for precondition reads. Pointer escaping is
RFC 6901 style; reserved prototype-related segments are forbidden. These semantic
paths are not raw JSON Pointers into the document's top-level entity arrays.

Diff rows use `collection`, `id` where applicable, `path`, and `operation`:
`added`, `removed`, `modified`, or `reordered`. Add/remove records include detached
entity values and their array index. Modified records contain field changes with
before/after values (missing sides omitted). Workflow-level fields use collection
`workflow`. Array-valued fields are reported as whole values to expose ordering
changes rather than disguising shifted clips/ports as narrow leaf edits. Reordering
surviving top-level IDs produces a collection-level reordered record.

`allowedPaths` permits exactly a path or its descendants, with segment boundaries.
Omitting it permits all supported changes. An empty list permits no net change.
For example `/nodes/video/title` cannot authorize changing the model or another
node with a similar ID. Arrays require permission on the array field; a clip splice
cannot claim permission only for index 0. Entity additions/removals require entity
or collection scope. Top-level reorder requires collection scope. No wildcards or
implicit aliases. Scope applies to the final net canonical diff, not intermediate
private mutations. No transient mutation invokes external behavior.

## Result and errors

Results contain `status`, `beforeHash`, `afterHash`, `commands`, `diff`, `validation`,
`errors`, `warnings`. Only `status: applied` includes `workflow`, detached from the
input and command objects. `dry-run` contains the same prospective hash/diff as an
actual application, but deliberately no workflow document. Run the same commands
with the original expected hash and dryRun false to apply after review.

Rejected early batches have null afterHash and an empty diff; no partially applied
candidate is returned. Validation errors describe the candidate failure. Scope
rejections can include a valid prospective hash/diff, but never a workflow. Invalid
or secret-bearing requests are not echoed. Dynamic values which become secret
fields also suppress the command echo. This inherits the core's heuristic secret
screening; it is not an arbitrary-secret detector.

Diagnostic codes include:

- WORKFLOW_HASH_MISMATCH, PRECONDITION_FAILED
- NODE_NOT_FOUND / NODE_ALREADY_EXISTS
- EDGE_NOT_FOUND / EDGE_ALREADY_EXISTS
- ASSET_NOT_FOUND / ASSET_ALREADY_EXISTS / ASSET_NOT_ATTACHED
- WORKFLOW_INPUT_NOT_FOUND / WORKFLOW_INPUT_ALREADY_EXISTS
- WORKFLOW_OUTPUT_NOT_FOUND / WORKFLOW_OUTPUT_ALREADY_EXISTS
- REFERENCED_NODE_REMOVE_BLOCKED / REFERENCED_ASSET_REMOVE_BLOCKED
- PARAMETER_PATH_NOT_FOUND / PARAMETER_NOT_FOUND
- INVALID_COMMAND / UNSUPPORTED_COMMAND / UNSUPPORTED_COMMAND_VERSION
- INVALID_PRECONDITION / INVALID_SCOPE / IMMUTABLE_ID
- INVALID_EXECUTOR / INVALID_ASSET_REFS
- COLLATERAL_CHANGE_DETECTED
- INPUT_WORKFLOW_INVALID / RESULTING_WORKFLOW_INVALID / PORT_NOT_FOUND

Core validation codes remain in `validation.errors`. Command failures include
`commandIndex` (null for batch preconditions). No diagnostic echoes actual/expected
secret values. Store original document/hash, request, resulting document/hash and
diff in a future history layer; none is persisted here.

## Verification

```sh
npm run test -w whihm-workflow-core
npm run check -w whihm-workflow-core
npm exec --no -- eslint packages/whihm-workflow-core/src packages/whihm-workflow-core/tests
```

Tests reuse the existing media fixture and construct small graphs in memory.
They cover model/title isolation, stale-state conflict, atomic rejection, dry runs,
semantic diff/scope, removal guards, a Video Combiner pipeline and a complete
heterogeneous media workflow from an empty document. No executor is invoked.
