# Provider Center v1

Provider Center is a normalized view over capability projection, owner readiness
checks and observed runtime state. It is not a provider registry, connection
manager, account health service or execution permission system. The only mutation
surface is the narrow host-owned credential control described below.

Upstream SettingsModal/muapi transports already own the renderer-side MuAPI key.
That UI/storage is unchanged. The host cannot attest its presence, so MuAPI reports
UNKNOWN configuration and unknown credential presence with external_config source.
Higgsfield and Meta reuse their existing safe environment/configuration validators
and may additionally use the host-owned encrypted credential store. A complete
host credential takes precedence over environment values; an absent host record
falls back to the environment. Partial or corrupt host data is reported as
malformed and deliberately blocks environment merging rather than combining a
credential from two sources.
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

All reads are fixed host/preload operations. Credential writes/removals are also
fixed allowlisted operations (`setProviderCredential` and
`removeProviderCredential`) and return status only. Unknown fields, credential
retrieval and unsafe inputs reject. No new capability entry is needed: planning overview
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

## Host-owned credential store

Electron owns a version-1 store at the app user-data location
`provider-credentials.json`. Values are encrypted/decrypted only by Electron's
`safeStorage`; the renderer, preload responses, project files, workflow records,
projection, planning context, QC and agent records never receive plaintext or
ciphertext. The allowlist contains only:

- Higgsfield: `HF_API_KEY_ID` + `HF_API_KEY_SECRET` as one complete credential.
- Meta: `WHIHM_META_API_KEY`.

The store writes atomically and keeps only schema/field/ciphertext metadata. If
the OS encryption primitive is unavailable, writes fail closed and no plaintext
fallback is attempted. Host status exposes only presence, source (`host_store`,
`environment`, or `unavailable`), storage state and unverified verification
metadata. Saving does not prove account access. Removing a stored credential never
deletes environment variables; effective status is recomputed using the fallback
rule above. MuAPI remains owned by its upstream settings/localStorage flow and is
not migrated.

## Limits and next work

Readiness describes last local observation/configuration, not successful inference
or a live authenticated provider connection. Remote connection tests remain
NOT_SUPPORTED and accounts unverified; no generation request is used as a test.
MuAPI credential presence, live provider health, balances, billing metadata, actual
usage aggregation, some native-evidence support, local weights and session liveness
remain unknown. No generic secret manager, credential getter, disabling, Director
Bridge or durable orchestration is introduced. Browser mode has no credential
setter and must use environment/setup instructions; only trusted Electron can
mutate the two allowlisted credential schemas.

Validation covers the existing Provider Center, Workflow/Agent/Creative Revision,
native Higgsfield, Meta, multimedia, local model availability, projection/planning
and host/preload regressions plus dedicated encrypted-store and fixed-bridge tests.
No provider calls, paid usage or runtime installation are used.

## In-app UI and credential controls

The existing app router now has a `providers` page via Providers in the header,
with a compact navigation button below desktop widths. ProviderCenter uses the
fixed preload reads plus the two allowlisted credential controls. Cards group
remote providers, runtimes and models/utilities, derive
capabilities/modes from the snapshot, expose account-usage warnings and unknown
cost, and expand model/evidence details. Users can open a registered project folder
through existing openProject to query node dependencies. Readiness tests are explicit
and show a display-only check time. No generation or authenticated connection probe
is added. Errors show fixed sanitized text, never adapter exception messages.

Higgsfield and Meta have write-only Electron forms for configure/replace and
stored-credential removal. Fields are transient password/text inputs, cleared after
submission; the UI never pre-fills or reads a saved value. A successful save shows
present/host-store and configured/unverified state only. Removal warns about project
dependencies when a project handle is available and leaves environment fallback
untouched. A paid acceptance still requires credentials, current readiness, explicit
execution permission and any existing workflow approvals.

MuAPI uses the unchanged upstream settings/localStorage transport. The page derives
only a boolean presence, never retains or exports the key, and labels a present key
UNVERIFIED. This boolean is renderer-local and does not assert host verification.
Configure MuAPI opens existing SettingsModal; Manage MuAPI opens the existing
https://muapi.ai/access-keys URL with target=_blank/noopener/noreferrer, through
Electron's existing external-browser handling. No account webview is used. Settings
no longer prefills the saved key; transient password input clears on close/save.
MuAPI's existing storage is the deliberate exception to new host-only storage:
it is neither migrated nor copied to another store.

Browser mode shows an explicit host-unavailable fallback, MuAPI presence/settings
and the external manage link. Full normalized host state, local probes and project
dependencies require Electron. No insecure browser credential workaround is added.

UI validation includes 390/1023/1440 browser viewports, screenshots and overflow
checks, password no-prefill/clear-after-save with recognizable fixture values, and
existing storage preservation. Host behavior is tested through fixed preload APIs;
Electron-style page data uses a mocked preload in browser QA, not a live provider.

The targeted credential-store/host suites cover encryption-at-rest, schema
allowlisting, precedence, malformed-store blocking, write-only preload responses,
replacement/removal, sanitized errors and environment compatibility. No real
provider connection, paid usage or real-user upload is used; credential mutation
tests use fake safeStorage and fixture values only.
