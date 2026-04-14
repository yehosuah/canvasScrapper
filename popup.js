const SECTION_ORDER = ["files", "modules", "pages", "assignments", "syllabus", "home"];
const SECTION_LABELS = {
  files: "Files",
  modules: "Modules",
  pages: "Pages",
  assignments: "Assignments",
  syllabus: "Syllabus",
  home: "Home"
};
const CATEGORY_BY_EXTENSION = {
  pdf: "pdf",
  doc: "word",
  docx: "word",
  html: "text",
  htm: "text",
  xls: "spreadsheet",
  xlsx: "spreadsheet",
  ppt: "slides",
  pptx: "slides",
  txt: "text",
  zip: "archive"
};
const MODE_LABELS = {
  single_course: "Single course page",
  dashboard: "Dashboard or all courses page",
  unsupported: "Unsupported page"
};
const UrlUtils = globalThis.CanvasUrlUtils || null;

const elements = {
  courseName: document.getElementById("courseName"),
  pageModeLine: document.getElementById("pageModeLine"),
  statusLine: document.getElementById("statusLine"),
  singleCourseControls: document.getElementById("singleCourseControls"),
  dashboardCourseSection: document.getElementById("dashboardCourseSection"),
  scanButton: document.getElementById("scanButton"),
  scanSelectedCoursesButton: document.getElementById("scanSelectedCoursesButton"),
  scanAllCoursesButton: document.getElementById("scanAllCoursesButton"),
  selectAllCoursesButton: document.getElementById("selectAllCoursesButton"),
  clearCourseSelectionButton: document.getElementById("clearCourseSelectionButton"),
  detectedCourseCount: document.getElementById("detectedCourseCount"),
  courseListContainer: document.getElementById("courseListContainer"),
  typeFilter: document.getElementById("typeFilter"),
  documentCount: document.getElementById("documentCount"),
  duplicateCount: document.getElementById("duplicateCount"),
  pagesScanned: document.getElementById("pagesScanned"),
  coursesScanned: document.getElementById("coursesScanned"),
  extractionStatusLine: document.getElementById("extractionStatusLine"),
  extractionReadyBadge: document.getElementById("extractionReadyBadge"),
  extractedDocumentCount: document.getElementById("extractedDocumentCount"),
  pendingExtractionCount: document.getElementById("pendingExtractionCount"),
  failedExtractionCount: document.getElementById("failedExtractionCount"),
  unsupportedExtractionCount: document.getElementById("unsupportedExtractionCount"),
  extractionDetailLine: document.getElementById("extractionDetailLine"),
  runExtractionButton: document.getElementById("runExtractionButton"),
  retryExtractionButton: document.getElementById("retryExtractionButton"),
  enrichNotionButton: document.getElementById("enrichNotionButton"),
  progressPanel: document.getElementById("progressPanel"),
  selectVisibleButton: document.getElementById("selectVisibleButton"),
  clearSelectionButton: document.getElementById("clearSelectionButton"),
  downloadSelectedButton: document.getElementById("downloadSelectedButton"),
  downloadAllButton: document.getElementById("downloadAllButton"),
  downloadSummary: document.getElementById("downloadSummary"),
  resultsContainer: document.getElementById("resultsContainer"),
  notionStatusLine: document.getElementById("notionStatusLine"),
  notionReadinessBadge: document.getElementById("notionReadinessBadge"),
  notionAccessToken: document.getElementById("notionAccessToken"),
  notionDestinationUrl: document.getElementById("notionDestinationUrl"),
  notionWorkspaceModeGeneral: document.querySelector('input[name="notionWorkspaceMode"][value="general"]'),
  notionWorkspaceModeClassSpecific: document.querySelector('input[name="notionWorkspaceMode"][value="class_specific"]'),
  notionTargetCourseField: document.getElementById("notionTargetCourseField"),
  notionTargetCourseId: document.getElementById("notionTargetCourseId"),
  notionActionLine: document.getElementById("notionActionLine"),
  notionDestinationLine: document.getElementById("notionDestinationLine"),
  notionAuthLine: document.getElementById("notionAuthLine"),
  notionLastValidationLine: document.getElementById("notionLastValidationLine"),
  notionLatestJobLine: document.getElementById("notionLatestJobLine"),
  saveNotionDestinationButton: document.getElementById("saveNotionDestinationButton"),
  clearNotionTokenButton: document.getElementById("clearNotionTokenButton"),
  validateWorkspacePlanButton: document.getElementById("validateWorkspacePlanButton"),
  planAcademicWorkspaceButton: document.getElementById("planAcademicWorkspaceButton"),
  runNotionSyncButton: document.getElementById("runNotionSyncButton"),
  notionPlanSummary: document.getElementById("notionPlanSummary"),
  automationStatusLine: document.getElementById("automationStatusLine"),
  automationReadinessBadge: document.getElementById("automationReadinessBadge"),
  automationListContainer: document.getElementById("automationListContainer"),
  automationWindowPreset: document.getElementById("automationWindowPreset"),
  automationCustomRangeFields: document.getElementById("automationCustomRangeFields"),
  automationStartDate: document.getElementById("automationStartDate"),
  automationEndDate: document.getElementById("automationEndDate"),
  automationCourseField: document.getElementById("automationCourseField"),
  automationCourseSelect: document.getElementById("automationCourseSelect"),
  runAutomationButton: document.getElementById("runAutomationButton"),
  automationLatestSummary: document.getElementById("automationLatestSummary")
};

let currentState = null;
let activeDetection = null;
let notionState = null;
let automationState = null;
let notionBusy = false;
let extractionBusy = false;
let automationBusy = false;
let selectedAutomationId = "weekly_tasks_overview";
let notionActionMessage = "Waiting for token and destination page URL or ID.";
let notionDraft = {
  accessTokenDirty: false,
  destinationDirty: false,
  workspaceModeDirty: false,
  targetCourseDirty: false
};
let selectedDocumentIds = new Set();
let selectedCourseIds = new Set();
let lastDocumentSelectionSeed = "";
let lastCourseSelectionSeed = "";

