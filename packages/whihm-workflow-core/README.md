# WHIHM workflow core v1

A local, provider-neutral, machine-authorable JSON document and pure authoring library.
No execution engine, provider calls, storage service, UI, planner, snapshots or rollback
system is included. React Flow is not the source of truth. Requires Node >=20.19.
No runtime dependencies.

## Commands

From the repository root:

```sh
npm run check -w whihm-workflow-core
npm run test -w whihm-workflow-core
```

The package is an explicit npm workspace named `whihm-workflow-core`. It uses native
ES modules and needs no Babel/build output. Export `whihm-workflow-core/schema` is
`schema.json`, a Draft 2020-12 machine-readable JSON Schema. The runtime validator
interprets only the schema keywords actually used by this bundled schema, plus the
semantic checks below; it is not a general-purpose JSON Schema implementation.

## Authoring contract

```js
import {
  createWorkflow, addNode, addWorkflowInput, addWorkflowOutput,
  updateNode, validateWorkflow, exportWorkflow, importWorkflow,
} from 'whihm-workflow-core';

let workflow = createWorkflow({ workflowId: 'job_001', name: 'Brief preparation' });
workflow = addNode(workflow, {
  id: 'brief', title: 'Creative brief', kind: 'planning',
  executor: {
    type: 'remote-model', id: 'provider.model', provider: 'example',
    model: 'illustrative-model', mayCostMoney: true, requiresConfirmation: true,
  },
  position: { x: 0, y: 0 },
  inputs: [{ id: 'prompt', type: 'text' }],
  outputs: [{ id: 'plan', type: 'text' }],
  parameters: {},
});
workflow = addWorkflowInput(workflow, {
  id: 'request', type: 'text', required: true,
  targets: [{ nodeId: 'brief', portId: 'prompt' }],
});
workflow = addWorkflowOutput(workflow, {
  id: 'plan', type: 'text', source: { nodeId: 'brief', portId: 'plan' },
});
workflow = updateNode(workflow, 'brief', { title: 'Campaign plan' });
const report = validateWorkflow(workflow);
const restored = importWorkflow(exportWorkflow(workflow));
```

Every helper returns a detached document and validates the candidate. The original
is never changed. IDs/timestamps come from the caller: no clocks or random IDs.
`updateNode` is a shallow field patch: supplying `parameters` replaces that field,
not an ambiguous recursive merge. It cannot change the logical ID. Removing a
referenced node/asset fails; there is no silent cascade deletion.

Exports: `createWorkflow`, `addNode`, `removeNode`, `updateNode`, `addEdge`,
`removeEdge`, `addWorkflowInput`, `removeWorkflowInput`, `addWorkflowOutput`,
`removeWorkflowOutput`, `addAsset`, `removeAsset`, `validateWorkflow`,
`assertWorkflow`, `editWorkflow`, `exportWorkflow`, `importWorkflow`,
`migrateWorkflow`, `getExecutionContract`, `importUpstreamWorkflow`,
`workflowSchema`, `SCHEMA_VERSION`, `DATA_TYPES`, `compatibleTypes`, `WorkflowError`.

Use `editWorkflow(doc, draft => { ... })` for an atomic multi-field change or for
bulk construction with forward references. Only the final candidate is validated.
The callback is caller code, not a sandbox for untrusted scripts. Use declarative
helpers rather than evaluating arbitrary agent-supplied JavaScript.

## Canonical document

Required: `schemaVersion: 1`, `workflowId`, `name`, `nodes`, `edges`, `inputs`,
`outputs`, `assets`. Optional description, ISO timestamps and `metadata`,
`execution`, `review`, `variants` extension objects. Unknown canonical fields are
rejected rather than silently dropped. Custom JSON belongs inside extension objects.

Nodes have logical `id`, independent `title`, extensible `kind`, an `executor`,
ordered `inputs`/`outputs` ports and `parameters`. Optional finite x/y position,
assetRefs, explicit dependency node IDs, enabled state, metadata and execution,
retry, fallback and cost policies. Policy objects are reserved extension contracts;
this package does not enforce budgets, retries, approval or runtime scheduling.

Executor types: `remote-model`, `local-ai`, `utility`, `control`. The `id` identifies
a future executor adapter, separate from model/tool and title. Remote models require
provider/model; utility/control require a tool identifier. Local AI may name a model
or tool. Explicit `mayCostMoney` and `requiresConfirmation` booleans are mandatory.
Future executors must independently enforce capability and cost declarations: an
agent setting `mayCostMoney: false` is not authorization for a free remote run.

`getExecutionContract` exposes consumes/produces, parameters, explicit and embedded
dependencies, asset references, executor identity, enabled state and policies. It
never executes anything. In the absence of policy, the descriptor specifies one
attempt and no fallback. Provider catalogs are not required for WHIHM-owned tools.

## Ports, bindings and dependency references

Built-in types: text, image, video, audio, json, object, file, asset, boolean, number,
selection, result, any. Custom type identifiers are allowed with a capability-review
warning. Equal types connect; any is permissive; image/video/audio can feed file;
object can feed json. Other conversions require explicit nodes. Port cardinality
is `one` (default) or `many`; a list cannot feed a scalar. Multiple bindings require
a many input. This is connection compatibility, not media codec validation.

