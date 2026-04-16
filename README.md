# Canvas Academic Ingestor

Manifest V3 Chrome extension for:

- scanning Canvas courses or dashboard-visible courses
- downloading Canvas-hosted artifacts locally
- ingesting structured academic content into Notion
- extracting, normalizing, chunking, and tracking content for later Codex automations
- running deterministic academic automations from synced Notion workspace data

Product intent:

This repo is not "Canvas downloader + Notion export."

It is a content-ready academic knowledge system:

Canvas -> normalized records -> extracted text -> chunks -> Notion enrichment -> Notion-side automation inputs -> automation outputs.

## Phase 5 status

Implemented now:

- single-course and multi-course Canvas scan still work
- dry-run workspace planning still works
- live Notion sync still works
- Canvas-native HTML content enters a Phase 4 extraction queue
- supported file artifacts enter same queue with honest unsupported/failure states
- extraction metadata, queue state, chunk records, and enrichment results persist in `chrome.storage.local`
- extracted content is chunked deterministically with stable-enough chunk IDs for later updates
- Notion sync can reflect extraction status, extracted text presence, chunk count, and enriched page content
- Phase 5 automation definitions persist in `chrome.storage.local`
- Phase 5 reads content and deliverables from synced Notion databases, not from Canvas scraping paths
- Phase 5 writes first-class automation output pages into a dedicated `Automation Outputs` database in Notion
- popup now supports manual runs for:
  - `weekly_tasks_overview`
  - `weekly_content_overview`
  - `course_recap_seed`
- generation is deterministic now, with a clean no-op adapter boundary for future Codex/LLM enhancement

Still not implemented:

- OCR for image-only PDFs or image files
- PPT/PPTX extraction
- XLS/XLSX extraction
- legacy `.doc` extraction
- scheduled/background automation runs
- live LLM-enhanced generation
- flashcards or quiz generation beyond recap seed scaffolding

## Phase 4 pipeline

Useful records now move through explicit lifecycle/state fields.

Primary processing lifecycle:

- `discovered`
- `downloaded`
- `extraction_pending`
- `extracted`
- `extraction_failed`
- `unsupported_for_extraction`
- `chunked`
- `notion_enriched`
- `automation_ready`

Supporting status fields:

- `extractionStatus`: `not_started`, `pending`, `extracted`, `failed`, `unsupported`, `not_applicable`
- `normalizationStatus`: `not_started`, `normalized`, `failed`, `not_applicable`
- `enrichmentStatus`: `not_started`, `pending`, `notion_enriched`, `failed`, `not_applicable`

Core extracted-content fields on normalized records:

- `extractedText`
- `extractedHtml`
- `extractionMethod`
- `extractionVersion`
- `extractedAt`
- `wordCount`
- `charCount`
- `headingCount`
- `chunkCount`
- `chunkIds`
- `unsupportedReason`
- `failureReason`

## Supported extraction types

### Canvas-native HTML

Supported:

- Pages
- Syllabus
- Assignment descriptions
- module item/course HTML captured during scan

Behavior:

- readable content is normalized into semantic HTML + plain text
- headings, paragraphs, lists, and simple tables are preserved pragmatically
- navigation/chrome noise is stripped

### File artifacts

Supported with real extraction:

- PDF
- DOCX
- TXT
- HTML/HTM files when discovered as downloadable artifacts

Behavior:

- PDFs use bundled `pdfjs-dist`
- DOCX uses bundled `mammoth`
- TXT uses direct normalization
- HTML files use DOM-based normalization through offscreen parsing

### Unsupported-for-extraction bucket

Honest unsupported states are persisted for:

- PPT / PPTX
- XLS / XLSX
- images
- legacy `.doc`
- unknown binary files
- external resource links without local extractable body

No fake extraction success is written for unsupported types.

## Chunking behavior

Chunking is deterministic and stored locally.

Current defaults:

- target chunk size: about `2200` characters
- overlap: about `250` characters
- order preserved
- heading context carried forward per chunk when available

Each chunk stores:

- `chunkId`
- `chunkIndex`
- `chunkText`
- `tokenEstimate`
- `headingContext`
- `contentObjectId`
- `sourceDocumentId`
- `courseId`
- provenance fields such as source URL/title

Chunk IDs are derived from source record + chunk index + chunk text hash, so repeated chunking with same input remains stable.

## Notion enrichment representation

Phase 5 keeps existing Notion ingestion model, then layers automation outputs on top.

Content rows now track extra properties such as:

- processing status
- extraction status
- readiness
- source category
- extraction method
- extracted text present
- word count
- char count
- chunk count
- unsupported reason

Synced Notion content pages now:

- keep provenance blocks
- keep raw artifact/file attachment behavior
- append extracted content when available
- distinguish raw artifact present vs extracted text present vs chunked/automation-ready local state

Automation outputs now write into a dedicated `Automation Outputs` database:

- one row/page per generated output
- deterministic page body sections for overview/recap/study-seed content
- source reference section with Notion and Canvas links when available
- metadata/code block for run traceability, source ids, and warning state

Current automation output behavior:

- `weekly_tasks_overview`
  - urgent items
  - due-this-window items grouped by course
  - metadata-gap section for missing due dates
- `weekly_content_overview`
  - workspace-level grouped recap
  - per-course recap objects for courses with matching content
- `course_recap_seed`
  - major topics
  - key content items
  - candidate study concepts

Deterministic now:

- sorting/grouping of tasks by due date and course
- grouping content by course and content type
- heading/topic aggregation from synced Notion page bodies
- structured recap seed generation from title/heading/snippet patterns

Reserved for future AI enhancement:

- deeper semantic summarization
- flashcards and quizzes
- richer concept extraction
- scheduled Codex-style weekly runs

## Storage keys

Existing:

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

