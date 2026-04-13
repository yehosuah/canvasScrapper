importScripts(
  "utils/url.js",
  "utils/extract_content.js",
  "utils/enrichment_records.js",
  "utils/extraction_queue.js",
  "utils/chunk_content.js",
  "utils/content_states.js",
  "utils/extract.js",
  "utils/dedupe.js",
  "utils/records.js",
  "utils/notion_models.js",
  "utils/notion_destination.js",
  "utils/notion_workspace_plan.js",
  "utils/automation_contract.js",
  "utils/notion_blocks.js",
  "utils/notion_entities.js",
  "utils/notion_api.js",
  "utils/notion_storage.js",
  "utils/notion_auth.js",
  "utils/notion_validate.js",
  "utils/notion_workspace.js",
  "utils/notion_sync.js"
);

const UrlUtils = globalThis.CanvasUrlUtils;
const ContentPlanningUtils = globalThis.CanvasContentPlanningUtils;
const ExtractContentUtils = globalThis.CanvasExtractContentUtils;
const EnrichmentRecordUtils = globalThis.CanvasEnrichmentRecordUtils;
const ExtractionQueueUtils = globalThis.CanvasExtractionQueueUtils;
const ChunkContentUtils = globalThis.CanvasChunkContentUtils;
const ExtractUtils = globalThis.CanvasExtractUtils;
const DedupeUtils = globalThis.CanvasDedupeUtils;
const RecordUtils = globalThis.CanvasRecordUtils;
const NotionStorage = globalThis.CanvasNotionStorage;
const NotionSync = globalThis.CanvasNotionSync;

const STORAGE_KEY = "canvasCourseScanState";
const EXTRACTION_KEY = "canvasContentExtractionState";
const EXPORT_MANIFEST_KEY = "canvasCourseExportManifest";
const MAX_SCAN_PAGES = 250;
const OFFSCREEN_DOCUMENT_URL = "offscreen/offscreen.html";
const EXTRACTION_JOB_CONCURRENCY = 1;
const DEFAULT_SCAN_STATE = {
  status: "idle",
  message: "Open Canvas course or dashboard and start scan.",
  isScanning: false,
  pageMode: "unsupported",
  currentCourseId: null,
  queue: {
    requestedCourseIds: [],
    totalCourses: 0,
    completedCourses: 0,
    failedCourses: 0,
    activeCourseId: null
  },
  courses: [],
  courseOrder: [],
  courseProgress: {},
  documents: [],
  contentItems: [],
  results: [],
  syncRecords: [],
  duplicateCountRemoved: 0,
  stats: {
    coursesScanned: 0,
    pagesVisited: 0,
    downloadableCount: 0,
    externalCount: 0,
    ignoredCount: 0
  },
  errors: [],
  updatedAt: null,
  lastScanAt: null,
  downloadSummary: null,
  extractionSummary: {
    total: 0,
    extracted: 0,
    pending: 0,
    failed: 0,
    unsupported: 0,
    chunked: 0,
    notionEnriched: 0,
    automationReady: 0,
    latestMessage: ""
  }
};
const DEFAULT_EXTRACTION_STATE = ExtractionQueueUtils.createExtractionState();

let inMemoryState = { ...DEFAULT_SCAN_STATE };
let inMemoryExtractionState = DEFAULT_EXTRACTION_STATE;
let activeScanPromise = null;
let activeExtractionPromise = null;

NotionStorage.ensureStorageShape().catch(() => {});

function nowIso() {
  return new Date().toISOString();
}

function buildCurrentManifestRecords(state, extractionState) {
  return ContentPlanningUtils.buildManifestContentInventory(
    {
      courses: state.courses || [],
      documents: state.documents || [],
      contentItems: state.contentItems || []
    },
    extractionState
  ).records;
}

function withExtractionSummary(state, extractionState) {
  const records = buildCurrentManifestRecords(state, extractionState);
  return {
    ...DEFAULT_SCAN_STATE,
    ...state,
    extractionSummary: ExtractionQueueUtils.buildSummary(records, extractionState)
  };
}

function buildPersistPayload(state, extractionState) {
  const nextExtractionState = ExtractionQueueUtils.createExtractionState(extractionState || inMemoryExtractionState);
  const nextState = withExtractionSummary(state, nextExtractionState);
  return {
    [STORAGE_KEY]: nextState,
    [EXTRACTION_KEY]: nextExtractionState,
    [EXPORT_MANIFEST_KEY]: RecordUtils.buildExportManifest(nextState, nextExtractionState)
  };
}

async function hydrateState() {
  const stored = await chrome.storage.local.get([STORAGE_KEY, EXTRACTION_KEY]);
  inMemoryExtractionState = ExtractionQueueUtils.createExtractionState(stored[EXTRACTION_KEY] || DEFAULT_EXTRACTION_STATE);
  inMemoryState = withExtractionSummary(
    {
      ...DEFAULT_SCAN_STATE,
      ...(stored[STORAGE_KEY] || {})
    },
    inMemoryExtractionState
  );
  return inMemoryState;
}

async function persistAll(nextState, nextExtractionState) {
  const normalizedExtractionState = ExtractionQueueUtils.createExtractionState(nextExtractionState || inMemoryExtractionState);
  const normalizedState = withExtractionSummary(nextState || inMemoryState, normalizedExtractionState);
  inMemoryExtractionState = normalizedExtractionState;
  inMemoryState = normalizedState;
  await chrome.storage.local.set(buildPersistPayload(normalizedState, normalizedExtractionState));
  return {
    state: normalizedState,
    extractionState: normalizedExtractionState
  };
}

async function persistState(patch) {
  return (
    await persistAll(
      {
        ...inMemoryState,
        ...patch,
        updatedAt: nowIso()
      },
      inMemoryExtractionState
    )
  ).state;
}

async function persistExtractionState(nextExtractionState) {
  return (
    await persistAll(
      {
        ...inMemoryState,
        updatedAt: nowIso()
      },
      {
        ...nextExtractionState,
        updatedAt: nowIso()
      }
    )
  ).extractionState;
}

async function resetState(patch, extractionStateOverride) {
  return (
    await persistAll(
      {
        ...DEFAULT_SCAN_STATE,
        ...patch,
        updatedAt: nowIso()
      },
      extractionStateOverride !== undefined ? extractionStateOverride : inMemoryExtractionState
    )
  ).state;
}

