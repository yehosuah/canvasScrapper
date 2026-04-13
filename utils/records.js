(function () {
  if (globalThis.CanvasRecordUtils) {
    return;
  }

  const UrlUtils = globalThis.CanvasUrlUtils;
  const ContentPlanning = globalThis.CanvasContentPlanningUtils;
  if (!UrlUtils || !ContentPlanning) {
    throw new Error("CanvasUrlUtils and CanvasContentPlanningUtils must be loaded before CanvasRecordUtils.");
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function inferOrigin(rawUrl) {
    const resolved = UrlUtils.safeUrl(rawUrl);
    return resolved ? new URL(resolved).origin : "";
  }

  function buildCourseKey(courseRecord) {
    const origin = courseRecord.origin || inferOrigin(courseRecord.courseUrl);
    const courseId = courseRecord.courseId || UrlUtils.extractCourseId(courseRecord.courseUrl);
    if (origin && courseId) {
      return `${origin}:${courseId}`;
    }
    return UrlUtils.canonicalizeUrl(courseRecord.courseUrl) || `${origin}:${courseRecord.courseName || "course"}`;
  }

  function createCourseRecord(rawCourse, discoveredAt) {
    const courseId = String(rawCourse.courseId || UrlUtils.extractCourseId(rawCourse.courseUrl) || "").trim();
    const courseUrl = UrlUtils.buildCourseHomeUrl(rawCourse.courseUrl, courseId, rawCourse.origin) || UrlUtils.safeUrl(rawCourse.courseUrl) || "";
    const courseName = (rawCourse.courseName || "").trim() || (courseId ? `Course ${courseId}` : "Untitled course");

    return {
      courseId,
      courseName,
      courseUrl,
      term: rawCourse.term || undefined,
      origin: rawCourse.origin || inferOrigin(courseUrl),
      discoveredAt: rawCourse.discoveredAt || discoveredAt || nowIso()
    };
  }

  function mergeCourseRecords(existingCourse, incomingCourse) {
    const existing = createCourseRecord(existingCourse);
    const incoming = createCourseRecord(incomingCourse, existing.discoveredAt);
    return {
      ...existing,
      courseName: incoming.courseName.length > existing.courseName.length ? incoming.courseName : existing.courseName,
      courseUrl: existing.courseUrl || incoming.courseUrl,
      term: existing.term || incoming.term || undefined,
      origin: existing.origin || incoming.origin,
      discoveredAt: existing.discoveredAt || incoming.discoveredAt
    };
  }

  function createDocumentRecord(rawDocument, courseRecord, discoveredAt) {
    const course = createCourseRecord(courseRecord || rawDocument, discoveredAt);
    const inferredExtension =
      rawDocument.inferredExtension ||
      UrlUtils.guessExtension(rawDocument.fileName || rawDocument.linkText || rawDocument.url);
    const normalized = {
      id: rawDocument.id || "",
      courseId: rawDocument.courseId || course.courseId,
      courseName: rawDocument.courseName || course.courseName,
      sourceSection: rawDocument.sourceSection || "home",
      sourcePageTitle: rawDocument.sourcePageTitle || undefined,
      sourcePageUrl: rawDocument.sourcePageUrl || course.courseUrl,
      linkText: rawDocument.linkText || undefined,
      fileName:
        rawDocument.fileName ||
        UrlUtils.extractFileNameFromUrl(rawDocument.url) ||
        rawDocument.linkText ||
        undefined,
      inferredExtension: inferredExtension || undefined,
      url: rawDocument.url,
      canonicalUrl: rawDocument.canonicalUrl || UrlUtils.canonicalizeUrl(rawDocument.url) || "",
      canvasFileId: rawDocument.canvasFileId || UrlUtils.extractCanvasFileId(rawDocument.url) || undefined,
      isCanvasHosted: Boolean(rawDocument.isCanvasHosted),
      isDownloadable: Boolean(rawDocument.isDownloadable),
      isExternal: Boolean(rawDocument.isExternal),
      mimeGuess: rawDocument.mimeGuess || UrlUtils.getMimeGuess(inferredExtension) || undefined,
      folderHint: rawDocument.folderHint || undefined,
      localDownloadPath: "",
      discoveredAt: rawDocument.discoveredAt || discoveredAt || nowIso(),
      seenInSections: Array.isArray(rawDocument.seenInSections) && rawDocument.seenInSections.length
        ? rawDocument.seenInSections
        : [rawDocument.sourceSection].filter(Boolean),
      sourcePageUrls: Array.isArray(rawDocument.sourcePageUrls) && rawDocument.sourcePageUrls.length
        ? rawDocument.sourcePageUrls
        : [rawDocument.sourcePageUrl].filter(Boolean)
    };

    normalized.localDownloadPath = rawDocument.localDownloadPath || UrlUtils.buildDownloadPath(normalized);
    return normalized;
  }

  function createContentItemRecord(rawContentItem, courseRecord, discoveredAt) {
    const course = createCourseRecord(courseRecord || rawContentItem, discoveredAt);
    return {
      id: rawContentItem.id || "",
      contentType: rawContentItem.contentType || "canvas_page",
      courseId: rawContentItem.courseId || course.courseId,
      courseName: rawContentItem.courseName || course.courseName,
      sourceSection: rawContentItem.sourceSection || "home",
      sourcePageTitle: rawContentItem.sourcePageTitle || rawContentItem.title || undefined,
      sourcePageUrl: rawContentItem.sourcePageUrl || course.courseUrl,
      sourceCanvasUrl: rawContentItem.sourceCanvasUrl || rawContentItem.externalUrl || rawContentItem.sourcePageUrl || course.courseUrl,
      bodyHtml: rawContentItem.bodyHtml || "",
      bodyText: rawContentItem.bodyText || "",
      excerpt: rawContentItem.excerpt || "",
      contentHash: rawContentItem.contentHash || "",
      weekOrModule: rawContentItem.weekOrModule || undefined,
      dueDate: rawContentItem.dueDate || null,
      externalUrl: rawContentItem.externalUrl || "",
      isExternal: Boolean(rawContentItem.isExternal),
      discoveredAt: rawContentItem.discoveredAt || discoveredAt || nowIso()
    };
  }

  function createSyncRecord(documentId, patch) {
    const next = patch || {};
    return {
      documentId,
      exported: Boolean(next.exported),
      notionReady: next.notionReady !== undefined ? Boolean(next.notionReady) : true,
      notionPageId: next.notionPageId || null,
      notionFileUploadId: next.notionFileUploadId || null,
      lastSyncAttempt: next.lastSyncAttempt || null,
      lastSyncStatus: next.lastSyncStatus || "not_started"
    };
  }

  function syncRecordsForDocuments(documents, existingSyncRecords) {
    const existingById = new Map((existingSyncRecords || []).map((record) => [record.documentId, record]));
    return documents.map((documentRecord) => createSyncRecord(documentRecord.id, existingById.get(documentRecord.id)));
  }

  function buildExportManifest(state, extractionState) {
    const generatedAt = nowIso();
    const courses = Array.isArray(state.courses) ? state.courses : [];
    const documents = Array.isArray(state.documents) ? state.documents : [];
    const contentItems = Array.isArray(state.contentItems) ? state.contentItems : [];
    const syncRecords = Array.isArray(state.syncRecords) ? state.syncRecords : [];
    const documentsByCourse = {};

    for (const documentRecord of documents) {
      if (!documentsByCourse[documentRecord.courseId]) {
        documentsByCourse[documentRecord.courseId] = [];
      }
      documentsByCourse[documentRecord.courseId].push(documentRecord.id);
    }

    const contentInventory = ContentPlanning.buildManifestContentInventory(
      {
        courses,
        documents,
        contentItems
      },
      extractionState
    );
    const normalizedExtractionState = extractionState || {
      version: 1,
      queue: [],
      jobHistory: [],
      recordsByContentId: {},
      chunksByContentId: {},
      latestEnrichmentResult: null
    };

    return {
      version: 3,
      generatedAt,
      scan: {
        status: state.status,
        pageMode: state.pageMode,
        message: state.message,
        isScanning: state.isScanning,
        lastScanAt: state.lastScanAt || null,
        updatedAt: state.updatedAt || null,
        duplicateCountRemoved: state.duplicateCountRemoved || 0,
        queue: state.queue || null,
        stats: state.stats || null
      },
      courses,
      documents,
      contentItems,
      syncRecords,
      courseProgress: state.courseProgress || {},
      documentsByCourse,
      contentInventory: contentInventory.records,
      contentChunks: Object.values(normalizedExtractionState.chunksByContentId || {}).flat(),
      extraction: {
        summary: state.extractionSummary || null,
        queue: normalizedExtractionState.queue || [],
        jobHistory: normalizedExtractionState.jobHistory || [],
        latestEnrichmentResult: normalizedExtractionState.latestEnrichmentResult || null
      },
      plannerMetadata: {
        contentInventoryVersion: 2,
        contentPathTypes: contentInventory.summary,
        notionDestinationMode: null
      }
    };
  }

  globalThis.CanvasRecordUtils = {
    buildCourseKey,
    buildExportManifest,
    createCourseRecord,
    createDocumentRecord,
    createContentItemRecord,
    createSyncRecord,
    mergeCourseRecords,
    syncRecordsForDocuments
  };
})();
