# Desktop upstream Workflow Studio

The desktop Workflows tab mounts `packages/studio/src/components/WorkflowStudio.jsx`
and its existing `WorkflowUI` / Vibe-Workflow React Flow builder. It has no WHIHM
canonical workflow, project, execution bridge, or history integration.

- `routes.mjs` holds transient list/workflow/tab navigation in memory. The narrow
  Next navigation/link/image/dynamic substitutes are resolved only for the two
  workflow Studio modules and the builder, by `vite.mjs`. No Next runtime runs.
- The plugin imports the existing builder source and changes its single duplicate
  action's hard browser navigation to local navigation at build time. The transform
  fails if that upstream statement changes. Submodule files remain untouched.
- `transport.mjs` gives only the builder an isolated Axios instance. It maps
  `/api/workflow/*` and `/api/app/*` to the same MuAPI URLs used by the web proxy.
  Upstream components retain their submission, polling, pricing, uploads, and
  downloads. External HTTPS upload requests retain multipart data/progress but
  never receive the MuAPI key, cookies, or Authorization headers.
  Rejected errors retain status/data but omit raw Axios configuration so upstream
  node error logging cannot print its credential header.
- Studio service functions remain unchanged. On Electron's `file://` origin they
  already address MuAPI directly. Vite development uses the existing API proxy.
- The shared Studio/UI accept `desktop` (default false), skipping web token handoff
  and page reload flags in desktop. Workflow ID changes remount the existing builder.
- The wrapper uses the current desktop key source. With no key it renders an auth
  prompt and performs no workflow requests. Settings emits an auth-change event.
  No key is placed in a URL, project data, workflow, or a new credential store.
- Scoped CSS fits the upstream viewport-height editor into the existing desktop tab.
  Desktop navigation keeps the inactive workflow tab dimensioned but hidden/inert,
  so React Flow's pending fit/resize work does not run against a zero-size canvas.

Electron main/preload and security settings are unchanged. There is no new server,
IPC operation, uploader, provider client implementation, scheduler, or poller.

## Verification

`node --test tests/workflowDesktop.test.mjs`

`npm run vite:build`

The Electron smoke check must use a temporary profile and intercepted/fake remote
responses, with external requests blocked. Verify no-auth, template list, workflow
selection, playground/builder, return to list, and Image/Video tab navigation.
Real credentials, uploads, generation, publication, and architect calls are excluded.

## Limits

Live MuAPI authorization, CORS behavior, workflow execution, uploads, downloads,
and service availability require a separately authorized live test. Upstream node
catalogs and editor behavior are retained. The existing app header has a desktop
minimum window width; a 390px check is only a content-level narrow-layout check.
The upstream workflow tabs/toolbars can clip at that narrow width; responsive
redesign is outside this desktop integration.
The existing WHIHM host packaged-source omission is unrelated and is not fixed here.
Upstream updates to Next imports, relative API routes, or the duplicate action need
adapter revalidation. Agent Studio is unchanged.