function resetNotionDraft() {
  notionDraft = {
    accessTokenDirty: false,
    destinationDirty: false,
    workspaceModeDirty: false,
    targetCourseDirty: false
  };
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateTime(value) {
  if (!value) {
    return "not yet";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function formatStatusLabel(value) {
  const raw = String(value || "idle").replace(/_/g, " ");
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function getNotionBadgeClass() {
  if (notionState?.readinessState === "blocked") {
    return "status-blocked";
  }
  if (notionState?.readinessState === "destination_missing") {
    return "status-idle";
  }
  if (notionState?.latestJob?.status === "blocked") {
    return "status-blocked";
  }
  if (notionState?.readinessState === "ready_for_planning") {
    return "status-planned";
  }
  if (
    notionState?.readinessState === "metadata_only" ||
    notionState?.readinessState === "content_ready" ||
    notionState?.readinessState === "automation_ready_partial"
  ) {
    return "status-ready";
  }
  if (notionState?.latestJob?.status) {
    return `status-${notionState.latestJob.status}`;
  }
  return "status-idle";
}

function getScannedCourseOptions() {
  return (currentState?.courses || []).slice().sort((left, right) => (left.courseName || "").localeCompare(right.courseName || ""));
}

function applyNotionDestinationToForm(destination) {
  const nextDestination = destination || {};
  const selectedCourseId = notionDraft.targetCourseDirty
    ? elements.notionTargetCourseId.value
    : nextDestination.targetCourseId || elements.notionTargetCourseId.value;

  if (!notionDraft.destinationDirty && document.activeElement !== elements.notionDestinationUrl) {
    elements.notionDestinationUrl.value =
      nextDestination.destinationInput || nextDestination.destinationUrl || nextDestination.destinationPageId || "";
  }
  if (!notionDraft.workspaceModeDirty) {
    elements.notionWorkspaceModeGeneral.checked = (nextDestination.workspaceMode || "general") === "general";
    elements.notionWorkspaceModeClassSpecific.checked = nextDestination.workspaceMode === "class_specific";
  }
  if (!notionDraft.targetCourseDirty && document.activeElement !== elements.notionTargetCourseId) {
    populateTargetCourseOptions(selectedCourseId);
    elements.notionTargetCourseId.value = selectedCourseId || "";
  } else if (!elements.notionTargetCourseId.options.length) {
    populateTargetCourseOptions(selectedCourseId);
  }
  syncWorkspaceModeVisibility();
}

function applyNotionAuthToForm(auth) {
  if (!auth?.hasToken) {
    if (!notionDraft.accessTokenDirty && document.activeElement !== elements.notionAccessToken) {
      elements.notionAccessToken.value = "";
    }
    elements.notionAccessToken.placeholder = "secret_xxx";
    return;
  }

  if (!notionDraft.accessTokenDirty && document.activeElement !== elements.notionAccessToken) {
    elements.notionAccessToken.value = "";
    elements.notionAccessToken.placeholder = auth.tokenPreview || "Token saved";
  }
}

function getWorkspaceModeFromForm() {
  return elements.notionWorkspaceModeClassSpecific.checked ? "class_specific" : "general";
}

function populateTargetCourseOptions(selectedCourseId) {
  const courses = getScannedCourseOptions();
  const options = ['<option value="">Select scanned course</option>'].concat(
    courses.map((course) => {
      const term = course.term ? ` · ${escapeHtml(course.term)}` : "";
      return `<option value="${escapeHtml(course.courseId)}">${escapeHtml(course.courseName)}${term}</option>`;
    })
  );
  elements.notionTargetCourseId.innerHTML = options.join("");
  if (selectedCourseId) {
    elements.notionTargetCourseId.value = selectedCourseId;
  }
}

function getNotionDestinationFromForm() {
  const workspaceMode = getWorkspaceModeFromForm();
  return {
    destinationInput: elements.notionDestinationUrl.value.trim(),
    workspaceMode,
    targetCourseId: workspaceMode === "class_specific" ? elements.notionTargetCourseId.value.trim() : ""
  };
}

function getNotionAccessTokenFromForm() {
  return elements.notionAccessToken.value.trim();
}

function setNotionActionMessage(message) {
  notionActionMessage = message;
  if (elements.notionActionLine) {
    elements.notionActionLine.textContent = `Action: ${message}`;
  }
}

function commitNotionFormState() {
  resetNotionDraft();
  if (notionState) {
    applyNotionDestinationToForm(notionState.destination || {});
    applyNotionAuthToForm(notionState.auth || {});
  }
}

function buildNotionSettingsPayload() {
  const payload = {
    type: "SAVE_NOTION_SETTINGS",
    destination: getNotionDestinationFromForm()
  };
  const accessToken = getNotionAccessTokenFromForm();
  if (accessToken) {
    payload.accessToken = accessToken;
  }
  return payload;
}

function syncWorkspaceModeVisibility() {
  const isClassSpecific = getWorkspaceModeFromForm() === "class_specific";
  elements.notionTargetCourseField.classList.toggle("hidden", !isClassSpecific);
}

function setNotionBusy(isBusy) {
  notionBusy = isBusy;
  elements.saveNotionDestinationButton.disabled = isBusy;
  elements.clearNotionTokenButton.disabled = isBusy;
  elements.validateWorkspacePlanButton.disabled = isBusy;
  elements.planAcademicWorkspaceButton.disabled = isBusy;
  elements.runNotionSyncButton.disabled = isBusy;
}

function setExtractionBusy(isBusy) {
  extractionBusy = isBusy;
  elements.runExtractionButton.disabled = isBusy;
  elements.retryExtractionButton.disabled = isBusy;
  elements.enrichNotionButton.disabled = isBusy;
}

function setAutomationBusy(isBusy) {
  automationBusy = isBusy;
  elements.runAutomationButton.disabled = isBusy;
  elements.automationWindowPreset.disabled = isBusy;
  elements.automationStartDate.disabled = isBusy;
  elements.automationEndDate.disabled = isBusy;
  elements.automationCourseSelect.disabled = isBusy;
}

function getSelectedAutomationDefinition() {
  return automationState?.definitions?.find((definition) => definition.automationId === selectedAutomationId) || null;
}

function getAutomationLatestEntry(automationId) {
  return automationState?.latestByAutomationId?.[automationId] || null;
}

function getAutomationAvailability(automationId) {
  return automationState?.availabilityByAutomationId?.[automationId] || null;
}

function getAutomationCourseOptions() {
  const seen = new Map();
  for (const option of automationState?.courseOptions || []) {
    if (option?.courseId) {
      seen.set(option.courseId, {
        courseId: option.courseId,
        courseName: option.courseName || option.courseId
      });
    }
  }
  for (const course of notionState?.plan?.coursePlans || []) {
    if (course?.relatedCourseId && !seen.has(course.relatedCourseId)) {
      seen.set(course.relatedCourseId, {
        courseId: course.relatedCourseId,
        courseName: String(course.title || course.name || course.relatedCourseId).replace(/\s+Hub$/i, "")
      });
    }
  }
  for (const course of currentState?.courses || []) {
    if (course?.courseId && !seen.has(course.courseId)) {
      seen.set(course.courseId, {
        courseId: course.courseId,
        courseName: course.courseName || course.courseId
      });
    }
  }
  return Array.from(seen.values()).sort((left, right) => left.courseName.localeCompare(right.courseName));
}

function syncAutomationControlsVisibility() {
  const definition = getSelectedAutomationDefinition();
  const showCustomRange = elements.automationWindowPreset.value === "custom";
  const showCourseField = definition?.targetScope === "course";
  elements.automationCustomRangeFields.classList.toggle("hidden", !showCustomRange);
  elements.automationCourseField.classList.toggle("hidden", !showCourseField);
}

function getAutomationBadgeClass(state) {
  if (state === "blocked" || state === "failed") {
    return "status-blocked";
  }
  if (state === "completed") {
    return "status-ready";
  }
  if (state === "planning" || state === "collecting" || state === "generating" || state === "writing") {
    return "status-scanning";
  }
  if (state === "ready") {
    return "status-ready";
  }
  return "status-idle";
}

function buildWarningMarkup(warnings) {
  return (warnings || [])
    .filter(Boolean)
    .map((warning) => `<p class="summaryMeta">Warning: ${escapeHtml(warning)}</p>`)
    .join("");
}

function buildBlockedMarkup(blockedReasons) {
  return (blockedReasons || [])
    .filter(Boolean)
    .map((reason) => `<p class="summaryMeta summaryBlocked">Blocked: ${escapeHtml(reason)}</p>`)
    .join("");
}

function renderNotionSummary() {
  if (!notionState) {
    elements.notionStatusLine.textContent = "Loading planner state.";
    elements.notionPlanSummary.innerHTML = '<p class="emptyState">Loading planner state.</p>';
    return;
  }

  applyNotionDestinationToForm(notionState.destination);
  applyNotionAuthToForm(notionState.auth);

  elements.notionReadinessBadge.textContent = notionState.readinessLabel || "Destination needed";
  elements.notionReadinessBadge.className = `pill statusPill ${getNotionBadgeClass()}`;
  elements.notionStatusLine.textContent = notionState.readinessMessage || "Save settings, validate, then plan or sync.";
  elements.notionAuthLine.textContent = `Auth: ${notionState.authStateLabel || "Token missing"}`;
  elements.notionActionLine.textContent = `Action: ${notionActionMessage}`;
  const destinationInput =
    notionState.destination?.destinationInput || notionState.destination?.destinationUrl || notionState.destination?.destinationPageId || "";
  elements.notionDestinationLine.textContent = destinationInput
    ? `Destination: ${destinationInput} · page ${notionState.destination.destinationPageId || "unparsed"} · ${
        notionState.destination.workspaceMode === "class_specific" ? "Class-specific workspace" : "General academic workspace"
      }`
    : "Destination: not set.";

  if (notionState.lastValidation) {
    elements.notionLastValidationLine.textContent =
      `Validation: ${formatStatusLabel(notionState.lastValidation.status)} · ` +
      `${formatDateTime(notionState.lastValidation.checkedAt)} · ${notionState.lastValidation.summary}`;
  } else {
    elements.notionLastValidationLine.textContent = "Validation: not run.";
  }

  if (notionState.latestJob) {
    elements.notionLatestJobLine.textContent =
      `Latest sync: ${formatStatusLabel(notionState.latestJob.status)} · ` +
      `${formatDateTime(notionState.latestJob.createdAt)} · ${notionState.latestJob.summary}`;
  } else {
    elements.notionLatestJobLine.textContent = "Latest sync: idle.";
  }

  const summary = notionState.plan?.summary || (notionState.plannerSummary?.generatedAt ? notionState.plannerSummary : null);
  const warnings = Array.from(
    new Set([
      ...(notionState.lastValidation?.warnings || []),
      ...(notionState.plan?.warnings || []),
      ...(notionState.plannerSummary?.warnings || []),
      ...(notionState.lastResult?.warnings || [])
    ])
  );
  const blockedReasons = Array.from(
    new Set([
      ...(notionState.lastValidation?.blockedReasons || []),
      ...(notionState.plan?.blockedReasons || []),
      ...(notionState.plannerSummary?.blockedReasons || []),
      ...(notionState.lastResult?.blockedReason ? [notionState.lastResult.blockedReason] : [])
    ])
  );

  if (!summary) {
    const validationOnlyLine = notionState.lastValidation
      ? `<p class="summaryMeta">Validation ${escapeHtml(formatStatusLabel(notionState.lastValidation.status))} · ${escapeHtml(
          notionState.lastValidation.summary
        )}</p>`
      : "";
    const blockedOnlyLine = buildBlockedMarkup(blockedReasons);
    const warningOnlyMarkup = buildWarningMarkup(warnings);

    elements.notionPlanSummary.innerHTML = validationOnlyLine || blockedOnlyLine || warningOnlyMarkup
      ? `
        <p class="summaryMeta">Manifest · ${notionState.manifestSummary.courses} courses / ${notionState.manifestSummary.documents} docs / ${notionState.manifestSummary.contentRecords} content records</p>
        <p class="summaryMeta">Direct ingest ${notionState.manifestSummary.directIngestCandidates} · File artifacts ${notionState.manifestSummary.fileArtifactCandidates} · Extraction pending ${notionState.manifestSummary.extractionPendingItems}</p>
        ${validationOnlyLine}
        ${blockedOnlyLine}
        ${warningOnlyMarkup}
      `
      : '<p class="emptyState">No academic workspace plan yet. Save destination, validate, then plan workspace.</p>';
    return;
  }

  const validationLine = notionState.lastValidation
    ? `<p class="summaryMeta">Validation ${escapeHtml(formatStatusLabel(notionState.lastValidation.status))} · ${escapeHtml(
        notionState.lastValidation.summary
      )}</p>`
    : "";
  const resultLine = notionState.lastResult
    ? `<p class="summaryMeta">Result · created ${notionState.lastResult.createdCount || 0} / updated ${notionState.lastResult.updatedCount || 0} / skipped ${notionState.lastResult.skippedCount || 0} / failed ${notionState.lastResult.failedCount || 0} / artifacts ${notionState.lastResult.artifactAttachedCount || 0}</p>`
    : "";
  const blockedLine = buildBlockedMarkup(blockedReasons);
  const topLevelObjectNames = (notionState.plan?.topLevelObjects || []).map((item) => item.title).slice(0, 4);
  const automationSummary = notionState.automationContract?.summary || {
    automationEligibleRecords: summary.automationEligibleRecords || 0,
    recordsWithTextPath: 0,
    extractionPendingRecords: summary.extractionPendingItems || 0
  };

  elements.notionPlanSummary.innerHTML = `
    <div class="miniSummaryGrid">
      <article class="miniSummaryCard">
        <span class="summaryLabel">Course hubs</span>
        <strong>${summary.plannedCourseHubs}</strong>
        <p class="summaryMeta">Top-level objects ${summary.plannedTopLevelObjects}</p>
      </article>
      <article class="miniSummaryCard">
        <span class="summaryLabel">Content entries</span>
        <strong>${summary.plannedContentEntries}</strong>
        <p class="summaryMeta">Readiness ${escapeHtml(formatStatusLabel(summary.readinessLevel || "metadata_only"))}</p>
      </article>
      <article class="miniSummaryCard">
        <span class="summaryLabel">Direct ingest</span>
        <strong>${summary.directIngestCandidates}</strong>
        <p class="summaryMeta">Canvas-native text paths</p>
      </article>
      <article class="miniSummaryCard">
        <span class="summaryLabel">File artifacts</span>
        <strong>${summary.fileArtifactCandidates}</strong>
        <p class="summaryMeta">Attachment/extraction path</p>
      </article>
      <article class="miniSummaryCard">
        <span class="summaryLabel">Extraction pending</span>
        <strong>${summary.extractionPendingItems}</strong>
        <p class="summaryMeta">Needs later text extraction</p>
      </article>
      <article class="miniSummaryCard">
        <span class="summaryLabel">Deliverables</span>
        <strong>${summary.plannedDeliverables}</strong>
        <p class="summaryMeta">Study asset containers ${summary.plannedStudyAssetContainers}</p>
      </article>
    </div>
    <p class="summaryMeta">Manifest · ${notionState.manifestSummary.courses} courses / ${notionState.manifestSummary.documents} docs / ${notionState.manifestSummary.contentRecords} content records</p>
    <p class="summaryMeta">Workspace mode · ${escapeHtml(summary.workspaceMode === "class_specific" ? "Class-specific" : "General academic")}</p>
    <p class="summaryMeta">Top-level objects · ${escapeHtml(topLevelObjectNames.join(", ") || "No root objects planned")}</p>
    <p class="summaryMeta">Automation · eligible ${automationSummary.automationEligibleRecords || 0} / text path ${automationSummary.recordsWithTextPath || 0} / extraction pending ${automationSummary.extractionPendingRecords || 0}</p>
    ${validationLine}
    ${resultLine}
    ${blockedLine}
    ${buildWarningMarkup(warnings)}
  `;
}

function populateAutomationCourseOptions() {
  const selectedValue = elements.automationCourseSelect.value;
  const courseOptions = getAutomationCourseOptions();
  const options = ['<option value="">Select course</option>'].concat(
    courseOptions.map((course) => `<option value="${escapeHtml(course.courseId)}">${escapeHtml(course.courseName)}</option>`)
  );
  elements.automationCourseSelect.innerHTML = options.join("");
  if (selectedValue) {
    elements.automationCourseSelect.value = selectedValue;
    return;
  }
  if (courseOptions.length === 1) {
    elements.automationCourseSelect.value = courseOptions[0].courseId;
  }
}

function renderAutomationPanel() {
  if (!automationState) {
    elements.automationStatusLine.textContent = "Loading automation state.";
    elements.automationReadinessBadge.textContent = "Loading";
    elements.automationLatestSummary.innerHTML = '<p class="emptyState">Loading automation state.</p>';
    return;
  }

  const definitions = automationState.definitions || [];
  if (!definitions.length) {
    elements.automationStatusLine.textContent = "No automation definitions available.";
    elements.automationReadinessBadge.textContent = "Unavailable";
    elements.automationLatestSummary.innerHTML = '<p class="emptyState">No automation definitions available.</p>';
    return;
  }

  if (!definitions.some((definition) => definition.automationId === selectedAutomationId)) {
    selectedAutomationId = automationState.defaultAutomationId || definitions[0].automationId;
  }

  const selectedDefinition = getSelectedAutomationDefinition();
  const availability = getAutomationAvailability(selectedAutomationId) || {
    state: "idle",
    label: "Idle",
    message: "Select an automation."
  };
  populateAutomationCourseOptions();
  syncAutomationControlsVisibility();
  const activeRun = automationState.activeRunsByAutomationId?.[selectedAutomationId] || null;
  const latest = getAutomationLatestEntry(selectedAutomationId);
  const badgeState = activeRun?.status || latest?.status || availability.state;
  const badgeLabel = activeRun ? formatStatusLabel(activeRun.status) : latest ? formatStatusLabel(latest.status) : availability.label;
  const customRangeInvalid =
    elements.automationWindowPreset.value === "custom" &&
    (!elements.automationStartDate.value || !elements.automationEndDate.value);
  const needsCourseSelection = selectedDefinition?.targetScope === "course" && !elements.automationCourseSelect.value;
  const runBlocked = availability.state === "blocked" || customRangeInvalid || needsCourseSelection;

  elements.automationReadinessBadge.textContent = badgeLabel || "Ready";
  elements.automationReadinessBadge.className = `pill statusPill ${getAutomationBadgeClass(badgeState)}`;
  elements.automationStatusLine.textContent = activeRun
    ? `${formatStatusLabel(activeRun.status)} · ${activeRun.windowLabel || "Automation running"}`
    : runBlocked && customRangeInvalid
      ? "Select both custom dates before running."
      : runBlocked && needsCourseSelection
        ? "Select a course for course recap seed."
        : availability.message || "Automation ready.";

  elements.automationListContainer.innerHTML = definitions
    .map((definition) => {
      const isSelected = definition.automationId === selectedAutomationId;
      const latestEntry = getAutomationLatestEntry(definition.automationId);
      const runningEntry = automationState.activeRunsByAutomationId?.[definition.automationId];
      const availabilityEntry = getAutomationAvailability(definition.automationId) || {
        label: "Idle"
      };
      const stateLabel = runningEntry
        ? formatStatusLabel(runningEntry.status)
        : latestEntry
          ? formatStatusLabel(latestEntry.status)
          : availabilityEntry.label;
      const summaryLine = runningEntry?.windowLabel || latestEntry?.headline || definition.description;
      return `
        <label class="automationOption ${isSelected ? "isSelected" : ""}">
          <input type="radio" name="automationType" value="${escapeHtml(definition.automationId)}" ${isSelected ? "checked" : ""}>
          <span>
            <p class="automationOptionTitle">${escapeHtml(definition.name)}</p>
            <p class="courseItemMeta">${escapeHtml(stateLabel)} · ${escapeHtml(summaryLine || definition.description)}</p>
          </span>
        </label>
      `;
    })
    .join("");

  elements.automationListContainer.querySelectorAll('input[name="automationType"]').forEach((input) => {
    input.addEventListener("change", (event) => {
      selectedAutomationId = event.target.value;
      renderAutomationPanel();
    });
  });

  setAutomationBusy(automationBusy);
  elements.runAutomationButton.disabled = automationBusy || notionBusy || runBlocked;

  if (!latest) {
    elements.automationLatestSummary.innerHTML = `
      <p class="summaryMeta">${escapeHtml(selectedDefinition?.description || "Select an automation.")}</p>
      <p class="summaryMeta">Window · ${escapeHtml(elements.automationWindowPreset.options[elements.automationWindowPreset.selectedIndex]?.text || "Current week")}</p>
    `;
    return;
  }

  const outputLinks = (latest.outputRefs || [])
    .slice(0, 6)
    .map((item) => {
      if (!item.notionPageUrl) {
        return `<p class="summaryMeta">${escapeHtml(item.title || item.outputId)}</p>`;
      }
      return `<p class="summaryMeta"><a href="${escapeHtml(item.notionPageUrl)}" target="_blank">${escapeHtml(item.title || item.outputId)}</a></p>`;
    })
    .join("");

  elements.automationLatestSummary.innerHTML = `
    <p class="summaryMeta">Latest run · ${escapeHtml(formatStatusLabel(latest.status))} · ${escapeHtml(formatDateTime(latest.updatedAt))}</p>
    <p class="summaryMeta">${escapeHtml(latest.headline || "No summary available.")}</p>
    <p class="summaryMeta">Outputs · ${latest.writtenCount || 0} written from ${latest.sourceRecordCounts?.total || 0} source records</p>
    ${outputLinks || '<p class="summaryMeta">No written output links yet.</p>'}
    ${buildWarningMarkup(latest.warnings || [])}
  `;
}

function extensionCategory(documentItem) {
  return CATEGORY_BY_EXTENSION[(documentItem.inferredExtension || "").toLowerCase()] || "other";
}

function passesFilter(documentItem, filterValue) {
  if (filterValue === "all") {
    return true;
  }
  if (filterValue === "downloadable") {
    return documentItem.isDownloadable;
  }
  if (filterValue === "canvas") {
    return documentItem.isCanvasHosted;
  }
  if (filterValue === "external") {
    return documentItem.isExternal;
  }
  return extensionCategory(documentItem) === filterValue;
}

function getStateDocuments() {
  return currentState?.documents || currentState?.results || [];
}

function getVisibleResults() {
  const filterValue = elements.typeFilter.value;
  return getStateDocuments().filter((documentItem) => passesFilter(documentItem, filterValue));
}

function getDownloadableResults() {
  return getStateDocuments().filter((documentItem) => documentItem.isDownloadable);
}

function getDashboardCourses() {
  return activeDetection?.pageMode === "dashboard" ? activeDetection.courses || [] : [];
}

function getOrderedCourses() {
  const courses = currentState?.courses || [];
  const byId = new Map(courses.map((course) => [course.courseId, course]));
  const order = currentState?.courseOrder?.length ? currentState.courseOrder : courses.map((course) => course.courseId);
  return order.map((courseId) => byId.get(courseId)).filter(Boolean);
}

function seedDocumentSelectionIfNeeded(results) {
  const seed = currentState?.lastScanAt || "";
  if (!seed || seed === lastDocumentSelectionSeed) {
    return;
  }

  lastDocumentSelectionSeed = seed;
  selectedDocumentIds = new Set(results.filter((item) => item.isDownloadable).map((item) => item.id));
}

function seedCourseSelectionIfNeeded(courses) {
  const seed = `${activeDetection?.tabUrl || ""}:${courses.map((course) => course.courseId).join("|")}`;
  if (!seed || seed === lastCourseSelectionSeed) {
    return;
  }

  lastCourseSelectionSeed = seed;
  selectedCourseIds = new Set(courses.map((course) => course.courseId));
}

function getMode() {
  return activeDetection?.pageMode || currentState?.pageMode || "unsupported";
}

function getHeaderTitle() {
  if (activeDetection?.pageMode === "single_course" && activeDetection.course) {
    return activeDetection.course.courseName || `Course ${activeDetection.course.courseId}`;
  }
  if (activeDetection?.pageMode === "dashboard") {
    return activeDetection.pageTitle || "Canvas dashboard";
  }
  if (currentState?.pageMode === "single_course" && currentState.courses?.[0]) {
    return currentState.courses[0].courseName;
  }
  if (currentState?.pageMode === "dashboard") {
    return "Canvas dashboard";
  }
  return "Canvas";
}

function getIdleStatusText() {
  const mode = getMode();
  if (mode === "single_course") {
    return "Ready to scan current course.";
  }
  if (mode === "dashboard") {
    return "Select visible courses, then scan selected or all visible.";
  }
  return "Open a Canvas course, dashboard, or all courses page.";
}

function getStatusText() {
  if (currentState?.message && (currentState.isScanning || currentState.lastScanAt)) {
    return currentState.message;
  }
  return getIdleStatusText();
}

function renderActiveContext() {
  const mode = getMode();
  const isScanning = Boolean(currentState?.isScanning);
  const dashboardCourses = getDashboardCourses();

  elements.courseName.textContent = getHeaderTitle();
  elements.pageModeLine.textContent = MODE_LABELS[mode] || MODE_LABELS.unsupported;
  elements.statusLine.textContent = getStatusText();

  elements.singleCourseControls.classList.toggle("hidden", mode !== "single_course");
  elements.dashboardCourseSection.classList.toggle("hidden", mode !== "dashboard");

  elements.scanButton.disabled = isScanning;
  elements.scanSelectedCoursesButton.disabled = isScanning || selectedCourseIds.size === 0;
  elements.scanAllCoursesButton.disabled = isScanning || dashboardCourses.length === 0;
  elements.selectAllCoursesButton.disabled = isScanning || dashboardCourses.length === 0;
  elements.clearCourseSelectionButton.disabled = isScanning || dashboardCourses.length === 0;
}

function renderCoursePicker() {
  const courses = getDashboardCourses();
  seedCourseSelectionIfNeeded(courses);
  elements.detectedCourseCount.textContent = String(courses.length);

  if (getMode() !== "dashboard") {
    return;
  }

  if (!courses.length) {
    elements.courseListContainer.innerHTML = '<p class="emptyState">No visible dashboard courses detected.</p>';
    return;
  }

  elements.courseListContainer.innerHTML = courses
    .map((course) => {
      const metaBits = [];
      if (course.term) {
        metaBits.push(course.term);
      }
      if (course.courseId) {
        metaBits.push(`Course ${course.courseId}`);
      }

      return `
        <label class="courseItem">
          <input type="checkbox" data-course-id="${escapeHtml(course.courseId)}" ${selectedCourseIds.has(course.courseId) ? "checked" : ""}>
          <span>
            <p class="courseItemTitle">${escapeHtml(course.courseName)}</p>
            <p class="courseItemMeta">${escapeHtml(metaBits.join(" · ") || course.courseUrl)}</p>
          </span>
        </label>
      `;
    })
    .join("");

  elements.courseListContainer.querySelectorAll("input[data-course-id]").forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      const courseId = event.target.getAttribute("data-course-id");
      if (!courseId) {
        return;
      }
      if (event.target.checked) {
        selectedCourseIds.add(courseId);
      } else {
        selectedCourseIds.delete(courseId);
      }
      renderActiveContext();
    });
  });
}

