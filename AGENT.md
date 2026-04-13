# Project Summary

Chrome Manifest V3 extension for scanning Canvas course pages or dashboard-visible courses, normalizing discovered course/document records into `chrome.storage.local`, downloading Canvas-hosted files, and planning a Notion sync scaffold. Repo is plain browser JavaScript with no bundler, package manager, or automated test harness.

# Repository Map

- `manifest.json` - MV3 entrypoint, popup definition, service worker, permissions, and Canvas host allowlist.
- `background.js` - scan orchestration, queue/progress state, export manifest persistence, download actions, and all Notion message handlers.
- `content.js` - injected content script bridge for page-context detection and authenticated fetch-and-scrape work.
- `popup.html`, `popup.js`, `popup.css` - popup UI for course selection, scan review, downloads, and Notion planning controls.
- `utils/url.js`, `utils/extract.js`, `utils/dedupe.js`, `utils/records.js` - Canvas URL parsing, DOM extraction, dedupe, normalized records, and export manifest generation.
- `utils/notion_models.js`, `utils/notion_storage.js`, `utils/notion_validate.js`, `utils/notion_mapper.js`, `utils/notion_sync.js`, `utils/notion_api.js` - Notion settings model, storage, readiness checks, planning, lifecycle state, and future API boundary.
- `utils/types.ts` - reference types for stored/runtime shapes only; it is not compiled into extension runtime.

# Commands

- Repo inventory: `python3 /Users/yehosuahercules/.codex/skills/repo-init/scripts/repo_inventory.py .`
- Repo root check: `git rev-parse --show-toplevel`
- Notion planner surface grep: `rg -n "notion|canvasCourseExportManifest|targetParentType|studyAssets|planSync|runValidation|saveSettings" background.js popup.js utils`
- Install/build/lint/typecheck/test: none exist in this repo

# Conventions

- Keep runtime code browser-compatible and root-based. `background.js` loads helpers with `importScripts(...)`, so runtime files cannot rely on bundler-only syntax or module resolution.
- When changing stored record shapes, update runtime JS first, then update `utils/types.ts` to keep the reference types aligned.
- `chrome.storage.local` is source of truth. Scan state lives in `canvasCourseScanState`; normalized export data lives in `canvasCourseExportManifest`; Notion state lives under `notionSettings`, `notionSyncPlan`, `notionSyncJobs`, `notionLastValidation`, and `notionLastSyncResult`.
- Notion identifiers should flow through `utils/notion_models.js` normalization helpers before persistence. Popup inputs may accept raw URLs or UUIDs; stored values should be normalized IDs.
- Current Notion flow is scaffold-only. `utils/notion_api.js` deliberately returns `not_implemented`, so planning/validation changes must not imply live upload works.

# Validation Before Handoff

- Load unpacked extension from repo root in `chrome://extensions`.
- On a Canvas dashboard or all-courses page, verify visible course detection and selected/all-course scan start.
- On a single Canvas course page, verify scan completes, grouped results render, and at least one Canvas-hosted file download starts.
- If Notion code changed, verify popup can save settings, run validation, and generate a plan without console/runtime errors; confirm summary/status updates after storage changes.

# Warnings and Guardrails

- There is no automated safety net. Any behavior change needs manual Chrome validation.
- `manifest.json` only pre-grants `https://*.canvaslms.com/*` and `https://*.instructure.com/*`. Other Canvas hosts depend on optional origin permission flow in `background.js`.
- `utils/types.ts` is documentation/reference, not runtime enforcement.
- `chrome.storage.local` persists across extension reloads. Clear or reset stored state when manual testing depends on a clean baseline.
- If you change export-manifest or Notion-plan shapes, update popup rendering and overview builders in the same pass; they assume synchronized storage contracts.

# Related Docs

- `README.md`
- `TASK_CONTEXT.md`
