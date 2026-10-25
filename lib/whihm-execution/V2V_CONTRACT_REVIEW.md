# Bounded V2V contract review

Inspection: 2026-10-25, starting HEAD `e65ff8a95cf8d04a0822bbf18ab136cca3230e1e`. This is a source-contract review of the 75 checked-out OGA V2V entries, not another provider catalog or pricing audit. All classifications concern eligibility for the **new canonical route**, not whether the existing OGA UI should remove a tool.

Evidence: `packages/studio/src/models.js`, `videoToolCapabilities.js`, `modelCapabilities.js`, `modelParameters.js`, `videoWorkflows.js`, `seedanceModels.js`, shared `muapi.js`, and desktop `src/lib/muapi.js`. Reuse the completed [creative audit](CREATIVE_CAPABILITY_REUSE_AUDIT.md) and [provider audit](MUAPI_MEDIA_CAPABILITY_AUDIT.md). Public non-generating GETs refreshed only [face swap](https://api.muapi.ai/api/v1/models/ai-video-face-swap) and [base Seedance 2.5 edit](https://api.muapi.ai/api/v1/models/seedance-2.5-video-edit). No authentication, upload, estimate, submission or provider execution was used. Other provider contracts rely on the completed audit; no fresh guarantee is implied.

## Reviewed execution subset

| Model | Required inputs | Supported optional inputs/settings | Bounds / decision |
| --- | --- | --- | --- |
| `runway-aleph-v2v` | source `video_url`, prompt | aspect_ratio | Existing override enum; no image-reference contract |
| `wan2.2-edit-video` | source video, prompt | resolution | 480p/720p; fix loss of declared common control in shared mapping |
| `seedance-2.5-video-edit` | source video, prompt | images_list, audios_list, resolution, duration, generate_audio, seed, high_bitrate | Images 0–30, audio 0–10, duration integer 4–30, seed −1–4294967295; resolution 480p/720p/1080p/4k. Current provider has no aspect_ratio on this exact endpoint; corrected only this declaration and its native-resolution facet |
| `runway-act-two-v2v` | character `video_url`, performance `reference_video_url` | aspect_ratio | Two distinct videos, not Recast image + driving video. Add required-field metadata; preserve aspect |
| `ai-video-face-swap` | video_url, image_url | None currently represented in OGA | Public metadata also exposes target_gender/target_index, but these remain unbound; reject rather than silently drop |
| `video-background-remover` | video_url | None currently represented in OGA | Provider audio/background/container controls remain unbound; source-only service defaults are explicit scope |
| `ai-video-upscaler` | video_url | resolution, copy_audio | Existing enum 720p/1080p/2k/4k; boolean audio |
| `topaz-video-upscale` | video_url | upscale_factor | Existing integer enum 1/2/4 |
| `heygen-video-translate` | video_url | language | Existing language enum; omitted language visibly defaults to Hindi, matching existing override/provider default |

For the original nine models (expanded by Wave 1 below), the pure shared contract derives fields/defaults/media limits from existing catalog + overrides. It validates required text/media, exact types, enums, bounds and ordered reference arrays. Only configurable fields accept the existing `options` envelope; conflicts with top-level values reject. The existing desktop single-image alias explicitly maps to one ordered array item and rejects competing forms. No raw payload or provider-field escape hatch. The shared `processV2V` remains the only submit/poll/result boundary; the desktop method now delegates to it. Existing non-reviewed Studio paths are preserved, but cannot enter the canonical V2V route.

Required/optional media in the inventory below is **source declaration**, not a newly verified provider promise. `?` means imageOptional. Every entry has its existing source-video field unless stated otherwise. Supplemental fields shown exclude media/prompt. Enum/range definitions remain in the linked existing source; the table does not duplicate them into executable metadata.

## Complete checked-out inventory

Classes retain the original review and subsequent Wave 1/2 results: `R` = READY_FOR_GENERIC_V2V_BINDING; `F` = NEEDS_TARGETED_CONTRACT_FIX (fixed, now bound); `S` = SPECIALIZED_ROUTE_ALREADY_EXISTS; `I` = INSUFFICIENT_EVIDENCE; `D` = DEFER (source inspected, not yet reviewed sufficiently for execution).

| Exact OGA ID (endpoint when different) | Class | Media beyond source video; text | Declared supplemental fields |
| --- | --- | --- | --- |
| `video-watermark-remover` | I | — | — |
| `kling-v2.6-std-motion-control` | D | image_url (requirement per source), prompt required | character_orientation |
| `kling-v3.0-std-motion-control` | D | image_url (requirement per source), prompt supported | character_orientation, keep_original_sound |
| `kling-v3.0-pro-motion-control` | S | image_url (requirement per source), prompt supported | character_orientation, keep_original_sound |
| `ai-video-face-swap` | R | image_url (requirement per source) | — |
| `mmaudio-v2-video-to-video` → `mmaudio-v2/video-to-video` | I | prompt supported | — |
| `runway-aleph-v2v` | R | prompt required | aspect_ratio |
| `ai-dance-effects` | I | image_url (requirement per source), prompt supported | — |
| `ai-video-upscaler` | R | — | resolution, copy_audio |
| `wan2.2-edit-video` | F | prompt required | resolution |
| `heygen-video-translate` | R | — | language |
| `topaz-video-upscale` | R | — | upscale_factor |
| `ai-video-upscaler-pro` | I | — | — |
| `remix-video` | I | — | — |
| `kling-o1-video-edit` | F | images_list? (0–4; wire default []), prompt required | keep_original_sound, aspect_ratio |
| `kling-o1-video-edit-fast` | F | images_list? (0–4; wire default []), prompt required | keep_original_sound, aspect_ratio |
| `kling-o1-standard-video-edit` | F | images_list? (0–4; wire default []), prompt required | keep_original_sound |
| `wan2.2-spicy-video-extend` | D | prompt required | resolution, duration |
| `seedance-v1.5-pro-video-extend` | D | prompt required | resolution, duration, generate_audio, camera_fixed |
| `seedance-v1.5-pro-video-extend-fast` | D | prompt required | resolution, duration, generate_audio, camera_fixed |
| `add-video-watermark` | I | watermark_image_url (requirement per source) | — |
| `seedance-2-watermark-remover` → `seedance-2.0-watermark-remover` | I | — | — |
| `ai-captions` | I | — | — |
| `ltx-2.3-video-extend` | D | prompt supported | duration |
| `seedance-2-video-watermark-remover-pro` | I | — | — |
| `pixverse-v6-extend` | D | prompt required | resolution, duration, generate_audio_switch, negative_prompt, style |
| `wan2.7-video-extend` | R | audio_url, prompt required | negative_prompt, resolution, duration |
| `wan2.7-video-edit` | R | images_list?, prompt required | negative_prompt, resolution, duration, audio_setting |
| `happy-horse-1-video-edit-1080p` | D | images_list (requirement per source), prompt required | audio_setting, seed |
| `happy-horse-1-video-edit-720p` | D | images_list (requirement per source), prompt required | audio_setting, seed |
| `happy-horse-1.1-video-edit-1080p` | D | images_list (requirement per source), prompt required | audio_setting, seed |
| `happy-horse-1.1-video-edit-720p` | D | images_list (requirement per source), prompt required | audio_setting, seed |
| `gemini-omni-video-edit` | I | image_urls (requirement per source), prompt required | — |
| `video-background-remover` | R | — | — |
| `kling-v2.6-pro-motion-control` | D | image_url (requirement per source), prompt required | character_orientation |
| `infinitetalk-video-to-video` | S | audio_url, prompt supported | resolution |
| `wan2.2-animate` | S | image_url (requirement per source), prompt supported | mode, resolution |
| `volcengine-video-to-video-lip-sync` | S | audio_url | mode, separate_vocal, open_scenedet, align_audio, align_audio_reverse, templ_start_seconds |
| `seedance-2.5-video-edit` | F | images_list?, audios_list, prompt required | duration, generate_audio, seed, high_bitrate, resolution |
| `seedance-2.5-video-edit-480p` | I | images_list?, audios_list, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-video-edit-1080p` | I | images_list?, audios_list, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-video-edit-4k` | I | images_list?, audios_list, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-video-extend` | F | last_image?, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio, resolution |
| `seedance-2.5-video-extend-480p` | I | last_image?, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-video-extend-1080p` | I | last_image?, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-video-extend-4k` | I | last_image?, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-intl-video-edit` | D | images_list?, audios_list, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-spicy-video-edit` | D | images_list?, audios_list, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-intl-video-edit-480p` | D | images_list?, audios_list, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-spicy-video-edit-480p` | D | images_list?, audios_list, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-intl-video-edit-1080p` | D | images_list?, audios_list, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-spicy-video-edit-1080p` | D | images_list?, audios_list, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-intl-video-edit-4k` | D | images_list?, audios_list, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-spicy-video-edit-4k` | D | images_list?, audios_list, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-intl-video-extend` | D | last_image?, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-spicy-video-extend` | D | last_image?, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-intl-video-extend-480p` | D | last_image?, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-spicy-video-extend-480p` | D | last_image?, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-intl-video-extend-1080p` | D | last_image?, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-spicy-video-extend-1080p` | D | last_image?, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-intl-video-extend-4k` | D | last_image?, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-spicy-video-extend-4k` | D | last_image?, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `flux-3-video-extend` | R | prompt required | aspect_ratio, resolution, duration, generate_audio |
| `flux-3-video-upscaler` | R | prompt supported | upscale_factor, creativity |
| `flux-3-video-extend-draft` | R | prompt required | aspect_ratio, duration, generate_audio |
| `gemini-omni-flash-1-1-edit` | R | prompt required | resolution |
| `depth-anything` | I | image_url? | — |
| `runway-act-two-v2v` | F | reference_video_url required | aspect_ratio |
| `luma-flash-reframe` | D | image_url?, prompt supported | aspect_ratio, duration |
| `seedance-2-video-edit` → `seedance-v2.0-video-edit` | F | source video_urls [exactly 1], images_list?, audio_files?, prompt required | aspect_ratio, quality, duration |
| `happy-horse-1-video-edit` | D | images_list?, prompt required | resolution, audio_setting, seed |
| `happy-horse-1.1-video-edit` | D | images_list?, prompt required | resolution, audio_setting, seed |
| `topaz-upscale-video-creative` | D | prompt supported | creativity, realism, sharp, upscale_factor, target_fps, H264_output |
| `topaz-upscale-video-generative` | D | — | model, upscale_factor, target_fps, softness, H264_output |
| `topaz-upscale-video-precision` | D | — | model, upscale_factor, target_fps, compression, noise, halo, grain, recover_detail, H264_output |

Counts after Wave 2: **D=34, F=8, I=17, R=12, S=4**; 75 total, **20 now bound** (nine original + seven Wave 1 + four Wave 2). Six reviewed Seedance fixed-resolution variants moved from D to I because metadata/OpenAPI disagree.

## Deferred/specialized findings

- Kling v3 Pro Motion Control and Wan Animate have the richer existing `recast` aliases; Infinitetalk/Volcengine have `lipsync`. Explicit V2V routing rejects these; it does not silently reroute. Other Kling variants are deferred, not assumed covered by a different alias.
- Seedance fixed-resolution/profile variants, Happy Horse, other Gemini entries, Luma and creative Topaz paths remain on existing OGA paths, outside canonical admission. No wildcard family permission. See Wave 1 for the specific Seedance conflict.
- `seedance-2-video-edit` is now admitted with native `video_urls`, **exactly one** source under the current provider schema, and ordered optional image/audio arrays. Do not flatten or invent multi-clip support.
- Topaz generative/precision inputs contain a provider option named `model`, colliding with the existing logical model selector. Defer pending a narrow explicit representation; no raw-field workaround.
- Depth Anything can have alternative image/video roles. Source-only validation would fabricate a mandatory video contract; defer.
- Sparse catalog entries do not prove absent provider functionality. Watermarks/captions/pro upscaler/remix/MMAudio/dance/Gemini need contract evidence before canonical admission.
- Existing desktop V2V forwarded only source video, image and prompt. Delegation now preserves shared options and lifecycle, without changing desktop Video Studio controls. Missing UI controls are not invented.

## Precision and remaining limitations

These are AI transformations, not deterministic finishing guarantees. Validation checks declared request fields, not actual media duration, dimensions, size, codec or contents. Face swap metadata specifies <10 MB, <1280×720 or 720×1280, ≤600 frames; source URLs cannot prove those here. Seedance metadata says source videos >30s are provider-trimmed; no local probe is introduced. No promise of exact timing, camera, background or pixel preservation.

Readiness reuses static binding evidence; detailed supplied-input validation is the existing single-node plan responsibility. Planning has no credentials/upload/submission/polling. Host authorization/project integrity and existing upload boundaries remain unchanged. Runtime success is unverified without paid execution, which was intentionally not attempted.

Next: project Astra-facing capability information from these reviewed contracts and existing Recast/Motion/Lip Sync contracts; keep unreviewed models unavailable. Do not build a second catalog or broaden executor coverage implicitly.

## Wave 1 review — 2026-10-25 (safe partial admission)

Starting HEAD: `db68775b45a5a09d8e5254f1ab40f154fd2899f2`. All four requested families reviewed; seven additional exact IDs admitted. Six fixed-resolution Seedance variants remain unavailable to canonical execution. No wildcard, new execution path, UI, uploader, poller, catalog or project-schema change.

### Refreshed evidence and discrepancies

Public, unauthenticated `GET https://api.muapi.ai/api/v1/models/<id>` inspected all of:

- `seedance-2.5-video-edit` (original model comparison), `seedance-2.5-video-edit-480p`, `seedance-2.5-video-edit-1080p`, `seedance-2.5-video-edit-4k`
- `seedance-2.5-video-extend`, `seedance-2.5-video-extend-480p`, `seedance-2.5-video-extend-1080p`, `seedance-2.5-video-extend-4k`
- `seedance-2-video-edit` (catalog name), `wan2.7-video-edit`, `wan2.7-video-extend`
- `kling-o1-video-edit`, `kling-o1-video-edit-fast`, `kling-o1-standard-video-edit`
- `seedance-2.5-intl-video-edit`, `seedance-2.5-spicy-video-edit`, `seedance-2.5-intl-video-extend`, `seedance-2.5-spicy-video-extend` (inspection only).

`GET .../models/seedance-v2.0-video-edit` returned **404**. The public [OpenAPI](https://api.muapi.ai/openapi.json), read twice for selected request-schema cross-checks, confirms POST `/api/v1/seedance-v2.0-video-edit` and `Seedance2VideoEditRequest`. Metadata is indexed under `seedance-2-video-edit` and advertises a different endpoint; preserve the checked-out execution endpoint explicitly confirmed by OpenAPI. No POST probe. Both sources confirm video_urls is an array with maximum 1; OpenAPI also specifies minimum 1.

All statements below concern inspected request schemas, not measured backend behavior. No auth, upload, estimate, generation or paid execution occurred.

| Exact endpoint(s) | Compared evidence / discrepancy | Safe decision / source change |
| --- | --- | --- |
| `seedance-2.5-video-extend` | Model metadata exposes native resolution but omits aspect_ratio; OpenAPI supports **both** resolution and aspect_ratio. Other controls agree | Admit both declared controls; retain existing aspect support, add native-resolution schema shared with original base edit; mark base extend native-resolution in existing Seedance configuration |
| `seedance-2.5-video-edit-480p`, `seedance-2.5-video-edit-1080p`, `seedance-2.5-video-edit-4k`, `seedance-2.5-video-extend-480p`, `seedance-2.5-video-extend-1080p`, `seedance-2.5-video-extend-4k` | Individual model metadata omits resolution/aspect; OpenAPI references a common schema with aspect and a freely selectable resolution enum/default **720p on every suffix**. Endpoint names alone do not prove enforced output resolution or override semantics | **Do not admit.** No source edits to these six, no fabricated fixedParameters, no profile substitution. Need first-party clarification of whether resolution is forced/ignored/overridden by suffix before binding |
| `seedance-v2.0-video-edit` | OpenAPI confirms existing execution alias and exact cardinality 1, versus failed metadata lookup under that alias | Admit existing endpoint; add required fields and minItems=1 to existing catalog. Keep native array source |
| `wan2.7-video-edit` | Required media, options, enum/range/default metadata match | Admit using existing metadata; no new request builder |
| `wan2.7-video-extend` | Audio explicitly optional; duration described as **total final output** in model metadata | Admit; clarify duration description in existing model, not appended duration |
| `kling-o1-video-edit`, `kling-o1-video-edit-fast`, `kling-o1-standard-video-edit` | Model metadata omits images_list from required fields; OpenAPI requires the **wire key**, but permits null/empty array. Metadata limits references to 4, OpenAPI has no stricter positive minimum | Admit conservative intersection: 0–4 references, existing [] wire default when omitted, no null representation. Retain required wire-field declaration; mark imageOptional and minItems=0. Full/fast have aspect; Standard does not |

Correction to the original nine-model review: absence of aspect_ratio from Seedance base-edit model metadata did **not** prove provider rejection; current OpenAPI includes it. This task leaves the already-bound base-edit accepted-input subset unchanged. Its equivalent native-resolution definition is now a shared video-only constant; no unrelated generation routes or enum casing/defaults changed.

### Admitted contracts

| Model / endpoint | Required / optional media | Controls and limits |
| --- | --- | --- |
| `seedance-2.5-video-extend` | Required video_url + prompt; optional scalar last_image target frame | Generate continuation from source final frame toward last_image when supplied. Duration **extension clip** length, integer 4–30/default 5; resolution 480p/720p/1080p/4k/default 720p; aspect adaptive/16:9/9:16/1:1/4:3/3:4/21:9/9:21/default 16:9. generate_audio true/default generates synchronized new-segment audio, high_bitrate false/default, seed −1–4294967295; omitted seed delegates provider randomness |
| `seedance-2-video-edit` → `seedance-v2.0-video-edit` | Required prompt and video_urls **array of exactly 1**; optional images_list 0–9, audio_files 0–3 | duration integer 4–15/default 5; aspect 16:9/9:16/4:3/3:4/default 16:9; quality high/basic/default basic. Ordered audio prompt references, not an audio-generation switch. No seed/resolution/generate_audio invented |
| `wan2.7-video-edit` | Required video_url + prompt; optional images_list 0–3 | negative_prompt; resolution 720p/1080p/default 720p; duration integer 0–10/default 0 (0 matches source length, capped at 10s); audio_setting auto/origin/default auto, origin preserves source sound |
| `wan2.7-video-extend` | Required video_url + prompt; audio_url optional | negative_prompt; resolution 720p/1080p/default 720p; duration integer 5–15/default 5 means **total final duration**, not seconds appended. No Wan 2.2 fallback |
| `kling-o1-video-edit`, `kling-o1-video-edit-fast` | Required video_url + prompt; optional 0–4 images, wire list defaults [] | keep_original_sound boolean/default true; aspect 16:9/9:16/1:1/default 16:9. Preserve exact selected endpoint |
| `kling-o1-standard-video-edit` | Same required video/prompt and 0–4 reference semantics | keep_original_sound true/default; **no aspect_ratio**. No fast/full substitution |

Source clip size/duration, actual content, fidelity and output dimensions remain provider/content checks. Seedance 2.0 metadata specifies source ≤10 MB/15s and total audio ≤15s; URLs do not prove those. No local probe or execution was introduced.

### Arrays, parity and planning

`buildV2VRequest` now handles required array media and enforces source counts before auth/upload/submission. Arrays are never flattened, truncated, reordered or deduplicated. Duplicates remain legal for image/audio references within limits; two source videos, even duplicates, are invalid for Seedance 2.0. Scalar video_url is not coerced into its array and competing forms reject.

Existing Studio logical aliases are normalized only to declared media roles: videos_list → native array video_urls; audios_list → native array audio_files; legacy image_url → one image or scalar last_image according to the model. Conflicting alias/native inputs reject rather than merge. Existing UI media helpers can deduplicate picker inputs themselves; the shared/canonical execution contract preserves arrays it receives. No desktop request builder added.

Existing bridge asset binding already supports video_urls/audio_files arrays through the authoritative project resolver, with transient host paths. No bridge/project/host implementation change was needed. Plans expose required source counts, optional counts, ordered flags, control schemas/ranges/defaults, operation/purpose. Control schemas are detached from the source catalog. Kling's wire-list requirement is distinguished from requiring actual image media.

### Profiles intentionally not admitted

The refreshed unsuffixed Intl/Spicy edit and extend model metadata matches corresponding Standard field sets, but source declarations still have stale native-resolution information. Their suffixed variants were not separately reviewed live; the Standard suffix conflict already prevents treating family branding as proof. No automatic admission, source rewrites or substitution.

Remaining Wave 1 work is provider clarification for the six Standard fixed-resolution routes, followed by a bounded contract update. No runtime behavior was inferred by running paid jobs.

## Wave 2 review — 2026-10-25

Starting HEAD: `6ca2cff0c62fc03a6f4b729def95cf6c5dfc1053`. All four targeted IDs admitted through existing `v2v` validation and shared `processV2V`; no wildcard, new catalog/client/uploader/poller or provider-field passthrough. The six Seedance suffix variants and Intl/Spicy profiles were not revisited.

### Evidence and exact contracts

Source: existing `models.js`, `videoToolCapabilities.js`, `modelCapabilities.js`, `modelParameters.js`, `videoWorkflows.js`, shared `muapi.js`, desktop delegation and existing execution bindings. Four unauthenticated public model GETs below plus one [OpenAPI GET](https://api.muapi.ai/openapi.json) verified selected POST schemas. No estimates, auth, uploads or execution. Model IDs equal exact endpoint suffixes `/api/v1/<id>`.

| Exact endpoint / evidence | Required inputs | Supported optional controls / defaults | Model-specific safety |
| --- | --- | --- | --- |
| [gemini-omni-flash-1-1-edit](https://api.muapi.ai/api/v1/models/gemini-omni-flash-1-1-edit) | video_url + nonblank prompt | resolution 360p/720p/1080p/4k, default 720p | Metadata and OpenAPI agree. No additional image/audio/reference input or duration control. Preserve prompt exactly; no Gemini substitution |
| [flux-3-video-extend](https://api.muapi.ai/api/v1/models/flux-3-video-extend) | video_url + nonblank prompt | aspect_ratio 16:9/9:16/1:1/4:3/3:4/21:9, catalog default 16:9; resolution 720p/1080p, default 720p; duration integer 5–20/default 5; generate_audio boolean/default true | Duration is extension length per model description; optional native synchronized audio is generated, not an audio-reference input. Full endpoint only, no draft fallback |
| [flux-3-video-extend-draft](https://api.muapi.ai/api/v1/models/flux-3-video-extend-draft) | video_url + nonblank prompt | same declared aspect enum, **no aspect default**; duration integer 5–20/default 5; generate_audio boolean/default true | No resolution field in metadata or OpenAPI: reject even a 720p override. Actual output resolution is UNVERIFIED; do not invent fixedParameters. Existing description calls this a fast/lower-cost draft; no performance, quality or price comparison was measured |
| [flux-3-video-upscaler](https://api.muapi.ai/api/v1/models/flux-3-video-upscaler) | video_url only | optional prompt; upscale_factor finite number 1–4, catalog default 2; creativity integer enum 0/1, default 0 | Precise/Creative AI enhancement, not conventional pixel-preserving deterministic upscale. Prompt may be omitted or empty; when supplied, retain text exactly. No Topaz/simple-upscaler routing, copy_audio, resolution or duration fields |

### Resolved metadata differences / conservative subset

- Both Flux extension OpenAPI schemas additionally allow aspect `2:1` and nullable aspect with no default. Existing OGA catalog declares six non-null strings. Keep that existing supported subset and reject `2:1`/null rather than silently accepting undeclared controls. Full extend's explicit **catalog** default 16:9 remains; draft has no default and omission stays omitted. No global aspect-enum change.
- Flux upscaler OpenAPI permits optional nullable prompt/upscale_factor and no factor default. The existing catalog supplies factor 2; retain that explicit product default and non-null representations. Null rejects rather than silently becoming a default.
- `upscale_factor.step=0.5` is existing UI increment metadata, not an OpenAPI multipleOf restriction. Numbers such as 1.25 are valid within 1–4 and remain exact; no rounding to the picker increment.
- OpenAPI exposes webhook_url, but no such canonical option is admitted. No arbitrary callback/raw provider payload escape hatch.
- No required media/control schemas needed correction. Only Flux upscaler's touched description was narrowed: AI-based refinement, Creative reconstruction, and no deterministic pixel, motion-fidelity or audio-sync guarantee. Existing precise/creative labels and optional controls remain unchanged.

### Existing runtime, application and planning

The four-ID eligibility addition uses existing source schemas and the existing validator's required-field/type/enum/range checks. `processV2V` already selects that pure shared contract, and desktop `MuapiClient.processV2V` already delegates unchanged. Existing upload, submission, request-ID callback, polling, cost/result normalization, project resolver and authorization remain untouched. No new runtime/readiness rules.

Plans show exact model/endpoint/provider, required source video, required vs optional prompt, accepted options, effective defaults and detached control schemas. `operation=edit` identifies Gemini, `operation=extend` distinguishes full/draft extension, and Flux upscaler `operation=upscale` retains an explicit AI/creative caveat in purpose plus its creativity control. Readiness continues to mean plannable binding, not measured generative fidelity. Planning does not read credentials, load media bytes, upload, estimate, submit or poll.

Flux extension source metadata requires clips under 50 MB and under 15 seconds. This URL-only layer cannot verify those content properties. No probe or duration inference was added. No claim that draft has a fixed resolution, that Precise mode preserves exact pixels, or that motion/timing/audio are guaranteed. No actual quality, latency, cost or output media was measured.

QA uses fake transports, including all four shared/application payloads and canonical plans/execution, invalid-input rejection before auth/upload, full/draft defaults and distinction, numeric upscale boundaries, project assets through the existing host, and polling callback reuse. Existing Wave 1/V2V/Recast/Motion contracts remain separate. No UI, dependencies, packaging, workflow/project schema or Electron security changes.
