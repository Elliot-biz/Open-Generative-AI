# Readiness evidence adapter

Open Generative AI is the runtime foundation. This nonvisual Node/application-side
adapter normalizes existing evidence for `assessWorkflowReadiness`; it does not
create a catalog, project reader, executor registry, quote service or scheduler.
The canonical document and the existing readiness evaluator remain authoritative.

## Public library operations

```js
import {
  buildWorkflowReadinessContext,
  assessProjectWorkflowReadiness,
} from './lib/whihm-execution/readiness.mjs';

const result = await assessProjectWorkflowReadiness({
  projectRoot, // transient host path, never returned as portable evidence
  workflowId: 'campaign',
  evaluatedAt: '2026-10-23T16:00:00Z',
  quoteContext, // existing v1 envelope from an external estimator/caller
  budget: { maximumSpend: 2, currency: 'USD' },
});
// result.report is the existing authoritative readiness report.
// result.context can be passed unchanged to assessWorkflowReadiness(workflow, ...).
```

Both operations accept the same request. Supply either `projectRoot` or an already
opened `project` API object. Supply a canonical `workflow`, or `workflowId` to load
it from that project. If both workflow and workflowId are supplied they must match.
`expectedProjectId` applies only when opening projectRoot; other combinations are rejected. A project is optional when a
canonical workflow is supplied; physical asset presence then stays unverified.

Portable optional fields are passed unchanged: `inputs`, `nodeStates`, `quoteContext`,
`quotePolicy`, `budget`, and required `evaluatedAt`. `utility` can be the same single
binding object supplied to the execution bridge (`tool`, `validate`, `run`). Neither
callback runs. `localState` can contain snapshots previously returned by existing
local APIs: `hostAvailable`, `binaryStatus`, `models`, and `wan2gpConfig`.
No local API is automatically invoked to fill these fields.

`buildWorkflowReadinessContext` returns `status: built`, workflow identity/hash,
JSON-serializable `context`, lightweight `provenance`, diagnostics and `report`.
It calls the existing evaluator to validate context and produce that report.
`assessProjectWorkflowReadiness` is the convenient `status: assessed` entrypoint over
the same operation. Neither wraps an alternate readiness rule engine.

Failures return `status: rejected`, null context/provenance and sanitized diagnostics.
Canonical/context failures may include the existing INVALID/BLOCKED report. Project
integrity or loading failure returns no successful/partial readiness report: damaged
source evidence cannot be treated as verified. Errors do not echo filesystem paths,
raw Error objects, provider credentials, or source request payloads.

## Exact reused sources and boundaries

| Evidence | Existing source | Normalization |
| --- | --- | --- |
| Project open/identity/integrity | `openProject` in workflow-core `src/project/store.js` | Reuses full manifest/history/workflow/asset integrity checks |
| Canonical workflow | `project.getProjectWorkflow(workflowId)` | Existing canonical import/hash verification; no direct JSON reader |
| Assets | Verified `openProject().manifest.assets` or `project.listProjectAssets()` | Registry IDs + matching canonical relative paths/checksums become presence records |
| Remote routes | `runtime.mjs` `findRemote` + existing Studio catalogs/routes | Model/provider/mode must match a supported bridge route |
| Local model identity | `runtime.mjs` re-export of existing `getLocalModelById` | Existing catalog/provider matching |
| Static execution binding | Shared `resolveExecutionBinding` in `runtime.mjs` | Used unchanged by both the execution bridge and evidence adapter |
| Utility | The bridge's existing injected `utility` object | Matching tool and callable run/validate fields; neither called |
| Manual controls | Existing readiness evaluator | Manual classification is taken from its report, not a new agent/control registry |
| Quotes/budget | Externally supplied v1 quote envelope/policy | Deep-copy, safety validation, identity flags; core freshness/arithmetic/budget rules reused |

The shared static binding check is a small extraction from `bridge.mjs`; actual
parameter/capability validation, uploads, auth, polling, execution and result handling
remain in the existing bridge/runtime. A known remote route means available/plannable
*as a binding*. It does not prove authentication, credits, provider health, valid
model-specific parameters, or successful execution. No API-key lookup occurs.
Unsupported/ambiguous remote modes remain unsupported. No live model discovery is
called. If one mode is supported and another is unsupported for the same canonical
executor identity, the mode-neutral readiness identity receives unverified evidence
and a `BINDING_EVIDENCE_CONFLICT` diagnostic; it never claims the whole binding ready.