function renderSummary(results) {
  elements.documentCount.textContent = String(results.length);
  elements.duplicateCount.textContent = String(currentState?.duplicateCountRemoved || 0);
  elements.pagesScanned.textContent = String(currentState?.stats?.pagesVisited || 0);
  elements.coursesScanned.textContent = String(currentState?.stats?.coursesScanned || 0);
}

function sanitizeSourceDetail(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }
  return UrlUtils?.looksLikeJavascriptGateText?.(normalized) ? "" : normalized;
}

function renderExtractionSummary() {
  const summary = currentState?.extractionSummary || {
    total: 0,
    extracted: 0,
    pending: 0,
    failed: 0,
    unsupported: 0,
    chunked: 0,
    notionEnriched: 0,
    automationReady: 0,
    latestMessage: ""
  };
  const hasContent = summary.total > 0;

  elements.extractedDocumentCount.textContent = String(summary.extracted || 0);
  elements.pendingExtractionCount.textContent = String(summary.pending || 0);
  elements.failedExtractionCount.textContent = String(summary.failed || 0);
  elements.unsupportedExtractionCount.textContent = String(summary.unsupported || 0);
  elements.extractionReadyBadge.textContent = `${summary.automationReady || 0} ready`;
  elements.extractionStatusLine.textContent = hasContent
    ? summary.latestMessage || `Phase 4 tracks ${summary.total} extractable records.`
    : "Scan Canvas content, then run Phase 4 extraction.";
  elements.extractionDetailLine.textContent =
    `Chunked ${summary.chunked || 0} · Notion enriched ${summary.notionEnriched || 0} · Automation ready ${summary.automationReady || 0}`;

  const isScanning = Boolean(currentState?.isScanning);
  elements.runExtractionButton.disabled = extractionBusy || isScanning || !hasContent;
  elements.retryExtractionButton.disabled = extractionBusy || isScanning || !(summary.failed > 0);
  elements.enrichNotionButton.disabled = extractionBusy || notionBusy || !hasContent;
}

