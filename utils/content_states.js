(function () {
  if (globalThis.CanvasContentPlanningUtils) {
    return;
  }

  const UrlUtils = globalThis.CanvasUrlUtils;
  const ExtractContent = globalThis.CanvasExtractContentUtils;
  const Enrichment = globalThis.CanvasEnrichmentRecordUtils;
  if (!UrlUtils || !ExtractContent || !Enrichment) {
    throw new Error("CanvasUrlUtils, CanvasExtractContentUtils, and CanvasEnrichmentRecordUtils must load before CanvasContentPlanningUtils.");
  }

  const CONTENT_OBJECT_TYPES = [
    "course",
    "canvas_page",
    "assignment",
    "syllabus",
    "module_resource",
    "external_resource",
    "file_artifact",
    "text_extract",
    "deliverable",
    "study_asset_container"
  ];
  const CONTENT_PATH_TYPES = ["direct_ingest", "file_artifact", "hybrid", "unknown"];
  const CONTENT_READINESS_STATES = Enrichment.CONTENT_READINESS_STATES;
  const EXTRACTION_STATUSES = Enrichment.EXTRACTION_STATUSES;
  const PROCESSING_STATES = Enrichment.PROCESSING_STATES;
  const AUTOMATION_TYPES = [
    "weekly_task_overview",
    "weekly_content_recap",
    "class_summary",
    "flashcard_generation",
    "review_question_generation"
  ];
  const GENERAL_CONTENT_AUTOMATIONS = [
    "weekly_content_recap",
    "class_summary",
    "flashcard_generation",
    "review_question_generation"
  ];

  function trimString(value) {
    return Enrichment.trimString(value);
  }

  function uniqStrings(values) {
    return Enrichment.uniqStrings(values);
  }

  function stableHash(value) {
    let hash = 0;
    const text = String(value || "");
    for (let index = 0; index < text.length; index += 1) {
      hash = (hash << 5) - hash + text.charCodeAt(index);
      hash |= 0;
    }
    return `h${Math.abs(hash)}`;
  }

  function nowIso() {
    return Enrichment.nowIso();
  }

  function getContentTypeForSection(section) {
    if (section === "assignments") {
      return "assignment";
    }
    if (section === "syllabus") {
      return "syllabus";
    }
    if (section === "modules") {
      return "module_resource";
    }
    if (section === "pages" || section === "home") {
      return "canvas_page";
    }
    return "canvas_page";
  }

  function getSourceTypeForSection(section, contentType) {
    if (contentType === "external_resource") {
      return "external_resource";
    }
    if (contentType === "file_artifact") {
      return "canvas_file";
    }
    if (section === "assignments") {
      return "canvas_assignment";
    }
    if (section === "syllabus") {
      return "canvas_syllabus";
    }
    if (section === "modules") {
      return "canvas_module";
    }
    if (section === "pages") {
      return "canvas_page";
    }
    return "canvas_course";
  }

  function isDirectIngestSection(section) {
    return ["pages", "assignments", "syllabus", "modules", "home"].includes(section);
  }

  function hasDirectContentBody(source) {
    return Boolean(trimString(source.bodyHtml) || trimString(source.bodyText));
  }

  function getEligibleAutomations(contentType, contentPathType) {
    if (contentType === "deliverable") {
      return ["weekly_task_overview", "class_summary"];
    }

    if (contentType === "study_asset_container") {
      return ["flashcard_generation", "review_question_generation"];
    }

    if (contentType === "file_artifact") {
      return [...GENERAL_CONTENT_AUTOMATIONS];
    }

    if (contentPathType === "direct_ingest" || contentPathType === "hybrid") {
      if (contentType === "assignment") {
        return ["weekly_content_recap", "class_summary", "review_question_generation"];
      }
      if (["canvas_page", "syllabus", "module_resource"].includes(contentType)) {
        return [...GENERAL_CONTENT_AUTOMATIONS];
      }
    }

    return [];
  }

  function getBaseExtractionFields(baseRecord) {
    const descriptor = ExtractContent.createExtractionDescriptor(baseRecord);
    const participatesInExtraction = ["canvas_page", "assignment", "syllabus", "module_resource", "file_artifact"].includes(
      baseRecord.contentType
    );

    if (!participatesInExtraction) {
      return {
        sourceCategory: descriptor.sourceCategory,
        supportedExtraction: false,
        processingState: "discovered",
        extractionStatus: "not_applicable",
        normalizationStatus: "not_applicable",
        enrichmentStatus: "not_applicable",
        unsupportedReason: descriptor.unsupportedReason || "",
        contentReadinessState: "discovered"
      };
    }

    if (!descriptor.supported) {
      return {
        sourceCategory: descriptor.sourceCategory,
        supportedExtraction: false,
        processingState: "unsupported_for_extraction",
        extractionStatus: "unsupported",
        normalizationStatus: "not_applicable",
        enrichmentStatus: "not_started",
        unsupportedReason: descriptor.unsupportedReason,
        contentReadinessState: "unsupported_for_extraction"
      };
    }

    return {
      sourceCategory: descriptor.sourceCategory,
      supportedExtraction: true,
      processingState: "discovered",
      extractionStatus: "not_started",
      normalizationStatus: "not_started",
      enrichmentStatus: "not_started",
      unsupportedReason: "",
      contentReadinessState: "discovered",
      extractionMethod: descriptor.extractionMethod,
      extractionVersion: "phase4-v1"
    };
  }

  function createInventoryRecord(rawRecord) {
    const source = rawRecord || {};
    const contentType = CONTENT_OBJECT_TYPES.includes(source.contentType) ? source.contentType : "file_artifact";
    const contentPathType = CONTENT_PATH_TYPES.includes(source.contentPathType) ? source.contentPathType : "unknown";
    const baseRecord = {
      contentObjectId: trimString(source.contentObjectId) || `${contentType}:${stableHash(JSON.stringify(source))}`,
      contentType,
      sourceType: trimString(source.sourceType) || getSourceTypeForSection(source.sourceSection, contentType),
      courseId: trimString(source.courseId),
      courseName: trimString(source.courseName),
      sourceCanvasUrl: trimString(source.sourceCanvasUrl),
      sourceSection: trimString(source.sourceSection) || "home",
      sourcePageTitle: trimString(source.sourcePageTitle),
      sourcePageUrl: trimString(source.sourcePageUrl),
      discoveredAt: trimString(source.discoveredAt) || nowIso(),
      contentPathType,
      sourceDocumentIds: uniqStrings(source.sourceDocumentIds),
      fileName: trimString(source.fileName),
      documentId: trimString(source.documentId),
      localDownloadPath: trimString(source.localDownloadPath),
      bodyHtml: trimString(source.bodyHtml),
      bodyText: trimString(source.bodyText),
      excerpt: trimString(source.excerpt),
      contentHash: trimString(source.contentHash),
      weekOrModule: trimString(source.weekOrModule),
      externalUrl: trimString(source.externalUrl),
      isCanvasHosted: Boolean(source.isCanvasHosted),
      isDownloadable: Boolean(source.isDownloadable),
      isExternal: Boolean(source.isExternal),
      automationEligibility: uniqStrings(source.automationEligibility || getEligibleAutomations(contentType, contentPathType)),
      dueDate: trimString(source.dueDate) || null
    };

    const extractionBase = getBaseExtractionFields(baseRecord);
    return {
      ...baseRecord,
      processingState: Enrichment.normalizeEnum(source.processingState, PROCESSING_STATES, extractionBase.processingState),
      extractionStatus: Enrichment.normalizeEnum(source.extractionStatus, EXTRACTION_STATUSES, extractionBase.extractionStatus),
      normalizationStatus: Enrichment.normalizeEnum(
        source.normalizationStatus,
        Enrichment.NORMALIZATION_STATUSES,
        extractionBase.normalizationStatus
      ),
      enrichmentStatus: Enrichment.normalizeEnum(
        source.enrichmentStatus,
        Enrichment.ENRICHMENT_STATUSES,
        extractionBase.enrichmentStatus
      ),
      contentReadinessState: Enrichment.normalizeEnum(
        source.contentReadinessState,
        CONTENT_READINESS_STATES,
        extractionBase.contentReadinessState
      ),
      sourceCategory: trimString(source.sourceCategory) || extractionBase.sourceCategory || "unsupported",
      supportedExtraction:
        source.supportedExtraction !== undefined ? Boolean(source.supportedExtraction) : extractionBase.supportedExtraction,
      extractionMethod: trimString(source.extractionMethod) || extractionBase.extractionMethod || "",
      extractionVersion: trimString(source.extractionVersion) || extractionBase.extractionVersion || "phase4-v1",
      extractedText: trimString(source.extractedText),
      extractedHtml: trimString(source.extractedHtml),
      extractedAt: trimString(source.extractedAt) || null,
      downloadedAt: trimString(source.downloadedAt) || null,
      wordCount: Number(source.wordCount || 0),
      charCount: Number(source.charCount || 0),
      headingCount: Number(source.headingCount || 0),
      chunkCount: Number(source.chunkCount || 0),
      chunkIds: uniqStrings(source.chunkIds),
      chunks: Array.isArray(source.chunks) ? source.chunks.map(Enrichment.createChunkRecord) : [],
      normalizationSummary: source.normalizationSummary || null,
      automationReady: Boolean(source.automationReady),
      unsupportedReason: trimString(source.unsupportedReason) || extractionBase.unsupportedReason || "",
      failureReason: trimString(source.failureReason)
    };
  }

  function createCourseInventoryRecord(course) {
    return createInventoryRecord({
      contentObjectId: `course:${course.courseId}`,
      contentType: "course",
      sourceType: "canvas_course",
      courseId: course.courseId,
      courseName: course.courseName,
      sourceCanvasUrl: course.courseUrl,
      sourceSection: "home",
      sourcePageTitle: course.courseName,
      discoveredAt: course.discoveredAt,
      contentPathType: "unknown",
      automationEligibility: []
    });
  }

  function createPageInventoryRecord(documentItem) {
    const contentType = getContentTypeForSection(documentItem.sourceSection);
    return createInventoryRecord({
      contentObjectId: `${contentType}:${documentItem.courseId}:${stableHash(
        `${documentItem.sourceSection}:${documentItem.sourcePageUrl || documentItem.sourcePageTitle}`
      )}`,
      contentType,
      sourceType: getSourceTypeForSection(documentItem.sourceSection, contentType),
      courseId: documentItem.courseId,
      courseName: documentItem.courseName,
      sourceCanvasUrl: documentItem.sourcePageUrl || documentItem.url,
      sourceSection: documentItem.sourceSection,
      sourcePageTitle: documentItem.sourcePageTitle || documentItem.fileName || documentItem.linkText,
      sourcePageUrl: documentItem.sourcePageUrl || "",
      discoveredAt: documentItem.discoveredAt,
      contentPathType: "direct_ingest",
      sourceDocumentIds: [documentItem.id]
    });
  }

  function createDeliverableInventoryRecord(documentItem) {
    return createInventoryRecord({
      contentObjectId: `deliverable:${documentItem.courseId}:${stableHash(
        documentItem.sourcePageUrl || documentItem.sourcePageTitle || documentItem.id
      )}`,
      contentType: "deliverable",
      sourceType: "canvas_assignment",
      courseId: documentItem.courseId,
      courseName: documentItem.courseName,
      sourceCanvasUrl: documentItem.sourcePageUrl || documentItem.url,
      sourceSection: "assignments",
      sourcePageTitle: documentItem.sourcePageTitle || documentItem.fileName || documentItem.linkText,
      sourcePageUrl: documentItem.sourcePageUrl || "",
      discoveredAt: documentItem.discoveredAt,
      contentPathType: "direct_ingest",
      sourceDocumentIds: [documentItem.id],
      automationEligibility: ["weekly_task_overview", "class_summary"]
    });
  }

  function createContentItemInventoryRecord(contentItem) {
    const contentType = CONTENT_OBJECT_TYPES.includes(contentItem.contentType)
      ? contentItem.contentType
      : getContentTypeForSection(contentItem.sourceSection);
    const hasBody = hasDirectContentBody(contentItem);
    const isExternal = Boolean(contentItem.isExternal || contentType === "external_resource");
    const contentPathType = isExternal ? "unknown" : hasBody ? "direct_ingest" : "unknown";

    return createInventoryRecord({
      contentObjectId:
        contentItem.id || `${contentType}:${stableHash(contentItem.sourcePageUrl || contentItem.externalUrl || contentItem.sourcePageTitle)}`,
      contentType,
      sourceType:
        contentType === "external_resource"
          ? "external_resource"
          : getSourceTypeForSection(contentItem.sourceSection, contentType),
      courseId: contentItem.courseId,
      courseName: contentItem.courseName,
      sourceCanvasUrl: contentItem.sourceCanvasUrl || contentItem.sourcePageUrl || contentItem.externalUrl || "",
      sourceSection: contentItem.sourceSection,
      sourcePageTitle: contentItem.sourcePageTitle || contentItem.title,
      sourcePageUrl: contentItem.sourcePageUrl || "",
      discoveredAt: contentItem.discoveredAt,
      contentPathType,
      bodyHtml: contentItem.bodyHtml || "",
      bodyText: contentItem.bodyText || "",
      excerpt: contentItem.excerpt || "",
      contentHash: contentItem.contentHash || "",
      weekOrModule: contentItem.weekOrModule || "",
      dueDate: contentItem.dueDate || null,
      externalUrl: contentItem.externalUrl || "",
      isCanvasHosted: false,
      isDownloadable: false,
      isExternal,
      automationEligibility: isExternal ? [] : getEligibleAutomations(contentType, contentPathType)
    });
  }

  function createDeliverableInventoryRecordFromContent(contentItem) {
    return createInventoryRecord({
      contentObjectId: `deliverable:${contentItem.courseId}:${stableHash(contentItem.sourcePageUrl || contentItem.sourcePageTitle || contentItem.id)}`,
      contentType: "deliverable",
      sourceType: "canvas_assignment",
      courseId: contentItem.courseId,
      courseName: contentItem.courseName,
      sourceCanvasUrl: contentItem.sourceCanvasUrl || contentItem.sourcePageUrl,
      sourceSection: "assignments",
      sourcePageTitle: contentItem.sourcePageTitle || "Canvas deliverable",
      sourcePageUrl: contentItem.sourcePageUrl || "",
      discoveredAt: contentItem.discoveredAt,
      contentPathType: hasDirectContentBody(contentItem) ? "direct_ingest" : "unknown",
      bodyHtml: contentItem.bodyHtml || "",
      bodyText: contentItem.bodyText || "",
      excerpt: contentItem.excerpt || "",
      contentHash: contentItem.contentHash || "",
      dueDate: contentItem.dueDate || null,
      automationEligibility: ["weekly_task_overview", "class_summary"]
    });
  }

  function createFileArtifactRecord(documentItem) {
    const sourceType = documentItem.isExternal ? "external_file" : documentItem.isCanvasHosted ? "canvas_file" : "course_file";
    return createInventoryRecord({
      contentObjectId: `file_artifact:${documentItem.id}`,
      contentType: "file_artifact",
      sourceType,
      courseId: documentItem.courseId,
      courseName: documentItem.courseName,
      sourceCanvasUrl: documentItem.url,
      sourceSection: documentItem.sourceSection,
      sourcePageTitle: documentItem.sourcePageTitle || documentItem.fileName || documentItem.linkText,
      sourcePageUrl: documentItem.sourcePageUrl || "",
      discoveredAt: documentItem.discoveredAt,
      contentPathType: documentItem.isDownloadable ? "file_artifact" : "unknown",
      sourceDocumentIds: [documentItem.id],
      fileName: documentItem.fileName || documentItem.linkText,
      documentId: documentItem.id,
      localDownloadPath: documentItem.localDownloadPath || "",
      isCanvasHosted: Boolean(documentItem.isCanvasHosted),
      isDownloadable: Boolean(documentItem.isDownloadable),
      isExternal: Boolean(documentItem.isExternal),
      automationEligibility: getEligibleAutomations("file_artifact", "file_artifact")
    });
  }

  function mergeExtractionState(record, extractionState) {
    const extractionRecord = extractionState?.recordsByContentId?.[record.contentObjectId] || null;
    const chunks = extractionState?.chunksByContentId?.[record.contentObjectId] || [];
    return Enrichment.mergeExtractionIntoContentRecord(record, extractionRecord, chunks);
  }

  function buildManifestContentInventory(manifestLike, extractionState) {
    const courses = Array.isArray(manifestLike?.courses) ? manifestLike.courses : [];
    const documents = Array.isArray(manifestLike?.documents) ? manifestLike.documents : [];
    const contentItems = Array.isArray(manifestLike?.contentItems) ? manifestLike.contentItems : [];
    const records = [];
    const pageRecords = new Map();
    const deliverableRecords = new Map();

    for (const course of courses) {
      records.push(createCourseInventoryRecord(course));
    }

    for (const contentItem of contentItems) {
      const inventoryRecord = createContentItemInventoryRecord(contentItem);
      const inventoryKey = `${inventoryRecord.contentType}:${inventoryRecord.courseId}:${inventoryRecord.sourcePageUrl || inventoryRecord.externalUrl || inventoryRecord.sourcePageTitle}`;
      if (!pageRecords.has(inventoryKey)) {
        pageRecords.set(inventoryKey, inventoryRecord);
      }

      if (inventoryRecord.contentType === "assignment") {
        const deliverableRecord = createDeliverableInventoryRecordFromContent(contentItem);
        if (!deliverableRecords.has(deliverableRecord.contentObjectId)) {
          deliverableRecords.set(deliverableRecord.contentObjectId, deliverableRecord);
        }
      }
    }

    for (const documentItem of documents) {
      if (
        !contentItems.length &&
        isDirectIngestSection(documentItem.sourceSection) &&
        trimString(documentItem.sourcePageUrl || documentItem.sourcePageTitle)
      ) {
        const pageKey = `${documentItem.courseId}:${documentItem.sourceSection}:${documentItem.sourcePageUrl || documentItem.sourcePageTitle}`;
        const existingPageRecord = pageRecords.get(pageKey);
        if (!existingPageRecord) {
          pageRecords.set(pageKey, createPageInventoryRecord(documentItem));
        } else {
          existingPageRecord.sourceDocumentIds = uniqStrings([...existingPageRecord.sourceDocumentIds, documentItem.id]);
        }
      }

      if (
        !contentItems.length &&
        documentItem.sourceSection === "assignments" &&
        trimString(documentItem.sourcePageUrl || documentItem.sourcePageTitle)
      ) {
        const deliverableKey = `${documentItem.courseId}:${documentItem.sourcePageUrl || documentItem.sourcePageTitle}`;
        const existingDeliverable = deliverableRecords.get(deliverableKey);
        if (!existingDeliverable) {
          deliverableRecords.set(deliverableKey, createDeliverableInventoryRecord(documentItem));
        } else {
          existingDeliverable.sourceDocumentIds = uniqStrings([...existingDeliverable.sourceDocumentIds, documentItem.id]);
        }
      }

      records.push(createFileArtifactRecord(documentItem));
    }

    records.push(...pageRecords.values(), ...deliverableRecords.values());
    const enrichedRecords = records.map((record) => mergeExtractionState(record, extractionState));

    const summary = {
      totalRecords: enrichedRecords.length,
      courses: enrichedRecords.filter((record) => record.contentType === "course").length,
      directIngestCandidates: enrichedRecords.filter((record) => record.contentPathType === "direct_ingest").length,
      fileArtifactCandidates: enrichedRecords.filter((record) => record.contentType === "file_artifact").length,
      extractionPendingItems: enrichedRecords.filter((record) =>
        record.supportedExtraction && ["not_started", "pending"].includes(record.extractionStatus)
      ).length,
      extractedItems: enrichedRecords.filter((record) => record.extractionStatus === "extracted").length,
      chunkedItems: enrichedRecords.filter((record) => Number(record.chunkCount || 0) > 0).length,
      unsupportedItems: enrichedRecords.filter((record) => record.extractionStatus === "unsupported").length,
      deliverables: enrichedRecords.filter((record) => record.contentType === "deliverable").length
    };

    return {
      records: enrichedRecords,
      summary
    };
  }

  globalThis.CanvasContentPlanningUtils = {
    AUTOMATION_TYPES,
    CONTENT_OBJECT_TYPES,
    CONTENT_PATH_TYPES,
    CONTENT_READINESS_STATES,
    EXTRACTION_STATUSES,
    PROCESSING_STATES,
    buildManifestContentInventory,
    createInventoryRecord,
    getContentTypeForSection,
    getEligibleAutomations,
    isDirectIngestSection
  };
})();
