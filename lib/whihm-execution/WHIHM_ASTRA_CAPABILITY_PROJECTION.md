# Astra capability projection v1

Current extension: [Workflow Execution Foundation](WHIHM_WORKFLOW_EXECUTION.md)
adds RUN_WORKFLOW / run_workflow / workflow-execution and six fixed host operations:
planWorkflowExecution, runWorkflow, getWorkflowRun, approveWorkflowCheckpoint,
resumeWorkflow and invalidateWorkflowRun. Canonical DAGs execute through existing
bindings/tools with explicit permission, human pauses, session-only runs and
controlled downstream invalidation. No agents, selection, fallback or schema migration.
Projection/planning stay v1 and derive **43 groups /604 entries;139 available reviewed**.
Older milestone counts and single-node-only notes below remain historical.

[Multimedia runtime readiness](WHIHM_MULTIMEDIA_RUNTIME.md) now appears as scoped
FINISH_MEDIA runtime requirements plus a safe last-observed snapshot. Projection
never runs probes; counts remain42 groups /603 entries. Image stays executable,
video/audio are implemented but runtime-gated by a fresh baseline-ready lease. No FFmpeg creative
capability or new execution binding is introduced.

Current finishing addendum: [Deterministic Finishing](WHIHM_DETERMINISTIC_FINISHING.md)
exposes one local image/video/audio FINISH_MEDIA tool (42 groups / 603 entries; 138 available
reviewed). All prior 602 entries remain unchanged. Video/audio execution requires the paired multimedia baseline; image stays available
independently. Operation-specific parameter schemas and output kinds derive from
the validator. No raw command controls or new creative runtime capability are added.

Current extension: [Media Inspection](WHIHM_MEDIA_INSPECTION.md) adds one descriptor-
derived local `INSPECT_MEDIA` tool (41 groups / 602 entries; 137 available reviewed).
The previous 601 executor entries and 13 remote modes retain their exact semantics.
The initial implementation snapshot and QA below remain historical evidence.

The read-only `projectCapabilities()` API in
[capability-projection.mjs](capability-projection.mjs) describes the existing
foundation. It neither selects executors nor authorizes or executes them.

For progressive consumption, use the [planning-context v1 API](WHIHM_ASTRA_PLANNING_CONTEXT.md):
compact overview, exact capability summaries and full executor details on demand.
It derives from this projection without changing availability or execution semantics.

```js
import { projectCapabilities } from './capability-projection.mjs';
const projection = projectCapabilities();
// Electron, through the existing trusted fixed-host interface:
const sameProjection = await window.whihmHost.getCapabilityProjection();
```

Both APIs take no configuration, credentials or project arguments. The host
operation accepts an empty request only; caller overrides are rejected. No renderer
runtime request, authentication, asset upload, provider request, inference, project
read/write or readiness mutation occurs. The Node module reads only the fixed
application package metadata to preserve the known packaging boundary.

## Schema

`schemaVersion: 1`; `capabilities` is sorted by capability ID. Each group contains
`id`, a neutral purpose label derived from that ID, and `executors` sorted by stable
runtime/mode/provider/ID key. Object keys are canonicalized recursively. Meaningful
enum, frame/reference order and lifecycle sequences retain their declared order.
No timestamp, live health query, ranking or insertion-order dependency is included.
Each call returns a fresh detached JSON-serializable snapshot.

| Executor field | Meaning |
| --- | --- |
| key / id / label / mode / provider / endpoint | Exact execution identity; key distinguishes the same logical ID on multiple routes or local/remote runtimes |
| runtime | Existing shared method or local backend, never a new transport |
| binding | Static resolveExecutionBinding evidence, separate from supplied-input validation and spend authorization |
| available / availability | Available only with a current exact canonical binding; local configurations remain constrained, blocked/deferred rows unavailable |
| assurance | reviewed = dedicated scoped contract or existing Act Two compatibility branch; generic = structurally bound but not deeply reviewed; unreviewed = not admitted |
| route | canonical, specialized or local. Specialized route/alias requirements are explicit, with no automatic substitution |
| inputs / requiredFields | Native/canonical media fields, semantic roles, required flags, cardinality/order where known, wire aliases and role schemas |
| controls | Safe schema projection: types, required flags, enums or UI suggestions, numeric/length/item limits, defaults, nested properties/items and provider-field aliases where declared |
| constraints | Source-confirmed XOR, frame-order/reference-choice/combined limits or conditional requirements where metadata exposes them |
| projectAssets | Only declared media roles supported by existing binding machinery; arrays restricted to reviewed array support. Generic scalar bindings retain their weaker validation label |
| providerIdentifiers | Explicit provider ID controls, never media/project assets; e.g. Gemini audio_ids/character_ids |
| result | Declared semantic kind, source-dependent variants or unknown; normalization declarations are not proof of a returned artifact |
| lifecycle | Guided operations and their scoped inputs/controls, human/liveness requirements and same-session continuation limits |
| runtimeVerification / partial / limitations / evidence | Unverified runtime/fidelity, bounded or partial surface and static provenance; no inference of real execution success |
| reason / mustRevisit / specializedRoutes | Existing deferred/provider-conflict evidence and explicit alias routes; MMAudio remains important/MUST_REVISIT |

