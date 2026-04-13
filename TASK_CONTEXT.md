# Original Task

User reframed next build around this product statement:

> We are not building a Canvas downloader with Notion export; we are building a Canvas-to-Notion academic knowledge ingestion system for future Codex automations.

User-directed next phase:

> Phase Beta: Automation-Ready Notion Workspace Planner

Required outcomes called out by user:

- Add Phase Beta before live Notion sync.
- Accept a parent Notion page URL.
- Support import mode selection: general workspace or class-specific destination.
- Redesign planner around automation-ready objects, not file metadata alone.
- Plan courses, content records, deliverables, study assets, and per-course hubs.
- Distinguish content blocks, file artifacts, extraction states, and automation-readiness states.
- Keep future Codex workflows in scope: weekly overviews, due digests, study assets, class summaries, flashcards, review questions, study plans.

# Interpreted Objective

Refactor current Notion dry-run scaffold into a Phase Beta planner for an academic knowledge-ingestion workspace. Success means popup settings, stored models, validation, and generated plans all target structured Notion knowledge objects and destination modes for future automations, while still staying honest that live Notion upload and document text extraction are not implemented yet.

# Relevant Architecture

- `popup.html`, `popup.js`
  Current Notion UI only supports enable toggle, parent type, workspace name, target parent ID, database IDs, validation, and plan sync. This is first surface that must expose parent page URL input, destination mode, and richer plan summary.
- `background.js`
  Chrome runtime message boundary. It forwards `GET_NOTION_STATE`, `SAVE_NOTION_SETTINGS`, `VALIDATE_NOTION_SETTINGS`, and `PLAN_NOTION_SYNC` to `CanvasNotionSync`. If payload or overview shapes change, keep these handlers aligned.
- `utils/notion_models.js`
  Defines persisted settings, readiness labels, job statuses, and current plan summary model. Right now it only understands page/database parent types plus courses/documents/study-assets database IDs.
- `utils/notion_validate.js`
  Current readiness checks are metadata-sync oriented: enabled flag, workspace name, parent ID, courses DB, documents DB, optional study-assets DB, and manifest counts. Phase Beta needs mode-aware validation and new required schema fields.
- `utils/notion_mapper.js`
  Current planner only emits `coursePlans` and `documentPlans`, with a `metadataOnly` flag. This file is main refactor point for content objects, workspace schema planning, processing states, and automation markers.
- `utils/notion_sync.js`
  Owns overview payload, settings save/reset behavior, validation runs, plan generation, and job/result summaries. Any new planner output or readiness model must surface here for popup rendering.
- `utils/records.js`, `utils/types.ts`
  Export manifest and reference types still center on courses, documents, and sync records. Phase Beta may need richer exported or derived planning types for content provenance, extraction state, and automation readiness.
- `utils/notion_api.js`
  Future API boundary only. Keep Phase Beta scoped to planning/storage/validation unless live sync requirements are added explicitly.

# Key Files and Directories

- `popup.html` - replace current Notion dry-run form labels/fields with parent page URL and destination mode friendly controls.
- `popup.js` - update form serialization, summary rendering, and any assumptions about plan counts or readiness labels.
- `background.js` - keep Notion message payloads and response shape in sync with new settings/planner contract.
- `utils/notion_models.js` - expand settings, enums, summary counters, and normalized workspace target model.
- `utils/notion_storage.js` - normalize and persist any new plan/settings structures.
- `utils/notion_validate.js` - enforce Phase Beta field requirements and mode-specific readiness checks.
- `utils/notion_mapper.js` - generate automation-ready schema plan, course/content/deliverable/study-asset planning objects, and processing-state markers.
- `utils/notion_sync.js` - compose overview payload for popup, reset validation/plan state on save, and summarize Phase Beta plans.
- `utils/records.js` - source manifest shape if planner needs more provenance or extracted-content placeholders.
- `utils/types.ts` - keep reference types aligned with runtime JS changes.
- `README.md` - current product doc still describes file download + Notion dry-run scaffold; update only if task expands to user-facing documentation refresh.

# Commands

- Repo inventory: `python3 /Users/yehosuahercules/.codex/skills/repo-init/scripts/repo_inventory.py .`
- Find Notion planner touchpoints: `rg -n "notion|canvasCourseExportManifest|targetParentType|studyAssets|planSync|runValidation|saveSettings" background.js popup.js utils`
- Manual validation remains browser-based; no repo-local build or test command exists.

# Constraints and Risks

- Current Notion schema is file-sync oriented. Settings model assumes `targetParentType`, `targetParentId`, `coursesDatabaseId`, `documentsDatabaseId`, and optional `studyAssetsDatabaseId`. Phase Beta must replace or extend this without leaving popup, storage, and summary code out of sync.
- Current planner treats `manifest.documents` as terminal objects. Phase Beta wants knowledge objects derived from Canvas pages, assignments, syllabus text, file artifacts, and future text extracts. Decide clearly whether new plan objects are derived-only or require export manifest changes.
- Current validation and summaries use simple course/document counts. If plan output becomes multi-entity, update summary builders and popup copy in same pass.
- `utils/types.ts` is not compiled. Runtime JS is source of truth; type file must be updated manually.
- No live Notion auth/upload exists. `utils/notion_api.js` still returns `not_implemented`. Phase Beta should plan for automation-ready ingestion without pretending remote sync or document extraction pipeline already works.
- Parent page URL support means ID normalization rules move from “user pastes UUID” to “user may paste full Notion URL.” Keep normalization centralized in `utils/notion_models.js`.
- Destination modes must handle both multi-course scans and single-course imports. Spell out how general workspace mode and class-specific mode interact with selected-course planning.

# Acceptance Checklist

- Notion settings model supports a parent Notion page URL and an explicit destination mode for general-workspace vs class-specific planning.
- Popup form and summary copy reflect knowledge-ingestion planning, not only course/document metadata sync.
- Planner emits or summarizes workspace schema objects for courses, content, deliverables, study assets, and course hubs.
- Planner distinguishes at least these content states: metadata-only, content-ingested, artifact-attached, extraction-pending, or equivalent explicit processing states.
- Validation logic checks the new Phase Beta requirements and reports blocked vs warning states accurately.
- Overview/job/result payloads still render cleanly in popup after storage updates.
- Any runtime shape changes are mirrored in `utils/types.ts`.
- Live Notion upload remains clearly blocked/not implemented unless separately built.

# Related Docs

- `AGENT.md`
- `README.md`
