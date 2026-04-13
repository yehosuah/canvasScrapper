(function () {
  if (globalThis.CanvasChunkContentUtils) {
    return;
  }

  const DEFAULT_CHUNK_SIZE = 2200;
  const DEFAULT_CHUNK_OVERLAP = 250;

  function trimString(value) {
    return String(value || "").trim();
  }

  function stableHash(value) {
    let hash = 0;
    const text = String(value || "");
    for (let index = 0; index < text.length; index += 1) {
      hash = (hash << 5) - hash + text.charCodeAt(index);
      hash |= 0;
    }
    return `h${Math.abs(hash)}`;
  }

  function splitLongText(text, maxChars) {
    const source = trimString(text);
    if (!source) {
      return [];
    }
    if (source.length <= maxChars) {
      return [source];
    }

    const pieces = [];
    let remaining = source;
    while (remaining.length > maxChars) {
      let cut = remaining.lastIndexOf(" ", maxChars);
      if (cut < Math.floor(maxChars / 2)) {
        cut = maxChars;
      }
      pieces.push(trimString(remaining.slice(0, cut)));
      remaining = trimString(remaining.slice(cut));
    }
    if (remaining) {
      pieces.push(remaining);
    }
    return pieces;
  }

  function normalizeSemanticUnits(extractionResult, options) {
    const blocks = Array.isArray(extractionResult?.semanticBlocks) ? extractionResult.semanticBlocks : [];
    const maxChars = Math.max(600, Number(options?.chunkSize || DEFAULT_CHUNK_SIZE));
    const units = [];
    const headingTrail = [];

    for (const block of blocks) {
      if (!trimString(block?.text)) {
        continue;
      }

      if (block.type === "heading") {
        const level = Math.max(1, Math.min(6, Number(block.level) || 1));
        headingTrail[level - 1] = trimString(block.text);
        headingTrail.length = level;
        continue;
      }

      const unitHeadingContext = headingTrail.filter(Boolean).join(" > ");
      for (const piece of splitLongText(block.text, maxChars)) {
        units.push({
          text: piece,
          blockType: block.type || "paragraph",
          headingContext: unitHeadingContext
        });
      }
    }

    if (units.length) {
      return units;
    }

    return splitLongText(extractionResult?.extractedText || "", maxChars).map((text) => ({
      text,
      blockType: "paragraph",
      headingContext: trimString(options?.fallbackHeadingContext)
    }));
  }

  function getUnitsLength(units) {
    return (units || []).reduce((total, unit, index) => total + unit.text.length + (index ? 2 : 0), 0);
  }

  function takeOverlapUnits(units, overlapChars) {
    if (!overlapChars) {
      return [];
    }

    const result = [];
    let current = 0;
    for (let index = units.length - 1; index >= 0; index -= 1) {
      const unit = units[index];
      result.unshift(unit);
      current += unit.text.length + (result.length > 1 ? 2 : 0);
      if (current >= overlapChars) {
        break;
      }
    }
    return result;
  }

  function buildChunkRecord(meta, units, chunkIndex) {
    const chunkText = units.map((unit) => unit.text).join("\n\n");
    const headingContext = units.map((unit) => unit.headingContext).find(Boolean) || "";
    const chunkId = `chunk:${meta.contentObjectId}:${String(chunkIndex).padStart(4, "0")}:${stableHash(
      `${headingContext}|${chunkText}`
    )}`;

    return {
      chunkId,
      chunkIndex,
      chunkText,
      tokenEstimate: Math.max(1, Math.ceil(chunkText.length / 4)),
      headingContext,
      contentObjectId: meta.contentObjectId,
      sourceDocumentId: meta.sourceDocumentId || null,
      courseId: meta.courseId,
      courseName: meta.courseName || "",
      contentType: meta.contentType || "",
      sourceCanvasUrl: meta.sourceCanvasUrl || "",
      sourcePageTitle: meta.sourcePageTitle || "",
      extractionVersion: meta.extractionVersion || "phase4-v1"
    };
  }

  function createChunks(meta, extractionResult, options) {
    const chunkSize = Math.max(600, Number(options?.chunkSize || DEFAULT_CHUNK_SIZE));
    const overlapChars = Math.max(0, Math.min(Math.floor(chunkSize / 2), Number(options?.chunkOverlap || DEFAULT_CHUNK_OVERLAP)));
    const units = normalizeSemanticUnits(extractionResult, {
      chunkSize,
      fallbackHeadingContext: options?.fallbackHeadingContext || meta?.sourcePageTitle || ""
    });

    if (!units.length) {
      return [];
    }

    const chunks = [];
    let currentUnits = [];

    for (const unit of units) {
      const candidateLength = getUnitsLength([...currentUnits, unit]);
      if (currentUnits.length && candidateLength > chunkSize) {
        chunks.push(buildChunkRecord(meta, currentUnits, chunks.length));
        currentUnits = [...takeOverlapUnits(currentUnits, overlapChars), unit];
        continue;
      }
      currentUnits.push(unit);
    }

    if (currentUnits.length) {
      chunks.push(buildChunkRecord(meta, currentUnits, chunks.length));
    }

    return chunks;
  }

  globalThis.CanvasChunkContentUtils = {
    DEFAULT_CHUNK_OVERLAP,
    DEFAULT_CHUNK_SIZE,
    createChunks
  };
})();
