# Creative QC Foundation v1

Objective extensions are documented in `WHIHM_OBJECTIVE_EVIDENCE.md`: bounded
pixel-domain evidence, typed comparisons, authored production measurements,
change-derived segment statistics, checksum-bound face/mask normalization,
target prominence and linkage to existing audio timing candidates. Explicit
revision outcomes still convert into post-render QC requirements.

`EVALUATE_CREATIVE` / `creative-qc` / `evaluate_creative` evaluates a production
against explicit requirements. It writes immutable evidence only. It cannot edit
workflows, approve execution, rerun work, rank providers, retry or invoke a model.
External reasoning/Agent Execution may later propose separate revisions.

Upstream UI/provider moderation and workflow approval are not production acceptance.
Performance Benchmark already supplies useful immutable attempt/evidence patterns
and explicit human-origin assessment conventions, but evaluates candidates rather
than one production against technical requirements. QC reuses its acceptance states,
project review records, immutable JSON asset imports and Media Inspection; no
benchmark schema/framework, project schema or workflow executor is replaced.

## Request v1

Required fields: schemaVersion=1, requestId, objective, artifacts, requirements,
evidence, reviewRefs, policy, humanReview. Optional association contains workflowId,
workflowHash, runId and nodeIds. Project context comes from the trusted project
handle; results include the verified project ID when available. Existing workflow
hash/node associations are checked. Run association remains an explicit caller
reference, not reconstructed execution authority.

Artifacts: `{id,assetId,checksum,role}`. Role here is a logical output binding;
`role` evaluator compares the actual registry role to its explicit expected value.
Evidence: `{id,assetId,checksum,sourceClass,artifactId}` with optional
`sourceAssetId`, `sourceChecksum` and `targetId` for specialized evidence. All
inputs resolve through the existing project registry, byte/hash checks and logical
paths. JSON evidence is capped at 2 MiB; QC records also cap at 2 MiB and
individual observations at 32 KiB; requests at 128 KiB, 16 artifacts/evidence/
reviews and 64 criteria. No arbitrary file path or remote URL is followed.

Requirements: `{id,category,required,severity,humanReview,rule,artifactId?,target?,
remediation?,description?}`. Description is non-authoritative context. IDs are unique. Categories are TECHNICAL, OBJECTIVE_INTENT,
SUBJECTIVE_CREATIVE, HUMAN_ONLY. Severity INFO/WARNING/ERROR/BLOCKING is advisory
priority, not a hidden numeric weight. humanReview is never|required. Subjective
and human-only requirements accept only assessment/semantic rules. The objective
is context, never executable authority or an implicit aesthetic criterion.

Example technical criterion:

```json
{"id":"duration","category":"TECHNICAL","required":true,"severity":"ERROR",
 "humanReview":"never","artifactId":"final",
 "rule":{"type":"duration","value":12,"tolerance":0.000001},
 "target":{"nodeId":"mux","parameterFamily":"duration"},
 "remediation":"Produce the explicitly requested duration"}
```

Policy requires explicit booleans allowRecordedDeterministic and
allowExternalAssessments. Global humanReview.required adds a separate mandatory
`qc_global_review` criterion. That ID is reserved from authored criteria.

## Evaluation and state

Rules: asset_exists, checksum, inspection (existing requirements profile), media_kind,
dimensions, aspect, duration, frame_rate, streams (video/audio booleans), output_count
(unique registered asset IDs, optional logical role filter), role, benchmark_metric,
evidence_value, lineage_event, assessment and semantic. `objective_measurement`
families are `timeline`, `audio`, `visual`, `segment`, `face`, `mask`, `target` and
`audio_timing`. Rules and fields are allowlisted. Counts, tolerances, dimensions,
sampling windows and timing ranges validate before evaluation.

Fresh inspection facts retain backend/scope/validation evidence. Inspection is
header-based technical readability, not full decoding, CFR certainty, aesthetics,
identity, product appearance, intelligibility or subjective sound quality. Missing
inapplicable facts produce review, never fabricated values. Aspect uses declared
display aspect when available; unknown pixel aspect does not become square by fiat.

`benchmark_metric` selects a named boolean pass field from registered benchmark
JSON and checks its final artifact identity/hash. It does not remeasure cuts,
ducking or sync. `evidence_value` compares an explicit bounded property path/value
in a target-bound JSON record. `lineage_event` checks authored Timeline item/Audio
Production event frame placement from registered metadata; it is not proof of
actual visual/audio content. `visual`/`segment` decode bounded grayscale samples;
`face`/`mask`/`target` normalize existing registered specialized evidence; and
`audio_timing` references existing onset/beat candidates only. No semantic scene
facts or object identity are invented.

Overall state derives only from required findings, in this precedence:

1. BLOCKED: input/evidence integrity or required evidence is unavailable/invalid.
2. REVISION_NEEDED: actionable evaluable criterion fails, including explicit rejection.
3. HUMAN_REVIEW_REQUIRED: unresolved subjective/human/unevaluable criteria.
4. PASS: all required criteria pass and mandatory human review is resolved.

Invalid request syntax returns rejected diagnostics instead of a QC acceptance
state. Invalid supplied artifact/evidence references block evaluation even if a
particular optional criterion would not otherwise use them. Optional criterion
failures remain visible but do not secretly determine overall acceptance.

## Evidence trust and human boundaries

