# Canvas Academic Ingestor

Manifest V3 Chrome extension for:

- scanning Canvas courses or dashboard-visible courses
- downloading Canvas-hosted artifacts locally
- ingesting structured academic content into Notion under a user-supplied parent page

Product intent:

This repo is not "Canvas downloader + Notion export".

It is Canvas -> Notion academic knowledge ingestion so later Codex automations can operate on real course content, provenance, artifacts, and sync state.

## Phase 3 status

Implemented now:

- single-course and multi-course Canvas scan still work
- dry-run workspace planning still works
- real Notion token-based auth for this local-only MV3 architecture
- destination page URL parsing and validation
- general workspace mode
- class-specific workspace mode
- real Notion database/page creation and update
- course hub page creation in general mode
- Canvas-native text ingestion into Notion page blocks
- file artifact row creation with honest attachment/extraction states
- local-to-remote mapping persistence for retry-safe updates
- live sync job/result persistence with created/updated/skipped/failed counts

Not implemented yet:

- OAuth flow with backend exchange
- AI summaries, flashcards, review questions, weekly digests
- document text extraction from PDFs/DOCX/PPTX/XLSX
- rich Notion relation graph between databases
- large/multipart Notion file upload flow

## Auth setup

This extension currently uses a manual Notion internal integration token.

Reason:

- pure MV3 extension has no secure backend for public OAuth code exchange + client secret storage
- manual token is workable and honest for local-only architecture

Setup steps:

1. In Notion, create an internal integration with read and insert/update content capabilities.
2. Copy integration token.
3. Share target parent page with that integration inside Notion.
4. Open extension popup.
5. Paste integration token into `Notion integration token`.
6. Paste destination Notion page URL.
7. Choose `General academic workspace` or `Class-specific workspace`.
8. Click `Save`.
9. Click `Validate`.

If validation fails with 403/404 behavior, most likely cause is page not shared with integration.

## User flow

1. Open Canvas dashboard or one course.
2. Scan current course or selected/all visible courses.
3. Review discovered files in popup.
4. Optionally download local artifacts.
5. Add Notion token and destination page URL.
6. Choose workspace mode.
7. Validate destination.
8. Plan workspace if you want dry-run review.
9. Run `Live Sync`.
10. Inspect sync summary in popup.

## Notion workspace model

### General workspace mode

Parent page becomes multi-course root.

Extension creates or reuses:

- `Courses` database
- `Content` database
- `Deliverables` database
- `Study Assets` database
- one course hub page per course

### Class-specific mode

Provided parent page is treated as one course hub/root.

Extension creates or reuses beneath that page:

- `Content` database
- `Deliverables` database
- `Study Assets` database

It does not create top-level multi-course `Courses` database in this mode.

## What gets ingested

### Canvas-native text content

Examples:

- Pages
- Assignment descriptions
- Syllabus text
- module overview pages
- home content when visible as real HTML/text

Behavior:

- extension captures page body HTML/text during scan
- live sync creates or updates Notion row pages
- row page body receives readable Notion blocks
- provenance is stored in database properties and page body

### File artifacts

Examples:

- PDF
- DOCX
- PPTX
- XLSX
- ZIP

Behavior:

- extension creates `Content` row with provenance + artifact metadata
- if source is directly fetchable and small enough for current single-part upload path, extension uploads and attaches file to page
- if attachment is not feasible, row is still created and `Processing Status` honestly stays `extraction_pending` or `failed`
- no extracted text is fabricated

Current practical limitation:

- current direct upload path uses Notion single-part upload behavior
- oversized or otherwise inaccessible files do not get fake success states

### External resources

Examples:

- Google Docs links
- websites
- YouTube links

Behavior:

- extension creates metadata rows when useful external links are discovered on scanned Canvas pages
- external resources are marked as external
- body content is not fabricated

## Provenance and state

Each ingested content row carries source metadata such as:

- Canvas course ID/name
- source section
- source page title
- source page URL
- original Canvas URL
- discovered date
- sync timestamps
- file flags
- automation-ready boolean

