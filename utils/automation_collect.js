(function () {
  if (globalThis.CanvasAutomationCollect) {
    return;
  }

  const Models = globalThis.CanvasAutomationModels;
  const NotionApi = globalThis.CanvasNotionApi;
  if (!Models || !NotionApi) {
    throw new Error("CanvasAutomationModels and CanvasNotionApi must load before CanvasAutomationCollect.");
  }

  const TEXT_BLOCK_TYPES = ["paragraph", "heading_1", "heading_2", "heading_3", "bulleted_list_item", "numbered_list_item", "quote"];
  const PROVENANCE_PREFIXES = [
    "Source page:",
    "Canvas URL:",
    "Source section:",
    "Synced at:",
    "Extraction:",
    "Artifact attached",
    "Artifact not attached",
    "External resource:"
  ];

  function createBlockedError(message) {
    const error = new Error(message);
    error.code = "automation_blocked";
    return error;
  }

  function trimString(value) {
    return Models.trimString(value);
  }

  function textFromRichText(items) {
    return (items || []).map((item) => item?.plain_text || item?.text?.content || "").join("").trim();
  }

  function readProperty(page, propertyName) {
    return page?.properties?.[propertyName] || null;
  }

  function readTextProperty(page, propertyName) {
    const property = readProperty(page, propertyName);
    if (!property) {
      return "";
    }
    if (property.type === "title") {
      return textFromRichText(property.title);
    }
    if (property.type === "rich_text") {
      return textFromRichText(property.rich_text);
    }
    if (property.type === "select") {
      return property.select?.name || "";
    }
    if (property.type === "url") {
      return property.url || "";
    }
    if (property.type === "date") {
      return property.date?.start || "";
    }
    if (property.type === "number") {
      return Number.isFinite(property.number) ? String(property.number) : "";
    }
    return "";
  }

  function readDateProperty(page, propertyName) {
    return readProperty(page, propertyName)?.date?.start || "";
  }

  function readSelectProperty(page, propertyName) {
    return readProperty(page, propertyName)?.select?.name || "";
  }

  function readCheckboxProperty(page, propertyName) {
    return Boolean(readProperty(page, propertyName)?.checkbox);
  }

  function readNumberProperty(page, propertyName) {
    const number = readProperty(page, propertyName)?.number;
    return Number.isFinite(number) ? number : 0;
  }

  function parseInputDate(rawValue) {
    return Models.parseInputDate(rawValue);
  }

  function isWithinWindow(rawValue, window) {
    const date = parseInputDate(rawValue);
    if (!date || !window?.valid) {
      return false;
    }

    const value = date.getTime();
    const start = new Date(window.start).getTime();
    const end = new Date(window.end).getTime();
    return value >= start && value <= end;
  }

  async function queryAllDatabasePages(databaseId, accessToken) {
    const pages = [];
    let cursor = null;
    do {
      const response = await NotionApi.queryDatabase(
        databaseId,
        {
          start_cursor: cursor || undefined,
          page_size: 100
        },
        accessToken
      );
      pages.push(...(response?.results || []));
      cursor = response?.has_more ? response?.next_cursor : null;
    } while (cursor);
    return pages;
  }

  function isRelevantText(text) {
    const normalized = Models.trimString(text);
    if (!normalized) {
      return false;
    }
    return !PROVENANCE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
  }

  function flattenBlockText(block) {
    const type = block?.type;
    if (!type || !TEXT_BLOCK_TYPES.includes(type)) {
      return "";
    }
    return textFromRichText(block[type]?.rich_text);
  }

  async function collectPageContext(pageId, accessToken) {
    const blocks = await NotionApi.listAllBlockChildren(pageId, accessToken);
    const headings = [];
    const snippets = [];
    const textParts = [];

    for (const block of blocks) {
      const text = flattenBlockText(block);
      if (!isRelevantText(text)) {
        continue;
      }

      if (["heading_1", "heading_2", "heading_3"].includes(block.type) && text !== "Extracted Content") {
        headings.push(text);
        continue;
      }

      textParts.push(text);
      if (snippets.length < 3) {
        snippets.push(text);
      }
    }

    return {
      headings: headings.slice(0, 12),
      snippet: snippets.join(" ").slice(0, 700),
      bodyText: textParts.join("\n").slice(0, 6000)
    };
  }

  function parseContentPage(page, databaseId) {
    return {
      inputId: page.id,
      sourceKind: "content",
      notionDatabaseId: databaseId,
      notionPageId: page.id,
      notionPageUrl: page.url || "",
      contentObjectId: readTextProperty(page, "Content Object ID"),
      courseId: readTextProperty(page, "Canvas Course ID"),
      courseName: readTextProperty(page, "Course Name"),
      title: readTextProperty(page, "Title") || "Content",
      contentType: readSelectProperty(page, "Content Type"),
      sourceSection: readSelectProperty(page, "Source Section"),
      sourcePageTitle: readTextProperty(page, "Source Page Title"),
      sourceUrl: readTextProperty(page, "Source URL"),
      canvasUrl: readTextProperty(page, "Canvas URL"),
      weekOrModule: readTextProperty(page, "Week/Module"),
      discoveredAt: readDateProperty(page, "Date Discovered"),
      processingStatus: readSelectProperty(page, "Processing Status"),
      extractionStatus: readSelectProperty(page, "Extraction Status"),
      readiness: readSelectProperty(page, "Readiness"),
      sourceCategory: readSelectProperty(page, "Source Category"),
      extractionMethod: readTextProperty(page, "Extraction Method"),
      extractedTextPresent: readCheckboxProperty(page, "Extracted Text Present"),
      wordCount: readNumberProperty(page, "Word Count"),
      chunkCount: readNumberProperty(page, "Chunk Count"),
      unsupportedReason: readTextProperty(page, "Unsupported Reason"),
      fileName: readTextProperty(page, "File Name"),
      provenance: {
        notionDatabaseId: databaseId,
        notionPageId: page.id,
        notionPageUrl: page.url || "",
        sourceUrl: readTextProperty(page, "Source URL"),
        canvasUrl: readTextProperty(page, "Canvas URL")
      }
    };
  }

  function parseTaskPage(page, databaseId) {
    return {
      inputId: page.id,
      sourceKind: "task",
      notionDatabaseId: databaseId,
      notionPageId: page.id,
      notionPageUrl: page.url || "",
      contentObjectId: readTextProperty(page, "Content Object ID"),
      courseId: readTextProperty(page, "Canvas Course ID"),
      courseName: readTextProperty(page, "Course Name"),
      title: readTextProperty(page, "Title") || "Task",
      dueDate: readDateProperty(page, "Due Date"),
      dueDateAvailable: readCheckboxProperty(page, "Due Date Available"),
      processingStatus: readSelectProperty(page, "Processing Status"),
      sourceUrl: readTextProperty(page, "Source URL"),
      automationReady: readCheckboxProperty(page, "Automation Ready"),
      provenance: {
        notionDatabaseId: databaseId,
        notionPageId: page.id,
        notionPageUrl: page.url || "",
        sourceUrl: readTextProperty(page, "Source URL")
      }
    };
  }

  function filterByScope(item, targetCourseIds) {
    return !targetCourseIds.length || !item.courseId || targetCourseIds.includes(item.courseId);
  }

  async function collectTaskInputs(options) {
    const pages = await queryAllDatabasePages(options.databaseId, options.accessToken);
    const matchedTasks = [];
    const metadataGapTasks = [];

    for (const page of pages) {
      const task = parseTaskPage(page, options.databaseId);
      if (!filterByScope(task, options.targetCourseIds)) {
        continue;
      }

      if (task.dueDate && isWithinWindow(task.dueDate, options.window)) {
        matchedTasks.push(task);
        continue;
      }

      if (!task.dueDate) {
        metadataGapTasks.push(task);
      }
    }

    return {
      items: matchedTasks.sort((left, right) => {
        const leftTime = new Date(left.dueDate || 0).getTime();
        const rightTime = new Date(right.dueDate || 0).getTime();
        return leftTime - rightTime;
      }),
      metadataGaps: metadataGapTasks
        .sort((left, right) => trimString(left.courseName || left.title).localeCompare(trimString(right.courseName || right.title)))
        .slice(0, 20),
      examinedCount: pages.length
    };
  }

  async function collectContentInputs(options) {
    const pages = await queryAllDatabasePages(options.databaseId, options.accessToken);
    const matchedPages = [];
    const warnings = [];

    for (const page of pages) {
      const content = parseContentPage(page, options.databaseId);
      if (!filterByScope(content, options.targetCourseIds)) {
        continue;
      }
      if (!content.discoveredAt || !isWithinWindow(content.discoveredAt, options.window)) {
        continue;
      }
      matchedPages.push(content);
    }

    const enrichedItems = [];
    for (const content of matchedPages.sort((left, right) => {
      const leftTime = new Date(left.discoveredAt || 0).getTime();
      const rightTime = new Date(right.discoveredAt || 0).getTime();
      return rightTime - leftTime;
    })) {
      try {
        const pageContext = await collectPageContext(content.notionPageId, options.accessToken);
        enrichedItems.push({
          ...content,
          headings: pageContext.headings,
          textSnippet: pageContext.snippet,
          extractedText: pageContext.bodyText
        });
      } catch (error) {
        warnings.push(`${content.title}: ${error.message}`);
        enrichedItems.push({
          ...content,
          headings: [],
          textSnippet: "",
          extractedText: ""
        });
      }
    }

    return {
      items: enrichedItems,
      examinedCount: pages.length,
      warnings
    };
  }

  async function collectInputs(options) {
    const definition = options?.definition;
    const notionState = options?.notionState || {};
    const accessToken = Models.trimString(options?.accessToken || notionState.notionAuth?.accessToken || notionState.auth?.accessToken);
    if (!accessToken) {
      throw createBlockedError("Notion token missing. Validate Notion access before running automations.");
    }

    const destinationPageId = Models.trimString(
      notionState.notionDestination?.destinationPageId || notionState.destination?.destinationPageId
    );
    if (!destinationPageId) {
      throw createBlockedError("Notion destination is missing or unparseable.");
    }

    const mappings = notionState.notionMappings || notionState.mappings || {};
    const contentDatabaseId = Models.trimString(mappings.workspace?.databases?.content?.id);
    const deliverablesDatabaseId = Models.trimString(mappings.workspace?.databases?.deliverables?.id);
    const targetCourseIds = Models.uniqStrings(options?.targetCourseIds || []);
    const window = options?.window;
    if (!window?.valid) {
      throw createBlockedError("Automation window is invalid.");
    }

    const warnings = [];
    const response = {
      inputWindow: window,
      targetScope: definition?.targetScope || "workspace",
      targetCourseIds,
      tasks: [],
      taskMetadataGaps: [],
      content: [],
      mixed: [],
      warnings,
      examinedCounts: {
        tasks: 0,
        content: 0
      },
      sourceRecordCounts: {
        tasks: 0,
        content: 0,
        total: 0
      }
    };

    if (["tasks", "both"].includes(definition?.inputSources)) {
      if (!deliverablesDatabaseId) {
        throw createBlockedError("Deliverables database mapping is missing. Run live Notion sync before weekly task automation.");
      }
      const taskCollection = await collectTaskInputs({
        accessToken,
        databaseId: deliverablesDatabaseId,
        targetCourseIds,
        window
      });
      response.tasks = taskCollection.items;
      response.taskMetadataGaps = taskCollection.metadataGaps;
      response.examinedCounts.tasks = taskCollection.examinedCount;
      response.sourceRecordCounts.tasks = taskCollection.items.length;
    }

    if (["content", "both"].includes(definition?.inputSources)) {
      if (!contentDatabaseId) {
        throw createBlockedError("Content database mapping is missing. Run live Notion sync before content automations.");
      }
      const contentCollection = await collectContentInputs({
        accessToken,
        databaseId: contentDatabaseId,
        targetCourseIds,
        window
      });
      response.content = contentCollection.items;
      response.examinedCounts.content = contentCollection.examinedCount;
      response.sourceRecordCounts.content = contentCollection.items.length;
      warnings.push(...contentCollection.warnings);
    }

    response.mixed = [...response.tasks, ...response.content];
    response.sourceRecordCounts.total = response.sourceRecordCounts.tasks + response.sourceRecordCounts.content;
    response.warnings = Array.from(new Set(warnings.filter(Boolean)));
    return response;
  }

  globalThis.CanvasAutomationCollect = {
    collectInputs
  };
})();
