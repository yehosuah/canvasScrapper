(function () {
  if (globalThis.CanvasNotionStorage) {
    return;
  }

  const Models = globalThis.CanvasNotionModels;
  const Destination = globalThis.CanvasNotionDestination;
  if (!Models || !Destination) {
    throw new Error("CanvasNotionModels and CanvasNotionDestination must load before CanvasNotionStorage.");
  }

  const KEYS = Models.STORAGE_KEYS;
  const ALL_KEYS = Object.values(KEYS);

  function normalizeValidation(validation) {
    if (!validation) {
      return null;
    }

    return {
      checkedAt: Models.trimString(validation.checkedAt) || null,
      status: Models.normalizeEnum(validation.status, Models.VALIDATION_STATUSES, "blocked"),
      localStatus: Models.normalizeEnum(validation.localStatus, Models.VALIDATION_STATUSES, "blocked"),
      remoteStatus: Models.trimString(validation.remoteStatus) || "not_started",
      warnings: Array.isArray(validation.warnings) ? validation.warnings.filter(Boolean) : [],
      blockedReasons: Array.isArray(validation.blockedReasons) ? validation.blockedReasons.filter(Boolean) : [],
      checks: Array.isArray(validation.checks) ? validation.checks : [],
      summary: Models.trimString(validation.summary),
      manifestSummary: validation.manifestSummary || {},
      plannerSummary: Models.createPlannerSummary(validation.plannerSummary)
    };
  }

  function normalizeWorkspacePlan(plan) {
    if (!plan) {
      return null;
    }

    return {
      planId: Models.trimString(plan.planId) || null,
      generatedAt: Models.trimString(plan.generatedAt) || null,
      destination: Destination.createNotionDestination(plan.destination),
      workspaceMode: Models.normalizeEnum(plan.workspaceMode, Models.WORKSPACE_MODES, "general"),
      topLevelObjects: Array.isArray(plan.topLevelObjects) ? plan.topLevelObjects : [],
      coursePlans: Array.isArray(plan.coursePlans) ? plan.coursePlans : [],
      contentPlans: Array.isArray(plan.contentPlans) ? plan.contentPlans : [],
      deliverablePlans: Array.isArray(plan.deliverablePlans) ? plan.deliverablePlans : [],
      studyAssetPlans: Array.isArray(plan.studyAssetPlans) ? plan.studyAssetPlans : [],
      warnings: Array.isArray(plan.warnings) ? plan.warnings.filter(Boolean) : [],
      blockedReasons: Array.isArray(plan.blockedReasons) ? plan.blockedReasons.filter(Boolean) : [],
      readinessLevel: Models.normalizeEnum(plan.readinessLevel, Models.READINESS_LEVELS, "metadata_only"),
      summary: Models.createPlannerSummary(plan.summary)
    };
  }

  function normalizeAutomationContract(contract) {
    if (!contract) {
      return null;
    }

    return {
      contractVersion: Number(contract.contractVersion || 1),
      generatedAt: Models.trimString(contract.generatedAt) || null,
      destinationPageId: Models.trimString(contract.destinationPageId),
      workspaceMode: Models.normalizeEnum(contract.workspaceMode, Models.WORKSPACE_MODES, "general"),
      records: Array.isArray(contract.records) ? contract.records : [],
      summary: contract.summary || {
        totalRecords: 0,
        recordsWithTextPath: 0,
        extractionPendingRecords: 0,
        dueDateReadyRecords: 0,
        sourceTraceableRecords: 0,
        automationEligibleRecords: 0,
        automationReadyNow: 0
      }
    };
  }

  async function readRawState() {
    const stored = await chrome.storage.local.get(ALL_KEYS);
    return {
      [KEYS.auth]: Models.createNotionAuth(stored[KEYS.auth]),
      [KEYS.destination]: Destination.createNotionDestination(stored[KEYS.destination]),
      [KEYS.plan]: normalizeWorkspacePlan(stored[KEYS.plan]),
      [KEYS.automationContract]: normalizeAutomationContract(stored[KEYS.automationContract]),
      [KEYS.plannerSummary]: Models.createPlannerSummary(stored[KEYS.plannerSummary]),
      [KEYS.jobs]: Models.sortJobs((stored[KEYS.jobs] || []).map((job) => Models.createNotionPlannerJob(job))),
      [KEYS.lastValidation]: normalizeValidation(stored[KEYS.lastValidation]),
      [KEYS.lastSyncResult]: stored[KEYS.lastSyncResult] ? Models.createNotionSyncResult(stored[KEYS.lastSyncResult]) : null,
      [KEYS.mappings]: Models.createNotionMappings(stored[KEYS.mappings])
    };
  }

  async function ensureStorageShape() {
    const state = await readRawState();
    const patch = {};
    const presence = await chrome.storage.local.get(ALL_KEYS);

    if (!(KEYS.auth in presence)) {
      patch[KEYS.auth] = Models.DEFAULT_NOTION_AUTH;
    }
    if (!(KEYS.destination in presence)) {
      patch[KEYS.destination] = state[KEYS.destination];
    }
    if (!(KEYS.plan in presence)) {
      patch[KEYS.plan] = null;
    }
    if (!(KEYS.automationContract in presence)) {
      patch[KEYS.automationContract] = null;
    }
    if (!(KEYS.plannerSummary in presence)) {
      patch[KEYS.plannerSummary] = Models.DEFAULT_NOTION_PLANNER_SUMMARY;
    }
    if (!(KEYS.jobs in presence)) {
      patch[KEYS.jobs] = [];
    }
    if (!(KEYS.lastValidation in presence)) {
      patch[KEYS.lastValidation] = null;
    }
    if (!(KEYS.lastSyncResult in presence)) {
      patch[KEYS.lastSyncResult] = null;
    }
    if (!(KEYS.mappings in presence)) {
      patch[KEYS.mappings] = Models.DEFAULT_NOTION_MAPPINGS;
    }

    if (Object.keys(patch).length) {
      await chrome.storage.local.set(patch);
    }

    return readRawState();
  }

  async function getNotionState() {
    await ensureStorageShape();
    return readRawState();
  }

  async function getNotionDestination() {
    return (await getNotionState())[KEYS.destination];
  }

  async function getNotionAuth() {
    return (await getNotionState())[KEYS.auth];
  }

  async function setNotionAuth(auth) {
    const normalized = Models.createNotionAuth(auth);
    await chrome.storage.local.set({
      [KEYS.auth]: normalized
    });
    return normalized;
  }

  async function setNotionDestination(destination) {
    const normalized = Destination.createNotionDestination(destination);
    await chrome.storage.local.set({
      [KEYS.destination]: normalized
    });
    return normalized;
  }

  async function getNotionWorkspacePlan() {
    return (await getNotionState())[KEYS.plan];
  }

  async function setNotionWorkspacePlan(plan) {
    const normalized = normalizeWorkspacePlan(plan);
    await chrome.storage.local.set({
      [KEYS.plan]: normalized
    });
    return normalized;
  }

  async function clearNotionWorkspacePlan() {
    await chrome.storage.local.set({
      [KEYS.plan]: null
    });
    return null;
  }

  async function getNotionAutomationContract() {
    return (await getNotionState())[KEYS.automationContract];
  }

  async function setNotionAutomationContract(contract) {
    const normalized = normalizeAutomationContract(contract);
    await chrome.storage.local.set({
      [KEYS.automationContract]: normalized
    });
    return normalized;
  }

  async function clearNotionAutomationContract() {
    await chrome.storage.local.set({
      [KEYS.automationContract]: null
    });
    return null;
  }

  async function getNotionPlannerSummary() {
    return (await getNotionState())[KEYS.plannerSummary];
  }

  async function setNotionPlannerSummary(summary) {
    const normalized = Models.createPlannerSummary(summary);
    await chrome.storage.local.set({
      [KEYS.plannerSummary]: normalized
    });
    return normalized;
  }

  async function clearNotionPlannerSummary() {
    await chrome.storage.local.set({
      [KEYS.plannerSummary]: Models.DEFAULT_NOTION_PLANNER_SUMMARY
    });
    return Models.DEFAULT_NOTION_PLANNER_SUMMARY;
  }

  async function getNotionSyncJobs() {
    return (await getNotionState())[KEYS.jobs];
  }

  async function upsertNotionSyncJob(job) {
    const normalized = Models.createNotionPlannerJob(job);
    const jobs = await getNotionSyncJobs();
    const nextJobs = Models.sortJobs([normalized, ...jobs.filter((item) => item.jobId !== normalized.jobId)]).slice(0, 30);
    await chrome.storage.local.set({
      [KEYS.jobs]: nextJobs
    });
    return normalized;
  }

  async function setNotionLastValidation(validation) {
    const normalized = normalizeValidation(validation);
    await chrome.storage.local.set({
      [KEYS.lastValidation]: normalized
    });
    return normalized;
  }

  async function setNotionLastSyncResult(result) {
    const normalized = result ? Models.createNotionSyncResult(result) : null;
    await chrome.storage.local.set({
      [KEYS.lastSyncResult]: normalized
    });
    return normalized;
  }

  async function getNotionMappings() {
    return (await getNotionState())[KEYS.mappings];
  }

  async function setNotionMappings(mappings) {
    const normalized = Models.createNotionMappings(mappings);
    await chrome.storage.local.set({
      [KEYS.mappings]: normalized
    });
    return normalized;
  }

  async function clearPlannerArtifacts() {
    await chrome.storage.local.set({
      [KEYS.plan]: null,
      [KEYS.automationContract]: null,
      [KEYS.plannerSummary]: Models.DEFAULT_NOTION_PLANNER_SUMMARY,
      [KEYS.lastSyncResult]: null
    });
  }

  globalThis.CanvasNotionStorage = {
    clearNotionAutomationContract,
    clearNotionPlannerSummary,
    clearNotionWorkspacePlan,
    clearPlannerArtifacts,
    getNotionAuth,
    getNotionMappings,
    ensureStorageShape,
    getNotionAutomationContract,
    getNotionDestination,
    getNotionPlannerSummary,
    getNotionState,
    getNotionSyncJobs,
    getNotionWorkspacePlan,
    setNotionAutomationContract,
    setNotionAuth,
    setNotionDestination,
    setNotionLastSyncResult,
    setNotionLastValidation,
    setNotionMappings,
    setNotionPlannerSummary,
    setNotionWorkspacePlan,
    upsertNotionSyncJob
  };
})();
