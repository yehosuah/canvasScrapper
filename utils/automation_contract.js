(function () {
  if (globalThis.CanvasAutomationContract) {
    return;
  }

  const Models = globalThis.CanvasNotionModels;
  if (!Models) {
    throw new Error("CanvasNotionModels must load before CanvasAutomationContract.");
  }

  function buildAutomationRecord(planItem) {
    const textAvailability = planItem.futureAutomationOutput
      ? "future_output_container"
      : planItem.automationReady || Number(planItem.chunkCount || 0) > 0
        ? "extracted_text_ready"
        : planItem.extractionStatus === "extracted"
          ? "extracted_text_ready"
          : planItem.contentPathType === "direct_ingest"
            ? "planned_direct_ingest"
            : planItem.supportedExtraction
              ? "pending_extraction"
              : "unavailable";

    return {
      courseId: Models.trimString(planItem.relatedCourseId),
      contentObjectId: Models.trimString(planItem.contentObjectId) || Models.trimString(planItem.planObjectId),
      contentType: Models.trimString(planItem.contentType) || Models.trimString(planItem.planType),
      dateContext: {
        discoveredAt: Models.trimString(planItem.discoveredAt) || null,
        dueDate: Models.trimString(planItem.dueDate) || null,
        sourceSection: Models.trimString(planItem.sourceSection) || null
      },
      textAvailability,
      dueDateAvailability: Boolean(planItem.dueDateAvailability || planItem.dueDate),
      sourceTraceability: {
        sourceType: Models.trimString(planItem.sourceType) || null,
        sourceCanvasUrl: Models.trimString(planItem.sourceCanvasUrl) || null,
        sourcePageTitle: Models.trimString(planItem.sourcePageTitle) || null
      },
      eligibleAutomations: Models.uniqStrings(planItem.automationEligibility)
    };
  }

  function createAutomationContract(options) {
    const workspacePlan = options?.workspacePlan || {};
    const records = [
      ...(workspacePlan.contentPlans || []),
      ...(workspacePlan.deliverablePlans || []),
      ...(workspacePlan.studyAssetPlans || [])
    ].map(buildAutomationRecord);

    const summary = {
      totalRecords: records.length,
      recordsWithTextPath: records.filter((record) =>
        ["planned_direct_ingest", "extracted_text_ready"].includes(record.textAvailability)
      ).length,
      extractionPendingRecords: records.filter((record) => record.textAvailability === "pending_extraction").length,
      dueDateReadyRecords: records.filter((record) => record.dueDateAvailability).length,
      sourceTraceableRecords: records.filter((record) => record.sourceTraceability.sourceCanvasUrl).length,
      automationEligibleRecords: records.filter((record) => record.eligibleAutomations.length).length,
      automationReadyNow: 0
    };

    return {
      contractVersion: 1,
      generatedAt: Models.nowIso(),
      destinationPageId: workspacePlan.destination?.destinationPageId || "",
      workspaceMode: workspacePlan.workspaceMode || "general",
      records,
      summary
    };
  }

  globalThis.CanvasAutomationContract = {
    createAutomationContract
  };
})();
