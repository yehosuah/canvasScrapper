(function () {
  if (globalThis.CanvasNotionWorkspacePlanner) {
    return;
  }

  const Models = globalThis.CanvasNotionModels;
  const Destination = globalThis.CanvasNotionDestination;
  const ContentPlanning = globalThis.CanvasContentPlanningUtils;
  if (!Models || !Destination || !ContentPlanning) {
    throw new Error("Canvas notion planning modules must load before CanvasNotionWorkspacePlanner.");
  }

  function buildProperty(name, type, purpose) {
    return {
      name,
      type,
      purpose
    };
  }

  function buildParentTarget(parentType, targetId, targetLabel, targetUrl, plannedObjectKey) {
    return {
      parentType,
      targetId: Models.trimString(targetId) || null,
      targetLabel: Models.trimString(targetLabel) || null,
      targetUrl: Models.trimString(targetUrl) || null,
      plannedObjectKey: Models.trimString(plannedObjectKey) || null
    };
  }

  function buildPlanObject(rawObject) {
    const source = rawObject || {};
    return {
      ...source,
      planObjectId: Models.trimString(source.planObjectId) || (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `obj-${Date.now()}`),
      planType: Models.trimString(source.planType),
      objectType: Models.trimString(source.objectType),
      title: Models.trimString(source.title),
      name: Models.trimString(source.name) || Models.trimString(source.title),
      parentTarget: source.parentTarget || null,
      plannedProperties: Array.isArray(source.plannedProperties) ? source.plannedProperties : [],
      plannedContentLocation: Models.trimString(source.plannedContentLocation),
      relatedCourseId: Models.trimString(source.relatedCourseId) || null,
      metadataOnly: Boolean(source.metadataOnly),
      holdsActualContent: Boolean(source.holdsActualContent),
      futureAutomationOutput: Boolean(source.futureAutomationOutput)
    };
  }

  function buildCoursesDatabasePlan(destination) {
    return buildPlanObject({
      planObjectId: "top:courses_database",
      planType: "courses_database",
      objectType: "database",
      title: "Courses",
      parentTarget: buildParentTarget("destination_page", destination.destinationPageId, destination.label, destination.destinationUrl),
      plannedProperties: [
        buildProperty("Name", "title", "Course display name."),
        buildProperty("Course ID", "rich_text", "Stable Canvas course identifier."),
        buildProperty("Canvas URL", "url", "Trace back to source course."),
        buildProperty("Term", "rich_text", "Academic term when available."),
        buildProperty("Hub URL", "url", "Future link to course hub page.")
      ],
      plannedContentLocation: "database_properties_only",
      metadataOnly: true,
      holdsActualContent: false,
      futureAutomationOutput: false
    });
  }

  function buildContentDatabasePlan(parentTarget) {
    return buildPlanObject({
      planObjectId: "top:content_database",
      planType: "content_database",
      objectType: "database",
      title: "Content",
      parentTarget,
      plannedProperties: [
        buildProperty("Name", "title", "Readable title for content item."),
        buildProperty("Content Type", "select", "Canvas page, assignment, syllabus, module resource, or file artifact."),
        buildProperty("Course", "relation", "Relates content item to course record."),
        buildProperty("Source URL", "url", "Canvas source page or file URL."),
        buildProperty("Source Section", "select", "Canvas section where item was discovered."),
        buildProperty("Content Path", "select", "direct_ingest, file_artifact, hybrid, or unknown."),
        buildProperty("Readiness", "select", "Planning state for content and automations."),
        buildProperty("Extraction Status", "select", "Whether file extraction is still pending."),
        buildProperty("Eligible Automations", "multi_select", "Future Codex outputs allowed for this content.")
      ],
      plannedContentLocation: "database_row_with_page_body",
      metadataOnly: false,
      holdsActualContent: true,
      futureAutomationOutput: false
    });
  }

  function buildDeliverablesDatabasePlan(parentTarget) {
    return buildPlanObject({
      planObjectId: "top:deliverables_database",
      planType: "deliverables_database",
      objectType: "database",
      title: "Deliverables",
      parentTarget,
      plannedProperties: [
        buildProperty("Name", "title", "Assignment or deliverable title."),
        buildProperty("Course", "relation", "Relates deliverable to course record."),
        buildProperty("Source URL", "url", "Trace back to Canvas assignment."),
        buildProperty("Due Date", "date", "Assignment due date when future extraction exposes it."),
        buildProperty("Due Date Available", "checkbox", "Shows whether due date made it into Notion."),
        buildProperty("Eligible Automations", "multi_select", "Weekly task views and summaries that use this item.")
      ],
      plannedContentLocation: "database_row_with_page_body",
      metadataOnly: false,
      holdsActualContent: true,
      futureAutomationOutput: false
    });
  }

  function buildStudyAssetsDatabasePlan(parentTarget) {
    return buildPlanObject({
      planObjectId: "top:study_assets_database",
      planType: "study_assets_database",
      objectType: "database",
      title: "Study Assets",
      parentTarget,
      plannedProperties: [
        buildProperty("Name", "title", "Container name for future study outputs."),
        buildProperty("Course", "relation", "Relates generated study assets to course."),
        buildProperty("Asset Type", "select", "Flashcards, questions, recap, or future study artifact."),
        buildProperty("Source Content", "relation", "Links back to source content rows."),
        buildProperty("Automation Status", "select", "Future automation lifecycle status.")
      ],
      plannedContentLocation: "database_row_with_page_body",
      metadataOnly: false,
      holdsActualContent: true,
      futureAutomationOutput: true
    });
  }

  function buildCourseHubPlan(course, destination) {
    return buildPlanObject({
      planObjectId: `course_hub:${course.courseId}`,
      planType: "course_hub",
      objectType: "page",
      title: `${course.courseName} Hub`,
      parentTarget: buildParentTarget("destination_page", destination.destinationPageId, destination.label, destination.destinationUrl),
      plannedProperties: [
        buildProperty("Canvas URL", "url", "Course traceability."),
        buildProperty("Course ID", "rich_text", "Stable Canvas course identifier.")
      ],
      plannedContentLocation: "page_body_blocks",
      relatedCourseId: course.courseId,
      metadataOnly: false,
      holdsActualContent: true,
      futureAutomationOutput: false
    });
  }

  function buildContentParentTargets(destination, workspaceMode, courseHubPlanId) {
    if (workspaceMode === "class_specific") {
      const classHubTarget = buildParentTarget(
        "planned_page",
        null,
        "Course hub page",
        null,
        courseHubPlanId
      );

      return {
        contentDatabase: buildParentTarget("planned_database", null, "Content database", null, "top:content_database"),
        deliverablesDatabase: buildParentTarget("planned_database", null, "Deliverables database", null, "top:deliverables_database"),
        studyAssetsDatabase: buildParentTarget("planned_database", null, "Study Assets database", null, "top:study_assets_database"),
        contentDatabaseContainer: classHubTarget
      };
    }

    return {
      contentDatabase: buildParentTarget("planned_database", null, "Content database", null, "top:content_database"),
      deliverablesDatabase: buildParentTarget("planned_database", null, "Deliverables database", null, "top:deliverables_database"),
      studyAssetsDatabase: buildParentTarget("planned_database", null, "Study Assets database", null, "top:study_assets_database"),
      contentDatabaseContainer: buildParentTarget("destination_page", destination.destinationPageId, destination.label, destination.destinationUrl)
    };
  }

  function getPlannedReadinessState(record) {
    if (record.automationReady || record.contentReadinessState === "automation_ready") {
      return "automation_ready";
    }
    if (record.enrichmentStatus === "notion_enriched" || record.processingState === "notion_enriched") {
      return "notion_enriched";
    }
    if (Number(record.chunkCount || 0) > 0 || record.processingState === "chunked") {
      return "chunked";
    }
    if (record.extractionStatus === "extracted" || record.processingState === "extracted") {
      return "extracted";
    }
    if (record.processingState === "downloaded") {
      return "downloaded";
    }
    if (record.extractionStatus === "unsupported") {
      return "unsupported_for_extraction";
    }
    if (record.supportedExtraction && ["not_started", "pending"].includes(record.extractionStatus)) {
      return "extraction_pending";
    }
    return record.contentReadinessState || "discovered";
  }

  function buildContentEntryPlan(record, parentTarget) {
    const readinessState = getPlannedReadinessState(record);
    const holdsActualContent = record.contentPathType !== "unknown";
    const contentLocation = record.contentPathType === "direct_ingest"
      ? "page_body_blocks"
      : record.contentPathType === "file_artifact"
        ? "page_attachment_and_artifact_metadata"
        : record.contentPathType === "hybrid"
          ? "page_attachment_and_page_body_blocks"
          : "database_properties_only";

    return buildPlanObject({
      planObjectId: `content_plan:${record.contentObjectId}`,
      planType: "content_entry",
      objectType: "database_page",
      title: record.sourcePageTitle || record.fileName || record.contentType,
      parentTarget,
      plannedProperties: [
        buildProperty("Content Type", "select", `Normalized content type: ${record.contentType}.`),
        buildProperty("Course", "relation", "Links content to course."),
        buildProperty("Source URL", "url", "Canvas page or file source."),
        buildProperty("Source Section", "select", "Canvas source section."),
        buildProperty("Content Path", "select", `Planner path ${record.contentPathType}.`),
        buildProperty("Readiness", "select", `Planner readiness ${readinessState}.`),
        buildProperty("Extraction Status", "select", `Current extraction status ${record.extractionStatus}.`),
        buildProperty("Eligible Automations", "multi_select", "Future Codex outputs allowed for this row.")
      ],
      plannedContentLocation: contentLocation,
      relatedCourseId: record.courseId,
      metadataOnly: !holdsActualContent,
      holdsActualContent,
      futureAutomationOutput: false,
      contentObjectId: record.contentObjectId,
      contentType: record.contentType,
      sourceType: record.sourceType,
      sourceCanvasUrl: record.sourceCanvasUrl,
      sourceSection: record.sourceSection,
      sourcePageTitle: record.sourcePageTitle,
      discoveredAt: record.discoveredAt,
      contentPathType: record.contentPathType,
      extractionStatus: record.extractionStatus,
      processingState: record.processingState,
      supportedExtraction: Boolean(record.supportedExtraction),
      contentReadinessState: readinessState,
      enrichmentStatus: record.enrichmentStatus || "not_started",
      chunkCount: Number(record.chunkCount || 0),
      automationReady: Boolean(record.automationReady),
      automationEligibility: record.automationEligibility || []
    });
  }

  function buildDeliverablePlan(record, parentTarget) {
    return buildPlanObject({
      planObjectId: `deliverable_plan:${record.contentObjectId}`,
      planType: "deliverable",
      objectType: "database_page",
      title: record.sourcePageTitle || "Canvas deliverable",
      parentTarget,
      plannedProperties: [
        buildProperty("Course", "relation", "Links deliverable to course."),
        buildProperty("Source URL", "url", "Trace back to Canvas assignment."),
        buildProperty("Due Date", "date", "Will be populated only when future extraction finds due dates."),
        buildProperty("Due Date Available", "checkbox", "False until due date becomes available."),
        buildProperty("Eligible Automations", "multi_select", "Weekly task and summary automations.")
      ],
      plannedContentLocation: "page_body_blocks",
      relatedCourseId: record.courseId,
      metadataOnly: false,
      holdsActualContent: true,
      futureAutomationOutput: false,
      contentObjectId: record.contentObjectId,
      contentType: record.contentType,
      sourceType: record.sourceType,
      sourceCanvasUrl: record.sourceCanvasUrl,
      sourceSection: record.sourceSection,
      sourcePageTitle: record.sourcePageTitle,
      discoveredAt: record.discoveredAt,
      contentPathType: record.contentPathType,
      extractionStatus: record.extractionStatus,
      contentReadinessState: "notion_content_planned",
      dueDate: record.dueDate || null,
      dueDateAvailability: Boolean(record.dueDate),
      automationEligibility: record.automationEligibility || []
    });
  }

  function buildStudyAssetContainerPlan(course, parentTarget) {
    return buildPlanObject({
      planObjectId: `study_assets:${course.courseId}`,
      planType: "study_asset_container",
      objectType: "database_page",
      title: `${course.courseName} Study Assets`,
      parentTarget,
      plannedProperties: [
        buildProperty("Course", "relation", "Links generated study assets to course."),
        buildProperty("Asset Type", "select", "Future study output type."),
        buildProperty("Automation Status", "select", "Future lifecycle state for automation outputs.")
      ],
      plannedContentLocation: "page_body_blocks",
      relatedCourseId: course.courseId,
      metadataOnly: false,
      holdsActualContent: true,
      futureAutomationOutput: true,
      contentObjectId: `study_asset_container:${course.courseId}`,
      contentType: "study_asset_container",
      sourceType: "planner_generated",
      sourceCanvasUrl: course.courseUrl,
      sourceSection: "home",
      sourcePageTitle: course.courseName,
      discoveredAt: course.discoveredAt,
      contentPathType: "unknown",
      extractionStatus: "not_applicable",
      contentReadinessState: "metadata_planned",
      automationEligibility: ["flashcard_generation", "review_question_generation"]
    });
  }

  function buildTopLevelObjects(destination, workspaceMode, primaryCourseHubId) {
    if (workspaceMode === "class_specific") {
      const hubTarget = buildParentTarget("planned_page", null, "Course hub page", null, primaryCourseHubId);
      return [
        buildPlanObject({
          planObjectId: "top:content_database",
          planType: "content_database",
          objectType: "database",
          title: "Content",
          parentTarget: hubTarget,
          plannedProperties: buildContentDatabasePlan(hubTarget).plannedProperties,
          plannedContentLocation: "database_row_with_page_body",
          metadataOnly: false,
          holdsActualContent: true,
          futureAutomationOutput: false
        }),
        buildPlanObject({
          planObjectId: "top:deliverables_database",
          planType: "deliverables_database",
          objectType: "database",
          title: "Deliverables",
          parentTarget: hubTarget,
          plannedProperties: buildDeliverablesDatabasePlan(hubTarget).plannedProperties,
          plannedContentLocation: "database_row_with_page_body",
          metadataOnly: false,
          holdsActualContent: true,
          futureAutomationOutput: false
        }),
        buildPlanObject({
          planObjectId: "top:study_assets_database",
          planType: "study_assets_database",
          objectType: "database",
          title: "Study Assets",
          parentTarget: hubTarget,
          plannedProperties: buildStudyAssetsDatabasePlan(hubTarget).plannedProperties,
          plannedContentLocation: "database_row_with_page_body",
          metadataOnly: false,
          holdsActualContent: true,
          futureAutomationOutput: true
        })
      ];
    }

    const destinationTarget = buildParentTarget(
      "destination_page",
      destination.destinationPageId,
      destination.label,
      destination.destinationUrl
    );
    return [
      buildCoursesDatabasePlan(destination),
      buildContentDatabasePlan(destinationTarget),
      buildDeliverablesDatabasePlan(destinationTarget),
      buildStudyAssetsDatabasePlan(destinationTarget)
    ];
  }

  function buildPlannerSummary(plan) {
    const contentPlans = Array.isArray(plan?.contentPlans) ? plan.contentPlans : [];
    const deliverablePlans = Array.isArray(plan?.deliverablePlans) ? plan.deliverablePlans : [];
    const studyAssetPlans = Array.isArray(plan?.studyAssetPlans) ? plan.studyAssetPlans : [];
    const directIngestCandidates = contentPlans.filter((item) => item.contentPathType === "direct_ingest").length;
    const fileArtifactCandidates = contentPlans.filter((item) => item.contentPathType === "file_artifact").length;
    const extractionPendingItems = contentPlans.filter((item) =>
      item.supportedExtraction && ["not_started", "pending"].includes(item.extractionStatus)
    ).length;
    const automationEligibleRecords = [
      ...contentPlans,
      ...deliverablePlans,
      ...studyAssetPlans
    ].filter((item) => Array.isArray(item.automationEligibility) && item.automationEligibility.length).length;

    return {
      generatedAt: plan?.generatedAt || Models.nowIso(),
      destinationLabel: plan?.destination?.label || "",
      workspaceMode: plan?.workspaceMode || "general",
      plannedTopLevelObjects: (plan?.topLevelObjects || []).length,
      plannedCourseHubs: (plan?.coursePlans || []).length,
      plannedContentEntries: contentPlans.length,
      plannedDeliverables: deliverablePlans.length,
      plannedStudyAssetContainers: studyAssetPlans.length,
      directIngestCandidates,
      fileArtifactCandidates,
      extractionPendingItems,
      automationEligibleRecords,
      automationReadyNow: contentPlans.filter((item) => item.automationReady || Number(item.chunkCount || 0) > 0).length,
      warnings: Array.isArray(plan?.warnings) ? plan.warnings.filter(Boolean) : [],
      blockedReasons: Array.isArray(plan?.blockedReasons) ? plan.blockedReasons.filter(Boolean) : [],
      readinessLevel: plan?.readinessLevel || "metadata_only",
      validationStatus: "warning",
      validationSummary: ""
    };
  }

  function getReadinessLevel(contentPlans) {
    const hasAnyContentPath = contentPlans.some((item) => item.holdsActualContent);
    const hasExtractedContent = contentPlans.some((item) => item.extractionStatus === "extracted" || Number(item.chunkCount || 0) > 0);
    const hasAutomationReady = contentPlans.some((item) => item.automationReady || item.contentReadinessState === "automation_ready");

    if (!hasAnyContentPath) {
      return "metadata_only";
    }
    if (hasAutomationReady) {
      return "automation_ready_partial";
    }
    if (hasExtractedContent) {
      return "content_ready";
    }
    return "metadata_only";
  }

  function createAcademicWorkspacePlan(options) {
    const destination = Destination.createNotionDestination(options?.destination);
    const manifest = options?.manifest || {};
    const courses = Array.isArray(manifest.courses) ? manifest.courses : [];
    const contentInventory = Array.isArray(manifest?.contentInventory)
      ? manifest.contentInventory
      : ContentPlanning.buildManifestContentInventory(manifest).records;
    const workspaceMode = destination.workspaceMode;
    const blockedReasons = [];
    const warnings = [];

    if (!destination.destinationUrl) {
      blockedReasons.push("Paste a Notion destination page URL before planning.");
    }
    if (!destination.destinationPageId) {
      blockedReasons.push("Destination URL does not contain a parseable Notion page ID.");
    }
    if (!courses.length && !contentInventory.length) {
      blockedReasons.push("No scanned Canvas data found. Run a Canvas scan first.");
    }
    if (workspaceMode === "class_specific" && !destination.targetCourseId) {
      blockedReasons.push("Class-specific mode requires a target course.");
    }

    let selectedCourses = courses;
    if (workspaceMode === "class_specific" && destination.targetCourseId) {
      selectedCourses = courses.filter((course) => course.courseId === destination.targetCourseId);
      if (!selectedCourses.length) {
        blockedReasons.push("Selected target course is not present in scanned Canvas data.");
      }
    }

    const selectedCourseIds = new Set(selectedCourses.map((course) => course.courseId));
    const selectedInventory = selectedCourseIds.size
      ? contentInventory.filter((record) => !record.courseId || selectedCourseIds.has(record.courseId))
      : contentInventory;
    const contentRecords = selectedInventory.filter((record) => !["course", "deliverable", "study_asset_container"].includes(record.contentType));
    const deliverableRecords = selectedInventory.filter((record) => record.contentType === "deliverable");

    if (!contentRecords.length && !deliverableRecords.length && !blockedReasons.length) {
      blockedReasons.push("Planner found no content or deliverables to map into Notion.");
    }

    if (!contentRecords.some((record) => record.contentPathType === "direct_ingest")) {
      warnings.push("No Canvas-native direct-ingest content discovered yet. Automation-ready text will depend on artifact extraction.");
    }

    const coursePlans = selectedCourses.map((course) => buildCourseHubPlan(course, destination));
    const topLevelObjects = buildTopLevelObjects(destination, workspaceMode, coursePlans[0]?.planObjectId || "");
    const parentTargets = buildContentParentTargets(destination, workspaceMode, coursePlans[0]?.planObjectId || "");

    const contentPlans = contentRecords.map((record) => buildContentEntryPlan(record, parentTargets.contentDatabase));
    const deliverablePlans = deliverableRecords.map((record) => buildDeliverablePlan(record, parentTargets.deliverablesDatabase));
    const studyAssetPlans = selectedCourses.map((course) => buildStudyAssetContainerPlan(course, parentTargets.studyAssetsDatabase));

    if (contentPlans.some((plan) => plan.contentType === "file_artifact" && ["not_started", "pending"].includes(plan.extractionStatus))) {
      warnings.push("Some file artifacts still need extraction before their text becomes automation-usable.");
    }

    const readinessLevel = getReadinessLevel(contentPlans);

    return {
      planId: globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `workspace-plan-${Date.now()}`,
      generatedAt: Models.nowIso(),
      destination,
      workspaceMode,
      topLevelObjects,
      coursePlans,
      contentPlans,
      deliverablePlans,
      studyAssetPlans,
      warnings: Array.from(new Set(warnings.filter(Boolean))),
      blockedReasons: Array.from(new Set(blockedReasons.filter(Boolean))),
      readinessLevel,
      summary: buildPlannerSummary({
        generatedAt: Models.nowIso(),
        destination,
        workspaceMode,
        topLevelObjects,
        coursePlans,
        contentPlans,
        deliverablePlans,
        studyAssetPlans,
        warnings,
        blockedReasons,
        readinessLevel
      })
    };
  }

  globalThis.CanvasNotionWorkspacePlanner = {
    buildPlannerSummary,
    createAcademicWorkspacePlan
  };
})();
