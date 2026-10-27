# Character / Performance Benchmark Foundation v1

Segmentation integration: [Meta mask artifacts](WHIHM_REMOTE_SEGMENTATION.md) can be
recorded as references/outputs. File support is limited to the registered canonical
mask-sequence MIME; other file types remain refused. Workflow observations preserve
native provider usage and request identity, while unreported monetary cost remains
unknown/non-aggregatable. Benchmark records still grant no execution authorization,
run continuation, automatic quality judgment or ranking.


Capability **BENCHMARK_PERFORMANCE**, local mode **performance_benchmark**, tool
**performance-benchmark**. This builds the test bench, not the experiment: it records
definitions, observed execution evidence and explicit human evaluations. It has no
provider client, generation, upload, automatic judge, selection, retries or ranking.
Canonical workflow/project schemas and Workflow Execution v1 are unchanged.

## Definition, attempts and human evaluation

[performance-benchmark.mjs](performance-benchmark.mjs) exposes a bounded record API,
`validatePerformanceBenchmark(snapshot)` and pure `comparePerformanceBenchmark(snapshot)`.
[performance-benchmark-contract.mjs](performance-benchmark-contract.mjs) owns the shared
domain constants/discovery descriptor. [benchmark-cost.mjs](benchmark-cost.mjs) owns
only exact factual cost aggregation, not prices or a project ledger.

A record has schemaVersion 1, kind whihm-performance-benchmark, an immutable definition,
definitionHash, timestamps, revision and candidates. Its definition includes:

- Stable caller-provided caseId, title, description and custom category.
- Intent `{operation, description}`; operation is a bounded identifier, not a fixed
  model list. performance_transfer, character_replacement, body_recast,
  object_or_subject_replace and video_restyle are possible authored intents.
- Ordered sources/references with distinct role names and registered asset IDs,
  logical paths, MIME/media kind and verified SHA-256 identity. References may be
  empty. Registered image, video and audio assets use existing project integrity.
- Executor-independent preservation requirements for identity, facial_performance,
  body_motion, choreography, timing, camera, environment, composition, audio,
  object_geometry, temporal_consistency and occlusion_reappearance. Each has policy
  preserve/allow_change/not_applicable, optional notes and an explicit source/reference
  role basis. These express requirements; they never choose an executor.
- A case-defined metric set `{id,label,description?}`. No category has a mandatory
  metric list. Authors define relevant measures and describe what each score means.

Definition hashing reuses canonical stable JSON plus a domain/version prefix and
SHA-256. It includes role/reference order and declared requirements/metrics, excludes
timestamps and all candidates/evaluations, and stays stable across object-key order
and project-root relocation. V1 has no definition-edit API: create a new case for a
changed definition. Each attempt/evaluation binds its exact definition/evidence hash.

Candidates freeze candidateId, label, executor identity, optional capability ID and
route identity. Recording another attempt cannot silently change that identity.
Candidate identities are observations, **not execution bindings**: recording an
external/unbound executor does not admit it to canonical execution or projection.

Attempts append with candidate-local attemptNumber and case-wide recordOrder. They
retain source provenance, workflow/run/node/hash/attempt references where observed,
native route/binding, typed media inputs, outputs/checksums, effective controls,
available technical inspection/backend metadata, request/continuation IDs, native
cost and notes. Status is completed/failed/blocked/cancelled; unknown facts remain
absent/empty rather than inferred. Remote URLs are retained safely, never fetched.
No decoded quality or technical facts are fabricated from a URL or model description.

Human assessments append independently with origin=human, evaluator identity,
acceptance **ACCEPT / USABLE_WITH_ISSUES / REJECT**, notes, issue notes and one entry
for every defined metric. Scores are integers 0–5, or null with an explicit not-assessed
note. Unknown/missing metric IDs and out-of-range scores reject. Acceptance is an
explicit human decision, never calculated from scores. ACCEPT/USABLE require a
completed attempt with an output; failed attempts can receive human REJECT.

