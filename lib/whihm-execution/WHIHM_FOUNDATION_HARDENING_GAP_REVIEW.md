# WHIHM final foundation-hardening gap review

> **Depth addendum (2026-10-26):** G13 is implemented through dedicated canonical
> `depth`, preserving XOR image/video roles and typed artifacts via shared processV2V.
> Contract availability and mocked QA do not verify provider fidelity. The historical
> gap ledger below is superseded only for G13. The desired pre-projection program
> is **not yet declared complete**: Suno Guided Voice Clone remains planned next.
> Existing provider clarification, local staging and packaging caveats remain.

> **Current-wave addendum (2026-10-26; starting HEAD ebb589965ad6302c2f552f8c0327d9f971b35b27):**
> Original G01 is complete: both unsuffixed Spicy V2V executors are bound. Six V2V
> and five I2V executors gained reviewed contracts. Expanded wave result is PARTIAL:
> ordinary Spicy T2V/single-image I2V need first-party audio-toggle/draft/resolution
> clarification. For the expanded priority set, retain **READY_AFTER_1_FOCUSED_TASKS**:
> resolve those two ordinary-render contracts and harden only the coherent subset.
> This is a provider-evidence task, not a new architectural blocker. A read-only
> projection can alternatively represent them as explicitly deferred; do not claim
> complete requested Spicy generation coverage. Historical review/ledger below is
> preserved; this note and the latest execution/V2V addenda supersede affected statuses.


Inspected source HEAD: `07b3fd3bad1329ef0210a4e15f5137e773bb6cb6`.
Inspection/public metadata refresh: **2026-10-26**.
**Review outcome: PASS. Foundation exit gate: READY_AFTER_1_FOCUSED_TASKS.**
This is a review decision, not a claim of runtime production certification.

Open Generative AI (`Anil-matcha/Open-Generative-AI`) remains the foundation.
The minimum source/development pre-projection work is **one focused binding task
for the two unsuffixed Seedance 2.5 Spicy V2V executors**. They are strategically
important to WHIHM, even though edit/extend intents already exist. Their public
contracts are adequate; current canonical admission/native-resolution facets are
not. No model is bound, and no eligibility/runtime behavior changes in this review.

All other items can remain explicit gaps in an extensible projection. Packaging
is a **real release blocker**, not an optional production detail, but is not a
prerequisite to implementing source/development read-only projection metadata.
Do not call the packaged product production-ready after only the Spicy task.

This review supersedes earlier **priority** recommendations that treated Spicy
as a low-value overlapping profile. It does not rewrite historical evidence,
change runtime allowlists or erase provider ambiguity. Four reviewed utility
intents and all existing specialized contracts remain available as previously
implemented; unreviewed catalog matches are not promoted to equivalent assurance.

## Method, evidence and counting

Established documents were read/reused: [capability census](WHIHM_CAPABILITY_CENSUS.md),
[execution architecture/contracts](WHIHM_EXECUTION_BRIDGE.md), and
[complete V2V inventory](V2V_CONTRACT_REVIEW.md). Their original census counts are
historical; later milestone sections and the checked-out resolver govern current
availability. This document is the current decision/exit-gate authority.

**CONFIRMED** means inspected source or first-party request/result declaration;
**INFERRED** marks architectural/prioritization conclusions; **UNVERIFIED** means
provider runtime behavior, media properties, fidelity or deployment not tested.
Public documentation is not a measured output guarantee.

Inspected source includes all nine Studio catalog arrays in models.js;
modelCapabilities/modelParameters/videoMediaInputs/videoToolCapabilities and
seedanceModels; imageInputContracts/advancedImageInputContracts,
audioInputContracts, videoInputContracts, recastInputContracts,
motionControlInputContracts, v2vInputContracts and creativeServiceInputContracts;
shared muapi.js/lifecycle; execution bridge/runtime/readiness/host and renderer
host consumer; local model/client and Electron sd.cpp/Wan2GP implementations;
Workflow/Agent Studios and existing workflow-builder/service call sites;
package.json, afterPack.js and the Electron ESM loader. Existing tests were
inspected as evidence of mocked coverage, not rerun and not relabeled live tests.

