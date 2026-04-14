(function () {
  if (globalThis.CanvasAutomationWriter) {
    return;
  }

  const Models = globalThis.CanvasAutomationModels;
  const NotionModels = globalThis.CanvasNotionModels;
  const NotionApi = globalThis.CanvasNotionApi;
  const NotionBlocks = globalThis.CanvasNotionBlocks;
  const NotionEntities = globalThis.CanvasNotionEntities;
  const NotionStorage = globalThis.CanvasNotionStorage;
  if (!Models || !NotionModels || !NotionApi || !NotionBlocks || !NotionEntities || !NotionStorage) {
    throw new Error("Automation writer missing Notion dependencies.");
  }

  const MAX_RICH_TEXT_LENGTH = 1900;

  function trimString(value) {
    return Models.trimString(value);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function buildPlainTitle(value) {
    return [
      {
        type: "text",
        text: {
          content: trimString(value)
        }
      }
    ];
  }

  function splitTextChunks(value) {
    const text = String(value || "");
    if (!text) {
      return [];
    }
    const chunks = [];
    let remaining = text;
    while (remaining.length > MAX_RICH_TEXT_LENGTH) {
      let cutIndex = remaining.lastIndexOf(" ", MAX_RICH_TEXT_LENGTH);
      if (cutIndex < Math.floor(MAX_RICH_TEXT_LENGTH / 2)) {
        cutIndex = MAX_RICH_TEXT_LENGTH;
      }
      chunks.push(remaining.slice(0, cutIndex));
      remaining = remaining.slice(cutIndex).trimStart();
    }
    if (remaining) {
      chunks.push(remaining);
    }
    return chunks;
  }

  function createRichText(content) {
    return splitTextChunks(content).map((chunk) => ({
      type: "text",
      text: {
        content: chunk
      },
      plain_text: chunk
    }));
  }

  async function listChildObjects(parentPageId, accessToken) {
    const children = await NotionApi.listAllBlockChildren(parentPageId, accessToken);
    return {
      pages: children.filter((child) => child.type === "child_page"),
      databases: children.filter((child) => child.type === "child_database")
    };
  }

  function findChildDatabaseByTitle(childObjects, title) {
    return (childObjects.databases || []).find((item) => item.child_database?.title === title) || null;
  }

  function getMissingProperties(existingProperties, desiredProperties) {
    const patch = {};
    for (const [name, definition] of Object.entries(desiredProperties || {})) {
      if (!existingProperties?.[name]) {
        patch[name] = definition;
      }
    }
    return patch;
  }

  async function ensureDatabaseSchema(databaseId, schema, accessToken) {
    const existing = await NotionApi.retrieveDatabase(databaseId, accessToken);
    const missingProperties = getMissingProperties(existing?.properties, schema);
    if (!Object.keys(missingProperties).length) {
      return existing;
    }
    return NotionApi.updateDatabase(
      databaseId,
      {
        properties: missingProperties
      },
      accessToken
    );
  }

  async function resolveAutomationOutputsDatabase(options) {
    const schema = NotionEntities.buildAutomationOutputsDatabaseSchema();
    const childObjects = await listChildObjects(options.parentPageId, options.accessToken);
    const mappedId = trimString(options.mappedId);

    if (mappedId) {
      await ensureDatabaseSchema(mappedId, schema, options.accessToken);
      return {
        id: mappedId,
        action: "mapped"
      };
    }

    const existing = findChildDatabaseByTitle(childObjects, "Automation Outputs");
    if (existing?.id) {
      await ensureDatabaseSchema(existing.id, schema, options.accessToken);
      return {
        id: existing.id,
        action: "reused"
      };
    }

    const created = await NotionApi.createDatabase(
      {
        parent: {
          type: "page_id",
          page_id: options.parentPageId
        },
        title: buildPlainTitle("Automation Outputs"),
        properties: schema
      },
      options.accessToken
    );
    return {
      id: created.id,
      action: "created"
    };
  }

  async function queryByRichText(databaseId, propertyName, value, accessToken) {
    if (!trimString(value)) {
      return null;
    }
    const response = await NotionApi.queryDatabase(
      databaseId,
      {
        filter: {
          property: propertyName,
          rich_text: {
            equals: value
          }
        },
        page_size: 1
      },
      accessToken
    );
    return response?.results?.[0] || null;
  }

  async function upsertDatabasePage(options) {
    const mappedId = trimString(options.mapping?.pageId);
    if (mappedId) {
      const updated = await NotionApi.updatePage(mappedId, { properties: options.properties }, options.accessToken);
      return {
        pageId: mappedId,
        pageUrl: updated?.url || "",
        action: "updated"
      };
    }

    const existing = await queryByRichText(options.databaseId, options.lookupProperty, options.lookupValue, options.accessToken);
    if (existing?.id) {
      const updated = await NotionApi.updatePage(existing.id, { properties: options.properties }, options.accessToken);
      return {
        pageId: existing.id,
        pageUrl: updated?.url || existing?.url || "",
        action: "updated"
      };
    }

    const created = await NotionApi.createPage(
      {
        parent: {
          database_id: options.databaseId
        },
        properties: options.properties
      },
      options.accessToken
    );

    return {
      pageId: created.id,
      pageUrl: created?.url || "",
      action: "created"
    };
  }

  async function archiveMappedBlocks(blockIds, accessToken) {
    for (const blockId of Models.uniqStrings(blockIds)) {
      try {
        await NotionApi.archiveBlock(blockId, accessToken);
      } catch (error) {
        // Best effort only.
      }
    }
  }

  async function appendBlocksAndCaptureIds(pageId, blocks, accessToken) {
    const appendedIds = [];
    for (const blockChunk of NotionBlocks.chunkBlocks(blocks)) {
      if (!blockChunk.length) {
        continue;
      }
      const response = await NotionApi.appendBlockChildren(pageId, blockChunk, accessToken);
      appendedIds.push(...(response?.results || []).map((item) => item.id).filter(Boolean));
    }
    return appendedIds;
  }

  async function syncStandalonePageBlocks(pageId, blocks, previousBlockIds, accessToken) {
    await archiveMappedBlocks(previousBlockIds, accessToken);
    return appendBlocksAndCaptureIds(pageId, blocks, accessToken);
  }

  function linkMarkup(url, label) {
    if (!trimString(url)) {
      return escapeHtml(label);
    }
    return `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`;
  }

  function buildSourceReferencesHtml(sourceReferences) {
    const refs = Array.isArray(sourceReferences) ? sourceReferences.slice(0, 40) : [];
    if (!refs.length) {
      return "<p>No source references for this output.</p>";
    }

    const listItems = refs
      .map((item) => {
        const notionLink = item.notionPageUrl ? linkMarkup(item.notionPageUrl, "Notion") : "";
        const canvasLink = item.canvasUrl ? linkMarkup(item.canvasUrl, "Canvas") : item.sourceUrl ? linkMarkup(item.sourceUrl, "Source") : "";
        const linkBits = [notionLink, canvasLink].filter(Boolean).join(" · ");
        const dateLabel = item.dueDate || item.discoveredAt || "";
        const metaBits = [item.courseName, item.contentType, dateLabel].filter(Boolean).join(" · ");
        return `<li><strong>${escapeHtml(item.title || item.sourceId || "Source")}</strong>${metaBits ? ` — ${escapeHtml(metaBits)}` : ""}${linkBits ? ` (${linkBits})` : ""}</li>`;
      })
      .join("");

    return `<ul>${listItems}</ul>`;
  }

  function buildMetadataBlock(output, run, warnings) {
    const metadata = {
      outputId: output.outputId,
      runId: output.runId || run?.runId || null,
      automationId: output.automationId,
      artifactType: output.artifactType,
      targetScope: output.targetScope || run?.targetScope || null,
      windowStart: output.windowStart || run?.windowStart || null,
      windowEnd: output.windowEnd || run?.windowEnd || null,
      sourceCount: output.sourceCount || 0,
      relatedCourseIds: output.relatedCourseIds || [],
      warnings: warnings || [],
      sourceIds: Array.isArray(output.structuredPayload?.sourceReferences)
        ? output.structuredPayload.sourceReferences.map((item) => item.sourceId).filter(Boolean)
        : []
    };
    return {
      object: "block",
      type: "code",
      code: {
        rich_text: createRichText(JSON.stringify(metadata, null, 2)),
        language: "json",
        caption: []
      }
    };
  }

  function buildWeeklyTasksHtml(output) {
    const payload = output.structuredPayload || {};
    const groupedSections = (payload.groupedByCourse || [])
      .map((group) => {
        const items = (group.items || [])
          .map((item) => `<li>${escapeHtml(item.title)} — due ${escapeHtml(item.dueDate || "unknown")} ${item.contentType ? `(${escapeHtml(item.contentType)})` : ""}</li>`)
          .join("");
        return `<h3>${escapeHtml(group.courseName)}</h3>${items ? `<ul>${items}</ul>` : "<p>No due items.</p>"}`;
      })
      .join("");
    const urgentItems = (payload.urgentItems || [])
      .map((item) => `<li>${escapeHtml(item.title)} — due ${escapeHtml(item.dueDate || "unknown")} (${escapeHtml(item.courseName || "Unknown course")})</li>`)
      .join("");
    const metadataGaps = (payload.metadataGaps || [])
      .map((item) => `<li>${escapeHtml(item.title)} (${escapeHtml(item.courseName || "Unknown course")}) — ${escapeHtml(item.note || "Missing metadata")}</li>`)
      .join("");
    return `
      <p>${escapeHtml(output.summary)}</p>
      <h2>Urgent Items</h2>
      ${urgentItems ? `<ul>${urgentItems}</ul>` : "<p>No urgent items in this run.</p>"}
      <h2>This Week By Course</h2>
      ${groupedSections || "<p>No due items in this window.</p>"}
      <h2>Missing Or Incomplete Metadata</h2>
      ${metadataGaps ? `<ul>${metadataGaps}</ul>` : "<p>No metadata gaps detected.</p>"}
      <h2>Source References</h2>
      ${buildSourceReferencesHtml(payload.sourceReferences)}
    `;
  }

  function buildWeeklyContentHtml(output) {
    const payload = output.structuredPayload || {};
    if (Array.isArray(payload.groupedByCourse)) {
      const groupedSections = payload.groupedByCourse
        .map((group) => {
          const bullets = (group.recapBullets || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
          const topics = (group.candidateTopics || []).map((topic) => `<li>${escapeHtml(topic)}</li>`).join("");
          const counts = Object.entries(group.countsByType || {})
            .map(([key, value]) => `${escapeHtml(key)}: ${escapeHtml(String(value))}`)
            .join(" · ");
          return `
            <h3>${escapeHtml(group.courseName)}</h3>
            <p>${counts || "No content type counts."}</p>
            <h3>Recap Bullets</h3>
            ${bullets ? `<ul>${bullets}</ul>` : "<p>No recap bullets.</p>"}
            <h3>Candidate Topics</h3>
            ${topics ? `<ul>${topics}</ul>` : "<p>No candidate topics.</p>"}
          `;
        })
        .join("");
      return `
        <p>${escapeHtml(output.summary)}</p>
        <h2>Content By Course</h2>
        ${groupedSections || "<p>No content items matched this window.</p>"}
        <h2>Source References</h2>
        ${buildSourceReferencesHtml(payload.sourceReferences)}
      `;
    }

    const recapBullets = (payload.recapBullets || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    const topics = (payload.candidateTopics || []).map((topic) => `<li>${escapeHtml(topic)}</li>`).join("");
    return `
      <p>${escapeHtml(output.summary)}</p>
      <h2>Course Recap</h2>
      ${recapBullets ? `<ul>${recapBullets}</ul>` : "<p>No recap bullets.</p>"}
      <h2>Candidate Topics</h2>
      ${topics ? `<ul>${topics}</ul>` : "<p>No candidate topics.</p>"}
      <h2>Source References</h2>
      ${buildSourceReferencesHtml(payload.sourceReferences)}
    `;
  }

  function buildStudySeedHtml(output) {
    const payload = output.structuredPayload || {};
    const majorTopics = (payload.majorTopics || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    const studyConcepts = (payload.candidateStudyConcepts || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    const keyItems = (payload.keyItems || [])
      .map((item) => `<li><strong>${escapeHtml(item.title)}</strong>${item.snippet ? ` — ${escapeHtml(item.snippet)}` : ""}</li>`)
      .join("");
    return `
      <p>${escapeHtml(output.summary)}</p>
      <h2>Major Topics</h2>
      ${majorTopics ? `<ul>${majorTopics}</ul>` : "<p>No major topics identified.</p>"}
      <h2>Key Content Items</h2>
      ${keyItems ? `<ul>${keyItems}</ul>` : "<p>No key items in this window.</p>"}
      <h2>Candidate Study Concepts</h2>
      ${studyConcepts ? `<ul>${studyConcepts}</ul>` : "<p>No candidate study concepts identified.</p>"}
      <h2>Source References</h2>
      ${buildSourceReferencesHtml(payload.sourceReferences)}
    `;
  }

  function buildOutputBlocks(output, run, warnings) {
    let html = `<p>${escapeHtml(output.summary)}</p>`;
    if (output.automationId === "weekly_tasks_overview") {
      html = buildWeeklyTasksHtml(output);
    } else if (output.automationId === "weekly_content_overview") {
      html = buildWeeklyContentHtml(output);
    } else if (output.automationId === "course_recap_seed") {
      html = buildStudySeedHtml(output);
    }

    const blocks = NotionBlocks.htmlToBlocks(`<h1>${escapeHtml(output.title)}</h1>${html}`, output.summary || output.title);
    blocks.push(buildMetadataBlock(output, run, warnings));
    return blocks;
  }

  async function writeOutputs(options) {
    const outputs = Array.isArray(options?.outputs) ? options.outputs : [];
    const run = options?.run;
    const notionState = options?.notionState || {};
    const accessToken = trimString(options?.accessToken || notionState.notionAuth?.accessToken || notionState.auth?.accessToken);
    const destination = notionState.notionDestination || notionState.destination || {};
    const parentPageId = trimString(destination.destinationPageId);
    if (!accessToken || !parentPageId) {
      const error = new Error("Notion token or destination is missing for automation writes.");
      error.code = "automation_blocked";
      throw error;
    }

    const mappings = NotionModels.createNotionMappings(await NotionStorage.getNotionMappings());
    const database = await resolveAutomationOutputsDatabase({
      parentPageId,
      accessToken,
      mappedId: mappings.workspace?.databases?.automationOutputs?.id
    });
    const nextMappings = NotionModels.createNotionMappings(mappings);
    nextMappings.workspace.databases.automationOutputs = database;

    const writtenOutputs = [];
    const warnings = [];
    const failures = [];
    const now = Models.nowIso();

    for (const rawOutput of outputs) {
      const output = Models.createAutomationOutput(rawOutput);
      try {
        const mapping = nextMappings.automationEntries[output.outputId] || {};
        const row = await upsertDatabasePage({
          databaseId: database.id,
          lookupProperty: "Output ID",
          lookupValue: output.outputId,
          properties: NotionEntities.buildAutomationOutputRowProperties(output, run, now),
          mapping,
          accessToken
        });
        const blocks = buildOutputBlocks(output, run, options?.warnings || []);
        const syncedBlockIds = await syncStandalonePageBlocks(row.pageId, blocks, mapping.syncedBlockIds || [], accessToken);
        nextMappings.automationEntries[output.outputId] = {
          pageId: row.pageId,
          lastSynced: now,
          lastStatus: "completed",
          syncedBlockIds,
          notionPageUrl: row.pageUrl || ""
        };
        writtenOutputs.push(
          Models.createAutomationOutput({
            ...output,
            notionPageId: row.pageId,
            notionDatabaseEntryId: row.pageId,
            notionPageUrl: row.pageUrl || "",
            updatedAt: now
          })
        );
      } catch (error) {
        failures.push(`${output.title}: ${error.message}`);
      }
    }

    await NotionStorage.setNotionMappings(nextMappings);
    warnings.push(...(options?.warnings || []));

    return {
      outputs: writtenOutputs,
      warnings: Array.from(new Set(warnings.filter(Boolean))),
      failures: Array.from(new Set(failures.filter(Boolean))),
      counts: {
        written: writtenOutputs.length,
        failed: failures.length
      }
    };
  }

  globalThis.CanvasAutomationWriter = {
    writeOutputs
  };
})();
