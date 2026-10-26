# Authoritative foundation → Astra projection handoff

> **Projection v1 implemented:** [Astra capability projection](WHIHM_ASTRA_CAPABILITY_PROJECTION.md)
> now exposes read-only projectCapabilities() and the fixed host
> getCapabilityProjection operation. It derives current contracts/bindings and
> preserves generic, specialized, deferred, provider-blocked and runtime-unverified
> states. No execution eligibility or provider lifecycle is broadened. The older
> "implement projection next" milestone below is retained as historical context.

**Foundation status: READY_FOR_ASTRA_PROJECTION.**
Reconciled 2026-10-26 against source HEAD
`f70d33c0c3ac4c7441d869b3cc0872db63461343`.

The requested initial foundation-hardening program is complete enough for **source /
development projection**. No further binding task blocks that phase. This does not
certify all catalog models, provider runtime/fidelity or packaged distribution.
Open Generative AI remains the application foundation; projection must describe
existing contracts and routes, not replace them or widen execution eligibility.

This is the current decision/count/status authority. It supersedes obsolete
"bind Spicy", "Depth deferred", "Suno planned next" and READY_AFTER_* gates in
historical sections of the [census](WHIHM_CAPABILITY_CENSUS.md),
[gap review](WHIHM_FOUNDATION_HARDENING_GAP_REVIEW.md) and
[bridge history/contracts](WHIHM_EXECUTION_BRIDGE.md). Their detailed evidence
remains useful; current source/tests always outrank this snapshot. The
[V2V inventory](V2V_CONTRACT_REVIEW.md) currently has the correct 75-row classes.

## Recount and execution boundary

Counts are from the nine **primary** arrays in models.js, excluding derived
imageLipSyncModels/videoLipSyncModels and UI family aliases. Endpoints use
endpoint ?? id. Mode/model pairs are distinct from IDs, wire endpoints and semantic
capabilities. The three fixed creative-service endpoints are outside the catalogs.
Local configurations are separate. No fresh provider catalog/web census was done.

| Measure | Current value |
| --- | --- |
| Catalog rows | **587**: T2I84, I2I88, T2V111, I2V184, V2V75, audio23, Lip Sync15, Recast3, Motion Control4 |
| Distinct catalog logical IDs / effective endpoint strings | **582 / 571** |
| Remote canonical modes | **13**, enumerated below |
| Structurally eligible remote mode/ID pairs / IDs / effective endpoints | **532 / 529 / 520**, including three fixed creative services |
| Dedicated registry/service-reviewed pairs / IDs | **135 / 133** |
| Additional reviewed compatibility route | **1**: runway-act-two-i2v → existing Recast contract through generateI2V; alternate path, not a new creative capability |
| Total targeted-contract pairs / IDs including compatibility | **136 / 134** |
| Remaining structurally eligible generic pairs / IDs | **396 / 395**; weaker assurance, not deeply reviewed per-executor contracts |
| Catalog IDs without their own exact canonical logical binding | **56**; includes two provider IDs represented by Recast aliases, not56 missing capabilities |
| V2V | **35** generic-route reviewed/bound; D28/F16/I7/R19/S5 =75, **35 unresolved D/I**, five specialized entries |
| Reviewed I2V | **36** in videoInputContracts; **37** if the Act Two compatibility path is included explicitly |
| Reviewed ordinary audio | **22**; plus **1 guided Suno** lifecycle, covering the 23 audio catalog IDs across distinct routes |
| Advanced image | **15 IDs /17 mode pairs** (two T2I, fifteen I2I) |
| Specialized remote routes | **7 modes /25 pairs**; different measure from the five V2V S rows |
| Local configurations | **13**: six sd.cpp and seven Wan2GP; not installed/runtime readiness certificates |
| Spicy IDs | **42** across catalogs: T2V9/I2V23/V2V9/Motion1; **20 eligible =7 reviewed +13 generic**, **22 excluded** |

The 135 dedicated pairs are exactly those covered by getAdvancedImageModel,
getVideoInputModel, getAudioExecutionModel, getV2VExecutionModel, Recast, the two
admitted Motion Control IDs, creative-service contracts, Depth and guided Suno.
Act Two's separate exact I2V branch is visible in both bridge.checkInputs and
shared generateI2V and is covered by recastExecution tests; counting it avoids
mislabeling a reviewed compatibility path as generic. Prefer the explicit Recast
alias for performance transfer; this compatibility count does not certify every
generic I2V project-asset form. Do not inflate capability
counts for aliases, profiles, repeated rows or alternate transport paths.

