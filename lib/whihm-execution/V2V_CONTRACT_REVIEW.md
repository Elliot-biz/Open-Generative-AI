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

Classes retain the original review and subsequent reviewed-wave results: `R` = READY_FOR_GENERIC_V2V_BINDING; `F` = NEEDS_TARGETED_CONTRACT_FIX (fixed, now bound); `S` = SPECIALIZED_ROUTE_ALREADY_EXISTS; `I` = INSUFFICIENT_EVIDENCE; `D` = DEFER (source inspected, not yet reviewed sufficiently for execution).

| Exact OGA ID (endpoint when different) | Class | Media beyond source video; text | Declared supplemental fields |
| --- | --- | --- | --- |
| `video-watermark-remover` | R | — | — |
| `kling-v2.6-std-motion-control` | D | image_url (requirement per source), prompt required | character_orientation |
| `kling-v3.0-std-motion-control` | D | image_url (requirement per source), prompt supported | character_orientation, keep_original_sound |
| `kling-v3.0-pro-motion-control` | S | image_url (requirement per source), prompt supported | character_orientation, keep_original_sound |
| `ai-video-face-swap` | R | image_url (requirement per source) | — |
| `mmaudio-v2-video-to-video` → `mmaudio-v2/video-to-video` | I | prompt supported | — |
| `runway-aleph-v2v` | R | prompt required | aspect_ratio |
| `ai-dance-effects` | D | image_url (requirement per source), prompt supported | — |
| `ai-video-upscaler` | R | — | resolution, copy_audio |
| `wan2.2-edit-video` | F | prompt required | resolution |
| `heygen-video-translate` | R | — | language |
| `topaz-video-upscale` | R | — | upscale_factor |
| `ai-video-upscaler-pro` | D | — | — |
| `remix-video` | D | — | — |
| `kling-o1-video-edit` | F | images_list? (0–4; wire default []), prompt required | keep_original_sound, aspect_ratio |
| `kling-o1-video-edit-fast` | F | images_list? (0–4; wire default []), prompt required | keep_original_sound, aspect_ratio |
| `kling-o1-standard-video-edit` | F | images_list? (0–4; wire default []), prompt required | keep_original_sound |
| `wan2.2-spicy-video-extend` | D | prompt required | resolution, duration |
| `seedance-v1.5-pro-video-extend` | R | prompt required | resolution, duration, generate_audio, camera_fixed |
| `seedance-v1.5-pro-video-extend-fast` | D | prompt required | resolution, duration, generate_audio, camera_fixed |
| `add-video-watermark` | F | required watermark_image_url (image), source video | position, opacity, scale |
| `seedance-2-watermark-remover` → `seedance-2.0-watermark-remover` | R | — | — |
| `ai-captions` | F | required source video | language, theme |
| `ltx-2.3-video-extend` | R | prompt supported | duration |
| `seedance-2-video-watermark-remover-pro` | R | — | — |
| `pixverse-v6-extend` | R | prompt required | resolution, duration, generate_audio_switch, negative_prompt, style |
| `wan2.7-video-extend` | R | audio_url, prompt required | negative_prompt, resolution, duration |
| `wan2.7-video-edit` | R | images_list?, prompt required | negative_prompt, resolution, duration, audio_setting |
| `happy-horse-1-video-edit-1080p` | D | images_list (requirement per source), prompt required | audio_setting, seed |
| `happy-horse-1-video-edit-720p` | D | images_list (requirement per source), prompt required | audio_setting, seed |
| `happy-horse-1.1-video-edit-1080p` | D | images_list (requirement per source), prompt required | audio_setting, seed |
| `happy-horse-1.1-video-edit-720p` | D | images_list (requirement per source), prompt required | audio_setting, seed |
| `gemini-omni-video-edit` | F | required video_url + prompt; optional ordered image_urls 0–7 | trim_start/end, duration, resolution, aspect_ratio, seed, opaque audio_ids/character_ids |
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
| `seedance-2.5-spicy-video-edit` | F | images_list?, audios_list, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-intl-video-edit-480p` | D | images_list?, audios_list, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-spicy-video-edit-480p` | D | images_list?, audios_list, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-intl-video-edit-1080p` | D | images_list?, audios_list, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-spicy-video-edit-1080p` | D | images_list?, audios_list, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-intl-video-edit-4k` | D | images_list?, audios_list, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-spicy-video-edit-4k` | D | images_list?, audios_list, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-intl-video-extend` | D | last_image?, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-spicy-video-extend` | F | last_image?, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
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
| `luma-flash-reframe` | R | image_url?, prompt supported | aspect_ratio, duration |
| `seedance-2-video-edit` → `seedance-v2.0-video-edit` | F | source video_urls [exactly 1], images_list?, audio_files?, prompt required | aspect_ratio, quality, duration |
| `happy-horse-1-video-edit` | D | images_list?, prompt required | resolution, audio_setting, seed |
| `happy-horse-1.1-video-edit` | D | images_list?, prompt required | resolution, audio_setting, seed |
| `topaz-upscale-video-creative` | F | prompt supported | creativity, realism, sharp, upscale_factor, target_fps, H264_output |
| `topaz-upscale-video-generative` | F | — | topaz_model (wire model), upscale_factor, target_fps, softness, H264_output |
| `topaz-upscale-video-precision` | F | — | topaz_model (wire model), upscale_factor, target_fps, compression, noise, halo, grain, recover_detail, H264_output |

