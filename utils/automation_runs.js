(function () {
  if (globalThis.CanvasAutomationRuns) {
    return;
  }

  const Models = globalThis.CanvasAutomationModels;
  const Storage = globalThis.CanvasAutomationStorage;
  const Collect = globalThis.CanvasAutomationCollect;
  const Generate = globalThis.CanvasAutomationGenerate;
  const Writer = globalThis.CanvasAutomationWriter;
  const NotionStorage = globalThis.CanvasNotionStorage;
  if (!Models || !Storage || !Collect || !Generate || !Writer || !NotionStorage) {
    throw new Error("Canvas automation runtime missing dependencies.");
  }

  function createBlockedError(message) {
    const error = new Error(message);
    error.code = "automation_blocked";
    return error;
  }

  function findDefinition(definitions, automationId) {
    return (definitions || []).find((definition) => definition.automationId === automationId) || null;
  }

  function buildCourseOptions(notionState) {
    const plan = notionState?.notionWorkspacePlan || notionState?.plan;
    const courseOptions = new Map();

    for (const coursePlan of plan?.coursePlans || []) {
      const courseId = Models.trimString(coursePlan.relatedCourseId);
      const label = Models.trimString(coursePlan.title || coursePlan.name).replace(/\s+Hub$/i, "");
      if (courseId) {
        courseOptions.set(courseId, {
          courseId,
          courseName: label || courseId
        });
      }
    }

    for (const courseId of Object.keys(notionState?.notionMappings?.courseEntries || notionState?.mappings?.courseEntries || {})) {
      if (!courseOptions.has(courseId)) {
        courseOptions.set(courseId, {
          courseId,
          courseName: courseId
        });
      }
    }

    return Array.from(courseOptions.values()).sort((left, right) => left.courseName.localeCompare(right.courseName));
  }

  function buildAvailability(definition, notionState, courseOptions) {
    if (!definition?.enabled) {
      return {
        state: "blocked",
        label: "Disabled",
        message: "Automation definition is disabled."
      };
    }

    const accessToken = Models.trimString(notionState?.notionAuth?.accessToken || notionState?.auth?.accessToken);
    const destinationPageId = Models.trimString(
      notionState?.notionDestination?.destinationPageId || notionState?.destination?.destinationPageId
    );
    const contentDatabaseId = Models.trimString(
      notionState?.notionMappings?.workspace?.databases?.content?.id || notionState?.mappings?.workspace?.databases?.content?.id
    );
    const deliverablesDatabaseId = Models.trimString(
      notionState?.notionMappings?.workspace?.databases?.deliverables?.id || notionState?.mappings?.workspace?.databases?.deliverables?.id
    );
    const mappedDestinationPageId = Models.trimString(
      notionState?.notionMappings?.workspace?.destinationPageId || notionState?.mappings?.workspace?.destinationPageId
    );

    if (!accessToken) {
      return {
        state: "blocked",
        label: "Token needed",
        message: "Validate Notion auth before running automations."
      };
    }
    if (!destinationPageId) {
      return {
        state: "blocked",
        label: "Destination needed",
        message: "Save and validate a Notion destination before running automations."
      };
    }
    if (mappedDestinationPageId && mappedDestinationPageId !== destinationPageId) {
      return {
        state: "blocked",
        label: "Sync needed",
        message: "Destination changed. Run live Notion sync again before automations."
      };
    }
    if (["content", "both"].includes(definition.inputSources) && !contentDatabaseId) {
      return {
        state: "blocked",
        label: "Content DB missing",
        message: "Run live Notion sync first so Content database mappings exist."
      };
    }
    if (["tasks", "both"].includes(definition.inputSources) && !deliverablesDatabaseId) {
      return {
        state: "blocked",
        label: "Deliverables DB missing",
        message: "Run live Notion sync first so Deliverables database mappings exist."
      };
    }
    if (definition.targetScope === "course" && !(courseOptions || []).length) {
      return {
        state: "blocked",
        label: "Course needed",
        message: "No synced course options available for course recap runs yet."
      };
    }
    return {
      state: "ready",
      label: "Ready",
      message: "Automation can run from current synced Notion workspace."
    };
  }

  async function getOverview() {
    const automationState = await Storage.getAutomationState();
    const notionState = await NotionStorage.getNotionState();
    const definitions = automationState[Models.STORAGE_KEYS.definitions];
    const runs = automationState[Models.STORAGE_KEYS.runs];
    const latest = automationState[Models.STORAGE_KEYS.latest];
    const courseOptions = buildCourseOptions(notionState);
    const activeRunsByAutomationId = {};
    for (const run of runs) {
      if (Models.isActiveRunStatus(run.status) && !activeRunsByAutomationId[run.automationId]) {
        activeRunsByAutomationId[run.automationId] = run;
      }
    }

    const availabilityByAutomationId = {};
    for (const definition of definitions) {
      availabilityByAutomationId[definition.automationId] = buildAvailability(definition, notionState, courseOptions);
    }

    return {
      definitions,
      latestByAutomationId: latest.byAutomationId || {},
      activeRunsByAutomationId,
      courseOptions,
      availabilityByAutomationId,
      defaultAutomationId: definitions[0]?.automationId || "weekly_tasks_overview"
    };
  }

  function buildResultHeadline(definition, run, writeResult, errorMessage) {
    if (errorMessage) {
      return errorMessage;
    }
    const suffix = run.windowLabel || Models.formatDateRangeLabel(run.windowStart, run.windowEnd);
    return `${definition.name} wrote ${writeResult.counts.written} output${writeResult.counts.written === 1 ? "" : "s"} for ${suffix}.`;
  }

  function createResultSummary(definition, run, writeResult, warnings, headlineOverride) {
    const outputs = Array.isArray(writeResult?.outputs) ? writeResult.outputs : [];
    return Models.createAutomationResultSummary({
      automationId: definition.automationId,
      runId: run.runId,
      status: run.status,
      headline: headlineOverride || buildResultHeadline(definition, run, writeResult),
      outputCount: outputs.length,
      writtenCount: writeResult?.counts?.written || 0,
      sourceRecordCounts: run.sourceRecordCounts,
      warnings,
      outputRefs: outputs.map((output) => ({
        outputId: output.outputId,
        title: output.title,
        courseId: output.courseId,
        notionPageId: output.notionPageId,
        notionPageUrl: output.notionPageUrl
      }))
    });
  }

  async function runAutomation(options) {
    const definitions = await Storage.getDefinitions();
    const definition = findDefinition(definitions, options?.automationId);
    if (!definition) {
      return {
        ok: false,
        error: "Unknown automation definition.",
        automation: await getOverview()
      };
    }

    if (!definition.enabled) {
      return {
        ok: false,
        error: `${definition.name} is disabled.`,
        automation: await getOverview()
      };
    }

    const currentRuns = await Storage.getRuns();
    const activeRun = currentRuns.find(
      (run) => run.automationId === definition.automationId && Models.isActiveRunStatus(run.status)
    );
    if (activeRun) {
      return {
        ok: false,
        error: `${definition.name} already running.`,
        run: activeRun,
        automation: await getOverview()
      };
    }

    const notionState = await NotionStorage.getNotionState();
    const overview = await getOverview();
    const availability = overview.availabilityByAutomationId?.[definition.automationId];
    if (availability?.state === "blocked") {
      return {
        ok: false,
        error: availability.message,
        automation: overview
      };
    }

    const window = Models.buildAutomationWindow({
      windowPreset: options?.windowPreset,
      customStartDate: options?.customStartDate,
      customEndDate: options?.customEndDate
    });
    if (!window.valid) {
      return {
        ok: false,
        error: "Automation window is invalid.",
        automation: overview
      };
    }

    const targetCourseIds = definition.targetScope === "course"
      ? Models.uniqStrings([options?.targetCourseId])
      : Models.uniqStrings(options?.targetCourseIds || []);
    if (definition.targetScope === "course" && !targetCourseIds.length) {
      return {
        ok: false,
        error: "Select a course for course recap seed.",
        automation: overview
      };
    }

    let run = await Storage.upsertRun(
      Models.createAutomationRun({
        automationId: definition.automationId,
        status: "planning",
        targetScope: definition.targetScope,
        targetCourseIds,
        windowPreset: window.windowPreset,
        windowType: window.windowType,
        windowLabel: window.label,
        windowStart: window.start,
        windowEnd: window.end,
        destinationPageId: notionState?.notionDestination?.destinationPageId || notionState?.destination?.destinationPageId
      })
    );

    try {
      run = await Storage.upsertRun({
        ...run,
        status: "collecting"
      });

      const collected = await Collect.collectInputs({
        definition,
        notionState,
        accessToken: notionState?.notionAuth?.accessToken || notionState?.auth?.accessToken,
        targetCourseIds,
        window
      });
      const collectionWarnings = Array.isArray(collected.warnings) ? collected.warnings : [];

      run = await Storage.upsertRun({
        ...run,
        status: "generating",
        warnings: collectionWarnings,
        sourceRecordCounts: collected.sourceRecordCounts
      });

      const generated = await Generate.generateOutputs({
        definition,
        run,
        collected
      });
      const generationWarnings = Array.isArray(generated.warnings) ? generated.warnings : [];

      run = await Storage.upsertRun({
        ...run,
        status: "writing",
        warnings: Array.from(new Set([...collectionWarnings, ...generationWarnings]))
      });

      const writeResult = await Writer.writeOutputs({
        outputs: generated.outputs,
        run,
        notionState,
        accessToken: notionState?.notionAuth?.accessToken || notionState?.auth?.accessToken,
        warnings: Array.from(new Set([...collectionWarnings, ...generationWarnings]))
      });
      const finalWarnings = Array.from(
        new Set([...(run.warnings || []), ...(writeResult.warnings || []), ...(writeResult.failures || [])])
      );

      if (writeResult.failures?.length) {
        const errorMessage = writeResult.failures.join(" ");
        run = await Storage.upsertRun({
          ...run,
          status: "failed",
          completedAt: Models.nowIso(),
          warnings: finalWarnings,
          errorMessage,
          outputIds: writeResult.outputs.map((output) => output.outputId)
        });

        const failedSummary = createResultSummary(definition, run, writeResult, finalWarnings, errorMessage);
        await Storage.setLatestForAutomation(failedSummary);

        return {
          ok: false,
          run,
          summary: failedSummary,
          outputs: writeResult.outputs,
          error: errorMessage,
          automation: await getOverview()
        };
      }

      run = await Storage.upsertRun({
        ...run,
        status: "completed",
        completedAt: Models.nowIso(),
        warnings: finalWarnings,
        outputIds: writeResult.outputs.map((output) => output.outputId)
      });

      const summary = createResultSummary(definition, run, writeResult, finalWarnings);
      await Storage.setLatestForAutomation(summary);

      return {
        ok: true,
        run,
        summary,
        outputs: writeResult.outputs,
        automation: await getOverview()
      };
    } catch (error) {
      const status = error.code === "automation_blocked" ? "blocked" : "failed";
      run = await Storage.upsertRun({
        ...run,
        status,
        completedAt: Models.nowIso(),
        errorMessage: error.message,
        warnings: Array.from(new Set(run.warnings || []))
      });

      const summary = createResultSummary(
        definition,
        run,
        {
          outputs: [],
          counts: {
            written: 0,
            failed: 1
          }
        },
        run.warnings || [],
        error.message
      );
      await Storage.setLatestForAutomation(summary);

      return {
        ok: false,
        run,
        summary,
        error: error.message,
        automation: await getOverview()
      };
    }
  }

  globalThis.CanvasAutomationRuns = {
    getOverview,
    runAutomation
  };
})();