function renderDownloadSummary() {
  const summary = currentState?.downloadSummary;
  if (!summary) {
    elements.downloadSummary.classList.add("hidden");
    elements.downloadSummary.textContent = "";
    return;
  }

  const courseName = currentState?.courses?.find((course) => course.courseId === summary.courseId)?.courseName;
  const scopeText = courseName ? ` for ${courseName}` : "";
  const skippedText = summary.skipped?.length ? ` Skipped ${summary.skipped.length}.` : "";
  elements.downloadSummary.textContent = `Started ${summary.started} of ${summary.attempted} downloads${scopeText}.${skippedText}`;
  elements.downloadSummary.classList.remove("hidden");
}

function renderProgress() {
  const progressEntries = Object.values(currentState?.courseProgress || {});
  if (!progressEntries.length) {
    elements.progressPanel.classList.add("hidden");
    elements.progressPanel.innerHTML = "";
    return;
  }

  const order = currentState?.courseOrder || progressEntries.map((entry) => entry.courseId);
  const progressById = new Map(progressEntries.map((entry) => [entry.courseId, entry]));
  const cards = order
    .map((courseId) => progressById.get(courseId))
    .filter(Boolean)
    .map((progress) => {
      const course = currentState?.courses?.find((item) => item.courseId === progress.courseId);
      const metaBits = [`${progress.pagesVisited || 0} pages`, `${progress.documentCount || 0} docs`];
      if (course?.term) {
        metaBits.unshift(course.term);
      }

      return `
        <article class="progressCard">
          <div class="progressCardHeader">
            <h2>${escapeHtml(progress.courseName || course?.courseName || progress.courseId)}</h2>
            <span class="pill statusPill status-${escapeHtml(progress.status)}">${escapeHtml(progress.status)}</span>
          </div>
          <p class="progressMeta">${escapeHtml(metaBits.join(" · "))}</p>
          <p class="progressMessage">${escapeHtml(progress.message)}</p>
        </article>
      `;
    })
    .join("");

  elements.progressPanel.innerHTML = `
    <div class="sectionHeader">
      <h2>Course progress</h2>
      <span class="pill">${progressEntries.length}</span>
    </div>
    <div class="progressGrid">${cards}</div>
  `;
  elements.progressPanel.classList.remove("hidden");
}

