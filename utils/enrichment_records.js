(function () {
  if (globalThis.CanvasEnrichmentRecordUtils) {
    return;
  }

  const PROCESSING_STATES = [
    "discovered",
    "downloaded",
    "extraction_pending",
    "extracted",
    "extraction_failed",
    "unsupported_for_extraction",
    "chunked",
    "notion_enriched",
    "automation_ready",
    "blocked"
  ];
  const EXTRACTION_STATUSES = ["not_started", "pending", "extracted", "failed", "unsupported", "not_applicable"];
  const NORMALIZATION_STATUSES = ["not_started", "normalized", "failed", "not_applicable"];
  const ENRICHMENT_STATUSES = ["not_started", "pending", "notion_enriched", "failed", "not_applicable"];
  const CONTENT_READINESS_STATES = [
    "discovered",
    "downloaded",
    "extraction_pending",
    "extracted",
    "chunked",
    "notion_enriched",
    "automation_ready",
    "unsupported_for_extraction",
    "blocked"
  ];

  function trimString(value) {
    return String(value || "").trim();
  }

  function normalizeEnum(value, allowed, fallback) {
    return allowed.includes(value) ? value : fallback;
  }

  function uniqStrings(values) {
    return Array.from(new Set((values || []).map((value) => trimString(value)).filter(Boolean)));
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function createChunkRecord(rawChunk) {
    const source = rawChunk || {};
    return {
      chunkId: trimString(source.chunkId),
      chunkIndex: Number(source.chunkIndex || 0),
      chunkText: trimString(source.chunkText),
      tokenEstimate: Number(source.tokenEstimate || 0),
      headingContext: trimString(source.headingContext),
      contentObjectId: trimString(source.contentObjectId),
      sourceDocumentId: trimString(source.sourceDocumentId) || null,
      courseId: trimString(source.courseId),
      courseName: trimString(source.courseName),
      contentType: trimString(source.contentType),
      sourceCanvasUrl: trimString(source.sourceCanvasUrl),
      sourcePageTitle: trimString(source.sourcePageTitle),
      extractionVersion: trimString(source.extractionVersion) || "phase4-v1"
    };
  }

  function createExtractionRecord(rawRecord) {
    const source = rawRecord || {};
    return {
      contentObjectId: trimString(source.contentObjectId),
      processingState: normalizeEnum(source.processingState, PROCESSING_STATES, "discovered"),
      extractionStatus: normalizeEnum(source.extractionStatus, EXTRACTION_STATUSES, "not_started"),
      normalizationStatus: normalizeEnum(source.normalizationStatus, NORMALIZATION_STATUSES, "not_started"),
      enrichmentStatus: normalizeEnum(source.enrichmentStatus, ENRICHMENT_STATUSES, "not_started"),
      extractionMethod: trimString(source.extractionMethod),
      extractionVersion: trimString(source.extractionVersion) || "phase4-v1",
      extractedText: trimString(source.extractedText),
      extractedHtml: trimString(source.extractedHtml),
      extractedAt: trimString(source.extractedAt) || null,
      downloadedAt: trimString(source.downloadedAt) || null,
      lastAttemptAt: trimString(source.lastAttemptAt) || null,
      wordCount: Number(source.wordCount || 0),
      charCount: Number(source.charCount || 0),
      headingCount: Number(source.headingCount || 0),
      chunkCount: Number(source.chunkCount || 0),
      chunkIds: uniqStrings(source.chunkIds),
      normalizationSummary: source.normalizationSummary || null,
      unsupportedReason: trimString(source.unsupportedReason),
      failureReason: trimString(source.failureReason),
      lastEnrichedAt: trimString(source.lastEnrichedAt) || null,
      automationReady: Boolean(source.automationReady),
      updatedAt: trimString(source.updatedAt) || nowIso()
    };
  }

  function deriveReadinessState(baseRecord, extractionRecord) {
    if (extractionRecord?.enrichmentStatus === "notion_enriched") {
      return extractionRecord.automationReady ? "automation_ready" : "notion_enriched";
    }
    if (extractionRecord?.chunkCount > 0 || extractionRecord?.processingState === "chunked") {
      return extractionRecord.automationReady ? "automation_ready" : "chunked";
    }
    if (extractionRecord?.processingState === "unsupported_for_extraction") {
      return "unsupported_for_extraction";
    }
    if (extractionRecord?.processingState === "extraction_failed") {
      return "blocked";
    }
    if (extractionRecord?.processingState === "extracted") {
      return "extracted";
    }
    if (extractionRecord?.processingState === "downloaded") {
      return "downloaded";
    }
    if (extractionRecord?.processingState === "extraction_pending") {
      return "extraction_pending";
    }
    return normalizeEnum(baseRecord?.contentReadinessState, CONTENT_READINESS_STATES, "discovered");
  }

  function mergeExtractionIntoContentRecord(baseRecord, extractionRecord, chunkRecords) {
    const normalizedExtraction = extractionRecord ? createExtractionRecord(extractionRecord) : null;
    const chunks = Array.isArray(chunkRecords) ? chunkRecords.map(createChunkRecord).sort((left, right) => left.chunkIndex - right.chunkIndex) : [];
    const automationReady = Boolean(
      normalizedExtraction?.automationReady ||
        (normalizedExtraction?.chunkCount > 0 && normalizedExtraction?.extractionStatus === "extracted")
    );

    return {
      ...baseRecord,
      processingState: normalizedExtraction?.processingState || baseRecord.processingState || "discovered",
      extractionStatus: normalizedExtraction?.extractionStatus || baseRecord.extractionStatus || "not_started",
      normalizationStatus: normalizedExtraction?.normalizationStatus || "not_started",
      enrichmentStatus: normalizedExtraction?.enrichmentStatus || "not_started",
      extractionMethod: normalizedExtraction?.extractionMethod || "",
      extractionVersion: normalizedExtraction?.extractionVersion || "phase4-v1",
      extractedText: normalizedExtraction?.extractedText || "",
      extractedHtml: normalizedExtraction?.extractedHtml || "",
      extractedAt: normalizedExtraction?.extractedAt || null,
      downloadedAt: normalizedExtraction?.downloadedAt || null,
      wordCount: normalizedExtraction?.wordCount || 0,
      charCount: normalizedExtraction?.charCount || 0,
      headingCount: normalizedExtraction?.headingCount || 0,
      chunkCount: normalizedExtraction?.chunkCount || chunks.length,
      chunkIds: normalizedExtraction?.chunkIds?.length ? normalizedExtraction.chunkIds : chunks.map((chunk) => chunk.chunkId),
      normalizationSummary: normalizedExtraction?.normalizationSummary || null,
      unsupportedReason: normalizedExtraction?.unsupportedReason || baseRecord.unsupportedReason || "",
      failureReason: normalizedExtraction?.failureReason || "",
      automationReady,
      contentReadinessState: deriveReadinessState(baseRecord, {
        ...normalizedExtraction,
        automationReady,
        chunkCount: normalizedExtraction?.chunkCount || chunks.length
      }),
      chunks
    };
  }

  globalThis.CanvasEnrichmentRecordUtils = {
    CONTENT_READINESS_STATES,
    ENRICHMENT_STATUSES,
    EXTRACTION_STATUSES,
    NORMALIZATION_STATUSES,
    PROCESSING_STATES,
    createChunkRecord,
    createExtractionRecord,
    deriveReadinessState,
    mergeExtractionIntoContentRecord,
    normalizeEnum,
    nowIso,
    trimString,
    uniqStrings
  };
})();
