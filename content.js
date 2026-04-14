(function () {
  if (globalThis.CanvasCourseContentScriptInstalled) {
    return;
  }
  globalThis.CanvasCourseContentScriptInstalled = true;

  const UrlUtils = globalThis.CanvasUrlUtils;
  const ExtractUtils = globalThis.CanvasExtractUtils;

  if (!UrlUtils || !ExtractUtils) {
    throw new Error("Canvas content script dependencies did not load.");
  }

  function createEmptyScanResult(request, pageUrl) {
    return {
      ok: true,
      pageUrl: pageUrl || request.url,
      course: {
        origin: request.origin,
        courseId: request.courseId,
        courseName: request.courseName,
        isCanvasCourse: true
      },
      pageTitle: "",
      documents: [],
      contentItems: [],
      followUrls: [],
      paginationUrls: [],
      stats: {
        downloadableCount: 0,
        externalCount: 0,
        ignoredCount: 0
      }
    };
  }

  function scanDocument(doc, pageUrl, options) {
    const metadata = ExtractUtils.extractCourseMetadata(doc, pageUrl);
    if (!metadata.isCanvasCourse) {
      return {
        ok: false,
        error: "Not a Canvas course page."
      };
    }

    const context = {
      origin: metadata.origin,
      courseId: metadata.courseId,
      courseName: options.courseName || metadata.courseName,
      pageUrl,
      sourceSection: metadata.section === "files" ? "files" : options.sourceSection || metadata.section || "home"
    };
    const artifacts = ExtractUtils.extractPageArtifacts(doc, context);

    return {
      ok: true,
      pageUrl,
      course: {
        ...metadata,
        courseName: context.courseName || metadata.courseName
      },
      pageTitle: artifacts.pageTitle,
      documents: artifacts.documents,
      contentItems: artifacts.contentItems,
      followUrls: artifacts.followUrls,
      paginationUrls: artifacts.paginationUrls,
      stats: artifacts.stats
    };
  }

  async function fetchAndScanUrl(request) {
    const response = await fetch(request.url, {
      credentials: "include",
      redirect: "follow"
    });

    if (!response.ok) {
      throw new Error(`Request failed with ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type") || "";
    const resolvedUrl = response.url || request.url;
    if (!contentType.includes("text/html")) {
      return createEmptyScanResult(request, resolvedUrl);
    }

    const html = await response.text();
    if (request.sourceSection !== "files" && UrlUtils.isCanvasFilePreviewUrl(resolvedUrl, request.origin)) {
      return createEmptyScanResult(request, resolvedUrl);
    }
    if (request.sourceSection !== "files" && UrlUtils.looksLikeJavascriptGateText(html)) {
      return createEmptyScanResult(request, resolvedUrl);
    }
    const parsed = new DOMParser().parseFromString(html, "text/html");
    return scanDocument(parsed, resolvedUrl, request);
  }

  async function fetchResourceForExtraction(request) {
    const response = await fetch(request.url, {
      credentials: request.credentials || "include",
      redirect: "follow"
    });

    if (!response.ok) {
      throw new Error(`Request failed with ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type") || "";
    const result = {
      ok: true,
      url: response.url || request.url,
      contentType,
      status: response.status
    };

    if (request.mode === "fetch_binary") {
      if (/text\/html|application\/xhtml\+xml/i.test(contentType)) {
        result.text = await response.text();
        return result;
      }
      result.buffer = await response.arrayBuffer();
      return result;
    }

    result.text = await response.text();
    return result;
  }

  function detectCourse() {
    const pageContext = ExtractUtils.detectCanvasPageContext(document, location.href);
    const metadata = pageContext.pageMode === "single_course" ? pageContext.course : null;
    return {
      ok: Boolean(metadata?.isCanvasCourse),
      course: metadata,
      pageTitle: pageContext.pageTitle
    };
  }

  function detectPageContext() {
    const pageContext = ExtractUtils.detectCanvasPageContext(document, location.href);
    return {
      ok: true,
      pageMode: pageContext.pageMode,
      pageTitle: pageContext.pageTitle,
      course: pageContext.course,
      courses: pageContext.courses
    };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
      if (!message || !message.type) {
        sendResponse({ ok: false, error: "Missing message type." });
        return;
      }

      if (message.type === "PING") {
        sendResponse({ ok: true, pong: true });
        return;
      }

      if (message.type === "DETECT_COURSE") {
        sendResponse(detectCourse());
        return;
      }

      if (message.type === "DETECT_PAGE_CONTEXT") {
        sendResponse(detectPageContext());
        return;
      }

      if (message.type === "SCRAPE_CURRENT_PAGE") {
        sendResponse(
          scanDocument(document, location.href, {
            sourceSection: message.sourceSection,
            courseName: message.courseName
          })
        );
        return;
      }

      if (message.type === "FETCH_AND_SCRAPE") {
        sendResponse(await fetchAndScanUrl(message));
        return;
      }

      if (message.type === "FETCH_RESOURCE_FOR_EXTRACTION") {
        sendResponse(await fetchResourceForExtraction(message));
        return;
      }

      sendResponse({ ok: false, error: `Unsupported message type: ${message.type}` });
    })().catch((error) => {
      sendResponse({
        ok: false,
        error: error?.message || String(error)
      });
    });

    return true;
  });
})();