function groupResultsByCourseAndSection(results) {
  const byCourse = new Map();

  for (const result of results) {
    if (!byCourse.has(result.courseId)) {
      const bySection = new Map();
      for (const section of SECTION_ORDER) {
        bySection.set(section, []);
      }
      byCourse.set(result.courseId, bySection);
    }

    const courseSections = byCourse.get(result.courseId);
    if (!courseSections.has(result.sourceSection)) {
      courseSections.set(result.sourceSection, []);
    }
    courseSections.get(result.sourceSection).push(result);
  }

  return byCourse;
}

function renderResults() {
  const results = getVisibleResults();
  const grouped = groupResultsByCourseAndSection(results);
  const orderedCourses = getOrderedCourses();
  const coursesById = new Map(orderedCourses.map((course) => [course.courseId, course]));

  seedDocumentSelectionIfNeeded(results);
  renderSummary(results);
  renderDownloadSummary();

  const selectedVisibleCount = results.filter((item) => selectedDocumentIds.has(item.id)).length;
  elements.downloadSelectedButton.disabled = selectedVisibleCount === 0;
  elements.downloadAllButton.disabled = getDownloadableResults().length === 0;

  if (!results.length) {
    elements.resultsContainer.innerHTML = '<p class="emptyState">No results match the current filter.</p>';
    return;
  }

  const fragments = [];
  const visibleCourseIds = orderedCourses
    .map((course) => course.courseId)
    .filter((courseId) => grouped.has(courseId));
  for (const courseId of grouped.keys()) {
    if (!visibleCourseIds.includes(courseId)) {
      visibleCourseIds.push(courseId);
    }
  }

  for (const courseId of visibleCourseIds) {
    const course = coursesById.get(courseId) || {
      courseId,
      courseName: results.find((item) => item.courseId === courseId)?.courseName || `Course ${courseId}`
    };
    const sections = grouped.get(courseId);
    const courseItems = results.filter((item) => item.courseId === courseId);
    const courseDownloadableCount = getDownloadableResults().filter((item) => item.courseId === courseId).length;
    const sectionMarkup = SECTION_ORDER
      .map((section) => {
        const items = sections.get(section) || [];
        if (!items.length) {
          return "";
        }

        const itemMarkup = items
          .map((item) => {
            const badges = [];
            if (item.isCanvasHosted) {
              badges.push('<span class="pill badgeCanvas">Canvas</span>');
            }
            if (item.isExternal) {
              badges.push('<span class="pill badgeExternal">External</span>');
            }
            if (item.inferredExtension) {
              badges.push(`<span class="pill">${escapeHtml(item.inferredExtension.toUpperCase())}</span>`);
            }

            const detailBits = [];
            const sourceDetail = sanitizeSourceDetail(item.sourcePageTitle);
            if (sourceDetail) {
              detailBits.push(sourceDetail);
            }
            if (Array.isArray(item.seenInSections) && item.seenInSections.length > 1) {
              detailBits.push(
                `also in ${item.seenInSections
                  .slice(1)
                  .map((sectionName) => SECTION_LABELS[sectionName] || sectionName)
                  .join(", ")}`
              );
            }

            return `
              <label class="item">
                <input type="checkbox" data-document-id="${escapeHtml(item.id)}" ${selectedDocumentIds.has(item.id) ? "checked" : ""} ${item.isDownloadable ? "" : "disabled"}>
                <span>
                  <p class="itemTitle">${escapeHtml(item.fileName || item.linkText || item.url)}</p>
                  <div class="itemMeta">${badges.join("")}</div>
                  <p class="itemDetail">${escapeHtml(detailBits.join(" · ") || item.sourcePageUrl)}</p>
                </span>
              </label>
            `;
          })
          .join("");

        return `
          <section class="group nestedGroup">
            <div class="groupHeader">
              <h3>${escapeHtml(SECTION_LABELS[section] || section)}</h3>
              <span class="pill">${items.length}</span>
            </div>
            ${itemMarkup}
          </section>
        `;
      })
      .join("");

    const courseMetaBits = [];
    if (course.term) {
      courseMetaBits.push(course.term);
    }
    courseMetaBits.push(`${courseItems.length} visible docs`);

    fragments.push(`
      <section class="courseGroup">
        <div class="courseGroupHeader">
          <div>
            <h2>${escapeHtml(course.courseName)}</h2>
            <p class="courseGroupMeta">${escapeHtml(courseMetaBits.join(" · "))}</p>
          </div>
          <div class="courseGroupActions">
            <span class="pill">${courseItems.length}</span>
            <button class="secondary courseDownloadButton" data-download-course="${escapeHtml(course.courseId)}" ${courseDownloadableCount ? "" : "disabled"}>Download course</button>
          </div>
        </div>
        ${sectionMarkup}
      </section>
    `);
  }

  elements.resultsContainer.innerHTML = fragments.join("");

  elements.resultsContainer.querySelectorAll("input[data-document-id]").forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      const documentId = event.target.getAttribute("data-document-id");
      if (!documentId) {
        return;
      }
      if (event.target.checked) {
        selectedDocumentIds.add(documentId);
      } else {
        selectedDocumentIds.delete(documentId);
      }
      renderResults();
    });
  });

  elements.resultsContainer.querySelectorAll("button[data-download-course]").forEach((button) => {
    button.addEventListener("click", async () => {
      const courseId = button.getAttribute("data-download-course");
      if (!courseId) {
        return;
      }
      await downloadCourse(courseId);
    });
  });
}

