(function () {
  if (globalThis.CanvasOffscreenExtractionInstalled) {
    return;
  }
  globalThis.CanvasOffscreenExtractionInstalled = true;

  const Normalize = globalThis.CanvasNormalizeContentUtils;
  const mammoth = globalThis.mammoth;
  let pdfjsModulePromise = null;

  if (!Normalize) {
    throw new Error("CanvasNormalizeContentUtils must load before offscreen extraction.");
  }

  function trimString(value) {
    return String(value || "").trim();
  }

  async function getPdfJs() {
    if (!pdfjsModulePromise) {
      pdfjsModulePromise = import(chrome.runtime.getURL("vendor/pdf.mjs"));
    }
    return pdfjsModulePromise;
  }

  function groupPdfLines(items) {
    const groups = [];
    for (const item of items || []) {
      const text = trimString(item?.str || "");
      if (!text) {
        continue;
      }

      const x = Number(item?.transform?.[4] || 0);
      const y = Number(item?.transform?.[5] || 0);
      const height = Number(item?.height || 0);
      const last = groups[groups.length - 1];

      if (last && Math.abs(last.y - y) <= 2.5) {
        last.items.push({ text, x });
        last.height = Math.max(last.height, height);
        continue;
      }

      groups.push({
        y,
        height,
        items: [{ text, x }]
      });
    }

    return groups.map((group) => ({
      y: group.y,
      height: group.height || 10,
      text: group.items
        .sort((left, right) => left.x - right.x)
        .map((item) => item.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
    }));
  }

  function buildPdfPageText(lines) {
    const paragraphs = [];
    let current = [];

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!line?.text) {
        continue;
      }

      const previous = lines[index - 1];
      const gap = previous ? Math.abs(previous.y - line.y) : 0;
      const paragraphBreak = previous ? gap > Math.max(previous.height, line.height, 10) * 1.6 : false;

      if (paragraphBreak && current.length) {
        paragraphs.push(current.join(" "));
        current = [line.text];
        continue;
      }

      current.push(line.text);
    }

    if (current.length) {
      paragraphs.push(current.join(" "));
    }

    return paragraphs.join("\n\n");
  }

  async function extractPdf(buffer, title) {
    const pdfjs = await getPdfJs();
    const loadingTask = pdfjs.getDocument({
      data: buffer,
      disableFontFace: true,
      isEvalSupported: false,
      useSystemFonts: true
    });
    const pdf = await loadingTask.promise;
    const pageTexts = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const lines = groupPdfLines(textContent?.items || []);
      const pageText = buildPdfPageText(lines);
      if (pageText) {
        pageTexts.push(pageText);
      }
    }

    return Normalize.normalizePlainTextContent(pageTexts.join("\n\n"), {
      title
    });
  }

  async function extractDocx(buffer, title) {
    if (!mammoth?.convertToHtml) {
      throw new Error("DOCX converter is unavailable in offscreen context.");
    }

    const result = await mammoth.convertToHtml({
      arrayBuffer: buffer
    });
    return Normalize.normalizeHtmlContent(result.value || "", {
      title,
      fallbackText: ""
    });
  }

  function extractHtml(html, fallbackText, title) {
    return Normalize.normalizeHtmlContent(html || "", {
      title,
      fallbackText: fallbackText || ""
    });
  }

  function extractPlainText(text, title) {
    return Normalize.normalizePlainTextContent(text || "", {
      title
    });
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
      if (message?.target !== "offscreen" || message?.type !== "OFFSCREEN_EXTRACT_CONTENT") {
        return;
      }

      const sourceCategory = trimString(message.sourceCategory);
      const title = trimString(message.title || message.fileName);
      let result;

      if (sourceCategory === "canvas_native_html" || sourceCategory === "html_file") {
        result = extractHtml(message.html || "", message.text || message.fallbackText || "", title);
      } else if (sourceCategory === "txt") {
        result = extractPlainText(message.text || "", title);
      } else if (sourceCategory === "docx") {
        result = await extractDocx(message.buffer, title);
      } else if (sourceCategory === "pdf") {
        result = await extractPdf(message.buffer, title);
      } else {
        throw new Error(`Unsupported offscreen extraction category: ${sourceCategory}`);
      }

      sendResponse({
        ok: true,
        result
      });
    })().catch((error) => {
      sendResponse({
        ok: false,
        error: error?.message || String(error)
      });
    });

    return true;
  });
})();