function getCurrentManifestRecords() {
  return buildCurrentManifestRecords(inMemoryState, inMemoryExtractionState);
}

function logExtractionEvent(level, message, detail) {
  const logger = console[level] || console.log;
  if (detail) {
    logger(`[Phase4] ${message}`, detail);
    return;
  }
  logger(`[Phase4] ${message}`);
}

async function ensureOffscreenDocument() {
  if (!chrome.offscreen?.createDocument) {
    throw new Error("Offscreen parsing is unavailable in this browser runtime.");
  }

  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT_URL,
      reasons: ["DOM_PARSER"],
      justification: "Parse Canvas HTML and extract text from supported course files for Phase 4 content enrichment."
    });
  } catch (error) {
    if (!/single offscreen document|already exists/i.test(error?.message || "")) {
      throw error;
    }
  }
}

async function runOffscreenExtraction(message) {
  await ensureOffscreenDocument();
  const response = await chrome.runtime.sendMessage({
    ...message,
    target: "offscreen"
  });
  if (!response?.ok) {
    throw new Error(response?.error || "Offscreen extraction failed.");
  }
  return response.result;
}

async function fetchSourceResponse(url) {
  const response = await fetch(url, {
    credentials: "include",
    redirect: "follow"
  });
  if (!response.ok) {
    throw new Error(`Request failed with ${response.status} ${response.statusText}`);
  }
  return response;
}

async function extractContentForRecord(record, descriptor) {
  const sourceUrl = descriptor.sourceUrl || record.sourceCanvasUrl || record.sourcePageUrl;
  if (!sourceUrl && descriptor.fetchMode !== "inline_html") {
    throw new Error("Missing source URL for extraction.");
  }

  if (descriptor.fetchMode === "inline_html") {
    return runOffscreenExtraction({
      type: "OFFSCREEN_EXTRACT_CONTENT",
      sourceCategory: descriptor.sourceCategory,
      extractionMethod: descriptor.extractionMethod,
      html: record.bodyHtml || "",
      fallbackText: record.bodyText || record.excerpt || "",
      title: record.sourcePageTitle || record.fileName || ""
    });
  }

  const response = await fetchSourceResponse(sourceUrl);
  const contentType = response.headers.get("content-type") || "";
  if (
    ["pdf", "docx"].includes(descriptor.sourceCategory) &&
    /text\/html|application\/xhtml\+xml/i.test(contentType)
  ) {
    throw new Error(`Expected ${descriptor.sourceCategory.toUpperCase()} source, but fetch returned HTML.`);
  }

  if (descriptor.fetchMode === "fetch_html") {
    return runOffscreenExtraction({
      type: "OFFSCREEN_EXTRACT_CONTENT",
      sourceCategory: "canvas_native_html",
      extractionMethod: descriptor.extractionMethod,
      html: await response.text(),
      title: record.sourcePageTitle || record.fileName || "",
      fallbackText: record.bodyText || record.excerpt || ""
    });
  }

  if (descriptor.fetchMode === "fetch_text") {
    const text = await response.text();
    return runOffscreenExtraction({
      type: "OFFSCREEN_EXTRACT_CONTENT",
      sourceCategory: descriptor.sourceCategory,
      extractionMethod: descriptor.extractionMethod,
      text,
      html: descriptor.sourceCategory === "html_file" ? text : "",
      title: record.sourcePageTitle || record.fileName || ""
    });
  }

  if (descriptor.fetchMode === "fetch_binary") {
    return runOffscreenExtraction({
      type: "OFFSCREEN_EXTRACT_CONTENT",
      sourceCategory: descriptor.sourceCategory,
      extractionMethod: descriptor.extractionMethod,
      buffer: await response.arrayBuffer(),
      title: record.sourcePageTitle || record.fileName || "",
      fileName: record.fileName || ""
    });
  }

  throw new Error("Unsupported extraction fetch mode.");
}

function createChunkMeta(record, descriptor) {
  return {
    contentObjectId: record.contentObjectId,
    sourceDocumentId: record.documentId || record.sourceDocumentIds?.[0] || null,
    courseId: record.courseId,
    courseName: record.courseName,
    contentType: record.contentType,
    sourceCanvasUrl: record.sourceCanvasUrl || record.sourcePageUrl || "",
    sourcePageTitle: record.sourcePageTitle || record.fileName || "",
    extractionVersion: "phase4-v1",
    sourceCategory: descriptor.sourceCategory
  };
}

function buildExtractionResultPatch(record, descriptor, extractionResult, chunks) {
  const extractedText = EnrichmentRecordUtils.trimString(extractionResult?.extractedText);
  if (!extractedText) {
    throw new Error("No extractable text found.");
  }

  const now = nowIso();
  return {
    processingState: chunks.length ? "chunked" : "extracted",
    extractionStatus: "extracted",
    normalizationStatus: "normalized",
    enrichmentStatus: inMemoryExtractionState.recordsByContentId?.[record.contentObjectId]?.enrichmentStatus || "not_started",
    extractionMethod: descriptor.extractionMethod,
    extractionVersion: "phase4-v1",
    extractedText,
    extractedHtml: extractionResult?.extractedHtml || "",
    extractedAt: now,
    downloadedAt:
      descriptor.fetchMode === "inline_html"
        ? inMemoryExtractionState.recordsByContentId?.[record.contentObjectId]?.downloadedAt || null
        : now,
    wordCount: Number(extractionResult?.wordCount || 0),
    charCount: Number(extractionResult?.charCount || extractedText.length),
    headingCount: Number(extractionResult?.headingCount || 0),
    chunkCount: chunks.length,
    chunkIds: chunks.map((chunk) => chunk.chunkId),
    normalizationSummary: {
      headingCount: Number(extractionResult?.headingCount || 0),
      headings: extractionResult?.headings || [],
      paragraphCount: Number(extractionResult?.paragraphCount || 0)
    },
    failureReason: "",
    unsupportedReason: "",
    automationReady: Boolean(chunks.length)
  };
}