function renderEverything() {
  renderActiveContext();
  renderCoursePicker();
  renderProgress();
  renderResults();
  renderExtractionSummary();
  if (notionState) {
    renderNotionSummary();
  }
  renderAutomationPanel();
}

async function refreshNotionState() {
  const response = await chrome.runtime.sendMessage({ type: "GET_NOTION_STATE" });
  if (!response?.ok) {
    elements.notionStatusLine.textContent = response?.error || "Failed to load academic workspace planner state.";
    return;
  }

  notionState = response.notion;
  renderNotionSummary();
  renderAutomationPanel();
}

async function refreshAutomationState() {
  const response = await chrome.runtime.sendMessage({ type: "GET_AUTOMATION_STATE" });
  if (!response?.ok) {
    elements.automationStatusLine.textContent = response?.error || "Failed to load automation state.";
    return;
  }

  automationState = response.automation;
  renderAutomationPanel();
}

async function refreshState() {
  const response = await chrome.runtime.sendMessage({ type: "GET_SCAN_STATE" });
  if (!response?.ok) {
    elements.statusLine.textContent = response?.error || "Failed to load scan state.";
    return;
  }

  currentState = response.state;
  renderEverything();
}

async function runSelectedAutomation() {
  const definition = getSelectedAutomationDefinition();
  if (!definition) {
    return;
  }

  setAutomationBusy(true);

  try {
    const response = await chrome.runtime.sendMessage({
      type: "RUN_AUTOMATION",
      automationId: definition.automationId,
      windowPreset: elements.automationWindowPreset.value,
      customStartDate: elements.automationStartDate.value,
      customEndDate: elements.automationEndDate.value,
      targetCourseId: definition.targetScope === "course" ? elements.automationCourseSelect.value : ""
    });
    if (!response?.ok) {
      automationState = response?.automation || automationState;
      renderAutomationPanel();
      elements.automationStatusLine.textContent = response?.error || "Automation run failed.";
      return;
    }

    automationState = response.automation || automationState;
    renderAutomationPanel();
  } finally {
    setAutomationBusy(false);
    await refreshAutomationState();
  }
}

