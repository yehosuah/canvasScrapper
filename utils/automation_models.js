(function () {
  if (globalThis.CanvasAutomationModels) {
    return;
  }

  const WINDOW_TYPES = ["weekly", "rolling", "custom"];
  const WINDOW_PRESETS = ["current_week", "last_7_days", "custom"];
  const RUN_STATUSES = ["idle", "planning", "collecting", "generating", "writing", "completed", "failed", "blocked"];
  const TARGET_SCOPES = ["workspace", "course"];
  const INPUT_SOURCES = ["content", "tasks", "both"];
  const OUTPUT_TYPES = ["overview", "recap", "study_seed"];
  const ARTIFACT_TYPES = ["overview", "recap", "digest", "study_seed"];
  const CADENCES = ["manual", "weekly"];
  const STORAGE_KEYS = {
    definitions: "canvasAutomationDefinitions",
    runs: "canvasAutomationRuns",
    latest: "canvasAutomationLatest"
  };
  const DEFINITION_ORDER = ["weekly_tasks_overview", "weekly_content_overview", "course_recap_seed"];
  const DEFAULT_AUTOMATION_DEFINITIONS = [
    {
      automationId: "weekly_tasks_overview",
      slug: "weekly_tasks_overview",
      name: "Weekly Tasks Overview",
      description: "Deterministic weekly due digest across synced courses.",
      enabled: true,
      outputType: "overview",
      targetScope: "workspace",
      inputSources: "tasks",
      defaultWindowType: "weekly",
      cadence: "weekly"
    },
    {
      automationId: "weekly_content_overview",
      slug: "weekly_content_overview",
      name: "Weekly Content Overview",
      description: "Grouped weekly recap of synced class content, with per-course recap objects.",
      enabled: true,
      outputType: "overview",
      targetScope: "workspace",
      inputSources: "content",
      defaultWindowType: "weekly",
      cadence: "weekly"
    },
    {
      automationId: "course_recap_seed",
      slug: "course_recap_seed",
      name: "Course Recap Seed",
      description: "Structured course recap seed for later flashcards, quizzes, and study guides.",
      enabled: true,
      outputType: "study_seed",
      targetScope: "course",
      inputSources: "content",
      defaultWindowType: "rolling",
      cadence: "manual"
    }
  ];

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

  function sortDefinitions(definitions) {
    return [...(definitions || [])].sort((left, right) => {
      const leftIndex = DEFINITION_ORDER.indexOf(left.automationId);
      const rightIndex = DEFINITION_ORDER.indexOf(right.automationId);
      const normalizedLeftIndex = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
      const normalizedRightIndex = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
      if (normalizedLeftIndex !== normalizedRightIndex) {
        return normalizedLeftIndex - normalizedRightIndex;
      }
      return trimString(left.name).localeCompare(trimString(right.name));
    });
  }

  function createAutomationDefinition(rawDefinition) {
    const source = rawDefinition || {};
    const slug = trimString(source.slug || source.automationId);
    return {
      automationId: trimString(source.automationId || slug),
      slug,
      name: trimString(source.name) || slug || "Automation",
      description: trimString(source.description),
      enabled: source.enabled !== undefined ? Boolean(source.enabled) : true,
      outputType: normalizeEnum(source.outputType, OUTPUT_TYPES, "overview"),
      targetScope: normalizeEnum(source.targetScope, TARGET_SCOPES, "workspace"),
      inputSources: normalizeEnum(source.inputSources, INPUT_SOURCES, "content"),
      defaultWindowType: normalizeEnum(source.defaultWindowType, WINDOW_TYPES, "weekly"),
      cadence: normalizeEnum(source.cadence, CADENCES, "manual")
    };
  }

  function seedAutomationDefinitions(rawDefinitions) {
    const seededById = new Map(
      DEFAULT_AUTOMATION_DEFINITIONS.map((definition) => [definition.automationId, createAutomationDefinition(definition)])
    );
    for (const definition of rawDefinitions || []) {
      const normalized = createAutomationDefinition(definition);
      if (!normalized.automationId) {
        continue;
      }
      seededById.set(normalized.automationId, {
        ...seededById.get(normalized.automationId),
        ...normalized
      });
    }
    return sortDefinitions(Array.from(seededById.values()));
  }

  function startOfLocalDay(rawDate) {
    const date = rawDate instanceof Date ? new Date(rawDate.getTime()) : new Date(rawDate || Date.now());
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function endOfLocalDay(rawDate) {
    const date = startOfLocalDay(rawDate);
    date.setHours(23, 59, 59, 999);
    return date;
  }

  function shiftLocalDays(rawDate, offsetDays) {
    const date = startOfLocalDay(rawDate);
    date.setDate(date.getDate() + Number(offsetDays || 0));
    return date;
  }

  function toLocalDateString(rawDate) {
    const date = rawDate instanceof Date ? rawDate : new Date(rawDate || Date.now());
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function parseInputDate(rawValue) {
    const value = trimString(rawValue);
    if (!value) {
      return null;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split("-").map((part) => Number(part));
      return new Date(year, month - 1, day);
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function formatDateRangeLabel(start, end) {
    const startDate = parseInputDate(start);
    const endDate = parseInputDate(end);
    if (!startDate || !endDate) {
      return "Unknown window";
    }

    const formatter = new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric"
    });
    const startLabel = formatter.format(startDate);
    const endLabel = formatter.format(endDate);
    if (toLocalDateString(startDate) === toLocalDateString(endDate)) {
      return startLabel;
    }
    return `${startLabel} - ${endLabel}`;
  }

  function createAutomationInputWindow(rawWindow) {
    const source = rawWindow || {};
    const startDate = parseInputDate(source.startDate || source.start);
    const endDate = parseInputDate(source.endDate || source.end);
    const normalizedStart = startDate ? startOfLocalDay(startDate).toISOString() : "";
    const normalizedEnd = endDate ? endOfLocalDay(endDate).toISOString() : "";
    return {
      windowType: normalizeEnum(source.windowType, WINDOW_TYPES, "weekly"),
      windowPreset: normalizeEnum(source.windowPreset, WINDOW_PRESETS, "current_week"),
      label: trimString(source.label) || formatDateRangeLabel(startDate, endDate),
      start: normalizedStart,
      end: normalizedEnd,
      startDate: startDate ? toLocalDateString(startDate) : "",
      endDate: endDate ? toLocalDateString(endDate) : "",
      timeZone: trimString(source.timeZone) || Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      valid: Boolean(startDate && endDate && normalizedStart && normalizedEnd)
    };
  }

  function buildAutomationWindow(options) {
    const source = options || {};
    const now = parseInputDate(source.now) || new Date();
    const preset = normalizeEnum(source.windowPreset, WINDOW_PRESETS, "current_week");
    let startDate = null;
    let endDate = null;
    let windowType = "weekly";
    let label = "";

    if (preset === "last_7_days") {
      windowType = "rolling";
      endDate = startOfLocalDay(now);
      startDate = shiftLocalDays(endDate, -6);
      label = `Last 7 Days · ${formatDateRangeLabel(startDate, endDate)}`;
    } else if (preset === "custom") {
      windowType = "custom";
      startDate = parseInputDate(source.customStartDate);
      endDate = parseInputDate(source.customEndDate);
      label = `Custom · ${formatDateRangeLabel(startDate, endDate)}`;
    } else {
      windowType = "weekly";
      const currentDay = startOfLocalDay(now);
      const mondayOffset = (currentDay.getDay() + 6) % 7;
      startDate = shiftLocalDays(currentDay, mondayOffset * -1);
      endDate = shiftLocalDays(startDate, 6);
      label = `Current Week · ${formatDateRangeLabel(startDate, endDate)}`;
    }

    return createAutomationInputWindow({
      windowType,
      windowPreset: preset,
      label,
      startDate,
      endDate
    });
  }

  function createAutomationRun(rawRun) {
    const source = rawRun || {};
    return {
      runId: trimString(source.runId) || (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `automation-run-${Date.now()}`),
      automationId: trimString(source.automationId),
      status: normalizeEnum(source.status, RUN_STATUSES, "idle"),
      startedAt: trimString(source.startedAt) || nowIso(),
      completedAt: trimString(source.completedAt) || null,
      targetScope: normalizeEnum(source.targetScope, TARGET_SCOPES, "workspace"),
      targetCourseIds: uniqStrings(source.targetCourseIds),
      windowPreset: normalizeEnum(source.windowPreset, WINDOW_PRESETS, "current_week"),
      windowType: normalizeEnum(source.windowType, WINDOW_TYPES, "weekly"),
      windowLabel: trimString(source.windowLabel),
      windowStart: trimString(source.windowStart),
      windowEnd: trimString(source.windowEnd),
      sourceRecordCounts: {
        tasks: Number(source.sourceRecordCounts?.tasks || 0),
        content: Number(source.sourceRecordCounts?.content || 0),
        total: Number(source.sourceRecordCounts?.total || 0)
      },
      warnings: Array.isArray(source.warnings) ? source.warnings.filter(Boolean) : [],
      errorMessage: trimString(source.errorMessage) || "",
      outputIds: uniqStrings(source.outputIds),
      destinationPageId: trimString(source.destinationPageId)
    };
  }

  function createAutomationArtifact(rawArtifact) {
    const source = rawArtifact || {};
    return {
      artifactId: trimString(source.artifactId) || (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `artifact-${Date.now()}`),
      outputId: trimString(source.outputId),
      artifactType: normalizeEnum(source.artifactType, ARTIFACT_TYPES, "overview"),
      content: typeof source.content === "string" ? source.content : JSON.stringify(source.content || {}),
      metadata: source.metadata && typeof source.metadata === "object" ? source.metadata : {}
    };
  }

  function createAutomationOutput(rawOutput) {
    const source = rawOutput || {};
    return {
      outputId: trimString(source.outputId),
      runId: trimString(source.runId),
      automationId: trimString(source.automationId),
      courseId: trimString(source.courseId) || null,
      relatedCourseIds: uniqStrings(source.relatedCourseIds),
      courseNames: uniqStrings(source.courseNames),
      title: trimString(source.title) || "Automation Output",
      summary: trimString(source.summary),
      artifactType: normalizeEnum(source.artifactType, ARTIFACT_TYPES, "overview"),
      targetScope: normalizeEnum(source.targetScope, TARGET_SCOPES, "workspace"),
      windowStart: trimString(source.windowStart),
      windowEnd: trimString(source.windowEnd),
      sourceCount: Number(source.sourceCount || 0),
      structuredPayload: source.structuredPayload && typeof source.structuredPayload === "object" ? source.structuredPayload : {},
      notionPageId: trimString(source.notionPageId) || null,
      notionDatabaseEntryId: trimString(source.notionDatabaseEntryId) || null,
      notionPageUrl: trimString(source.notionPageUrl) || "",
      createdAt: trimString(source.createdAt) || nowIso(),
      updatedAt: trimString(source.updatedAt) || nowIso(),
      artifacts: Array.isArray(source.artifacts) ? source.artifacts.map((artifact) => createAutomationArtifact(artifact)) : []
    };
  }

  function createAutomationResultSummary(rawSummary) {
    const source = rawSummary || {};
    return {
      automationId: trimString(source.automationId),
      runId: trimString(source.runId),
      status: normalizeEnum(source.status, RUN_STATUSES, "idle"),
      headline: trimString(source.headline),
      outputCount: Number(source.outputCount || 0),
      writtenCount: Number(source.writtenCount || 0),
      sourceRecordCounts: {
        tasks: Number(source.sourceRecordCounts?.tasks || 0),
        content: Number(source.sourceRecordCounts?.content || 0),
        total: Number(source.sourceRecordCounts?.total || 0)
      },
      warnings: Array.isArray(source.warnings) ? source.warnings.filter(Boolean) : [],
      outputRefs: Array.isArray(source.outputRefs)
        ? source.outputRefs.map((item) => ({
            outputId: trimString(item.outputId),
            title: trimString(item.title),
            courseId: trimString(item.courseId) || null,
            notionPageId: trimString(item.notionPageId) || null,
            notionPageUrl: trimString(item.notionPageUrl) || ""
          }))
        : [],
      updatedAt: trimString(source.updatedAt) || nowIso()
    };
  }

  function isTerminalRunStatus(status) {
    return ["completed", "failed", "blocked"].includes(status);
  }

  function isActiveRunStatus(status) {
    return RUN_STATUSES.includes(status) && !isTerminalRunStatus(status) && status !== "idle";
  }

  function buildOutputId(runId, suffix) {
    return `${trimString(runId)}:${trimString(suffix || "output") || "output"}`;
  }

  globalThis.CanvasAutomationModels = {
    ARTIFACT_TYPES,
    CADENCES,
    DEFAULT_AUTOMATION_DEFINITIONS,
    INPUT_SOURCES,
    OUTPUT_TYPES,
    RUN_STATUSES,
    STORAGE_KEYS,
    TARGET_SCOPES,
    WINDOW_PRESETS,
    WINDOW_TYPES,
    buildAutomationWindow,
    buildOutputId,
    createAutomationArtifact,
    createAutomationDefinition,
    createAutomationInputWindow,
    createAutomationOutput,
    createAutomationResultSummary,
    createAutomationRun,
    formatDateRangeLabel,
    isActiveRunStatus,
    isTerminalRunStatus,
    normalizeEnum,
    nowIso,
    parseInputDate,
    seedAutomationDefinitions,
    sortDefinitions,
    toLocalDateString,
    trimString,
    uniqStrings
  };
})();