async function processNextExtractionJob() {
  const job = ExtractionQueueUtils.getNextJob(inMemoryExtractionState);
  if (!job) {
    return false;
  }

  inMemoryExtractionState = ExtractionQueueUtils.startJob(inMemoryExtractionState, job.jobId);
  await persistExtractionState(inMemoryExtractionState);

  const record = getCurrentManifestRecords().find((item) => item.contentObjectId === job.contentObjectId);
  if (!record) {
    inMemoryExtractionState = ExtractionQueueUtils.failJob(inMemoryExtractionState, job.jobId, "Source record missing from current manifest.");
    await persistExtractionState(inMemoryExtractionState);
    return true;
  }

  const descriptor = ExtractContentUtils.createExtractionDescriptor(record);
  if (!descriptor.supported) {
    inMemoryExtractionState = ExtractionQueueUtils.markUnsupported(
      inMemoryExtractionState,
      record.contentObjectId,
      descriptor.unsupportedReason,
      job.trigger
    );
    await persistExtractionState(inMemoryExtractionState);
    logExtractionEvent("warn", `Unsupported extraction: ${record.fileName || record.sourcePageTitle || record.contentObjectId}`);
    return true;
  }

  logExtractionEvent("info", `Extraction started: ${record.fileName || record.sourcePageTitle || record.contentObjectId}`);
  try {
    const extractionResult = await extractContentForRecord(record, descriptor);
    const chunks = ChunkContentUtils.createChunks(createChunkMeta(record, descriptor), extractionResult, {});
    const patch = buildExtractionResultPatch(record, descriptor, extractionResult, chunks);
    inMemoryExtractionState = ExtractionQueueUtils.completeJob(inMemoryExtractionState, job.jobId, patch, chunks);
    await persistExtractionState(inMemoryExtractionState);
    logExtractionEvent("info", `Extraction completed: ${record.fileName || record.sourcePageTitle || record.contentObjectId}`, {
      chunks: chunks.length,
      words: patch.wordCount
    });
  } catch (error) {
    inMemoryExtractionState = ExtractionQueueUtils.failJob(inMemoryExtractionState, job.jobId, error.message);
    await persistExtractionState(inMemoryExtractionState);
    logExtractionEvent("error", `Extraction failed: ${record.fileName || record.sourcePageTitle || record.contentObjectId}`, error.message);
  }
  return true;
}

async function processExtractionQueue() {
  if (activeExtractionPromise) {
    return activeExtractionPromise;
  }

  activeExtractionPromise = (async () => {
    await hydrateState();
    let processed = 0;
    while (processed < Number.MAX_SAFE_INTEGER) {
      const didWork = await processNextExtractionJob();
      if (!didWork) {
        break;
      }
      processed += 1;
      if (EXTRACTION_JOB_CONCURRENCY <= 1) {
        continue;
      }
    }
    return inMemoryState.extractionSummary;
  })().finally(() => {
    activeExtractionPromise = null;
  });

  return activeExtractionPromise;
}

async function enqueueManifestExtractions(options) {
  const records = (options?.records || getCurrentManifestRecords()).filter((record) =>
    ["canvas_page", "assignment", "syllabus", "module_resource", "file_artifact"].includes(record.contentType)
  );
  const queueResult = ExtractionQueueUtils.enqueueRecords(inMemoryExtractionState, records, {
    force: Boolean(options?.force),
    trigger: options?.trigger || "manual"
  });
  inMemoryExtractionState = queueResult.state;
  await persistExtractionState(inMemoryExtractionState);
  return queueResult;
}

async function applyNotionEnrichmentState(execution) {
  if (!execution) {
    return;
  }

  let nextState = inMemoryExtractionState;
  const syncedIds = Array.isArray(execution.syncedContentObjectIds) ? execution.syncedContentObjectIds : [];
  const failedIds = Array.isArray(execution.failedContentObjectIds) ? execution.failedContentObjectIds : [];
  const timestamp = nowIso();

  for (const contentObjectId of syncedIds) {
    const existing = nextState.recordsByContentId?.[contentObjectId];
    if (!existing) {
      continue;
    }

    nextState = ExtractionQueueUtils.upsertExtractionRecord(nextState, contentObjectId, {
      processingState: "notion_enriched",
      enrichmentStatus: "notion_enriched",
      lastEnrichedAt: timestamp,
      automationReady: Boolean(existing.automationReady || existing.chunkCount > 0)
    });
  }

  for (const contentObjectId of failedIds) {
    if (!nextState.recordsByContentId?.[contentObjectId]) {
      continue;
    }
    nextState = ExtractionQueueUtils.upsertExtractionRecord(nextState, contentObjectId, {
      enrichmentStatus: "failed"
    });
  }

  nextState = ExtractionQueueUtils.setLatestEnrichmentResult(nextState, {
    finishedAt: timestamp,
    syncedCount: syncedIds.length,
    failedCount: failedIds.length,
    summary: `Notion enrichment completed for ${syncedIds.length} content item(s).`
  });
  inMemoryExtractionState = nextState;
  await persistExtractionState(inMemoryExtractionState);
  logExtractionEvent("info", "Notion enrichment completed", {
    synced: syncedIds.length,
    failed: failedIds.length
  });
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });
  return tabs[0] || null;
}

async function sendTabMessage(tabId, message) {
  return chrome.tabs.sendMessage(tabId, message);
}

async function ensureContentScript(tabId) {
  try {
    const response = await sendTabMessage(tabId, { type: "PING" });
    if (response?.pong) {
      return;
    }
  } catch (error) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["utils/url.js", "utils/extract.js", "content.js"]
    });
  }
}

function normalizeScanCourse(rawCourse, fallbackUrl) {
  const normalized = RecordUtils.createCourseRecord({
    ...rawCourse,
    courseUrl: rawCourse.courseUrl || fallbackUrl,
    origin: rawCourse.origin
  });

  return {
    ...normalized,
    navSections: { ...(rawCourse.navSections || {}) },
    section:
      rawCourse.section ||
      UrlUtils.inferSectionFromUrl(fallbackUrl || normalized.courseUrl, normalized.courseId) ||
      undefined
  };
}

function mergeScanCourse(existingCourse, incomingCourse) {
  const mergedRecord = RecordUtils.mergeCourseRecords(existingCourse, incomingCourse);
  return {
    ...mergedRecord,
    navSections: {
      ...(existingCourse.navSections || {}),
      ...(incomingCourse.navSections || {})
    },
    section: existingCourse.section || incomingCourse.section || undefined
  };
}

