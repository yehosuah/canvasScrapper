# Canvas Academic Ingestor

Manifest V3 Chrome extension for:

- scanning Canvas courses or dashboard-visible courses
- downloading Canvas-hosted artifacts locally
- ingesting structured academic content into Notion
- extracting, normalizing, chunking, and tracking content for later Codex automations

Product intent:

This repo is not "Canvas downloader + Notion export."

It is a content-ready academic knowledge system:

Canvas -> normalized records -> extracted text -> chunks -> Notion enrichment -> future automation inputs.

## Phase 4 status

Implemented now:

- single-course and multi-course Canvas scan still work
- dry-run workspace planning still works
- live Notion sync still works
- Canvas-native HTML content enters a Phase 4 extraction queue
- supported file artifacts enter same queue with honest unsupported/failure states
- extraction metadata, queue state, chunk records, and enrichment results persist in `chrome.storage.local`
- extracted content is chunked deterministically with stable-enough chunk IDs for later updates
- Notion sync can reflect extraction status, extracted text presence, chunk count, and enriched page content

Still not implemented:

- OCR for image-only PDFs or image files
- PPT/PPTX extraction
- XLS/XLSX extraction
- legacy `.doc` extraction
- flashcards, review questions, weekly digests, or other automation outputs

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

Phase 4 does not redesign the Notion model. It extends the existing `Content` database and synced page bodies.

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

Stored there:

- extraction queue
- extraction job history
- extraction records keyed by `contentObjectId`
- chunk records keyed by `contentObjectId`
- latest Notion enrichment result

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

## Known limits

- PDF extraction works for text-based PDFs. Image-only/scanned PDFs without embedded text will fail honestly.
- No OCR exists yet.
- Chrome local storage is still being used for extracted text and chunk payloads. `unlimitedStorage` helps, but very large corpora will eventually need a more specialized local persistence strategy.
- Notion page bodies can become large for long extracted documents. Current behavior is pragmatic, not optimized for huge multi-hundred-page artifacts.
- Local Chrome download completion is separate from extraction fetches. Phase 4 extraction uses source fetches plus saved provenance; it does not read arbitrary local files from disk.

## Auth setup

This extension still uses a manual Notion internal integration token.

Setup:

1. Create/share internal integration in Notion.
2. Paste token into popup.
3. Paste destination page URL.
4. Validate.
5. Plan or run live sync.
6. Use Phase 4 extraction controls when scan data is ready.

## Test checklist

Minimum manual/CLI verification for Phase 4:

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

## User flow

1. Open Canvas dashboard or course.
2. Scan current/selected courses.
3. Review discovered records.
4. Optionally download artifacts.
5. Run `Run Extraction`.
6. Retry failures if needed.
7. Run `Enrich Notion` or regular `Live Sync`.
8. Use stored extracted/chunked content later for automation workflows.