| Mode | Eligible pairs | Dedicated reviewed pairs | Existing shared execution boundary |
| --- | ---: | ---: | --- |
| t2i | 84 | 2 | generateImage |
| i2i | 87 | 15 | generateI2I; layer wrapper retains specialized results |
| t2v | 107 | 0 | generateVideo; generic source/metadata validation, not 107 deeply reviewed contracts |
| i2v | 172 | 36 (+1 reviewed Act Two compatibility) | generateI2V |
| v2v | 35 | 35 | processV2V |
| audio | 22 | 22 | generateAudio |
| lipsync | 15 | 15 | processLipSync |
| recast | 3 | 3 | processRecast |
| motion_control | 2 | 2 | processMotionControl |
| clipping | 1 | 1 | runClipping |
| motion_graphics | 2 | 2 | runMotionGraphics / runMotionGraphicsEdit |
| depth | 1 | 1 | processV2V under scoped XOR/result contract |
| voice_clone_guided | 1 | 1 | runSunoVoiceClone using existing submit/poll/upload lifecycle |

The seven specialized modes are lipsync, recast, motion_control, clipping,
motion_graphics, depth and voice_clone_guided. Keep their media/action/result
semantics; do not migrate them to generic V2V. The five V2V S entries map as follows:
Kling v3 Pro motion-control and Wan Animate use the existing Recast aliases;
InfiniteTalk/Volcengine video-to-video use Lip Sync; Depth uses depth. Exact underlying
Kling/Wan provider IDs are not themselves generic canonical V2V admission IDs.

No built-in canonical Workflow/Agent execution mode exists. Injected utility
execution is a host-specific seam, not an unrestricted catalog or planner.

## Recent implementations confirmed in source

| Exact executor(s) | Current route/status and retained scope |
| --- | --- |
| seedance-2.5-spicy-video-edit | v2v / REVIEWED; source video + prompt, ordered images0–30/audio0–10; explicit bounded controls, no wildcard Spicy admission |
| seedance-2.5-spicy-video-extend | v2v / REVIEWED; source video + prompt, optional scalar last_image, continuation duration rather than exact assembled timeline |
| gemini-omni-video-edit | v2v / REVIEWED; conservative required video + prompt, optional image_urls, ordered trim bounds, duration/resolution/aspect/seed; audio_ids/character_ids remain opaque provider identifiers, never project assets. Reference-free generation is not admitted |
| ltx-2.3-video-extend | v2v / REVIEWED; video required, prompt optional, duration1–20/default5 |
| pixverse-v6-extend | v2v / REVIEWED; video + prompt; exact duration/resolution/style/audio-switch/negative-prompt contract |
| seedance-v1.5-pro-video-extend | v2v / REVIEWED; video + prompt; duration4–12, resolution480p/720p, audio/camera intent flags; no exact camera guarantee |
| seedance-2.5-spicy-first-last-frame | i2v / REVIEWED; distinct start/end frames and bounded controls, not an unordered reference list |
| seedance-2.5-spicy-omni-reference | i2v / REVIEWED; exact ordered image/video/audio role/count contract |
| wan2.2-spicy-image-to-video | i2v / REVIEWED; exact source-image animation contract |
| wan3.0-spicy-reference-to-video | i2v / REVIEWED; ordered reference-role contract |
| minimax-h3-image-to-video-spicy | i2v / REVIEWED; exact source-image contract |
| depth-anything | depth / REVIEWED + SPECIALIZED; image_url XOR video_url. Typed depth-image/depth-video artifact; no generic V2V admission, metric units/calibration/masks/sequences/3D claims |
| suno-voice-clone | voice_clone_guided / REVIEWED + SPECIALIZED; START → provider phrase → awaiting_user → separate human recording/CONFIRM → same-request polling → completed with actual opaque voice_id |

For exact accepted fields/defaults/enums/project roles, use the current contract
builders and bridge.plan, not a copied handoff registry. Those contracts reject
unknown options where explicitly reviewed. Generic branches do not promise the
same comprehensive per-model allowlist enforcement. All above remain provider
runtime/fidelity **UNVERIFIED**; metadata and mocked tests do not establish quality.

