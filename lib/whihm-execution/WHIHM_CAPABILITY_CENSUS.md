# WHIHM capability census: local application, current hosted application, canonical execution

## Inspection and outcome

**PARTIAL — public application census complete; authenticated/backend behavior remains unverified.**
Inspected 2026-10-25; final research timestamp approximately 20:20 UTC.
Local baseline: `27c5119fb13177d74789a00c01eb19fff7c41585`.
Open Generative AI (`Anil-matcha/Open-Generative-AI`) remains the foundation.
This document adds no implementation or executor admission.

The actual current public application is [MuAPI Open Generative AI](https://muapi.ai/open-generative-ai),
identified by this checkout's `README.md`. The legacy `open-generative-ai.com`
failed DNS resolution in this inspection; it was **not** used as evidence that the
hosted product is unavailable. The supported MuAPI-hosted app loaded and hydrated.

**Main finding, CONFIRMED:** the hosted application bundle contains the same **587
ordered catalog entries / 582 distinct logical model IDs** as local Studio data.
All nine local catalog arrays matched the public bundle's ID sequence and length,
not just a search for a few familiar models. No newer web-only model ID was found
in that inspected application surface. This is not a claim about private, gated,
white-label or future deployments, or every model on MuAPI.

The interfaces and execution correctness differ. Web navigation exposes more
Studios than the current Electron shell; most already exist in local shared
source. Conversely, local Recast/Motion Control/V2V safety fixes are newer than
corresponding public bundle behavior. Do not overwrite them while backporting UI.

Astra currently has **nine remote canonical modes**, not a canonical workflow or
agent executor. A static successful model lookup means a route can be planned;
it is not certification that every model-specific control is preserved. The
23 reviewed V2V models, three Recast aliases and two admitted Motion Control
models have explicit feature contracts. Broad image/video/audio/lip-sync catalogs
need more selective eligibility than a blanket “all models safe” claim.

## Evidence, methodology and limits

Evidence labels: **CONFIRMED** = source/DOM/public data inspected; **INFERRED** =
architectural conclusion; **UNVERIFIED** = hidden execution, output fidelity,
authenticated state or unsupported contract assumptions. A confirmed catalog
advertisement is not a confirmed successful generation.

Established evidence was reused, including its limitations and historical dates:
[creative reuse audit](CREATIVE_CAPABILITY_REUSE_AUDIT.md),
[MuAPI media audit](MUAPI_MEDIA_CAPABILITY_AUDIT.md),
[current bounded V2V review](V2V_CONTRACT_REVIEW.md), and
[bridge and host documentation](WHIHM_EXECUTION_BRIDGE.md).
The creative audit's old statements that Recast/Motion/V2V are unbound are
superseded by current code; the earlier provider-wide 788-model count is **not**
the application catalog count.

| Evidence | Inspected source / method |
| --- | --- |
| L1 local navigation | `src/main.js`, `src/components/Header.js`; `components/StandaloneShell.js` for the separate Next/shared shell |
| L2 local catalogs | `packages/studio/src/models.js`, `seedanceModels.js`, `videoWorkflows.js`, `modelCapabilities.js`, `videoToolCapabilities.js`, `modelParameters.js`, `videoMediaInputs.js`, `imageInputContracts.js` |
| L3 shared services | `packages/studio/src/muapi.js`; `utils/generationLifecycle.js`; comparison with `src/lib/muapi.js` |
| L4 canonical routes | `lib/whihm-execution/runtime.mjs`, `bridge.mjs`, `readiness.mjs`, `host.mjs`; `src/lib/whihmHostRuntime.mjs`; fixed Electron host/preload |
| L5 reviewed contracts | `recastInputContracts.js`, `motionControlInputContracts.js`, `v2vInputContracts.js`; existing execution, Wave 1–3, host and readiness tests, inspected as source, not rerun |
| L6 local execution | `src/lib/localModels.js`, `localInferenceClient.js`; `electron/lib/localInference.js`, `localInferenceRuntime.js`, `localInferenceAssets.js`, `localInferencePaths.js`, `wan2gpProvider.js`, `wan2gpMcp.js`, `wan2gpLocal.js`, `wan2gpModelAvailability.js` |
| L7 higher-level tools | shared Studio components; desktop Workflow/Agent wrappers; `packages/Vibe-Workflow/packages/workflow-builder/src/components/utility.jsx`, `NodeFlow.jsx`, `NodesNavbar.jsx`; Design Agent submodule |
| W1 actual live UI | Public browser, fresh isolated context, English navigation and non-generating selectors. Image, Video, Audio, Clipping, Vibe Motion, Lip Sync, Body Swap, Cinema, Marketing, Workflows, Agents, Design Agent, Apps, MCP & CLI visited. No sign-in or API key entered |
| W2 loaded public application metadata | [actual loaded catalog/service chunk](https://muapi.ai/_next/static/chunks/65183.ad142852a359c445.js), static literal AST inspection, not execution of downloaded code. SHA256 `ad142852a359c445d895e233960cf27d3aa130417b3e72f025c4909930630e72` |
| W3 model grouping | [actual loaded video grouping chunk](https://muapi.ai/_next/static/chunks/77074.29959c26966e8ff5.js); live Video model selector groups models/providers/workflows |

Read-only browser navigation and public HTML/JS GETs were used. Normal anonymous
web bootstrap made `GET /api/app/user_details`; its account response was not
inspected or saved. Public workflow listings rendered, including product showcase,
virtual try-on, interior design and character-story recipes; no workflow was opened
for execution. Research artifacts remained under `/tmp`, outside the repository.
No provider-wide rediscovery, estimates, POST generation, uploads, agent messages,
application-key lookup, model/output-media downloads, installation or inference occurred.
Normal public UI preview images and JavaScript loaded as part of browser inspection.
No quality/performance claim was inferred from a successful page render.

Static bundle inventories are **deployment evidence**, not a guarantee every
catalog variant is a distinct selector button or enabled account entitlement.
The Image selector combines T2I/I2I choices; Video groups profiles and workflow
modes. Actual returned media, dimensions/duration and provider account permissions
were not tested. Design Agent explicitly required sign-in; private agent lists,
conversations and user projects were not accessed.

## Counting rules and results

A meaningful capability is an optional creative intent in the table below.
Resolution variants, provider alternatives, Cinema/Marketing/Influencer recipes,
and repeated workflow compositions do not create new intent counts. Performance
transfer and recast are separate intents (two-video performance vs identity-image
recast) even where they share a model family. Local/offline generation is counted
as a **platform execution capability**, not a second creative image/video intent.
Settings, history, uploads, downloads and Apps directory cards are not generators.
Analysis and assembly names in sparse catalogs remain advertised/unverified.

`FULL` below means **FULLY_ASTRA_EXECUTABLE for the cited bounded/basic intent**:
a canonical path and required input mapping exist. It never means every alternative,
control or account works. `PARTIAL` means PARTIALLY_ASTRA_EXECUTABLE: generic route
exists but significant contract, array-asset, nested-input or option parity limits
remain. `UNBOUND` means BASE_APP_LOCAL_ONLY / DEFERRED_CONTRACT / UI_ONLY as detailed.
This is an audit classification, not a new runtime allowlist.

| Measure | Result / exactness |
| --- | --- |
| Local meaningful advertised creative capabilities | **53** intents, enumerated below; not all verified execution |
| Current web meaningful capability inventory | **At least 51** same advertised intents in current DOM/catalog; **32** directly evidenced by inspected Studio UI/selector. Two workflow-only analysis/assembly intents reuse prior evidence and are excluded from the fresh minimum |
| Local remote Studio model catalogs | **587** route/catalog rows, **582** unique logical IDs, **571** distinct declared endpoint strings |
| Workflow-builder declarations outside Studio IDs | **19** additional static IDs (aliases, utility/input/text tools and API-node connectors), listed below. These are not 19 verified generation endpoints |
| Additional concrete Studio service endpoints outside those catalogs | **3**: `ai-clipping`, `motion-graphics`, `motion-graphics-edit`; hence **574** confirmed Studio endpoint identities, not counting arbitrary workflow/agent definitions |
| Current hosted catalog | **587** ordered entries / **582** distinct model IDs confirmed in loaded app. Same ID inventory. **23** Audio model choices directly enumerated in DOM; an exact count of separately visible buttons across all grouped/conditional selectors is unavailable |
| Current web endpoint count | At least **494** distinct explicit nonempty endpoint strings in literal bundle objects; remaining selectors use ID/family mapping. Local 571 is not silently relabeled as a freshly verified web wire-endpoint count |
| Astra fully executable capability scope | **24** bounded/basic intents (FULL rows); per-model caveats still apply |
| Astra partially executable capability scope | **17** intents (PARTIAL rows) |
| No canonical creative operation | **12** intents (UNBOUND rows) |
| Exact remote bridge eligibility | **533** mode/model pairs; **530** distinct logical IDs; **521** distinct endpoint strings. This is structural eligibility, **not 521 fully contract-certified executors** |
| Explicit reviewed specialized/model-specific subset | **28** route/model pairs: **23 V2V + 3 Recast + 2 Motion Control**; 28 distinct wire endpoints for these pairs |
| Local model configurations | **13** (6 sd.cpp + 7 Wan2GP); conditionally routable, zero installed/probed models verified during this census |
| Web-only capability / executor / control additions | **0 / 0 / 0 confirmed** versus all local shared source; not a proof about sign-in-only/private functionality |
| Deferred/unreviewed V2V entries | **48**: D31 + I17; separately 4 V2V entries prefer specialized routes. 23 reviewed + 48 unresolved + 4 specialized = 75 |
| Other unadmitted specialized entries | **2** Seedance Intl/Spicy Motion Control IDs; these are not covered by admitting base profiles |
| Specialized canonical modes | **3**: recast, motion_control, lipsync; **20** eligible route/model pairs across them (3+2+15), of unequal validation depth |
| Distinct specialized creative intents | **5**: RECAST_CHARACTER, TRANSFER_PERFORMANCE, TRANSFER_MOTION, SWAP_VIDEO_OBJECT_APPEARANCE, LIP_SYNC; overlapping executors are not added twice |
| Local-only platform capabilities | **2**: configured local image generation and local video generation; **13** configurations, not 13 new creative intents |

The 521 endpoint figure is computed from actual `findRemote(id, explicitMode)`
results against current catalogs, not by assuming all 75 V2V entries are allowed.
The 13 local configurations are reported separately because runtime readiness can
be UNVERIFIED and Wan2GP may use a configured remote MCP server. No exact count of
all “fully safe” generic models can honestly be certified without their individual
contract reviews; **28** is the exact explicitly reviewed feature-contract subset,
while the table records bounded intent usability for the other existing paths.

## Three-way semantic inventory / proposed Astra vocabulary

Web evidence: **UI** = current inspected interface/selector; **CAT** = current
loaded application catalog/service advertisement, specific selector reachability
or account execution may be unverified; **PRIOR** = established workflow evidence,
not freshly verified live; **GATED** = visible surface, authenticated behavior
unverified. Every local executor row below is CONFIRMED source presence; it does
not upgrade sparse provider contracts. Exact per-route IDs follow in the appendix.

| Creative intent | Local implementation / representative exact IDs | Actual canonical route / gap | Astra scope | Current web |
| --- | --- | --- | --- | --- |
| GENERATE_IMAGE | nano-banana; Flux, Imagen, Seedream, GPT families | t2i | FULL | UI |
| EDIT_IMAGE | nano-banana-edit; GPT/Qwen/Seedream edit families | i2i | FULL | UI |
| REFERENCE_GUIDED_IMAGE | flux-pulid, flux-redux; multi-reference image editors | t2i/i2i | PARTIAL | UI |
| SWAP_IMAGE_FACE | ai-image-face-swap | i2i | FULL | UI |
| TRY_ON_GARMENT | ai-dress-change | i2i | FULL | UI |
| GENERATE_PRODUCT_IMAGE | ai-product-shot, ai-product-photography | i2i | FULL | UI |
| UPSCALE_IMAGE | ai-image-upscale, seedvr2-image-upscale, topaz-image-upscale | i2i | FULL | UI |
| ENHANCE_IMAGE | topaz-upscale-image-creative/generative/precision; skin enhancer | i2i | PARTIAL | UI |
| REMOVE_IMAGE_BACKGROUND | ai-background-remover | i2i | FULL | UI |
| REMOVE_IMAGE_OBJECT | ai-object-eraser (source + mask) | i2i | FULL | UI |
| EXPAND_IMAGE | ai-image-extension; Ideogram reframe | i2i | FULL | UI |
| APPLY_IMAGE_WATERMARK | add-image-watermark (source + watermark) | i2i | FULL | UI |
| DECOMPOSE_IMAGE | bytedance-seedream-5.0-pro-layer; seedream-5.0-flash-layerize | i2i; decomposeLayers wrapper | PARTIAL | UI |
| CHANGE_IMAGE_EXPRESSION_POSE | face-expression-change; Qwen edit angle controls | i2i | PARTIAL | UI |
| GENERATE_VIDEO | seedance-lite-t2v; Kling, Veo, Wan, Sora, Flux/Gemini families | t2v | FULL | UI |
| ANIMATE_IMAGE | seedance-lite-i2v and current I2V families | i2v | FULL | UI |
| REFERENCE_GUIDED_VIDEO | Seedance Omni/reference, Kling Omni, Vidu reference families | i2v (some t2v) | PARTIAL | CAT |
| CONTROL_VIDEO_KEYFRAMES | first/last-frame I2V variants in seedanceModels/videoWorkflows | i2v | PARTIAL | CAT |
| EDIT_VIDEO | runway-aleph-v2v; reviewed Seedance/Wan/Kling/Gemini editors | v2v | FULL | CAT |
| EXTEND_VIDEO | seedance-2.5-video-extend; wan2.7-video-extend; flux-3-video-extend/draft | v2v | FULL | CAT |
| UPSCALE_VIDEO | ai-video-upscaler, topaz-video-upscale | v2v | FULL | CAT |
| ENHANCE_VIDEO | flux-3-video-upscaler; topaz-upscale-video-creative/generative/precision | v2v | FULL | CAT |
| REMOVE_VIDEO_BACKGROUND | video-background-remover | v2v | FULL | CAT |
| SWAP_VIDEO_FACE | ai-video-face-swap | v2v | FULL | CAT |
| RECAST_CHARACTER | kling-v3.0-pro-recast; runway-act-two-recast; wan2.2-animate-recast | recast | FULL | UI |
| TRANSFER_PERFORMANCE | runway-act-two-v2v (two videos); Act Two Recast (image + driver) | v2v/recast | FULL | CAT |
| TRANSFER_MOTION | seedance-2.5-motion-control; seedance-2-motion-control; Kling Recast | motion_control/recast | FULL | CAT |
| SWAP_VIDEO_OBJECT_APPEARANCE | Seedance objects_swap; reviewed prompt/reference V2V editors | motion_control/v2v | FULL | CAT |
| LIP_SYNC | 15 current catalog entries, including InfiniteTalk and Kling avatar | lipsync | PARTIAL | UI |
| TRANSLATE_VIDEO | heygen-video-translate | v2v | FULL | CAT |
| CLIP_HIGHLIGHTS | ai-clipping via runClipping | no canonical route | UNBOUND | UI |
| REFRAME_VIDEO | luma-flash-reframe; clipping aspect control | deferred v2v / Studio service | UNBOUND | CAT |
| APPLY_VIDEO_WATERMARK | add-video-watermark | unreviewed v2v | UNBOUND | CAT |
| REMOVE_VIDEO_WATERMARK | video-watermark-remover; Seedance removal variants | unreviewed v2v | UNBOUND | CAT |
| CAPTION_VIDEO | ai-captions | unreviewed v2v | UNBOUND | CAT |
| CREATE_REVISE_MOTION_GRAPHICS | motion-graphics; motion-graphics-edit (prior request ID) | Studio services only | UNBOUND | UI |
| GENERATE_MUSIC | suno-create-music; minimax-music-3.0; lyria-3-pro/3/2 | audio | FULL | UI |
| REMIX_MUSIC | suno-remix-music | audio | PARTIAL | UI |
| EXTEND_MUSIC | suno-extend-music | audio | PARTIAL | UI |
| MASHUP_MUSIC | suno-generate-mashup | audio | PARTIAL | UI |
| ADD_VOCALS | suno-add-vocals | audio | PARTIAL | UI |
| ADD_INSTRUMENTAL | suno-add-instrumental | audio | PARTIAL | UI |
| GENERATE_SOUND | suno-generate-sounds; mmaudio-v2-text-to-audio | audio | PARTIAL | UI |
| SYNTHESIZE_SPEECH | MiniMax Speech; ElevenLabs; Fish; Gemini TTS | audio | PARTIAL | UI |
| SYNTHESIZE_DIALOGUE | elevenlabs-text-to-dialogue-v3; Gemini multi-speaker TTS | audio | PARTIAL | UI |
| CLONE_VOICE | suno-voice-clone; minimax-voice-clone | audio | PARTIAL | UI |
| CONVERT_SUNO_WAV | suno-convert-to-wav (task_id + audio_id) | audio | PARTIAL | UI |
| GENERATE_VIDEO_SOUND | mmaudio-v2-video-to-video | unreviewed v2v | UNBOUND | CAT |
| ESTIMATE_DEPTH | depth-anything | unreviewed v2v | UNBOUND | CAT |
| DESCRIBE_MEDIA | workflow any-llm/openrouter-vision/gpt-5-nano and image-captioning template | workflow tools, no canonical analysis route | UNBOUND | PRIOR |
| ASSEMBLE_CLIPS | workflow video-combiner | workflow utility, no installed canonical utility | UNBOUND | PRIOR |
| RUN_REMOTE_WORKFLOW | executeWorkflow / runSingleNode + existing Workflow Studio | no canonical workflow executor | UNBOUND | UI |
| RUN_AGENT | agent discovery/chat/polling; Design Agent CreativeCanvas variant | no canonical agent executor | UNBOUND | GATED |

Unsupported/non-counted requests: standalone vocal/instrumental **separation**,
standalone transcription, OCR, measured audio analysis, waveform/beat extraction,
exact clip trim, arbitrary timeline render and general codec conversion are not
promoted to app capabilities merely because an external provider/tool can do them.
The previous provider audit contains Whisper and separation evidence; it does not
establish an exposed local Studio or canonical binding. AI transcription/captions
and deterministic mux/export remain different intents.

## Studio and tool reconciliation

“Local shared” means code available under `packages/studio`, **not** necessarily
mounted in the Vite desktop shell. The checked-out Next `StandaloneShell` has 16
Studio tabs; Electron's `Header` has seven principal destinations plus Settings /
Local Models. The current hosted navbar has 14 creative/developer destinations.

| Area | Local shared / desktop | Current hosted observation | Astra / delta |
| --- | --- | --- | --- |
| Image | `ImageStudio.jsx`; desktop `src/components/ImageStudio.js` | Image, T2I/I2I filter, provider/model picker, prompt, references, drawing, aspect/count | Existing t2i/i2i; FUNCTIONALLY_EQUIVALENT catalog. Desktop controls/client are not complete shared parity |
| Video | `VideoStudio.jsx`, videoWorkflows/grouping; desktop Video | Grouped model/provider selector; From prompt workflow, duration/resolution/aspect controls | t2v/i2v plus reviewed v2v; same catalog IDs; do not count each profile as new intent |
| Audio | `AudioStudio.jsx`; no dedicated desktop tab | 23-model dropdown including Suno, MiniMax, Gemini/Eleven/Fish/Lyria; model-specific form | Generic audio route exists; mostly partial contract assurance. Desktop UI difference, not absent local service |
| AI Clipping | `ClippingStudio.jsx`; no desktop mount | Source clip, highlight count, aspect, Coordinates Only | `runClipping`; no canonical route; local reuse candidate, not web backport |
| Motion Control | `MotionControlStudio.jsx`; no desktop mount | Not in navbar; `/motion-control` rendered Image fallback, not Motion Control | Two canonical base profiles available nonvisually. LOCAL_ONLY Studio exposure in checked-out shared shell; hosted metadata still contains all four IDs |
| Vibe Motion | `VibeMotionStudio.jsx`; no desktop mount | Generate/Edit tabs, aspect, duration | `runMotionGraphics`/Edit exist; no canonical mode. FUNCTIONALLY_EQUIVALENT |
| Lip Sync | `LipSyncStudio.jsx`; desktop mount | Portrait Image/Video source modes, Infinite Talk selector, resolution | lipsync exists; shared payload supports only a subset of all catalog controls |
| Body Swap | `RecastStudio.jsx`; no dedicated desktop tab | Kling selector, target/source controls, orientation and Library | canonical recast works through shared service; hosted contract lags local fixes |
| Cinema | `CinemaStudio.jsx`; desktop Cinema | Prompt, camera/lens/aperture, aspect/quality | Recipe over nano-banana-pro/edit, not separate physical camera executor or video renderer |
| Marketing | `MarketingStudio.jsx`; no desktop mount | UGC/product-ad shell, avatar, aspect/resolution/duration | Seedance reference recipe; inputs overlap existing generators. Dedicated wrapper not a canonical mode |
| Layers | `LayersStudio.jsx`; no desktop mount | No navbar entry; `/layers` rendered Image fallback | Local composite editor exists; decomposition model IDs present in hosted Image picker; unique editor exposure LOCAL_ONLY, primitive not proven absent remotely |
| AI Influencer | `AiInfluencerStudio.jsx`; no desktop mount | No navbar entry; `/ai-influencer` rendered Image fallback | Local nano-banana-pro prompting recipe; no new trained-identity engine inferred |
| Workflows | Real shared `WorkflowStudio`/`WorkflowUI` + Vibe-Workflow; desktop `DesktopWorkflowStudio.jsx` wrapper | Public template/published recipe list rendered | Existing remote workflow services/UI, no canonical workflow executor; not the old placeholder |
| Agents | Shared `AgentStudio.jsx`; desktop `DesktopAgentStudio.jsx` wrapper | Templates/My Agents/My Chats/Create visible; private data not inspected | Existing chat/request-ID polling; no canonical agent mode. WEB_CAPABILITY_VISIBLE_BUT_UNVERIFIED for private execution |
| Design Agent | `DesignAgentStudio.jsx` → `design-agent` CreativeCanvas submodule; no desktop mount | Access Creative Agent / Sign in to Continue | WEB_CAPABILITY_VISIBLE_BUT_UNVERIFIED; no canonical CreativeCanvas executor |
| Apps | `AppsStudio.jsx` directory / interest registration | Many GitHub/Demo cards incl. portrait, try-on and business apps | UI_ONLY / discovery links, not proof of integrated executable engines; do not count each card |
| MCP & CLI | `McpCliStudio.jsx`, desktop mount; provider-linked integrations | Setup/docs for CLI, hosted MCP and skills | Discovery/control alternatives, not canonical modes; displayed “19 tools/100+ models” copy is not a fresh discovery count |
| Local Models / Settings | Desktop settings; static local catalog, existing sd.cpp/Wan2GP managers | No hosted local-model manager observed | LOCAL_ONLY_EXECUTION; no web-to-local packaging recommendation |
| Upload/history/gallery/library | Studio pickers/state; upstream upload/history/download services; WHIHM project registry | Draw/reference input and Body Swap Library visible; empty unauthenticated generation state | Infrastructure, not extra generators. Browser history is not project integrity or a canonical workflow output registry |

## Current web app delta vs local repository

| Observed difference | Classification | Exact local implementation / effect | Backport value / confidence |
| --- | --- | --- | --- |
| Audio, Clipping, Vibe Motion, Body Swap, Marketing, Design Agent, Apps visible in web navbar but not Electron's main seven | WEB_UI_ONLY_DIFFERENCE | All have local shared components/services already; import/adapt rather than fetch/copy hosted pages | Product-specific UI choice; no backport needed for nonvisual Astra. CONFIRMED |
| Motion Control, Layers, AI Influencer local shared tabs absent in hosted navbar; direct candidate paths fall back to Image | LOCAL_ONLY | Actual source/mount difference, not proof provider lacks their primitives | Keep local implementation. CONFIRMED exposure; hidden hosted alternatives UNVERIFIED |
| All nine current catalog arrays have identical ID sequences | FUNCTIONALLY_EQUIVALENT | 84/88/111/184/75/23/15/3/4 entries respectively | No demonstrated WEB_ONLY_NEW_EXECUTOR. CONFIRMED |
| Act Two Recast web catalog uses videoField=video_url and deployed Recast builder uses that field | LOCAL_ONLY correctness fix | Local uses reference_video_url; I2V metadata also explicitly requires driver locally | Do not import older hosted mapping. CONFIRMED static code, no job run |
| Hosted Recast request builder omits Wan mode and original-sound option; local explicit contract supports them | LOCAL_ONLY control/correctness fix | Local Wan animate/replace; supported Kling keep_original_sound validated | Preserve local fix. No claim provider execution verified |
| Hosted Motion Control builder defaults unknown modes, clamps duration and slices images; local rejects invalid intent/count/range | LOCAL_ONLY correctness fix | Local explicit 2-profile contract and 1–30 / 1–9 reference limits | Preserve local validation. CONFIRMED deployed function text |
| Hosted Topaz video definitions still expose inputs.model; local names it topaz_model → wire model | LOCAL_ONLY control/correctness fix | Canonical executor ID cannot collide with provider engine locally | Preserve Wave 3; not a newer hosted control. CONFIRMED |
| Image Flux PuLID/Redux primary input and video/lip-sync raw schema differences | INSUFFICIENT_EVIDENCE | Local models include post-import contract/capability overrides, so raw literal schema inequality does not prove a new product feature | Do not count raw-field differences as new web controls |
| Hosted user workflows, agents, Design Agent behind identity/key-dependent state | INSUFFICIENT_EVIDENCE | Local clients/packages exist; private deployment differences unavailable without authentication | No speculative private-source parity or backport proposal |

**Confirmed new web-only capabilities, executors and controls: zero.** This is a
bounded current-app result, not an assertion that web can never be newer. The
hosted UI is broader than Electron, while some local WHIHM/base-service repairs
are ahead of the hosted bundle. Neither side is uniformly newer.

## Exact execution routes, safety and parity

`executor.type=remote-model`, `provider=muapi`, exact `executor.model`, and
`metadata.oga.mode` select these existing shared methods. An explicit mode avoids
ambiguous duplicated IDs. The model vendor is not a second provider transport.

| Canonical mode | Existing authoritative service | Eligible entries | Contract / parity |
| --- | --- | --- | --- |
| t2i | studio.generateImage | 84 | imageInputContracts + schema/capability checks; basic Nano Banana tested in existing fixtures; not every advanced model audited |
| i2i | studio.generateI2I | 88 | primary/auxiliary image contracts; mask/garment/watermark roles. Older desktop Image mapping remains narrower |
| t2v | studio.generateVideo | 111 | catalog/supplemental mapping; bridge requires prompt even where a continuation endpoint may use another input. No blanket advanced-profile safety |
| i2v | studio.generateI2V | 184 | application now delegates to shared I2V; Act Two driver fixed; complex reference arrays still need project-binding review |
| audio | studio.generateAudio | 23 | canonical endpoint goes through _modelId; parameters.model is Suno engine/version. Broad parameter forwarding, no dedicated nested audio contract layer |
| lipsync | studio.processLipSync | 15 | source image/video + audio and limited prompt/resolution/seed forwarding; many catalog entries lack required-role metadata |
| recast | studio.processRecast | 3 | explicit per-backend contract; app delegates; image + driving video; Wan mode, Kling controls, Act Two field mapping |
| motion_control | studio.processMotionControl | 2 | explicit modes + limits; app delegates; image-array order preserved. Intl/Spicy remain unbound |
| v2v | studio.processV2V | 23 | reviewed exact allowlist, per-model fields/ranges, no raw payload. App delegates; all Waves 1–3 retained |
| local-ai | localAI.generate → window.localAI → existing Electron provider | 13 configured definitions | no remote auth; installed runtime/models and supported input roles remain conditional |
| utility | host-supplied matching tool + validate/run | **0 built-in media tools** | extension point only; no generic ffmpeg/assembly executor installed |
| workflow / agent | none in canonical route map | **0** | remote OGA services exist but must not be advertised as canonical execution routes |

All remote canonical routes reuse existing upload/submission/prediction polling /
result normalization. `plan()` validates without key lookup, upload or provider
transport. Plans are single-node operations; upstream values must be resolved by
caller. There is **no DAG scheduler**, no automatic model substitution, and no
execution just because readiness is READY.

Project assets: validated handles and registered asset IDs resolve through existing
project integrity/path checks. Absolute file paths are transient inside trusted
host; renderer receives bytes to create a File for the existing uploader. Plans
contain logical/project-relative references. Scalar asset roles work throughout;
**array asset bindings are explicitly limited to reviewed V2V media-array fields
and Motion Control images_list**. Generic I2I/I2V reference arrays and audio mashup
arrays do not currently get the same project-asset-array path. Already-resolved
URLs are different from robust registered-project array support.

Authorization: bridge execution and fixed host executeNode require explicit
allowExecution. Readiness/approval/budget assessment is a **separate** fixed host
operation; inspection does not show executeNode automatically re-assessing and
enforcing the whole readiness/budget report. Future Astra must not equate route
eligibility or a previous READY report with fresh approval to spend. Production
state dependency scopes and quotes remain authoritative in their own APIs.

Host evidence: resolveExecutionBinding proves a static route, not media duration,
provider entitlement, content acceptability or a working GPU. Local snapshots can
remain UNVERIFIED. Readiness does not replace detailed plan input validation.
Electron retains contextIsolation=true, nodeIntegration=false, webSecurity=true;
no security or runtime setting changed in this census. Packaging still omits some
WHIHM source for packaged distributions per the existing bridge docs; source-app
availability does not certify a portable packaged release.

## Audio census and proposed Audio Wave 1 scope

**Audio Wave 1 update (2026-10-26):** the original census/counts below remain a
2026-10-25 snapshot. The subsequent [reviewed audio contracts](WHIHM_EXECUTION_BRIDGE.md#audio-wave-1--reviewed-shared-contracts-2026-10-26)
admit 22 of these 23 models with ordered project audio arrays and nested dialogue
validation; Suno multi-step cloning is now explicitly deferred from canonical
execution. The old generic/partial audio assessments below are historical.

All **23** local Audio IDs are also in the hosted catalog and were individually
visible in its dropdown. There is **no confirmed web-only audio addition** to
backport. The absence of a desktop Audio tab does not mean audio execution is
missing: the audio canonical mode calls shared generateAudio.

| Intent | Exact catalog/service evidence | WHIHM status / required evidence |
| --- | --- | --- |
| Music / instrumental generation | suno-create-music; minimax-music-3.0; lyria-3-pro, lyria-3, lyria-2 | Basic Suno route/version separation tested; other model-specific fields not individually certified |
| Remix | suno-remix-music: audio_url + style | Generic audio route; scoped required nonempty audio/style and media preservation need focused contract review |
| Extend | suno-extend-music: prompt + audio_url + style | Generic audio route; continuation semantics should be explicit, not a video extension fallback |
| Mashup | suno-generate-mashup: audios_list | Generic route but required-array check can exempt missing arrays; ordered project audio-array bindings are unsupported outside reviewed routes. PARTIAL |
| Add vocals | suno-add-vocals: prompt/title/style/audio_url | Existing service; not extraction of an existing vocal stem |
| Add instrumental | suno-add-instrumental: title/tags/audio_url | Existing service; not instrumental stem isolation |
| Voice clone | suno-voice-clone; minimax-voice-clone | Route present; Suno describes two-step random-phrase/liveness flow. A single generic request is not a verified end-to-end clone workflow |
| Speech | minimax-speech-2.6-hd/turbo; elevenlabs-tts-turbo-2-5; elevenlabs-v4; fish-s2-1-pro | Generic audio route; preserve voice IDs/settings only within verified model contract. No live voices sampled |
| Dialogue | elevenlabs-text-to-dialogue-v3; gemini-3-1-flash-tts; gemini-2-5-pro-tts | Required nested dialogue/speakers/turns need per-model validation; generic bridge validates top-level type but not all nested required properties |
| Effects / text sound | suno-generate-sounds; mmaudio-v2-text-to-audio → mmaudio-v2/text-to-audio | Route exists; do not turn the app's MMAudio narration marketing copy into a guarantee of speech behavior |
| Video-conditioned sound | mmaudio-v2-video-to-video → mmaudio-v2/video-to-video | V2V I/insufficient-evidence entry, not canonically admitted |
| WAV conversion | suno-convert-to-wav: task_id + audio_id | Only an existing Suno track, not general URL-to-WAV conversion; generic audio route still needs focused task binding/result proof |
| Transcription / vocal or instrumental isolation | Provider audit evidence, no dedicated current Audio catalog entry | Not a canonical audio binding; no new web-only claim. Whisper is not among these 23 choices |
| Captions / translation / lip sync | ai-captions; heygen-video-translate; processLipSync | Captions unreviewed; translation bound v2v; lipsync partial generic contract; do not collapse these into one speech executor |
| Audio-conditioned video / generated audio with video | Wan I2V audio fields, Seedance references, generate_audio on specific models | Model-specific i2v/v2v/motion controls, not automatically the audio route. Motion Control supports generate_audio, not arbitrary audio reference URLs |
| Waveform / beat / measured sync / audio conversion utilities | No new exposed standalone tool found in inspected app | Prior finishing audit remains applicable; no inference from arbitrary agents/workflow composition |

An **Audio Wave 1**, if required by a concrete production, should wrap the existing
shared generateAudio with narrowly reviewed music/remix/extend/mashup and nested
TTS contracts, including ordered project audio assets. It should not introduce a
new music client or pretend the current 23 generic matches are fully validated.

## Image census

**Advanced Image Contracts update (2026-10-26):** the historical table/counts above
are unchanged. [Reviewed advanced image contracts](WHIHM_EXECUTION_BRIDGE.md#advanced-image-contracts--2026-10-26)
now cover 15 model IDs: scoped reference guidance and enhancement, ordered/mixed
project reference arrays, separate Topaz engine identity, layer-list preservation
and validated view controls. Rich editable-layer semantics and broad expression/
body pose remain partial; Qwen image-edit-plus-lora view execution is deferred
because current OpenAPI disagrees with its local angle metadata.

Local and hosted catalog IDs match: **84 T2I / 88 I2I rows**. Hosted Image visibly
combines text/image modes, vendor filters and variants (Seedream, Qwen, Gemini,
Nano Banana, Flux, GPT, Ideogram, Grok, Midjourney, Topaz, Krea, Wan and specialist
tools). Exact IDs and endpoint aliases are in the appendix; model-brand abundance
is not extra creative-intent count.

Reference/identity/style input is not universally optional: PuLID/Redux contracts
need a primary image even from their t2i route. Garment, mask and watermark are
separate auxiliary roles, not extra undifferentiated references. Product shot maps
prompt to scene_description through the existing shared contract. Generic multi-
reference URL handling does not establish ordered project-asset array support.

Local shared and older desktop Image service paths still differ. Astra's host uses
shared service and does not inherit every old desktop truncation, but projection
must expose supported roles instead of inferring parity from an Image selector.
Topaz **image** provider model controls still need review independently of the
completed Topaz **video** collision repair; do not advertise engine selection there
without checking it. Layer decomposition has a dedicated images-result wrapper;
an eligible I2I model is not proof that generic normalized outputs preserve editable
layer semantics, masks, names or ordering. Layers UI canvas grading/download is not
a general deterministic renderer.

Object/background removal, image extension and watermark application have real
source implementations. Generic still editing can request replacement/restyling,
but exact identity, product geometry, pixel masking and environment preservation
are not guarantees. Image watermark **removal** was not established as a separate
local primitive simply by seeing an Apps card or object eraser.

## Video census and specialized route reconciliation

Current **111 T2V / 184 I2V / 75 V2V** entries are present in both local catalogs
and hosted bundle. Grouping profiles collapses those into meaningful generation,
reference animation, edit, extend, motion, recast and enhancement intents. Exact
IDs are not interchangeable simply because the UI displays one family name.

The existing review remains authoritative: **23 V2V admitted**, D31/I17 unadmitted,
S4 routed only by a separately selected specialized mode. V2V never silently
reroutes. Six Seedance fixed-resolution suffix variants still have conflicting
provider metadata; no fresh verification or relaxation occurred in this census.

- **Recast:** Kling alias → kling-v3.0-pro-motion-control; Act Two alias → runway-act-two-i2v; Wan alias → wan2.2-animate. Local Act Two maps driver to reference_video_url; Wan animate/replace explicit/default animate. No preservation guarantee inferred.
- **Motion Control:** base Seedance 2.5/2.0 only; motion_transfer and objects_swap; 1–30 / 1–9 ordered images, duration 4–30 / 4–15 integer seconds; supported per-model quality/bitrate/seed/audio-generation controls. Intent prompts are not exact camera/background promises.
- **V2V edits:** Aleph/Wan/Seedance/Kling/Gemini model-specific required media. Seedance 2.0 video_urls currently **exactly one** source under verified contract; array semantics do not mean arbitrary multi-clip editing.
- **Enhance/upscale:** reviewed simple upscalers and AI Flux/Topaz reconstruction remain distinct. Topaz topaz_model is a provider engine, not the canonical executor ID; plans preserve both.
- **Lip sync:** 15 catalog choices resolve, but service forwards only audio_url/image_url/video_url, optional prompt/resolution/seed. Additional alignment/vocal/scene controls in provider/catalog metadata do not automatically survive that service. Missing required-role metadata is a real safety-review gap, not a task to fix here.
- **Audio/video interaction:** HeyGen translation is a bound V2V model. MMAudio/captions/clipping and unreviewed motion/reframe families are not made safe by neighboring bindings.
- **Cinema/Marketing:** cinematic image prompting and Seedance product-reference recipes are reusable shells, not additional deterministic assembly/export tools.

Precise media duration/size/codec constraints cannot be verified from a URL alone;
no FFprobe was added or run. No controlled-AI edit/upscale is classified as exact
pixel-preserving or deterministic finishing.

## Local execution and platform parity

The 13 static configuration IDs are listed in the appendix. Existing renderer
localInferenceClient → window.localAI → Electron localInferenceRuntime dispatches
to sd.cpp or Wan2GP; engine configuration/catalog and cached status remain source
of truth. No binaries, weights, directories, GPU capabilities or network services
were probed. Local sd.cpp image generation and Wan2GP image/video generation are
**LOCAL_ONLY_EXECUTION** platform paths, conditional on configuration.

The canonical local route cannot currently upload/stage registered project assets:
LOCAL_ASSET_BINDING_UNSUPPORTED is explicit. This particularly limits the advertised
Wan2GP I2V definition requiring a start frame. A nominal match among 13 entries is
not 13 immediately runnable models. Wan2GP can point to a remote MCP host, so the
local-ai executor label alone does not establish offline/privacy properties.
The web app did not expose Electron installation/runtime settings; shared remote
models may provide equivalent creative intent without equivalent offline behavior.

## Workflow, agent and developer-control findings

The current desktop Workflow/Agent wrappers are real integrations, not the old
web-only placeholders. They reuse existing shared UI, narrow desktop route/transport
adapters and MuAPI services. Existing Workflow Studio supports template/published
lists, builder, node schemas, save/run/status; Agent Studio supports list/template,
conversation/chat/polling and simple creation. These are **BASE_APP_LOCAL_ONLY**
relative to canonical Astra routes, even when present in hosted and desktop UI.

Public hosted Workflows displayed current composite recipes (including product,
try-on, interior, dance and character-story combinations). This confirms a reusable
recipe surface, not infinitely many new executors or a generic canonical scheduler.
The local builder advertises text/vision tools (any-llm, openrouter-vision,
gpt-5-nano), input passthrough/concatenation, video-combiner and generation nodes.
The builder static declarations contain 121 rows / 120 unique IDs; 19 IDs are
absent from the Studio union, including older Midjourney aliases, input/utility/text
tools, Luma Modify and external API-node connectors. These do not add new creative
intent counts when they duplicate an existing generator. Their public remote
schemas and user-specific workflows remain distinct from the Studio model arrays; arbitrary workflow IDs are not counted as new model endpoints.

Hosted Agents exposed list/chat/create navigation; private list contents and chat
execution were not verified. Design Agent was explicitly gated. Existing CreativeCanvas
and agent clients are source available; no private hosted-source access is assumed.
MCP/CLI can discover/invoke more provider models than static Studio selectors, but
that does not grant canonical node bindings or imply safe dynamic model execution.
Provider MCP counts in the earlier audit must not be replaced with the live page's
marketing copy. No MCP tools/call or CLI generation ran in this census.

## Gaps before capability projection

### Local foundation/binding priorities (INFERRED)

1. **Eligibility-aware projection of existing reviewed contracts**: expose the 23 V2V / 3 Recast / 2 Motion Control routes and bounded basic image/video paths with actual input roles, limits and model identity. Represent generic/unreviewed paths as partial/deferred, never turn the 521 endpoint count into unconditional permission.
2. **Audio Wave 1 when demanded by a production**: existing music/remix/extend/mashup and TTS service, safe required/nested inputs and ordered registered audio assets. A new client is unnecessary. No standalone stem separation or transcription binding is implied.
3. **Lip-sync contract tightening**: required image/video/audio roles and supported option preservation, using processLipSync. Preserve existing UI and uploader/poller; document models whose extra fields currently disappear.
4. **Clipping and motion-graphics narrow bindings**: runClipping / runMotionGraphics / Edit already provide distinct creative abilities; better leverage than another near-identical V2V profile. Keep AI selection/animation distinct from deterministic finishing.
5. **Complex references / local input staging / output semantics**: review array project binding for generic image/I2V/audio, installed local I2V inputs and layer/track results only where a real selected executor requires it. Existing project/asset system remains the authority.

Whole-workflow automatic execution, fresh approval/budget enforcement, workflow/agent
canonical invocation and exact finishing remain separate future scopes. None is
quietly supplied by this census or by a model selector.

### Web-to-local backport priorities (INFERRED)

**No mandatory capability backport is justified by current evidence.** First reuse
local shared Studio code already present. Broader desktop navigation would be a
product/UI task, not a new Astra capability. Investigate authenticated Design Agent
or a future actually different public model/control only when observable evidence
and a concrete need justify it. Preserve the newer local Recast/Motion/V2V fixes
when merging upstream; do not replace repaired local shared functions with the
older deployed bundle. Revalidate contracts and static aliases after any upstream
catalog/service update.

### Exact recommended next implementation task

**Build a nonvisual, read-only Astra capability projection from current catalogs +
existing reviewed feature contracts + readiness binding evidence.** Return semantic
intent, exact executor/route, required media roles/counts, verified controls/defaults,
project-asset limitations, locality, evidence/eligibility level and diagnostic reason.
Do not add bindings, discovery network calls, ranking, scheduling, agents, UI or raw
provider options. Keep unreviewed/generic entries PARTIAL/DEFERRED rather than
silently broadening execution. Consume current plan/readiness rather than duplicate
validation. Fixtures should cover Recast, Motion Control, all V2V waves, one basic
image generation, partial audio/lip-sync and unavailable local execution.

Another broad binding wave is **not required before this conservative projection**.
If its immediate product requirement includes reliable audio remix/mashup or an
advanced lip-sync model, execute that focused contract milestone first. A new
creative ability is a stronger justification than matching every hosted UI option.
The vocabulary in the semantic inventory is a proposal, not a schema migration;
recipes may combine any optional primitives with no required references/music/logo/
video or fixed graph shape.

## Exact executor inventory and per-route status

The lists below exhaust the nine checked-out Studio catalog arrays and matched
current hosted literal arrays, not the entire provider. Format `logical ID → wire
endpoint` where different; otherwise endpoint is the same ID or selected by existing
source defaults. Endpoint alias identity here is **local confirmed mapping**; the
web ID sequence is confirmed, but where literal endpoint is absent its actual wire
mapping was not re-executed. A catalog ID may appear under two modes; counts dedupe
as specified above. Specific existing metadata/source limitations above override
any broad catalog label.

### t2i: 84 catalog rows

All entries have existing canonical route eligibility; classify executor-level assurance PARTIALLY_ASTRA_EXECUTABLE until the selected fields/roles pass existing plan and any required feature review. Basic capability FULL rows do not certify every listed variant.

- `nano-banana`
- `flux-dev` → `flux-dev-image`
- `flux-kontext-dev-t2i`
- `hidream-i1-fast` → `hidream_i1_fast_image`
- `hidream-i1-dev` → `hidream_i1_dev_image`
- `hidream-i1-full` → `hidream_i1_full_image`
- `ai-anime-generator`
- `wan2.1-text-to-image`
- `flux-kontext-pro-t2i`
- `flux-kontext-max-t2i`
- `gpt4o-text-to-image`
- `flux-schnell` → `flux-schnell-image`
- `bytedance-seedream-v3` → `bytedance-seedream-image`
- `qwen-image`
- `flux-pulid`
- `ideogram-v3-t2i`
- `google-imagen4`
- `google-imagen4-fast`
- `google-imagen4-ultra`
- `sdxl-image`
- `bytedance-seedream-v4`
- `hunyuan-image-2.1`
- `chroma-image`
- `flux-redux`
- `flux-krea-dev`
- `perfect-pony-xl`
- `neta-lumina`
- `wan2.5-text-to-image`
- `hunyuan-image-3.0`
- `leonardoai-phoenix-1.0`
- `leonardoai-lucid-origin`
- `reve-text-to-image`
- `grok-imagine-text-to-image`
- `nano-banana-pro`
- `kling-o1-text-to-image`
- `z-image-turbo`
- `flux-2-dev`
- `flux-2-flex`
- `flux-2-pro`
- `vidu-q2-text-to-image`
- `bytedance-seedream-v4.5`
- `gpt-image-1.5`
- `gpt-image-2` → `gpt-image-2-text-to-image`
- `wan2.6-text-to-image`
- `qwen-text-to-image-2512`
- `flux-2-klein-4b`
- `flux-2-klein-9b`
- `z-image-base`
- `nano-banana-2`
- `nano-banana-2-1`
- `seedream-5.0`
- `bytedance-seedream-v5.0` → `seedream-5.0`
- `z-image-p`
- `qwen-image-2.0`
- `qwen-image-2.0-pro`
- `flux-2-klein-4b-turbo`
- `flux-2-klein-9b-turbo`
- `wan2.7-text-to-image`
- `wan2.7-text-to-image-pro`
- `midjourney-v7`
- `midjourney-v8`
- `midjourney-niji`
- `grok-imagine-text-to-image-quality`
- `flux-2-klein-4b-text-to-image-lora`
- `flux-2-klein-9b-text-to-image-lora`
- `kling-o3-image`
- `nano-banana-2-lite`
- `bytedance-seedream-5.0-pro` → `seedream-5.0-pro`
- `qwen3-text-to-image`
- `qwen3-pro-text-to-image`
- `z-image-base-text-to-image-lora`
- `z-image-turbo-text-to-image-lora`
- `grok-imagine-image-2`
- `flux-1-dev-style-lora-inference`
- `krea-v2-turbo`
- `krea-v2-turbo-lora`
- `muse-image-text-to-image`
- `qwen-image-text-to-image-lora`
- `qwen-image-text-to-image-2512-lora`
- `gpt-image-2.5-flare-text-to-image`
- `gpt-image-2.5-sunburst-text-to-image`
- `qwen2-1-text-to-image`
- `seedream-5.0-flash`
- `ideogram-v4`

### i2i: 88 catalog rows

All entries have existing canonical route eligibility; classify executor-level assurance PARTIALLY_ASTRA_EXECUTABLE until the selected fields/roles pass existing plan and any required feature review. Basic capability FULL rows do not certify every listed variant.

- `ai-image-upscaler` → `ai-image-upscale`
- `ai-image-face-swap`
- `ai-dress-change`
- `ai-background-remover`
- `ai-image-extension`
- `ai-product-shot`
- `ai-skin-enhancer`
- `ai-color-photo`
- `flux-kontext-dev-i2i`
- `ai-product-photography`
- `ai-ghibli-style`
- `ai-object-eraser`
- `flux-kontext-pro-i2i`
- `flux-kontext-max-i2i`
- `gpt4o-image-to-image`
- `gpt4o-edit`
- `bytedance-seededit-v3` → `bytedance-seededit-image`
- `minimax-image-01-subject-reference` → `minimax-01-subject-reference`
- `ideogram-character`
- `flux-pulid`
- `qwen-image-edit`
- `image-effects`
- `nano-banana-edit`
- `ideogram-v3-reframe`
- `bytedance-seedream-edit-v4`
- `nano-banana-effects`
- `flux-kontext-effects`
- `flux-redux`
- `qwen-image-edit-plus`
- `wan2.5-image-edit`
- `reve-image-edit`
- `topaz-image-upscale`
- `seedvr2-image-upscale`
- `qwen-image-edit-plus-lora`
- `nano-banana-pro-edit`
- `image-passthrough`
- `kling-o1-edit-image`
- `flux-2-dev-edit`
- `flux-2-flex-edit`
- `flux-2-pro-edit`
- `vidu-q2-reference-to-image`
- `bytedance-seedream-v4.5-edit`
- `qwen-image-edit-2511`
- `wan2.6-image-edit`
- `qwen-text-to-image-2512`
- `gpt-image-2-edit` → `gpt-image-2-image-to-image`
- `gpt-image-1.5-edit`
- `grok-imagine-image-to-image`
- `Api Node`
- `flux-2-klein-4b-edit`
- `flux-2-klein-9b-edit`
- `add-image-watermark`
- `nano-banana-2-edit`
- `nano-banana-2-1-edit`
- `seedream-5.0-edit`
- `bytedance-seedream-v4-edit` → `bytedance-seedream-edit-v4`
- `bytedance-seedream-v5.0-edit` → `seedream-5.0-edit`
- `qwen-image-2.0-edit`
- `qwen-image-2.0-pro-edit`
- `flux-2-klein-4b-turbo-edit`
- `flux-2-klein-9b-turbo-edit`
- `portrait-stylist`
- `seedance-2-character`
- `wan2.7-image-edit`
- `wan2.7-image-edit-pro`
- `flux-2-klein-4b-edit-lora`
- `flux-2-klein-9b-edit-lora`
- `kling-o3-image-edit`
- `nano-banana-2-lite-edit`
- `bytedance-seedream-5.0-pro-edit` → `seedream-5.0-pro-edit`
- `qwen3-image-to-image`
- `qwen3-pro-image-to-image`
- `z-image-turbo-image-to-image-lora`
- `qwen-image-edit-2511-lora`
- `qwen-image-edit-lora`
- `face-expression-change`
- `muse-image-edit`
- `gemini-omni-character`
- `bytedance-seedream-5.0-pro-layer`
- `grok-imagine-image-2-edit`
- `gpt-image-2.5-flare-image-to-image`
- `gpt-image-2.5-sunburst-image-to-image`
- `topaz-upscale-image-creative`
- `topaz-upscale-image-generative`
- `topaz-upscale-image-precision`
- `qwen2-1-image-to-image`
- `seedream-5.0-flash-edit`
- `seedream-5.0-flash-layerize`

### t2v: 111 catalog rows

All entries have existing canonical route eligibility; classify executor-level assurance PARTIALLY_ASTRA_EXECUTABLE until the selected fields/roles pass existing plan and any required feature review. Basic capability FULL rows do not certify every listed variant.

- `seedance-lite-t2v`
- `seedance-pro-t2v`
- `seedance-pro-t2v-fast`
- `seedance-v1.5-pro-t2v`
- `seedance-v1.5-pro-t2v-fast`
- `seedance-v2.0-t2v`
- `seedance-v2.0-extend`
- `kling-v2.1-master-t2v`
- `kling-v2.5-turbo-pro-t2v`
- `kling-v2.6-pro-t2v`
- `kling-o1-text-to-video`
- `kling-v3.0-pro-text-to-video`
- `kling-v3.0-standard-text-to-video`
- `veo3-text-to-video`
- `veo3-fast-text-to-video`
- `veo3.1-text-to-video`
- `veo3.1-fast-text-to-video`
- `veo3.1-lite-text-to-video`
- `runway-text-to-video`
- `wan2.1-text-to-video`
- `wan2.2-text-to-video`
- `wan2.2-5b-fast-t2v`
- `wan2.5-text-to-video`
- `wan2.5-text-to-video-fast`
- `wan2.6-text-to-video`
- `hunyuan-text-to-video`
- `hunyuan-fast-text-to-video`
- `pixverse-v4.5-t2v`
- `pixverse-v5-t2v`
- `pixverse-v5.5-t2v`
- `minimax-hailuo-02-standard-t2v`
- `minimax-hailuo-02-pro-t2v`
- `minimax-hailuo-2.3-pro-t2v`
- `minimax-hailuo-2.3-standard-t2v`
- `openai-sora`
- `openai-sora-2-text-to-video`
- `openai-sora-2-pro-text-to-video`
- `vidu-v2.0-t2v`
- `ovi-text-to-video`
- `grok-imagine-text-to-video`
- `ltx-2-pro-text-to-video`
- `ltx-2-fast-text-to-video`
- `ltx-2-19b-text-to-video`
- `veo3.1-extend-video`
- `veo3.1-4k-video`
- `seedance-2-t2v` → `seedance-v2.0-t2v`
- `seedance-2-extend` → `seedance-v2.0-extend`
- `ltx-2.3-text-to-video`
- `seedance-2-new-t2v` → `seedance-2.0-new-t2v`
- `grok-imagine-extend`
- `pixverse-v6-t2v`
- `wan2.7-text-to-video`
- `seedance-2-t2v-480p` → `seedance-2.0-t2v-480p`
- `seedance-2-text-to-video`
- `seedance-2-text-to-video-fast`
- `seedance-2-vip-text-to-video`
- `seedance-2-vip-text-to-video-fast`
- `happy-horse-1-text-to-video-1080p`
- `happy-horse-1-text-to-video-720p`
- `veo-4-text-to-video`
- `seedance-2-vip-text-to-video-1080p` → `sd-2-vip-text-to-video-1080p`
- `seedance-2-vip-text-to-video-fast-1080p` → `sd-2-vip-text-to-video-fast-1080p`
- `kling-v3.0-4k-text-to-video`
- `vidu-q3-pro-text-to-video`
- `vidu-q3-turbo-text-to-video`
- `vidu-q2-pro-text-to-video`
- `vidu-q2-turbo-text-to-video`
- `seedance-2-vip-extend` → `sd-2-vip-extend`
- `seedance-2-vip-extend-1080p` → `sd-2-vip-extend-1080p`
- `kling-v3.0-omni-standard-text-to-video`
- `kling-v3.0-omni-pro-text-to-video`
- `kling-v3.0-omni-4k-text-to-video`
- `gemini-omni-text-to-video`
- `kling-v3-turbo-standard-text-to-video`
- `kling-v3-turbo-pro-text-to-video`
- `seedance-2.5-text-to-video`
- `seedance-2.5-text-to-video-480p`
- `seedance-2-mini-text-to-video`
- `happy-horse-1.1-text-to-video-1080p`
- `happy-horse-1.1-text-to-video-720p`
- `seedance-2-mini-omni-reference`
- `seedance-2-vip-text-to-video-4k` → `sd-2-vip-text-to-video-4k`
- `seedance-2.5-spicy-text-to-video`
- `seedance-2-spicy-text-to-video`
- `seedance-2-spicy-text-to-video-fast`
- `seedance-2-mini-spicy-text-to-video`
- `minimax-h3-text-to-video`
- `minimax-h3-open-text-to-video`
- `flux-3-text-to-video`
- `wan3.0-text-to-video`
- `wan3.0-spicy-text-to-video`
- `seedance-2.5-text-to-video-1080p`
- `seedance-2.5-text-to-video-4k`
- `seedance-2.5-intl-text-to-video`
- `seedance-2.5-intl-text-to-video-480p`
- `seedance-2.5-spicy-text-to-video-480p`
- `seedance-2.5-intl-text-to-video-1080p`
- `seedance-2.5-spicy-text-to-video-1080p`
- `seedance-2.5-intl-text-to-video-4k`
- `seedance-2.5-spicy-text-to-video-4k`
- `minimax-h3-text-to-video-lora`
- `ltx-2.5-text-to-video`
- `wan3.0-prime-text-to-video`
- `flux-3-text-to-video-draft`
- `gemini-omni-flash-1-1-text-to-video`
- `openai-sora-2-pro-storyboard`
- `happy-horse-1-text-to-video`
- `happy-horse-1.1-text-to-video`
- `minimax-h3-max-text-to-video`
- `minimax-h3-max-turbo-text-to-video`
- `seedance-2-mini-spicy-omni-reference`

### i2v: 184 catalog rows

All entries have existing canonical route eligibility; classify executor-level assurance PARTIALLY_ASTRA_EXECUTABLE until the selected fields/roles pass existing plan and any required feature review. Basic capability FULL rows do not certify every listed variant.

- `ai-video-effects` → `generate_wan_ai_effects`
- `motion-controls` → `generate_wan_ai_effects`
- `vfx` → `generate_wan_ai_effects`
- `veo3-image-to-video`
- `veo3-fast-image-to-video`
- `runway-image-to-video`
- `wan2.1-image-to-video`
- `hunyuan-image-to-video`
- `kling-v2.1-master-i2v`
- `kling-v2.1-standard-i2v`
- `kling-v2.1-pro-i2v`
- `wan2.2-image-to-video`
- `runway-act-two-i2v`
- `pixverse-v4.5-i2v`
- `vidu-v2.0-i2v`
- `vidu-q1-reference`
- `minimax-hailuo-02-standard-i2v`
- `minimax-hailuo-02-pro-i2v`
- `video-effects`
- `seedance-lite-i2v`
- `seedance-pro-i2v`
- `pixverse-v5-i2v`
- `seedance-lite-reference-video` → `seedance-lite-reference-to-video`
- `wan2.1-reference-video`
- `kling-v2.5-turbo-pro-i2v`
- `wan2.5-image-to-video`
- `wan2.5-image-to-video-fast`
- `openai-sora-2-image-to-video`
- `ovi-image-to-video`
- `openai-sora-2-pro-image-to-video`
- `leonardoai-motion-2.0`
- `veo3.1-image-to-video`
- `veo3.1-fast-image-to-video`
- `veo3.1-lite-image-to-video`
- `veo3.1-reference-to-video`
- `seedance-pro-i2v-fast`
- `ltx-2-pro-image-to-video`
- `ltx-2-fast-image-to-video`
- `vidu-q2-reference`
- `vidu-q2-turbo-start-end-video`
- `vidu-q2-pro-start-end-video`
- `minimax-hailuo-2.3-pro-i2v`
- `minimax-hailuo-2.3-standard-i2v`
- `minimax-hailuo-2.3-fast`
- `kling-v2.5-turbo-std-i2v`
- `grok-imagine-image-to-video`
- `kling-o1-image-to-video`
- `kling-o1-reference-to-video`
- `kling-v2.6-pro-i2v`
- `pixverse-v5.5-i2v`
- `wan2.2-spicy-image-to-video`
- `wan2.6-image-to-video`
- `kling-o1-standard-image-to-video`
- `kling-o1-standard-reference-to-video`
- `seedance-v1.5-pro-i2v`
- `seedance-v1.5-pro-i2v-fast`
- `ltx-2-19b-image-to-video`
- `kling-v3.0-omni-standard-image-to-video`
- `kling-v3.0-omni-pro-image-to-video`
- `kling-v3.0-omni-4k-image-to-video`
- `kling-v3.0-pro-image-to-video`
- `kling-v3.0-standard-image-to-video`
- `seedance-v2.0-i2v`
- `seedance-2-i2v` → `seedance-v2.0-i2v`
- `ltx-2.3-image-to-video`
- `seedance-2-new-first-last` → `seedance-2.0-new-first-last`
- `seedance-2-omni-reference` → `seedance-2.0-omni-reference`
- `pixverse-v6-i2v`
- `pixverse-v6-transition`
- `wan2.7-image-to-video`
- `wan2.7-reference-to-video`
- `seedance-2-i2v-480p` → `seedance-2.0-i2v-480p`
- `seedance-2-omni-reference-480p` → `seedance-2.0-omni-reference-480p`
- `seedance-2-image-to-video`
- `seedance-2-image-to-video-fast`
- `seedance-2-first-last-frame`
- `seedance-2-first-last-frame-fast`
- `seedance-2-omni-reference-no-video`
- `seedance-2-omni-reference-no-video-fast`
- `seedance-2-vip-image-to-video`
- `seedance-2-vip-image-to-video-fast`
- `seedance-2-vip-first-last-frame`
- `seedance-2-vip-first-last-frame-fast`
- `seedance-2-vip-omni-reference`
- `seedance-2-vip-omni-reference-fast`
- `happy-horse-1-image-to-video-1080p`
- `happy-horse-1-image-to-video-720p`
- `veo-4-image-to-video`
- `seedance-2-vip-image-to-video-1080p` → `sd-2-vip-image-to-video-1080p`
- `seedance-2-vip-image-to-video-fast-1080p` → `sd-2-vip-image-to-video-fast-1080p`
- `seedance-2-vip-omni-reference-1080p` → `sd-2-vip-omni-reference-1080p`
- `seedance-2-vip-omni-reference-fast-1080p` → `sd-2-vip-omni-reference-fast-1080p`
- `seedance-2-vip-first-last-frame-1080p` → `sd-2-vip-first-last-frame-1080p`
- `kling-v3.0-4k-image-to-video`
- `vidu-q3-pro-image-to-video`
- `vidu-q3-pro-first-last-frames`
- `vidu-q3-turbo-image-to-video`
- `vidu-q3-turbo-first-last-frames`
- `vidu-q4-image-to-video`
- `vidu-q4-reference-to-video`
- `vidu-q2-pro-image-to-video`
- `vidu-q2-turbo-image-to-video`
- `happy-horse-1-reference-to-video-1080p`
- `happy-horse-1-reference-to-video-720p`
- `gemini-omni-image-to-video`
- `grok-imagine-video-1-5-preview`
- `kling-v3-turbo-standard-image-to-video`
- `kling-v3-turbo-pro-image-to-video`
- `seedance-2.5-image-to-video`
- `seedance-2-mini-image-to-video`
- `happy-horse-1.1-image-to-video-1080p`
- `happy-horse-1.1-image-to-video-720p`
- `happy-horse-1.1-reference-to-video-1080p`
- `happy-horse-1.1-reference-to-video-720p`
- `seedance-2-vip-image-to-video-4k` → `sd-2-vip-image-to-video-4k`
- `seedance-2-vip-first-last-frame-4k` → `sd-2-vip-first-last-frame-4k`
- `seedance-2-vip-omni-reference-4k` → `sd-2-vip-omni-reference-4k`
- `seedance-2.5-spicy-image-to-video`
- `seedance-2.5-image-to-video-480p`
- `seedance-2.5-first-last-frame`
- `seedance-2.5-first-last-frame-480p`
- `seedance-2.5-omni-reference`
- `seedance-2.5-omni-reference-480p`
- `seedance-2-spicy-image-to-video`
- `seedance-2-spicy-image-to-video-fast`
- `seedance-2-mini-spicy-image-to-video`
- `minimax-h3-image-to-video`
- `minimax-h3-reference-to-video`
- `minimax-h3-open-image-to-video`
- `minimax-h3-open-reference-to-video`
- `flux-3-image-to-video`
- `wan3.0-image-to-video`
- `wan3.0-spicy-image-to-video`
- `seedance-2.5-image-to-video-1080p`
- `seedance-2.5-image-to-video-4k`
- `seedance-2.5-first-last-frame-1080p`
- `seedance-2.5-first-last-frame-4k`
- `seedance-2.5-omni-reference-1080p`
- `seedance-2.5-omni-reference-4k`
- `seedance-2.5-intl-image-to-video`
- `seedance-2.5-intl-image-to-video-480p`
- `seedance-2.5-spicy-image-to-video-480p`
- `seedance-2.5-intl-image-to-video-1080p`
- `seedance-2.5-spicy-image-to-video-1080p`
- `seedance-2.5-intl-image-to-video-4k`
- `seedance-2.5-spicy-image-to-video-4k`
- `seedance-2.5-intl-first-last-frame`
- `seedance-2.5-spicy-first-last-frame`
- `seedance-2.5-intl-first-last-frame-480p`
- `seedance-2.5-spicy-first-last-frame-480p`
- `seedance-2.5-intl-first-last-frame-1080p`
- `seedance-2.5-spicy-first-last-frame-1080p`
- `seedance-2.5-intl-first-last-frame-4k`
- `seedance-2.5-spicy-first-last-frame-4k`
- `seedance-2.5-intl-omni-reference`
- `seedance-2.5-spicy-omni-reference`
- `seedance-2.5-intl-omni-reference-480p`
- `seedance-2.5-spicy-omni-reference-480p`
- `seedance-2.5-intl-omni-reference-1080p`
- `seedance-2.5-spicy-omni-reference-1080p`
- `seedance-2.5-intl-omni-reference-4k`
- `seedance-2.5-spicy-omni-reference-4k`
- `wan2.7-image-to-video-spicy`
- `wan2.6-image-to-video-spicy`
- `minimax-h3-image-to-video-lora`
- `minimax-h3-reference-to-video-lora`
- `ltx-2.5-image-to-video`
- `wan3.0-reference-to-video`
- `wan3.0-prime-image-to-video`
- `wan3.0-prime-reference-to-video`
- `wan3.0-spicy-reference-to-video`
- `flux-3-start-end-to-video`
- `gemini-omni-flash-1-1-image-to-video`
- `gemini-omni-flash-1-1-reference-to-video`
- `minimax-h3-image-to-video-spicy`
- `happy-horse-1-image-to-video`
- `happy-horse-1-reference-to-video`
- `happy-horse-1.1-image-to-video`
- `happy-horse-1.1-reference-to-video`
- `minimax-h3-max-image-to-video`
- `minimax-h3-max-reference-to-video`
- `minimax-h3-max-turbo-image-to-video`
- `seedance-2-spicy-omni-reference`
- `seedance-2-spicy-omni-reference-fast`

### v2v: 75 catalog rows

Per-ID classes: R/F = FULLY_ASTRA_EXECUTABLE within reviewed contract; S = SPECIALIZED_ROUTE (explicit selection required); D = DEFERRED_CONTRACT; I = INSUFFICIENT_EVIDENCE. See the bounded review for controls/limits.

- `video-watermark-remover` — I
- `kling-v2.6-std-motion-control` — D
- `kling-v3.0-std-motion-control` — D
- `kling-v3.0-pro-motion-control` — S
- `ai-video-face-swap` — R
- `mmaudio-v2-video-to-video` → `mmaudio-v2/video-to-video` — I
- `runway-aleph-v2v` — R
- `ai-dance-effects` — I
- `ai-video-upscaler` — R
- `wan2.2-edit-video` — F
- `heygen-video-translate` — R
- `topaz-video-upscale` — R
- `ai-video-upscaler-pro` — I
- `remix-video` — I
- `kling-o1-video-edit` — F
- `kling-o1-video-edit-fast` — F
- `kling-o1-standard-video-edit` — F
- `wan2.2-spicy-video-extend` — D
- `seedance-v1.5-pro-video-extend` — D
- `seedance-v1.5-pro-video-extend-fast` — D
- `add-video-watermark` — I
- `seedance-2-watermark-remover` → `seedance-2.0-watermark-remover` — I
- `ai-captions` — I
- `ltx-2.3-video-extend` — D
- `seedance-2-video-watermark-remover-pro` — I
- `pixverse-v6-extend` — D
- `wan2.7-video-extend` — R
- `wan2.7-video-edit` — R
- `happy-horse-1-video-edit-1080p` — D
- `happy-horse-1-video-edit-720p` — D
- `happy-horse-1.1-video-edit-1080p` — D
- `happy-horse-1.1-video-edit-720p` — D
- `gemini-omni-video-edit` — I
- `video-background-remover` — R
- `kling-v2.6-pro-motion-control` — D
- `infinitetalk-video-to-video` — S
- `wan2.2-animate` — S
- `volcengine-video-to-video-lip-sync` — S
- `seedance-2.5-video-edit` — F
- `seedance-2.5-video-edit-480p` — I
- `seedance-2.5-video-edit-1080p` — I
- `seedance-2.5-video-edit-4k` — I
- `seedance-2.5-video-extend` — F
- `seedance-2.5-video-extend-480p` — I
- `seedance-2.5-video-extend-1080p` — I
- `seedance-2.5-video-extend-4k` — I
- `seedance-2.5-intl-video-edit` — D
- `seedance-2.5-spicy-video-edit` — D
- `seedance-2.5-intl-video-edit-480p` — D
- `seedance-2.5-spicy-video-edit-480p` — D
- `seedance-2.5-intl-video-edit-1080p` — D
- `seedance-2.5-spicy-video-edit-1080p` — D
- `seedance-2.5-intl-video-edit-4k` — D
- `seedance-2.5-spicy-video-edit-4k` — D
- `seedance-2.5-intl-video-extend` — D
- `seedance-2.5-spicy-video-extend` — D
- `seedance-2.5-intl-video-extend-480p` — D
- `seedance-2.5-spicy-video-extend-480p` — D
- `seedance-2.5-intl-video-extend-1080p` — D
- `seedance-2.5-spicy-video-extend-1080p` — D
- `seedance-2.5-intl-video-extend-4k` — D
- `seedance-2.5-spicy-video-extend-4k` — D
- `flux-3-video-extend` — R
- `flux-3-video-upscaler` — R
- `flux-3-video-extend-draft` — R
- `gemini-omni-flash-1-1-edit` — R
- `depth-anything` — I
- `runway-act-two-v2v` — F
- `luma-flash-reframe` — D
- `seedance-2-video-edit` → `seedance-v2.0-video-edit` — F
- `happy-horse-1-video-edit` — D
- `happy-horse-1.1-video-edit` — D
- `topaz-upscale-video-creative` — F
- `topaz-upscale-video-generative` — F
- `topaz-upscale-video-precision` — F

### audio: 23 catalog rows

All entries have existing canonical route eligibility; classify executor-level assurance PARTIALLY_ASTRA_EXECUTABLE until the selected fields/roles pass existing plan and any required feature review. Basic capability FULL rows do not certify every listed variant.

- `suno-create-music`
- `suno-remix-music`
- `suno-extend-music`
- `suno-generate-sounds`
- `suno-add-vocals`
- `suno-generate-mashup`
- `suno-add-instrumental`
- `suno-voice-clone`
- `minimax-voice-clone`
- `minimax-speech-2.6-hd`
- `minimax-speech-2.6-turbo`
- `mmaudio-v2-text-to-audio` → `mmaudio-v2/text-to-audio`
- `elevenlabs-text-to-dialogue-v3`
- `suno-convert-to-wav`
- `gemini-3-1-flash-tts`
- `gemini-2-5-pro-tts`
- `elevenlabs-tts-turbo-2-5`
- `minimax-music-3.0`
- `elevenlabs-v4`
- `fish-s2-1-pro`
- `lyria-3-pro`
- `lyria-3`
- `lyria-2`

### lipsync: 15 catalog rows

All entries have existing canonical route eligibility; classify executor-level assurance PARTIALLY_ASTRA_EXECUTABLE until the selected fields/roles pass existing plan and any required feature review. Basic capability FULL rows do not certify every listed variant.

- `infinitetalk-image-to-video`
- `wan2.2-speech-to-video`
- `ltx-2.3-lipsync`
- `ltx-2-19b-lipsync`
- `sync-lipsync`
- `latent-sync` → `latentsync-video`
- `creatify-lipsync`
- `veed-lipsync`
- `infinitetalk-video-to-video`
- `volcengine-video-to-video-lip-sync`
- `kling-v1-avatar-standard`
- `kling-v1-avatar-pro`
- `kling-v2-avatar-standard`
- `kling-v2-avatar-pro`
- `omnihuman-1-5`

### recast: 3 catalog rows

All three = reviewed FULLY_ASTRA_EXECUTABLE / SPECIALIZED_ROUTE for valid inputs. Aliases share provider endpoints with other catalog modes; do not add another client.

- `kling-v3.0-pro-recast` → `kling-v3.0-pro-motion-control`
- `runway-act-two-recast` → `runway-act-two-i2v`
- `wan2.2-animate-recast` → `wan2.2-animate`

### motion_control: 4 catalog rows

Base 2.5/2.0 = reviewed FULLY_ASTRA_EXECUTABLE; Intl/Spicy = DEFERRED_CONTRACT. No family wildcard.

- `seedance-2.5-motion-control` — reviewed
- `seedance-2-motion-control` — reviewed
- `seedance-2.5-intl-motion-control` — DEFERRED_CONTRACT
- `seedance-2.5-spicy-motion-control` — DEFERRED_CONTRACT

### Local model configurations (13; LOCAL_ONLY_EXECUTION / readiness conditional)

- `z-image-turbo` — sdcpp; z-image
- `z-image-base` — sdcpp; z-image
- `dreamshaper-8` — sdcpp; sd1
- `realistic-vision-v51` — sdcpp; sd1
- `anything-v5` — sdcpp; sd1
- `stable-diffusion-xl-base` — sdcpp; sdxl
- `wan2gp:flux-dev` — wan2gp; image
- `wan2gp:qwen-image` — wan2gp; image
- `wan2gp:wan21-t2v-1.3b` — wan2gp; video
- `wan2gp:wan22-t2v` — wan2gp; video
- `wan2gp:wan22-i2v` — wan2gp; video; start image required
- `wan2gp:hunyuan-video` — wan2gp; video
- `wan2gp:ltx-video` — wan2gp; video

### Workflow-builder-only declarations (19 outside the Studio ID union)

These are source declarations, not freshly verified provider endpoints; none gains
canonical permission from this list. `utility.jsx` has seven model/tool arrays,
121 entries and 120 distinct IDs (video-combiner appears twice). Templates/presets
are excluded. Hosted workflow-node schemas are not assumed identical to these
static defaults.

| Exact IDs | Classification / creative significance |
| --- | --- |
| midjourney-v7-text-to-image, midjourney-v7-image-to-image, midjourney-v7-omni-reference, midjourney-v7-style-reference, midjourney-v7-image-to-video | DUPLICATE_OR_ALTERNATE_PATH: builder naming/aliases, not five demonstrated new abilities; corresponding Studio generation/reference intent exists |
| luma-modify-video | BASE_APP_LOCAL_ONLY / INSUFFICIENT_EVIDENCE for canonical execution: builder video transformation declaration; do not admit by name |
| video-combiner | Existing ordered remote assembly declaration; canonical utility binding absent |
| any-llm, openrouter-vision, gpt-5-nano, gpt-5-mini | Existing text/vision workflow tool declarations; no canonical chat/analysis executor |
| video-passthrough, text-passthrough, audio-passthrough, prompt-concatenator | Input/text plumbing; NOT_NEEDED as extra creative capability counts. image-passthrough also occurs in Studio and is not a builder-only ID |
| wavespeed, straico, runware, genvr | Four generic workflow API-node connector declarations; not four added providers in WHIHM and not proof of new creative capability |

### Other existing app/service IDs (not new canonical admission)

- `ai-clipping`, `motion-graphics`, `motion-graphics-edit`: confirmed shared Studio endpoints, no canonical mode.
- `bytedance-seedream-5.0-pro-layer`, `seedvr2-image-upscale`, `topaz-image-upscale`, `ai-image-upscale`, `ai-background-remover`, `ai-image-extension`: dedicated helper paths, overlapping catalog primitives; DUPLICATE_OR_ALTERNATE_PATH, not extra model counts.
- `sd-2-vip-omni-reference-1080p`, `seedance-2-vip-omni-reference`: Marketing wrapper's selected endpoints, already represented in catalog endpoint union.
- `video-combiner`, `prompt-concatenator`, `any-llm`, `openrouter-vision`, `gpt-5-nano`, and image/video/audio/text passthroughs: existing workflow-builder utility/text/input declarations. Not all have proven independent Studio model contracts. Workflow definitions and hosted agent slugs are dynamic data, not an exact closed model catalog; they are not added to 574.

## Audit QA and unchanged state

Only this Markdown report is intended for version control. No application/runtime,
canonical semantics, model lists, Electron flags, dependency/lockfile, submodule,
UI, provider configuration or credential was changed. No test/build suite is
needed for documentation-only changes. Required final checks: `git diff --check`,
`git status --short`, `git submodule status`, complete report/diff inspection, and
verification that `packages/whihm-workflow-core/NEXT_HISTORY_TASK.md` is unchanged
and excluded. No paid request, generation, agent execution, provider workflow run,
upload, local inference, model installation or push occurred.
