(function () {
  if (globalThis.CanvasNormalizeContentUtils) {
    return;
  }

  const NOISE_SELECTORS = [
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
    ".screenreader-only",
    ".sr-only",
    "[aria-hidden='true']"
  ];
  const BLOCKISH_TAGS = new Set([
    "article",
    "aside",
    "blockquote",
    "div",
    "figure",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "li",
    "main",
    "ol",
    "p",
    "pre",
    "section",
    "table",
    "ul"
  ]);

  function trimString(value) {
    return String(value || "").trim();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function collapseInlineWhitespace(value) {
    return trimString(String(value || "").replace(/\s+/g, " "));
  }

  function normalizeLineEndings(value) {
    return String(value || "").replace(/\r\n?/g, "\n");
  }

  function normalizePlainTextValue(value) {
    return normalizeLineEndings(value)
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function countWords(text) {
    const matches = normalizePlainTextValue(text).match(/\S+/g);
    return matches ? matches.length : 0;
  }

  function splitParagraphs(text) {
    return normalizePlainTextValue(text)
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.split("\n").map(collapseInlineWhitespace).filter(Boolean).join(" "))
      .filter(Boolean);
  }

  function createHeadingBlock(text, level) {
    return {
      type: "heading",
      level: Math.max(1, Math.min(6, Number(level) || 1)),
      text: collapseInlineWhitespace(text)
    };
  }

  function createTextBlock(type, text, extra) {
    return {
      type,
      text: collapseInlineWhitespace(text),
      ...(extra || {})
    };
  }

  function serializeBlockToHtml(block) {
    if (!block?.text) {
      return "";
    }

    if (block.type === "heading") {
      return `<h${block.level}>${escapeHtml(block.text)}</h${block.level}>`;
    }
    if (block.type === "list_item") {
      const tag = block.listType === "numbered" ? "ol" : "ul";
      return `<${tag}><li>${escapeHtml(block.text)}</li></${tag}>`;
    }
    if (block.type === "quote") {
      return `<blockquote>${escapeHtml(block.text)}</blockquote>`;
    }
    if (block.type === "code") {
      return `<pre>${escapeHtml(block.text)}</pre>`;
    }
    return `<p>${escapeHtml(block.text)}</p>`;
  }

  function serializeBlocksToHtml(blocks) {
    return (blocks || []).map(serializeBlockToHtml).filter(Boolean).join("");
  }

  function serializeBlocksToText(blocks) {
    return normalizePlainTextValue(
      (blocks || [])
        .map((block) => {
          if (!block?.text) {
            return "";
          }
          if (block.type === "heading") {
            return block.text;
          }
          if (block.type === "list_item") {
            return `${block.listType === "numbered" ? "1." : "•"} ${block.text}`;
          }
          return block.text;
        })
        .filter(Boolean)
        .join("\n\n")
    );
  }

  function buildResult(blocks, options) {
    const filteredBlocks = (blocks || []).filter((block) => trimString(block?.text));
    const extractedHtml = serializeBlocksToHtml(filteredBlocks);
    const extractedText = serializeBlocksToText(filteredBlocks);
    const headings = filteredBlocks.filter((block) => block.type === "heading").map((block) => block.text);
    return {
      extractedText,
      extractedHtml,
      headingCount: headings.length,
      headings,
      paragraphCount: filteredBlocks.filter((block) => block.type === "paragraph").length,
      charCount: extractedText.length,
      wordCount: countWords(extractedText),
      semanticBlocks: filteredBlocks,
      extractedAt: trimString(options?.extractedAt) || new Date().toISOString()
    };
  }

  function appendParagraphFallback(node, blocks) {
    const text = collapseInlineWhitespace(node?.textContent || "");
    if (text) {
      blocks.push(createTextBlock("paragraph", text));
    }
  }

  function pruneNoise(root) {
    if (!root?.querySelectorAll) {
      return root;
    }

    for (const selector of NOISE_SELECTORS) {
      root.querySelectorAll(selector).forEach((node) => node.remove());
    }
    return root;
  }

  function appendBlocksFromNode(node, blocks) {
    if (!node) {
      return;
    }

    if (node.nodeType === 3) {
      const text = collapseInlineWhitespace(node.textContent || "");
      if (text) {
        blocks.push(createTextBlock("paragraph", text));
      }
      return;
    }

    if (node.nodeType !== 1) {
      return;
    }

    const tagName = node.tagName.toLowerCase();
    const text = collapseInlineWhitespace(node.textContent || "");
    if (!text) {
      return;
    }

    if (/^h[1-6]$/.test(tagName)) {
      blocks.push(createHeadingBlock(text, Number(tagName.slice(1))));
      return;
    }

    if (tagName === "p") {
      blocks.push(createTextBlock("paragraph", text));
      return;
    }

    if (tagName === "blockquote") {
      blocks.push(createTextBlock("quote", text));
      return;
    }

    if (tagName === "pre") {
      blocks.push(createTextBlock("code", normalizePlainTextValue(node.textContent || "")));
      return;
    }

    if (tagName === "ul" || tagName === "ol") {
      const listType = tagName === "ol" ? "numbered" : "bulleted";
      Array.from(node.children || [])
        .filter((child) => child.tagName?.toLowerCase() === "li")
        .forEach((child) => {
          const itemText = collapseInlineWhitespace(child.textContent || "");
          if (itemText) {
            blocks.push(createTextBlock("list_item", itemText, { listType }));
          }
        });
      return;
    }

    if (tagName === "table") {
      Array.from(node.querySelectorAll("tr")).forEach((row) => {
        const rowText = Array.from(row.querySelectorAll("th, td"))
          .map((cell) => collapseInlineWhitespace(cell.textContent || ""))
          .filter(Boolean)
          .join(" | ");
        if (rowText) {
          blocks.push(createTextBlock("paragraph", rowText));
        }
      });
      return;
    }

    const blockChildren = Array.from(node.children || []).filter((child) =>
      BLOCKISH_TAGS.has(child.tagName.toLowerCase())
    );
    if (blockChildren.length) {
      blockChildren.forEach((child) => appendBlocksFromNode(child, blocks));
      return;
    }

    appendParagraphFallback(node, blocks);
  }

  function normalizeHtmlContent(html, options) {
    const sourceHtml = trimString(html);
    if (!sourceHtml || typeof DOMParser === "undefined") {
      return normalizePlainTextContent(options?.fallbackText || "", options);
    }

    const doc = new DOMParser().parseFromString(sourceHtml, "text/html");
    const root = pruneNoise(doc.body || doc.documentElement);
    const blocks = [];
    Array.from(root?.childNodes || []).forEach((child) => appendBlocksFromNode(child, blocks));

    if (options?.title && !blocks.some((block) => block.type === "heading")) {
      blocks.unshift(createHeadingBlock(options.title, 1));
    }

    if (!blocks.length) {
      return normalizePlainTextContent(options?.fallbackText || root?.textContent || "", options);
    }

    return buildResult(blocks, options);
  }

  function normalizePlainTextContent(text, options) {
    const blocks = [];
    if (options?.title) {
      blocks.push(createHeadingBlock(options.title, 1));
    }

    const paragraphs = splitParagraphs(text);
    for (const paragraph of paragraphs) {
      const lines = paragraph.split("\n").map(collapseInlineWhitespace).filter(Boolean);
      const listLines = lines.filter((line) => /^([*\-•]|\d+\.)\s+/.test(line));
      if (lines.length && listLines.length === lines.length) {
        lines.forEach((line) => {
          blocks.push(
            createTextBlock("list_item", line.replace(/^([*\-•]|\d+\.)\s+/, ""), {
              listType: /^\d+\./.test(line) ? "numbered" : "bulleted"
            })
          );
        });
        continue;
      }

      if (paragraph) {
        blocks.push(createTextBlock("paragraph", paragraph));
      }
    }

    return buildResult(blocks, options);
  }

  globalThis.CanvasNormalizeContentUtils = {
    countWords,
    normalizeHtmlContent,
    normalizeLineEndings,
    normalizePlainTextContent,
    normalizePlainTextValue
  };
})();
