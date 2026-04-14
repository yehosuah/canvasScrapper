(function () {
  if (globalThis.CanvasNotionWorkspace) {
    return;
  }

  const Models = globalThis.CanvasNotionModels;
  const Api = globalThis.CanvasNotionApi;
  const Blocks = globalThis.CanvasNotionBlocks;
  const Entities = globalThis.CanvasNotionEntities;
  if (!Models || !Api || !Blocks || !Entities) {
    throw new Error("Canvas notion workspace modules require models, api, blocks, and entities.");
  }

  function trimString(value) {
    return Models.trimString(value);
  }

  function uniq(values) {
    return Array.from(new Set((values || []).filter(Boolean)));
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

  function buildHubSummaryBlocks(course, destination, mode) {
    const lines = [
      `Canvas URL: ${course.courseUrl}`,
      `Workspace mode: ${mode === "class_specific" ? "class_specific" : "general"}`,
      `Last synced: ${new Date().toISOString()}`
    ];
    if (course.term) {
      lines.splice(1, 0, `Term: ${course.term}`);
    }
    if (destination.destinationUrl || destination.destinationInput) {
      lines.push(`Parent workspace: ${destination.destinationUrl || destination.destinationInput}`);
    }
    return Blocks.htmlToBlocks("", lines.join("\n\n"));
  }

  async function listChildObjects(parentPageId, accessToken) {
    const children = await Api.listAllBlockChildren(parentPageId, accessToken);
    return {
      pages: children.filter((child) => child.type === "child_page"),
      databases: children.filter((child) => child.type === "child_database")
    };
  }

  function findChildDatabaseByTitle(childObjects, title) {
    return (childObjects.databases || []).find((item) => item.child_database?.title === title) || null;
  }

  function findChildPageByTitle(childObjects, title) {
    return (childObjects.pages || []).find((item) => item.child_page?.title === title) || null;
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
    if (!databaseId) {
      return null;
    }

    const existing = await Api.retrieveDatabase(databaseId, accessToken);
    const missingProperties = getMissingProperties(existing?.properties, schema);
    if (!Object.keys(missingProperties).length) {
      return existing;
    }

    return Api.updateDatabase(
      databaseId,
      {
        properties: missingProperties
      },
      accessToken
    );
  }

  async function resolveOrCreateDatabase(options) {
    const childObjects = options.childObjects || (await listChildObjects(options.parentPageId, options.accessToken));
    const mappedId = trimString(options.mappedId);
    if (mappedId) {
      await ensureDatabaseSchema(mappedId, options.schema, options.accessToken);
      return {
        id: mappedId,
        action: "mapped"
      };
    }

    const existing = findChildDatabaseByTitle(childObjects, options.title);
    if (existing?.id) {
      await ensureDatabaseSchema(existing.id, options.schema, options.accessToken);
      return {
        id: existing.id,
        action: "reused"
      };
    }

    const database = await Api.createDatabase(
      {
        parent: {
          type: "page_id",
          page_id: options.parentPageId
        },
        title: buildPlainTitle(options.title),
        properties: options.schema
      },
      options.accessToken
    );

    return {
      id: database.id,
      action: "created"
    };
  }

  async function resolveOrCreateChildPage(options) {
    const childObjects = options.childObjects || (await listChildObjects(options.parentPageId, options.accessToken));
    const mappedId = trimString(options.mappedId);
    if (mappedId) {
      return {
        id: mappedId,
        action: "mapped"
      };
    }

    const existing = findChildPageByTitle(childObjects, options.title);
    if (existing?.id) {
      return {
        id: existing.id,
        action: "reused"
      };
    }

    const page = await Api.createPage(
      {
        parent: {
          page_id: options.parentPageId
        },
        properties: {
          title: {
            title: buildPlainTitle(options.title)
          }
        }
      },
      options.accessToken
    );

    return {
      id: page.id,
      action: "created"
    };
  }

  async function archiveMappedBlocks(blockIds, accessToken) {
    for (const blockId of uniq(blockIds)) {
      try {
        await Api.archiveBlock(blockId, accessToken);
      } catch (error) {
        // Best effort. Old synced blocks can remain without breaking future writes.
      }
    }
  }

  async function appendBlocksAndCaptureIds(pageId, blocks, accessToken) {
    const appendedIds = [];
    for (const blockChunk of Blocks.chunkBlocks(blocks)) {
      if (!blockChunk.length) {
        continue;
      }
      const response = await Api.appendBlockChildren(pageId, blockChunk, accessToken);
      appendedIds.push(...(response?.results || []).map((item) => item.id).filter(Boolean));
    }
    return appendedIds;
  }

  async function syncStandalonePageBlocks(pageId, blocks, previousBlockIds, accessToken) {
    await archiveMappedBlocks(previousBlockIds, accessToken);
    return appendBlocksAndCaptureIds(pageId, blocks, accessToken);
  }

  function buildArtifactBlock(record, fileUploadId) {
    if (!fileUploadId) {
      return null;
    }

    const caption = record.fileName
      ? [
          {
            type: "text",
            text: {
              content: record.fileName
            }
          }
        ]
      : [];
    const blockType = /\.pdf$/i.test(record.fileName || "") ? "pdf" : "file";
    return {
      object: "block",
      type: blockType,
      [blockType]: {
        type: "file_upload",
        file_upload: {
          id: fileUploadId
        },
        caption
      }
    };
  }

  function buildContentBlocks(record, fileUploadId) {
    const provenanceBlocks = Blocks.buildProvenanceBlocks(record);
    const hasExtractedText = trimString(record.extractedText);
    const extractionSummaryText = hasExtractedText
      ? `Extraction: ${record.extractionStatus || "extracted"} · ${record.wordCount || 0} words · ${record.chunkCount || 0} chunks`
      : "";
    if (record.contentType === "file_artifact") {
      const fileBlock = buildArtifactBlock(record, fileUploadId);
      const noteText = fileUploadId
        ? `Artifact attached from ${record.sourceCanvasUrl || record.sourcePageUrl}.`
        : `Artifact not attached yet. Source: ${record.sourceCanvasUrl || record.sourcePageUrl}.`;
      const extractionBlocks = hasExtractedText
        ? Blocks.htmlToBlocks(
            `<h2>Extracted Content</h2><p>${extractionSummaryText}</p>${record.extractedHtml || ""}`,
            `${extractionSummaryText}\n\n${record.extractedText || ""}`
          )
        : [];
      return [...provenanceBlocks, ...(fileBlock ? [fileBlock] : []), ...Blocks.htmlToBlocks("", noteText), ...extractionBlocks];
    }

    if (record.contentType === "external_resource") {
      return [
        ...provenanceBlocks,
        ...Blocks.htmlToBlocks("", `External resource: ${record.externalUrl || record.sourceCanvasUrl || record.sourcePageUrl}`)
      ];
    }

    if (hasExtractedText) {
      return [
        ...provenanceBlocks,
        ...Blocks.htmlToBlocks(
          `<h2>Extracted Content</h2><p>${extractionSummaryText}</p>${record.extractedHtml || ""}`,
          `${extractionSummaryText}\n\n${record.extractedText || ""}`
        )
      ];
    }

    return [...provenanceBlocks, ...Blocks.htmlToBlocks(record.bodyHtml, record.bodyText || record.excerpt)];
  }

  async function tryAttachArtifact(record, mapping, accessToken) {
    const sourceUrl = trimString(record.sourceCanvasUrl || record.sourcePageUrl);
    if (!record.isDownloadable || !sourceUrl) {
      return {
        processingStatus: "extraction_pending",
        fileUploadId: mapping?.fileUploadId || null,
        warning: "Artifact source is not directly downloadable in current extension flow."
      };
    }

    if (trimString(mapping?.fileUploadId) && trimString(mapping?.artifactSourceUrl) === sourceUrl) {
      return {
        processingStatus: "artifact_attached",
        fileUploadId: mapping.fileUploadId,
        skipped: true
      };
    }

    try {
      const fetched = await Api.fetchFileAsBlob(sourceUrl, {
        credentials: "include"
      });
      const upload = await Api.uploadFileBlob(fetched.blob, {
        filename: record.fileName || "canvas-artifact",
        contentType: fetched.contentType,
        accessToken
      });

      return {
        processingStatus: "artifact_attached",
        fileUploadId: upload.id
      };
    } catch (error) {
      const fallbackStatus =
        error.code === "file_too_large" || /direct-upload limit|Missing file blob/i.test(error.message)
          ? "extraction_pending"
          : "failed";
      return {
        processingStatus: fallbackStatus,
        fileUploadId: mapping?.fileUploadId || null,
        warning: error.message
      };
    }
  }

  async function queryByRichText(databaseId, propertyName, value, accessToken) {
    if (!trimString(value)) {
      return null;
    }

    const response = await Api.queryDatabase(
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
    const accessToken = options.accessToken;
    const mappedId = trimString(options.mapping?.pageId);
    if (mappedId) {
      await Api.updatePage(mappedId, { properties: options.properties }, accessToken);
      return {
        pageId: mappedId,
        action: "updated"
      };
    }

    const existing = await queryByRichText(options.databaseId, options.lookupProperty, options.lookupValue, accessToken);
    if (existing?.id) {
      await Api.updatePage(existing.id, { properties: options.properties }, accessToken);
      return {
        pageId: existing.id,
        action: "updated"
      };
    }

    const created = await Api.createPage(
      {
        parent: {
          database_id: options.databaseId
        },
        properties: options.properties
      },
      accessToken
    );

    return {
      pageId: created.id,
      action: "created"
    };
  }

  async function resolveWorkspaceStructure(options) {
    const destination = options.destination;
    const mappings = Models.createNotionMappings(options.mappings);
    const childObjects = await listChildObjects(destination.destinationPageId, options.accessToken);
    const workspace = {
      destinationPageId: destination.destinationPageId,
      workspaceMode: destination.workspaceMode,
      databases: {
        courses: null,
        content: null,
        deliverables: null,
        studyAssets: null,
        automationOutputs: mappings.workspace?.databases?.automationOutputs || null
      },
      courseHubs: {
        ...(mappings.workspace?.courseHubs || {})
      },
      updatedAt: Models.nowIso()
    };

    if (destination.workspaceMode === "general") {
      workspace.databases.courses = await resolveOrCreateDatabase({
        parentPageId: destination.destinationPageId,
        childObjects,
        title: "Courses",
        schema: Entities.buildCoursesDatabaseSchema(),
        mappedId: mappings.workspace?.databases?.courses?.id,
        accessToken: options.accessToken
      });
    }

    workspace.databases.content = await resolveOrCreateDatabase({
      parentPageId: destination.destinationPageId,
      childObjects,
      title: "Content",
      schema: Entities.buildContentDatabaseSchema(),
      mappedId: mappings.workspace?.databases?.content?.id,
      accessToken: options.accessToken
    });
    workspace.databases.deliverables = await resolveOrCreateDatabase({
      parentPageId: destination.destinationPageId,
      childObjects,
      title: "Deliverables",
      schema: Entities.buildDeliverablesDatabaseSchema(),
      mappedId: mappings.workspace?.databases?.deliverables?.id,
      accessToken: options.accessToken
    });
    workspace.databases.studyAssets = await resolveOrCreateDatabase({
      parentPageId: destination.destinationPageId,
      childObjects,
      title: "Study Assets",
      schema: Entities.buildStudyAssetsDatabaseSchema(),
      mappedId: mappings.workspace?.databases?.studyAssets?.id,
      accessToken: options.accessToken
    });

    return workspace;
  }

  async function executeWorkspaceSync(options) {
    const accessToken = options.accessToken;
    const destination = options.destination;
    const workspacePlan = options.workspacePlan || {};
    const manifest = options.manifest || {};
    const mappings = Models.createNotionMappings(options.mappings);
    const contentInventory = Array.isArray(manifest.contentInventory) ? manifest.contentInventory : [];
    const contentById = new Map(contentInventory.map((record) => [record.contentObjectId, record]));
    const courses = Array.isArray(manifest.courses) ? manifest.courses : [];
    const selectedCourseIds = new Set((workspacePlan.coursePlans || []).map((item) => item.relatedCourseId).filter(Boolean));
    const selectedCourses = selectedCourseIds.size
      ? courses.filter((course) => selectedCourseIds.has(course.courseId))
      : destination.workspaceMode === "class_specific" && destination.targetCourseId
        ? courses.filter((course) => course.courseId === destination.targetCourseId)
        : courses;
    const now = Models.nowIso();
    const nextMappings = Models.createNotionMappings(mappings);
    const warnings = [];
    const failures = [];
    const counts = {
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      artifactAttached: 0
    };
    const syncedContentObjectIds = [];
    const failedContentObjectIds = [];

    const workspace = await resolveWorkspaceStructure({
      destination,
      mappings: nextMappings,
      accessToken
    });
    nextMappings.workspace = workspace;

    const childObjects = destination.workspaceMode === "general"
      ? await listChildObjects(destination.destinationPageId, accessToken)
      : { pages: [], databases: [] };

    for (const course of selectedCourses) {
      try {
        let courseHubId = destination.destinationPageId;
        let hubBlockIds = nextMappings.workspace.courseHubs?.[course.courseId]?.syncedBlockIds || [];
        if (destination.workspaceMode === "general") {
          const hub = await resolveOrCreateChildPage({
            parentPageId: destination.destinationPageId,
            childObjects,
            title: `${course.courseName} Hub`,
            mappedId: nextMappings.workspace.courseHubs?.[course.courseId]?.pageId,
            accessToken
          });
          courseHubId = hub.id;
          if (hub.action === "created") {
            counts.created += 1;
          }

          const hubBlocks = buildHubSummaryBlocks(course, destination, destination.workspaceMode);
          hubBlockIds = await syncStandalonePageBlocks(courseHubId, hubBlocks, hubBlockIds, accessToken);
          nextMappings.workspace.courseHubs[course.courseId] = {
            pageId: courseHubId,
            syncedBlockIds: hubBlockIds,
            lastSynced: now
          };
        }

        if (destination.workspaceMode === "general" && workspace.databases.courses?.id) {
          const courseMapping = nextMappings.courseEntries[course.courseId] || {};
          const row = await upsertDatabasePage({
            databaseId: workspace.databases.courses.id,
            lookupProperty: "Canvas Course ID",
            lookupValue: course.courseId,
            properties: Entities.buildCourseRowProperties(
              course,
              destination.workspaceMode,
              "completed",
              now,
              courseHubId
            ),
            mapping: courseMapping,
            accessToken
          });
          counts[row.action] += 1;
          nextMappings.courseEntries[course.courseId] = {
            pageId: row.pageId,
            lastSynced: now,
            lastStatus: "completed"
          };
        }
      } catch (error) {
        counts.failed += 1;
        failures.push(`Course ${course.courseName}: ${error.message}`);
      }
    }

    for (const contentPlan of workspacePlan.contentPlans || []) {
      const record = contentById.get(contentPlan.contentObjectId);
      if (!record) {
        counts.failed += 1;
        failures.push(`Missing content inventory for ${contentPlan.contentObjectId}.`);
        continue;
      }

      try {
        const mapping = nextMappings.contentEntries[record.contentObjectId] || {};
        const hashKey = trimString(
          [
            record.contentHash || record.sourceCanvasUrl || record.sourcePageUrl,
            record.extractionStatus || "not_started",
            record.enrichmentStatus || "not_started",
            record.chunkCount || 0,
            trimString(record.extractedText) ? "has_text" : "no_text",
            trimString(record.extractionMethod) || "no_method"
          ].join("|")
        );
        if (
          trimString(mapping.pageId) &&
          trimString(mapping.contentHash) === hashKey &&
          mapping.lastStatus === "artifact_attached" &&
          record.contentType === "file_artifact"
        ) {
          counts.skipped += 1;
          continue;
        }
        if (
          trimString(mapping.pageId) &&
          trimString(mapping.contentHash) === hashKey &&
          ["notion_created", "notion_updated"].includes(mapping.lastStatus) &&
          record.contentType !== "file_artifact"
        ) {
          counts.skipped += 1;
          continue;
        }

        let processingStatus = "notion_created";
        let fileUploadId = mapping.fileUploadId || null;
        if (record.contentType === "file_artifact") {
          const attachment = await tryAttachArtifact(record, mapping, accessToken);
          processingStatus = attachment.processingStatus;
          fileUploadId = attachment.fileUploadId;
          if (attachment.warning) {
            warnings.push(`${record.fileName || record.sourcePageTitle}: ${attachment.warning}`);
          }
          if (processingStatus === "artifact_attached") {
            counts.artifactAttached += attachment.skipped ? 0 : 1;
          }
        } else if (record.contentPathType === "direct_ingest") {
          processingStatus = trimString(record.extractedText)
            ? "notion_enriched"
            : mapping.pageId
              ? "notion_updated"
              : "notion_created";
        } else if (record.contentType === "external_resource") {
          processingStatus = mapping.pageId ? "notion_updated" : "notion_created";
        } else {
          processingStatus = "planned";
        }

        if (record.contentType === "file_artifact" && trimString(record.extractedText)) {
          processingStatus = "notion_enriched";
        }

        const row = await upsertDatabasePage({
          databaseId: workspace.databases.content.id,
          lookupProperty: "Content Object ID",
          lookupValue: record.contentObjectId,
          properties: Entities.buildContentRowProperties(record, processingStatus, now),
          mapping,
          accessToken
        });
        counts[row.action] += 1;

        const contentBlocks = buildContentBlocks(record, fileUploadId);
        const syncedBlockIds = await syncStandalonePageBlocks(row.pageId, contentBlocks, mapping.syncedBlockIds || [], accessToken);
        nextMappings.contentEntries[record.contentObjectId] = {
          pageId: row.pageId,
          lastSynced: now,
          lastStatus: processingStatus,
          contentHash: hashKey,
          fileUploadId: fileUploadId || null,
          artifactSourceUrl: record.sourceCanvasUrl || record.sourcePageUrl || "",
          syncedBlockIds
        };
        syncedContentObjectIds.push(record.contentObjectId);
      } catch (error) {
        counts.failed += 1;
        failures.push(`${record.sourcePageTitle || record.fileName || record.contentObjectId}: ${error.message}`);
        failedContentObjectIds.push(record.contentObjectId);
        nextMappings.contentEntries[record.contentObjectId] = {
          ...(nextMappings.contentEntries[record.contentObjectId] || {}),
          lastSynced: now,
          lastStatus: "failed",
          lastError: error.message
        };
      }
    }

    for (const deliverablePlan of workspacePlan.deliverablePlans || []) {
      const record = contentById.get(deliverablePlan.contentObjectId);
      if (!record) {
        continue;
      }

      try {
        const mapping = nextMappings.deliverableEntries[record.contentObjectId] || {};
        const row = await upsertDatabasePage({
          databaseId: workspace.databases.deliverables.id,
          lookupProperty: "Content Object ID",
          lookupValue: record.contentObjectId,
          properties: Entities.buildDeliverableRowProperties(
            record,
            mapping.pageId ? "notion_updated" : "notion_created",
            now
          ),
          mapping,
          accessToken
        });
        counts[row.action] += 1;
        nextMappings.deliverableEntries[record.contentObjectId] = {
          pageId: row.pageId,
          lastSynced: now,
          lastStatus: row.action === "created" ? "notion_created" : "notion_updated"
        };
      } catch (error) {
        counts.failed += 1;
        failures.push(`Deliverable ${record.sourcePageTitle || record.contentObjectId}: ${error.message}`);
      }
    }

    return {
      mappings: nextMappings,
      warnings: uniq(warnings),
      failures: uniq(failures),
      counts,
      failedContentObjectIds: uniq(failedContentObjectIds),
      syncedContentObjectIds: uniq(syncedContentObjectIds)
    };
  }

  globalThis.CanvasNotionWorkspace = {
    executeWorkspaceSync,
    listChildObjects,
    resolveWorkspaceStructure
  };
})();
