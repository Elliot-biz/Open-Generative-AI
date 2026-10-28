# Provider Center v1

Provider Center is a read-only view over capability projection, owner readiness
checks and observed runtime state. It is not a provider registry, credential store,
connection manager, account health service or execution permission system.

Upstream SettingsModal/muapi transports already own the renderer-side MuAPI key.
That UI/storage is unchanged. The host cannot attest its presence, so MuAPI reports
UNKNOWN configuration and unknown credential presence with external_config source.
Higgsfield and Meta reuse their existing safe environment/configuration validators.
No credentials, environment values, auth headers, local model paths or raw adapter
errors are copied into Provider Center. Public records allowlist identifiers and
bounded status fields rather than forwarding whole adapter/runtime objects.

## Surfaces

- getProviderCenter({}): global schemaVersion 1 snapshot and stable snapshotHash.
- getProviderStatus({providerId}): one provider/runtime record.
- testProviderReadiness({providerId}): explicit existing local multimedia/face probe,
  otherwise NOT_SUPPORTED for live connection testing. No network or generation.
- getProviderDependencies({projectHandle,providerId}): registered project workflow
  node references matching current catalog bindings; no filesystem scan.

All are fixed host/preload reads. Unknown fields, credential retrieval/configuration
and unsafe inputs reject. No new capability entry is needed: planning overview
advertises the read-only host operation. Counts stay 54 groups /622 entries.

## Record and trust

Records include stable ID/display name, type/local declaration, known membership,
configuration, credential presence/source/verification, readiness/code, exact
catalog capability/executor-key/provider/mode mappings, paid-side-effect class,
approval and liveness boundaries, health observation, native-evidence support,
optional links, and limitations. Provider names are the authoritative catalog IDs.
Runtime dependency groups derive from entries' existing multimedia requirement or
face-guidance binding. Local inference groups derive from model requirements.
Suno remains a MuAPI executor family, not a second invented transport/provider.

Categories: remote_generation, remote_utility, local_runtime, local_model,
deterministic_tool. Config states include UNKNOWN, NOT_CONFIGURED, MALFORMED,
CONFIGURED and NOT_APPLICABLE. Readiness states include KNOWN, UNVERIFIED, READY,
PARTIAL, BLOCKED and UNAVAILABLE. Missing credentials block; well-formed credentials
mean CONFIGURED/UNVERIFIED, never verified account health. Dispatch configuration
is reported separately. Catalog availability likewise does not imply runtime health.

Multimedia uses the last owner probe observation. Face readiness uses the last
asset-plus-Electron-runner observation; files alone cannot make it READY. Explicit
local tests invoke the existing probes without replacing discovery or integrity
checks. Before observation these remain unverified. Local inference installation,
weights and execution are unverified unless authoritative evidence exists. Wan2GP
may use a remote MCP backend, so its spend remains REMOTE_UNKNOWN_COST even though
its catalog execution class is local. Mixed WHIHM tools report PARTIAL, with
per-executor prerequisites and important runtime dependency groups exposed separately.

Remote effects are REMOTE_PAID_OR_ACCOUNT_USAGE or REMOTE_UNKNOWN_COST. Verified
local tools/runtimes are LOCAL_NO_PROVIDER_SPEND. This is not an estimate. Native
usage/cost support is distinct from actual spend, which remains unknown. Higgsfield
can preserve native usage/cost when returned; Meta can preserve native usage.
Other support stays unknown rather than inventing a ledger or estimating dollars.
No unknown is converted into zero. No session/account liveness is inferred from
configuration, generic human approval or an old runtime observation.

Approval metadata says execution authorization is required and human approvals
remain workflow-dependent. Lifecycle-backed bindings additionally expose the
adapter-controlled session boundary (including Suno). Provider Center grants no
execution, voice liveness, QC acceptance or revision authority.

## Global/project boundary and identity

Global records never include project/node information. Dependency queries are
separate responses scoped to a trusted project handle. Matching preserves exact
catalog binding keys; multi-mode matches are explicitly ambiguous catalog matches,
not execution selection. There is no fallback, provider substitution or ranking.

Snapshot identity hashes normalized state only; transient probe timestamps, model
asset paths and generation timestamps are absent. Same safe state gives the same
hash. No raw runtime snapshot is exported. The existing MuAPI access-key link is reused from components/ApiKeyModal.js. Other
links remain empty; no account/billing URLs are invented or interpolated. Runtime
dependency matches are labeled catalog-declared requirements, not proof that every
operation on a multi-operation tool needs that runtime.

## Limits and next work

Readiness describes last local observation/configuration, not successful inference
or a live authenticated provider connection. Remote connection tests remain
NOT_SUPPORTED and accounts unverified; no generation request is used as a test.
MuAPI credential presence, live provider health, balances, billing metadata, actual
usage aggregation, some native-evidence support, local weights and session liveness
remain unknown. No credential mutation, UI, secret manager, disabling, Director
Bridge or durable orchestration is introduced. Next: owner-controlled credential
presence and UI controls, preserving these host/renderer secret boundaries.

Validation: 455 unique targeted tests pass, including 8 Provider Center tests,
Workflow/Agent/Creative Revision, native Higgsfield, Meta, multimedia, local model
availability, projection/planning and host/preload regressions. Syntax/ESLint pass
for all 7 touched JS/MJS files; git diff --check passes. No provider calls, paid
usage, runtime installation, dependency or renderer changes occurred.