function dedupeCourses(courses) {
  const byCourseId = new Map();

  for (const course of courses) {
    if (!course?.courseId) {
      continue;
    }

    if (!byCourseId.has(course.courseId)) {
      byCourseId.set(course.courseId, course);
      continue;
    }

    byCourseId.set(course.courseId, mergeScanCourse(byCourseId.get(course.courseId), course));
  }

  return Array.from(byCourseId.values());
}

async function detectPageContextOnTab(tabId) {
  const tab = await chrome.tabs.get(tabId);
  await ensureContentScript(tabId);
  const response = await sendTabMessage(tabId, { type: "DETECT_PAGE_CONTEXT" });
  if (!response?.ok) {
    throw new Error(response?.error || "Unable to detect Canvas page context.");
  }

  const pageMode = response.pageMode || UrlUtils.getCanvasPageMode(tab.url || "");
  const course = response.course?.isCanvasCourse
    ? normalizeScanCourse(
        {
          ...response.course,
          courseUrl: UrlUtils.buildCourseHomeUrl(tab.url || "", response.course.courseId, response.course.origin)
        },
        tab.url || ""
      )
    : null;
  const courses = dedupeCourses(
    (response.courses || []).map((courseItem) => normalizeScanCourse(courseItem, courseItem.courseUrl))
  );

  return {
    ok: true,
    tabId,
    tabUrl: tab.url || "",
    pageMode,
    pageTitle: response.pageTitle || tab.title || "",
    course,
    courses
  };
}

async function maybeRequestOriginPermission(origin) {
  if (!origin) {
    return false;
  }

  const originPattern = `${new URL(origin).origin}/*`;
  const alreadyGranted = await chrome.permissions.contains({
    origins: [originPattern]
  });
  if (alreadyGranted) {
    return true;
  }

  if (UrlUtils.isLikelyCanvasHost(new URL(origin).hostname)) {
    return false;
  }

  try {
    return await chrome.permissions.request({
      origins: [originPattern]
    });
  } catch (error) {
    return false;
  }
}

function buildFallbackSectionUrls(course) {
  return {
    home: `${course.origin}/courses/${course.courseId}`,
    files: `${course.origin}/courses/${course.courseId}/files`,
    modules: `${course.origin}/courses/${course.courseId}/modules`,
    pages: `${course.origin}/courses/${course.courseId}/pages`,
    assignments: `${course.origin}/courses/${course.courseId}/assignments`,
    syllabus: `${course.origin}/courses/${course.courseId}/assignments/syllabus`
  };
}

function enqueueUrl(queue, queuedKeys, url, sourceSection) {
  const canonicalUrl = UrlUtils.canonicalizeUrl(url);
  if (!canonicalUrl || queuedKeys.has(canonicalUrl)) {
    return;
  }

  queuedKeys.add(canonicalUrl);
  queue.push({
    url,
    sourceSection
  });
}

function buildInitialQueue(course, currentPageUrl) {
  const queue = [];
  const queuedKeys = new Set();
  const sectionUrls = {
    ...buildFallbackSectionUrls(course),
    ...(course.navSections || {})
  };
  const currentSection = UrlUtils.inferSectionFromUrl(currentPageUrl, course.courseId);

  for (const section of UrlUtils.SOURCE_SECTIONS) {
    const url = sectionUrls[section];
    if (!url) {
      continue;
    }
    enqueueUrl(queue, queuedKeys, url, section);
  }

  if (currentSection) {
    enqueueUrl(queue, queuedKeys, currentPageUrl, currentSection);
  }

  return { queue, queuedKeys };
}

function createEmptyCourseStats() {
  return {
    pagesVisited: 0,
    downloadableCount: 0,
    externalCount: 0,
    ignoredCount: 0
  };
}

function accumulatePageStats(baseStats, pageStats) {
  return {
    pagesVisited: baseStats.pagesVisited + 1,
    downloadableCount: baseStats.downloadableCount + (pageStats?.downloadableCount || 0),
    externalCount: baseStats.externalCount + (pageStats?.externalCount || 0),
    ignoredCount: baseStats.ignoredCount + (pageStats?.ignoredCount || 0)
  };
}

function createInitialCourseProgress(course) {
  return {
    courseId: course.courseId,
    courseName: course.courseName,
    term: course.term || undefined,
    status: "queued",
    message: "Queued",
    pagesVisited: 0,
    documentCount: 0,
    duplicateCountRemoved: 0,
    downloadableCount: 0,
    externalCount: 0,
    ignoredCount: 0,
    errors: [],
    startedAt: null,
    completedAt: null,
    updatedAt: nowIso()
  };
}

function buildInitialCourseProgressMap(courses) {
  return courses.reduce((accumulator, course) => {
    accumulator[course.courseId] = createInitialCourseProgress(course);
    return accumulator;
  }, {});
}

function updateCourseProgress(courseProgress, courseId, patch) {
  const existing = courseProgress[courseId] || createInitialCourseProgress({ courseId, courseName: courseId });
  return {
    ...courseProgress,
    [courseId]: {
      ...existing,
      ...patch,
      updatedAt: nowIso()
    }
  };
}

function buildAggregateStats(courseProgress, queue) {
  const aggregate = {
    coursesScanned: (queue?.completedCourses || 0) + (queue?.failedCourses || 0),
    pagesVisited: 0,
    downloadableCount: 0,
    externalCount: 0,
    ignoredCount: 0
  };

  for (const progress of Object.values(courseProgress || {})) {
    aggregate.pagesVisited += progress.pagesVisited || 0;
    aggregate.downloadableCount += progress.downloadableCount || 0;
    aggregate.externalCount += progress.externalCount || 0;
    aggregate.ignoredCount += progress.ignoredCount || 0;
  }

  return aggregate;
}

function flattenDocumentsByCourse(documentsByCourse) {
  return Array.from(documentsByCourse.values()).flat();
}

function flattenContentItemsByCourse(contentItemsByCourse) {
  return Array.from(contentItemsByCourse.values()).flat();
}

function buildOrderedCourses(coursesById, courseOrder) {
  return (courseOrder || []).map((courseId) => coursesById.get(courseId)).filter(Boolean);
}

