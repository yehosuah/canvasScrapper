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
        Models.extractNotionUuid(parsed.searchParams.get("p")) ||
        Models.extractNotionUuid(parsed.searchParams.get("pageId")) ||
        Models.extractNotionUuid(parsed.searchParams.get("page_id"));
      if (fromQuery) {
        return fromQuery;
      }

      return Models.extractNotionUuid(parsed.pathname);
    } catch (error) {
      return "";
    }
  }

  function parsePageIdFromInput(value) {
    const raw = Models.trimString(value);
    if (!raw) {
      return "";
    }

    return parsePageIdFromUrl(raw) || Models.extractNotionUuid(raw);
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

  function isValidRawPageId(value) {
    const raw = Models.trimString(value);
    return Boolean(raw && !isValidNotionUrl(raw) && Models.extractNotionUuid(raw));
  }

  function isValidDestinationInput(value) {
    const raw = Models.trimString(value);
    if (!raw) {
      return false;
    }

    if (isValidNotionUrl(raw)) {
      return Boolean(parsePageIdFromUrl(raw));
    }

    return Boolean(Models.extractNotionUuid(raw));
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
    const destinationInput =
      Models.trimString(source.destinationInput) ||
      Models.trimString(source.destinationUrl) ||
      Models.extractNotionUuid(source.destinationPageId);
    const destinationUrl = isValidNotionUrl(destinationInput) ? destinationInput : "";
    const destinationPageId =
      parsePageIdFromInput(destinationInput) || Models.extractNotionUuid(source.destinationPageId);
    const workspaceMode = Models.normalizeEnum(source.workspaceMode, Models.WORKSPACE_MODES, "general");
    const targetCourseId = workspaceMode === "class_specific" ? Models.trimString(source.targetCourseId) : "";

    const nextDestination = {
      destinationInput,
      destinationUrl,
      destinationPageId,
      workspaceMode,
      targetCourseId,
      label: Models.trimString(source.label),
      validatedLocally: Boolean(destinationPageId && isValidDestinationInput(destinationInput)),
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
    if (!normalized.destinationInput) {
      return "Destination page URL or page ID missing.";
    }
    if (!isValidDestinationInput(normalized.destinationInput)) {
      return "Destination must be a valid Notion page URL or raw page ID.";
    }
    if (!normalized.destinationPageId) {
      return "Destination saved, but page ID could not be parsed locally.";
    }
    if (normalized.destinationUrl) {
      return `Destination page ID ${normalized.destinationPageId} parsed from Notion URL.`;
    }
    return `Destination page ID ${normalized.destinationPageId} parsed from raw page ID.`;
  }

  globalThis.CanvasNotionDestination = {
    createNotionDestination,
    describeDestination,
    isLikelyNotionHost,
    isValidDestinationInput,
    isValidNotionUrl,
    isValidRawPageId,
    parsePageIdFromInput,
    parsePageIdFromUrl
  };
})();