## Asset presence

A successful project read has already checked registered bytes, file size, SHA-256,
portable paths and project integrity. Local workflow asset ID/path and any checksum
must match that verified registry. No matching record means unavailable; a mismatch
is flagged `ASSET_IDENTITY_MISMATCH`. The adapter does not read arbitrary files or
call resolveProjectAssetPath merely to expose an absolute path.

Remote-only declarations without a matching verified checksum stay unverified:
registration does not prove URL reachability. Canonical `metadata.optional` is
preserved in provenance; the existing evaluator decides whether missing evidence
blocks the active path. A broken registered asset makes the existing project API
reject the project, even if a particular draft branch calls it optional. This layer
does not bypass project integrity to recover a partial inventory.

## Local state and side effects

`localInferenceClient` / preload already expose binary status, model state and
Wan2GP configuration. Their implementations matter:

- `getBinaryStatus()` may install a bundled binary.
- Unified `listModels()` can call Wan2GP `engineStatus()`, which can probe a remote
  MCP server. `checkWan2gp()` may launch Python and import torch.
- `probeWan2gp()`, downloads and generation are explicitly outside collection.

The adapter calls none of these. It consumes supplied snapshots, discarding paths,
URLs, Python locations and other incidental metadata from returned evidence.
Host unavailable, binary absent, missing/partial weights, missing auxiliary weights,
explicit model unavailability or explicitly empty Wan2GP configuration can establish
unavailability. Configured paths, installed files, or upstream `ready: true` cannot
prove successful inference; positive operational readiness stays UNVERIFIED. This
also avoids treating Wan2GP's first-run automatic model downloads as safe readiness.
No GPU probes, large directory scans or inference occur.

To retain mixed evidence, readiness now additionally accepts `available: null` and
`present: null` on individual context entries, meaning UNVERIFIED. Existing true/false
and omitted-collection semantics are unchanged. This is an additive evidence-state
extension, not a canonical schema, status or readiness-policy redesign.

## Quotes and provenance

External quote envelopes are never rewritten with the current hash. Provider/model,
amount/currency, timestamps, expiration, source metadata and envelope identity survive
unchanged. Legacy workflow/hash mismatch is flagged `QUOTE_WORKFLOW_MISMATCH`.
Explicit per-node scope bindings from core `bindWorkflowQuotes` are evaluated by
the same readiness engine: matching scopes yield `SCOPE_VERIFIED` provenance,
while affected entries yield `PARTIALLY_STALE`/`QUOTE_SCOPE_STALE`. The adapter does
not create, refresh or repair those bindings. See core `PRODUCTION.md` for approval
metadata, dependency scopes and the nonvisual renderer consumer.
Malformed/secret-bearing envelopes are rejected. No estimate endpoint is called and
no exchange rate, currency conversion or price is invented.

Provenance stays beside the strict context/report rather than being inserted into
canonical data. It names `project-store`, `project-assets`, `execution-bridge`,
`local-runtime-configuration`, `workflow-declaration`, and `supplied-quote-envelope`.
Availability labels and stable codes explain source decisions; canonical node IDs
link them to report reasons. No audit-log persistence is added.

The optional second argument `{ resolveBinding }` is a trusted synchronous static
host/test seam with the same contract as `resolveExecutionBinding`, not a renderer
function transport, registry, or authorization surface. Production callers should
use the existing default. A custom source must itself be side-effect-free.

## Host integration decision and limitations

This milestone stays library-level. Existing `host.mjs` already opens projects behind
handles, Electron main exposes fixed operations, preload preserves context isolation,
and `whihmHostRuntime.mjs` forwards the existing renderer runtime. No new IPC is needed
to prove or use a Node-side assessment. A future fixed host operation can call this
library and supply already gathered local snapshots without exposing raw files or
arbitrary functions. Main/preload/UI/security/packaging are unchanged here.

Evidence represents a read-time snapshot, not a cross-service transaction or execution
reservation. Project APIs perform their existing full integrity validation, which may
be costly for large projects; this layer adds no cache or new filesystem scanner.
Model-specific planning, provider reachability, local runtime proof, quote retrieval,
approval enforcement, budget enforcement, scheduling and finishing remain outside it.

```sh
node --test tests/whihmReadinessEvidence.test.mjs
node --test tests/whihmExecutionBridge.test.mjs
npm test -w whihm-workflow-core
npm run check -w whihm-workflow-core
```