function buildAggregateStateSnapshot({
  pageMode,
  status,
  message,
  isScanning,
  queue,
  courseOrder,
  coursesById,
  courseProgress,
  documentsByCourse,
  contentItemsByCourse,
  errors,
  lastScanAt,
  downloadSummary
}) {
  const dedupedDocuments = DedupeUtils.dedupeDocuments(flattenDocumentsByCourse(documentsByCourse));
  const dedupedContentItems = DedupeUtils.dedupeContentItems(flattenContentItemsByCourse(contentItemsByCourse));
  const courses = buildOrderedCourses(coursesById, courseOrder);

  return {
    pageMode,
    status,
    message,
    isScanning,
    currentCourseId: queue?.activeCourseId || null,
    queue,
    courses,
    courseOrder,
    courseProgress,
    documents: dedupedDocuments.items,
    contentItems: dedupedContentItems.items,
    results: dedupedDocuments.items,
    syncRecords: RecordUtils.syncRecordsForDocuments(dedupedDocuments.items, inMemoryState.syncRecords),
    duplicateCountRemoved: dedupedDocuments.duplicatesRemoved,
    stats: buildAggregateStats(courseProgress, queue),
    errors: [...(errors || []).slice(-20)],
    lastScanAt,
    downloadSummary: downloadSummary || null
  };
}

function normalizePageResult(pageResult, fallbackContext) {
  if (!pageResult?.ok) {
    throw new Error(pageResult?.error || "Unknown page scan failure.");
  }

  return {
    pageUrl: pageResult.pageUrl,
    pageTitle: pageResult.pageTitle,
    course: {
      ...fallbackContext,
      ...(pageResult.course || {})
    },
    documents: pageResult.documents || [],
    contentItems: pageResult.contentItems || [],
    followUrls: pageResult.followUrls || [],
    paginationUrls: pageResult.paginationUrls || [],
    stats: pageResult.stats || createEmptyCourseStats()
  };
}

async function fetchAndExtractInBackground(url, course, sourceSection) {
  if (typeof DOMParser === "undefined") {
    throw new Error("DOMParser is unavailable in this service worker context.");
  }

  const response = await fetch(url, {
    credentials: "include",
    redirect: "follow"
  });

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    return {
      ok: true,
      pageUrl: response.url || url,
      course,
      pageTitle: "",
      documents: [],
      contentItems: [],
      followUrls: [],
      paginationUrls: [],
      stats: createEmptyCourseStats()
    };
  }

  const html = await response.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const metadata = ExtractUtils.extractCourseMetadata(doc, response.url || url);
  if (!metadata.isCanvasCourse) {
    throw new Error("Fetched page did not resolve to a Canvas course page.");
  }

  const artifacts = ExtractUtils.extractPageArtifacts(doc, {
    origin: course.origin,
    courseId: course.courseId,
    courseName: course.courseName,
    pageUrl: response.url || url,
    sourceSection
  });

  return {
    ok: true,
    pageUrl: response.url || url,
    course: {
      ...metadata,
      courseName: metadata.courseName || course.courseName,
      navSections: {
        ...(course.navSections || {}),
        ...(metadata.navSections || {})
      }
    },
    pageTitle: artifacts.pageTitle,
    documents: artifacts.documents,
    contentItems: artifacts.contentItems,
    followUrls: artifacts.followUrls,
    paginationUrls: artifacts.paginationUrls,
    stats: artifacts.stats
  };
}

async function scanPageViaContentScript(tabId, url, course, sourceSection, currentTabUrl) {
  const currentCanonical = UrlUtils.canonicalizeUrl(currentTabUrl);
  const targetCanonical = UrlUtils.canonicalizeUrl(url);
  await ensureContentScript(tabId);

  if (currentCanonical && currentCanonical === targetCanonical) {
    return sendTabMessage(tabId, {
      type: "SCRAPE_CURRENT_PAGE",
      sourceSection,
      courseName: course.courseName
    });
  }

  return sendTabMessage(tabId, {
    type: "FETCH_AND_SCRAPE",
    url,
    origin: course.origin,
    courseId: course.courseId,
    courseName: course.courseName,
    sourceSection
  });
}

async function scanCoursePage(tabId, url, course, sourceSection, options) {
  if (options.canBackgroundFetch) {
    try {
      return normalizePageResult(await fetchAndExtractInBackground(url, course, sourceSection), course);
    } catch (error) {
      options.errors.push(`Background fetch failed for ${url}: ${error.message}`);
    }
  }

  return normalizePageResult(
    await scanPageViaContentScript(tabId, url, course, sourceSection, options.currentTabUrl),
    course
  );
}

