(function () {
  if (globalThis.CanvasExtractContentUtils) {
    return;
  }

  const UrlUtils = globalThis.CanvasUrlUtils;
  if (!UrlUtils) {
    throw new Error("CanvasUrlUtils must load before CanvasExtractContentUtils.");
  }

  const CANVAS_NATIVE_CONTENT_TYPES = new Set(["canvas_page", "assignment", "syllabus", "module_resource"]);
  const HTML_FILE_EXTENSIONS = new Set(["html", "htm"]);
  const TEXT_FILE_EXTENSIONS = new Set(["txt", "text"]);
  const IMAGE_FILE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "bmp", "webp", "svg", "heic", "heif", "tif", "tiff"]);
  const EXTRACTION_SOURCE_CATEGORIES = [
    "canvas_native_html",
    "pdf",
    "docx",
    "txt",
    "html_file",
    "unsupported"
  ];
  const SUPPORTED_ARTIFACT_KINDS = new Set(["pdf", "docx", "txt", "html_file"]);
  const MIME_KIND_MAP = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "text/plain": "txt",
    "text/html": "html_file",
    "application/xhtml+xml": "html_file"
  };

  function trimString(value) {
    return String(value || "").trim();
  }

  function getArtifactExtension(record) {
    return (
      trimString(record?.inferredExtension) ||
      UrlUtils.guessExtension(record?.fileName || "") ||
      UrlUtils.guessExtension(record?.sourceCanvasUrl || "") ||
      UrlUtils.guessExtension(record?.sourcePageUrl || "")
    ).toLowerCase();
  }

  function getKindFromMime(contentType) {
    const normalized = trimString(contentType).split(";")[0].toLowerCase();
    if (!normalized) {
      return "";
    }

    if (MIME_KIND_MAP[normalized]) {
      return MIME_KIND_MAP[normalized];
    }
    if (normalized.startsWith("text/")) {
      return "txt";
    }
    if (normalized.startsWith("image/")) {
      return "image";
    }
    return "";
  }

  function getKindFromExtension(extension) {
    const normalized = trimString(extension).toLowerCase();
    if (!normalized) {
      return "";
    }
    if (normalized === "pdf") {
      return "pdf";
    }
    if (normalized === "docx") {
      return "docx";
    }
    if (normalized === "doc") {
      return "legacy_word";
    }
    if (TEXT_FILE_EXTENSIONS.has(normalized)) {
      return "txt";
    }
    if (HTML_FILE_EXTENSIONS.has(normalized)) {
      return "html_file";
    }
    if (normalized === "ppt" || normalized === "pptx") {
      return "slides";
    }
    if (normalized === "xls" || normalized === "xlsx" || normalized === "csv") {
      return "spreadsheet";
    }
    if (IMAGE_FILE_EXTENSIONS.has(normalized)) {
      return "image";
    }
    return "unknown_binary";
  }

  function getUnsupportedReason(kind, extension) {
    if (kind === "legacy_word") {
      return "Legacy .doc extraction is not supported in Phase 4.";
    }
    if (kind === "slides") {
      return "Slide deck extraction is not supported yet.";
    }
    if (kind === "spreadsheet") {
      return "Spreadsheet extraction is not supported yet.";
    }
    if (kind === "image") {
      return "Image extraction/OCR is not supported yet.";
    }
    if (kind === "unknown_binary") {
      return extension
        ? `Unsupported binary file type: .${extension}.`
        : "Unsupported binary file type.";
    }
    return "Source is not supported for extraction.";
  }

  function buildCanvasNativeDescriptor(record) {
    return {
      supported: true,
      sourceCategory: "canvas_native_html",
      artifactKind: "canvas_native_html",
      extractionMethod: "canvas_html_dom_v1",
      fetchMode: trimString(record?.bodyHtml) || trimString(record?.bodyText) ? "inline_html" : "fetch_html",
      sourceUrl: trimString(record?.sourceCanvasUrl || record?.sourcePageUrl),
      unsupportedReason: ""
    };
  }

  function buildArtifactDescriptor(record, responseContentType) {
    const extension = getArtifactExtension(record);
    const mimeKind = getKindFromMime(responseContentType || record?.mimeGuess);
    const kind = mimeKind || getKindFromExtension(extension);

    if (SUPPORTED_ARTIFACT_KINDS.has(kind)) {
      return {
        supported: true,
        sourceCategory: kind,
        artifactKind: kind,
        extractionMethod:
          kind === "pdf"
            ? "pdfjs_text_v1"
            : kind === "docx"
              ? "mammoth_docx_v1"
              : kind === "html_file"
                ? "html_file_dom_v1"
                : "plain_text_v1",
        fetchMode: kind === "txt" || kind === "html_file" ? "fetch_text" : "fetch_binary",
        sourceUrl: trimString(record?.sourceCanvasUrl || record?.sourcePageUrl),
        unsupportedReason: ""
      };
    }

    return {
      supported: false,
      sourceCategory: "unsupported",
      artifactKind: kind || "unknown_binary",
      extractionMethod: "",
      fetchMode: "none",
      sourceUrl: trimString(record?.sourceCanvasUrl || record?.sourcePageUrl),
      unsupportedReason: getUnsupportedReason(kind || "unknown_binary", extension)
    };
  }

  function createExtractionDescriptor(record, responseContentType) {
    const contentType = trimString(record?.contentType);
    if (!record || !contentType) {
      return {
        supported: false,
        sourceCategory: "unsupported",
        artifactKind: "unknown",
        extractionMethod: "",
        fetchMode: "none",
        sourceUrl: "",
        unsupportedReason: "Record is missing normalized content metadata."
      };
    }

    if (CANVAS_NATIVE_CONTENT_TYPES.has(contentType)) {
      return buildCanvasNativeDescriptor(record);
    }

    if (contentType === "file_artifact") {
      return buildArtifactDescriptor(record, responseContentType);
    }

    if (contentType === "external_resource") {
      return {
        supported: false,
        sourceCategory: "unsupported",
        artifactKind: "external_resource",
        extractionMethod: "",
        fetchMode: "none",
        sourceUrl: trimString(record?.externalUrl || record?.sourceCanvasUrl || record?.sourcePageUrl),
        unsupportedReason: "External resource metadata is tracked, but body extraction is not supported."
      };
    }

    return {
      supported: false,
      sourceCategory: "unsupported",
      artifactKind: "not_applicable",
      extractionMethod: "",
      fetchMode: "none",
      sourceUrl: trimString(record?.sourceCanvasUrl || record?.sourcePageUrl),
      unsupportedReason: "This normalized record type does not participate in Phase 4 extraction."
    };
  }

  function isExtractionCandidate(record) {
    const descriptor = createExtractionDescriptor(record);
    return descriptor.supported;
  }

  globalThis.CanvasExtractContentUtils = {
    CANVAS_NATIVE_CONTENT_TYPES,
    EXTRACTION_SOURCE_CATEGORIES,
    SUPPORTED_ARTIFACT_KINDS,
    createExtractionDescriptor,
    getArtifactExtension,
    getKindFromExtension,
    getKindFromMime,
    isExtractionCandidate
  };
})();