async function saveNotionSettings() {
  setNotionBusy(true);
  setNotionActionMessage("Saving token and destination.");

  try {
    const response = await chrome.runtime.sendMessage({
      ...buildNotionSettingsPayload()
    });
    if (!response?.ok) {
      setNotionActionMessage(response?.error || "Save failed.");
      return;
    }

    notionState = response.notion;
    commitNotionFormState();
    setNotionActionMessage("Settings saved.");
    renderNotionSummary();
  } finally {
    setNotionBusy(false);
  }
}

async function clearNotionToken() {
  setNotionBusy(true);
  setNotionActionMessage("Clearing saved token.");

  try {
    const response = await chrome.runtime.sendMessage({
      type: "SAVE_NOTION_SETTINGS",
      destination: getNotionDestinationFromForm(),
      clearAccessToken: true
    });
    if (!response?.ok) {
      setNotionActionMessage(response?.error || "Token clear failed.");
      return;
    }

    elements.notionAccessToken.value = "";
    notionState = response.notion;
    commitNotionFormState();
    setNotionActionMessage("Saved token cleared.");
    renderNotionSummary();
  } finally {
    setNotionBusy(false);
  }
}

async function persistCurrentNotionSettings() {
  return chrome.runtime.sendMessage(buildNotionSettingsPayload());
}

async function validateNotionSettings() {
  setNotionBusy(true);
  setNotionActionMessage("Saving draft before validation.");

  try {
    const saved = await persistCurrentNotionSettings();
    if (!saved?.ok) {
      setNotionActionMessage(saved?.error || "Save failed before validation.");
      return;
    }
    notionState = saved.notion || notionState;
    commitNotionFormState();

    setNotionActionMessage("Validating Notion access and destination.");
    const response = await chrome.runtime.sendMessage({
      type: "VALIDATE_WORKSPACE_PLAN",
      includeRemote: true,
      destination: getNotionDestinationFromForm()
    });
    if (!response?.ok) {
      setNotionActionMessage(response?.error || "Validation failed.");
      return;
    }

    notionState = response.notion;
    setNotionActionMessage(response.validation?.summary || "Validation finished.");
    renderNotionSummary();
  } finally {
    setNotionBusy(false);
  }
}

async function planNotionSync() {
  setNotionBusy(true);
  setNotionActionMessage("Saving draft before plan.");

  try {
    const saved = await persistCurrentNotionSettings();
    if (!saved?.ok) {
      setNotionActionMessage(saved?.error || "Save failed before plan.");
      return;
    }
    notionState = saved.notion || notionState;
    commitNotionFormState();

    setNotionActionMessage("Building dry-run workspace plan.");
    const response = await chrome.runtime.sendMessage({
      type: "PLAN_ACADEMIC_WORKSPACE",
      dryRun: true,
      destination: getNotionDestinationFromForm()
    });
    if (!response?.ok) {
      notionState = response?.notion || notionState;
      renderNotionSummary();
      setNotionActionMessage(response?.error || "Planning failed.");
      return;
    }

    notionState = response.notion;
    setNotionActionMessage("Workspace plan ready.");
    renderNotionSummary();
  } finally {
    setNotionBusy(false);
  }
}

async function runLiveNotionSync() {
  setNotionBusy(true);
  setNotionActionMessage("Saving draft before live sync.");

  try {
    const saveResponse = await persistCurrentNotionSettings();
    if (!saveResponse?.ok) {
      setNotionActionMessage(saveResponse?.error || "Save failed before live sync.");
      return;
    }
    notionState = saveResponse.notion || notionState;
    commitNotionFormState();

    setNotionActionMessage("Running live Notion sync.");
    const response = await chrome.runtime.sendMessage({
      type: "RUN_LIVE_NOTION_SYNC",
      destination: getNotionDestinationFromForm()
    });
    notionState = response?.notion || notionState;
    renderNotionSummary();
    if (!response?.ok) {
      setNotionActionMessage(response?.error || "Live sync failed.");
      return;
    }
    setNotionActionMessage(response?.job?.summary || "Live sync completed.");
  } finally {
    setNotionBusy(false);
  }
}

async function detectActivePage() {
  const response = await chrome.runtime.sendMessage({ type: "DETECT_ACTIVE_PAGE" });
  if (!response?.ok) {
    activeDetection = {
      pageMode: "unsupported",
      pageTitle: "",
      course: null,
      courses: []
    };
    elements.statusLine.textContent = response?.error || "Unable to inspect the active tab.";
    renderEverything();
    return;
  }

  activeDetection = response.detection;
  renderEverything();
}

