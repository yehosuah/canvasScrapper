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
      sourceSection: options.sourceSection || metadata.section || "home"
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
    if (!contentType.includes("text/html")) {
      return {
        ok: true,
        pageUrl: response.url || request.url,
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

    const html = await response.text();
    const parsed = new DOMParser().parseFromString(html, "text/html");
    return scanDocument(parsed, response.url || request.url, request);
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