Trust classes: verified_deterministic, recorded_deterministic, specialized_model,
provider_metadata, model_assessment, human_assessment, unverified. Fresh local checks
may assert only facts they actually verify. Broken artifacts remain unverified.
Imported recorded measurements require explicit allowRecordedDeterministic=true.
Specialized face/mask evidence requires source asset/checksum binding and is
normalized before use; its provenance is not upgraded to deterministic. SHA256
verifies byte identity, not who made a measurement or whether a claimed result is true.
Recorded provenance is caller-declared and is marked measurementAuthenticity:
not_attested. Never relabel provider/model claims as fresh deterministic evidence.
An authorized caller must decide which recorded evidence is appropriate to trust.

External subjective assessment JSON schemaVersion 1 requires evaluator
`{id,type:model|provider,version}`, exact `{assetId,checksum}` target, definitionHash,
requirementId, decision ACCEPT|USABLE_WITH_ISSUES|REJECT, notes and ISO timestamp.
Optional confidence/requestId are preserved; confidence is never invented. The
source class must match evaluator type. Policy allowExternalAssessments permits
these only for subjective criteria with no mandatory human review. They cannot
satisfy HUMAN_ONLY or deterministic benchmark facts. Ambiguous/conflicting reviews
remain unresolved. No aggregate creative score or private reasoning is required.

recordCreativeQcHumanAssessment requires allowExecution:true and origin:human,
a request/criterion, evaluator id/version, decision and notes. It uses existing
immutable project.addReview, bound to the request definition and exact target hash.
Evaluate again with returned reviewId in reviewRefs. ACCEPT can resolve review;
USABLE_WITH_ISSUES/REJECT request revision. Acceptance never overrides an objectively
failed or checksum-blocked criterion. Changed requirements/artifacts require a
fresh matching assessment. Explicit human fixtures in tests are declarations, not
claims that a real person reviewed generated media. Origin is an attestation,
not authenticated identity, matching existing review/benchmark boundaries.
QC acceptance does not substitute for workflow approval, provider liveness or publish
permission. There is no automatic human decision or execution continuation.

## Results, storage and revision targets

Results contain schemaVersion/kind/evaluatorVersion, project ID, definitionHash,
evidenceHash, resultHash, request, state, findings, evidence and workflow/run
association. Findings carry category, required flag, severity, outcome, evidence,
observations, affected artifact/hash, optional assessment/confidence and advisory
remediation/targets. Objective observations retain `PASS`, `FAIL`, `UNVERIFIED`,
`UNSUPPORTED` or `BLOCKED` status, expected/measured/tolerance/unit and the
normalized measurement. The result `objectiveSummary` counts evaluated, passed,
failed, unverified, unsupported and blocked checks. Node/parameter family, Timeline
item, Audio event and output role targets are authored hints; node IDs are validated
when a workflow association is supplied. Targets never become edit commands.

Definition hash includes requirements, artifact expectations, objective and policy,
but excludes evidence/reviewRefs. Evidence hash covers verified references and
review provenance. Result hash covers the canonical result without timestamps
invented at evaluation. Same request/evidence yields the same hash; new review
IDs/timestamps or evaluator artifacts alter evidence/result hashes. No prior result
is updated. Each evaluation imports a fresh immutable creative-qc-result JSON asset.
getCreativeQc verifies role, registry checksum, record hashes and derived state.
It reads a historical record; it does not assert current artifact acceptance or
rehydrate a trusted workflow/agent run. Retrieval integrity is not a signature.

If a corrupt project cannot accept new evidence, evaluation returns BLOCKED with
record:null and persistence.status=blocked. It never bypasses project-open/import
integrity or claims that an ephemeral response was durably stored. A healthy project
stores PASS, revision, review and blocked-evidence results normally.

## APIs and discovery

Fixed host/preload: planCreativeQc, evaluateCreativeQc, getCreativeQc,
recordCreativeQcHumanAssessment. Planning validates/checks references and hashes,
reports blockers and requirements, performs no assessment or writes. Evaluation
and human recording require explicit execution permission and existing host guards.
No workflow node or agent revision action is admitted in this milestone.

Projection adds one local capability/entry: 53 groups /621 entries. Generic planning
context derives rules, states, evidence classes and limitations; there is no
planning-specific registry or model binding. No dependencies or renderer UI.

## Controlled acceptance and limitations

The real Anime / Action benchmark runs through its existing workflow and records
its technical evidence. QC consumes the registered production-result.json bound
to the final video hash. Required existence, inspection, 12-second duration,
streams, 25 fps, cuts, beat mapping, final impact sync, ducking, stretch, A/V sync
and technical metrics pass. A separately registered failed impact metric produces
REVISION_NEEDED targeted to mux/authored_timing. Invalid checksums produce BLOCKED.
No bespoke duplicate measurements or provider calls are added to QC.

Human-only and mocked subjective fixtures exercise review/provenance policies.
Subjective evaluation engines, authenticated reviewer roles/signatures, semantic
vision/audio analysis, external evidence attestation, revision loops, Creative
Memory, durable workflow continuation and publishing remain deferred. Depth
objective evidence is explicitly unsupported because no authoritative registered
depth source exists (`DEPTH_OBJECTIVE_EVIDENCE_UNSUPPORTED_NO_AUTHORITATIVE_SOURCE`).
Live MediaPipe extraction remains environment-blocked by
`FACE_ELECTRON_RUNNER_UNAVAILABLE`; supplied valid face artifacts are still
normalized. QC remains conservative when evidence cannot support the requested fact.

## Validation

The focused QC/evidence coverage includes the existing Creative QC acceptance
suite plus deterministic objective-evidence fixtures for visual change/motion,
luminance, segment statistics, face/mask normalization, target prominence, and
audio onset/beat linkage. Targeted regression suites cover the dependent media,
audio, timeline, workflow, guidance, segmentation, bridge, and intent paths.
Syntax/ESLint and `git diff --check` are required gates for touched files. No
renderer changes, provider calls, paid usage or new dependencies are required.