Current counts after the high-value remote video wave: **D=28, F=16, I=8, R=19, S=4**; **75 total, 35 bound**, 36 unresolved D/I and four specialized. Utility milestone historical counts were D33/F13/I9/R16/S4, 29 bound; the appended review records this wave’s exact scope. Before this milestone (Wave 3): D=31, F=11, I=17, R=12, S=4, 23 bound. Six utility IDs are newly bound; three unrelated I entries move to D based on refreshed request evidence only and remain unbound. Six Seedance fixed-resolution variants remain I because naming/metadata/OpenAPI conflict.

## Deferred/specialized findings

- Kling v3 Pro Motion Control and Wan Animate have the richer existing `recast` aliases; Infinitetalk/Volcengine have `lipsync`. Explicit V2V routing rejects these; it does not silently reroute. Other Kling variants are deferred, not assumed covered by a different alias.
- Seedance fixed-resolution/profile variants and Happy Horse remain on existing OGA paths outside canonical admission, except the exact unsuffixed Spicy pair admitted in the latest wave. Luma Flash Reframe and conservative Gemini Omni edit are now admitted; see the dated addenda. No wildcard family permission. See Wave 1 for the specific Seedance conflict.
- `seedance-2-video-edit` is now admitted with native `video_urls`, **exactly one** source under the current provider schema, and ordered optional image/audio arrays. Do not flatten or invent multi-clip support.
- Topaz generative/precision now use explicit `topaz_model` for provider wire `model`; see Wave 3. The logical endpoint selector remains separate; no raw-field workaround.
- Depth Anything remains deferred: refreshed metadata confirms alternative image/video roles, while generic V2V requires video and labels outputs as video. Preserve the existing mixed Studio path until a scoped alternative-input contract can be represented without changing image callers.
- Sparse catalog entries do not prove absent provider functionality. Watermarks/captions now have reviewed contracts below; pro upscaler/remix/dance have refreshed request evidence but remain unbound. MMAudio retains its result evidence gap; conservative Gemini Omni edit is now admitted in the latest wave.
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

## Wave 3 review — 2026-10-25

Starting HEAD: `aa0e9f3a8a2dc7e06346e290a99c24478b6ca6d2`. All three exact Topaz IDs admitted through existing `processV2V`. No second catalog, provider/client, uploader, poller, raw options object or workflow/project schema change. Seedance suffix/profile exclusions were not revisited.

### Provider evidence

