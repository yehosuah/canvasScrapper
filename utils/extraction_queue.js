(function () {
  if (globalThis.CanvasExtractionQueueUtils) {
    return;
  }

  const ExtractContent = globalThis.CanvasExtractContentUtils;
  const Enrichment = globalThis.CanvasEnrichmentRecordUtils;
  if (!ExtractContent || !Enrichment) {
    throw new Error("CanvasExtractContentUtils and CanvasEnrichmentRecordUtils must load before CanvasExtractionQueueUtils.");
  }

  const JOB_STATUSES = ["queued", "processing", "completed", "failed", "unsupported"];
  const HISTORY_LIMIT = 80;

  function trimString(value) {
    return Enrichment.trimString(value);
  }

  function nowIso() {
    return Enrichment.nowIso();
  }

  function createJobId() {
    return globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `extract-${Date.now()}`;
  }

  function normalizeJob(rawJob) {
    const source = rawJob || {};
    return {
      jobId: trimString(source.jobId) || createJobId(),
      contentObjectId: trimString(source.contentObjectId),
      sourceCategory: trimString(source.sourceCategory) || "unknown",
      trigger: trimString(source.trigger) || "manual",
      status: Enrichment.normalizeEnum(source.status, JOB_STATUSES, "queued"),
      attempts: Number(source.attempts || 0),
      createdAt: trimString(source.createdAt) || nowIso(),
      updatedAt: trimString(source.updatedAt) || nowIso(),
      lastError: trimString(source.lastError)
    };
  }

  function normalizeChunkMap(rawChunksByContentId) {
    const next = {};
    for (const [contentObjectId, chunks] of Object.entries(rawChunksByContentId || {})) {
      next[contentObjectId] = Array.isArray(chunks)
        ? chunks.map(Enrichment.createChunkRecord).sort((left, right) => left.chunkIndex - right.chunkIndex)
        : [];
    }
    return next;
  }

  function createExtractionState(rawState) {
    const source = rawState || {};
    return {
      version: Number(source.version || 1),
      queue: Array.isArray(source.queue)
        ? source.queue.map(normalizeJob).map((job) => ({
            ...job,
            status: job.status === "processing" ? "queued" : job.status
          }))
        : [],
      jobHistory: Array.isArray(source.jobHistory)
        ? source.jobHistory.map(normalizeJob).slice(0, HISTORY_LIMIT)
        : [],
      recordsByContentId: Object.fromEntries(
        Object.entries(source.recordsByContentId || {}).map(([contentObjectId, record]) => [
          contentObjectId,
          Enrichment.createExtractionRecord({
            contentObjectId,
            ...(record || {})
          })
        ])
      ),
      chunksByContentId: normalizeChunkMap(source.chunksByContentId),
      latestEnrichmentResult: source.latestEnrichmentResult || null,
      updatedAt: trimString(source.updatedAt) || nowIso()
    };
  }

  function appendHistory(state, job) {
    const history = [normalizeJob(job), ...(state.jobHistory || []).filter((item) => item.jobId !== job.jobId)].slice(0, HISTORY_LIMIT);
    return {
      ...state,
      jobHistory: history
    };
  }

  function upsertExtractionRecord(state, contentObjectId, patch) {
    const existing = state.recordsByContentId[contentObjectId] || Enrichment.createExtractionRecord({
      contentObjectId
    });
    return {
      ...state,
      recordsByContentId: {
        ...state.recordsByContentId,
        [contentObjectId]: Enrichment.createExtractionRecord({
          ...existing,
          ...(patch || {}),
          contentObjectId,
          updatedAt: nowIso()
        })
      },
      updatedAt: nowIso()
    };
  }

  function getQueuedJob(state, contentObjectId) {
    return (state.queue || []).find((job) => job.contentObjectId === contentObjectId);
  }

  function enqueueRecords(state, records, options) {
    let nextState = createExtractionState(state);
    const force = Boolean(options?.force);
    const trigger = trimString(options?.trigger) || "manual";
    let enqueued = 0;
    let skipped = 0;
    let unsupported = 0;

    for (const record of records || []) {
      const contentObjectId = trimString(record?.contentObjectId);
      if (!contentObjectId) {
        skipped += 1;
        continue;
      }

      const descriptor = ExtractContent.createExtractionDescriptor(record);
      if (!descriptor.supported) {
        unsupported += 1;
        nextState = upsertExtractionRecord(nextState, contentObjectId, {
          processingState: "unsupported_for_extraction",
          extractionStatus: "unsupported",
          normalizationStatus: "not_applicable",
          unsupportedReason: descriptor.unsupportedReason,
          automationReady: false
        });
        continue;
      }

      const existingRecord = nextState.recordsByContentId[contentObjectId];
      if (
        !force &&
        existingRecord &&
        (existingRecord.extractionStatus === "extracted" ||
          existingRecord.processingState === "chunked" ||
          existingRecord.processingState === "notion_enriched" ||
          existingRecord.processingState === "automation_ready")
      ) {
        skipped += 1;
        continue;
      }

      if (getQueuedJob(nextState, contentObjectId)) {
        skipped += 1;
        continue;
      }

      const job = normalizeJob({
        contentObjectId,
        sourceCategory: descriptor.sourceCategory,
        trigger,
        status: "queued"
      });

      nextState.queue = [...nextState.queue, job];
      nextState = upsertExtractionRecord(nextState, contentObjectId, {
        processingState: "extraction_pending",
        extractionStatus: "pending",
        normalizationStatus: "not_started",
        failureReason: "",
        unsupportedReason: "",
        extractionMethod: descriptor.extractionMethod,
        automationReady: false
      });
      enqueued += 1;
    }

    nextState.updatedAt = nowIso();
    return {
      state: createExtractionState(nextState),
      enqueued,
      skipped,
      unsupported
    };
  }

  function getNextJob(state) {
    return (state.queue || []).find((job) => job.status === "queued") || null;
  }

  function startJob(state, jobId) {
    const nextState = createExtractionState(state);
    nextState.queue = nextState.queue.map((job) => {
      if (job.jobId !== jobId) {
        return job;
      }
      return normalizeJob({
        ...job,
        status: "processing",
        attempts: Number(job.attempts || 0) + 1,
        updatedAt: nowIso()
      });
    });

    const job = nextState.queue.find((item) => item.jobId === jobId);
    if (job?.contentObjectId) {
      return upsertExtractionRecord(nextState, job.contentObjectId, {
        processingState: "extraction_pending",
        extractionStatus: "pending",
        lastAttemptAt: nowIso(),
        failureReason: ""
      });
    }

    return nextState;
  }

  function finishJob(state, jobId, status, patch) {
    let nextState = createExtractionState(state);
    const job = nextState.queue.find((item) => item.jobId === jobId);
    if (!job) {
      return nextState;
    }

    const finalJob = normalizeJob({
      ...job,
      status,
      updatedAt: nowIso(),
      lastError: patch?.lastError || ""
    });

    nextState.queue = nextState.queue.filter((item) => item.jobId !== jobId);
    nextState = appendHistory(nextState, finalJob);
    nextState.updatedAt = nowIso();
    return nextState;
  }

  function completeJob(state, jobId, recordPatch, chunks) {
    let nextState = createExtractionState(state);
    const job = nextState.queue.find((item) => item.jobId === jobId);
    if (!job) {
      return nextState;
    }

    nextState = upsertExtractionRecord(nextState, job.contentObjectId, {
      ...recordPatch,
      chunkCount: Array.isArray(chunks) ? chunks.length : Number(recordPatch?.chunkCount || 0),
      chunkIds: Array.isArray(chunks) ? chunks.map((chunk) => chunk.chunkId) : recordPatch?.chunkIds || [],
      automationReady: Boolean(Array.isArray(chunks) && chunks.length)
    });
    nextState.chunksByContentId = {
      ...nextState.chunksByContentId,
      [job.contentObjectId]: Array.isArray(chunks) ? chunks.map(Enrichment.createChunkRecord) : []
    };
    nextState = finishJob(nextState, jobId, "completed");
    return createExtractionState(nextState);
  }

  function failJob(state, jobId, failureReason) {
    let nextState = createExtractionState(state);
    const job = nextState.queue.find((item) => item.jobId === jobId);
    if (!job) {
      return nextState;
    }

    nextState = upsertExtractionRecord(nextState, job.contentObjectId, {
      processingState: "extraction_failed",
      extractionStatus: "failed",
      normalizationStatus: "failed",
      failureReason
    });
    nextState = finishJob(nextState, jobId, "failed", {
      lastError: failureReason
    });
    return createExtractionState(nextState);
  }

  function markUnsupported(state, contentObjectId, unsupportedReason, trigger) {
    const descriptorJob = normalizeJob({
      contentObjectId,
      sourceCategory: "unsupported",
      trigger: trigger || "system",
      status: "unsupported"
    });
    let nextState = createExtractionState(state);
    nextState = upsertExtractionRecord(nextState, contentObjectId, {
      processingState: "unsupported_for_extraction",
      extractionStatus: "unsupported",
      normalizationStatus: "not_applicable",
      unsupportedReason
    });
    nextState = appendHistory(nextState, descriptorJob);
    nextState.queue = nextState.queue.filter((job) => job.contentObjectId !== contentObjectId);
    return createExtractionState(nextState);
  }

  function setLatestEnrichmentResult(state, result) {
    return createExtractionState({
      ...state,
      latestEnrichmentResult: result || null,
      updatedAt: nowIso()
    });
  }

  function buildSummary(records, extractionState) {
    const items = Array.isArray(records) ? records : [];
    const state = createExtractionState(extractionState);
    const extractable = items.filter((record) =>
      ["canvas_page", "assignment", "syllabus", "module_resource", "file_artifact"].includes(record.contentType)
    );

    const summary = {
      total: extractable.length,
      extracted: 0,
      pending: state.queue.filter((job) => job.status === "queued" || job.status === "processing").length,
      failed: 0,
      unsupported: 0,
      chunked: 0,
      notionEnriched: 0,
      automationReady: 0,
      latestMessage:
        trimString(state.latestEnrichmentResult?.summary) ||
        (state.jobHistory?.[0]
          ? `${state.jobHistory[0].status.replace(/_/g, " ")} · ${state.jobHistory[0].contentObjectId}`
          : "")
    };

    for (const record of extractable) {
      if (record.extractionStatus === "extracted") {
        summary.extracted += 1;
      }
      if (record.extractionStatus === "failed") {
        summary.failed += 1;
      }
      if (record.extractionStatus === "unsupported") {
        summary.unsupported += 1;
      }
      if (Number(record.chunkCount || 0) > 0 || record.processingState === "chunked") {
        summary.chunked += 1;
      }
      if (record.enrichmentStatus === "notion_enriched" || record.processingState === "notion_enriched") {
        summary.notionEnriched += 1;
      }
      if (record.automationReady || record.contentReadinessState === "automation_ready") {
        summary.automationReady += 1;
      }
    }

    return summary;
  }

  globalThis.CanvasExtractionQueueUtils = {
    HISTORY_LIMIT,
    JOB_STATUSES,
    buildSummary,
    completeJob,
    createExtractionState,
    enqueueRecords,
    failJob,
    getNextJob,
    markUnsupported,
    setLatestEnrichmentResult,
    startJob,
    upsertExtractionRecord
  };
})();