## Explicit residual states, not projection blockers

| Scope | Handoff disposition / reason |
| --- | --- |
| mmaudio-v2-video-to-video → mmaudio-v2/video-to-video (G12) | **PROVIDER_BLOCKED / NEEDS_PROVIDER_CLARIFICATION / MUST_REVISIT**. Audio-only vs video-with-audio and original-audio/result semantics remain contradictory. Intentionally unresolved, **not abandoned**; high priority once first-party semantics are coherent. Never advertise executable or infer behavior from the text-to-audio sibling |
| seedance-2.5-spicy-text-to-video; seedance-2.5-spicy-image-to-video (G14) | **PROVIDER_BLOCKED / DEFERRED**. generate_audio omission, draft/finalization lifecycle, resolution casing/default discrepancies. Both fail canonical lookup; no binding in this reconciliation |
| Fixed-resolution Seedance2.5 Standard/Intl/Spicy V2V suffixes (G02) | **18 blocked IDs**: edit/extend ×three profiles ×480p/1080p/4k. Naming conflicts with selectable-resolution/default evidence |
| Spicy2.5 T2V/I2V suffixes (G15) | **12 blocked IDs**: text/image/first-last/omni ×480p/1080p/4k. Together with V2V, 30 explicitly excluded suffix IDs, including18 Spicy IDs. No name-derived fixed-resolution certification. Other generic catalog profiles do not inherit reviewed guarantees |
| qwen-image-edit-plus-lora (G21) | **PROVIDER_BLOCKED / DEFERRED**: local view-control vs provider LoRA contract conflict; canonical gate remains unavailable |
| kling-o1-reference-to-video; kling-o1-standard-reference-to-video (G24) | **PROVIDER_BLOCKED / DEFERRED**: role/reference requirement conflict. Reviewed alternative reference routes remain available; no implicit substitution |
| Remaining16 non-fixed, non-MMAudio V2V D entries (G03/04/06–11) | **DEFERRED**, unbound: Intl edit/extend2, Happy Horse6, alternate Kling motion3, Seedance1.5 Fast1, Wan2.2 Spicy extend1, Dance1, Pro upscaler1, remix1. D does not mean broken or low-value. Happy Horse/remix/Pro upscaler remain low priority without demonstrated extra value |
| seedance-2.5-intl-motion-control; seedance-2.5-spicy-motion-control (G16/G37) | **DEFERRED**; outside canonical two-ID specialized Motion Control gate, not implicitly covered by the base models |
| Other13 generic Spicy T2V/I2V IDs (G14) | **AVAILABLE_GENERIC**, not deep-reviewed. Spicy remains strategically valuable; current eligibility is not certification of every control/profile |
| Suno V6 / voice management (G18/G19) | **DEFERRED / FUTURE_EXTENSION**; no private listing/deletion or implicit V6 compatibility. Suno guided cloning itself is implemented, not deferred |
| Layer masks/transparency/stacking/relationships (G22) | **PARTIAL + RUNTIME_UNVERIFIED** richer semantics. Confirmed ordered layer-result transport remains available; no editable-mask/stack guarantee |
| Advanced image expression/pose umbrella (G23) | Project only actual model-specific controls; face-expression-change's reviewed operation is view-angle-change. No universal body pose, identity or pixel-preservation guarantee |
| OmniHuman masks; broader LTX audio-only Lip Sync (G25/G26) | **PARTIAL / DEFERRED supplemental scope**. Reviewed image+audio subset remains available; do not advertise mask association or relax portrait requirement |
| Other reference/keyframe/generic models (G27/G37) | Assurance follows exact mode/ID/roles, never family name; generic eligibility is not feature review |
| Clipping coordinate schema/precision (G30) | **PARTIAL / NEEDS_PROVIDER_CLARIFICATION** for units/schema/frame precision; existing highlight/coordinate-array transport is available, not deterministic trim |
| Motion-graphics prior-request editability (G31) | **RUNTIME_UNVERIFIED**; saved-code ownership/completion/availability is provider-validated, not promised by a request ID alone |
| Local generation and project staging (G32/G33) | **LOCAL_CONSTRAINED + RUNTIME_UNVERIFIED**.13 configured models do not prove engine/GPU/weights readiness. Canonical local uploads are rejected; Wan2GP I2V start-frame staging and reusable local output artifacts remain constrained. Configured remote MCP does not mean local/private/offline |
| Suno continuation durability | **FUTURE resilience/persistence enhancement**, not projection blocker. Same live runtime session only; lost continuation blocks. Uncertain confirmation is poll-only, never automatic retry/restart. Provider expiry/ownership/liveness quality remains unverified |
| Electron packaging closure (G34) | **HIGH-SEVERITY SHIPPING BLOCKER / SHIPPING_BLOCKER_ONLY** relative to source projection; details below |
| RUN_REMOTE_WORKFLOW / RUN_AGENT (G35/G36) | **FUTURE_EXTENSION**, no canonical aggregate execution. Existing OGA Studios/services are not Astra authorization |
| All hardened remote/provider/local fidelity (G20/G33/G38) | **RUNTIME_UNVERIFIED** absent independent execution evidence; contract-tested is not live fidelity verified |

