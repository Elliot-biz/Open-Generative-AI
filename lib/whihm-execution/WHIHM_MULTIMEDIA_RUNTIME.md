# Multimedia Transform Runtime Foundation v1

The WHIHM-owned `whihm-multimedia` runtime contract discovers and probes a local
FFmpeg/ffprobe pair. It does not transform media, add a creative capability, grant
execution permission, install software or perform remote/provider health checks.
Image finishing remains available through Sharp; video/audio finishing remains
**not implemented**, including when this runtime reports metadata readiness.

## Discovery and trust boundary

[multimedia-runtime.mjs](multimedia-runtime.mjs) uses explicit candidates in order:

1. Packaged Electron only: `resourcesPath/multimedia/<platform>-<arch>/bin`.
2. Electron application-managed: `userData/multimedia/<platform>-<arch>/bin`.
3. Explicit trusted directory: `WHIHM_MULTIMEDIA_BIN_DIR`, or internal Node config.
4. Unpackaged/source development only: up to 64 unique absolute PATH directories,
   in declared order. No packaged PATH fallback.

Sources are `packaged`, `application_managed`, `configured`, `system` or
`unavailable`; initial unprobed source is null. No recursive scan, directory creation,
PATH mutation, shell discovery, downloading or installing occurs. Standalone Node
has no guessed application-managed root. Environment configuration is captured at
service creation; trusted reconfiguration/restart is required to change it.

The first candidate containing either executable is authoritative. An incomplete,
unsafe, incompatible or feature-deficient installation does not silently fall
through. Explicit missing/invalid configuration also fails closed. Empty managed
locations may fall through; invalid lower settings do not override a working higher
candidate. Both binaries must be in the same candidate directory; never combine
unrelated PATH entries. Hitting the PATH bound is reported. Empty/current/relative
PATH entries are skipped; malformed explicit paths are reported, never echoed.

Candidate directories are canonicalized; directory aliases can resolve normally.
Leaf executable symlinks/non-files are rejected. POSIX execution permission is
checked; Windows loader failures remain structured probe failures. These are
trusted administrator/OS runtime locations, not project assets or renderer input.
There is no executable authenticity guarantee or hostile-binary sandbox. Source
classification describes resolution, not vendor certification. Public results omit
absolute paths, raw banners/configuration, stdout/stderr and environment values.
Executable stat identities are checked before/after probing; replacement makes
readiness unverified. This is change detection, not a cryptographic authenticity proof.
Internal discovery retains resolved paths for future trusted execution integration.

## Version and capability policy

[multimedia-probe.mjs](multimedia-probe.mjs) owns the fixed probe commands, parsers
and baseline. Stable numeric release majors **6–9** are accepted by the bounded
metadata protocol policy; the pair must share a major. Patch/minor differences are
allowed only with matching reported build/runtime ABI majors for libavcodec,
libavformat and libavutil. A build/runtime ABI mismatch blocks compatibility.
Missing ABI fields, malformed output and unrecognized git/vendor versions stay
unverified. Unsupported numeric majors, including future releases, are not
automatically certified. This is protocol/advertised-feature compatibility, not
native transform execution or fidelity certification.

Only exact anchored version fields are interpreted. Build/configuration digests
identify observed banners without returning embedded paths. Host platform/arch
are reported as `architectureEvidence: host_only`; no PE/ELF binary-architecture
certification is invented. OS loader success is not native-ISA/performance proof.

`WHIHM_MEDIA_FINISHING_BASELINE_V1` has 29 required and 21 optional feature checks.
Each check identifies its binary, list direction and exact implementation name.
Encoder presence never follows from a decoder or hardware marketing label.