Three unauthenticated public model metadata GETs plus one [OpenAPI GET](https://api.muapi.ai/openapi.json) verified the exact POST schemas:

- [topaz-upscale-video-creative](https://api.muapi.ai/api/v1/models/topaz-upscale-video-creative) → `/api/v1/topaz-upscale-video-creative` / `TopazUpscaleVideoCreativeRequest`
- [topaz-upscale-video-generative](https://api.muapi.ai/api/v1/models/topaz-upscale-video-generative) → `/api/v1/topaz-upscale-video-generative` / `TopazUpscaleVideoGenerativeRequest`
- [topaz-upscale-video-precision](https://api.muapi.ai/api/v1/models/topaz-upscale-video-precision) → `/api/v1/topaz-upscale-video-precision` / `TopazUpscaleVideoPrecisionRequest`

These endpoint schemas agree on required video_url and engine enums/defaults. Model metadata describes several tuning ranges without machine-readable bounds; OpenAPI provides them. No authentication, upload, estimate, provider execution or paid operation occurred. Evidence describes accepted requests, not measured output quality.

### Explicit identity separation and upstream fix

`executor.model` is still the canonical selected endpoint ID. In the shared application call, root `params.model` is still that ID. The **only** provider-engine representation is scalar `topaz_model` for generative/precision. Existing catalog `inputs.model` was renamed to `inputs.topaz_model`, with `name=topaz_model`, title Topaz Engine, the original enum/default, and fixed metadata `providerField: model`.

This fixes a concrete upstream collision: the existing Video Studio creates `{model: selectedModel, ...buildSupplementalInputPayload(...)}`. Its old supplemental key `model` could overwrite the endpoint selector with a provider engine. The existing metadata-driven control and parameter helpers now emit topaz_model, retaining the selected endpoint without a UI component edit or desktop-specific request builder.

The pure V2V contract validates topaz_model against the exact selected endpoint's existing enum. Only then does it map that registered scalar to payload `model` and omit topaz_model from the wire. This is a fixed catalog alias, not a caller-supplied field mapping. Generic `options.model`, arbitrary `provider_options`, undeclared options and invalid engine values reject. Creative has no provider engine selector and rejects topaz_model.

Canonical root parameter/input `model` still fails the unchanged bridge IDENTITY_OVERRIDE protection. No logical selected-model rename, overload, alias fallback or raw object bypass. Historical caller code using the colliding provider `model` key must switch explicitly to topaz_model; no ambiguous legacy interpretation is introduced.

Plans distinguish `plan.model` (canonical endpoint) from `request.v2v.providerModel` and `providerModelField=model`. `request.effectiveOptions.topaz_model` and its detached enum/default schema retain the application name. The wire-key summary includes model, not topaz_model. Existing normalized results keep canonical identity even if upstream metadata includes a model field. The bridge uses the contract's explicit effectiveOptions so renamed controls do not disappear from plans.

### Verified request contracts

| Exact endpoint | Required / prompt | Optional controls and verified defaults | Constraints / caveats |
| --- | --- | --- | --- |
| topaz-upscale-video-creative | video_url; prompt optional | creativity default 0.5; realism, sharp; upscale_factor default 2; target_fps; H264_output default false | creativity/realism/sharp numbers 0–1; factor number 1–4; FPS integer 16–60; prompt ≤1024 Unicode code points. No provider-engine, softness or precision controls. Creative diffusion reconstruction, not deterministic enlargement |
| topaz-upscale-video-generative | video_url; **no prompt** | topaz_model default Starlight Precise 2.6; upscale_factor default 2; target_fps; softness; H264_output default false | Factor number 1–4; FPS integer 16–60; softness integer 1–5, accepted **only with Starlight Precise 2.6** per existing source/model metadata. Other engines never silently replace that selection or discard softness |
| topaz-upscale-video-precision | video_url; **no prompt** | topaz_model default Proteus; upscale_factor default 2; target_fps; compression, noise, halo, grain, recover_detail; H264_output default false | Factor number 1–4; FPS integer 16–60; compression/noise/halo/recover_detail numbers 0–1, grain 0–0.1. Precision restoration intent does not guarantee exact pixels/identity/textures/motion/background |

Generative engine values (five, exact): `Starlight Precise 2.6`, `Starlight HQ`, `Starlight Mini`, `Starlight Sharp`, `Starlight Fast 2`.

Precision engine values (21, exact): `Proteus`, `Proteus Natural`, `Iris`, `Iris Low Quality`, `Dione DV`, `Dione TV`, `Dione Robust`, `Dione Dehalo`, `Dione Robust Dehalo`, `Artemis High Quality`, `Artemis Medium Quality`, `Artemis Low Quality`, `Artemis Strong Halo`, `Artemis Medium Halo`, `Artemis Aliasing & Moire`, `Gaia HQ`, `Gaia CG`, `Gaia 2`, `Rhea`, `Theia Fine Tune Detail`, `Theia Fine Tune Fidelity`. Enums/defaults live in the existing OGA catalog; this document is evidence, not another runtime registry.

### Bounds, semantics and uncertainty

- Source corrections: add missing numeric min/max constraints for factors and tuning strengths, plus Creative prompt maxLength=1024 from OpenAPI. Existing enum/FPS/softness/H264 types and defaults remain. The V2V string validator now enforces declared maxLength without truncation, counting Unicode code points. Existing V2V report values remain unchanged.
- Upscale factor is a number, not an integer; OpenAPI defines no multipleOf restriction. Valid fractional factors such as 1.25 remain exact. Actual output dimension rounding/caps are UNVERIFIED; no deterministic scaling guarantee.
- target_fps is requested output frame rate, integer 16–60. There is **no declared default**; omission stays omitted. Frame duplication/interpolation method and exact timing/cadence guarantees are UNVERIFIED. This is not a local deterministic FPS converter.
- H264_output is a boolean. True asks the provider to encode H.264; false uses its default codec. The default codec/container is not identified by these schemas and is not invented.
- Only Creative accepts prompt. OGA/provider model metadata says supplying a prompt limits input to 450 frames; URLs do not establish source frame count, so no claim of local enforcement. Null representations permitted for some optional provider controls are excluded from this non-null application subset; omission is supported instead.
- Softness has the explicit Starlight Precise 2.6 applicability rule above. No additional mutually exclusive control combinations are specified in the inspected request contracts. Actual per-engine effects remain provider-owned; no unsupported conditional guarantees were inferred.
- Source purpose descriptions now state AI enhancement/reconstruction and preservation caveats for all three. Precision is more conservative intent, not pixel-equivalent output. Quality, identity fidelity, speed, cost, actual output FPS/codec and repeated-run reproducibility were not measured.

### Reused execution, project and security boundaries

Existing desktop V2V delegation, shared processV2V, uploader, request-ID callback, submit/poll/result lifecycle, runtime bindings, authorization and project resolver remain authoritative. No new provider authentication or execution mechanism. Project asset paths stay relative in canonical data and transient host paths do not enter plans/files.

The shared source namespace also keeps the existing web parameter builder compatible. Only the existing metadata-driven control key/title changes; no Studio component/layout changes. Invalid shared/canonical requests reject before transport; existing web picker/parameter-helper normalization remains UI behavior, not a provider passthrough.

Plans expose media, optional prompt, factor/FPS/H264, family controls/defaults, engine identity and enhancement caveat without authentication, asset-byte loading, uploads, submissions or polling. All QA uses fake transports. Existing 20 V2V bindings plus Recast/Motion/Lip Sync remain separate, with no schema, project/history, packaging, dependency or Electron security changes.

## Utility contracts and unresolved-family review — 2026-10-26

Starting HEAD `30e28bcc12161b7fbc6038f527071e7b8adde851`.
**Safe partial admission:** six exact IDs add four semantic intents through shared
processV2V. MMAudio/video sound and depth remain unbound. No new mode, client,
uploader, poller, local media tools or specialized-route migration.

### Exact utility contracts / results

| Logical ID → endpoint | Classification / result | Verified accepted request |
| --- | --- | --- |
| luma-flash-reframe | R; GENERATIVE_AI reframed video | required video_url; optional prompt and first-frame image_url; aspect enum 16:9/9:16/1:1/4:3/3:4/21:9/9:21, default 1:1; duration integer enum 5/8/10, default 5. AI expansion, not exact crop or guaranteed subject preservation. Metadata marks aspect required but both source and OpenAPI provide 1:1 default; omission explicitly uses it |
| add-video-watermark | F (metadata gap fixed); DETERMINISTIC_UTILITY remote composition | required video_url + distinct watermark_image_url; position top-left/top-right/bottom-left/bottom-right/center, default bottom-right; opacity number 0–1/default .7; scale number .1–1/default .15. Fractions and zero opacity retained; no timing/mask/region/resolution/size controls. OpenAPI width/height fields are not exposed: model metadata does not establish their video-composition semantics |
| video-watermark-remover | R; CONTROLLED_AI removal/reconstruction | required video_url only; no prompt, mask, region, duration or reference field. Exact restored pixels/hidden content are not promised |
| seedance-2-watermark-remover → seedance-2.0-watermark-remover | R; CONTROLLED_AI inpainting | required video_url only. Metadata describes Seedance watermark detection and LaMa per-frame inpainting. Logical metadata GET succeeds, wire-name detail GET is 404; exact dotted wire path is confirmed in OpenAPI. No automatic source-model verification or universal logo-removal guarantee |
| seedance-2-video-watermark-remover-pro | R; CONTROLLED_AI reconstruction | required video_url only; distinct endpoint, no fallback. Metadata says SD2-powered reconstruction, ≤100 MB input. URL-only validation cannot measure size, quality or exact restoration |
| ai-captions | F (metadata gap fixed); CONTROLLED_AI captioned video | required video_url; language enum 45 published names/default English, theme enum 18 published names/default Hormozi_1. Exact enums now live in existing videoToolCapabilities overrides. No response_format, arbitrary subtitle styling, transcript or subtitle-file option |

Media must be nonempty HTTP(S) URLs without embedded credentials, at most 2083
characters as the six OpenAPI media fields specify. Canonical safety validation
also rejects credential/signed-URL data. Optional provider null forms are not
admitted; use omission. Watermark provider metadata incorrectly labels video_url
as image and opacity/scale as integers; the existing source's videoField and
OpenAPI string/number roles/types are authoritative. OpenAPI allows opacity zero,
where detail picker metadata starts at .1; zero is explicitly valid here.

The new controls use the existing override/contract machinery. Undeclared fields,
raw/provider_options, options.model, masks, unsupported arrays, cross-family
controls and canonical model overrides reject before authentication/transport.
Only registered configurable scalar fields accept the existing options envelope.
Six exact admission IDs do not grant wildcard utility/family execution.

Typed registered project source videos and watermark/reframe images use the
existing resolver, identity/checksum/project-boundary checks and upload path.
Only the new utility roles gain these stricter asset-type checks; old 23 bindings
are unchanged. Plans retain logical placeholders and project-relative uploads.
No byte/media probing, download, output registration or history mutation is added.

These provider schemas identify video artifacts, including native output.video
and generic outputs. Shared processV2V now normalizes native video/nested-output
URLs for the existing application consumer, using its existing result helper;
all original safe metadata survives. Canonical utility normalization preserves
actual output order, marks resultKind=v2v-utility and exposes semantic caveats.
Objects in returned output arrays stay JSON, not fabricated video URLs. Nested
captions/masks/diagnostics/other actual metadata remain in upstream. Caption
metadata promises **burned-in video only**, not standalone transcription, SRT,
VTT, editable captions or measured synchronization. No synthetic output is made
when a field is absent. Provider success/fidelity/timing/encoding are unmeasured.

### Two utilities deliberately remain I

- **mmaudio-v2-video-to-video → mmaudio-v2/video-to-video:** request is now
  confirmed: video_url + nonblank prompt, integer duration 1–30/default 8. No
  input-audio/replacement/mixing/seed control is exposed. Exact slash POST path
  exists; hyphen logical-name POST does not. Metadata's output_data declares a
  video property/example but requires a nonexistent audio property and calls its
  output type AISoundT2A; generic output_schema does not disambiguate artifacts.
  Thus video-with-generated-audio vs audio-only, original sound treatment and
  actual result typing remain **UNVERIFIED**. Do not relabel it audio or claim it
  unavailable at MuAPI. No canonical admission until a coherent first-party
  output contract is established without paid probing.
- **depth-anything:** current metadata explicitly says exactly one image_url or
  video_url, with an image depth map for images and depth video for video. OpenAPI
  makes both nullable and encodes neither required input nor XOR. Current generic
  V2V hard-requires source video and uses video output typing. Simply allowlisting
  would break or mislabel the existing image path. A future scoped alternative-
  input/result contract must retain both roles; do not invent calibrated depth,
  image-sequence, units, masks or map encoding. It remains I, not generically bound.

### Read-only reconciliation of all remaining D/I families

All **42 unresolved IDs** are accounted for below. Exact IDs remain in the complete
75-row inventory above. No family in this section was implemented. Four S entries
retain specialized precedence: Kling v3 Pro / Wan Animate use Recast, while
InfiniteTalk / Volcengine use Lip Sync. Alternate Kling variants are not silently
covered by the pro alias.

| Remaining family / number | Creative value vs existing routes | Evidence / exact blocker | Decision |
| --- | --- | --- | --- |
| Standard Seedance 2.5 fixed edit/extend 480p/1080p/4k — 6 I | Resolution/profile alternatives, not a new intent | Every refreshed suffix detail omits resolution, while OpenAPI exposes all resolutions with default 720p even on a 4k suffix. Existing source also has stale aspect/native-profile declarations. Naming cannot establish fixed output | Keep deferred pending provider clarification; do not infer suffix behavior |
| Seedance 2.5 Intl/Spicy edit/extend, unsuffixed + 480p/1080p/4k — 16 D | Region/profile alternatives; Intl metadata identifies a Dreamina international deployment. No measured new creative ability | Unsuffixed metadata has selectable resolution; suffixed schemas repeat Standard profile ambiguity. Source control parity still needs scoped reconciliation/testing. Spicy naming is not proof of a precise new transform | Consider only four unsuffixed routes if region/profile constraints require them; defer twelve suffixes |
| Happy Horse 1/1.1 edit generic + 720p/1080p — 6 D | Alternate reference-guided editing, overlapping Wan/Kling/Seedance | Generic schemas confirm resolution 720p/1080p, images max5 optional, audio_setting auto/origin, seed 0–2147483647/default0. Four fixed local declarations currently require images although provider does not; suffix OpenAPI still allows selectable resolution. Existing source media constraints need validation/projection | Low priority; prefer two generic contracts if a concrete production needs this executor; do not bind all profiles for completeness |
| Seedance 1.5 Pro extend + fast — 2 D | Existing extension intent; camera_fixed and audio switch add optional controls | OpenAPI requires prompt+video, although detail required list omits video. Duration 4–12/default5, resolution480p/720p, audio true, camera_fixed false. Temporal/identity fidelity is marketing, not measured guarantee | Bounded later extension wave; keep variants distinct and avoid exact-camera promises |
| Pixverse v6 extend — 1 D | Useful stylistic extension alternative | Prompt+video, duration1–15/default5; resolution360p/540p/720p/1080p; audio switch false; optional negative prompt/style anime/3d_animation/clay/comic/cyberpunk. Request evidence sufficient for future bounded implementation, not admitted now | Medium priority for style/short extension controls |
| LTX 2.3 extend — 1 D | Prompt-optional extension and length1–20 add useful flexibility | Video required; optional prompt, duration1–20/default5. Source/helper support exists; field review, exact duration meaning and lifecycle tests still needed | Low-risk later extension wave |
| Wan2.2 Spicy extend — 1 D | Mostly redundant extension/style alternative | Prompt+video, resolution480p/720p/default480p, duration enum5/8. No evidence of unique structured controls over current Wan/Seedance/Flux | Low priority / user-driven alternative |
| Kling v2.6 std/pro + v3 std motion control — 3 D | Performance/reference transfer alternatives, overlapping Recast | Image+video roles, orientation image/video; v2.6 prompt required in OpenAPI, v3 std prompt optional plus sound preservation. Broad camera-control marketing does not prove exact preservation | Review as specialized Recast-compatible alternatives, not generic V2V migration; existing pro remains S |
| Gemini Omni video edit (older/non-Flash) — 1 I | Higher-value multimodal edit controls absent from admitted Flash edit: references, trim, voice/character IDs | Metadata/OpenAPI require only prompt, allow nullable video, optional image_urls max7; local source wrongly implies required images. Controls include trim_start/end, duration4/6/8/10, resolution, aspect, seed, opaque audio/character ID arrays max3. Need source-required-role reconciliation, ordered trim validation and ID-vs-asset distinction | Highest-value focused edit review; can require a conservative source-video scope, but must not accidentally expose generation or lose media |
| ai-dance-effects — 1 D (was I) | Potential specialist dance/performance effect; superiority vs Recast/Motion is unverified | Refreshed OpenAPI confirms required image+video, optional prompt, resolution480p/720p/default480p. Catalog lacks resolution metadata; exact dance/motion/identity quality is unverified | New request evidence moves I→D only. Future specialized comparison before deciding route; no binding now |
| remix-video — 1 D (was I) | Aspect-only transformation overlaps Reframe | Request confirmed video+aspect1:1/16:9/9:16/default9:16. No exposed text/reference controls; description does not prove exact crop or conventional conversion | Low priority / redundant; I→D records real request evidence, not admission |
| ai-video-upscaler-pro — 1 D (was I) | Alternate enhancement, already many admitted upscalers | Request confirmed video+resolution720p/1080p/2k/4k/default720p. Local sparse metadata lacks control. No measured quality advantage, copy_audio or format control established | Low priority; I→D only, reuse existing upscalers until a concrete need |
| MMAudio video sound + Depth Anything — 2 I | Both unlock genuinely distinct intents | Exact remaining output/alternative-role blockers documented above | Clarification/contract design first; no paid probing or broad analysis subsystem |

### Recommended future waves (not implementation authorization)

1. **Focused Gemini Omni multimodal edit review**, with conservative source roles,
   optional references and opaque IDs kept separate. Higher potential control
   leverage than another resolution-only executor; resolve requirements first.
2. **Extension-control wave:** LTX 2.3 + Pixverse v6, then Seedance 1.5 Pro/fast
   only if camera_fixed/audio controls matter. These add useful request controls
   but no new extension intent. No automatic Wan Spicy admission.
3. **Specialist performance wave:** compare Dance Effects and three alternate
   Kling routes against existing Recast/Motion controls; only implement a measured
   contract/intent gap, retaining specialized precedence.
4. **User-driven alternative executors:** four unsuffixed Intl/Spicy profiles or
   two generic Happy Horse models when region/quality constraints justify them.
   Not a completeness sweep. Performance/quality advantage remains unverified.
5. **Optional low-value cleanup:** Pro upscaler/remix/Wan Spicy only for concrete
   user demand. Keep all eighteen Standard/Intl/Spicy fixed-resolution suffixes
   blocked until provider metadata is coherent; clarification is not a binding wave.

MMAudio and depth clarification can precede these waves because they represent
new intents, but ambiguity must not be solved by paid jobs or guessed artifacts.
No additional broad binding wave is required before a read-only Astra projection
of the reviewed subset with explicit unavailable/deferred states.

### Evidence and safety

This is a bounded review of the checked-out 75-entry OGA V2V surface, not a provider
catalog scrape. Current source/capability/parameter/media helpers and prior Waves
were reused. Public, unauthenticated [OpenAPI](https://api.muapi.ai/openapi.json)
was refreshed, plus exact [model detail GETs](https://api.muapi.ai/api/v1/models/luma-flash-reframe)
for eight utilities, two wire-name aliases and all forty other unresolved IDs.
All forty family-detail lookups succeeded; two wire-name detail aliases returned
404 while their exact POST schemas are present. Request schemas for remaining
families were compared from the same OpenAPI snapshot, not by POST calls.
Each family's exact detail URL is `https://api.muapi.ai/api/v1/models/<inventory-ID>`.
No auth, credentials, pricing/estimate POST, upload, generation, agents, inference,
model download or paid execution occurred. Confirmed request evidence is distinct
from inferred creative usefulness and unverified backend quality/result fidelity.

## High-value remote video wave — 2026-10-26 (safe partial)

Starting HEAD `ebb589965ad6302c2f552f8c0327d9f971b35b27`.
Six exact V2V IDs are newly admitted; no generic payload/client/lifecycle is added.
The previous unresolved-family tables are historical evidence/priority decisions;
this section supersedes only these six admissions and the Fast prioritization rule.
Current classes: **D28/F16/I8/R19/S4**, 75 total; **35 bound**, 36 unresolved, 4 S.

| Newly admitted ID | Required / optional media | Controls / defaults / scope |
| --- | --- | --- |
| seedance-2.5-spicy-video-edit | video_url + nonblank prompt; optional ordered images_list0–30 and audios_list0–10 | duration integer4–30/default5; resolution480p/720p/1080p/4k/default720p; aspect adaptive/16:9/9:16/1:1/4:3/3:4/21:9/9:21/default16:9; optional seed−1–4294967295, no default; high_bitrate false, generate_audio true. Zero seed/false switches/order/duplicates retained; no extra prompt prefix |
| seedance-2.5-spicy-video-extend | video_url + nonblank prompt; optional scalar last_image | Same bounded controls/defaults; no edit image/audio lists. Continuation-segment duration, not an assembled final timeline. Optional last_image is a target frame, never a reference list |
| gemini-omni-video-edit | Canonical V2V requires video_url + nonblank prompt; images optional, ordered image_urls0–7 | trim_start/end nonnegative/default0/10, end≥start; duration4/6/8/10 default8; resolution720p/1080p/4k default1080p; aspect16:9/9:16 default16:9; seed0–2147483647, model-detail product default0. Opaque audio_ids and character_ids0–3 are provider identifiers, not assets/URLs/paths |
| ltx-2.3-video-extend | video_url required; prompt optional | duration integer enum1…20/default5. No invented resolution/audio/camera control |
| pixverse-v6-extend | video_url + nonblank prompt | duration integer1–15/default5 from model detail/source; resolution360p/540p/720p/1080p default720p; generate_audio_switch false; optional negative_prompt; style exactly anime/3d_animation/clay/comic/cyberpunk, no default |
| seedance-v1.5-pro-video-extend | video_url + nonblank prompt | duration integer4–12/default5; resolution480p/720p/default720p; generate_audio true; camera_fixed false. A camera intent flag is not an exact-preservation guarantee |

Spicy native resolution uses the existing shared video-control resolution constant
and exact unsuffixed family facets. Fixed suffixes receive no native-resolution
certification. Gemini source metadata's required-image implication is corrected
in existing videoToolCapabilities, with an explicit conservative video-only V2V
scope. Model-specific bounds/defaults come from existing schemas plus verified
first-party fields; no second model registry is introduced. Optional provider null
forms remain excluded; omission is the supported representation.

Gemini provider schemas require only prompt and permit nullable video. This binding
deliberately requires source video; it does not expose reference-free generation.
Opaque ID lists are preserved in order and rejected if blank, URL/path-like or
containing whitespace/slashes; they are never passed to the project resolver.
Plans label providerIdentifiers with projectAsset=false. Registered assets with
coincidentally matching ID strings do not change this interpretation. Trim validation
does not infer clip duration or frame-perfect editing; a default end10 still means
start>10 requires an explicit compatible end. Equal start/end is permitted by the
requested end≥start rule, with provider content behavior unverified.

For these six contracts, existing project binding machinery now validates typed
source/image/audio roles and allows mixed registered/HTTP array references, retaining
order and duplicates. Unknown asset fields, especially opaque ID arrays, reject.
URI shape/length is validated before auth/upload. No source media probing or new
resolver. Plans expose roles, accepted controls/effective defaults, purpose/result
caveats and endpoint fields. Existing shared processV2V/application delegation,
request-ID polling, uploads, authorization and project integrity remain authoritative.
Native output.video/nested output.outputs are normalized without discarding metadata;
no audio/identity/trim artifact or exact timing/fidelity guarantee is fabricated.

### Generation/reference companion review

Five I2V models are explicitly reviewed through the existing generateI2V service:
Seedance2.5 Spicy first-last/omni, Wan2.2 Spicy image, Wan3 Spicy reference and
MiniMax H3 Spicy image. The bridge documentation records their exact contracts.
Two requested ordinary generation routes remain **DEFERRED**, not fully hardened:
seedance-2.5-spicy-text-to-video and seedance-2.5-spicy-image-to-video.
Current source/model detail declares generate_audio, but OpenAPI omits it and
introduces draft/draft_request_id finalization. Source generation resolution also
uses 4K/default1080p while OpenAPI uses 4k/default720p. The existing generic upstream
path is preserved; canonical admission fails closed with VIDEO_AUDIO_CONTRACT_CONFLICT.
No unsupported field is silently discarded or certified. Draft/finalization remains
out of scope and is rejected by the newly reviewed first-last/omni contracts.

All18 Seedance2.5 Spicy fixed suffix IDs remain outside reviewed/canonical execution:
6 V2V + 3 T2V + 9 I2V. A narrow canonical guard closes previous generic T2V/I2V
eligibility for those12 ambiguous IDs; upstream catalog/Studio access is not removed.
No Standard/Intl fixed-profile clarification or automatic admission is attempted.

### Fast/speed-oriented variant policy

Fast/Turbo/Draft/Mini variants are **not** prioritized merely for latency. Prefer
slower executors when comparable quality/features and lower cost or no production
need for speed make them preferable. A speed-oriented option needs evidenced cost,
quality, controls, limits, reliability or input/output value beyond speed to merit
reviewed coverage. Existing upstream Fast choices are not removed or newly bound.

Inspection found a real non-speed difference for seedance-v1.5-pro-video-extend-fast:
OpenAPI permits720p/1080p, versus Standard480p/720p; local source currently shares
the Standard resolution definition with Fast. That is a possible resolution advantage
and a separate parity issue, **not** proof of better quality/cost/reliability.
Fast remains unbound/out of this wave; no automatic exception was taken.

MMAudio remains parked, strategically important and subject to mandatory future
revisit when first-party result/audio-treatment semantics become coherent. Depth,
Suno, Qwen, alternate Kling, Dance, Happy Horse and specialized routes are untouched.

### Evidence and QA boundary

Public GETs only: one current OpenAPI snapshot and exact model-detail records for
all13 requested IDs plus Seedance1.5 Fast. Every exact request path was found; no
authentication, estimates, uploads or jobs. Current generation OpenAPI's draft fields
are new optional lifecycle information, not permission to widen this wave. Accepted
contracts reuse source metadata where adequate; unresolved fields stay unavailable.
Schemas describe requested behavior, not measured media, output fidelity or account
availability. All execution tests are mocked. No UI components, dependencies,
packaging, project schema, providers, uploader or poller are added/replaced.