async function performSingleCourseScan(tabId, courseInput, options) {
  let course = normalizeScanCourse(courseInput, courseInput.courseUrl);
  const { queue, queuedKeys } = buildInitialQueue(course, course.courseUrl);
  const visitedUrls = new Set();
  const allDocuments = [];
  const allContentItems = [];
  const errors = [];
  let stats = createEmptyCourseStats();

  while (queue.length && visitedUrls.size < MAX_SCAN_PAGES) {
    const task = queue.shift();
    const canonicalPageUrl = UrlUtils.canonicalizeUrl(task.url);
    if (!canonicalPageUrl || visitedUrls.has(canonicalPageUrl)) {
      continue;
    }

    visitedUrls.add(canonicalPageUrl);
    const sectionLabel = UrlUtils.SECTION_LABELS[task.sourceSection] || task.sourceSection;

    if (options.onProgress) {
      const currentDeduped = DedupeUtils.dedupeDocuments(allDocuments);
      await options.onProgress({
        course: RecordUtils.createCourseRecord(course),
        documents: currentDeduped.items,
        contentItems: DedupeUtils.dedupeContentItems(allContentItems).items,
        duplicateCountRemoved: currentDeduped.duplicatesRemoved,
        stats: {
          ...stats,
          pagesVisited: Math.max(visitedUrls.size - 1, 0)
        },
        errors,
        message: `Scanning ${sectionLabel}`
      });
    }

    try {
      const pageResult = await scanCoursePage(tabId, task.url, course, task.sourceSection, {
        canBackgroundFetch: options.canBackgroundFetch,
        currentTabUrl: options.currentTabUrl,
        errors
      });

      course = mergeScanCourse(course, {
        ...pageResult.course,
        courseUrl:
          course.courseUrl ||
          UrlUtils.buildCourseHomeUrl(pageResult.pageUrl, pageResult.course?.courseId || course.courseId, course.origin)
      });

      const courseRecord = RecordUtils.createCourseRecord(course);
      const normalizedDocuments = pageResult.documents.map((documentItem) =>
        RecordUtils.createDocumentRecord(documentItem, courseRecord)
      );
      const normalizedContentItems = (pageResult.contentItems || []).map((contentItem) =>
        RecordUtils.createContentItemRecord(contentItem, courseRecord)
      );

      allDocuments.push(...normalizedDocuments);
      allContentItems.push(...normalizedContentItems);
      stats = accumulatePageStats(stats, pageResult.stats);

      for (const followUrl of pageResult.followUrls) {
        if (!UrlUtils.isSameCourseUrl(followUrl, course.origin, course.courseId)) {
          continue;
        }
        const inferredSection = UrlUtils.inferSectionFromUrl(followUrl, course.courseId) || task.sourceSection;
        enqueueUrl(queue, queuedKeys, followUrl, inferredSection);
      }

      for (const paginationUrl of pageResult.paginationUrls) {
        enqueueUrl(queue, queuedKeys, paginationUrl, task.sourceSection);
      }
    } catch (error) {
      errors.push(`Scan failed for ${task.url}: ${error.message}`);
    }

    const deduped = DedupeUtils.dedupeDocuments(allDocuments);
    if (options.onProgress) {
      await options.onProgress({
        course: RecordUtils.createCourseRecord(course),
        documents: deduped.items,
        contentItems: DedupeUtils.dedupeContentItems(allContentItems).items,
        duplicateCountRemoved: deduped.duplicatesRemoved,
        stats: {
          ...stats,
          pagesVisited: visitedUrls.size
        },
        errors,
        message: `Found ${deduped.items.length} documents`
      });
    }
  }

  const deduped = DedupeUtils.dedupeDocuments(allDocuments);
  return {
    course: RecordUtils.createCourseRecord(course),
    documents: deduped.items,
    contentItems: DedupeUtils.dedupeContentItems(allContentItems).items,
    duplicateCountRemoved: deduped.duplicatesRemoved,
    errors,
    stats: {
      ...stats,
      pagesVisited: visitedUrls.size
    }
  };
}

function buildScanPlan(detection, request) {
  if (detection.pageMode === "single_course" && detection.course) {
    return {
      pageMode: "single_course",
      courses: [detection.course]
    };
  }

  if (detection.pageMode !== "dashboard") {
    throw new Error("Active tab is not a supported Canvas course or dashboard page.");
  }

  const visibleCourses = dedupeCourses(detection.courses || []);
  if (!visibleCourses.length) {
    throw new Error("No visible courses detected on this Canvas dashboard page.");
  }

  if (request.scanScope === "all_visible") {
    return {
      pageMode: "dashboard",
      courses: visibleCourses
    };
  }

  const selectedIds = Array.isArray(request.courseIds) ? new Set(request.courseIds.filter(Boolean)) : new Set();
  const selectedCourses = visibleCourses.filter((course) => selectedIds.has(course.courseId));
  if (!selectedCourses.length) {
    throw new Error("Select at least one visible course to scan.");
  }

  return {
    pageMode: "dashboard",
    courses: selectedCourses
  };
}

function buildCompletionMessage(documentCount, totalCourses, failedCourses) {
  const courseText = totalCourses === 1 ? "course" : "courses";
  const failureText = failedCourses ? ` ${failedCourses} failed.` : "";
  return `Found ${documentCount} documents across ${totalCourses} ${courseText}.${failureText}`.trim();
}