Availability values are `available`, `deferred`, `provider_blocked`,
`local_constrained`, `disabled` and `deprecated`. Reviewed/generic assurance,
specialized routing and `runtimeVerification: unverified` are orthogonal.
`partial` describes a bounded/incomplete surface without disabling its supported
subset. Explicit disabled/deprecated metadata is preserved; absence is not
interpreted as deprecation. The environment separately reports source/development
scope and `shipping_blocker_only` for the known package-inclusion omission. Other
packaging configurations remain unverified rather than automatically certified.

A generic source route is not a high-assurance contract. Generic controls/roles
may be incomplete; unknown facts are omitted, not guessed from model names.
Some unannotated tools remain under a broad mode/operation capability such as
VIDEO_PROCESS rather than an invented fine-grained intent. The actual existing
plan/contract validator is authoritative for cross-field conditions and supplied
media. This projection does not validate media content or every control combination.

## Derivation and extensibility

- Discover IDs from the nine primary Studio catalogs and the existing fixed
  creative-service descriptors; exclude derived catalog aliases.
- Enumerate canonical modes from runtime.routes; use exact mode-aware
  resolveExecutionBinding. Mode-less null can mean ambiguity, not unavailability.
- Use existing advanced-image, video-input, audio, V2V, Recast, Motion Control,
  Depth, Suno and creative-service contract getters. Small read-only accessors
  expose validator-owned metadata; V2V execution and projection share their
  schema/role assembly. No second executor catalog/allowlist is introduced.
- Use explicit capability metadata first, then existing contract intent or declared
  video operation, finally a conservative route-level capability. No parsing model
  names into new abilities. Provider descriptions remain claims, not guarantees.
- Preserve known review conflicts in their existing contract domain. MMAudio's
  result contradiction and fixed V2V suffix conflicts now have read-only review
  status metadata; this does not change any execution admission.
- Project local configurations separately through the existing local binding
  resolver. No configuration/probe/download call proves runtime availability.

Adding a model normally means updating its existing source contract/binding and
capability metadata; the projection then discovers it without a model-ID branch.
Tests prove that a fixture T2V executor enters through metadata and the existing
binding, while a fixture V2V catalog row stays deferred without reviewed admission.
Domain-specific controls/relationships should live beside the authoritative
contract, not in a copied projection registry. A genuinely new execution service
may need one small route adapter. Do not copy this snapshot into a frozen registry.

## Important cases and boundaries

- Gemini Omni edit and both unsuffixed Spicy V2V edit/extend use reviewed VIDEO_EDIT /
  VIDEO_EXTEND. Opaque Gemini ID arrays are controls, never asset references.
- Ordinary Spicy2.5 T2V/I2V remain deferred with provider-clarification reasons;
  known fixed suffix conflicts remain provider-blocked. No wildcard Spicy admission.
- MMAudio video sound remains provider-blocked, result unknown, MUST_REVISIT.
- Depth appears only under depth / DEPTH_ESTIMATION: image_url XOR video_url,
  depth-image/depth-video result variants, no metric/calibrated/3D guarantee.
- Guided Suno appears only under voice_clone_guided / CLONE_VOICE_GUIDED. START,
  CONFIRM and POLL have separate contracts; confirmation requires a registered,
  distinct user-recorded challenge asset and live provider/session guards. Its
  result is an opaque voice identity, not audio. No phrase, live ID, secret or
  synthesized confirmation is generated by discovery. Lost session blocks safely.
- Recast provider aliases are explicit specialized routes. Lip Sync, Motion Control,
  clipping and motion graphics retain their own service contracts.
- Local entries are bound configurations but `available: false` /
  local_constrained until separate runtime/staging evidence supports execution.
  Wan2GP can use remote MCP; local/private/offline behavior is not guaranteed.
- All runtime/fidelity flags remain unverified. Static binding or WHIHM approval
  is not provider liveness, budget freshness, model availability or permission to spend.

No scoring, best-model logic, Fast preference, cost optimization, automatic fallback,
workflow/graph generation, retries, agents, Astra/model calls or real extensions are
implemented. No project schema, UI, provider, uploader, poller or execution coverage
changes. Packaging remains a high-severity shipping blocker; source use can proceed.

## Current snapshot and QA

At the inspected foundation: **40 capability groups /601 executor entries**;
136 available reviewed,396 available generic;29 specialized entries including25
available;22 deferred;34 provider-blocked;13 local-constrained;601 runtime-unverified.
Two of the deferred entries also require provider clarification, giving36 such
entries total. Counts refer to mode/runtime entries, not unique creative abilities,
and are computed live in `counts`. Future metadata additions may change them.

Focused tests cover deterministic grouping, source identity, binding versus catalog
presence, exact known blockers, role/order/ID/default preservation, guided semantics,
fixture extensibility and trusted read-only host access. Existing execution,
Depth/Suno/high-value video, V2V/Recast/Motion and host/readiness regressions remain
required when the corresponding shared surfaces change. All transports are mocked;
no live provider, authentication, upload or paid operation is part of projection QA.

Recorded QA for this implementation: **45 new cases** (44 projection cases plus
one fixed-host read case); **912 targeted tests pass** (44 projection +808 affected
execution/readiness regressions +60 full-host tests). Syntax checks/ESLint pass
for all13 touched JS/MJS files. Vite production build passes with the existing
chunk-size advisory; git diff --check passes. No browser QA was needed. Existing
execution admission remains532 remote mode/ID pairs; there is no new model binding.
For unavailable entries, endpoint is the existing source declaration, not a
certified callable provider URL. Generic I2V also exposes the existing canonical
image_url/images_list requirement as a constraint; native optional-role metadata
must not be used to bypass that existing check.