Sync states stored now include:

- job states: `idle`, `validating`, `ready`, `syncing`, `partially_completed`, `completed`, `failed`, `blocked`
- content processing states: `discovered`, `planned`, `notion_created`, `notion_updated`, `artifact_attached`, `extraction_pending`, `automation_ready`, `failed`

## Storage keys

- `canvasCourseScanState`
- `canvasCourseExportManifest`
- `notionAuth`
- `notionDestination`
- `notionWorkspacePlan`
- `notionAutomationContract`
- `notionPlannerSummary`
- `notionSyncJobs`
- `notionLastValidation`
- `notionLastSyncResult`
- `notionMappings`

## Key files

- `background.js`
  scan orchestration, runtime message boundary, downloads, Notion sync entrypoints
- `content.js`
  content script bridge for Canvas page detection and fetch/scrape
- `popup.html` / `popup.js` / `popup.css`
  popup UI for scan controls, token/destination setup, validation, planning, live sync, summary
- `utils/extract.js`
  Canvas DOM discovery plus page-body content capture and external-resource detection
- `utils/records.js`
  normalized course/document/content record builders and export manifest generation
- `utils/content_states.js`
  content inventory builder for direct-ingest content, file artifacts, deliverables, external resources
- `utils/notion_auth.js`
  local token persistence wrapper
- `utils/notion_api.js`
  real Notion HTTP client, validation, database/page/block operations, file upload helpers
- `utils/notion_blocks.js`
  pragmatic HTML/text -> Notion block conversion
- `utils/notion_entities.js`
  Notion database schemas and row property builders
- `utils/notion_workspace.js`
  create/reuse workspace structure, upsert rows, attach artifacts, persist mappings
- `utils/notion_sync.js`
  overview, validation, dry-run planning, live sync orchestration

## Current limitations

- no browser/manual validation was run in this implementation pass
- direct-ingest extraction depends on Canvas page HTML being accessible in scanned pages
- Canvas pages with highly custom markup may degrade to paragraph fallback blocks
- course hubs are minimal summary pages, not rich dashboards yet
- file upload path is conservative; when upload cannot be completed honestly, row remains metadata-first
- no relation property between `Content` and `Courses` databases yet
- no downstream study-asset generation yet

## Validation run in this pass

Executed:

- `node --check background.js`
- `node --check content.js`
- `node --check popup.js`
- `node --check utils/extract.js`
- `node --check utils/dedupe.js`
- `node --check utils/records.js`
- `node --check utils/content_states.js`
- `node --check utils/notion_models.js`
- `node --check utils/notion_storage.js`
- `node --check utils/notion_auth.js`
- `node --check utils/notion_api.js`
- `node --check utils/notion_blocks.js`
- `node --check utils/notion_entities.js`
- `node --check utils/notion_validate.js`
- `node --check utils/notion_workspace.js`
- `node --check utils/notion_sync.js`
- manifest JSON parse check

Not run:

- live Chrome extension manual test
- live Canvas scan against real courses
- live Notion API sync against real workspace

## Manual test checklist

1. Load unpacked extension in `chrome://extensions`.
2. Confirm Chrome shows no manifest/runtime load errors.
3. Scan one course from a course page.
4. Scan multiple courses from dashboard.
5. Confirm downloads still start for selected/all files.
6. Paste valid Notion token and shared parent page URL.
7. Validate in general mode.
8. Validate in class-specific mode with selected course.
9. Run dry-run `Plan`.
10. Run `Live Sync`.
11. Confirm Notion now contains:
    `Courses`/`Content`/`Deliverables`/`Study Assets` structures in general mode, or class-specific children in class mode.
12. Open some direct-ingest row pages and confirm readable blocks exist.
13. Open some file-artifact rows and confirm either attached artifact or honest pending/failed status.
14. Re-run sync and confirm existing rows update or skip instead of blindly duplicating.

## Scope guardrails

- no auth bypass
- no locked-content bypass
- no quiz scraping
- no fake extraction
- no fake upload
- no fake sync success
- no fake automation readiness