async function performQueuedScan(tabId, request) {
  const tab = await chrome.tabs.get(tabId);
  if (!tab?.url) {
    throw new Error("Active tab does not have a readable URL.");
  }

  const detection = await detectPageContextOnTab(tabId);
  const plan = buildScanPlan(detection, request);
  const courses = dedupeCourses(plan.courses);
  const courseOrder = courses.map((course) => course.courseId);
  const coursesById = new Map(courses.map((course) => [course.courseId, course]));
  const documentsByCourse = new Map();
  const contentItemsByCourse = new Map();
  let courseProgress = buildInitialCourseProgressMap(courses);
  let queue = {
    requestedCourseIds: [...courseOrder],
    totalCourses: courses.length,
    completedCourses: 0,
    failedCourses: 0,
    activeCourseId: null
  };
  const scanErrors = [];
  const permissionByOrigin = new Map();
  const lastScanAt = nowIso();

  await resetState({
    status: "scanning",
    message: courses.length === 1 ? "Preparing course scan" : `Queued ${courses.length} courses`,
    isScanning: true,
    pageMode: plan.pageMode,
    currentCourseId: null,
    queue,
    courses: buildOrderedCourses(coursesById, courseOrder),
    courseOrder,
    courseProgress,
    documents: [],
    contentItems: [],
    results: [],
    syncRecords: [],
    duplicateCountRemoved: 0,
    errors: [],
    lastScanAt,
    downloadSummary: null
  }, DEFAULT_EXTRACTION_STATE);

  // Queue stays course-granular. Each course persists partial state after every page so
  // popup can recover progress and partial results even if service worker gets suspended.
  for (const course of courses) {
    queue = {
      ...queue,
      activeCourseId: course.courseId
    };
    courseProgress = updateCourseProgress(courseProgress, course.courseId, {
      status: "scanning",
      message: "Preparing course scan",
      startedAt: courseProgress[course.courseId]?.startedAt || nowIso()
    });

    await persistState(
      buildAggregateStateSnapshot({
        pageMode: plan.pageMode,
        status: "scanning",
        message: `Scanning ${course.courseName}`,
        isScanning: true,
        queue,
        courseOrder,
        coursesById,
        courseProgress,
        documentsByCourse,
        contentItemsByCourse,
        errors: scanErrors,
        lastScanAt,
        downloadSummary: null
      })
    );

    try {
      let canBackgroundFetch = false;
      if (permissionByOrigin.has(course.origin)) {
        canBackgroundFetch = permissionByOrigin.get(course.origin);
      } else {
        canBackgroundFetch = await maybeRequestOriginPermission(course.origin);
        permissionByOrigin.set(course.origin, canBackgroundFetch);
      }

      const courseResult = await performSingleCourseScan(tabId, course, {
        canBackgroundFetch,
        currentTabUrl: tab.url,
        onProgress: async (progress) => {
          coursesById.set(course.courseId, mergeScanCourse(coursesById.get(course.courseId) || course, progress.course));
          documentsByCourse.set(course.courseId, progress.documents);
          contentItemsByCourse.set(course.courseId, progress.contentItems || []);
          courseProgress = updateCourseProgress(courseProgress, course.courseId, {
            courseName: progress.course.courseName,
            status: "scanning",
            message: progress.message,
            pagesVisited: progress.stats.pagesVisited,
            documentCount: progress.documents.length,
            duplicateCountRemoved: progress.duplicateCountRemoved,
            downloadableCount: progress.stats.downloadableCount,
            externalCount: progress.stats.externalCount,
            ignoredCount: progress.stats.ignoredCount,
            errors: [...progress.errors].slice(-5)
          });

          await persistState(
            buildAggregateStateSnapshot({
              pageMode: plan.pageMode,
              status: "scanning",
              message: progress.message,
              isScanning: true,
              queue,
              courseOrder,
              coursesById,
              courseProgress,
              documentsByCourse,
              contentItemsByCourse,
              errors: scanErrors,
              lastScanAt,
              downloadSummary: null
            })
          );
        }
      });

      coursesById.set(course.courseId, mergeScanCourse(coursesById.get(course.courseId) || course, courseResult.course));
      documentsByCourse.set(course.courseId, courseResult.documents);
      contentItemsByCourse.set(course.courseId, courseResult.contentItems || []);
      courseProgress = updateCourseProgress(courseProgress, course.courseId, {
        courseName: courseResult.course.courseName,
        status: "complete",
        message: `Complete: ${courseResult.documents.length} documents`,
        pagesVisited: courseResult.stats.pagesVisited,
        documentCount: courseResult.documents.length,
        duplicateCountRemoved: courseResult.duplicateCountRemoved,
        downloadableCount: courseResult.stats.downloadableCount,
        externalCount: courseResult.stats.externalCount,
        ignoredCount: courseResult.stats.ignoredCount,
        errors: [...courseResult.errors].slice(-5),
        completedAt: nowIso()
      });
      queue = {
        ...queue,
        completedCourses: queue.completedCourses + 1,
        activeCourseId: null
      };
    } catch (error) {
      const errorMessage = `Course ${course.courseName} failed: ${error.message}`;
      scanErrors.push(errorMessage);
      courseProgress = updateCourseProgress(courseProgress, course.courseId, {
        status: "error",
        message: errorMessage,
        errors: [...(courseProgress[course.courseId]?.errors || []), error.message].slice(-5),
        completedAt: nowIso()
      });
      queue = {
        ...queue,
        failedCourses: queue.failedCourses + 1,
        activeCourseId: null
      };
    }

    await persistState(
      buildAggregateStateSnapshot({
        pageMode: plan.pageMode,
        status: "scanning",
        message: `Processed ${queue.completedCourses + queue.failedCourses} of ${queue.totalCourses} courses`,
        isScanning: true,
        queue,
        courseOrder,
        coursesById,
        courseProgress,
        documentsByCourse,
        contentItemsByCourse,
        errors: scanErrors,
        lastScanAt,
        downloadSummary: null
      })
    );
  }

  const finalSnapshot = buildAggregateStateSnapshot({
    pageMode: plan.pageMode,
    status: queue.completedCourses ? "complete" : "error",
    message: buildCompletionMessage(
      DedupeUtils.dedupeDocuments(flattenDocumentsByCourse(documentsByCourse)).items.length,
      queue.totalCourses,
      queue.failedCourses
    ),
    isScanning: false,
    queue: {
      ...queue,
      activeCourseId: null
    },
    courseOrder,
    coursesById,
    courseProgress,
    documentsByCourse,
    contentItemsByCourse,
    errors: scanErrors,
    lastScanAt,
    downloadSummary: null
  });

  await persistState(finalSnapshot);
  await enqueueManifestExtractions({
    trigger: "scan_complete"
  });
}

async function downloadDocuments(options) {
  const state = await hydrateState();
  const idSet = Array.isArray(options?.documentIds) ? new Set(options.documentIds) : null;
  const courseId = options?.courseId || null;
  const candidates = (state.documents || []).filter((documentItem) => {
    if (!documentItem.isDownloadable) {
      return false;
    }
    if (courseId && documentItem.courseId !== courseId) {
      return false;
    }
    if (idSet && !idSet.has(documentItem.id)) {
      return false;
    }
    return true;
  });

  let started = 0;
  const skipped = [];

  for (const documentItem of candidates) {
    try {
      await chrome.downloads.download({
        url: documentItem.url,
        filename: documentItem.localDownloadPath || UrlUtils.buildDownloadPath(documentItem),
        conflictAction: "uniquify",
        saveAs: false
      });
      started += 1;
    } catch (error) {
      skipped.push(`${documentItem.fileName || documentItem.url}: ${error.message}`);
    }
  }

  const summary = {
    attempted: candidates.length,
    started,
    skipped,
    courseId
  };

  await persistState({
    downloadSummary: summary
  });
  await enqueueManifestExtractions({
    trigger: "download_requested",
    records: getCurrentManifestRecords().filter(
      (record) => record.contentType === "file_artifact" && candidates.some((item) => item.id === record.documentId)
    )
  });

  return summary;
}