| Binary/table | Required | Optional |
| --- | --- | --- |
| ffmpeg decoders | h264, aac, pcm_s16le | hevc, vp9, mp3, flac |
| ffmpeg encoders | libx264, aac, pcm_s16le | libvpx-vp9, libmp3lame, flac |
| ffmpeg filters | scale, crop, pad, fps, trim, setpts, atrim, asetpts, aresample, aformat, pan, volume, afade | loudnorm |
| ffmpeg muxers | mp4, mov, wav | webm, mp3, flac |
| ffmpeg demuxers | mov, wav | matroska, mp3, flac |
| ffprobe decoders | h264, aac, pcm_s16le | hevc, vp9, mp3, flac |
| ffprobe demuxers | mov, wav | matroska, mp3, flac |

The mov demuxer covers reported MP4/MOV aliases; matroska covers reported WebM
aliases. Names are matched from list rows/flags, not descriptions. Optional names
refer to these exact implementations, not every possible alternative. Loudness
normalization is optional because its deterministic measurement/application contract
is a later transform task. HEVC encoding, AV1 and hardware acceleration are not
part of this profile. No operation is enabled by any check.

The CLI defines separate capability listings; parsers handle the observed legacy/
current format headings and two/three-column filter flags, and fail closed on
unknown output. Evidence: [official CLI documentation](https://ffmpeg.org/ffmpeg.html),
[ffprobe demuxer documentation](https://ffmpeg.org/ffprobe-all.html#Demuxers) and
[first-party output implementations](https://github.com/FFmpeg/FFmpeg/blob/n8.0/fftools/opt_common.c).
Only public documentation/source GET inspection occurred; no binaries were fetched.

## Status, cache and host access

```js
await window.whihmHost.getMultimediaRuntimeStatus();
await window.whihmHost.getMultimediaRuntimeStatus({ refresh: true });
```

The fixed trusted host read needs no project, provider credentials or approval.
Only optional boolean refresh is accepted. Renderer paths, arguments, environment,
runtime configuration and project handles are rejected. Internal configuration
and discovery are not IPC APIs.

Result schema 1 separates availability/source, per-binary presence/usability,
versions/compatibility, observedAt, baseline satisfied/missing/unknown checks and
structured blockingReasons. States:

- `missing`: pair absent, including configured missing locations.
- `partial`: incomplete pair or known required feature absent.
- `incompatible`: unsupported major/platform or mismatched version/ABI pair.
- `unverified`: not probed, unreadable/unsafe binary, failed/timed-out query,
  unknown version/ABI, bounded-search exhaustion or unrecognized capability output.
- `ready`: compatible metadata protocol plus every required advertised feature.

Readiness is only an observation, never execution authorization or media proof.
`executionVerified` and `mediaTransformsImplemented` remain false. Errors include
safe codes/role/query/required-feature IDs, not raw program diagnostics.

One process-local cache lasts 30 seconds; concurrent reads/refreshes share an
in-flight probe. Returned objects are detached. Refresh bypasses a completed cache;
internal invalidate/configure clears it. No persistent cache, watcher, polling or
monitoring exists. Discovery/probe results must be revalidated before future use.
Static projection reads only the last observation, which may be stale; they never
probe, refresh, check PATH or authenticate. A not-probed snapshot is explicit.

FINISH_MEDIA retains 603 total projection entries / 42 capabilities and its available
image executor. Runtime metadata adds image=implemented/available and
video/audio=not_implemented, plus the multimedia profile/status read and safe last
snapshot. Capability/executor planning contexts preserve these generic runtime
fields. No FFmpeg creative group, model ID list or ranking/fallback policy is added.

## Process safety

At most nine metadata calls form a full probe: each binary's `-version`, ffmpeg's five
capability tables, and ffprobe's decoder/demuxer tables. List calls use hide_banner.
No media filenames, output paths, filtergraphs, prices or arbitrary argv are accepted.
Executable paths are resolved before direct spawn; shell=false and windowsHide=true.
Stdin is ignored; stdout+stderr together are capped at 256 KiB per child. Each child
has a 3-second timeout. Timeout/overflow terminates the child with SIGKILL and waits
for close; a bounded cleanup fallback reports termination uncertainty instead of
success. Nonzero exits, spawn/stream errors and malformed output are structured.

Only a small OS environment allowlist is inherited, with C locale/no log colors.
FFREPORT, NODE_OPTIONS/preload hooks and provider credentials are excluded, avoiding
accidental report files or injection. No general child-tree supervisor is added;
the trusted metadata binaries are expected not to spawn independent workloads.

## Windows, Electron and future distribution

Windows uses win32 path semantics, semicolon PATH, case-insensitive PATH key
selection and exact ffmpeg.exe/ffprobe.exe names. Quoted PATH directories with
spaces are supported; args remain separate and filenames are not shell-quoted.
UNC, drive-relative/current-directory locations and .cmd/.bat wrappers are not
accepted. No PATHEXT shell expansion. Host x64/arm64 directory keys are explicit;
the current Windows build target remains x64. POSIX supports existing regular
executables with execute permission; no chmod or system configuration change.

Electron lazy host initialization supplies actual app.isPackaged, resourcesPath
and userData only after the app/window is ready. Unpackaged Electron follows the
development fallback policy; packaged Electron only considers resources, managed
or explicit configured directories. Native binary loader/DLL or architecture
failures never produce ready state. Windows paths are fixture-tested here, not
certified by a real shipped Windows runtime.

Future packaging must select one reviewed matched build per platform/arch, include
both executables and any required colocated DLL/shared libraries, and place them
outside app.asar through a platform-specific electron-builder **extraResources**
mapping to multimedia/<platform>-<arch>/bin. No asarUnpack is needed for those
external resources; placing native executables inside asar is unsupported. Include
build origin/configuration, checksums, licenses/notices and matching source/build
instructions as required by the selected distribution review. Validate target
architecture, loader paths/rpaths, executable modes, signing/notarization and
post-package version/capability probes on each target. Never copy the host Linux
pair into a Windows artifact. No package configuration or afterPack hook was changed.

Bundled distribution requires a **separate licensing review** of the actual build
and linked components; the baseline's libx264 choice is relevant to that review.
FFmpeg documents that optional components affect its licensing/distribution
conditions. This is not a legal determination. No bundled binaries are introduced,
so development discovery is not blocked by an unfinished distribution review.
[FFmpeg licensing guidance](https://ffmpeg.org/legal.html).

The existing WHIHM source dependency-closure omission remains a separate shipping
blocker: these Node modules must also enter the eventual package closure. This
task supplies the runtime contract and future inclusion design, not that repair.
**Packaged production readiness is not claimed.**

## Verification and next boundary

Tests use filesystem/path fixtures, simulated version/capability outputs and real
Node child scripts standing in for the fixed CLI protocol. No installed FFmpeg is
needed for correctness. The informational local discovery currently reports
missing; no real media or transforms were used. A future executor must still
validate parameters/assets, authorize each transform, recheck runtime identity,
perform controlled transforms and independently verify outputs.

This establishes a reusable bounded local-health pattern: discovery, paired
identity, protocol compatibility, advertised features, scoped readiness and a
read-only cached observation. Remote provider/model health, uptime monitoring,
downloads, transformations, Audio Production and Delivery Presets remain outside
this milestone.

QA: **65 new cases** (63 runtime plus two fixed-host cases); **562 unique targeted
tests pass**: 63 runtime, 55 image finishing, 64 inspection, 44 projection, 43 planning,
67 full host and 226 bridge/Depth/Suno/high-value-video regressions. Nine affected
host reads/inspection/finishing cases were rerun after final scoped initialization
changes. Syntax/ESLint pass for all 10 touched JS/MJS files; git diff --check passes.
Counts remain 42/603; a starting-HEAD comparison confirms finishing binding/controls
are unchanged apart from explicit runtime metadata and its limitation wording.
No renderer/Studio build input or builder config changed, so no Vite/browser/release
build was needed. The pure Electron environment mapping is fixture-tested for
development/packaged Windows paths. Submodules and the known history file are untouched.
