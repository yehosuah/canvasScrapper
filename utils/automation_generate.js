(function () {
  if (globalThis.CanvasAutomationGenerate) {
    return;
  }

  const Models = globalThis.CanvasAutomationModels;
  const LlmAdapter = globalThis.CanvasAutomationLlmAdapter;
  if (!Models || !LlmAdapter) {
    throw new Error("CanvasAutomationModels and CanvasAutomationLlmAdapter must load before CanvasAutomationGenerate.");
  }

  const STOPWORDS = new Set([
    "and",
    "are",
    "for",
    "from",
    "into",
    "that",
    "this",
    "with",
    "your",
    "week",
    "module",
    "page",
    "pages",
    "assignment",
    "assignments",
    "content",
    "course",
    "class",
    "canvas",
    "file",
    "files",
    "source",
    "section",
    "synced",
    "extract",
    "extracted",
    "overview",
    "recap"
  ]);

  function formatDate(rawValue) {
    const date = Models.parseInputDate(rawValue);
    if (!date) {
      return "Unknown date";
    }
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric"
    });
  }

  function normalizeCourseName(item) {
    return Models.trimString(item?.courseName) || Models.trimString(item?.courseId) || "Unassigned Course";
  }

  function groupByCourse(items) {
    const grouped = new Map();
    for (const item of items || []) {
      const courseId = Models.trimString(item.courseId) || `course:${normalizeCourseName(item)}`;
      if (!grouped.has(courseId)) {
        grouped.set(courseId, {
          courseId: Models.trimString(item.courseId) || null,
          courseName: normalizeCourseName(item),
          items: []
        });
      }
      grouped.get(courseId).items.push(item);
    }
    return Array.from(grouped.values()).sort((left, right) => left.courseName.localeCompare(right.courseName));
  }

  function summarizeContentType(contentType) {
    return String(contentType || "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function buildSourceRef(item) {
    return {
      sourceId: item.contentObjectId || item.inputId,
      title: item.title,
      courseId: item.courseId || null,
      courseName: normalizeCourseName(item),
      contentType: item.contentType || item.sourceKind,
      notionPageId: item.notionPageId || null,
      notionPageUrl: item.notionPageUrl || "",
      sourceUrl: item.sourceUrl || "",
      canvasUrl: item.canvasUrl || "",
      dueDate: item.dueDate || "",
      discoveredAt: item.discoveredAt || ""
    };
  }

  function buildSnippet(item) {
    return Models.trimString(item.textSnippet || item.extractedText || item.sourcePageTitle || item.title)
      .replace(/\s+/g, " ")
      .slice(0, 240);
  }

  function titleSegments(text) {
    return String(text || "")
      .split(/[|:;\/\\-]+/)
      .map((segment) => Models.trimString(segment))
      .filter((segment) => segment.length >= 4);
  }

  function normalizePhrase(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isUsefulPhrase(text) {
    const normalized = normalizePhrase(text);
    if (!normalized || normalized.length < 4) {
      return false;
    }
    if (STOPWORDS.has(normalized)) {
      return false;
    }
    if (/^\d+$/.test(normalized)) {
      return false;
    }
    return true;
  }

  function collectRankedPhrases(items) {
    const counts = new Map();
    const labels = new Map();

    function addPhrase(text, weight) {
      if (!isUsefulPhrase(text)) {
        return;
      }
      const normalized = normalizePhrase(text);
      counts.set(normalized, (counts.get(normalized) || 0) + weight);
      if (!labels.has(normalized) || String(labels.get(normalized)).length < String(text).length) {
        labels.set(normalized, Models.trimString(text));
      }
    }

    for (const item of items || []) {
      titleSegments(item.title).forEach((segment) => addPhrase(segment, 3));
      titleSegments(item.weekOrModule).forEach((segment) => addPhrase(segment, 2));
      for (const heading of item.headings || []) {
        addPhrase(heading, 4);
      }
      titleSegments(buildSnippet(item)).forEach((segment) => addPhrase(segment, 1));
    }

    return Array.from(counts.entries())
      .sort((left, right) => {
        if (right[1] !== left[1]) {
          return right[1] - left[1];
        }
        return String(labels.get(left[0]) || left[0]).localeCompare(String(labels.get(right[0]) || right[0]));
      })
      .map(([key, score]) => ({
        phrase: labels.get(key) || key,
        normalized: key,
        score
      }));
  }

  function collectRankedTokens(items) {
    const counts = new Map();
    for (const item of items || []) {
      const combined = [item.title, ...(item.headings || []), buildSnippet(item)].join(" ");
      const tokens = normalizePhrase(combined)
        .split(/\s+/)
        .filter((token) => token.length >= 4 && !STOPWORDS.has(token));
      for (const token of tokens) {
        counts.set(token, (counts.get(token) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((left, right) => {
        if (right[1] !== left[1]) {
          return right[1] - left[1];
        }
        return left[0].localeCompare(right[0]);
      })
      .map(([token, score]) => ({
        token,
        label: token.replace(/\b\w/g, (char) => char.toUpperCase()),
        score
      }));
  }

  function buildBulletForContent(item) {
    const prefix = `${item.title} (${summarizeContentType(item.contentType)})`;
    const snippet = buildSnippet(item);
    return snippet && snippet !== item.title ? `${prefix} - ${snippet}` : prefix;
  }

  function buildTitle(definition, run, suffix) {
    const windowLabel = Models.formatDateRangeLabel(run.windowStart, run.windowEnd);
    return `${definition.name} · ${suffix || windowLabel}`;
  }

  function createOutput(run, definition, rawOutput) {
    return Models.createAutomationOutput({
      runId: run.runId,
      automationId: definition.automationId,
      targetScope: rawOutput.targetScope || run.targetScope,
      windowStart: run.windowStart,
      windowEnd: run.windowEnd,
      createdAt: Models.nowIso(),
      updatedAt: Models.nowIso(),
      ...rawOutput
    });
  }

  function generateWeeklyTasksOverview(run, definition, collected) {
    const now = Date.now();
    const urgentItems = collected.tasks.filter((task) => {
      const dueDate = Models.parseInputDate(task.dueDate);
      if (!dueDate) {
        return false;
      }
      const delta = dueDate.getTime() - now;
      return delta <= 2 * 24 * 60 * 60 * 1000;
    });
    const groupedByCourse = groupByCourse(collected.tasks).map((group) => ({
      courseId: group.courseId,
      courseName: group.courseName,
      items: group.items.map((item) => ({
        ...buildSourceRef(item),
        dueDate: item.dueDate,
        processingStatus: item.processingStatus
      }))
    }));
    const metadataGaps = (collected.taskMetadataGaps || []).map((item) => ({
      ...buildSourceRef(item),
      note: "Missing due date"
    }));
    const sourceReferences = [...urgentItems, ...collected.tasks, ...(collected.taskMetadataGaps || [])]
      .map((item) => buildSourceRef(item))
      .slice(0, 80);
    const relatedCourseIds = Models.uniqStrings(
      [...collected.tasks, ...(collected.taskMetadataGaps || [])].map((item) => item.courseId)
    );

    return [
      createOutput(run, definition, {
        outputId: Models.buildOutputId(run.runId, "workspace"),
        artifactType: "overview",
        relatedCourseIds,
        courseNames: groupByCourse([...collected.tasks, ...(collected.taskMetadataGaps || [])]).map((group) => group.courseName),
        title: buildTitle(definition, run),
        summary: `${urgentItems.length} urgent items, ${collected.tasks.length} due this window, ${metadataGaps.length} missing due dates.`,
        sourceCount: collected.tasks.length + metadataGaps.length,
        structuredPayload: {
          counts: {
            urgentItems: urgentItems.length,
            dueThisWeek: collected.tasks.length,
            metadataGaps: metadataGaps.length,
            groupedCourses: groupedByCourse.length
          },
          urgentItems: urgentItems.map((item) => ({
            ...buildSourceRef(item),
            dueDate: item.dueDate
          })),
          groupedByCourse,
          metadataGaps,
          sourceReferences
        },
        artifacts: [
          {
            outputId: Models.buildOutputId(run.runId, "workspace"),
            artifactType: "overview",
            content: "Weekly deterministic task digest.",
            metadata: {
              taskCount: collected.tasks.length,
              metadataGapCount: metadataGaps.length
            }
          }
        ]
      })
    ];
  }

  function generateWeeklyContentOverview(run, definition, collected) {
    const grouped = groupByCourse(collected.content).map((group) => {
      const countsByType = {};
      for (const item of group.items) {
        const key = item.contentType || "unknown";
        countsByType[key] = (countsByType[key] || 0) + 1;
      }
      const rankedPhrases = collectRankedPhrases(group.items).slice(0, 6).map((item) => item.phrase);
      return {
        courseId: group.courseId,
        courseName: group.courseName,
        countsByType,
        recapBullets: group.items.slice(0, 8).map((item) => buildBulletForContent(item)),
        candidateTopics: rankedPhrases,
        items: group.items.map((item) => ({
          ...buildSourceRef(item),
          snippet: buildSnippet(item),
          headings: (item.headings || []).slice(0, 6)
        }))
      };
    });
    const relatedCourseIds = Models.uniqStrings(grouped.map((group) => group.courseId));
    const outputs = [
      createOutput(run, definition, {
        outputId: Models.buildOutputId(run.runId, "workspace"),
        artifactType: "overview",
        relatedCourseIds,
        courseNames: grouped.map((group) => group.courseName),
        title: buildTitle(definition, run),
        summary: `${collected.content.length} content items across ${grouped.length} courses in this window.`,
        sourceCount: collected.content.length,
        structuredPayload: {
          counts: {
            courses: grouped.length,
            contentItems: collected.content.length
          },
          groupedByCourse: grouped,
          sourceReferences: collected.content.slice(0, 100).map((item) => buildSourceRef(item))
        },
        artifacts: [
          {
            outputId: Models.buildOutputId(run.runId, "workspace"),
            artifactType: "overview",
            content: "Weekly deterministic content overview.",
            metadata: {
              courseCount: grouped.length,
              contentCount: collected.content.length
            }
          }
        ]
      })
    ];

    for (const group of grouped) {
      outputs.push(
        createOutput(run, definition, {
          outputId: Models.buildOutputId(run.runId, `course:${group.courseId || group.courseName}`),
          artifactType: "recap",
          courseId: group.courseId,
          relatedCourseIds: group.courseId ? [group.courseId] : [],
          courseNames: [group.courseName],
          title: buildTitle(definition, run, group.courseName),
          summary: `${group.items.length} content items summarized for ${group.courseName}.`,
          sourceCount: group.items.length,
          structuredPayload: {
            counts: {
              contentItems: group.items.length
            },
            courseName: group.courseName,
            recapBullets: group.recapBullets,
            candidateTopics: group.candidateTopics,
            keyItems: group.items.slice(0, 12),
            sourceReferences: group.items.slice(0, 24)
          },
          artifacts: [
            {
              outputId: Models.buildOutputId(run.runId, `course:${group.courseId || group.courseName}`),
              artifactType: "recap",
              content: `Per-course recap for ${group.courseName}.`,
              metadata: {
                courseId: group.courseId,
                contentCount: group.items.length
              }
            }
          ]
        })
      );
    }

    return outputs;
  }

  function generateCourseRecapSeed(run, definition, collected) {
    const courseItems = groupByCourse(collected.content)[0] || {
      courseId: run.targetCourseIds[0] || null,
      courseName: run.targetCourseIds[0] || "Selected Course",
      items: []
    };
    const rankedPhrases = collectRankedPhrases(courseItems.items).slice(0, 8).map((item) => item.phrase);
    const rankedTokens = collectRankedTokens(courseItems.items)
      .filter((item) => !rankedPhrases.some((phrase) => normalizePhrase(phrase).includes(item.token)))
      .slice(0, 10)
      .map((item) => item.label);
    const keyItems = courseItems.items.slice(0, 15).map((item) => ({
      ...buildSourceRef(item),
      snippet: buildSnippet(item),
      headings: (item.headings || []).slice(0, 5)
    }));

    return [
      createOutput(run, definition, {
        outputId: Models.buildOutputId(run.runId, courseItems.courseId || "course"),
        artifactType: "study_seed",
        courseId: courseItems.courseId,
        relatedCourseIds: courseItems.courseId ? [courseItems.courseId] : [],
        courseNames: [courseItems.courseName],
        title: buildTitle(definition, run, courseItems.courseName),
        summary: `${rankedPhrases.length} major themes and ${rankedTokens.length} candidate study concepts from ${courseItems.items.length} items.`,
        sourceCount: courseItems.items.length,
        structuredPayload: {
          courseName: courseItems.courseName,
          majorTopics: rankedPhrases,
          keyItems,
          candidateStudyConcepts: rankedTokens,
          sourceReferences: keyItems.map((item) => buildSourceRef(item))
        },
        artifacts: [
          {
            outputId: Models.buildOutputId(run.runId, courseItems.courseId || "course"),
            artifactType: "study_seed",
            content: `Structured deterministic study seed for ${courseItems.courseName}.`,
            metadata: {
              courseId: courseItems.courseId,
              contentCount: courseItems.items.length
            }
          }
        ]
      })
    ];
  }

  async function generateOutputs(options) {
    const definition = options?.definition;
    const run = options?.run;
    const collected = options?.collected || {};
    let outputs = [];

    if (definition?.automationId === "weekly_tasks_overview") {
      outputs = generateWeeklyTasksOverview(run, definition, collected);
    } else if (definition?.automationId === "weekly_content_overview") {
      outputs = generateWeeklyContentOverview(run, definition, collected);
    } else if (definition?.automationId === "course_recap_seed") {
      outputs = generateCourseRecapSeed(run, definition, collected);
    }

    const enhanced = await LlmAdapter.enhanceOutputs({
      definition,
      run,
      collected,
      outputs
    });

    return {
      outputs: Array.isArray(enhanced?.outputs) ? enhanced.outputs.map((output) => Models.createAutomationOutput(output)) : outputs,
      warnings: enhanced?.used ? ["LLM enhancement enabled."] : []
    };
  }

  globalThis.CanvasAutomationGenerate = {
    generateOutputs
  };
})();