chrome.runtime.onInstalled.addListener(() => {
  resetState(DEFAULT_SCAN_STATE, DEFAULT_EXTRACTION_STATE).catch(() => {});
  NotionStorage.ensureStorageShape().catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.target === "offscreen") {
      return;
    }

    await hydrateState();

    if (!message?.type) {
      sendResponse({ ok: false, error: "Missing message type." });
      return;
    }

    if (message.type === "GET_SCAN_STATE") {
      sendResponse({ ok: true, state: inMemoryState });
      return;
    }

    if (message.type === "GET_EXPORT_MANIFEST") {
      const stored = await chrome.storage.local.get(EXPORT_MANIFEST_KEY);
      sendResponse({
        ok: true,
        manifest: stored[EXPORT_MANIFEST_KEY] || RecordUtils.buildExportManifest(inMemoryState, inMemoryExtractionState)
      });
      return;
    }

    if (message.type === "GET_NOTION_STATE") {
      sendResponse({
        ok: true,
        notion: await NotionSync.getOverview()
      });
      return;
    }

    if (message.type === "GET_NOTION_DESTINATION") {
      sendResponse({
        ok: true,
        destination: await NotionSync.getDestination(),
        notion: await NotionSync.getOverview()
      });
      return;
    }

    if (message.type === "GET_WORKSPACE_PLAN") {
      const workspace = await NotionSync.getWorkspacePlan();
      sendResponse({
        ok: true,
        ...workspace,
        notion: await NotionSync.getOverview()
      });
      return;
    }

    if (message.type === "SAVE_NOTION_DESTINATION" || message.type === "SAVE_NOTION_SETTINGS") {
      sendResponse({
        ok: true,
        notion: await NotionSync.saveSettings({
          ...(message.destination || message.settings || {}),
          accessToken: message.accessToken,
          clearAccessToken: message.clearAccessToken
        })
      });
      return;
    }

    if (message.type === "VALIDATE_WORKSPACE_PLAN" || message.type === "VALIDATE_NOTION_SETTINGS") {
      const result = await NotionSync.runValidation({
        includeRemote: Boolean(message.includeRemote),
        destination: message.destination || null
      });
      sendResponse({
        ok: true,
        validation: result.validation,
        previewPlan: result.previewPlan,
        automationContract: result.automationContract,
        notion: result.overview
      });
      return;
    }

    if (message.type === "PLAN_ACADEMIC_WORKSPACE" || message.type === "PLAN_NOTION_SYNC") {
      const result = await NotionSync.planAcademicWorkspace({
        dryRun: message.dryRun !== false,
        destination: message.destination || null
      });
      sendResponse({
        ok: result.ok,
        job: result.job,
        plan: result.plan,
        automationContract: result.automationContract,
        plannerSummary: result.plannerSummary,
        result: result.result,
        notion: result.overview,
        error: result.ok ? null : result.result?.blockedReason || result.job?.summary || "Notion dry run failed."
      });
      return;
    }

    if (message.type === "RUN_LIVE_NOTION_SYNC") {
      const result = await NotionSync.runLiveSync({
        destination: message.destination || null
      });
      await applyNotionEnrichmentState(result.execution);
      sendResponse({
        ok: result.ok,
        job: result.job,
        plan: result.plan,
        automationContract: result.automationContract,
        plannerSummary: result.plannerSummary,
        result: result.result,
        notion: result.overview,
        error: result.ok ? null : result.result?.blockedReason || result.job?.summary || "Live Notion sync failed."
      });
      return;
    }

    if (message.type === "ENRICH_NOTION_WITH_EXTRACTED_CONTENT") {
      const result = await NotionSync.runLiveSync({
        destination: message.destination || null
      });
      await applyNotionEnrichmentState(result.execution);
      sendResponse({
        ok: result.ok,
        job: result.job,
        notion: result.overview,
        result: result.result,
        error: result.ok ? null : result.result?.blockedReason || result.job?.summary || "Notion enrichment failed."
      });
      return;
    }

    if (message.type === "DETECT_ACTIVE_PAGE") {
      const tab = await getActiveTab();
      if (!tab?.id) {
        sendResponse({ ok: false, error: "No active tab found." });
        return;
      }

      try {
        const detected = await detectPageContextOnTab(tab.id);
        sendResponse({ ok: true, detection: detected });
      } catch (error) {
        sendResponse({ ok: false, error: error.message });
      }
      return;
    }

    if (message.type === "DETECT_ACTIVE_COURSE") {
      const tab = await getActiveTab();
      if (!tab?.id) {
        sendResponse({ ok: false, error: "No active tab found." });
        return;
      }

      try {
        const detected = await detectPageContextOnTab(tab.id);
        sendResponse({
          ok: true,
          tabId: tab.id,
          detection: {
            ok: Boolean(detected.course),
            course: detected.course
              ? {
                  ...detected.course,
                  isCanvasCourse: true
                }
              : null,
            pageTitle: detected.pageTitle
          }
        });
      } catch (error) {
        sendResponse({ ok: false, error: error.message });
      }
      return;
    }

    if (message.type === "START_SCAN") {
      const tab = await getActiveTab();
      if (!tab?.id) {
        sendResponse({ ok: false, error: "No active tab found." });
        return;
      }

      if (activeScanPromise) {
        sendResponse({ ok: false, error: "A scan is already in progress." });
        return;
      }

      activeScanPromise = performQueuedScan(tab.id, message)
        .catch(async (error) => {
          await persistState({
            status: "error",
            message: error.message,
            isScanning: false,
            currentCourseId: null,
            queue: {
              ...(inMemoryState.queue || DEFAULT_SCAN_STATE.queue),
              activeCourseId: null
            },
            errors: [...(inMemoryState.errors || []), error.message].slice(-20)
          });
        })
        .finally(() => {
          activeScanPromise = null;
        });

      sendResponse({ ok: true });
      return;
    }

    if (message.type === "DOWNLOAD_SELECTED") {
      const summary = await downloadDocuments({
        documentIds: message.documentIds
      });
      sendResponse({ ok: true, summary });
      return;
    }

    if (message.type === "DOWNLOAD_COURSE") {
      const summary = await downloadDocuments({
        courseId: message.courseId
      });
      sendResponse({ ok: true, summary });
      return;
    }

    if (message.type === "DOWNLOAD_ALL") {
      const summary = await downloadDocuments({});
      sendResponse({ ok: true, summary });
      return;
    }

    if (message.type === "RUN_EXTRACTION_ON_SCANNED_CONTENT") {
      const queueResult = await enqueueManifestExtractions({
        trigger: "manual_run"
      });
      const summary = await processExtractionQueue();
      sendResponse({
        ok: true,
        queueResult,
        summary,
        state: inMemoryState
      });
      return;
    }

    if (message.type === "RETRY_FAILED_EXTRACTION") {
      const failedRecords = getCurrentManifestRecords().filter((record) => record.extractionStatus === "failed");
      const queueResult = await enqueueManifestExtractions({
        trigger: "retry_failed",
        records: failedRecords,
        force: true
      });
      const summary = await processExtractionQueue();
      sendResponse({
        ok: true,
        queueResult,
        summary,
        state: inMemoryState
      });
      return;
    }

    sendResponse({ ok: false, error: `Unsupported message type: ${message.type}` });
  })().catch((error) => {
    sendResponse({
      ok: false,
      error: error?.message || String(error)
    });
  });

  return true;
});
