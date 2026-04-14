(function () {
  if (globalThis.CanvasNotionValidate) {
    return;
  }

  const Models = globalThis.CanvasNotionModels;
  const Destination = globalThis.CanvasNotionDestination;
  const NotionApi = globalThis.CanvasNotionApi;
  if (!Models || !Destination || !NotionApi) {
    throw new Error("Canvas notion modules must load before CanvasNotionValidate.");
  }

  function createCheck(name, status, message) {
    return {
      name,
      status,
      message
    };
  }

  function pushCheck(target, name, status, message) {
    target.push(createCheck(name, status, message));
  }

  function buildManifestSummary(manifest) {
    const courses = Array.isArray(manifest?.courses) ? manifest.courses : [];
    const documents = Array.isArray(manifest?.documents) ? manifest.documents : [];
    const contentInventory = Array.isArray(manifest?.contentInventory) ? manifest.contentInventory : [];

    return {
      courses: courses.length,
      documents: documents.length,
      contentRecords: contentInventory.length,
      directIngestCandidates: contentInventory.filter((record) => record.contentPathType === "direct_ingest").length,
      fileArtifactCandidates: contentInventory.filter((record) => record.contentType === "file_artifact").length,
      extractionPendingItems: contentInventory.filter((record) =>
        record.supportedExtraction && ["not_started", "pending"].includes(record.extractionStatus)
      ).length
    };
  }

  function validateLocalReadiness(options) {
    const destination = Destination.createNotionDestination(options?.destination);
    const manifest = options?.manifest || {};
    const workspacePlan = options?.workspacePlan || null;
    const automationContract = options?.automationContract || null;
    const checks = [];
    const warnings = [];
    const blockedReasons = [];
    const manifestSummary = buildManifestSummary(manifest);
    const plannerSummary = Models.createPlannerSummary(workspacePlan?.summary);
    const destinationInput = destination.destinationInput || "";

    if (!destinationInput) {
      blockedReasons.push("Destination page URL or page ID is required.");
      pushCheck(checks, "destination_input", "blocked", "Paste a Notion destination page URL or raw page ID.");
    } else if (destination.destinationUrl) {
      pushCheck(checks, "destination_input", "ok", "Destination Notion page URL saved locally.");
    } else if (Destination.isValidRawPageId(destinationInput)) {
      pushCheck(checks, "destination_input", "ok", "Destination raw Notion page ID saved locally.");
    } else {
      blockedReasons.push("Destination must be a valid Notion page URL or raw page ID.");
      pushCheck(
        checks,
        "destination_input",
        "blocked",
        "Destination input is not a valid Notion page URL or raw page ID."
      );
    }

    if (!destination.destinationPageId) {
      blockedReasons.push("No parseable Notion page ID found in destination input.");
      pushCheck(checks, "destination_page_id", "blocked", "Destination input did not yield a page ID.");
    } else {
      pushCheck(checks, "destination_page_id", "ok", `Parsed page ID ${destination.destinationPageId}.`);
    }

    if (!Models.WORKSPACE_MODES.includes(destination.workspaceMode)) {
      blockedReasons.push("Workspace mode must be general or class-specific.");
      pushCheck(checks, "workspace_mode", "blocked", "Workspace mode invalid.");
    } else {
      pushCheck(checks, "workspace_mode", "ok", `Workspace mode ${destination.workspaceMode}.`);
    }

    if (destination.workspaceMode === "class_specific" && !destination.targetCourseId) {
      blockedReasons.push("Class-specific mode requires a target course.");
      pushCheck(checks, "target_course", "blocked", "Target course missing for class-specific mode.");
    } else if (destination.workspaceMode === "class_specific") {
      pushCheck(checks, "target_course", "ok", `Target course ${destination.targetCourseId} selected.`);
    } else {
      pushCheck(checks, "target_course", "ok", "General workspace mode does not require a target course.");
    }

    if (!manifest || typeof manifest !== "object") {
      blockedReasons.push("Canvas export manifest missing. Run a scan first.");
      pushCheck(checks, "export_manifest", "blocked", "No export manifest found.");
    } else {
      pushCheck(checks, "export_manifest", "ok", "Canvas export manifest available.");
    }

    if (!manifestSummary.courses && !manifestSummary.documents) {
      blockedReasons.push("No scanned/exportable Canvas data found.");
      pushCheck(checks, "manifest_content", "blocked", "Manifest has no courses or documents.");
    } else {
      pushCheck(
        checks,
        "manifest_content",
        "ok",
        `${manifestSummary.courses} courses and ${manifestSummary.documents} documents available for planning.`
      );
    }

    if (!workspacePlan) {
      blockedReasons.push("Workspace plan preview missing.");
      pushCheck(checks, "workspace_plan", "blocked", "Planner did not produce a workspace plan.");
    } else if (workspacePlan.blockedReasons?.length) {
      blockedReasons.push(...workspacePlan.blockedReasons);
      pushCheck(checks, "workspace_plan", "blocked", workspacePlan.blockedReasons[0]);
    } else if (!(workspacePlan.topLevelObjects || []).length && !(workspacePlan.coursePlans || []).length) {
      blockedReasons.push("Workspace plan has no valid target objects.");
      pushCheck(checks, "workspace_plan", "blocked", "Planner returned zero target objects.");
    } else {
      pushCheck(
        checks,
        "workspace_plan",
        "ok",
        `${plannerSummary.plannedTopLevelObjects} root objects and ${plannerSummary.plannedContentEntries} content entries planned.`
      );
    }

    if (manifestSummary.directIngestCandidates) {
      pushCheck(
        checks,
        "direct_ingest",
        "ok",
        `${manifestSummary.directIngestCandidates} Canvas-native items can later land as direct-ingest content.`
      );
    } else {
      warnings.push("No direct-ingest Canvas text found yet. Planner will rely on file artifacts and later extraction.");
      pushCheck(checks, "direct_ingest", "warning", "No direct-ingest candidates detected.");
    }

    if (manifestSummary.fileArtifactCandidates) {
      warnings.push(`${manifestSummary.fileArtifactCandidates} file artifacts still need attachment or extraction flow.`);
      pushCheck(
        checks,
        "file_artifacts",
        "warning",
        `${manifestSummary.fileArtifactCandidates} file-artifact candidates remain extraction-dependent.`
      );
    } else {
      pushCheck(checks, "file_artifacts", "ok", "No file-only artifacts detected in current plan.");
    }

    if (automationContract?.summary?.automationEligibleRecords) {
      pushCheck(
        checks,
        "automation_readiness",
        "ok",
        `${automationContract.summary.automationEligibleRecords} records are eligible for future automations once synced.`
      );
    } else {
      warnings.push("Planner found no records with future automation eligibility.");
      pushCheck(checks, "automation_readiness", "warning", "Automation-readiness is not yet possible from current plan.");
    }

    const status = blockedReasons.length ? "blocked" : warnings.length ? "warning" : "ok";
    const summary =
      blockedReasons[0] ||
      warnings[0] ||
      `Planner ready for ${plannerSummary.plannedContentEntries} content entries and ${plannerSummary.plannedDeliverables} deliverables.`;

    return {
      checkedAt: Models.nowIso(),
      status,
      localStatus: status,
      remoteStatus: "not_started",
      warnings: Array.from(new Set(warnings.filter(Boolean))),
      blockedReasons: Array.from(new Set(blockedReasons.filter(Boolean))),
      checks,
      summary,
      manifestSummary,
      plannerSummary
    };
  }

  async function validateRemoteReadiness(options) {
    const remoteResult = await NotionApi.validateConnection({
      accessToken: options?.auth?.accessToken,
      destinationPageId: options?.destination?.destinationPageId
    });
    if (remoteResult?.ok) {
      let existingChildren = null;
      try {
        existingChildren = await NotionApi.listAllBlockChildren(options?.destination?.destinationPageId, options?.auth?.accessToken);
      } catch (error) {
        existingChildren = null;
      }
      const existingLabels = existingChildren
        ? existingChildren
            .filter((child) => child.type === "child_database" || child.type === "child_page")
            .map((child) => (child.type === "child_database" ? child.child_database?.title : child.child_page?.title))
            .filter(Boolean)
        : [];
      return {
        status: "ok",
        details: remoteResult,
        summary: existingLabels.length
          ? `Connected as ${remoteResult.user?.name || "Notion bot"}. Destination accessible. Existing children: ${existingLabels.join(", ")}.`
          : `Connected as ${remoteResult.user?.name || "Notion bot"}. Destination accessible and ready for first sync.`
      };
    }

    return {
      status: remoteResult?.status === "blocked" ? "blocked" : "warning",
      details: remoteResult,
      summary: remoteResult?.message || "Remote Notion validation failed."
    };
  }

  async function validateReadiness(options) {
    const localResult = validateLocalReadiness(options);
    const combined = {
      ...localResult,
      remoteStatus: "not_started",
      remoteDetails: null
    };

    if (options?.includeRemote && options?.destination?.destinationPageId) {
      const remoteResult = await validateRemoteReadiness({
        destination: options.destination,
        auth: options.auth
      });
      combined.remoteStatus = remoteResult.status;
      combined.remoteDetails = remoteResult.details || null;
      if (remoteResult.status === "warning") {
        combined.warnings = [...combined.warnings, remoteResult.summary];
      }
      if (remoteResult.status === "blocked") {
        combined.blockedReasons = [...combined.blockedReasons, remoteResult.summary];
      }
      if (!combined.blockedReasons.length && combined.status === "ok" && remoteResult.status !== "ok") {
        combined.status = "warning";
        combined.summary = remoteResult.summary;
      } else if (combined.blockedReasons.length) {
        combined.status = "blocked";
        combined.summary = combined.blockedReasons[0];
      }
    }

    return combined;
  }

  globalThis.CanvasNotionValidate = {
    validateLocalReadiness,
    validateReadiness,
    validateRemoteReadiness
  };
})();
