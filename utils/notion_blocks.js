(function () {
  if (globalThis.CanvasNotionBlocks) {
    return;
  }

  const MAX_RICH_TEXT_LENGTH = 1900;
  const MAX_CHILDREN_PER_APPEND = 100;

  function trimString(value) {
    return String(value || "").trim();
  }

  function splitTextChunks(value, maxLength) {
    const text = String(value || "");
    if (!text) {
      return [];
    }

    const chunks = [];
    let remaining = text;
    while (remaining.length > maxLength) {
      let cutIndex = remaining.lastIndexOf(" ", maxLength);
      if (cutIndex < Math.floor(maxLength / 2)) {
        cutIndex = maxLength;
      }
      chunks.push(remaining.slice(0, cutIndex));
      remaining = remaining.slice(cutIndex).trimStart();
    }
    if (remaining) {
      chunks.push(remaining);
    }
    return chunks;
  }

  function buildRichTextItem(content, annotations, href) {
    return {
      type: "text",
      text: {
        content,
        link: href ? { url: href } : null
      },
      annotations: {
        bold: Boolean(annotations?.bold),
        italic: Boolean(annotations?.italic),
        strikethrough: Boolean(annotations?.strikethrough),
        underline: Boolean(annotations?.underline),
        code: Boolean(annotations?.code),
        color: "default"
      },
      plain_text: content,
      href: href || null
    };
  }

  function createRichText(content, annotations, href) {
    return splitTextChunks(content, MAX_RICH_TEXT_LENGTH).map((chunk) => buildRichTextItem(chunk, annotations, href));
  }

  function extractInlineRichText(node, annotations, href) {
    if (!node) {
      return [];
    }

    if (node.nodeType === 3) {
      const text = node.textContent || "";
      if (!trimString(text)) {
        return [];
      }
      return createRichText(text.replace(/\s+/g, " "), annotations, href);
    }

    if (node.nodeType !== 1) {
      return [];
    }

    const tagName = node.tagName.toLowerCase();
    const nextAnnotations = {
      ...annotations,
      bold: annotations?.bold || tagName === "strong" || tagName === "b",
      italic: annotations?.italic || tagName === "em" || tagName === "i",
      underline: annotations?.underline || tagName === "u",
      strikethrough: annotations?.strikethrough || tagName === "s" || tagName === "strike",
      code: annotations?.code || tagName === "code"
    };
    const nextHref = tagName === "a" ? node.getAttribute("href") || href : href;

    if (tagName === "br") {
      return createRichText("\n", nextAnnotations, nextHref);
    }

    if (tagName === "img") {
      const alt = trimString(node.getAttribute("alt"));
      return alt ? createRichText(`[Image: ${alt}]`, nextAnnotations, nextHref) : [];
    }

    return Array.from(node.childNodes || []).flatMap((childNode) =>
      extractInlineRichText(childNode, nextAnnotations, nextHref)
    );
  }

  function createTextBlock(type, richText, extra) {
    if (!Array.isArray(richText) || !richText.length) {
      return null;
    }
    return {
      object: "block",
      type,
      [type]: {
        rich_text: richText,
        color: "default",
        ...(extra || {})
      }
    };
  }

  function createParagraphBlocksFromText(text) {
    return String(text || "")
      .split(/\n{2,}/)
      .map((part) => trimString(part))
      .filter(Boolean)
      .flatMap((part) => {
        const richText = createRichText(part, null, null);
        const block = createTextBlock("paragraph", richText);
        return block ? [block] : [];
      });
  }

  function flattenText(node) {
    return trimString((node?.textContent || "").replace(/\s+/g, " "));
  }

  function appendBlocksFromNode(node, blocks) {
    if (!node) {
      return;
    }

    if (node.nodeType === 3) {
      const text = trimString(node.textContent);
      if (text) {
        createParagraphBlocksFromText(text).forEach((block) => blocks.push(block));
      }
      return;
    }

    if (node.nodeType !== 1) {
      return;
    }

    const tagName = node.tagName.toLowerCase();
    const inlineRichText = extractInlineRichText(node, null, null);

    if (tagName === "h1" || tagName === "h2" || tagName === "h3") {
      const type = tagName === "h1" ? "heading_1" : tagName === "h2" ? "heading_2" : "heading_3";
      const block = createTextBlock(type, inlineRichText);
      if (block) {
        blocks.push(block);
      }
      return;
    }

    if (tagName === "p") {
      const block = createTextBlock("paragraph", inlineRichText);
      if (block) {
        blocks.push(block);
      }
      return;
    }

    if (tagName === "blockquote") {
      const block = createTextBlock("quote", inlineRichText);
      if (block) {
        blocks.push(block);
      }
      return;
    }

    if (tagName === "pre") {
      const codeText = flattenText(node);
      if (codeText) {
        blocks.push({
          object: "block",
          type: "code",
          code: {
            rich_text: createRichText(codeText, { code: true }, null),
            language: "plain text",
            caption: []
          }
        });
      }
      return;
    }

    if (tagName === "hr") {
      blocks.push({
        object: "block",
        type: "divider",
        divider: {}
      });
      return;
    }

    if (tagName === "ul" || tagName === "ol") {
      const blockType = tagName === "ul" ? "bulleted_list_item" : "numbered_list_item";
      Array.from(node.children || [])
        .filter((childNode) => childNode.tagName?.toLowerCase() === "li")
        .forEach((childNode) => {
          const block = createTextBlock(blockType, extractInlineRichText(childNode, null, null));
          if (block) {
            blocks.push(block);
          }
        });
      return;
    }

    if (tagName === "table") {
      Array.from(node.querySelectorAll("tr")).forEach((row) => {
        const rowText = Array.from(row.querySelectorAll("th, td"))
          .map((cell) => flattenText(cell))
          .filter(Boolean)
          .join(" | ");
        createParagraphBlocksFromText(rowText).forEach((block) => blocks.push(block));
      });
      return;
    }

    const blockishChildren = Array.from(node.children || []).filter((childNode) =>
      ["article", "aside", "blockquote", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "ol", "p", "pre", "section", "table", "ul"].includes(
        childNode.tagName.toLowerCase()
      )
    );

    if (blockishChildren.length) {
      blockishChildren.forEach((childNode) => appendBlocksFromNode(childNode, blocks));
      return;
    }

    const fallbackText = flattenText(node);
    if (fallbackText) {
      createParagraphBlocksFromText(fallbackText).forEach((block) => blocks.push(block));
    }
  }

  function compactBlocks(blocks) {
    return (blocks || []).filter(Boolean).slice(0, 1000);
  }

  function htmlToBlocks(html, fallbackText) {
    const blocks = [];
    const sourceHtml = trimString(html);
    if (sourceHtml && typeof DOMParser !== "undefined") {
      const doc = new DOMParser().parseFromString(sourceHtml, "text/html");
      Array.from(doc.body?.childNodes || []).forEach((node) => appendBlocksFromNode(node, blocks));
    }

    const compacted = compactBlocks(blocks);
    if (compacted.length) {
      return compacted;
    }

    return createParagraphBlocksFromText(fallbackText || "");
  }

  function chunkBlocks(blocks) {
    const chunks = [];
    for (let index = 0; index < blocks.length; index += MAX_CHILDREN_PER_APPEND) {
      chunks.push(blocks.slice(index, index + MAX_CHILDREN_PER_APPEND));
    }
    return chunks;
  }

  function buildProvenanceBlocks(record) {
    const lines = [
      `Canvas URL: ${record.sourceCanvasUrl || record.sourcePageUrl || "unknown"}`,
      `Source section: ${record.sourceSection || "unknown"}`,
      `Synced at: ${new Date().toISOString()}`
    ];
    if (record.sourcePageTitle) {
      lines.unshift(`Source page: ${record.sourcePageTitle}`);
    }
    return createParagraphBlocksFromText(lines.join("\n\n"));
  }

  globalThis.CanvasNotionBlocks = {
    buildProvenanceBlocks,
    chunkBlocks,
    htmlToBlocks
  };
})();
