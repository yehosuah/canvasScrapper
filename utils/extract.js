(function () {
  if (globalThis.CanvasExtractUtils) {
    return;
  }

  const UrlUtils = globalThis.CanvasUrlUtils;
  if (!UrlUtils) {
    throw new Error("CanvasUrlUtils must be loaded before CanvasExtractUtils.");
  }

  const COURSE_NAME_SELECTORS = [
    "[data-course-name]",
    ".course-title",
    "#course_show_secondary h1",
    ".ic-app-nav-toggle-and-crumbs h1",
    ".page-header h1",
    ".ellipsible",
    "#breadcrumbs li:last-child"
  ];
  const PAGE_TITLE_SELECTORS = [
    "h1.page-title",
    ".header-bar h1",
    ".page-header h1",
    "main h1",
    "h1"
  ];
  const FILE_ROW_HINT_SELECTORS = [
    ".ef-item-row",
    ".files-folder",
    ".ic-Table-row",
    "[data-testid='file-row']",
    "tr"
  ];
  const DASHBOARD_COURSE_LINK_SELECTORS = [
    "a.ic-DashboardCard__link[href*='/courses/']",
    ".ic-DashboardCard a[href*='/courses/']",
    "[data-testid='dashboard-course-card'] a[href*='/courses/']",
    "#DashboardCard_Container a[href*='/courses/']",
    "#all_courses_table a[href*='/courses/']",
    ".course-list-table-row a[href*='/courses/']",
    "a[href*='/courses/']"
  ];
  const DASHBOARD_CONTAINER_SELECTORS = [
    ".ic-DashboardCard",
    ".course-list-table-row",
    "[data-testid='dashboard-course-card']",
    "tr",
    "li",
    ".item"
  ];
  const DASHBOARD_TITLE_SELECTORS = [
    "[data-course-name]",
    ".ic-DashboardCard__header-title",
    ".course-list-course-title",
    ".name",
    "strong",
    "h1",
    "h2",
    "h3"
  ];
  const DASHBOARD_TERM_SELECTORS = [
    "[data-term]",
    ".course-list-term",
    ".term",
    ".ic-DashboardCard__header-subtitle",
    ".course-term",
    "[data-testid='course-term']"
  ];
  const DASHBOARD_BAD_NAME_HINTS = new Set([
    "grades",
    "modules",
    "files",
    "pages",
    "assignments",
    "home",
    "syllabus",
    "announcements",
    "more options"
  ]);
  const CONTENT_ROOT_SELECTORS = {
    pages: [
      ".show-content",
      ".page-body",
      "#wiki_page_show .user_content",
      ".user_content",
      "main .content-box"
    ],
    assignments: [
      ".assignment-description .user_content",
      ".assignment-description",
      "#assignment_show .user_content",
      ".description.user_content",
      ".user_content"
    ],
    syllabus: [
      "#syllabus .user_content",
      "#syllabus_body",
      ".syllabus .user_content",
      ".user_content",
      "#syllabus"
    ],
    home: [
      "#course_show_primary .user_content",
      "#content .show-content",
      ".show-content",
      ".user_content",
      "main .content-box"
    ],
    modules: [
      "#context_modules",
      ".context_modules",
      ".context_module",
      "#modules"
    ]
  };
  const CONTENT_PRUNE_SELECTORS = [
    "script",
    "style",
    "noscript",
    "form",
    "button",
    "input",
    "select",
    "textarea",
    "iframe",
    "svg",
    "canvas",
    "nav",
    "header",
    "footer",
    ".ic-app-nav-toggle-and-crumbs",
    ".header-bar",
    ".page-toolbar",
    ".page-action-list",
    ".edit-content",
    ".al-trigger-container",
    ".ui-dialog",
    ".screenreader-only",
    ".sr-only",
    "[aria-hidden='true']"
  ];
  const BLOCK_LIKE_TAGS = new Set([
    "ADDRESS",
    "ARTICLE",
    "ASIDE",
    "BLOCKQUOTE",
    "DD",
    "DIV",
    "DL",
    "DT",
    "FIELDSET",
    "FIGCAPTION",
    "FIGURE",
    "FOOTER",
    "FORM",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "HEADER",
    "HR",
    "LI",
    "MAIN",
    "NAV",
    "OL",
    "P",
    "PRE",
    "SECTION",
    "TABLE",
    "TD",
    "TH",
    "TR",
    "UL"
  ]);
  const USEFUL_EXTERNAL_HOST_BLACKLIST = new Set([
    "facebook.com",
    "twitter.com",
    "x.com",
    "linkedin.com",
    "instagram.com"
  ]);

  function textContent(node) {
    return (node?.textContent || "").replace(/\s+/g, " ").trim();
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

  function firstText(doc, selectors) {
    for (const selector of selectors) {
      const element = doc.querySelector(selector);
      const value = textContent(element) || element?.getAttribute?.("data-course-name") || "";
      if (value) {
        return value;
      }
    }
    return "";
  }

  function firstTextWithin(root, selectors) {
    if (!root) {
      return "";
    }

    for (const selector of selectors) {
      const element = root.querySelector(selector);
      const value = textContent(element) || element?.getAttribute?.("data-course-name") || element?.getAttribute?.("data-term") || "";
      if (value) {
        return value;
      }
    }

    return "";
  }

  function normalizeCourseName(value) {
    const normalized = String(value || "").replace(/\s+/g, " ").trim();
    if (!normalized) {
      return "";
    }
    if (DASHBOARD_BAD_NAME_HINTS.has(normalized.toLowerCase())) {
      return "";
    }
    return normalized;
  }

  function extractDashboardCourseName(anchor, container) {
    return (
      normalizeCourseName(firstTextWithin(container, DASHBOARD_TITLE_SELECTORS)) ||
      normalizeCourseName(anchor?.getAttribute?.("aria-label")) ||
      normalizeCourseName(anchor?.getAttribute?.("title")) ||
      normalizeCourseName(textContent(anchor))
    );
  }

  function extractDashboardTerm(container) {
    const explicitTerm = firstTextWithin(container, DASHBOARD_TERM_SELECTORS);
    if (explicitTerm) {
      return explicitTerm;
    }

    const nearbyBits = Array.from(container?.querySelectorAll?.("td, span, div, p") || [])
      .map((node) => textContent(node))
      .filter(Boolean);
    return nearbyBits.find((value) => /\b(term|semester|quarter|fall|spring|summer|winter)\b/i.test(value)) || "";
  }

  function mergeDashboardCourse(existingCourse, incomingCourse) {
    return {
      ...existingCourse,
      courseName: incomingCourse.courseName.length > (existingCourse.courseName || "").length ? incomingCourse.courseName : existingCourse.courseName,
      term: existingCourse.term || incomingCourse.term || undefined
    };
  }

  // Dashboard discovery stays DOM-first because Canvas dashboard and all-courses pages
  // use different markup families, but they all surface course links we can normalize.
  function extractDashboardCourses(doc, pageUrl) {
    const coursesByKey = new Map();
    const anchors = Array.from(doc.querySelectorAll(DASHBOARD_COURSE_LINK_SELECTORS.join(",")));

    for (const anchor of anchors) {
      const absoluteUrl = UrlUtils.safeUrl(anchor.getAttribute("href"), pageUrl);
      const courseId = UrlUtils.extractCourseId(absoluteUrl);
      if (!absoluteUrl || !courseId) {
        continue;
      }

      const courseUrl = UrlUtils.buildCourseHomeUrl(absoluteUrl, courseId, pageUrl);
      if (!courseUrl) {
        continue;
      }

      const container = anchor.closest(DASHBOARD_CONTAINER_SELECTORS.join(",")) || anchor.parentElement || doc.body;
      const courseName = extractDashboardCourseName(anchor, container);
      if (!courseName) {
        continue;
      }

      const term = extractDashboardTerm(container) || undefined;
      const key = `${new URL(courseUrl).origin}:${courseId}`;
      const nextCourse = {
        courseId,
        courseName,
        courseUrl,
        term
      };

      if (!coursesByKey.has(key)) {
        coursesByKey.set(key, nextCourse);
        continue;
      }

      coursesByKey.set(key, mergeDashboardCourse(coursesByKey.get(key), nextCourse));
    }

    return Array.from(coursesByKey.values()).sort((left, right) => left.courseName.localeCompare(right.courseName));
  }

  function detectCanvasPageContext(doc, pageUrl) {
    const pageModeFromUrl = UrlUtils.getCanvasPageMode(pageUrl);
    const pageTitle = extractPageTitle(doc);

    if (pageModeFromUrl === "single_course") {
      return {
        pageMode: "single_course",
        pageTitle,
        course: extractCourseMetadata(doc, pageUrl),
        courses: []
      };
    }

    const courses = extractDashboardCourses(doc, pageUrl);
    if (pageModeFromUrl === "dashboard" || courses.length) {
      return {
        pageMode: "dashboard",
        pageTitle,
        course: null,
        courses
      };
    }

    return {
      pageMode: "unsupported",
      pageTitle,
      course: null,
      courses: []
    };
  }

  function extractCourseMetadata(doc, pageUrl) {
    const context = UrlUtils.getCourseContext(pageUrl);
    if (!context) {
      return {
        isCanvasCourse: false,
        navSections: {}
      };
    }

    const courseName = firstText(doc, COURSE_NAME_SELECTORS);
    const navSections = extractCourseNavLinks(doc, context.origin, context.courseId);

    return {
      isCanvasCourse: true,
      origin: context.origin,
      courseId: context.courseId,
      courseName: courseName || undefined,
      section: context.section || undefined,
      navSections
    };
  }

  function extractCourseNavLinks(doc, origin, courseId) {
    const navSections = {};
    const anchors = Array.from(doc.querySelectorAll("a[href]"));

    for (const anchor of anchors) {
      const rawHref = anchor.getAttribute("href");
      const href = UrlUtils.safeUrl(rawHref, origin);
      if (!href || !UrlUtils.isSameCourseUrl(href, origin, courseId)) {
        continue;
      }

      const label = textContent(anchor).toLowerCase();
      let section = UrlUtils.inferSectionFromUrl(href, courseId);

      if (!section) {
        if (label === "modules" || label === "module") {
          section = "modules";
        } else if (label === "assignments" || label === "assignment") {
          section = "assignments";
        } else if (label === "pages" || label === "page") {
          section = "pages";
        } else if (label === "files" || label === "file") {
          section = "files";
        } else if (label === "syllabus") {
          section = "syllabus";
        } else if (label === "home") {
          section = "home";
        }
      }

      if (!section || navSections[section]) {
        continue;
      }

      navSections[section] = href;
    }

    if (!navSections.home) {
      navSections.home = `${origin}/courses/${courseId}`;
    }

    return navSections;
  }

  function extractPageTitle(doc) {
    return firstText(doc, PAGE_TITLE_SELECTORS) || (doc.title || "").replace(/\s+\|\s+.+$/, "").trim();
  }

  function getContentTypeForSection(section) {
    if (section === "assignments") {
      return "assignment";
    }
    if (section === "syllabus") {
      return "syllabus";
    }
    if (section === "modules") {
      return "module_resource";
    }
    return "canvas_page";
  }

  function findContentRoot(doc, section) {
    const selectors = CONTENT_ROOT_SELECTORS[section] || [];
    for (const selector of selectors) {
      const element = doc.querySelector(selector);
      if (element && textContent(element)) {
        return element;
      }
    }

    const fallbackCandidates = [
      "main",
      "#content",
      ".ic-Layout-contentMain",
      ".content-box",
      ".user_content"
    ];
    for (const selector of fallbackCandidates) {
      const element = doc.querySelector(selector);
      if (element && textContent(element)) {
        return element;
      }
    }

    return doc.body || null;
  }

  function pruneContentRoot(root) {
    if (!root) {
      return root;
    }

    const clone = root.cloneNode(true);
    clone.querySelectorAll(CONTENT_PRUNE_SELECTORS.join(",")).forEach((node) => node.remove());
    clone.querySelectorAll("[hidden]").forEach((node) => node.remove());
    return clone;
  }

  function collapseWhitespace(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }

  function sanitizePageTitle(value, fallback) {
    const normalized = collapseWhitespace(value);
    if (!normalized || UrlUtils.looksLikeJavascriptGateText(normalized)) {
      return collapseWhitespace(fallback);
    }
    return normalized;
  }

  function collectReadableLines(node, lines) {
    if (!node) {
      return;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      const value = collapseWhitespace(node.textContent);
      if (value) {
        lines.push(value);
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const tagName = node.tagName || "";
    if (tagName === "BR") {
      lines.push("\n");
      return;
    }

    if (tagName === "A") {
      const label = collapseWhitespace(node.textContent);
      const href = node.getAttribute("href");
      if (label && href) {
        lines.push(`${label} (${href})`);
      } else if (label) {
        lines.push(label);
      }
      return;
    }

    if (tagName === "IMG") {
      const alt = collapseWhitespace(node.getAttribute("alt"));
      if (alt) {
        lines.push(`[Image: ${alt}]`);
      }
      return;
    }

    const beforeLength = lines.length;
    Array.from(node.childNodes || []).forEach((childNode) => collectReadableLines(childNode, lines));

    if (BLOCK_LIKE_TAGS.has(tagName) && lines.length && lines[lines.length - 1] !== "\n") {
      lines.push("\n");
    } else if (beforeLength !== lines.length && tagName === "LI") {
      lines.splice(beforeLength, 0, "• ");
    }
  }

  function contentNodeToText(root) {
    const lines = [];
    collectReadableLines(root, lines);
    return collapseWhitespace(
      lines
        .join(" ")
        .replace(/• \s+/g, "• ")
        .replace(/\s*\n\s*/g, "\n")
    );
  }

  function normalizeContentHtml(root) {
    return collapseWhitespace((root?.innerHTML || "").replace(/>\s+</g, "><"));
  }

  function inferDueDate(doc) {
    const candidates = Array.from(
      doc.querySelectorAll("time[datetime], .assignment-date-due time[datetime], .due time[datetime], .due_at time[datetime]")
    );
    for (const candidate of candidates) {
      const value = (candidate.getAttribute("datetime") || "").trim();
      if (value) {
        return value;
      }
    }
    return null;
  }

  function inferWeekOrModuleLabel(doc, section) {
    if (section !== "modules") {
      return "";
    }

    const selectors = [
      ".context_module .ig-header-title",
      ".context_module h2",
      "#context_modules .header-bar",
      "#context_modules h2"
    ];
    for (const selector of selectors) {
      const value = firstText(doc, [selector]);
      if (value) {
        return value;
      }
    }
    return "";
  }

  function createPageContentItem(doc, context) {
    if (!["pages", "assignments", "syllabus", "home", "modules"].includes(context.sourceSection)) {
      return null;
    }

    const pageTitle = sanitizePageTitle(extractPageTitle(doc));
    const root = pruneContentRoot(findContentRoot(doc, context.sourceSection));
    const bodyText = contentNodeToText(root);
    const bodyHtml = normalizeContentHtml(root);
    if (UrlUtils.looksLikeJavascriptGateText(bodyText) && UrlUtils.isCanvasFilePreviewUrl(context.pageUrl, context.origin)) {
      return null;
    }
    if (!bodyText && !bodyHtml) {
      return null;
    }

    const canonicalPageUrl = UrlUtils.canonicalizeUrl(context.pageUrl);
    const baseId = `${context.courseId}:${context.sourceSection}:${canonicalPageUrl || pageTitle}`;
    return {
      id: `content:${stableHash(baseId)}`,
      contentType: getContentTypeForSection(context.sourceSection),
      courseId: context.courseId,
      courseName: context.courseName || "",
      sourceSection: context.sourceSection,
      sourcePageTitle: pageTitle || undefined,
      sourcePageUrl: context.pageUrl,
      sourceCanvasUrl: context.pageUrl,
      bodyHtml,
      bodyText,
      excerpt: bodyText.slice(0, 320),
      contentHash: stableHash(`${bodyHtml}|${bodyText}`),
      weekOrModule: inferWeekOrModuleLabel(doc, context.sourceSection) || undefined,
      dueDate: context.sourceSection === "assignments" ? inferDueDate(doc) : null,
      discoveredAt: new Date().toISOString(),
      isExternal: false
    };
  }

  function isUsefulExternalResource(absoluteUrl, context, label) {
    if (!absoluteUrl || !/^https?:/i.test(absoluteUrl)) {
      return false;
    }
    if (UrlUtils.isInternalToOrigin(absoluteUrl, context.origin)) {
      return false;
    }

    const url = new URL(absoluteUrl);
    const hostname = url.hostname.replace(/^www\./i, "").toLowerCase();
    if (USEFUL_EXTERNAL_HOST_BLACKLIST.has(hostname)) {
      return false;
    }

    if (UrlUtils.isDocumentExtension(UrlUtils.guessExtension(absoluteUrl))) {
      return false;
    }

    const normalizedLabel = collapseWhitespace(label);
    return normalizedLabel.length >= 3;
  }

  function extractExternalResources(doc, context, pageTitle) {
    const resources = [];
    const seen = new Set();
    const anchors = Array.from(doc.querySelectorAll("a[href]"));

    for (const anchor of anchors) {
      const absoluteUrl = UrlUtils.safeUrl(anchor.getAttribute("href"), context.pageUrl || context.origin);
      const label = textContent(anchor);
      if (!isUsefulExternalResource(absoluteUrl, context, label)) {
        continue;
      }

      const canonicalUrl = UrlUtils.canonicalizeUrl(absoluteUrl);
      if (!canonicalUrl || seen.has(canonicalUrl)) {
        continue;
      }
      seen.add(canonicalUrl);

      resources.push({
        id: `external:${stableHash(`${context.courseId}:${context.pageUrl}:${canonicalUrl}`)}`,
        contentType: "external_resource",
        courseId: context.courseId,
        courseName: context.courseName || "",
        sourceSection: context.sourceSection,
        sourcePageTitle: pageTitle || undefined,
        sourcePageUrl: context.pageUrl,
        sourceCanvasUrl: absoluteUrl,
        externalUrl: absoluteUrl,
        title: label,
        discoveredAt: new Date().toISOString(),
        isExternal: true
      });
    }

    return resources;
  }

  function classifyLink(rawHref, linkText, context) {
    const absoluteUrl = UrlUtils.safeUrl(rawHref, context.pageUrl || context.origin);
    if (!absoluteUrl) {
      return null;
    }

    const canonicalUrl = UrlUtils.canonicalizeUrl(absoluteUrl);
    const url = new URL(absoluteUrl);
    const linkLabel = (linkText || "").trim();
    const fileNameCandidate = findFilenameCandidates(linkLabel, absoluteUrl);
    const inferredExtension = UrlUtils.guessExtension(fileNameCandidate || absoluteUrl);
    const canvasFileId = UrlUtils.extractCanvasFileId(absoluteUrl);
    const sameOrigin = url.origin === context.origin;
    const sameCourse = UrlUtils.isSameCourseUrl(absoluteUrl, context.origin, context.courseId);
    const isCanvasHosted = sameOrigin && Boolean(canvasFileId || url.pathname.includes(`/courses/${context.courseId}/files`));
    const hasDocumentExtension = UrlUtils.isDocumentExtension(inferredExtension);
    const isIgnoredInternal = sameCourse && !isCanvasHosted && !hasDocumentExtension && UrlUtils.isIgnoredCourseRoute(absoluteUrl, context.origin, context.courseId);

    if (isIgnoredInternal) {
      return {
        classification: "ignored",
        canonicalUrl,
        absoluteUrl
      };
    }

    if (isCanvasHosted) {
      const downloadUrl = UrlUtils.buildCanvasDownloadUrl(absoluteUrl, context.courseId, context.origin);
      return {
        classification: "canvas",
        absoluteUrl: downloadUrl || absoluteUrl,
        canonicalUrl: UrlUtils.canonicalizeUrl(downloadUrl || absoluteUrl),
        canvasFileId,
        fileName: UrlUtils.extractFileNameFromUrl(absoluteUrl) || fileNameCandidate,
        inferredExtension: inferredExtension || UrlUtils.guessExtension(UrlUtils.extractFileNameFromUrl(absoluteUrl)),
        isCanvasHosted: true,
        isDownloadable: true,
        isExternal: false,
        mimeGuess: UrlUtils.getMimeGuess(inferredExtension)
      };
    }

    if (!sameOrigin && hasDocumentExtension) {
      return {
        classification: "external",
        absoluteUrl,
        canonicalUrl,
        fileName: UrlUtils.extractFileNameFromUrl(absoluteUrl) || fileNameCandidate,
        inferredExtension,
        isCanvasHosted: false,
        isDownloadable: true,
        isExternal: true,
        mimeGuess: UrlUtils.getMimeGuess(inferredExtension)
      };
    }

    if (sameOrigin && hasDocumentExtension) {
      return {
        classification: "direct-document",
        absoluteUrl,
        canonicalUrl,
        fileName: UrlUtils.extractFileNameFromUrl(absoluteUrl) || fileNameCandidate,
        inferredExtension,
        isCanvasHosted: false,
        isDownloadable: true,
        isExternal: false,
        mimeGuess: UrlUtils.getMimeGuess(inferredExtension)
      };
    }

    return {
      classification: "ignored",
      canonicalUrl,
      absoluteUrl
    };
  }

  function findFilenameCandidates(linkText, href) {
    const textExtension = UrlUtils.guessExtension(linkText);
    if (textExtension) {
      return linkText.trim();
    }

    const hrefName = UrlUtils.extractFileNameFromUrl(href);
    if (hrefName) {
      return hrefName;
    }

    return linkText.trim();
  }

  function extractFolderHint(anchor, doc, sourceSection) {
    if (sourceSection !== "files") {
      return undefined;
    }

    const row = anchor.closest(FILE_ROW_HINT_SELECTORS.join(","));
    const rowText = textContent(row);
    if (!rowText) {
      return undefined;
    }

    const breadcrumbs = Array.from(doc.querySelectorAll(".breadcrumbs a, .ef-folder-content__path a"))
      .map((node) => textContent(node))
      .filter(Boolean);

    if (breadcrumbs.length > 1) {
      return breadcrumbs.slice(1).join("/");
    }

    const folderMatch = rowText.match(/Folder:\s*(.+)$/i);
    return folderMatch ? folderMatch[1].trim() : undefined;
  }

  function createDiscoveredDocument(anchor, classification, context, pageTitle, doc) {
    const linkText = textContent(anchor);
    const finalFileName =
      classification.fileName ||
      anchor.getAttribute("download") ||
      anchor.getAttribute("title") ||
      linkText ||
      UrlUtils.extractFileNameFromUrl(classification.absoluteUrl);
    const inferredExtension =
      classification.inferredExtension ||
      UrlUtils.guessExtension(finalFileName) ||
      UrlUtils.guessExtension(classification.absoluteUrl);

    return {
      id: "",
      courseId: context.courseId,
      courseName: context.courseName || undefined,
      sourceSection: context.sourceSection,
      sourcePageTitle: sanitizePageTitle(pageTitle, finalFileName || linkText) || undefined,
      sourcePageUrl: context.pageUrl,
      linkText: linkText || undefined,
      fileName: finalFileName || undefined,
      inferredExtension: inferredExtension || undefined,
      url: classification.absoluteUrl,
      canonicalUrl: classification.canonicalUrl,
      canvasFileId: classification.canvasFileId || undefined,
      isCanvasHosted: Boolean(classification.isCanvasHosted),
      isDownloadable: Boolean(classification.isDownloadable),
      isExternal: Boolean(classification.isExternal),
      mimeGuess: classification.mimeGuess || UrlUtils.getMimeGuess(inferredExtension) || undefined,
      folderHint: extractFolderHint(anchor, doc, context.sourceSection)
    };
  }

  function extractDocumentCandidates(doc, context) {
    const pageTitle = extractPageTitle(doc);
    const documents = [];
    const seen = new Set();
    const stats = {
      downloadableCount: 0,
      externalCount: 0,
      ignoredCount: 0
    };

    const anchors = Array.from(doc.querySelectorAll("a[href]"));
    for (const anchor of anchors) {
      const href = anchor.getAttribute("href");
      const classification = classifyLink(href, textContent(anchor), context);
      if (!classification) {
        continue;
      }

      if (classification.classification === "ignored") {
        stats.ignoredCount += 1;
        continue;
      }

      const dedupeKey = classification.canonicalUrl || classification.absoluteUrl;
      if (dedupeKey && seen.has(dedupeKey)) {
        continue;
      }
      if (dedupeKey) {
        seen.add(dedupeKey);
      }

      const documentItem = createDiscoveredDocument(anchor, classification, context, pageTitle, doc);
      documents.push(documentItem);
      stats.downloadableCount += 1;
      if (documentItem.isExternal) {
        stats.externalCount += 1;
      }
    }

    return { documents, pageTitle, stats };
  }

  function shouldFollowLink(absoluteUrl, context, pageMode) {
    if (!UrlUtils.isSameCourseUrl(absoluteUrl, context.origin, context.courseId)) {
      return false;
    }
    if (UrlUtils.isIgnoredCourseRoute(absoluteUrl, context.origin, context.courseId)) {
      return false;
    }

    const section = UrlUtils.inferSectionFromUrl(absoluteUrl, context.courseId);
    if (!section) {
      return false;
    }

    if (pageMode === "modules") {
      return ["pages", "assignments"].includes(section) || absoluteUrl.includes("/modules/items/");
    }
    if (pageMode === "pages") {
      return section === "pages" && !absoluteUrl.endsWith(`/courses/${context.courseId}/pages`);
    }
    if (pageMode === "assignments") {
      return section === "assignments" && !absoluteUrl.endsWith(`/courses/${context.courseId}/assignments`);
    }
    if (pageMode === "home" || pageMode === "syllabus") {
      return ["pages", "assignments"].includes(section);
    }

    return false;
  }

  function extractFollowUrls(doc, context) {
    const followUrls = [];
    const paginationUrls = [];
    const seenFollow = new Set();
    const seenPagination = new Set();
    const anchors = Array.from(doc.querySelectorAll("a[href]"));

    for (const anchor of anchors) {
      const rawHref = anchor.getAttribute("href");
      const absoluteUrl = UrlUtils.safeUrl(rawHref, context.pageUrl || context.origin);
      if (!absoluteUrl) {
        continue;
      }

      const canonicalUrl = UrlUtils.canonicalizeUrl(absoluteUrl);
      const label = textContent(anchor).toLowerCase();
      const rel = (anchor.getAttribute("rel") || "").toLowerCase();
      const className = (anchor.className || "").toString().toLowerCase();

      if ((rel.includes("next") || label === "next" || className.includes("next")) && UrlUtils.isSameCourseUrl(absoluteUrl, context.origin, context.courseId)) {
        if (!seenPagination.has(canonicalUrl)) {
          seenPagination.add(canonicalUrl);
          paginationUrls.push(absoluteUrl);
        }
      }

      if (!shouldFollowLink(absoluteUrl, context, context.sourceSection)) {
        continue;
      }

      if (!seenFollow.has(canonicalUrl)) {
        seenFollow.add(canonicalUrl);
        followUrls.push(absoluteUrl);
      }
    }

    return { followUrls, paginationUrls };
  }

  function extractPageArtifacts(doc, context) {
    const metadata = extractDocumentCandidates(doc, context);
    const follow = extractFollowUrls(doc, context);
    const contentItem = createPageContentItem(doc, context);
    const contentItems = [...(contentItem ? [contentItem] : []), ...extractExternalResources(doc, context, metadata.pageTitle)];
    return {
      pageTitle: metadata.pageTitle,
      documents: metadata.documents,
      contentItems,
      followUrls: follow.followUrls,
      paginationUrls: follow.paginationUrls,
      stats: metadata.stats
    };
  }

  globalThis.CanvasExtractUtils = {
    classifyLink,
    detectCanvasPageContext,
    extractDashboardCourses,
    extractCourseMetadata,
    extractCourseNavLinks,
    extractDocumentCandidates,
    extractPageArtifacts,
    extractPageTitle
  };
})();
