(function () {
  if (globalThis.CanvasDedupeUtils) {
    return;
  }

  const UrlUtils = globalThis.CanvasUrlUtils;
  if (!UrlUtils) {
    throw new Error("CanvasUrlUtils must be loaded before CanvasDedupeUtils.");
  }

  function normalizeFilename(value) {
    return UrlUtils.sanitizePathSegment((value || "").toLowerCase(), "").replace(/\s+/g, " ");
  }

  function buildCourseScope(documentItem) {
    const sourceUrl = UrlUtils.safeUrl(documentItem.sourcePageUrl || documentItem.url);
    const origin = sourceUrl ? new URL(sourceUrl).origin : "";
    return `${origin}:${documentItem.courseId || "unknown-course"}`;
  }

  function buildDocumentIdentity(documentItem) {
    const canonicalUrl = documentItem.canonicalUrl || UrlUtils.canonicalizeUrl(documentItem.url);
    const canvasFileId = documentItem.canvasFileId || UrlUtils.extractCanvasFileId(documentItem.url);
    const fallbackName = normalizeFilename(documentItem.fileName || documentItem.linkText || UrlUtils.extractFileNameFromUrl(documentItem.url));
    const courseScope = buildCourseScope(documentItem);

    if (canonicalUrl) {
      return {
        canonicalUrl,
        canvasFileId,
        courseScope,
        key: `url:${courseScope}:${canonicalUrl}`
      };
    }

    if (canvasFileId) {
      return {
        canonicalUrl,
        canvasFileId,
        courseScope,
        key: `file:${courseScope}:${canvasFileId}`
      };
    }

    return {
      canonicalUrl,
      canvasFileId,
      courseScope,
      key: `name:${courseScope}:${fallbackName}`
    };
  }

  function choosePreferredSource(existingSection, incomingSection) {
    const existingPriority = UrlUtils.getSectionPriority(existingSection);
    const incomingPriority = UrlUtils.getSectionPriority(incomingSection);
    return incomingPriority < existingPriority ? incomingSection : existingSection;
  }

  function pickBetterValue(existingValue, incomingValue) {
    if (!existingValue && incomingValue) {
      return incomingValue;
    }
    if (!incomingValue) {
      return existingValue;
    }
    return incomingValue.length > existingValue.length ? incomingValue : existingValue;
  }

  function pickBetterPageTitle(existingValue, incomingValue) {
    const existingLooksBroken = UrlUtils.looksLikeJavascriptGateText(existingValue);
    const incomingLooksBroken = UrlUtils.looksLikeJavascriptGateText(incomingValue);
    if (existingLooksBroken && !incomingLooksBroken) {
      return incomingValue;
    }
    if (incomingLooksBroken && !existingLooksBroken) {
      return existingValue;
    }
    return pickBetterValue(existingValue, incomingValue);
  }

  function mergeDocument(existingDocument, incomingDocument) {
    const merged = { ...existingDocument };
    merged.sourceSection = choosePreferredSource(existingDocument.sourceSection, incomingDocument.sourceSection);
    merged.courseName = pickBetterValue(existingDocument.courseName, incomingDocument.courseName);
    merged.sourcePageTitle = pickBetterPageTitle(existingDocument.sourcePageTitle, incomingDocument.sourcePageTitle);
    merged.fileName = pickBetterValue(existingDocument.fileName, incomingDocument.fileName);
    merged.linkText = pickBetterValue(existingDocument.linkText, incomingDocument.linkText);
    merged.folderHint = pickBetterValue(existingDocument.folderHint, incomingDocument.folderHint);
    merged.mimeGuess = pickBetterValue(existingDocument.mimeGuess, incomingDocument.mimeGuess);
    merged.inferredExtension = pickBetterValue(existingDocument.inferredExtension, incomingDocument.inferredExtension);
    merged.localDownloadPath = pickBetterValue(existingDocument.localDownloadPath, incomingDocument.localDownloadPath);
    merged.discoveredAt = existingDocument.discoveredAt || incomingDocument.discoveredAt;

    if (!merged.isCanvasHosted && incomingDocument.isCanvasHosted) {
      merged.url = incomingDocument.url;
      merged.canonicalUrl = incomingDocument.canonicalUrl || merged.canonicalUrl;
    }

    merged.isCanvasHosted = merged.isCanvasHosted || incomingDocument.isCanvasHosted;
    merged.isDownloadable = merged.isDownloadable || incomingDocument.isDownloadable;
    merged.isExternal = merged.isExternal && incomingDocument.isExternal;
    merged.canvasFileId = merged.canvasFileId || incomingDocument.canvasFileId;

    const seenSections = new Set([...(existingDocument.seenInSections || [existingDocument.sourceSection]), ...(incomingDocument.seenInSections || [incomingDocument.sourceSection])].filter(Boolean));
    const sourcePageUrls = new Set([existingDocument.sourcePageUrl, incomingDocument.sourcePageUrl, ...(existingDocument.sourcePageUrls || []), ...(incomingDocument.sourcePageUrls || [])].filter(Boolean));

    merged.seenInSections = Array.from(seenSections);
    merged.sourcePageUrls = Array.from(sourcePageUrls);
    return merged;
  }

  function buildContentItemIdentity(contentItem) {
    const courseScope = `${contentItem.courseId || "unknown-course"}:${contentItem.contentType || "content"}`;
    const primaryUrl =
      contentItem.externalUrl ||
      contentItem.sourcePageUrl ||
      contentItem.sourceCanvasUrl ||
      contentItem.url ||
      "";
    const canonicalUrl = UrlUtils.canonicalizeUrl(primaryUrl);
    const titleKey = normalizeFilename(contentItem.sourcePageTitle || contentItem.title || contentItem.courseName || "content");
    return {
      canonicalUrl,
      key: canonicalUrl ? `content:${courseScope}:${canonicalUrl}` : `content:${courseScope}:${titleKey}`
    };
  }

  function mergeContentItem(existingItem, incomingItem) {
    const merged = { ...existingItem };
    merged.sourceSection = choosePreferredSource(existingItem.sourceSection, incomingItem.sourceSection);
    merged.courseName = pickBetterValue(existingItem.courseName, incomingItem.courseName);
    merged.sourcePageTitle = pickBetterPageTitle(existingItem.sourcePageTitle, incomingItem.sourcePageTitle);
    merged.title = pickBetterValue(existingItem.title, incomingItem.title);
    merged.bodyHtml = pickBetterValue(existingItem.bodyHtml, incomingItem.bodyHtml);
    merged.bodyText = pickBetterValue(existingItem.bodyText, incomingItem.bodyText);
    merged.excerpt = pickBetterValue(existingItem.excerpt, incomingItem.excerpt);
    merged.weekOrModule = pickBetterValue(existingItem.weekOrModule, incomingItem.weekOrModule);
    merged.contentHash = incomingItem.contentHash || existingItem.contentHash;
    merged.dueDate = existingItem.dueDate || incomingItem.dueDate || null;
    merged.isExternal = Boolean(existingItem.isExternal || incomingItem.isExternal);
    merged.externalUrl = existingItem.externalUrl || incomingItem.externalUrl || "";
    merged.sourceCanvasUrl = existingItem.sourceCanvasUrl || incomingItem.sourceCanvasUrl || existingItem.sourcePageUrl;
    merged.discoveredAt = existingItem.discoveredAt || incomingItem.discoveredAt;
    return merged;
  }

  function dedupeDocuments(documents) {
    const byPrimaryKey = new Map();
    const keyAliases = new Map();
    let duplicatesRemoved = 0;

    for (const rawDocument of documents) {
      const identity = buildDocumentIdentity(rawDocument);
      const aliasKeys = [identity.key];
      if (identity.canvasFileId) {
        aliasKeys.push(`file:${identity.courseScope}:${identity.canvasFileId}`);
      }
      if (identity.canonicalUrl) {
        aliasKeys.push(`url:${identity.courseScope}:${identity.canonicalUrl}`);
      }

      let targetKey = null;
      for (const key of aliasKeys) {
        if (keyAliases.has(key)) {
          targetKey = keyAliases.get(key);
          break;
        }
      }

      if (!targetKey) {
        const withIdentity = {
          ...rawDocument,
          id: identity.key,
          canonicalUrl: identity.canonicalUrl || rawDocument.canonicalUrl || "",
          canvasFileId: identity.canvasFileId || rawDocument.canvasFileId || undefined,
          seenInSections: [rawDocument.sourceSection],
          sourcePageUrls: [rawDocument.sourcePageUrl]
        };
        byPrimaryKey.set(identity.key, withIdentity);
        targetKey = identity.key;
      } else {
        const existing = byPrimaryKey.get(targetKey);
        byPrimaryKey.set(targetKey, mergeDocument(existing, rawDocument));
        duplicatesRemoved += 1;
      }

      for (const key of aliasKeys) {
        keyAliases.set(key, targetKey);
      }
    }

    const items = Array.from(byPrimaryKey.values()).sort((left, right) => {
      const sectionDelta = UrlUtils.getSectionPriority(left.sourceSection) - UrlUtils.getSectionPriority(right.sourceSection);
      if (sectionDelta !== 0) {
        return sectionDelta;
      }
      return (left.fileName || left.linkText || left.url).localeCompare(right.fileName || right.linkText || right.url);
    });

    return {
      items,
      duplicatesRemoved
    };
  }

  function dedupeContentItems(contentItems) {
    const byPrimaryKey = new Map();
    let duplicatesRemoved = 0;

    for (const rawItem of contentItems || []) {
      const identity = buildContentItemIdentity(rawItem);
      if (!byPrimaryKey.has(identity.key)) {
        byPrimaryKey.set(identity.key, {
          ...rawItem,
          id: rawItem.id || identity.key
        });
        continue;
      }

      byPrimaryKey.set(identity.key, mergeContentItem(byPrimaryKey.get(identity.key), rawItem));
      duplicatesRemoved += 1;
    }

    return {
      items: Array.from(byPrimaryKey.values()).sort((left, right) =>
        (left.sourcePageTitle || left.title || "").localeCompare(right.sourcePageTitle || right.title || "")
      ),
      duplicatesRemoved
    };
  }

  globalThis.CanvasDedupeUtils = {
    buildDocumentIdentity,
    buildContentItemIdentity,
    dedupeDocuments,
    dedupeContentItems,
    mergeContentItem,
    mergeDocument
  };
})();