async function startScan(payload) {
  const response = await chrome.runtime.sendMessage({
    type: "START_SCAN",
    ...payload
  });
  if (!response?.ok) {
    elements.statusLine.textContent = response?.error || "Scan failed to start.";
    return;
  }
  await refreshState();
}

async function startCurrentCourseScan() {
  elements.statusLine.textContent = "Preparing course scan";
  await startScan({
    scanScope: "current"
  });
}

async function startSelectedCoursesScan() {
  const courseIds = Array.from(selectedCourseIds);
  if (!courseIds.length) {
    return;
  }
  elements.statusLine.textContent = `Preparing ${courseIds.length} selected courses`;
  await startScan({
    scanScope: "selected",
    courseIds
  });
}

async function startAllVisibleCoursesScan() {
  elements.statusLine.textContent = "Preparing all visible courses";
  await startScan({
    scanScope: "all_visible"
  });
}

async function downloadSelected() {
  const visibleIds = getVisibleResults()
    .filter((item) => selectedDocumentIds.has(item.id) && item.isDownloadable)
    .map((item) => item.id);

  if (!visibleIds.length) {
    return;
  }

  await chrome.runtime.sendMessage({
    type: "DOWNLOAD_SELECTED",
    documentIds: visibleIds
  });
  await refreshState();
}

async function downloadAll() {
  await chrome.runtime.sendMessage({ type: "DOWNLOAD_ALL" });
  await refreshState();
}

async function downloadCourse(courseId) {
  await chrome.runtime.sendMessage({
    type: "DOWNLOAD_COURSE",
    courseId
  });
  await refreshState();
}

async function runExtractionOnScannedContent() {
  setExtractionBusy(true);

  try {
    await chrome.runtime.sendMessage({
      type: "RUN_EXTRACTION_ON_SCANNED_CONTENT"
    });
    await refreshState();
  } finally {
    setExtractionBusy(false);
  }
}

async function retryFailedExtraction() {
  setExtractionBusy(true);

  try {
    await chrome.runtime.sendMessage({
      type: "RETRY_FAILED_EXTRACTION"
    });
    await refreshState();
  } finally {
    setExtractionBusy(false);
  }
}

async function enrichNotionWithExtractedContent() {
  setExtractionBusy(true);
  setNotionBusy(true);
  setNotionActionMessage("Enriching Notion with extracted content.");

  try {
    const response = await chrome.runtime.sendMessage({
      type: "ENRICH_NOTION_WITH_EXTRACTED_CONTENT",
      destination: getNotionDestinationFromForm()
    });
    notionState = response?.notion || notionState;
    await Promise.all([refreshState(), refreshNotionState()]);
    if (!response?.ok) {
      setNotionActionMessage(response?.error || "Notion enrichment failed.");
      return;
    }
    setNotionActionMessage(response?.job?.summary || "Notion enrichment completed.");
  } finally {
    setExtractionBusy(false);
    setNotionBusy(false);
  }
}

function selectVisible() {
  for (const item of getVisibleResults()) {
    if (item.isDownloadable) {
      selectedDocumentIds.add(item.id);
    }
  }
  renderResults();
}

function clearSelection() {
  selectedDocumentIds.clear();
  renderResults();
}

function selectAllCourses() {
  selectedCourseIds = new Set(getDashboardCourses().map((course) => course.courseId));
  renderEverything();
}

function clearCourseSelection() {
  selectedCourseIds.clear();
  renderEverything();
}

elements.scanButton.addEventListener("click", startCurrentCourseScan);
elements.scanSelectedCoursesButton.addEventListener("click", startSelectedCoursesScan);
elements.scanAllCoursesButton.addEventListener("click", startAllVisibleCoursesScan);
elements.selectAllCoursesButton.addEventListener("click", selectAllCourses);
elements.clearCourseSelectionButton.addEventListener("click", clearCourseSelection);
elements.downloadSelectedButton.addEventListener("click", downloadSelected);
elements.downloadAllButton.addEventListener("click", downloadAll);
elements.selectVisibleButton.addEventListener("click", selectVisible);
elements.clearSelectionButton.addEventListener("click", clearSelection);
elements.runExtractionButton.addEventListener("click", runExtractionOnScannedContent);
elements.retryExtractionButton.addEventListener("click", retryFailedExtraction);
elements.enrichNotionButton.addEventListener("click", enrichNotionWithExtractedContent);
elements.typeFilter.addEventListener("change", renderResults);
elements.saveNotionDestinationButton.addEventListener("click", saveNotionSettings);
elements.clearNotionTokenButton.addEventListener("click", clearNotionToken);
elements.validateWorkspacePlanButton.addEventListener("click", validateNotionSettings);
elements.planAcademicWorkspaceButton.addEventListener("click", planNotionSync);
elements.runNotionSyncButton.addEventListener("click", runLiveNotionSync);
elements.runAutomationButton.addEventListener("click", runSelectedAutomation);
elements.automationWindowPreset.addEventListener("change", renderAutomationPanel);
elements.automationStartDate.addEventListener("change", renderAutomationPanel);
elements.automationEndDate.addEventListener("change", renderAutomationPanel);
elements.automationCourseSelect.addEventListener("change", renderAutomationPanel);
elements.notionAccessToken.addEventListener("input", () => {
  notionDraft.accessTokenDirty = true;
  setNotionActionMessage("Token changed. Save or validate to use new token.");
});
elements.notionDestinationUrl.addEventListener("input", () => {
  notionDraft.destinationDirty = true;
  setNotionActionMessage("Destination changed. Save or validate to confirm page access.");
});
elements.notionTargetCourseId.addEventListener("change", () => {
  notionDraft.targetCourseDirty = true;
  setNotionActionMessage("Target course changed.");
});
elements.notionWorkspaceModeGeneral.addEventListener("change", () => {
  notionDraft.workspaceModeDirty = true;
  syncWorkspaceModeVisibility();
  setNotionActionMessage("Workspace mode changed.");
});
elements.notionWorkspaceModeClassSpecific.addEventListener("change", () => {
  notionDraft.workspaceModeDirty = true;
  syncWorkspaceModeVisibility();
  setNotionActionMessage("Workspace mode changed.");
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }

  if (changes.canvasCourseScanState) {
    currentState = changes.canvasCourseScanState.newValue;
    renderEverything();
  }

  if (
    changes.canvasCourseExportManifest ||
    changes.notionAuth ||
    changes.notionDestination ||
    changes.notionWorkspacePlan ||
    changes.notionAutomationContract ||
    changes.notionMappings ||
    changes.notionPlannerSummary ||
    changes.notionSyncJobs ||
    changes.notionLastValidation ||
    changes.notionLastSyncResult
  ) {
    refreshNotionState().catch(() => {});
  }

  if (changes.canvasAutomationDefinitions || changes.canvasAutomationRuns || changes.canvasAutomationLatest) {
    refreshAutomationState().catch(() => {});
  }
});

Promise.all([detectActivePage(), refreshState(), refreshNotionState(), refreshAutomationState()]).catch(() => {});
