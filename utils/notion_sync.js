(function () {
  if (globalThis.CanvasNotionSync) {
    return;
  }

  const Models = globalThis.CanvasNotionModels;
  const Destination = globalThis.CanvasNotionDestination;
  const Storage = globalThis.CanvasNotionStorage;
  const Validate = globalThis.CanvasNotionValidate;
  const WorkspacePlanner = globalThis.CanvasNotionWorkspacePlanner;
  const AutomationContract = globalThis.CanvasAutomationContract;
  const ContentPlanning = globalThis.CanvasContentPlanningUtils;
  const NotionWorkspace = globalThis.CanvasNotionWorkspace;
  if (!Models || !Destination || !Storage || !Validate || !WorkspacePlanner || !AutomationContract || !ContentPlanning || !NotionWorkspace) {
    throw new Error("Canvas notion sync modules missing dependencies.");
  }

  const EXPORT_MANIFEST_KEY = "canvasCourseExportManifest";
  const EXTRACTION_KEY = "canvasContentExtractionState";

  async function getExportManifest() {
    const stored = await chrome.storage.local.get([EXPORT_MANIFEST_KEY, EXTRACTION_KEY]);
    const manifest = stored[EXPORT_MANIFEST_KEY] || null;
    const extractionState = stored[EXTRACTION_KEY] || null;
    if (!manifest) {
      return null;
    }

    if (Array.isArray(manifest.contentInventory) && manifest.extraction) {
      return manifest;
    }

    const inventory = ContentPlanning.buildManifestContentInventory(manifest, extractionState);
    return {
      ...manifest,
      contentInventory: inventory.records,
      extraction: {
        summary: null,
        queue: extractionState?.queue || [],
        jobHistory: extractionState?.jobHistory || [],
        latestEnrichmentResult: extractionState?.latestEnrichmentResult || null
      },
      plannerMetadata: {
        ...(manifest.plannerMetadata || {}),
        contentInventoryVersion: 2,
        contentPathTypes: inventory.summary,
        notionDestinationMode: null
      }
    };
  }

  async function persistManifestPlannerMetadata(manifest, destination) {
    if (!manifest) {
      return null;
    }

    const nextManifest = {
      ...manifest,
      plannerMetadata: {
        ...(manifest.plannerMetadata || {}),
        notionDestinationMode: destination?.workspaceMode || null
      }
    };

    await chrome.storage.local.set({
      [EXPORT_MANIFEST_KEY]: nextManifest
    });
    return nextManifest;
  }

  function buildManifestSummary(manifest) {
    if (!manifest) {
      return {
        courses: 0,
        documents: 0,
        contentRecords: 0,
        directIngestCandidates: 0,
        fileArtifactCandidates: 0,
        extractionPendingItems: 0,
        lastScanAt: null
      };
    }

    const courses = Array.isArray(manifest.courses) ? manifest.courses : [];
    const documents = Array.isArray(manifest.documents) ? manifest.documents : [];
    const contentInventory = Array.isArray(manifest.contentInventory) ? manifest.contentInventory : [];
    return {
      courses: courses.length,
      documents: documents.length,
      contentRecords: contentInventory.length,
      directIngestCandidates: contentInventory.filter((record) => record.contentPathType === "direct_ingest").length,
      fileArtifactCandidates: contentInventory.filter((record) => record.contentType === "file_artifact").length,
      extractionPendingItems: contentInventory.filter((record) =>
        record.supportedExtraction && ["not_started", "pending"].includes(record.extractionStatus)
      ).length,
      lastScanAt: manifest?.scan?.lastScanAt || null
    };
  }

  function buildPlannerSummary(plan, contract, validation) {
    const baseSummary = Models.createPlannerSummary(plan?.summary);
    return Models.createPlannerSummary({
      ...baseSummary,
      automationEligibleRecords: contract?.summary?.automationEligibleRecords || baseSummary.automationEligibleRecords,
      automationReadyNow: contract?.summary?.automationReadyNow || 0,
      warnings: Array.from(new Set([...(plan?.warnings || []), ...(validation?.warnings || [])])),
      blockedReasons: Array.from(new Set([...(plan?.blockedReasons || []), ...(validation?.blockedReasons || [])])),
      validationStatus: validation?.status || "warning",
      validationSummary: validation?.summary || ""
    });
  }

  function getOverviewStatus(storageState, latestJob) {
    if (latestJob?.status === "blocked" || storageState.notionLastValidation?.status === "blocked") {
      return {
        state: "blocked",
        label: "Blocked"
      };
    }

    if (!storageState.notionDestination.destinationUrl) {
      return {
        state: "destination_missing",
        label: "Destination needed"
      };
    }

    if (
      !Destination.isValidNotionUrl(storageState.notionDestination.destinationUrl) ||
      !storageState.notionDestination.destinationPageId
    ) {
      return {
        state: "blocked",
        label: "Destination invalid"
      };
    }

    if (storageState.notionWorkspacePlan) {
      return {
        state: storageState.notionWorkspacePlan.readinessLevel,
        label: Models.READINESS_LABELS[storageState.notionWorkspacePlan.readinessLevel] || "Planned"
      };
    }

    return {
      state: "ready_for_planning",
      label: "Ready to plan"
    };
  }

  function buildAuthStateLabel(auth) {
    if (!auth?.hasToken) {
      return "Token missing";
    }
    if (auth.status === "connected") {
      return `Connected${auth.botName ? ` · ${auth.botName}` : ""}`;
    }
    if (auth.lastError) {
      return `Token invalid · ${auth.lastError}`;
    }
    return `Token saved · ${auth.tokenPreview || "manual token"}`;
  }

  function buildReadinessMessage(storageState, manifestSummary, latestJob) {
    if (!storageState.notionDestination.destinationUrl) {
      return "Paste destination Notion page URL, choose workspace mode, then plan academic workspace.";
    }

    if (!Destination.isValidNotionUrl(storageState.notionDestination.destinationUrl)) {
      return "Destination must be a valid Notion page URL.";
    }

    if (!storageState.notionDestination.destinationPageId) {
      return "Destination URL saved, but page ID is not parseable yet.";
    }

    if (!manifestSummary.courses && !manifestSummary.documents) {
      return "Run a Canvas scan first so planner has course and content data.";
    }

    if (!storageState.notionAuth?.hasToken) {
      return storageState.notionWorkspacePlan
        ? "Plan ready. Add Notion integration token, then validate and run live sync."
        : "Add Notion integration token to validate destination and run live sync.";
    }

    if (latestJob?.status === "syncing" && latestJob.summary) {
      return latestJob.summary;
    }

    if (latestJob?.status === "blocked" && latestJob.summary) {
      return latestJob.summary;
    }

    if (storageState.notionLastValidation?.summary) {
      return storageState.notionLastValidation.summary;
    }

    if (storageState.notionLastSyncResult?.success) {
      return "Latest live Notion sync completed.";
    }

    if (storageState.notionWorkspacePlan) {
      return "Academic workspace plan saved. Validate destination, then run live sync.";
    }

    return "Validate destination and workspace assumptions, then plan academic workspace.";
  }

  function buildOverviewPayload(storageState, manifest) {
    const latestJob = Models.getLatestJob(storageState.notionSyncJobs);
    const manifestSummary = buildManifestSummary(manifest);
    const overviewStatus = getOverviewStatus(storageState, latestJob);

    return {
      auth: storageState.notionAuth,
      destination: storageState.notionDestination,
      plan: storageState.notionWorkspacePlan,
      automationContract: storageState.notionAutomationContract,
      plannerSummary: storageState.notionPlannerSummary,
      mappings: storageState.notionMappings,
      jobs: storageState.notionSyncJobs,
      latestJob,
      lastValidation: storageState.notionLastValidation,
      lastResult: storageState.notionLastSyncResult,
      manifestSummary,
      readinessState: overviewStatus.state,
      readinessLabel: overviewStatus.label,
      readinessMessage: buildReadinessMessage(storageState, manifestSummary, latestJob),
      authStateLabel: buildAuthStateLabel(storageState.notionAuth),
      authModeLabel: "manual_token"
    };
  }

  function createPlanningResult(jobId, plan, validation, contract, blockedReason) {
    return Models.createNotionSyncResult({
      jobId,
      success: !blockedReason,
      blockedReason: blockedReason || null,
      warnings: Array.from(new Set([...(plan?.warnings || []), ...(validation?.warnings || [])])),
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      failedCount: blockedReason ? 1 : 0,
      artifactAttachedCount: 0,
      plannedTopLevelObjects: plan?.summary?.plannedTopLevelObjects || 0,
      plannedCourseHubs: plan?.summary?.plannedCourseHubs || 0,
      plannedContentEntries: plan?.summary?.plannedContentEntries || 0,
      plannedDeliverables: plan?.summary?.plannedDeliverables || 0,
      plannedStudyAssetContainers: plan?.summary?.plannedStudyAssetContainers || 0,
      directIngestCandidates: plan?.summary?.directIngestCandidates || 0,
      fileArtifactCandidates: plan?.summary?.fileArtifactCandidates || 0,
      extractionPendingItems: plan?.summary?.extractionPendingItems || 0,
      automationEligibleRecords: contract?.summary?.automationEligibleRecords || 0,
      readinessLevel: plan?.readinessLevel || "metadata_only"
    });
  }

  function createExecutionResult(jobId, plan, contract, execution) {
    return Models.createNotionSyncResult({
      jobId,
      success: !execution.failures.length,
      blockedReason: execution.failures[0] || null,
      warnings: execution.warnings || [],
      createdCount: execution.counts.created,
      updatedCount: execution.counts.updated,
      skippedCount: execution.counts.skipped,
      failedCount: execution.counts.failed,
      artifactAttachedCount: execution.counts.artifactAttached,
      plannedTopLevelObjects: plan?.summary?.plannedTopLevelObjects || 0,
      plannedCourseHubs: plan?.summary?.plannedCourseHubs || 0,
      plannedContentEntries: plan?.summary?.plannedContentEntries || 0,
      plannedDeliverables: plan?.summary?.plannedDeliverables || 0,
      plannedStudyAssetContainers: plan?.summary?.plannedStudyAssetContainers || 0,
      directIngestCandidates: plan?.summary?.directIngestCandidates || 0,
      fileArtifactCandidates: plan?.summary?.fileArtifactCandidates || 0,
      extractionPendingItems: plan?.summary?.extractionPendingItems || 0,
      automationEligibleRecords: contract?.summary?.automationEligibleRecords || 0,
      readinessLevel: plan?.readinessLevel || "metadata_only"
    });
  }

  async function upsertJob(job, patch) {
    const nextJob = Models.createNotionPlannerJob({
      ...job,
      ...(patch || {})
    });
    await Storage.upsertNotionSyncJob(nextJob);
    return nextJob;
  }

  async function syncAuthFromValidation(currentAuth, validation) {
    if (!validation?.remoteDetails) {
      return currentAuth;
    }

    const remote = validation.remoteDetails;
    if (remote.ok) {
      const nextAuth = Models.createNotionAuth({
        ...currentAuth,
        status: "connected",
        botId: remote.user?.bot?.owner?.user?.id || remote.user?.id || currentAuth.botId,
        botName: remote.user?.name || currentAuth.botName,
        workspaceName: remote.user?.workspace_name || currentAuth.workspaceName,
        workspaceId: remote.user?.workspace_id || currentAuth.workspaceId,
        connectedAt: currentAuth.connectedAt || Models.nowIso(),
        lastValidatedAt: Models.nowIso(),
        lastError: ""
      });
      await Storage.setNotionAuth(nextAuth);
      return nextAuth;
    }

    const nextAuth = Models.createNotionAuth({
      ...currentAuth,
      status: currentAuth.hasToken ? "invalid" : "disconnected",
      lastValidatedAt: Models.nowIso(),
      lastError: remote.message || validation.summary
    });
    await Storage.setNotionAuth(nextAuth);
    return nextAuth;
  }

  async function getOverview() {
    const storageState = await Storage.getNotionState();
    const manifest = await getExportManifest();
    return buildOverviewPayload(storageState, manifest);
  }

  async function getDestination() {
    return Storage.getNotionDestination();
  }

  async function getWorkspacePlan() {
    return {
      plan: await Storage.getNotionWorkspacePlan(),
      automationContract: await Storage.getNotionAutomationContract(),
      plannerSummary: await Storage.getNotionPlannerSummary()
    };
  }

  async function saveSettings(rawSettings) {
    const currentDestination = await Storage.getNotionDestination();
    const currentAuth = await Storage.getNotionAuth();
    const destinationPatch = rawSettings?.destination || rawSettings || {};
    const authTokenProvided = Object.prototype.hasOwnProperty.call(rawSettings || {}, "accessToken");
    const clearAccessToken = Boolean(rawSettings?.clearAccessToken);
    const nextDestination = Destination.createNotionDestination({
      ...currentDestination,
      ...destinationPatch,
      remoteValidationState: "not_started"
    });
    const nextAuth = Models.createNotionAuth({
      ...currentAuth,
      ...(clearAccessToken ? { accessToken: "" } : authTokenProvided ? { accessToken: rawSettings.accessToken } : {})
    });

    const destinationChanged =
      JSON.stringify({
        destinationUrl: currentDestination.destinationUrl,
        destinationPageId: currentDestination.destinationPageId,
        workspaceMode: currentDestination.workspaceMode,
        targetCourseId: currentDestination.targetCourseId
      }) !==
      JSON.stringify({
        destinationUrl: nextDestination.destinationUrl,
        destinationPageId: nextDestination.destinationPageId,
        workspaceMode: nextDestination.workspaceMode,
        targetCourseId: nextDestination.targetCourseId
      });

    await Storage.setNotionDestination(nextDestination);
    if (authTokenProvided || clearAccessToken) {
      await Storage.setNotionAuth(nextAuth);
    }
    await persistManifestPlannerMetadata(await getExportManifest(), nextDestination);
    await Storage.setNotionLastValidation(null);
    if (destinationChanged) {
      await Storage.clearPlannerArtifacts();
    }

    return getOverview();
  }

  async function saveDestination(rawDestination) {
    return saveSettings(rawDestination || {});
  }

  async function previewPlan(destinationOverride) {
    const destination = destinationOverride
      ? Destination.createNotionDestination(destinationOverride)
      : await Storage.getNotionDestination();
    const manifest = await getExportManifest();
    const plan = WorkspacePlanner.createAcademicWorkspacePlan({
      destination,
      manifest
    });
    const automationContract = AutomationContract.createAutomationContract({
      workspacePlan: plan
    });

    return {
      destination,
      manifest,
      plan,
      automationContract
    };
  }

  async function runValidation(options) {
    const preview = await previewPlan(options?.destination);
    const currentAuth = await Storage.getNotionAuth();
    const validation = await Validate.validateReadiness({
      destination: preview.destination,
      manifest: preview.manifest,
      workspacePlan: preview.plan,
      automationContract: preview.automationContract,
      includeRemote: options?.includeRemote !== false,
      auth: currentAuth
    });

    await Storage.setNotionDestination({
      ...preview.destination,
      validatedLocally: Boolean(preview.destination.destinationUrl && preview.destination.destinationPageId)
    });
    await persistManifestPlannerMetadata(preview.manifest, preview.destination);
    await Storage.setNotionLastValidation(validation);
    await syncAuthFromValidation(currentAuth, validation);

    return {
      validation,
      previewPlan: preview.plan,
      automationContract: preview.automationContract,
      overview: await getOverview()
    };
  }

  async function planAcademicWorkspace(options) {
    if (options?.dryRun === false) {
      return runLiveSync(options);
    }

    const preview = await previewPlan(options?.destination);
    const validation = await Validate.validateReadiness({
      destination: preview.destination,
      manifest: preview.manifest,
      workspacePlan: preview.plan,
      automationContract: preview.automationContract,
      includeRemote: false,
      auth: await Storage.getNotionAuth()
    });
    let job = Models.createNotionPlannerJob({
      status: "idle",
      manifestVersion: preview.manifest?.version ?? null,
      summary: "Preparing academic workspace plan"
    });
    await Storage.upsertNotionSyncJob(job);

    job = await upsertJob(job, {
      status: "validating",
      summary: "Validating academic workspace assumptions"
    });

    await Storage.setNotionDestination(preview.destination);
    await persistManifestPlannerMetadata(preview.manifest, preview.destination);
    await Storage.setNotionLastValidation(validation);

    if (validation.status === "blocked") {
      await Storage.clearPlannerArtifacts();
      const blockedReason = validation.blockedReasons[0] || validation.summary;
      const result = createPlanningResult(job.jobId, preview.plan, validation, preview.automationContract, blockedReason);
      await Storage.setNotionLastSyncResult(result);
      job = await upsertJob(job, {
        status: "blocked",
        summary: blockedReason
      });
      return {
        ok: false,
        job,
        validation,
        plan: null,
        automationContract: null,
        plannerSummary: null,
        result,
        overview: await getOverview()
      };
    }

    const plannerSummary = buildPlannerSummary(preview.plan, preview.automationContract, validation);
    await Storage.setNotionWorkspacePlan({
      ...preview.plan,
      summary: plannerSummary
    });
    await Storage.setNotionAutomationContract(preview.automationContract);
    await Storage.setNotionPlannerSummary(plannerSummary);

    job = await upsertJob(job, {
      status: "ready",
      summary: `${plannerSummary.directIngestCandidates} direct-ingest / ${plannerSummary.fileArtifactCandidates} file-artifact candidates`
    });

    const result = createPlanningResult(job.jobId, preview.plan, validation, preview.automationContract, null);
    await Storage.setNotionLastSyncResult(result);

    return {
      ok: true,
      job,
      validation,
      plan: {
        ...preview.plan,
        summary: plannerSummary
      },
      automationContract: preview.automationContract,
      plannerSummary,
      result,
      overview: await getOverview()
    };
  }

  async function runLiveSync(options) {
    const preview = await previewPlan(options?.destination);
    const currentAuth = await Storage.getNotionAuth();
    let job = Models.createNotionPlannerJob({
      status: "idle",
      manifestVersion: preview.manifest?.version ?? null,
      summary: "Preparing live Notion sync"
    });
    await Storage.upsertNotionSyncJob(job);

    job = await upsertJob(job, {
      status: "validating",
      summary: "Validating Notion auth, destination, and workspace"
    });

    const validation = await Validate.validateReadiness({
      destination: preview.destination,
      manifest: preview.manifest,
      workspacePlan: preview.plan,
      automationContract: preview.automationContract,
      includeRemote: true,
      auth: currentAuth
    });

    await Storage.setNotionDestination(preview.destination);
    await persistManifestPlannerMetadata(preview.manifest, preview.destination);
    await Storage.setNotionLastValidation(validation);
    const auth = await syncAuthFromValidation(currentAuth, validation);

    const plannerSummary = buildPlannerSummary(preview.plan, preview.automationContract, validation);
    await Storage.setNotionWorkspacePlan({
      ...preview.plan,
      summary: plannerSummary
    });
    await Storage.setNotionAutomationContract(preview.automationContract);
    await Storage.setNotionPlannerSummary(plannerSummary);

    if (validation.status === "blocked") {
      const blockedReason = validation.blockedReasons[0] || validation.summary;
      const result = createPlanningResult(job.jobId, preview.plan, validation, preview.automationContract, blockedReason);
      await Storage.setNotionLastSyncResult(result);
      job = await upsertJob(job, {
        status: "blocked",
        summary: blockedReason
      });
      return {
        ok: false,
        job,
        validation,
        plan: null,
        automationContract: null,
        plannerSummary,
        result,
        execution: null,
        overview: await getOverview()
      };
    }

    job = await upsertJob(job, {
      status: "syncing",
      summary: "Creating or updating academic workspace in Notion"
    });

    const execution = await NotionWorkspace.executeWorkspaceSync({
      accessToken: auth.accessToken,
      destination: preview.destination,
      workspacePlan: {
        ...preview.plan,
        summary: plannerSummary
      },
      manifest: preview.manifest,
      mappings: await Storage.getNotionMappings()
    });
    await Storage.setNotionMappings(execution.mappings);

    const result = createExecutionResult(job.jobId, preview.plan, preview.automationContract, execution);
    await Storage.setNotionLastSyncResult(result);

    const hasFailures = execution.counts.failed > 0;
    const hasSuccesses = execution.counts.created > 0 || execution.counts.updated > 0 || execution.counts.artifactAttached > 0;
    const finalStatus = hasFailures ? (hasSuccesses ? "partially_completed" : "failed") : "completed";
    job = await upsertJob(job, {
      status: finalStatus,
      summary: `${execution.counts.created} created · ${execution.counts.updated} updated · ${execution.counts.skipped} skipped · ${execution.counts.failed} failed`
    });

    return {
      ok: !hasFailures,
      job,
      validation,
      plan: {
        ...preview.plan,
        summary: plannerSummary
      },
      automationContract: preview.automationContract,
      plannerSummary,
      result,
      execution,
      overview: await getOverview()
    };
  }

  async function getAuth() {
    return Storage.getNotionAuth();
  }

  globalThis.CanvasNotionSync = {
    getAuth,
    getDestination,
    getOverview,
    getWorkspacePlan,
    planAcademicWorkspace,
    previewPlan,
    runLiveSync,
    runValidation,
    saveDestination,
    saveSettings
  };
})();