Public unauthenticated GETs refreshed [OpenAPI](https://api.muapi.ai/openapi.json)
and **53 exact model detail records**: every one of the 42 Spicy IDs plus Gemini
Omni edit, MMAudio video sound, Depth Anything, Suno clone/create, Qwen LoRA,
OmniHuman, two Kling O1 reference routes and two LTX Lip Sync IDs. All detail/path
lookups succeeded. No account/voice-list requests, auth, estimates, uploads,
POSTs, agents, workflows, local inference or paid execution occurred. Private
voices and provider jobs were never accessed. Temporary metadata is outside the
repo and contains no credentials. Other current public schema checks reuse this
OpenAPI snapshot and prior exact metadata evidence, not a new catalog scrape.

| Current checked-out measure | Reconciled result |
| --- | --- |
| Studio catalogs | 587 ordered rows / 582 distinct IDs across 9 catalogs |
| V2V | 75 rows: D33 / F13 / I9 / R16 / S4; 29 bound, 42 unresolved, 4 specialized |
| Structural remote eligibility | 538 mode/ID pairs, 535 distinct logical IDs, 526 effective endpoint strings; includes 3 fixed creative services outside catalogs. Not a count of fully certified executors |
| Canonical remote modes | 11: t2i, i2i, t2v, i2v, v2v, audio, recast, motion_control, lipsync, clipping, motion_graphics |
| Explicit reviewed feature sets | V2V29; Audio22; Advanced Image15 distinct IDs/17 mode pairs; Advanced Video31 I2V; Lip Sync15; Recast 3; Motion Control2; fixed creative-service endpoints3 |
| Local configurations | 13: 6 sd.cpp + 7 Wan2GP; structural routes, not installed/probed/fully staged execution certificates |
| Exact Spicy IDs | 42: T2V9 + I2V23 + V2V9 + Motion Control1; no Spicy IDs in the other five catalogs |
| This review's decision units | **40 gap/decision groups** G01–G40; child inventories cover all 42 unresolved V2V IDs, 4 S entries and all 42 Spicy IDs |

A group is counted once even when multiple models/semantic subfeatures occur.
Spicy V2V entries appear in both appendices but are not extra gap units. Complete
review is not synonymous with complete runtime evidence or total model admission.

## Primary gap decision ledger

Every group has exactly one primary classification. Secondary constraints do
not change that classification. “Defer” does not mean unimportant; in particular
Spicy remains strategically valuable after the minimum pair is completed.

| ID | Gap / decision scope | Primary classification | Evidence / disposition |
| --- | --- | --- | --- |
| G01 | Unsuffixed Seedance 2.5 Spicy V2V edit/extend | BIND_BEFORE_PROJECTION | Two strategically required existing executors; current schemas sufficient; admission/native-resolution source facet missing. |
| G02 | 18 fixed-resolution Seedance V2V routes: Standard/Intl/Spicy | NEEDS_PROVIDER_CLARIFICATION | Suffix implies fixed size; OpenAPI still accepts every resolution/default 720p. Six are I and twelve D, all unbound. |
| G03 | Two unsuffixed Seedance Intl V2V routes | DEFER_UNTIL_AFTER_PROJECTION | Useful region alternatives; no requirement to block initial projection. Explicit source-control review remains necessary. |
| G04 | Six Happy Horse 1/1.1 edit variants | LOW_VALUE_OR_REDUNDANT | Existing reference editors are adequate; image-required and suffix discrepancies remain. Quality superiority unmeasured. |
| G05 | Gemini Omni non-Flash multimodal video edit | DEFER_UNTIL_AFTER_PROJECTION | Valuable additional controls, but Flash/edit/reference alternatives already exist; required-role and trim/opaque-ID review needed. |
| G06 | Four extension alternatives: Seedance 1.5 Pro/fast, LTX 2.3, Pixverse 6 | DEFER_UNTIL_AFTER_PROJECTION | Optional camera/audio/style/short-duration controls add leverage but existing extension contracts cover initial workflows. |
| G07 | Wan2.2 Spicy video extension | DEFER_UNTIL_AFTER_PROJECTION | Strategically useful Spicy option, not dismissed as redundancy; not the required Seedance 2.5 pair. Separate schema/test admission later. |
| G08 | Three alternate Kling motion-control executors | DEFER_UNTIL_AFTER_PROJECTION | Existing Recast/Motion controls suffice initially; later preserve source/target roles and compare performance, not executor count. |
| G09 | AI Dance Effects | DEFER_UNTIL_AFTER_PROJECTION | Image+video effect with optional prompt/resolution; distinct dance quality/control surface still unmeasured. Later performance review. |
| G10 | AI Video Upscaler Pro | LOW_VALUE_OR_REDUNDANT | Source+resolution alternative; many reviewed upscalers already available, no established extra control or quality advantage. |
| G11 | Remix Video | LOW_VALUE_OR_REDUNDANT | Aspect-only source transform overlaps admitted Reframe; exact crop semantics unverified. |
| G12 | MMAudio video sound | NEEDS_PROVIDER_CLARIFICATION | Request confirmed; output metadata conflicts between audio/video and original-audio behavior is unspecified. |
| G13 | Depth Anything dual-input/dual-result | DEFER_UNTIL_AFTER_PROJECTION | Small scoped XOR/typed-result adaptation is plausible, but no initial depth-dependent requirement justifies blocking projection. |
| G14 | 20 non-suffixed Spicy T2V/I2V catalog executors | DEFER_UNTIL_AFTER_PROJECTION | Strategically meaningful, currently generic-route eligible rather than feature-reviewed. Expose partial assurance; prioritize later exact contracts. |
| G15 | 12 Spicy T2V/I2V fixed-resolution executors | NEEDS_PROVIDER_CLARIFICATION | Fresh exact schemas retain selectable resolution/default 720p despite suffixes. Current generic eligibility is not fixed-profile certification. |
| G16 | Seedance 2.5 Spicy Motion Control | DEFER_UNTIL_AFTER_PROJECTION | Existing shared service/catalog but canonical two-ID gate excludes it; later exact specialized contract review, not generic V2V. |
| G17 | Suno multi-stage voice cloning | FUTURE_EXTENSION | Provider phrase/liveness/user recording interaction needs guided lifecycle; generic submit/poll cannot substitute for real confirmation. |
| G18 | Newer Suno V6 model/control coverage | DEFER_UNTIL_AFTER_PROJECTION | Reviewed catalog subset intentionally keeps V5/V5_5 behavior; V6 duration/reference/version/persona differences need bounded review, not implicit promotion. |
| G19 | Suno voice management | FUTURE_EXTENSION | Voice listing/deletion/check/refresh are account/lifecycle operations, not generic media-generation fields. |
| G20 | Reviewed audio runtime/content assumptions | NEEDS_REAL_EXECUTION_TEST | 22 request contracts/nested dialogue/arrays are mocked; actual voice access, source lengths, content quality and outputs are not proven. |
| G21 | Qwen Image Edit Plus LoRA | NEEDS_PROVIDER_CLARIFICATION | Local camera/view controls conflict with current provider prompt/images/LoRA-list schema. Existing explicit unavailable gate must remain. |
| G22 | Layer masks/transparency/stacking/relationships | NEEDS_REAL_EXECUTION_TEST | Layer-list request/result transport is safe; editable-layer semantics and artifact relationships have not been established. No projection blocker. |
| G23 | Advanced image identity/enhancement/expression/pose meaning | DEFER_UNTIL_AFTER_PROJECTION | Project only actual contract roles: view controls are not universal expression/body pose; AI enhancement is not pixel preservation. |
| G24 | Two Kling O1 reference routes | DEFER_UNTIL_AFTER_PROJECTION | Catalog image requirement conflicts with nullable/video-only reference descriptions; retain canonical unavailability, use reviewed alternatives. |
| G25 | OmniHuman mask arrays | NEEDS_PROVIDER_CLARIFICATION | Optional mask list exists but source association/count/order/meaning is not documented; safe portrait+audio subset remains usable. |
| G26 | Broader LTX audio-only Lip Sync scope | DEFER_UNTIL_AFTER_PROJECTION | Provider permits missing portrait, product deliberately requires one. Do not silently relax existing image+audio contract. |
| G27 | Other unreviewed reference/keyframe profiles | DEFER_UNTIL_AFTER_PROJECTION | 31 exact I2V contracts are reviewed; suffix/profile branding does not confer their role/count guarantees on other IDs. |
| G28 | Existing Recast/Motion/Lip Sync/Clipping/Motion Graphics boundaries | KEEP_SPECIALIZED | Retain exact service/mode contracts; do not replace them with generic V2V or claim all bindings have the same media semantics. |
| G29 | Four S entries in the V2V inventory | KEEP_SPECIALIZED | Keep Kling v3 Pro/Wan Animate on Recast and InfiniteTalk/Volcengine on Lip Sync; no automatic alternate-model substitution. |
| G30 | Clipping coordinate schema and precision | NEEDS_PROVIDER_CLARIFICATION | Preserving real selection arrays is safe; units/crop schema/frame precision/clip-count guarantees are not declared by a coherent result contract. |
| G31 | Motion-graphics prior-request editability | NEEDS_REAL_EXECUTION_TEST | Saved animation code, ownership/completion and individual prior IDs require provider validation. Creation/edit contracts are already safe. |
| G32 | Local project input/output staging, especially Wan2GP I2V | DEFER_UNTIL_AFTER_PROJECTION | Canonical project uploads are rejected for local execution; Wan needs a trusted local start-frame path, and file results are redacted across host transport. |
| G33 | Local runtime availability/parameter fidelity | NEEDS_REAL_EXECUTION_TEST | 13 configured model IDs do not prove binaries/weights/GPU/backend readiness; local coercions/random seeds are not deterministic guarantees. |
| G34 | Packaged Electron WHIHM source inclusion | DEFER_UNTIL_AFTER_PROJECTION | Shipping blocker: files globs omit lib and source-relative dependencies loaded by main. Source/development metadata projection can proceed conditionally. |
| G35 | RUN_REMOTE_WORKFLOW | FUTURE_EXTENSION | OGA remote workflow execution exists; WHIHM canonical routes do not authorize/represent this aggregate operation yet. |
| G36 | RUN_AGENT | FUTURE_EXTENSION | Agent Studio chats/polling exist; no canonical agent executor, policy/attachment/cost/result contract yet. |
| G37 | Generic image/video catalog eligibility outside reviewed subsets | DEFER_UNTIL_AFTER_PROJECTION | Do not call every generic match contract-safe. Projection must expose assurance/limitations and validate through existing plan, not broaden admission. |
| G38 | Reviewed remote runtime and creative-fidelity validation | NEEDS_REAL_EXECUTION_TEST | Mocked QA establishes contracts/lifecycle, not paid-provider success, fidelity, latency, precise encoding or account availability. |
| G39 | Astra production-invocation policy over readiness/quotes/approvals | FUTURE_EXTENSION | Existing readiness/approval/budget evidence and allowExecution remain separate. Read-only projection must not become an automatic spender/scheduler. |
| G40 | Production extension portfolio | FUTURE_EXTENSION | Inspection/finishing/QC/memory/recipes/asset intelligence/continuity/brand/planning/lineage/selective regeneration/draft-final/delivery are later product work. |

## Exact reconciliation: all 42 unresolved V2V IDs

D/I labels remain exactly as checked out. The review decision column is a separate
planning vocabulary, not a mutation of canonical admission or D/I classifications.

| Exact ID | Current class | Decision group | Primary classification |
| --- | --- | --- | --- |
| `kling-v2.6-std-motion-control` | D | G08 | DEFER_UNTIL_AFTER_PROJECTION |
| `kling-v3.0-std-motion-control` | D | G08 | DEFER_UNTIL_AFTER_PROJECTION |
| `mmaudio-v2-video-to-video` | I | G12 | NEEDS_PROVIDER_CLARIFICATION |
| `ai-dance-effects` | D | G09 | DEFER_UNTIL_AFTER_PROJECTION |
| `ai-video-upscaler-pro` | D | G10 | LOW_VALUE_OR_REDUNDANT |
| `remix-video` | D | G11 | LOW_VALUE_OR_REDUNDANT |
| `wan2.2-spicy-video-extend` | D | G07 | DEFER_UNTIL_AFTER_PROJECTION |
| `seedance-v1.5-pro-video-extend` | D | G06 | DEFER_UNTIL_AFTER_PROJECTION |
| `seedance-v1.5-pro-video-extend-fast` | D | G06 | DEFER_UNTIL_AFTER_PROJECTION |
| `ltx-2.3-video-extend` | D | G06 | DEFER_UNTIL_AFTER_PROJECTION |
| `pixverse-v6-extend` | D | G06 | DEFER_UNTIL_AFTER_PROJECTION |
| `happy-horse-1-video-edit-1080p` | D | G04 | LOW_VALUE_OR_REDUNDANT |
| `happy-horse-1-video-edit-720p` | D | G04 | LOW_VALUE_OR_REDUNDANT |
| `happy-horse-1.1-video-edit-1080p` | D | G04 | LOW_VALUE_OR_REDUNDANT |
| `happy-horse-1.1-video-edit-720p` | D | G04 | LOW_VALUE_OR_REDUNDANT |
| `gemini-omni-video-edit` | I | G05 | DEFER_UNTIL_AFTER_PROJECTION |
| `kling-v2.6-pro-motion-control` | D | G08 | DEFER_UNTIL_AFTER_PROJECTION |
| `seedance-2.5-video-edit-480p` | I | G02 | NEEDS_PROVIDER_CLARIFICATION |
| `seedance-2.5-video-edit-1080p` | I | G02 | NEEDS_PROVIDER_CLARIFICATION |
| `seedance-2.5-video-edit-4k` | I | G02 | NEEDS_PROVIDER_CLARIFICATION |
| `seedance-2.5-video-extend-480p` | I | G02 | NEEDS_PROVIDER_CLARIFICATION |
| `seedance-2.5-video-extend-1080p` | I | G02 | NEEDS_PROVIDER_CLARIFICATION |
| `seedance-2.5-video-extend-4k` | I | G02 | NEEDS_PROVIDER_CLARIFICATION |
| `seedance-2.5-intl-video-edit` | D | G03 | DEFER_UNTIL_AFTER_PROJECTION |
| `seedance-2.5-spicy-video-edit` | D | G01 | BIND_BEFORE_PROJECTION |
| `seedance-2.5-intl-video-edit-480p` | D | G02 | NEEDS_PROVIDER_CLARIFICATION |
| `seedance-2.5-spicy-video-edit-480p` | D | G02 | NEEDS_PROVIDER_CLARIFICATION |
| `seedance-2.5-intl-video-edit-1080p` | D | G02 | NEEDS_PROVIDER_CLARIFICATION |
| `seedance-2.5-spicy-video-edit-1080p` | D | G02 | NEEDS_PROVIDER_CLARIFICATION |
| `seedance-2.5-intl-video-edit-4k` | D | G02 | NEEDS_PROVIDER_CLARIFICATION |
| `seedance-2.5-spicy-video-edit-4k` | D | G02 | NEEDS_PROVIDER_CLARIFICATION |
| `seedance-2.5-intl-video-extend` | D | G03 | DEFER_UNTIL_AFTER_PROJECTION |
| `seedance-2.5-spicy-video-extend` | D | G01 | BIND_BEFORE_PROJECTION |
| `seedance-2.5-intl-video-extend-480p` | D | G02 | NEEDS_PROVIDER_CLARIFICATION |
| `seedance-2.5-spicy-video-extend-480p` | D | G02 | NEEDS_PROVIDER_CLARIFICATION |
| `seedance-2.5-intl-video-extend-1080p` | D | G02 | NEEDS_PROVIDER_CLARIFICATION |
| `seedance-2.5-spicy-video-extend-1080p` | D | G02 | NEEDS_PROVIDER_CLARIFICATION |
| `seedance-2.5-intl-video-extend-4k` | D | G02 | NEEDS_PROVIDER_CLARIFICATION |
| `seedance-2.5-spicy-video-extend-4k` | D | G02 | NEEDS_PROVIDER_CLARIFICATION |
| `depth-anything` | I | G13 | DEFER_UNTIL_AFTER_PROJECTION |
| `happy-horse-1-video-edit` | D | G04 | LOW_VALUE_OR_REDUNDANT |
| `happy-horse-1.1-video-edit` | D | G04 | LOW_VALUE_OR_REDUNDANT |

The four S entries are `kling-v3.0-pro-motion-control`, `wan2.2-animate`,
`infinitetalk-video-to-video` and `volcengine-video-to-video-lip-sync`:
**KEEP_SPECIALIZED** (G29). Existing Recast/Motion/Lip/Clipping/Motion Graphics
contract boundaries are likewise KEEP_SPECIALIZED (G28), not incomplete V2V work.

## Complete Spicy inventory and strategic decision

All exact IDs containing spicy/Spicy in the nine current catalogs are listed
below. Endpoint equals ID for these entries. “Generic eligible” means the current
resolver can select an existing service; it does not mean an explicit reviewed
Spicy input contract exists. None of these 42 IDs currently belongs to the reviewed
advanced-video/V2V/Motion feature sets. The two selected V2V IDs are unavailable,
not already bound. Counts below are model IDs, not creative-intent inflation.

| Exact ID | Catalog / execution family | Current canonical status | Group / primary decision | Blocks source projection? |
| --- | --- | --- | --- | --- |
| `seedance-2.5-spicy-text-to-video` | t2vModels / t2v | Generic eligible; UNREVIEWED feature contract | G14 / DEFER_UNTIL_AFTER_PROJECTION | No; retain explicit limitation |
| `seedance-2-spicy-text-to-video` | t2vModels / t2v | Generic eligible; UNREVIEWED feature contract | G14 / DEFER_UNTIL_AFTER_PROJECTION | No; retain explicit limitation |
| `seedance-2-spicy-text-to-video-fast` | t2vModels / t2v | Generic eligible; UNREVIEWED feature contract | G14 / DEFER_UNTIL_AFTER_PROJECTION | No; retain explicit limitation |
| `seedance-2-mini-spicy-text-to-video` | t2vModels / t2v | Generic eligible; UNREVIEWED feature contract | G14 / DEFER_UNTIL_AFTER_PROJECTION | No; retain explicit limitation |
| `wan3.0-spicy-text-to-video` | t2vModels / t2v | Generic eligible; UNREVIEWED feature contract | G14 / DEFER_UNTIL_AFTER_PROJECTION | No; retain explicit limitation |
| `seedance-2.5-spicy-text-to-video-480p` | t2vModels / t2v | Generic eligible; UNREVIEWED feature contract | G15 / NEEDS_PROVIDER_CLARIFICATION | No; retain explicit limitation |
| `seedance-2.5-spicy-text-to-video-1080p` | t2vModels / t2v | Generic eligible; UNREVIEWED feature contract | G15 / NEEDS_PROVIDER_CLARIFICATION | No; retain explicit limitation |
| `seedance-2.5-spicy-text-to-video-4k` | t2vModels / t2v | Generic eligible; UNREVIEWED feature contract | G15 / NEEDS_PROVIDER_CLARIFICATION | No; retain explicit limitation |
| `seedance-2-mini-spicy-omni-reference` | t2vModels / t2v | Generic eligible; UNREVIEWED feature contract | G14 / DEFER_UNTIL_AFTER_PROJECTION | No; retain explicit limitation |
| `wan2.2-spicy-image-to-video` | i2vModels / i2v | Generic eligible; UNREVIEWED feature contract | G14 / DEFER_UNTIL_AFTER_PROJECTION | No; retain explicit limitation |
| `seedance-2.5-spicy-image-to-video` | i2vModels / i2v | Generic eligible; UNREVIEWED feature contract | G14 / DEFER_UNTIL_AFTER_PROJECTION | No; retain explicit limitation |
| `seedance-2-spicy-image-to-video` | i2vModels / i2v | Generic eligible; UNREVIEWED feature contract | G14 / DEFER_UNTIL_AFTER_PROJECTION | No; retain explicit limitation |
| `seedance-2-spicy-image-to-video-fast` | i2vModels / i2v | Generic eligible; UNREVIEWED feature contract | G14 / DEFER_UNTIL_AFTER_PROJECTION | No; retain explicit limitation |
| `seedance-2-mini-spicy-image-to-video` | i2vModels / i2v | Generic eligible; UNREVIEWED feature contract | G14 / DEFER_UNTIL_AFTER_PROJECTION | No; retain explicit limitation |
| `wan3.0-spicy-image-to-video` | i2vModels / i2v | Generic eligible; UNREVIEWED feature contract | G14 / DEFER_UNTIL_AFTER_PROJECTION | No; retain explicit limitation |
| `seedance-2.5-spicy-image-to-video-480p` | i2vModels / i2v | Generic eligible; UNREVIEWED feature contract | G15 / NEEDS_PROVIDER_CLARIFICATION | No; retain explicit limitation |
| `seedance-2.5-spicy-image-to-video-1080p` | i2vModels / i2v | Generic eligible; UNREVIEWED feature contract | G15 / NEEDS_PROVIDER_CLARIFICATION | No; retain explicit limitation |
| `seedance-2.5-spicy-image-to-video-4k` | i2vModels / i2v | Generic eligible; UNREVIEWED feature contract | G15 / NEEDS_PROVIDER_CLARIFICATION | No; retain explicit limitation |
| `seedance-2.5-spicy-first-last-frame` | i2vModels / i2v | Generic eligible; UNREVIEWED feature contract | G14 / DEFER_UNTIL_AFTER_PROJECTION | No; retain explicit limitation |
| `seedance-2.5-spicy-first-last-frame-480p` | i2vModels / i2v | Generic eligible; UNREVIEWED feature contract | G15 / NEEDS_PROVIDER_CLARIFICATION | No; retain explicit limitation |
| `seedance-2.5-spicy-first-last-frame-1080p` | i2vModels / i2v | Generic eligible; UNREVIEWED feature contract | G15 / NEEDS_PROVIDER_CLARIFICATION | No; retain explicit limitation |
| `seedance-2.5-spicy-first-last-frame-4k` | i2vModels / i2v | Generic eligible; UNREVIEWED feature contract | G15 / NEEDS_PROVIDER_CLARIFICATION | No; retain explicit limitation |
| `seedance-2.5-spicy-omni-reference` | i2vModels / i2v | Generic eligible; UNREVIEWED feature contract | G14 / DEFER_UNTIL_AFTER_PROJECTION | No; retain explicit limitation |
| `seedance-2.5-spicy-omni-reference-480p` | i2vModels / i2v | Generic eligible; UNREVIEWED feature contract | G15 / NEEDS_PROVIDER_CLARIFICATION | No; retain explicit limitation |
| `seedance-2.5-spicy-omni-reference-1080p` | i2vModels / i2v | Generic eligible; UNREVIEWED feature contract | G15 / NEEDS_PROVIDER_CLARIFICATION | No; retain explicit limitation |
| `seedance-2.5-spicy-omni-reference-4k` | i2vModels / i2v | Generic eligible; UNREVIEWED feature contract | G15 / NEEDS_PROVIDER_CLARIFICATION | No; retain explicit limitation |
| `wan2.7-image-to-video-spicy` | i2vModels / i2v | Generic eligible; UNREVIEWED feature contract | G14 / DEFER_UNTIL_AFTER_PROJECTION | No; retain explicit limitation |
| `wan2.6-image-to-video-spicy` | i2vModels / i2v | Generic eligible; UNREVIEWED feature contract | G14 / DEFER_UNTIL_AFTER_PROJECTION | No; retain explicit limitation |
| `wan3.0-spicy-reference-to-video` | i2vModels / i2v | Generic eligible; UNREVIEWED feature contract | G14 / DEFER_UNTIL_AFTER_PROJECTION | No; retain explicit limitation |
| `minimax-h3-image-to-video-spicy` | i2vModels / i2v | Generic eligible; UNREVIEWED feature contract | G14 / DEFER_UNTIL_AFTER_PROJECTION | No; retain explicit limitation |
| `seedance-2-spicy-omni-reference` | i2vModels / i2v | Generic eligible; UNREVIEWED feature contract | G14 / DEFER_UNTIL_AFTER_PROJECTION | No; retain explicit limitation |
| `seedance-2-spicy-omni-reference-fast` | i2vModels / i2v | Generic eligible; UNREVIEWED feature contract | G14 / DEFER_UNTIL_AFTER_PROJECTION | No; retain explicit limitation |
| `wan2.2-spicy-video-extend` | v2vModels / v2v | Not admitted | G07 / DEFER_UNTIL_AFTER_PROJECTION | No; retain explicit limitation |
| `seedance-2.5-spicy-video-edit` | v2vModels / v2v | Not admitted | G01 / BIND_BEFORE_PROJECTION | YES |
| `seedance-2.5-spicy-video-edit-480p` | v2vModels / v2v | Not admitted | G02 / NEEDS_PROVIDER_CLARIFICATION | No; retain explicit limitation |
| `seedance-2.5-spicy-video-edit-1080p` | v2vModels / v2v | Not admitted | G02 / NEEDS_PROVIDER_CLARIFICATION | No; retain explicit limitation |
| `seedance-2.5-spicy-video-edit-4k` | v2vModels / v2v | Not admitted | G02 / NEEDS_PROVIDER_CLARIFICATION | No; retain explicit limitation |
| `seedance-2.5-spicy-video-extend` | v2vModels / v2v | Not admitted | G01 / BIND_BEFORE_PROJECTION | YES |
| `seedance-2.5-spicy-video-extend-480p` | v2vModels / v2v | Not admitted | G02 / NEEDS_PROVIDER_CLARIFICATION | No; retain explicit limitation |
| `seedance-2.5-spicy-video-extend-1080p` | v2vModels / v2v | Not admitted | G02 / NEEDS_PROVIDER_CLARIFICATION | No; retain explicit limitation |
| `seedance-2.5-spicy-video-extend-4k` | v2vModels / v2v | Not admitted | G02 / NEEDS_PROVIDER_CLARIFICATION | No; retain explicit limitation |
| `seedance-2.5-spicy-motion-control` | motionControlModels / motion_control | Not admitted | G16 / DEFER_UNTIL_AFTER_PROJECTION | No; retain explicit limitation |

All 42 are meaningful selectable alternatives for WHIHM's strategic Spicy scope,
including Mini Spicy and Wan/MiniMax families. None is automatically downgraded
for sharing an intent. Exactly two are minimum pre-projection requirements; the
others can be listed as partial/unavailable and prioritized as follow-on work.
The 18 fixed-resolution **Spicy** IDs (6 V2V + 3 T2V + 9 I2V) all retain a
selectable OpenAPI resolution enum/default 720p despite suffixed names, while their
model detail fields omit native resolution. Do not present them as fixed-size
certified executors. Twelve generic-eligible T2V/I2V suffixes require this caveat
even though current runtime eligibility has not been restricted by this review.

A separate `mode=spicy` value exists in GROK_STYLE_INPUT (used by Grok T2V;
its I2V declaration currently narrows to normal/fun). It is an **option**, not an
additional exact Spicy model ID. Keep it inside its existing model's contract;
do not infer a universal Spicy field or a new model/binding. It is not an added
projection blocker (G37). Configured model ID `seedance-2-mini-spicy-omni-reference`
is in the **T2V** catalog despite its reference-oriented name; do not lose its
media requirements by assuming all T2V choices are reference-free.

### The two Spicy executors to bind before projection (G01)

**Decision: BIND_BEFORE_PROJECTION, both exact unsuffixed endpoints.** This is a
WHIHM strategic coverage requirement, not an architectural need to collect every
provider. Current first-party schemas are sufficient to implement/test the request
contracts without generation. No unresolved output-role or alternate-input problem
like MMAudio/depth is introduced: both are source-video transforms on the existing
processV2V lifecycle. Actual quality/profile behavior still needs later execution.

| Field / behavior | seedance-2.5-spicy-video-edit | seedance-2.5-spicy-video-extend |
| --- | --- | --- |
| Exact wire endpoint | /api/v1/seedance-2.5-spicy-video-edit | /api/v1/seedance-2.5-spicy-video-extend |
| Required | video_url + nonblank prompt | video_url + nonblank prompt |
| Image role | optional ordered images_list, at most 30; identity/style reference intent | optional scalar last_image target frame, distinct from source video's final frame |
| Audio references | optional ordered audios_list, at most 10 | No audio reference field; reject instead of borrowing edit controls |
| Duration | integer 4–30/default 5, requested edited output length; provider says sources over30s are trimmed | integer 4–30/default 5 for continuation segment; not an exact assembled timeline |
| Native resolution | 480p/720p/1080p/4k; default 720p | Same selectable enum/default |
| Aspect | adaptive,16:9,9:16,1:1,4:3,3:4,21:9,9:21; default 16:9 | Same enum/default |
| Seed | optional integer −1–4294967295, no declared default; omit to delegate provider randomness | Same |
| high_bitrate | boolean/default false | boolean/default false |
| generate_audio | boolean/default true; OpenAPI says false preserves source audio | boolean/default true, synchronized audio for the new segment |
| Prompt policy | Provider description says automatically prefixed “Edit the input video.” | Provider description says automatically prefixed “Continue the video forward.” |

Do not add duplicate prompt prefixes in WHIHM, truncate arrays, clamp duration,
lose zero seed/false controls, substitute Standard or infer fixed resolution.
Optional provider null representations need not be admitted; an explicit non-null
application subset can use omission. Media URI fields carry the public2083-character
limit; source length/content constraints cannot be proven from a URL.

**CONFIRMED source gaps:** neither ID belongs to getV2VExecutionModel's exact set;
the source input declarations lack the current native resolution facet, and
seedanceModels marks only Standard edit/extend (not Spicy edit/extend) as native-
resolution unsuffixed workflows. A narrow addition to those two declarations,
family configuration and the existing contract admission is needed. Existing
aspect/duration/reference/audio/seed metadata can be reused. The shared processV2V
path, ordered project asset handling, authorization, uploader/poller and result
normalization already provide the required architecture.

First-party model detail describes Spicy as a relaxed-moderation sibling with
bolder/higher-contrast output. That is a **provider declaration**, not a measured
quality advantage, policy bypass guarantee, universal account entitlement or exact
identity/motion preservation promise. The reason to include the pair is user-
specified strategic value, not an inference from branding or model count. This
supersedes the earlier “user-driven alternative/low-priority profile” roadmap for
this exact pair; it does not automatically admit fixed suffixes or all other Spicy
families. No runtime binding is changed by this document.

## Gemini Omni decision (G05)

**DEFER_UNTIL_AFTER_PROJECTION.** `gemini-omni-video-edit` is meaningfully richer
than admitted `gemini-omni-flash-1-1-edit`: optional references/voice/character IDs,
trim, duration/aspect/seed rather than the Flash source-video/prompt/resolution
subset. It is a valuable focused next review, but current edit/reference/performance
alternatives already support initial Astra strategies. An extensible projection
can later add this executor without freezing the initial capability vocabulary.

Current OpenAPI requires only prompt; video_url and image_urls are optional/
nullable, whereas local source implies required references and the existing V2V
product expects a source video. Model detail limits references to7 (OpenAPI list
lacks that machine limit). trim_start/trim_end are nonnegative numbers/default 0/10;
future validation must establish an ordered source interval without inventing a
source duration. Duration enum4/6/8/10/default 8; resolution720p/1080p/4k/default 1080p;
aspect16:9/9:16/default 16:9; optional seed0–2147483647 (model detail default 0).
Opaque audio_ids and character_ids are string arrays with max3, **not** registered
project audio/image assets or uploadable media URLs. A future source-video-only
scope is plausible but must explicitly reconcile required roles and preserve the
shared UI/application behavior; do not accidentally enable reference-free T2V
through a V2V convenience path. It remains I/unavailable canonically today.

## MMAudio and depth (G12/G13)

**MMAudio: NEEDS_PROVIDER_CLARIFICATION.** Refreshed first-party metadata still
has output_data.properties.video with a video example but required=[audio] and an
audio-named output type. Generic output_schema does not resolve which artifact
is returned. Request fields are confirmed: video_url, required prompt, duration
integer 1–30/default 8, exact slash endpoint mmaudio-v2/video-to-video. No input audio,
copy_audio, mix or replacement control is defined. Audio-only vs muxed video,
original-audio retention/replacement and structured result remain unverified.
Do not bind it to audio/V2V or infer semantics from the neighboring text-to-audio
model. Existing Studio availability is not evidence of a coherent canonical result
contract. Provider clarification, not paid trial-and-error, is the next prerequisite.

**Depth Anything: DEFER_UNTIL_AFTER_PROJECTION.** Model detail explicitly states
XOR image_url/video_url and corresponding image-depth/video-depth outputs. OpenAPI
lists both nullable without a required input/XOR. Unlike MMAudio, intended input/
output alternatives are described; the limitation is adapting the generic mandatory-
video validator/result typing safely. A small scoped dual-input/dual-result contract
could plausibly retain i2v/image callers and distinguish the returned artifact, using
the existing shared service. There is no demonstrated need to block initial creative
projection on this analysis primitive. Do not build a new analysis subsystem or
promise calibrated distances, map encoding, image sequences, masks or depth quality.

## Audio: clone, V6 and remaining coverage (G17–G20)

All23 audio catalog IDs are accounted for: **22 reviewed contracts**, with Suno
multi-stage clone deliberately excluded. MiniMax clone remains the separate
reviewed single-request flow with required sample/prompt/custom_voice_id; neither
its API shape nor its voice management should be imposed on Suno.

**Suno voice clone: FUTURE_EXTENSION**, best represented by a guided user-confirmed
flow. OpenAPI describes stage1 sample submission and polling to
{stage:awaiting_phrase, phrase}; a fresh recording of that phrase goes to
/api/v1/suno-voice-clone/{request_id}/confirm; successful polling then yields
{voice_id, stage:completed}. Source describes a10-second sample; current schema
allows selecting vocal_start_s/end_s and language. A new phrase cannot be prerecorded
or invented by Astra. Provider liveness and a person's actual confirmation cannot
be replaced by a WHIHM approval record or a generic poll retry. Failure/retry/expiry,
ownership, retention and reusable voice identity need a dedicated lifecycle review.
Current generateAudio has no stage transition/confirmation adapter, and canonical
lookup refuses the endpoint. Initial projection must accurately describe it as
unavailable/multi-step, not CLONE_VOICE “fully supported” because MiniMax is bound.

**V6 controls: DEFER_UNTIL_AFTER_PROJECTION**, not an invented newer model ID.
Current create metadata advertises V6/V6_MINI/V6_WILD (defaultV6), custom_mode,
duration10–360/default 20, audio_urls up to 10 and video_urls up to 1, alongside legacy
versions/persona controls. Source reviewed subset retains its explicit V5 default
and currently accepted versions/fields. New versions must not silently inherit the
old voice_persona applicability rule (current validator restricts that to V5/V5_5),
Suno reference roles or upload assumptions. The reviewed V5/basic generation,
remix/extend/mashup/add-vocals/add-instrumental/sound/TTS/dialogue/WAV contracts remain
useful. Their narrower source/style/prompt requirements and two-track mashup limit
are deliberate scope, not evidence that reference-free generation or larger provider
limits have been admitted. Future V6 adoption deserves bounded tests, not a pre-
projection rewrite. Source timing/language/voice-account/content restrictions still
need real execution for production claims (G20), not for read-only projection.

**Voice management: FUTURE_EXTENSION.** OpenAPI exposes GET /api/v1/suno-voices,
DELETE /api/v1/suno-voices/{voice_db_id}, and POST check/refresh subpaths. They were
inspected as OpenAPI declarations only; no account records were fetched. There is
no corresponding canonical manager in the shared generateAudio flow. Listing,
mutating, ownership/renewal and lifecycle are separate from media generation.
Suno WAV conversion remains task_id + audio_id for an existing track, not general
file conversion. Reviewed nested dialogue and ordered audio arrays remain intact;
no extra audio-model contract gap requires blocking projection now.

## Image: Qwen and layer fidelity (G21–G23)

**Qwen LoRA: NEEDS_PROVIDER_CLARIFICATION; keep unavailable.** The conflict persists:
local qwen-image-edit-plus-lora has no prompt UI and declares rotate_right_left
(−90…90), move_forward(0…10), vertical_angle(−1…1), wide_angle_lens, width/height.
Current provider/OpenAPI instead declares images_list, prompt/default text,
aspect_ratio, output_format and nested loras ({path, scale0–4/default 1}). Model
detail limits images/LoRAs to3. None of the local angle/dimension keys is in that
request schema. Do not map angles to unknown weights, silently drop them, or expose
provider LoRA paths as local filesystem access. Existing IMAGE_VIEW_CONTRACT_CONFLICT
must remain until an official compatible endpoint/intent mapping is established.
Other reviewed view controls can be projected with their actual narrower semantics.

Layer calls for bytedance-seedream-5.0-pro-layer and seedream-5.0-flash-layerize
already use the specialized helper and preserve ordered URL lists plus actual safe
metadata. This is **safe request/result transport**, not proven editable layers.

| Layer property | Confirmed support vs remaining limit | Projection consequence |
| --- | --- | --- |
| Multiple outputs / order | Existing helper preserves provider array order | Expose a layer-image list, not the first image only |
| Masks / labels / IDs | Retained if actually returned; no required mask/name schema | Do not claim always-present masks or label correspondence |
| Transparency | Flash description mentions separated PNG layers; alpha not measured | File format is not proof of useful transparent segmentation |
| Stacking / reconstruction | No front-to-back or base-layer relationship guarantee | Do not derive a deterministic compositing plan from list order |
| File relationships | No validated PSD-like layout or layer-to-mask matching contract | Preserve evidence; avoid invented editable-document semantics |

Primary classification is NEEDS_REAL_EXECUTION_TEST for richer artifact behavior;
provider clarification may also be needed for guarantees. It does **not** block
projection of the existing bounded DECOMPOSE_IMAGE behavior. Broad facial expression,
body pose, exact identity/style preservation and pixel-equivalent enhancement remain
outside proven controls; project face-expression-change as its actual view/camera
control contract, not universal human pose editing. All15 reviewed advanced-image
IDs and existing auxiliary mask/garment/watermark/product roles remain unchanged.

## Performance, reference and utility decisions (G24–G31/G38)

The two Kling O1 reference routes stay **DEFER_UNTIL_AFTER_PROJECTION**, unavailable
under their current canonical conflict guard. Full O1 metadata allows optional
images plus video, and its workflow has combined weighted limits; Standard lacks a
video input and its nullable image list still conflicts with local required-images
metadata. Do not describe both as proven video-only routes. Reviewed Seedance,
Kling3 Omni, Vidu, Gemini, MiniMax and Wan alternatives already cover references;
resolving these two routes is not an initial projection dependency.

Alternate Kling v2.6 std/pro and v3 std stay deferred, behind a future specialized
comparison rather than generic V2V. Existing Recast aliases preserve Kling target
image/driving video, Runway Act Two reference_video_url, and Wan animate/replace;
Seedance Motion Control preserves its motion_transfer/objects_swap distinction.
Those contracts, all 15 Lip Sync contracts and their source types remain specialized.
Do not collapse image+driving-video identity transfer, two-video Act Two performance
transfer, object-swap intent and generic editing into one interchangeable service.

**OmniHuman mask arrays: NEEDS_PROVIDER_CLARIFICATION.** OpenAPI permits a mask_url
array but does not define source pairing, order/count, masks' temporal meaning or
constraints. The reviewed image+audio/seed/native-resolution/fast-mode subset remains
usable. **LTX audio-only: DEFER_UNTIL_AFTER_PROJECTION.** Both inspected LTX schemas
require only audio_url while the current product deliberately requires a portrait.
Do not relax the safe image+audio subset without a bounded new scope review.
Other unreviewed reference/keyframe profile variants remain partial/unreviewed,
not copies of the31 reviewed I2V contracts. Native start/end vs ordered-reference
roles, optional vs required end frames and duplicates remain contract-specific.
UI selection helpers can still deduplicate/truncate picker state; the reviewed
service/canonical boundary validates its supplied arrays without doing that.

The later **Character / Performance Benchmark** should compare real outputs for
identity, expression, body/wardrobe flexibility, motion/camera/timing fidelity,
background treatment, valid input limits, failure rate and cost/latency. Include
existing Recast 3, Motion 2, relevant Lip Sync/performance choices, potential Dance
Effects and alternate Kling variants. Benchmark Genjutsu-style external executors
only in their separate future adoption scope, not as an excuse to replace OGA.
No benchmark or paid generation runs occurred here. Quality superiority is not a
reason to block metadata projection without a concrete production requirement.

**Clipping coordinate guarantees: NEEDS_PROVIDER_CLARIFICATION.** Existing canonical
results preserve actual clips/coordinate/timing arrays; missing selection data is
not fabricated. Public results do not establish units, crop/timeline schema,
precision, exact clip count or frame-aligned guarantees. Coordinate-only metadata
can be projected with these caveats. Never reuse the Studio's invented empty-result
coordinate fallback as canonical evidence. This is AI highlight selection, not
FFmpeg trim.

**Motion editability: NEEDS_REAL_EXECUTION_TEST.** Creation/edit schemas are explicit;
edit references a completed request with saved animation code and optional aspect/
duration overrides. A supplied opaque request ID is not proof of completion,
ownership or code availability. Keep native output.video and metadata; no local
code execution/timeline promise. Testing a few valid/invalid IDs later can establish
behavior for those cases, not universal eligibility for old history entries.
All other admitted utility result fields retain original safe metadata; subtitle,
transcript, depth and generated-audio outputs are not invented. Runtime success,
encoding, exact timing and fidelity for reviewed remote models remain a distinct
NEEDS_REAL_EXECUTION_TEST item (G38), not silently “verified” by mocked QA.

## Local inference and packaging (G32–G34)

| Layer | Capability exists? | Canonical status / constraint |
| --- | --- | --- |
| stable-diffusion.cpp | Six local image model configurations, existing engine/model/auxiliary managers | Structural local-ai route delegates to localAI.generate. Prompt/aspect basic checks exist; binaries/weights/auxiliaries/GPU availability require current evidence. Text generation does not imply local I2I |
| Wan2GP image | Flux/Qwen configurations; local folder or remote MCP backend | Structural route exists; configured engine is not proven executable/offline. Do not describe an MCP URL as guaranteed local/private/offline |
| Wan2GP T2V | Four configured video generators: Wan2.1, Wan2.2, Hunyuan, LTX | Existing generation path; real runtime readiness and artifacts unverified |
| Wan2GP I2V | wan2gp:wan22-i2v needsImage=true; direct desktop UI has a start-frame staging helper | Canonical plan does not stage a project start frame. Raw machine paths are forbidden and uploads are rejected for local execution; do not advertise fully usable canonical project-I2V |
| Project input staging | Remote reviewed roles have safe asset resolver/upload path | Local branch rejects any prepared upload with LOCAL_ASSET_BINDING_UNSUPPORTED. No automatic local asset staging or arbitrary fs bypass |
| Local result staging | sd.cpp returns image data URL; Wan2GP returns file:// and path | Renderer host transport redacts local paths. Wan output needs trusted project-relative artifact registration/reference support before canonical consumers can use it as a reusable project artifact |

**G32: DEFER_UNTIL_AFTER_PROJECTION**, but visibly constrain local I2V/project-
media/output availability in the projection; never equate a successful lookup with
a usable staged operation. Prefer a later narrow trusted project-handle staging
adapter; never weaken contextIsolation/nodeIntegration/webSecurity or expose
arbitrary fs. **G33: NEEDS_REAL_EXECUTION_TEST** for binaries, weights, auxiliaries,
backend configuration, GPU and actual outputs. No readiness collection should
start inference/downloads/probes to guess these. Existing readiness snapshots
honestly use UNVERIFIED. Local settings also perform rounding/random defaults;
for example sd.cpp's truthy seed expression treats zero as random. Projection
cannot promise exact seed reproducibility or universal parameter parity from a
catalog field. This review makes no local runtime change.

**G34 packaging: DEFER_UNTIL_AFTER_PROJECTION, HIGH-SEVERITY SHIPPING BLOCKER.**
CONFIRMED package.json build.files includes only dist/**/* and electron/**/*;
electron/lib/whihm-host.js dynamically imports ../../lib/whihm-execution/host.mjs.
That host loads workflow-core and source-relative Studio/src/lib modules through
runtime.mjs and the existing Electron ESM loader. The root lib source tree is not
included by those explicit globs; renderer Vite bundles do not satisfy the main
process's filesystem import. afterPack.js only prunes foreign SWC binaries/signs
macOS and adds no missing WHIHM source tree. Automatic production dependency copying
does not repair that source-relative root lib path.

INFERRED consequence: normal packaged host operations would fail without an
additional packaging inclusion/bundling step. No installer/asar artifact was
inspected or launched, so this is a configuration/import-closure finding, not a
new packaged runtime test. Source Electron-as-Node/mocked host tests do not certify
Windows/USB portability. The separate local-ai extraResources entry handles staged
engine files, not this missing host source closure; it does not prove all engines/
models/runtime installers are production-complete. Shipping requires packaging
closure verification and a packaged fixed-host/readiness/plan smoke test. This can
follow metadata projection; source/development availability must be labeled as such.

## Canonical workflow and agent execution (G35/G36)

**RUN_REMOTE_WORKFLOW: FUTURE_EXTENSION.** Existing shared executeWorkflow submits
inputs to /workflow/{workflowId}/api-execute, then polls a remote run ID for
api-outputs. Workflow Studio uses it, and Vibe Workflow has node-run/service paths,
inputs/schemas/save/run/status lifecycle. Desktop wraps the existing upstream UI
with routing/transport adaptation. Those facts do not make a WHIHM canonical graph
a remotely executable MuAPI workflow. Current11 canonical modes have no remote-
workflow mode, workflow-ID authorization/cost/result contract, graph-to-provider
mapping or scheduling. Initial projection can describe individual node capabilities
and an unavailable aggregate workflow capability. Do not call arbitrary composition
an infinite executable capability set or reuse WHIHM node IDs as MuAPI IDs.

**RUN_AGENT: FUTURE_EXTENSION.** Agent Studio already discovers templates/user/
published agents, creates conversations, sends messages and polls request IDs;
the inline desktop integration and basic creation UI exist. WHIHM has no canonical
agent executor with agent identity, attachment/tool permissions, conversation state,
quote/budget boundaries and normalized results. Provider/UI chat is not authorization
for Astra to run paid agents. Reuse the existing services if implemented later;
adding canonical invocation/orchestration is a real extension to WHIHM, not a
prerequisite to describing reviewed generation capabilities.

## Foundation-hardening exit gate

**READY_AFTER_1_FOCUSED_TASKS** for source/development Astra capability projection.
There is **one** minimum remaining implementation task, containing two exact
executors. This count does not hide a required full-catalog review or provider job.

| Task | Exact scope | Why before projection | Size / dependencies | Explicit exclusions |
| --- | --- | --- | --- | --- |
| Bind unsuffixed Seedance 2.5 Spicy V2V edit + extend | Add exact two IDs to reviewed V2V admission; correct only their native-resolution declarations/family facets; validate their distinct ordered references/audio/last-image roles, options and defaults; keep shared processV2V/asset/auth/lifecycle; mocked plan/execute/host/regression QA and targeted docs | User-defined strategic Spicy coverage must be machine-controllable and not permanently hidden behind a generic/deferred row in the first practical projection | M; existing V2V helper/metadata/project resolver. Public request evidence now sufficient; no schema redesign/new provider/paid validation dependency | No suffixes, Intl, other Spicy families, Gemini, Depth, MMAudio, UI redesign, packaging, new modes, benchmark or projection implementation |

After that focused task passes, declare the **source foundation ready for projection
with explicit residual gaps**. Do not claim every model/profile is hardened or
runtime production-certified. Read-only projection could technically be prototyped
now; the strategic exit gate intentionally places this pair first. This is the
minimum practical roadmap, not a technical claim that a metadata reader cannot
operate until another model is added.

Packaged shipping remains NOT_READY until G34 is addressed and tested; production
quality/runtime confidence remains conditional on G20/G22/G31/G33/G38. These are
separate release/assurance gates, not hidden extra prerequisites to source metadata
projection. If the intended first projection deliverable must itself ship in a
packaged app, G34 becomes a prerequisite to **that deliverable**, not a reason to
silently mark source metadata work impossible. Current task scope is unchanged.

**Exact recommended next task:** “Bind only seedance-2.5-spicy-video-edit and
seedance-2.5-spicy-video-extend through existing reviewed V2V contracts and shared
processV2V. Preserve selectable resolution/aspect, native image/audio/last-image
roles, duration/seed/audio/bitrate controls, project integrity and authorization.
Reject invalid/unknown inputs before transport; plan/dry-run without auth/upload;
use mocked QA and existing regression subsets. Leave all suffix/profile families
and projection implementation out of scope.”

## Hardening versus extension

### Foundation-hardening work

Existing OGA capabilities become explicit, safe, inspectable and canonically
callable by reusing their services. Remaining mandatory work is G01. Later bounded
source parity/contract reviews, optional local staging and packaged source closure
are also hardening/operational completion rather than reasons to rebuild OGA.
Provider clarification and runtime tests are evidence work; no new client or frozen
registry is justified simply because they are incomplete. Existing unresolved
models remain labeled/unavailable/partial until a reviewed change admits them.

### Real extension work

G40 explicitly covers the following planned portfolio. They do not block initial
projection and are not implemented by this review:

| Planned work | Boundary relative to current foundation |
| --- | --- |
| Media inspection | New trusted probe/evidence primitive; reuse audited tools later |
| Deterministic finishing | New composable assembly/mix/overlay/export execution, not generic AI edit |
| Workflow execution | G35; aggregate invocation/scheduling/authorization beyond current node bridge |
| Character/performance benchmark | Measured comparison/evaluation, not speculative executor substitution |
| Agent execution | G36; controlled agent invocation beyond Studio chats |
| Creative QC/evaluation | New review/evidence capabilities; no generic model-success equivalence |
| Project-aware creative memory | New project-context retrieval/curation, not a new workflow representation |
| Reusable production recipes | Optional templates over dynamic canonical graphs, not fixed pipelines |
| Asset intelligence/tagging | New analysis/selection evidence, not a mandatory reference requirement |
| Continuity system | New cross-shot constraints/evaluation |
| Brand constraint system | New project policy/context over existing executors |
| Storyboard/shot planning | New planning features; existing manual approval state is not an automatic director |
| Provenance/lineage improvements | Extend existing hashes/history/scope evidence, do not replace them |
| Selective regeneration | Build orchestration on existing selective invalidation, not an implied current scheduler |
| Cost-aware draft→final | New execution policy over existing quotes/budgets, not automatic affordability inference |
| Delivery/export systems | New output/delivery integration; preserve existing upstream downloads |

Suno guided cloning/voice management (G17/G19) and production invocation policy
(G39) are also extension-phase work. Existing readiness enforces approval semantics
in its report; the single-node bridge's allowExecution is a separate authorization
boundary, not a fresh approval/budget/quote check. A future director must deliberately
consume both rather than treating READY, a cached quote or route availability as
permission to spend. No second approval system is needed.

## Projection safety principles and implementation constraints

The reviewed foundation **can support** an extensible, non-executing projection.
There is no demonstrated need for a new provider/model registry or workflow schema.
The strategic two-model task is the chosen exit gate, not an introspection-architecture
redesign. The projection task must implement these constraints itself:

- Derive current descriptors from existing catalogs, pure contract projections,
  exact admission functions and the shared binding resolver; cache with source/version
  identity if useful. Do not freeze today's model list in a second authoritative registry.
- Key executors by explicit mode + logical ID + transport/provider identity; retain
  wire endpoint aliases and separate provider-engine controls (topaz_model/_modelId).
- Support multiple executors per intent and multiple intents per executor. Spicy,
  reference roles, optional media and profile distinctions are strategic choice data,
  not reasons to flatten everything into one “video” input or fixed production recipe.
- Keep reviewed, generic/partial, unavailable, deferred and locally constrained states
  separate. Current static lookup success does not prove contract assurance, assets,
  installed engines, staged start frames, account access, budget or runtime success.
- Preserve specialized precedence and exact intent options; do not auto-fallback to
  another model/mode or bypass an admission check because provider metadata is newer.
- Expose required/optional roles, ordered counts, keyframe semantics, enums/ranges,
  effective defaults, result limitations and evidence provenance. Unknown facts remain
  unknown; metadata marketing is not an identity/camera/quality/fidelity guarantee.
- Distinguish remote MuAPI, local sd.cpp and configured local/remote Wan2GP. Preserve
  UNVERIFIED runtime evidence without starting downloads, inference, probes or API jobs.
- Reuse existing project handles/assets, assessProjectWorkflowReadiness and node plan.
  A whole-workflow readiness report and a detailed input plan answer different questions.
- Remain read-only: no automatic quote refresh, upload, generation, workflow/agent job,
  approval mutation or spend because capability information was requested.
- Do not silently broaden eligibility. New source contracts can appear after reviewed
  bindings are added; external provider catalog appearance alone cannot grant execution.

## QA / completion record

Only this new Markdown document is written. No source, runtime, dependency, schema,
UI, packaging or binding is modified. All catalog Spicy IDs are verified against
current checked-out arrays; all 42 unresolved V2V rows and 4 specialized rows are
accounted for. Each G01–G40 group and each expanded child has one primary decision.
Model counts and resolver eligibility above were recomputed by pure source reads;
those inspection scripts are not code tests and perform no transport/execution.
Public evidence is limited to unauthenticated GETs documented above. Code tests,
Vite build, model downloads, private data access and paid provider jobs were not run.
Final QA verified source-ID/count/classification coverage, intended-document-only
Git changes, clean/unchanged submodules and unchanged NEXT_HISTORY_TASK.md.
The staged document is checked with git diff --check before the documentation commit.


## Expanded remote video wave disposition — 2026-10-26

- G01 completed: exact Spicy edit/extend use shared processV2V, reviewed native
  resolution and distinct edit arrays/extend last-frame semantics. No suffix admission.
- G05 completed for a conservative Gemini source-video-required subset, including
  optional references, ordered nonnegative trim, native controls and opaque IDs.
- G06 partially completed: Standard Seedance1.5, LTX2.3 and Pixverse6 extensions
  admitted; Fast remains excluded. Evidence shows Fast720p/1080p versus Standard
  480p/720p (source Fast metadata still differs); this non-speed distinction is
  recorded without automatically binding/prioritizing Fast.
- G14/G27 partly advanced: Spicy first-last/omni, Wan2.2 Spicy image, Wan3 Spicy
  references and MiniMax H3 Spicy image now have exact contracts. First-last needs
  two frames; MiniMax prompt is optional and start/end roles remain separate.
- New evidence item G41: **NEEDS_PROVIDER_CLARIFICATION** for ordinary
  seedance-2.5-spicy-text-to-video and seedance-2.5-spicy-image-to-video. Source/detail
  exposes generate_audio, while current OpenAPI omits it and introduces draft /
  draft_request_id lifecycle forms; source uses4K/default1080p versus OpenAPI
  4k/default720p. No paid test or ignored flag is used as a substitute for a coherent
  contract. Canonical availability is explicitly deferred; existing upstream generic
  UI/services remain. Core first-last/omni do not accept draft/finalization either.
- G02/G15 unchanged in evidence: all18 Spicy fixed suffixes still need provider
  clarification. Their12 generic T2V/I2V canonical paths are now closed explicitly;
  source catalogs are preserved. The original42-ID Spicy inventory remains exact,
  but newly reviewed, deferred and generic status columns must be read with this addendum.
- Remaining V2V inventory is D28/F16/I8/R19/S4 (35 bound,36 unresolved,4 specialized).
  No other historical priority is implicitly authorized. Existing Audio/Image/
  Recast/Motion/Lip/Clipping/Motion Graphics remain intact.

**Before Depth Anything:** finish or explicitly accept deferral of the two G41
ordinary-render gaps for the intended initial scope, then proceed with the planned
read-only capability projection. Depth's separate XOR image/video input + correctly
typed image/video-result contract remains a future bounded task; it does not require
binding every residual V2V profile. MMAudio remains parked and strategically important,
with mandatory revisit once first-party output/audio-treatment evidence is coherent.
No new general architecture blocker or reason to replace OGA was found. Release
packaging/local staging/runtime-fidelity gates remain as documented, outside this wave.

**Prioritization rule:** Fast/Turbo/Draft/Mini are not preferred merely for latency.
Require meaningful cost, quality, controls, limits, reliability or input/output value;
prefer a slower comparable executor when lower cost or lack of speed value warrants
it. Do not remove upstream choices, automatically bind speed variants or implement
ranking as part of hardening.

## G13 implemented — dedicated Depth Anything contract (2026-10-26)

Starting HEAD f69a2c98b2b42270c7bba55377305ace4444c8a4. Exact canonical depth
route now supports image_url XOR video_url, typed project assets, transport-free
plans and depth-image/depth-video semantic results. Existing shared processV2V,
upload/auth/poll/results remain authoritative; generic V2V stays video-only.
Public model detail explicitly describes dual input/output and native output.video
for either kind; OpenAPI lacks XOR, so scoped validation enforces it. No paid test.
Unknown output metadata is preserved without synthetic artifacts. No metric depth,
calibration, masks, segmentation, sequences, 3D or fidelity guarantee is claimed.

G13 contract/binding gap is closed; real execution/fidelity remains UNVERIFIED
and belongs to a future authorized execution check, not a claim of VERIFIED runtime.
V2V classification is now D28/F16/I7/R19/S5; generic35 unchanged, depth specialized.
Next requested milestone is **Suno Guided Voice Clone**, preserving provider
confirmation/liveness and explicit multi-stage lifecycle. No Suno behavior changes
in this task. Ordinary Spicy provider conflicts, MMAudio's mandatory future revisit,
packaging and all other historical exclusions remain explicit, not silently resolved.