The56 IDs without an exact logical binding reconcile as35 unresolved V2V +12
Spicy generation suffixes +2 ordinary Spicy generation +2 Kling O1 references
+1 Qwen LoRA +2 additional Motion Control IDs +2 underlying Recast provider IDs.
The22 excluded Spicy IDs are18 suffixes +2 ordinary generation +Wan Spicy extend
+Spicy Motion Control. These counts do not imply new creative-intent counts.

V2V unresolved counts are35, not42: 18 fixed suffixes +MMAudio1 +16 deferred.
Depth moved I→S, and the six high-value V2V admissions are already bound. G01/G05/
selected G06/G13/G17 are closed implementations; G14 has five reviewed I2V IDs,
13 generic IDs and two ordinary-generation blockers. G28/G29 keep specialized
precedence (now five V2V S rows). Existing approval/budget boundaries (G39) and
later product extensions (G40) are not new blocking foundation tasks.

**Fast policy:** Fast/Turbo/Draft/Mini variants are not strategically preferred
merely for latency. Require evidenced cost/quality/controls/limits/reliability or
unique media-resolution value. Do not remove upstream choices or automatically
promote them. Last inspected first-party evidence gives Seedance1.5 Fast720p/1080p
vs Standard480p/720p: a possible non-speed advantage, not proven quality/cost value.
Fast remains unbound; this reconciliation did not refresh provider metadata.
Already-reviewed Fast/Draft alternatives retain their existing contracts.

## Astra status vocabulary and safety handoff

These are **handoff meanings**, not a new runtime enum or implementation. Preserve
existing statuses/codes as evidence, scoped by **mode + exact executor + operation**.

| Concept | Meaning for projection |
| --- | --- |
| AVAILABLE / REVIEWED | Exact bounded contract and canonical binding exist; still validate supplied inputs and current execution readiness |
| AVAILABLE_GENERIC | Structural upstream execution exists with generic/partial metadata checks; do not upgrade assurance, invent roles/options or promise complete media compatibility |
| SPECIALIZED | Route/lifecycle overlay on availability, not a failure or automatic V2V fallback |
| PARTIAL | Only an explicit executor subset/control/result surface is supported; identify that subset |
| DEFERRED | Deliberately outside reviewed admission or a wider scope not yet implemented; generic eligibility, if present, must be reported separately |
| PROVIDER_BLOCKED | Identifiable first-party contract discrepancy prevents the affected scope from safe admission; unavailable even if Studio/catalog exposes it |
| RUNTIME_UNVERIFIED | Verification overlay: no corresponding live success/fidelity proof; never treat it as a spend approval or a reason to invent results |
| LOCAL_CONSTRAINED | Environment/media staging restriction overlay; inspect current local readiness, do not assume executable/offline |
| SHIPPING_BLOCKER_ONLY | Distribution boundary overlay, **not low severity**; source projection may proceed while packaged production use remains blocked |
| DISABLED / DEPRECATED | Only where explicit current evidence says so; absence/deferment is not deprecation. No new global disabled/deprecated registry is introduced |

In particular, audioInputContracts correctly still refuses Suno on the **one-shot
audio route**; that is not global unavailability. The guided route is reviewed.
Likewise getV2VExecutionModel(depth-anything) is null while the depth binding is
available. Do not flatten domain-scoped helper results into one model-wide status.
Always supply the canonical mode: findRemote(id) without a mode also returns null
for ambiguous multi-route IDs (flux-pulid, flux-redux and qwen-text-to-image-2512), not only unavailable models.

