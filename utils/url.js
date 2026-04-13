(function () {
  if (globalThis.CanvasUrlUtils) {
    return;
  }

  const SOURCE_SECTIONS = ["files", "modules", "pages", "assignments", "syllabus", "home"];
  const SECTION_LABELS = {
    files: "Files",
    modules: "Modules",
    pages: "Pages",
    assignments: "Assignments",
    syllabus: "Syllabus",
    home: "Home"
  };
  const DOCUMENT_EXTENSIONS = new Set([
    "pdf",
    "doc",
    "docx",
    "html",
    "htm",
    "ppt",
    "pptx",
    "xls",
    "xlsx",
    "txt",
    "zip"
  ]);
  const EXTENSION_CATEGORY_MAP = {
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
  const MIME_BY_EXTENSION = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    html: "text/html",
    htm: "text/html",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    txt: "text/plain",
    zip: "application/zip"
  };
  const CANVAS_HOST_SUFFIXES = ["instructure.com", "canvaslms.com"];
  const DASHBOARD_PATH_PATTERNS = [/^\/dashboard(?:\/|$)/, /^\/courses\/?$/, /^\/dashboard\/courses(?:\/|$)/, /^\/search\/all_courses(?:\/|$)/];
  const IGNORED_QUERY_KEYS = new Set([
    "module_item_id",
    "module_item_redirect",
    "download_frd",
    "wrap",
    "verifier",
    "persist_headless",
    "force_user",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content"
  ]);
  const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;
  const WHITESPACE_RE = /\s+/g;
  const TRAILING_DOTS_RE = /^[.\s]+|[.\s]+$/g;

  function safeUrl(rawUrl, baseUrl) {
    if (!rawUrl) {
      return null;
    }

    try {
      return new URL(rawUrl, baseUrl).toString();
    } catch (error) {
      return null;
    }
  }

  function normalizePathname(pathname) {
    if (!pathname) {
      return "/";
    }

    const normalized = pathname.replace(/\/{2,}/g, "/");
    if (normalized.length > 1 && normalized.endsWith("/")) {
      return normalized.slice(0, -1);
    }
    return normalized;
  }

  function canonicalizeUrl(rawUrl, baseUrl) {
    const resolved = safeUrl(rawUrl, baseUrl);
    if (!resolved) {
      return "";
    }

    const url = new URL(resolved);
    url.hash = "";

    const kept = [];
    for (const [key, value] of url.searchParams.entries()) {
      if (IGNORED_QUERY_KEYS.has(key)) {
        continue;
      }
      kept.push([key, value]);
    }

    kept.sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      const left = `${leftKey}:${leftValue}`;
      const right = `${rightKey}:${rightValue}`;
      return left.localeCompare(right);
    });

    url.search = "";
    for (const [key, value] of kept) {
      url.searchParams.append(key, value);
    }

    url.pathname = normalizePathname(url.pathname);
    return url.toString();
  }

  function extractCourseId(rawUrl) {
    const resolved = safeUrl(rawUrl);
    if (!resolved) {
      return null;
    }

    const match = new URL(resolved).pathname.match(/\/courses\/(\d+)(?:\/|$)/);
    return match ? match[1] : null;
  }

  function inferSectionFromUrl(rawUrl, courseId) {
    const resolved = safeUrl(rawUrl);
    if (!resolved) {
      return null;
    }

    const url = new URL(resolved);
    const coursePath = `/courses/${courseId || extractCourseId(resolved) || ""}`;
    if (!url.pathname.startsWith(coursePath)) {
      return null;
    }

    const suffix = normalizePathname(url.pathname.slice(coursePath.length) || "/");
    if (suffix === "/" || suffix === "") {
      return "home";
    }
    if (suffix === "/modules" || suffix.startsWith("/modules/")) {
      return "modules";
    }
    if (suffix === "/pages" || suffix.startsWith("/pages/")) {
      return "pages";
    }
    if (suffix === "/assignments" || suffix.startsWith("/assignments/")) {
      return "assignments";
    }
    if (suffix === "/files" || suffix.startsWith("/files/")) {
      return "files";
    }
    if (suffix === "/assignments/syllabus" || suffix.startsWith("/assignments/syllabus")) {
      return "syllabus";
    }
    return null;
  }

  function getCourseContext(rawUrl) {
    const resolved = safeUrl(rawUrl);
    if (!resolved) {
      return null;
    }

    const url = new URL(resolved);
    const courseId = extractCourseId(resolved);
    if (!courseId) {
      return null;
    }

    return {
      origin: url.origin,
      courseId,
      pageUrl: url.toString(),
      section: inferSectionFromUrl(url.toString(), courseId)
    };
  }

  function isCanvasCourseUrl(rawUrl) {
    return Boolean(getCourseContext(rawUrl));
  }

  function isDashboardUrl(rawUrl) {
    const resolved = safeUrl(rawUrl);
    if (!resolved) {
      return false;
    }

    const pathname = normalizePathname(new URL(resolved).pathname);
    return DASHBOARD_PATH_PATTERNS.some((pattern) => pattern.test(pathname));
  }

  function getCanvasPageMode(rawUrl) {
    if (getCourseContext(rawUrl)) {
      return "single_course";
    }
    if (isDashboardUrl(rawUrl)) {
      return "dashboard";
    }
    return "unsupported";
  }

  function buildCourseHomeUrl(rawUrl, courseId, origin) {
    const resolvedCourseId = courseId || extractCourseId(rawUrl);
    const resolved = safeUrl(rawUrl, origin);
    if (!resolvedCourseId || !resolved) {
      return "";
    }

    const url = new URL(resolved);
    return `${url.origin}/courses/${resolvedCourseId}`;
  }

  function isLikelyCanvasHost(hostname) {
    if (!hostname) {
      return false;
    }
    return CANVAS_HOST_SUFFIXES.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`));
  }

  function isSameCourseUrl(rawUrl, origin, courseId) {
    const resolved = safeUrl(rawUrl, origin);
    if (!resolved) {
      return false;
    }

    const url = new URL(resolved);
    return url.origin === origin && extractCourseId(resolved) === courseId;
  }

  function isInternalToOrigin(rawUrl, origin) {
    const resolved = safeUrl(rawUrl, origin);
    if (!resolved) {
      return false;
    }
    return new URL(resolved).origin === origin;
  }

  function isIgnoredCourseRoute(rawUrl, origin, courseId) {
    const resolved = safeUrl(rawUrl, origin);
    if (!resolved || !isSameCourseUrl(resolved, origin, courseId)) {
      return false;
    }

    const url = new URL(resolved);
    const ignoredFragments = [
      "/discussion_topics",
      "/quizzes",
      "/grades",
      "/people",
      "/settings",
      "/external_tools",
      "/users",
      "/announcements"
    ];
    return ignoredFragments.some((fragment) => url.pathname.includes(fragment));
  }

  function extractCanvasFileId(rawUrl, baseUrl) {
    const resolved = safeUrl(rawUrl, baseUrl);
    if (!resolved) {
      return null;
    }

    const url = new URL(resolved);
    const directMatch = url.pathname.match(/\/(?:courses\/\d+\/)?files\/(\d+)(?:\/|$)/);
    if (directMatch) {
      return directMatch[1];
    }

    const downloadMatch = url.pathname.match(/\/files\/(\d+)\/download(?:\/|$)?/);
    if (downloadMatch) {
      return downloadMatch[1];
    }

    const preview = url.searchParams.get("preview");
    if (preview && /^\d+$/.test(preview)) {
      return preview;
    }

    return null;
  }

  function buildCanvasDownloadUrl(rawUrl, courseId, origin) {
    const resolved = safeUrl(rawUrl, origin);
    if (!resolved) {
      return null;
    }

    const url = new URL(resolved);
    const fileId = extractCanvasFileId(url.toString());
    if (!fileId) {
      return url.toString();
    }

    if (url.pathname.startsWith(`/courses/${courseId}/files/`)) {
      return `${origin}/courses/${courseId}/files/${fileId}/download?download_frd=1`;
    }

    return `${origin}/files/${fileId}/download?download_frd=1`;
  }

  function decodeMaybe(value) {
    if (!value) {
      return "";
    }
    try {
      return decodeURIComponent(value);
    } catch (error) {
      return value;
    }
  }

  function extractFileNameFromUrl(rawUrl, baseUrl) {
    const resolved = safeUrl(rawUrl, baseUrl);
    if (!resolved) {
      return "";
    }

    const url = new URL(resolved);
    const explicitName = url.searchParams.get("filename");
    if (explicitName) {
      return decodeMaybe(explicitName).trim();
    }

    const segments = url.pathname.split("/").filter(Boolean);
    const last = decodeMaybe(segments[segments.length - 1] || "");
    if (!last) {
      return "";
    }

    if (/^\d+$/.test(last) || last === "download") {
      return "";
    }

    return last.trim();
  }

  function guessExtension(rawValue) {
    if (!rawValue) {
      return "";
    }

    const clean = rawValue.split("?")[0].split("#")[0].trim();
    const match = clean.match(/\.([a-z0-9]{1,8})$/i);
    return match ? match[1].toLowerCase() : "";
  }

  function isDocumentExtension(extension) {
    return DOCUMENT_EXTENSIONS.has((extension || "").toLowerCase());
  }

  function getMimeGuess(extension) {
    return MIME_BY_EXTENSION[(extension || "").toLowerCase()] || "";
  }

  function getExtensionCategory(extension) {
    return EXTENSION_CATEGORY_MAP[(extension || "").toLowerCase()] || "other";
  }

  function sanitizePathSegment(value, fallback) {
    const cleaned = (value || "")
      .replace(INVALID_FILENAME_CHARS, " ")
      .replace(WHITESPACE_RE, " ")
      .replace(TRAILING_DOTS_RE, "")
      .trim();

    const safe = cleaned || fallback || "untitled";
    return safe.slice(0, 96);
  }

  function buildDownloadPath(documentItem) {
    const coursePart = sanitizePathSegment(documentItem.courseName || `Course ${documentItem.courseId}`, "Canvas Course");
    const sectionPart = sanitizePathSegment(SECTION_LABELS[documentItem.sourceSection] || documentItem.sourceSection || "Other", "Other");
    const titlePart = sanitizePathSegment(documentItem.sourcePageTitle || "", "");
    const rawFileName =
      sanitizePathSegment(
        documentItem.fileName || documentItem.linkText || extractFileNameFromUrl(documentItem.url) || `document.${documentItem.inferredExtension || "bin"}`,
        `document.${documentItem.inferredExtension || "bin"}`
      );
    const fileName = ensureFilenameExtension(rawFileName, documentItem.inferredExtension);
    const baseSegments = ["Canvas Downloads", coursePart, sectionPart];
    if (titlePart) {
      baseSegments.push(titlePart);
    }
    baseSegments.push(fileName);
    return baseSegments.join("/");
  }

  function ensureFilenameExtension(fileName, extension) {
    if (!extension) {
      return fileName;
    }

    if (guessExtension(fileName) === extension.toLowerCase()) {
      return fileName;
    }
    return `${fileName}.${extension.toLowerCase()}`;
  }

  function getSectionPriority(section) {
    const index = SOURCE_SECTIONS.indexOf(section);
    return index === -1 ? SOURCE_SECTIONS.length + 1 : index;
  }

  globalThis.CanvasUrlUtils = {
    SECTION_LABELS,
    SOURCE_SECTIONS,
    DOCUMENT_EXTENSIONS,
    canonicalizeUrl,
    extractCanvasFileId,
    extractCourseId,
    extractFileNameFromUrl,
    buildCanvasDownloadUrl,
    buildCourseHomeUrl,
    buildDownloadPath,
    getCourseContext,
    getCanvasPageMode,
    getExtensionCategory,
    getMimeGuess,
    getSectionPriority,
    guessExtension,
    inferSectionFromUrl,
    isDashboardUrl,
    isCanvasCourseUrl,
    isDocumentExtension,
    isIgnoredCourseRoute,
    isInternalToOrigin,
    isLikelyCanvasHost,
    isSameCourseUrl,
    safeUrl,
    sanitizePathSegment
  };
})();