Re-evaluation preserves prior assessments. Comparisons explicitly use the latest
assessment per attempt. Human origin is a declaration, not identity authentication;
no internal reasoner, LLM, vision model or automatic quality evaluator is invoked.
Benchmark acceptance cannot approve workflow checkpoints or satisfy Suno liveness.

## Recording APIs and evidence boundary

The five fixed preload APIs are project-handle scoped. Mutations require the existing
literal allowExecution=true opt-in; this authorizes recording only and can never
trigger a provider operation. Appends require expectedRevision and use a case lock.
Reads require no execution permission, credentials or workflow runtime.

```js
const created = await window.whihmHost.createPerformanceBenchmark({
  projectHandle, allowExecution: true,
  definition: {
    caseId: 'dance_take', title: 'Character/performance fixture',
    category: 'character_performance', intent: { operation: 'performance_transfer' },
    sources: [{ role: 'performance', assetId: 'registered_source' }],
    references: [{ role: 'identity', assetId: 'registered_character' }],
    preservation: {
      body_motion: { policy: 'preserve', basis: { group: 'source', role: 'performance' } },
      identity: { policy: 'preserve', basis: { group: 'reference', role: 'identity' } },
    },
    metrics: [{ id: 'motion_fidelity', label: 'Motion fidelity' }],
  },
});
const recorded = await window.whihmHost.recordBenchmarkCandidate({
  projectHandle, caseId: 'dance_take', expectedRevision: created.benchmark.revision,
  candidateId: 'candidate_a', runRef: { runId, nodeId }, allowExecution: true,
});
await window.whihmHost.recordBenchmarkEvaluation({
  projectHandle, caseId: 'dance_take', expectedRevision: recorded.benchmark.revision,
  candidateId: 'candidate_a', attemptNumber: 1, allowExecution: true,
  evaluation: {
    origin: 'human', evaluator: { id: 'reviewer' }, acceptance: 'USABLE_WITH_ISSUES',
    metrics: { motion_fidelity: { score: 3, notes: 'Example human observation' } },
    notes: 'Explicit evaluation', issues: ['Example issue'],
  },
});
await window.whihmHost.getPerformanceBenchmark({ projectHandle, caseId: 'dance_take' });
await window.whihmHost.comparePerformanceBenchmark({ projectHandle, caseId: 'dance_take' });
```

`runRef` reads an existing node from the owning live workflow session; it does not
execute or resume it. Only stable completed/failed/blocked observations without an
uncertain outcome or active continuation are admitted. Executor/capability/route
come from that observation and existing projection metadata; supplied overrides
must match. The same run/node/execution-attempt cannot be counted twice, even under
another candidate ID. Native input fields/order remain explicit; provider IDs never
become media assets. No phrase, full continuation state or private runtime payload
is copied. Request/continuation IDs are opaque audit references with no authority.

Alternatively `recordBenchmarkCandidate` accepts executor identity (`id`, `type`,
plus `provider`/`model` or `tool` where applicable), optional
capabilityId/route and `attempt` instead of runRef. Attempt fields are status,
inputs/references/outputs plus optional nativeCost, controls, technical, requestId,
continuationId and notes. Media references are `{role,assetId,checksum?}` or
`{role,url,mediaKind}`. Project references are checked; URL metadata/technical/native
cost in manual records is explicitly caller-reported, not verified provider evidence.
There is no estimate input, raw provider invocation, secret storage or path access.
Exactly one evidence source is required. Semantic eligibility/comparability still
requires human review; a record does not certify that an executor met the case's
preservation requirements or used semantically equivalent controls.

## Cost and deterministic comparison

Absent/null cost is not_reported. Any supplied native JSON is retained as reported,
including numeric zero and opaque credit structures. There is no default currency,
price estimate, currency conversion, refund inference or cost optimization.

