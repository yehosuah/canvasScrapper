(function () {
  if (globalThis.CanvasNotionDestination) {
    return;
  }

  const Models = globalThis.CanvasNotionModels;
  if (!Models) {
    throw new Error("CanvasNotionModels must load before CanvasNotionDestination.");
  }

  function isLikelyNotionHost(hostname) {
    return /(^|\.)notion\.so$/i.test(hostname) || /(^|\.)notion\.site$/i.test(hostname);
  }

  function parsePageIdFromUrl(value) {
    const raw = Models.trimString(value);
    if (!raw) {
      return "";
    }

    try {
      const parsed = new URL(raw);
      if (!isLikelyNotionHost(parsed.hostname)) {
        return "";
      }

      const fromQuery =
        Models.normalizeNotionId(parsed.searchParams.get("p")) ||
        Models.normalizeNotionId(parsed.searchParams.get("pageId")) ||
        Models.normalizeNotionId(parsed.searchParams.get("page_id"));
      if (fromQuery) {
        return fromQuery;
      }

      return Models.normalizeNotionId(parsed.pathname);
    } catch (error) {
      return Models.normalizeNotionId(raw);
    }
  }

  function isValidNotionUrl(value) {
    const raw = Models.trimString(value);
    if (!raw) {
      return false;
    }

    try {
      const parsed = new URL(raw);
      return isLikelyNotionHost(parsed.hostname);
    } catch (error) {
      return false;
    }
  }

  function buildDefaultLabel(destination) {
    const modeLabel = destination.workspaceMode === "class_specific" ? "Class-specific workspace" : "General academic workspace";
    if (destination.workspaceMode === "class_specific" && destination.targetCourseId) {
      return `${modeLabel} · Course ${destination.targetCourseId}`;
    }
    return modeLabel;
  }

  function createNotionDestination(rawDestination) {
    const source = rawDestination || {};
    const createdAt = Models.trimString(source.createdAt) || Models.nowIso();
    const destinationUrl = Models.trimString(source.destinationUrl);
    const destinationPageId =
      parsePageIdFromUrl(destinationUrl) || Models.normalizeNotionId(source.destinationPageId);
    const workspaceMode = Models.normalizeEnum(source.workspaceMode, Models.WORKSPACE_MODES, "general");
    const targetCourseId = workspaceMode === "class_specific" ? Models.trimString(source.targetCourseId) : "";

    const nextDestination = {
      destinationUrl,
      destinationPageId,
      workspaceMode,
      targetCourseId,
      label: Models.trimString(source.label),
      validatedLocally: Boolean(isValidNotionUrl(destinationUrl) && destinationPageId),
      remoteValidationState: Models.normalizeEnum(
        source.remoteValidationState,
        Models.REMOTE_VALIDATION_STATES,
        "not_started"
      ),
      createdAt,
      updatedAt: Models.nowIso()
    };

    nextDestination.label = nextDestination.label || buildDefaultLabel(nextDestination);
    return nextDestination;
  }

  function describeDestination(destination) {
    const normalized = createNotionDestination(destination);
    if (!normalized.destinationUrl) {
      return "Destination page URL missing.";
    }
    if (!normalized.destinationPageId) {
      return "Destination URL saved, but page ID could not be parsed locally.";
    }
    return `Destination page ID ${normalized.destinationPageId} parsed locally.`;
  }

  globalThis.CanvasNotionDestination = {
    createNotionDestination,
    describeDestination,
    isLikelyNotionHost,
    isValidNotionUrl,
    parsePageIdFromUrl
  };
})();