Edges contain id, source `{nodeId,portId}`, target `{nodeId,portId}`, optional metadata.
Workflow inputs declare types and explicit input-port targets. Workflow outputs
explicitly name an output-port source and its exposed type. Empty inputs/outputs
are allowed during authoring; execution readiness is a later validation layer.
Likewise, unbound required ports, cycle scheduling, disabled-node scheduling and
capability-specific parameter semantics are not executed or certified here.

Parameters can use `{"$nodeOutput":{"nodeId":"trim","portId":"video"}}` and
`{"$asset":"brand_logo"}`. Legacy `{{ nodeId.outputs[0].value }}` references are
preserved and validated against ordered output ports. Unknown interpolation syntax
is rejected, never executed. Explicit node `dependencies` are also validated.
The validation report includes dependencies from edges and parameters so a future
planner does not mistake the visible graph for the complete dependency graph.
Metadata is archival/opaque; do not place executable references there. Fallback
policy references must use `$nodeOutput`; executor-specific policy semantics are
reserved for future capability validation.

## Assets, serialization and portability

Assets: logical ID, type, localPath and/or remoteUrl, optional SHA-256 checksum,
metadata. localPath uses project-relative forward slashes; absolute paths, parent
traversal, drive letters and node_modules paths are rejected. Paths are logical
references only: existence/checksum verification and secure path resolution are
future asset-store responsibilities. Fixture assets are declarations, not real media.

Only plain finite JSON values are accepted. Cycles, undefined, accessors, hidden or
symbol properties, sparse arrays, non-JSON objects and negative zero are rejected.
Export sorts object keys recursively, preserves ALL array order, uses two-space
indentation and a trailing newline. Array order can encode clip sequence and legacy
output indexes; it must never be sorted automatically. Import validates and retains
all canonical fields. No secret stripping is performed by canonical export: unsafe
documents fail closed instead of producing a deceptively incomplete template.

Obvious credential fields, bearer/private-key/token-like values and credential or
signature-bearing URLs are rejected with structured errors that do not echo values.
This heuristic is defense-in-depth, not a guarantee that arbitrary prose contains no
secret. A separate credential vault and explicit export review remain necessary.
Reconnect credentials on a new machine; never place them in parameters or metadata.

## Validation and migration

`validateWorkflow` returns `{ valid, errors, warnings, dependencies }`; errors use
stable `code`, JSON Pointer `path`, and a human-readable `message`. Helpers throw
`WorkflowError` with the same `errors` array. JSON/schema failures, duplicate IDs,
missing endpoints/ports/assets, invalid bindings, positions, timestamps, embedded
references, unsafe paths, secret-like data and unsupported versions are rejected.
`schema.json` covers document shape; semantic checks live in `src/validate.js`.

Only v1 exists. `migrateWorkflow(v1)` validates and returns a detached copy. Future
pure migration functions register by source version in the private migration map;
a future schema release must add migration and round-trip fixtures together.
Unknown versions fail closed. Import never silently migrates.

## Read-only upstream adapter

`importUpstreamWorkflow(payload, {workflowId?})` accepts the inspected upstream
`{workflow_id,name,edges,data:{nodes:[...]}}` payload. It returns
`{workflow,valid,diagnostics,validation}`. It never calls upstream or writes back.
Recoverable IDs, model identifiers, positions, parameters, edges and embedded refs
are converted. Sanitized complete source is retained in `metadata.upstream`, and
node source records are retained too. Archival source is not synchronized after edits.

Port types/ordering are inferred from edge handles and available output records.
Ambiguous mapping requires review; no capability correctness is claimed. Missing
custom titles default to node IDs. Explicit workflow IO and portable asset files
cannot be recovered; arrays remain empty with diagnostics. Missing workflow IDs
require a caller-supplied stable ID before the result is marked valid. Utility
execution location/cost is not assumed local/free. Unsupported parameters and
malformed references remain visible validation failures rather than being erased.
Secrets are omitted with diagnostics; unsanitized secret-like or non-JSON data causes
a null document. Raw upstream input is never mutated.

## Fixtures

- `minimal.json`: smallest valid authoring document.
- `heterogeneous-media.json`: brief → LLM → image/video → refinement → local mask →
  logo compositor → trim → ordered Video Combiner → QC → export. Includes policies,
  portable logo reference, independent titles and explicit workflow IO.
- `upstream.json`: synthetic two-node upstream payload with a parameter dependency.

All are offline examples; none contains real credentials or generated outputs.

## Declarative exact edits

The additive edit-command layer is documented in [EDIT_COMMANDS.md](EDIT_COMMANDS.md).
Use `applyEditBatch` for serializable commands with expected-hash protection, dry run,
semantic diff, allowed-path enforcement and atomic validation. `hashWorkflow`,
`diffWorkflows`, `validateCommandBatch` and `commandSchema` are also exported.
It does not replace the canonical document or execute any workflow.
