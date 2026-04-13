(function () {
  if (globalThis.CanvasNotionModels) {
    return;
  }

  const STORAGE_KEYS = {
    auth: "notionAuth",
    destination: "notionDestination",
    plan: "notionWorkspacePlan",
    automationContract: "notionAutomationContract",
    plannerSummary: "notionPlannerSummary",
    jobs: "notionSyncJobs",
    lastValidation: "notionLastValidation",
    lastSyncResult: "notionLastSyncResult",
    mappings: "notionMappings"
  };

  const WORKSPACE_MODES = ["general", "class_specific"];
  const REMOTE_VALIDATION_STATES = ["not_started", "pending", "validated", "failed"];
  const VALIDATION_STATUSES = ["ok", "warning", "blocked"];
  const JOB_STATUSES = ["idle", "planned", "validating", "ready", "blocked", "syncing", "partially_completed", "completed", "failed"];
  const READINESS_LEVELS = ["metadata_only", "content_ready", "automation_ready_partial"];
  const AUTH_STATUSES = ["disconnected", "connected", "invalid"];
  const CONTENT_PROCESSING_STATUSES = [
    "discovered",
    "downloaded",
    "planned",
    "notion_created",
    "notion_updated",
    "artifact_attached",
    "extraction_pending",
    "extracted",
    "chunked",
    "notion_enriched",
    "automation_ready",
    "failed"
  ];
  const READINESS_LABELS = {
    metadata_only: "Metadata only",
    content_ready: "Content ready",
    automation_ready_partial: "Automation-ready partial"
  };

  const DEFAULT_NOTION_AUTH = {
    authType: "manual_token",
    accessToken: "",
    tokenPreview: "",
    hasToken: false,
    botId: "",
    botName: "",
    workspaceName: "",
    workspaceId: "",
    status: "disconnected",
    connectedAt: null,
    updatedAt: null,
    lastValidatedAt: null,
    lastError: ""
  };

  const DEFAULT_NOTION_MAPPINGS = {
    workspace: {
      destinationPageId: "",
      workspaceMode: "general",
      databases: {
        courses: null,
        content: null,
        deliverables: null,
        studyAssets: null
      },
      courseHubs: {},
      updatedAt: null
    },
    courseEntries: {},
    contentEntries: {},
    deliverableEntries: {}
  };

  const DEFAULT_NOTION_DESTINATION = {
    destinationUrl: "",
    destinationPageId: "",
    workspaceMode: "general",
    targetCourseId: "",
    label: "",
    validatedLocally: false,
    remoteValidationState: "not_started",
    createdAt: null,
    updatedAt: null
  };

  const DEFAULT_NOTION_PLANNER_SUMMARY = {
    generatedAt: null,
    destinationLabel: "",
    workspaceMode: "general",
    plannedTopLevelObjects: 0,
    plannedCourseHubs: 0,
    plannedContentEntries: 0,
    plannedDeliverables: 0,
    plannedStudyAssetContainers: 0,
    directIngestCandidates: 0,
    fileArtifactCandidates: 0,
    extractionPendingItems: 0,
    automationEligibleRecords: 0,
    automationReadyNow: 0,
    warnings: [],
    blockedReasons: [],
    readinessLevel: "metadata_only",
    validationStatus: "warning",
    validationSummary: ""
  };

  function nowIso() {
    return new Date().toISOString();
  }

  function trimString(value) {
    return String(value || "").trim();
  }

  function uniqStrings(values) {
    return Array.from(new Set((values || []).map((value) => trimString(value)).filter(Boolean)));
  }

  function normalizeEnum(value, allowed, fallback) {
    return allowed.includes(value) ? value : fallback;
  }

  function safeDecode(value) {
    try {
      return decodeURIComponent(value);
    } catch (error) {
      return value;
    }
  }

  function formatUuid(value) {
    const compact = trimString(value).replace(/-/g, "").toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(compact)) {
      return trimString(value);
    }

    return [
      compact.slice(0, 8),
      compact.slice(8, 12),
      compact.slice(12, 16),
      compact.slice(16, 20),
      compact.slice(20)
    ].join("-");
  }

  function normalizeNotionId(value) {
    const raw = trimString(value);
    if (!raw) {
      return "";
    }

    const decoded = safeDecode(raw);
    const uuidMatch = decoded.match(
      /[0-9a-fA-F]{32}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/
    );
    if (uuidMatch) {
      return formatUuid(uuidMatch[0]);
    }

    const withoutQuery = decoded.split("?")[0].split("#")[0].replace(/\/$/, "");
    const segments = withoutQuery.split("/").filter(Boolean);
    return trimString(segments[segments.length - 1] || withoutQuery);
  }

  function createNotionPlannerJob(rawJob) {
    const source = rawJob || {};
    return {
      jobId: trimString(source.jobId) || (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `job-${Date.now()}`),
      createdAt: trimString(source.createdAt) || nowIso(),
      status: normalizeEnum(source.status, JOB_STATUSES, "idle"),
      manifestVersion: source.manifestVersion ?? null,
      summary: trimString(source.summary) || "Idle"
    };
  }

  function createNotionSyncResult(rawResult) {
    const source = rawResult || {};
    return {
      jobId: trimString(source.jobId),
      success: Boolean(source.success),
      blockedReason: trimString(source.blockedReason) || null,
      warnings: Array.isArray(source.warnings) ? source.warnings.filter(Boolean) : [],
      createdCount: Number(source.createdCount || 0),
      updatedCount: Number(source.updatedCount || 0),
      skippedCount: Number(source.skippedCount || 0),
      failedCount: Number(source.failedCount || 0),
      artifactAttachedCount: Number(source.artifactAttachedCount || 0),
      plannedTopLevelObjects: Number(source.plannedTopLevelObjects || 0),
      plannedCourseHubs: Number(source.plannedCourseHubs || 0),
      plannedContentEntries: Number(source.plannedContentEntries || 0),
      plannedDeliverables: Number(source.plannedDeliverables || 0),
      plannedStudyAssetContainers: Number(source.plannedStudyAssetContainers || 0),
      directIngestCandidates: Number(source.directIngestCandidates || 0),
      fileArtifactCandidates: Number(source.fileArtifactCandidates || 0),
      extractionPendingItems: Number(source.extractionPendingItems || 0),
      automationEligibleRecords: Number(source.automationEligibleRecords || 0),
      readinessLevel: normalizeEnum(source.readinessLevel, READINESS_LEVELS, "metadata_only"),
      finishedAt: trimString(source.finishedAt) || nowIso()
    };
  }

  function createNotionAuth(rawAuth) {
    const source = rawAuth || {};
    const accessToken = trimString(source.accessToken);
    return {
      authType: "manual_token",
      accessToken,
      tokenPreview: accessToken ? `${accessToken.slice(0, 6)}…${accessToken.slice(-4)}` : "",
      hasToken: Boolean(accessToken),
      botId: trimString(source.botId),
      botName: trimString(source.botName),
      workspaceName: trimString(source.workspaceName),
      workspaceId: trimString(source.workspaceId),
      status: normalizeEnum(source.status, AUTH_STATUSES, accessToken ? "invalid" : "disconnected"),
      connectedAt: trimString(source.connectedAt) || null,
      updatedAt: nowIso(),
      lastValidatedAt: trimString(source.lastValidatedAt) || null,
      lastError: trimString(source.lastError)
    };
  }

  function createNotionMappings(rawMappings) {
    const source = rawMappings || {};
    return {
      workspace: {
        destinationPageId: trimString(source.workspace?.destinationPageId),
        workspaceMode: normalizeEnum(source.workspace?.workspaceMode, WORKSPACE_MODES, "general"),
        databases: {
          courses: source.workspace?.databases?.courses || null,
          content: source.workspace?.databases?.content || null,
          deliverables: source.workspace?.databases?.deliverables || null,
          studyAssets: source.workspace?.databases?.studyAssets || null
        },
        courseHubs: source.workspace?.courseHubs || {},
        updatedAt: trimString(source.workspace?.updatedAt) || null
      },
      courseEntries: source.courseEntries || {},
      contentEntries: source.contentEntries || {},
      deliverableEntries: source.deliverableEntries || {}
    };
  }

  function createPlannerSummary(rawSummary) {
    const source = rawSummary || {};
    return {
      generatedAt: trimString(source.generatedAt) || null,
      destinationLabel: trimString(source.destinationLabel),
      workspaceMode: normalizeEnum(source.workspaceMode, WORKSPACE_MODES, "general"),
      plannedTopLevelObjects: Number(source.plannedTopLevelObjects || 0),
      plannedCourseHubs: Number(source.plannedCourseHubs || 0),
      plannedContentEntries: Number(source.plannedContentEntries || 0),
      plannedDeliverables: Number(source.plannedDeliverables || 0),
      plannedStudyAssetContainers: Number(source.plannedStudyAssetContainers || 0),
      directIngestCandidates: Number(source.directIngestCandidates || 0),
      fileArtifactCandidates: Number(source.fileArtifactCandidates || 0),
      extractionPendingItems: Number(source.extractionPendingItems || 0),
      automationEligibleRecords: Number(source.automationEligibleRecords || 0),
      automationReadyNow: Number(source.automationReadyNow || 0),
      warnings: Array.isArray(source.warnings) ? source.warnings.filter(Boolean) : [],
      blockedReasons: Array.isArray(source.blockedReasons) ? source.blockedReasons.filter(Boolean) : [],
      readinessLevel: normalizeEnum(source.readinessLevel, READINESS_LEVELS, "metadata_only"),
      validationStatus: normalizeEnum(source.validationStatus, VALIDATION_STATUSES, "warning"),
      validationSummary: trimString(source.validationSummary)
    };
  }

  function sortJobs(jobs) {
    return [...(jobs || [])].sort((left, right) => {
      const leftValue = new Date(left?.createdAt || 0).getTime();
      const rightValue = new Date(right?.createdAt || 0).getTime();
      return rightValue - leftValue;
    });
  }

  function getLatestJob(jobs) {
    return sortJobs(jobs)[0] || null;
  }

  globalThis.CanvasNotionModels = {
    AUTH_STATUSES,
    CONTENT_PROCESSING_STATUSES,
    DEFAULT_NOTION_AUTH,
    DEFAULT_NOTION_DESTINATION,
    DEFAULT_NOTION_MAPPINGS,
    DEFAULT_NOTION_PLANNER_SUMMARY,
    JOB_STATUSES,
    READINESS_LABELS,
    READINESS_LEVELS,
    REMOTE_VALIDATION_STATES,
    STORAGE_KEYS,
    VALIDATION_STATUSES,
    WORKSPACE_MODES,
    createNotionAuth,
    createNotionMappings,
    createNotionPlannerJob,
    createNotionSyncResult,
    createPlannerSummary,
    formatUuid,
    getLatestJob,
    normalizeEnum,
    normalizeNotionId,
    nowIso,
    safeDecode,
    sortJobs,
    trimString,
    uniqStrings
  };
})();
