# Planning context v1

Current [remote segmentation](WHIHM_REMOTE_SEGMENTATION.md) derives automatically
through SEGMENT_VIDEO_SUBJECT: reviewed Meta binding, static auth/configuration guard,
box/point/concept selectors, opaque IDs and binary mask-sequence result. Counts remain
47/608; missing key means provider-blocked. No planning branch, health probe, provider
call, credential exposure or executor selection is introduced.


Current [Performance Guidance Toolkit](WHIHM_PERFORMANCE_GUIDANCE.md) appears through
projection metadata only: preparation/face contracts are runtime-gated; segmentation
is now reviewed through Meta and remains blocked until provider configuration exists. Overview/context/detail automatically
expose modes, artifact/review requirements and last-observed readiness. No planning
implementation change. Current source counts: **47 groups /608 entries**.


Current record-only extension: [Character / Performance Benchmark Foundation](WHIHM_PERFORMANCE_BENCHMARK.md)
adds BENCHMARK_PERFORMANCE / performance_benchmark / performance-benchmark. Five fixed
host APIs create/read cases, record observed attempts and human evaluations, and
compare facts without execution or ranking. Workflow-run security is unchanged.
Projection/planning derive **44 groups /605 entries;140 available reviewed**. Case
payloads are retrieved explicitly, never inserted into planning overview/context.

Current extension: [Workflow Execution Foundation](WHIHM_WORKFLOW_EXECUTION.md)
adds RUN_WORKFLOW / run_workflow / workflow-execution and six fixed host operations:
planWorkflowExecution, runWorkflow, getWorkflowRun, approveWorkflowCheckpoint,
resumeWorkflow and invalidateWorkflowRun. Canonical DAGs execute through existing
bindings/tools with explicit permission, human pauses, session-only runs and
controlled downstream invalidation. No agents, selection, fallback or schema migration.
Projection/planning stay v1 and derive **43 groups /604 entries;139 available reviewed**.
Older milestone counts and single-node-only notes below remain historical.

Planning summaries now retain all safe projected runtime fields generically,
including [multimedia readiness](WHIHM_MULTIMEDIA_RUNTIME.md) and separate image/
video/audio implementation scopes. Reads never probe: use the fixed status read
for a fresh observation. Schemas remain v1; there is no tool-specific planning branch.

[Deterministic finishing](WHIHM_DETERMINISTIC_FINISHING.md) appears automatically under
FINISH_MEDIA/media-finishing, including operation-specific parameter constraints.
Planning-context implementation/schema is unchanged. Video/audio scopes now expose implemented operations, exact export contracts and
last-observed runtime gating. Images stay available; a ready snapshot never replaces
a fresh execution lease. No planning branch or schema change was needed.

[Media Inspection](WHIHM_MEDIA_INSPECTION.md) now appears automatically under
`INSPECT_MEDIA` / `media-inspection`. No planning-context code or schema changed;
the size measurements below record the initial 601-entry implementation snapshot.

The model-agnostic [planning-context.mjs](planning-context.mjs) provides progressive,
read-only views over [projectCapabilities()](WHIHM_ASTRA_CAPABILITY_PROJECTION.md).
An external reasoning director interprets the user's goal, requests exact capability
IDs, and inspects executor details as needed. Astra remains external: this interface
contains no reasoning-model calls, prompts, credentials or goal parser.

## Retrieval

```js
import {
  getPlanningOverview, getCapabilityContext, getExecutorContext,
} from './planning-context.mjs';

const overview = getPlanningOverview();
const capability = getCapabilityContext('VIDEO_EDIT');
const detail = getExecutorContext('gemini-omni-video-edit');

// Existing trusted Electron host, with the same read-only semantics:
await window.whihmHost.getPlanningOverview();
await window.whihmHost.getCapabilityContext('VIDEO_EDIT');
await window.whihmHost.getExecutorContext('gemini-omni-video-edit');
```

The internal host operations accept `{}`, `{capabilityId}` and `{executorId}`,
respectively. Existing sender validation and fixed IPC allowlisting apply. A project,
runtime connection, credentials or execution approval is unnecessary. Extra fields,
arguments and filters are rejected; v1 has no query DSL or filtering surface.

| View | Content |
| --- | --- |
| Overview | Every capability ID/purpose, executor counts by availability/assurance/runtime/verification, and derived guard observations; no executor records or control schemas |
| Capability context | One exact capability, all its executor summaries, required/optional media roles and cardinality, constraints, asset/opaque-ID declarations, result/lifecycle facts, control names, availability reasons and limitations |
| Executor context | One exact projected executor record, including complete controls, schemas, defaults, evidence and limitations; unchanged in meaning from the projection |

Capability summaries omit role schemas and full control definitions. Fetch the executor
detail before constructing requests. Limitations shared verbatim by every executor
are factored into `sharedLimitations`; combine them with each summary's `limitations`.
No source caveat is paraphrased or dropped. Runtime checks and actual canonical input
validation remain authoritative; discovery does not validate supplied media.

## Version, identity and errors

Successful responses have `schemaVersion: 1`, `projectionSchemaVersion: 1`,
`status: "ok"`, a `kind`, copied projection environment/limitations, and structured
`guards`. Counts are live facts, not version guarantees. `availableForPlanning`
counts only source entries with `available === true`; it grants no authorization,
spend approval, runtime-health or fidelity assurance.