Aggregation admits only the exact `{amount,currency}` native shape: a finite,
nonnegative number with at most 12 decimal places and explicit three-uppercase-letter
currency/unit code. Extra/estimated/unknown fields stay opaque and non-aggregatable.
This is observed metadata, not a verified invoice or pricing guarantee. Integer
decimal arithmetic avoids floating-point sums; exactAmount remains a string if a
numeric total cannot represent it safely.

Comparisons sort candidate IDs lexically and attempts by recorded number, never by
quality, cost or acceptance. They expose requirements, metrics, per-attempt latest
assessment, provenance, input/output references, reported cost and notes, without
dumping full technical/evaluation histories. Factual costs include:

- reportedSpend over all recorded attempts;
- throughFirstAccept over the attempt prefix ending at the first currently ACCEPT
  attempt;
- throughFirstUsable over the prefix ending at the first currently ACCEPT or
  USABLE_WITH_ISSUES attempt.

Case-wide prefixes use recordOrder; candidate prefixes use attemptNumber. Later
assessments can change those current summaries; historical evaluations remain intact.
Every prefix includes failed/unaccepted attempts before its boundary. Missing or
opaque cost makes a total incomplete with null amounts and explicit missing IDs;
mixed currencies also make it incomplete. Empty sets are not_applicable and unreached
acceptance boundaries not_reached, never invented zero spend. No weighted score,
global leaderboard, recommendation, executor selection or fallback is produced.

## Storage, discovery and limits

V1 records live in the project/host session; disposal/navigation/restart clears the
record service. `getPerformanceBenchmark` returns detached JSON with snapshotHash;
callers can serialize it as independent evaluation data. The pure validator/comparer
supports round-trip inspection after workflow session loss. Hashes detect inconsistent
data, not malicious rewrites or human authenticity. There is no host import API,
durable store or trusted workflow-state rehydration. A referenced asset may later
be removed; snapshots describe captured identity, not current availability.

Limits: 32 cases per project session, 32 candidates per case, 128 attempts total,
32 metrics, 16 assets per input group, 16 evaluations per attempt, 2 MiB per record.
Unknown fields, secrets, unsafe URLs, absolute/traversal paths, wrong checksums,
conflicting identities, stale revisions and unsupported versions fail structurally.
Failed mutations publish no partial record and do not modify project/history/assets.

The descriptor is dynamically projected as **44 capability groups / 605 entries**,
140 available reviewed and 396 available generic. Existing executable model bindings
are unchanged. Planning overview discovers the capability; capability/executor
contexts describe the five record APIs and boundaries, never the stored cases or
giant attempt payloads. No planning-specific model list is added.

Later Performance Guidance Toolkit work can define controlled cases/conditioning,
and Genjutsu-class, Motion Control, Act Two, Wan or other independently admitted
paths can supply observations through Workflow Execution. This milestone integrates
none of those new executors/toolkits and conducts no quality experiment. Durable
benchmark storage/export UX, actual experiments, guidance tooling and automatic
Creative QC remain deferred. The existing Electron dependency-closure shipping
blocker is unchanged; packaged production readiness is not claimed.

## Targeted QA

**54 new cases / 689 unique targeted tests pass**: 52 benchmark cases, 52 workflow
execution, 44 projection, 43 planning context, 63 multimedia runtime, 121 multimedia
finishing, 243 workflow-core and 71 full host tests (two new benchmark IPC cases).
Six affected host cases were rerun after the final metadata/comparison changes.
All 14 touched JS/MJS files pass syntax checks and ESLint; git diff --check passes.
No renderer/Studio build input changed, so no browser/Vite QA was needed. All
execution evidence is local or mocked; no provider calls, uploads, paid generations,
price queries, dependencies, binaries or schema migrations occurred. Submodules and
the excluded NEXT_HISTORY_TASK.md file are untouched.