New/extended for Phase 4:

- `canvasContentExtractionState`

New for Phase 5:

- `canvasAutomationDefinitions`
- `canvasAutomationRuns`
- `canvasAutomationLatest`

Stored there:

- extraction queue
- extraction job history
- extraction records keyed by `contentObjectId`
- chunk records keyed by `contentObjectId`
- latest Notion enrichment result
- latest automation result summaries and output references

`canvasCourseScanState` also carries compact `extractionSummary` for popup rendering.

## Key files

- [background.js](/Users/yehosuahercules/Desktop/Misc./canvasScrapper/background.js)
  scan orchestration, extraction queue orchestration, offscreen bridge, downloads, Notion entrypoints
- [offscreen/offscreen.html](/Users/yehosuahercules/Desktop/Misc./canvasScrapper/offscreen/offscreen.html)
- [offscreen/offscreen.js](/Users/yehosuahercules/Desktop/Misc./canvasScrapper/offscreen/offscreen.js)
  DOM/PDF/DOCX extraction surface outside service worker
- [utils/extract_content.js](/Users/yehosuahercules/Desktop/Misc./canvasScrapper/utils/extract_content.js)
  extraction source classification and supported/unsupported routing
- [utils/normalize_content.js](/Users/yehosuahercules/Desktop/Misc./canvasScrapper/utils/normalize_content.js)
  HTML/text normalization into machine-usable content
- [utils/chunk_content.js](/Users/yehosuahercules/Desktop/Misc./canvasScrapper/utils/chunk_content.js)
  deterministic chunking
- [utils/enrichment_records.js](/Users/yehosuahercules/Desktop/Misc./canvasScrapper/utils/enrichment_records.js)
  extraction/chunk/enrichment record normalization
- [utils/extraction_queue.js](/Users/yehosuahercules/Desktop/Misc./canvasScrapper/utils/extraction_queue.js)
  queue and job-state helpers
- [utils/content_states.js](/Users/yehosuahercules/Desktop/Misc./canvasScrapper/utils/content_states.js)
  normalized content inventory merged with Phase 4 extraction state
- [utils/notion_entities.js](/Users/yehosuahercules/Desktop/Misc./canvasScrapper/utils/notion_entities.js)
  extended Notion schema/property mapping for extraction-aware rows
- [utils/notion_workspace.js](/Users/yehosuahercules/Desktop/Misc./canvasScrapper/utils/notion_workspace.js)
  schema upgrade + extracted-content page sync
- [utils/automation_models.js](/Users/yehosuahercules/Desktop/Misc./canvasScrapper/utils/automation_models.js)
  automation definitions, run models, and window helpers
- [utils/automation_collect.js](/Users/yehosuahercules/Desktop/Misc./canvasScrapper/utils/automation_collect.js)
  Notion-side collection of content and deliverable inputs
- [utils/automation_generate.js](/Users/yehosuahercules/Desktop/Misc./canvasScrapper/utils/automation_generate.js)
  deterministic overview and recap generation
- [utils/automation_writer.js](/Users/yehosuahercules/Desktop/Misc./canvasScrapper/utils/automation_writer.js)
  Notion `Automation Outputs` database writes and page-body rendering
- [utils/automation_runs.js](/Users/yehosuahercules/Desktop/Misc./canvasScrapper/utils/automation_runs.js)
  run lifecycle orchestration and latest-result summaries

## Known limits

- PDF extraction works for text-based PDFs. Image-only/scanned PDFs without embedded text will fail honestly.
- No OCR exists yet.
- Chrome local storage is still being used for extracted text and chunk payloads. `unlimitedStorage` helps, but very large corpora will eventually need a more specialized local persistence strategy.
- Notion page bodies can become large for long extracted documents. Current behavior is pragmatic, not optimized for huge multi-hundred-page artifacts.
- Local Chrome download completion is separate from extraction fetches. Phase 4 extraction uses source fetches plus saved provenance; it does not read arbitrary local files from disk.
- Weekly task overview does not use a completion/status field yet because deliverable schema does not currently persist one.
- Automation collectors depend on current synced Notion workspace mappings. If destination changes, run live sync again before automation runs.
- `current week` uses Monday-Sunday in browser locale time.
- Scheduling metadata exists on definitions, but no automatic weekly trigger runs yet.

## Auth setup

This extension still uses a manual Notion internal integration token.

Setup:

1. Create/share internal integration in Notion.
2. Paste token into popup.
3. Paste destination page URL.
4. Validate.
5. Plan or run live sync.
6. Use Phase 4 extraction controls when scan data is ready.
7. Run Phase 5 automation layer from popup after sync completes.

## Test checklist

Minimum manual/CLI verification for Phase 5:

- `node --check background.js`
- `node --check popup.js`
- `node --check content.js`
- `for f in utils/*.js offscreen/offscreen.js; do node --check "$f"; done`
- run a mixed-record smoke test covering Canvas HTML, PDF candidate, and unsupported artifact types
- confirm unsupported artifacts are marked `unsupported_for_extraction` / `unsupported`
- confirm extraction queue persists across popup reload / extension worker restart
- confirm chunking is deterministic for identical input
- confirm scan flow still produces documents/content items without runtime errors
- confirm live Notion sync still validates, plans, and runs
- confirm `Automation Outputs` database is created lazily on first automation write
- confirm each manual automation run writes real Notion output pages with source references and metadata block
- confirm popup preserves latest run summary and output references after reload

## User flow

1. Open Canvas dashboard or course.
2. Scan current/selected courses.
3. Review discovered records.
4. Optionally download artifacts.
5. Run `Run Extraction`.
6. Retry failures if needed.
7. Run `Enrich Notion` or regular `Live Sync`.
8. Use stored extracted/chunked content later for automation workflows.
