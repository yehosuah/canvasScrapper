(function () {
  if (globalThis.CanvasAutomationStorage) {
    return;
  }

  const Models = globalThis.CanvasAutomationModels;
  if (!Models) {
    throw new Error("CanvasAutomationModels must load before CanvasAutomationStorage.");
  }

  const KEYS = Models.STORAGE_KEYS;
  const ALL_KEYS = Object.values(KEYS);
  const MAX_RUNS = 30;

  function sortRuns(runs) {
    return [...(runs || [])].sort((left, right) => {
      const leftValue = new Date(left?.startedAt || left?.completedAt || 0).getTime();
      const rightValue = new Date(right?.startedAt || right?.completedAt || 0).getTime();
      return rightValue - leftValue;
    });
  }

  function normalizeDefinitions(definitions) {
    return Models.seedAutomationDefinitions(definitions || []);
  }

  function normalizeRuns(runs) {
    return sortRuns((runs || []).map((run) => Models.createAutomationRun(run))).slice(0, MAX_RUNS);
  }

  function normalizeLatest(latest) {
    const source = latest || {};
    const rawByAutomationId = source.byAutomationId && typeof source.byAutomationId === "object" ? source.byAutomationId : {};
    const byAutomationId = {};
    for (const definition of Models.DEFAULT_AUTOMATION_DEFINITIONS) {
      const summary = rawByAutomationId[definition.automationId];
      if (summary) {
        byAutomationId[definition.automationId] = Models.createAutomationResultSummary(summary);
      }
    }
    for (const [automationId, summary] of Object.entries(rawByAutomationId)) {
      if (!byAutomationId[automationId]) {
        byAutomationId[automationId] = Models.createAutomationResultSummary(summary);
      }
    }
    return {
      byAutomationId,
      updatedAt: Models.trimString(source.updatedAt) || null
    };
  }

  async function readRawState() {
    const stored = await chrome.storage.local.get(ALL_KEYS);
    return {
      [KEYS.definitions]: normalizeDefinitions(stored[KEYS.definitions]),
      [KEYS.runs]: normalizeRuns(stored[KEYS.runs]),
      [KEYS.latest]: normalizeLatest(stored[KEYS.latest])
    };
  }

  async function ensureStorageShape() {
    const state = await readRawState();
    const presence = await chrome.storage.local.get(ALL_KEYS);
    const patch = {};

    if (!(KEYS.definitions in presence)) {
      patch[KEYS.definitions] = state[KEYS.definitions];
    } else if (
      JSON.stringify(state[KEYS.definitions]) !== JSON.stringify(presence[KEYS.definitions] || [])
    ) {
      patch[KEYS.definitions] = state[KEYS.definitions];
    }

    if (!(KEYS.runs in presence)) {
      patch[KEYS.runs] = state[KEYS.runs];
    }

    if (!(KEYS.latest in presence)) {
      patch[KEYS.latest] = state[KEYS.latest];
    }

    if (Object.keys(patch).length) {
      await chrome.storage.local.set(patch);
    }

    return readRawState();
  }

  async function getAutomationState() {
    await ensureStorageShape();
    return readRawState();
  }

  async function getDefinitions() {
    return (await getAutomationState())[KEYS.definitions];
  }

  async function setDefinitions(definitions) {
    const normalized = normalizeDefinitions(definitions);
    await chrome.storage.local.set({
      [KEYS.definitions]: normalized
    });
    return normalized;
  }

  async function getRuns() {
    return (await getAutomationState())[KEYS.runs];
  }

  async function setRuns(runs) {
    const normalized = normalizeRuns(runs);
    await chrome.storage.local.set({
      [KEYS.runs]: normalized
    });
    return normalized;
  }

  async function upsertRun(run) {
    const normalized = Models.createAutomationRun(run);
    const runs = await getRuns();
    const nextRuns = normalizeRuns([normalized, ...runs.filter((item) => item.runId !== normalized.runId)]);
    await chrome.storage.local.set({
      [KEYS.runs]: nextRuns
    });
    return normalized;
  }

  async function getLatest() {
    return (await getAutomationState())[KEYS.latest];
  }

  async function setLatest(latest) {
    const normalized = normalizeLatest(latest);
    await chrome.storage.local.set({
      [KEYS.latest]: normalized
    });
    return normalized;
  }

  async function setLatestForAutomation(summary) {
    const normalized = Models.createAutomationResultSummary(summary);
    const latest = await getLatest();
    const nextLatest = {
      byAutomationId: {
        ...(latest.byAutomationId || {}),
        [normalized.automationId]: normalized
      },
      updatedAt: Models.nowIso()
    };
    await chrome.storage.local.set({
      [KEYS.latest]: nextLatest
    });
    return normalized;
  }

  globalThis.CanvasAutomationStorage = {
    ensureStorageShape,
    getAutomationState,
    getDefinitions,
    getLatest,
    getRuns,
    setDefinitions,
    setLatest,
    setLatestForAutomation,
    setRuns,
    upsertRun
  };
})();
