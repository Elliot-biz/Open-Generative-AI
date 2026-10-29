# External semantic and subjective Creative QC v1

Objective QC supplies measured/authored facts. External semantic interpretation
describes what those facts and available visual evidence suggest; subjective
judgment assesses the explicit creative direction. Both external classes remain
non-deterministic `SUBJECTIVE_CREATIVE` findings. `assessment.interpretation`
distinguishes SEMANTIC, SUBJECTIVE and HUMAN_ONLY without changing existing QC
categories. No model, network client, OCR, inference runtime or quality score is
introduced.

## Flow and contracts

Use `plan_semantic_creative_qc` (PLAN) to obtain a review snapshot, then submit the
external judgment using `evaluate_semantic_creative_qc` (ACT, allowExecution:true,
commandId). These delegate to fixed trusted host methods. The stdio client uses
its existing generic manifest-driven call method; request correlation, replay
protection, ACT ambiguity and shutdown behavior apply unchanged. Browser/preload
privilege is not expanded.

The exported `semanticRequestSchema`, `semanticSubmissionSchema` and
`semanticReviewContract` are discoverable in the bridge manifest. The request has:

- schemaVersion:1 and requestId
- projectId, workflowId, workflowHash and a completed session runId
- sourceQc:{assetId,checksum}, referring to a canonical immutable QC record
- productionIntent (descriptive, max 2000 characters)
- selected dimensions and policy

Policy requires minimumActionableConfidence MODERATE or HIGH,
humanOnlyDimensions, allowSuggestions and maxFindings (0–16). All fields are
allowlisted; there is no arbitrary workflow patch or executable prose field.
The host verifies the completed Workflow Execution run and workflow hash.

The snapshot includes the exact source QC result/evidence hashes, artifact
checksums, objective observations, project title/description, production intent,
scope and policy. `snapshotHash` excludes submission time and evaluator/session
metadata. Repeating identical inputs produces the same snapshot identity.
Frame references are existing explicit sample ordinals bound to evidence/artifact
checksums. They are labeled `sample_reference_not_image_bytes`: no image is
claimed to have been viewed, and no new frame extraction path is added. A harness
must use actual available visual material before asserting pixel-level semantics;
metadata alone does not establish CTA wording, facial identity or brand standards.

Submission fields are schemaVersion:1, snapshotHash, evaluator, submittedAt and
findings. Evaluator requires id, class:external and version; model and
harnessSessionId are optional. No vendor is required. submittedAt is a valid ISO
timestamp retained in the result, not request identity. Each finding requires:

- id, interpretation and dimension
- target:{artifactId,nodeId?,timelineItemId?,audioEventId?,startFrame?,endFrame?}
- statement, evidenceRefs, rationale and claims
- confidence LOW/MODERATE/HIGH
- importance INFO/WARNING/ERROR/BLOCKING
- actionability OBSERVATIONAL/ADVISORY/ACTIONABLE/HUMAN_ONLY
- optional suggestedDirection when policy permits

Evidence references select source QC finding IDs, `context` or `production_intent`.
There must be 1–8 references and usable QC evidence, except LOW-confidence
HUMAN_ONLY requests may rely on context alone. Statement/rationale/direction limits
are 500/2000/1000 characters. At most 16 findings and eight typed claims per finding
are admitted; total submission is capped at 64 KiB. Targets resolve canonical IDs.
Review requests cap at 128 KiB and existing QC publication limits still apply.

## Dimensions and judgment boundaries

opening_hook, product_prominence, visual_hierarchy, pacing_energy,
composition_clarity, clutter, style_consistency, brand_fit, story_clarity,
emotional_effect, cta_visibility and cta_clarity are supported scopes. Selecting a
scope does not prove sufficient evidence for a judgment. Missing brand context
requires LOW/non-actionable or HUMAN_ONLY findings. The project description is
the only currently supplied brand/context text; it is never invented. CTA exact
wording cannot be measured by this adapter; only canonical authored text or
externally available visual evidence can support such an interpretation.

For opening/product/pacing review, cite the existing opening-window, target,
face, Timeline, segment/activity and beat/onset QC findings as available. Faster
cuts or larger area do not automatically mean better creative quality.

Confidence is evaluator certainty, separate from importance. ACTIONABLE requires
the policy minimum confidence, usable QC evidence, and no human-only policy.
LOW confidence never becomes actionable. Human-only findings remain review-gated.

## Contradictions, status and revision

Typed factual claims use `{evidenceId,value}` and must equal the referenced QC
observation's `measured` value. For example, a claim of frame 80 when QC measured
24 rejects the entire submission with `QC_SEMANTIC_OBJECTIVE_CONTRADICTION`.
The adapter cannot detect contradictions hidden in natural-language prose; a
reviewer/external harness must express measurable claims in the typed field. It
never parses prose into facts or edits. All original objective findings remain
unchanged in the new canonical QC record.

ACTIONABLE appends a required FAIL criterion: REVISION_NEEDED. HUMAN_ONLY appends
a required REVIEW criterion: HUMAN_REVIEW_REQUIRED. ADVISORY/OBSERVATIONAL add
non-required findings. Empty/advisory submissions preserve objective acceptance;
they cannot override existing objective failures/blockers. Existing state
precedence is authoritative. Invalid/stale submissions reject without publication.
Requested human-only dimensions, and brand-fit review without project description,
produce a mandatory human criterion even when the external response omits findings.

Accepted evaluations are immutable `creative-qc-result` assets using existing QC
storage and hashes. New judgment requires a new result. `get_creative_qc` returns
CURRENT/STALE metadata for semantic records while preserving historical results;
current means the bound snapshot is intact. Host retrieval also checks completed
session run state and its current primary node outputs. Review currently accepts
primary registered outputs exposed as node.result.output; separate stem/variant
collections need a future explicit output selector. Workflow changes, rerun output
changes or corrupt/mismatched bound assets make it stale. Call PLAN again before submission; the snapshot is checked again before
publication. Existing review is never silently copied onto revised media.

An accepted actionable finding has a matching assessment requirement and canonical
revision target. External reasoning must explicitly author Structured Creative
Revision Intent. Creative Revision validates it and delegates to Agent/Workflow
Execution. The real stdio test exercises this path with local audio. Revised QC
retains unresolved assessment requirements, requiring fresh external/human review.
Submitting evaluation itself performs no workflow mutation or execution.

## Example finding

```json
{"id":"opening_emphasis","interpretation":"SUBJECTIVE",
 "dimension":"opening_hook","target":{"artifactId":"final"},
 "statement":"The reveal needs stronger emphasis for the product-first brief.",
 "evidenceRefs":["product_first","production_intent"],
 "confidence":"MODERATE","importance":"ERROR","actionability":"ACTIONABLE",
 "rationale":"The observed reveal timing is factual; stronger emphasis is a creative recommendation.",
 "claims":[{"evidenceId":"product_first","value":24}],
 "suggestedDirection":"Emphasize the reveal earlier through structured intent."}
```

Tests use a deterministic external mock and local fixtures. They do not certify a
real model's judgment or authenticity. Authentication of evaluator identities,
automatic natural-language contradiction detection, media delivery to an external
vision harness and durable session recovery remain outside this contract.