IDs are exact, case-sensitive strings. Executor lookup accepts a projected `key`,
or a logical model `id` only when unique. An ambiguous ID returns `status:
"ambiguous"`, `PLANNING_EXECUTOR_ID_AMBIGUOUS` and sorted route keys in `matches`.
The caller must explicitly retrieve one of those keys. No route is selected.

Unknown IDs return `status: "not_found"` with `PLANNING_CAPABILITY_NOT_FOUND` or
`PLANNING_EXECUTOR_NOT_FOUND`. Malformed IDs return `PLANNING_ID_INVALID`;
unsupported extra arguments return `PLANNING_FILTERS_UNSUPPORTED`, both rejected.
Module diagnostics contain codes, not echoed caller input. Validation failures
before projection retrieval expose the planning version only; lookup errors also
expose the projection version. A future unsupported projection version fails closed
with `PLANNING_PROJECTION_VERSION_UNSUPPORTED`. Host envelope errors retain the
existing `HOST_REQUEST_INVALID` convention.

## Planning guards and known states

`guards.rules` contains explicit false-valued permissions/inferences: catalog
presence does not grant availability; availability does not authorize execution;
known unavailable executors are not execution candidates; runtime-unverified does
not mean runtime-failed; human lifecycle action cannot be automated; specialized
routes cannot be silently substituted; opaque IDs are not assets; local configuration
does not prove availability; source use does not imply packaged readiness.

`guards.observed` is derived from only the requested scope: unavailable or deferred/
blocked entries, runtime-unverified state, specialized routing, human/liveness needs,
opaque provider identities, local constraints and provider clarification. The overview
also includes these flags per capability. These are facts and guards, not a policy
engine or model-selection recommendation.

- MMAudio remains unavailable/provider-blocked and `mustRevisit: true`; no output
  artifact semantics are invented.
- Ordinary Seedance2.5 Spicy T2V/I2V remain deferred; known ambiguous fixed-resolution
  suffixes remain unavailable. Reviewed Spicy V2V edit remains available/reviewed.
- Gemini Omni provider identifiers remain controls/identities, never project assets.
- Depth retains image/video XOR and depth-image/depth-video result variants.
- Guided Suno retains human recording/liveness, same-live-session continuation and
  opaque `voice_id`; no autonomous confirmation is implied.
- Local entries remain local-constrained. Specialized Recast and other dedicated
  routes retain their exact routing. Runtime verification remains unverified.
- The known packaging omission remains a shipping blocker separate from source use.

## Derivation, compactness and boundaries

Every read takes one fresh snapshot from `projectCapabilities()`. No second model
registry, cache/index subsystem or per-model branch exists. New metadata-described
capabilities/executors automatically appear in all three views; fixture tests prove
this. Object keys, capability IDs and executor keys are sorted deterministically;
meaningful array order is retained. Returned objects are detached JSON-compatible data.

Measured at this implementation using UTF-8 bytes of minified `JSON.stringify`:

| View | Bytes |
| --- | ---: |
| Full projection, 40 capabilities / 601 executor entries | 1,380,720 |
| Planning overview | 26,435 |
| VIDEO_EDIT capability context | 35,000 |
| Gemini Omni executor context | 4,890 |

The initial overview is **98.09% smaller** than the full projection. Sizes will change
with upstream metadata. The API reduces response/context size, not snapshot derivation
work. All known alternatives remain visible; nothing is ranked, scored or selected.

No provider/authentication/upload calls, renderer execution requests, project mutation,
workflows, agents, retries, fallbacks, model ranking or real extension work are added.
Execution services, contracts, bindings, projection admission and authorization are
unchanged. This is a consumption API, not a network server or external-model adapter.

QA: **44 new tests** (43 planning-context cases plus one fixed-host integration case);
**374 targeted tests pass** (43 planning + 44 projection + 61 host + 226 execution/
Depth/Suno/high-value-video regressions). Syntax/ESLint and `git diff --check` pass.
No Studio/renderer build inputs or UI changed; no Vite/browser QA was required.

Current transformation-family update: see [Performance transformations](WHIHM_PERFORMANCE_TRANSFORMATIONS.md). Existing Recast/Motion Control routes are reconciled; Spicy Motion Control is admitted. Native Higgsfield is now reviewed/bound through Workflow Execution with project assets and credential readiness guards; prepared-guidance Seedance execution remains unavailable. Intent views preserve exact executor IDs; use full projection keys for ambiguous IDs.

`COMPOSE_TIMELINE` derives dynamically from projection (49 groups /617 entries).
Overview stays compact; executor context exposes the integer-frame timeline
contract, tracks, cut-only transitions, output format and multimedia requirement.
Use `planTimelineComposition` to resolve assets and obtain current render blockers;
planning never executes/probes FFmpeg. See [timeline contract](WHIHM_TIMELINE_COMPOSITION.md).

Audio Production discovery derives `PRODUCE_AUDIO_MIX` directly from projection
(50 groups /618 entries). Exact executor context exposes track categories,
processors, automation and multimedia readiness. `planAudioProduction` resolves
source hashes and operation-specific blockers without executing/probing FFmpeg.

Timing analysis is discovered from projection with PCM16 WAV requirements and
explicit downbeat absence. Mix executor context exposes additive manipulation
modes/ranges; neither capability gives raw FFmpeg control or selects edit points.

AGENT_EXECUTE is dynamically derived from projection. Exact executor context
exposes structured action vocabulary, limits and existing logical-reference usage.
planAgentExecution is the non-executing draft check; apply/run/continue are separate
permission-gated calls. No Astra-specific branch, ranking or fallback is added.
