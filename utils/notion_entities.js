(function () {
  if (globalThis.CanvasNotionEntities) {
    return;
  }

  function trimString(value) {
    return String(value || "").trim();
  }

  function textArray(value) {
    const content = trimString(value);
    if (!content) {
      return [];
    }
    return [
      {
        type: "text",
        text: {
          content
        }
      }
    ];
  }

  function titleProperty() {
    return {
      title: {}
    };
  }

  function richTextProperty() {
    return {
      rich_text: {}
    };
  }

  function urlProperty() {
    return {
      url: {}
    };
  }

  function dateProperty() {
    return {
      date: {}
    };
  }

  function checkboxProperty() {
    return {
      checkbox: {}
    };
  }

  function numberProperty() {
    return {
      number: {
        format: "number"
      }
    };
  }

  function selectProperty(options) {
    return {
      select: {
        options: (options || []).map((optionName) => ({
          name: optionName
        }))
      }
    };
  }

  function buildCoursesDatabaseSchema() {
    return {
      "Course Name": titleProperty(),
      "Canvas Course ID": richTextProperty(),
      Term: richTextProperty(),
      "Canvas URL": urlProperty(),
      "Import Scope / Mode": selectProperty(["general", "class_specific"]),
      "Sync Status": selectProperty(["planned", "syncing", "completed", "partially_completed", "failed"]),
      "Last Synced": dateProperty(),
      "Course Hub Page ID": richTextProperty()
    };
  }

  function buildContentDatabaseSchema() {
    return {
      Title: titleProperty(),
      "Content Object ID": richTextProperty(),
      "Canvas Course ID": richTextProperty(),
      "Course Name": richTextProperty(),
      "Content Type": selectProperty(["canvas_page", "assignment", "syllabus", "module_resource", "file_artifact", "external_resource"]),
      "Source Section": selectProperty(["home", "pages", "assignments", "syllabus", "modules", "files"]),
      "Source Page Title": richTextProperty(),
      "Source URL": urlProperty(),
      "Canvas URL": urlProperty(),
      "Week/Module": richTextProperty(),
      "Date Discovered": dateProperty(),
      "Processing Status": selectProperty([
        "discovered",
        "downloaded",
        "planned",
        "notion_created",
        "notion_updated",
        "artifact_attached",
        "extraction_pending",
        "extracted",
        "chunked",
        "notion_enriched",
        "automation_ready",
        "failed"
      ]),
      "Extraction Status": selectProperty(["not_started", "pending", "extracted", "failed", "unsupported", "not_applicable"]),
      Readiness: selectProperty([
        "discovered",
        "downloaded",
        "extraction_pending",
        "extracted",
        "chunked",
        "notion_enriched",
        "automation_ready",
        "unsupported_for_extraction",
        "blocked"
      ]),
      "Source Category": selectProperty(["canvas_native_html", "pdf", "docx", "txt", "html_file", "unsupported"]),
      "Extraction Method": richTextProperty(),
      "Extracted Text Present": checkboxProperty(),
      "Word Count": numberProperty(),
      "Char Count": numberProperty(),
      "Chunk Count": numberProperty(),
      "Unsupported Reason": richTextProperty(),
      "Last Synced": dateProperty(),
      "Automation Ready": checkboxProperty(),
      "Local Download Path": richTextProperty(),
      "File Name": richTextProperty(),
      "Is Canvas Hosted": checkboxProperty(),
      "Is Downloadable": checkboxProperty(),
      "Is External": checkboxProperty()
    };
  }

  function buildDeliverablesDatabaseSchema() {
    return {
      Title: titleProperty(),
      "Content Object ID": richTextProperty(),
      "Canvas Course ID": richTextProperty(),
      "Course Name": richTextProperty(),
      "Source URL": urlProperty(),
      "Due Date": dateProperty(),
      "Due Date Available": checkboxProperty(),
      "Processing Status": selectProperty([
        "discovered",
        "planned",
        "notion_created",
        "notion_updated",
        "automation_ready",
        "failed"
      ]),
      "Last Synced": dateProperty(),
      "Automation Ready": checkboxProperty()
    };
  }

  function buildStudyAssetsDatabaseSchema() {
    return {
      Title: titleProperty(),
      "Canvas Course ID": richTextProperty(),
      "Course Name": richTextProperty(),
      "Asset Type": selectProperty(["flashcards", "review_questions", "summary", "recap"]),
      "Automation Status": selectProperty(["planned", "ready", "running", "completed"])
    };
  }

  function buildTitleValue(value) {
    return {
      title: textArray(value)
    };
  }

  function buildRichTextValue(value) {
    return {
      rich_text: textArray(value)
    };
  }

  function buildUrlValue(value) {
    return {
      url: trimString(value) || null
    };
  }

  function buildDateValue(value) {
    const start = trimString(value);
    return {
      date: start ? { start } : null
    };
  }

  function buildCheckboxValue(value) {
    return {
      checkbox: Boolean(value)
    };
  }

  function buildNumberValue(value) {
    return {
      number: Number.isFinite(Number(value)) ? Number(value) : null
    };
  }

  function buildSelectValue(value) {
    const name = trimString(value);
    return {
      select: name ? { name } : null
    };
  }

  function buildCourseRowProperties(course, workspaceMode, status, syncedAt, hubPageId) {
    return {
      "Course Name": buildTitleValue(course.courseName || `Course ${course.courseId}`),
      "Canvas Course ID": buildRichTextValue(course.courseId),
      Term: buildRichTextValue(course.term || ""),
      "Canvas URL": buildUrlValue(course.courseUrl),
      "Import Scope / Mode": buildSelectValue(workspaceMode),
      "Sync Status": buildSelectValue(status),
      "Last Synced": buildDateValue(syncedAt),
      "Course Hub Page ID": buildRichTextValue(hubPageId || "")
    };
  }

  function buildContentRowProperties(record, status, syncedAt) {
    const automationReady = Boolean(
      record.automationReady ||
        status === "artifact_attached" ||
        Number(record.chunkCount || 0) > 0 ||
        Boolean(trimString(record.extractedText))
    );
    return {
      Title: buildTitleValue(record.sourcePageTitle || record.fileName || record.contentType),
      "Content Object ID": buildRichTextValue(record.contentObjectId),
      "Canvas Course ID": buildRichTextValue(record.courseId),
      "Course Name": buildRichTextValue(record.courseName),
      "Content Type": buildSelectValue(record.contentType),
      "Source Section": buildSelectValue(record.sourceSection),
      "Source Page Title": buildRichTextValue(record.sourcePageTitle || ""),
      "Source URL": buildUrlValue(record.sourcePageUrl || record.externalUrl || record.sourceCanvasUrl),
      "Canvas URL": buildUrlValue(record.sourceCanvasUrl || record.externalUrl || record.sourcePageUrl),
      "Week/Module": buildRichTextValue(record.weekOrModule || ""),
      "Date Discovered": buildDateValue(record.discoveredAt),
      "Processing Status": buildSelectValue(status),
      "Extraction Status": buildSelectValue(record.extractionStatus || "not_started"),
      Readiness: buildSelectValue(record.contentReadinessState || "discovered"),
      "Source Category": buildSelectValue(record.sourceCategory || "unsupported"),
      "Extraction Method": buildRichTextValue(record.extractionMethod || ""),
      "Extracted Text Present": buildCheckboxValue(Boolean(trimString(record.extractedText))),
      "Word Count": buildNumberValue(record.wordCount),
      "Char Count": buildNumberValue(record.charCount),
      "Chunk Count": buildNumberValue(record.chunkCount),
      "Unsupported Reason": buildRichTextValue(record.unsupportedReason || record.failureReason || ""),
      "Last Synced": buildDateValue(syncedAt),
      "Automation Ready": buildCheckboxValue(automationReady),
      "Local Download Path": buildRichTextValue(record.localDownloadPath || ""),
      "File Name": buildRichTextValue(record.fileName || ""),
      "Is Canvas Hosted": buildCheckboxValue(record.isCanvasHosted),
      "Is Downloadable": buildCheckboxValue(record.isDownloadable),
      "Is External": buildCheckboxValue(record.isExternal)
    };
  }

  function buildDeliverableRowProperties(record, status, syncedAt) {
    return {
      Title: buildTitleValue(record.sourcePageTitle || "Canvas deliverable"),
      "Content Object ID": buildRichTextValue(record.contentObjectId),
      "Canvas Course ID": buildRichTextValue(record.courseId),
      "Course Name": buildRichTextValue(record.courseName),
      "Source URL": buildUrlValue(record.sourceCanvasUrl || record.sourcePageUrl),
      "Due Date": buildDateValue(record.dueDate),
      "Due Date Available": buildCheckboxValue(Boolean(record.dueDate)),
      "Processing Status": buildSelectValue(status),
      "Last Synced": buildDateValue(syncedAt),
      "Automation Ready": buildCheckboxValue(Boolean(record.dueDate))
    };
  }

  globalThis.CanvasNotionEntities = {
    buildContentDatabaseSchema,
    buildContentRowProperties,
    buildCourseRowProperties,
    buildCoursesDatabaseSchema,
    buildDeliverableRowProperties,
    buildDeliverablesDatabaseSchema,
    buildStudyAssetsDatabaseSchema
  };
})();