Astra **may trust** exact reviewed contract roles/cardinality/order/defaults and
operation/result declarations; current binding/readiness provenance; specialized
precedence; explicit limitations, blocked/deferred and unverified evidence. Project
asset support exists only for declared roles through the current resolver/integrity
system. Use plan/dry-run before execution; static binding evidence does not validate
supplied media or update a quote/budget/approval.

Astra **must not infer** quality, uptime, fidelity, undocumented controls, suffix
resolution, model equivalence, calibrated depth, richer layer/caption artifacts,
project-asset compatibility for undeclared roles, or success from catalog presence.
No implied scheduler, automatic fallback, retries or authorization to spend. Each
provider action still requires current host authorization. Suno's exact provider
phrase, distinct registered human-recorded confirmation asset and live continuation
checks are mandatory; WHIHM approval is not provider liveness verification. Never
invent/translate/synthesize the challenge response or treat voice_id as a media asset.

Initial projection may describe generic executors with honest assurance, but must
not silently certify them or broaden admission. Multiple executors per intent stay
available as explicit choices; capability-level PARTIAL must preserve usable subsets.
Generate projection from the current catalogs/contracts/resolver; **do not turn
this dated count table into a frozen executable model registry**.

## Packaging and phase boundary

CONFIRMED configuration: package.json build.files includes dist/**/* and electron/**/*;
electron/lib/whihm-host.js dynamically imports ../../lib/whihm-execution/host.mjs,
which needs workflow-core and source-relative Studio/src modules. afterPack does
not add that source closure. Renderer bundling is not proof of main-process source
inclusion. The inferred packaged failure is a **high-severity shipping blocker**;
no packaged artifact was inspected/run here. Do not claim packaged desktop/Windows/
portable production readiness. Fix and verify packaging before distribution, not
as a prerequisite for source/development metadata projection.

**Completed phase:** requested initial foundation hardening/capability completion,
with bounded assurance and explicit residual states. **Next phase:** implement
Astra capability projection only. **Later phase:** real WHIHM extensions, including
Media Inspection; Deterministic Finishing; Workflow Execution; Character/Performance
Benchmark; Agent Execution; Creative QC/Evaluation; Project-Aware Creative Memory;
Reusable Production Recipes. None is implemented by this reconciliation.

Retain later candidates: asset intelligence/tagging; shot/scene decomposition;
continuity; brand constraints; structured storyboard/shot plans; provenance/lineage;
cost-aware draft→final; selective regeneration; comparison workspace; temporal
consistency; audio production; caption/subtitle production; delivery/export presets;
human approval checkpoints; project cost ledger; capability fallback planning;
model/provider health; extension/adapter SDK. Existing basic approvals/captions do
not imply the richer production layers already exist. Suno durable recovery is a
future resilience enhancement. MMAudio is **MUST_REVISIT**, not dropped from this plan.

## Verification and evidence

Executable evidence: runtime.mjs routes/findRemote, bridge.mjs validation/assets/
normalization/authorization; Studio contract builders; shared muapi.js; readiness.mjs;
fixed host/renderer transport; package.json and Electron import loader. Tests inspected:
recastExecution, motionControlExecution, v2vExecution/Waves/utilities,
videoInputExecution, highValueVideoExecution, audioExecution, depthExecution,
sunoCloneExecution, whihmHost and readiness evidence/client tests. Prior recorded QA
is mocked coverage, not live media verification or a newly rerun broad suite.

Recount algorithm: union exact IDs from the nine primary catalogs; call findRemote
for each mode/ID plus three fixed services; deduplicate effective endpoints;
intersect bound pairs with current dedicated contract getters, then separately
account for the Act Two I2V compatibility branch. V2V classes are parsed from the
75-row inventory and checked against actual admission. Spicy is exact source-ID
membership, not a provider-wide sweep. Local model configurations are counted apart.

This documentation-only task ran source/count assertions plus passive plan/readiness/
authorization checks: **55 assertions PASS; zero fetch/auth/upload/provider actions**.
No source/registry/runtime changes, network inspection, paid execution or broad test
suite/build was needed. Markdown diff/working-tree/submodule checks are the final QA.
Current source/tests, not historic PASS prose, govern future admission and verification.
