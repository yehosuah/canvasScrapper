export type PageMode = "single_course" | "dashboard" | "unsupported";

export type SourceSection =
  | "modules"
  | "pages"
  | "assignments"
  | "files"
  | "syllabus"
  | "home";

export type CourseRecord = {
  courseId: string;
  courseName: string;
  courseUrl: string;
  term?: string;
  origin?: string;
  discoveredAt: string;
};

export type DocumentRecord = {
  id: string;
  courseId: string;
  courseName: string;
  sourceSection: SourceSection;
  sourcePageTitle?: string;
  sourcePageUrl: string;
  linkText?: string;
  fileName?: string;
  inferredExtension?: string;
  url: string;
  canonicalUrl?: string;
  canvasFileId?: string;
  isCanvasHosted: boolean;
  isDownloadable: boolean;
  isExternal: boolean;
  mimeGuess?: string;
  folderHint?: string;
  localDownloadPath?: string;
  discoveredAt: string;
  seenInSections?: SourceSection[];
  sourcePageUrls?: string[];
};

export type SyncRecord = {
  documentId: string;
  exported: boolean;
  notionReady: boolean;
  notionPageId?: string | null;
  notionFileUploadId?: string | null;
  lastSyncAttempt?: string | null;
  lastSyncStatus?: string | null;
};

export type ContentItemRecord = {
  id: string;
  contentType: "canvas_page" | "assignment" | "syllabus" | "module_resource" | "external_resource";
  courseId: string;
  courseName: string;
  sourceSection: SourceSection;
  sourcePageTitle?: string;
  sourcePageUrl: string;
  sourceCanvasUrl: string;
  bodyHtml?: string;
  bodyText?: string;
  excerpt?: string;
  contentHash?: string;
  weekOrModule?: string;
  dueDate?: string | null;
  externalUrl?: string;
  isExternal: boolean;
  discoveredAt: string;
};

export type ScanStats = {
  coursesScanned: number;
  pagesVisited: number;
  downloadableCount: number;
  externalCount: number;
  ignoredCount: number;
};

export type CourseScanProgress = {
  courseId: string;
  courseName: string;
  term?: string;
  status: "queued" | "scanning" | "complete" | "error";
  message: string;
  pagesVisited: number;
  documentCount: number;
  duplicateCountRemoved: number;
  downloadableCount: number;
  externalCount: number;
  ignoredCount: number;
  errors: string[];
  startedAt?: string | null;
  completedAt?: string | null;
  updatedAt?: string | null;
};

export type ScanQueueState = {
  requestedCourseIds: string[];
  totalCourses: number;
  completedCourses: number;
  failedCourses: number;
  activeCourseId?: string | null;
};

export type ExtractionSummary = {
  total: number;
  extracted: number;
  pending: number;
  failed: number;
  unsupported: number;
  chunked: number;
  notionEnriched: number;
  automationReady: number;
  latestMessage: string;
};

export type ScanState = {
  status: "idle" | "scanning" | "complete" | "error";
  message: string;
  isScanning: boolean;
  pageMode: PageMode;
  currentCourseId?: string | null;
  queue: ScanQueueState;
  courses: CourseRecord[];
  courseOrder: string[];
  courseProgress: Record<string, CourseScanProgress>;
  documents: DocumentRecord[];
  contentItems: ContentItemRecord[];
  results: DocumentRecord[];
  syncRecords: SyncRecord[];
  duplicateCountRemoved: number;
  stats: ScanStats;
  errors: string[];
  updatedAt?: string | null;
  lastScanAt?: string | null;
  downloadSummary?: {
    attempted: number;
    started: number;
    skipped: string[];
    courseId?: string | null;
  } | null;
  extractionSummary?: ExtractionSummary;
};

export type NotionJobStatus =
  | "idle"
  | "planned"
  | "validating"
  | "ready"
  | "blocked"
  | "syncing"
  | "partially_completed"
  | "completed"
  | "failed";

export type NotionValidationStatus = "ok" | "warning" | "blocked";

export type NotionWorkspaceMode = "general" | "class_specific";

export type NotionDestination = {
  destinationUrl: string;
  destinationPageId: string;
  workspaceMode: NotionWorkspaceMode;
  targetCourseId?: string;
  label: string;
  validatedLocally: boolean;
  remoteValidationState: "not_started" | "pending" | "validated" | "failed";
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type NotionAuth = {
  authType: "manual_token";
  accessToken: string;
  tokenPreview: string;
  hasToken: boolean;
  botId: string;
  botName: string;
  workspaceName: string;
  workspaceId: string;
  status: "disconnected" | "connected" | "invalid";
  connectedAt?: string | null;
  updatedAt?: string | null;
  lastValidatedAt?: string | null;
  lastError?: string;
};

export type ContentPathType = "direct_ingest" | "file_artifact" | "hybrid" | "unknown";

export type ContentReadinessState =
  | "discovered"
  | "downloaded"
  | "extraction_pending"
  | "extracted"
  | "chunked"
  | "notion_enriched"
  | "automation_ready"
  | "unsupported_for_extraction"
  | "blocked";

export type ExtractionProcessingState =
  | "discovered"
  | "downloaded"
  | "extraction_pending"
  | "extracted"
  | "extraction_failed"
  | "unsupported_for_extraction"
  | "chunked"
  | "notion_enriched"
  | "automation_ready"
  | "blocked";

export type ExtractionStatus =
  | "not_started"
  | "pending"
  | "extracted"
  | "failed"
  | "unsupported"
  | "not_applicable";

export type NormalizationStatus = "not_started" | "normalized" | "failed" | "not_applicable";

export type EnrichmentStatus = "not_started" | "pending" | "notion_enriched" | "failed" | "not_applicable";

export type ContentChunkRecord = {
  chunkId: string;
  chunkIndex: number;
  chunkText: string;
  tokenEstimate: number;
  headingContext: string;
  contentObjectId: string;
  sourceDocumentId?: string | null;
  courseId: string;
  courseName: string;
  contentType: string;
  sourceCanvasUrl: string;
  sourcePageTitle: string;
  extractionVersion: string;
};

export type ExtractionRecord = {
  contentObjectId: string;
  processingState: ExtractionProcessingState;
  extractionStatus: ExtractionStatus;
  normalizationStatus: NormalizationStatus;
  enrichmentStatus: EnrichmentStatus;
  extractionMethod: string;
  extractionVersion: string;
  extractedText: string;
  extractedHtml: string;
  extractedAt?: string | null;
  downloadedAt?: string | null;
  lastAttemptAt?: string | null;
  wordCount: number;
  charCount: number;
  headingCount: number;
  chunkCount: number;
  chunkIds: string[];
  normalizationSummary?: Record<string, unknown> | null;
  unsupportedReason?: string;
  failureReason?: string;
  lastEnrichedAt?: string | null;
  automationReady: boolean;
  updatedAt: string;
};

export type ExtractionJob = {
  jobId: string;
  contentObjectId: string;
  sourceCategory: string;
  trigger: string;
  status: "queued" | "processing" | "completed" | "failed" | "unsupported";
  attempts: number;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
};

export type ExtractionState = {
  version: number;
  queue: ExtractionJob[];
  jobHistory: ExtractionJob[];
  recordsByContentId: Record<string, ExtractionRecord>;
  chunksByContentId: Record<string, ContentChunkRecord[]>;
  latestEnrichmentResult?: {
    finishedAt?: string;
    syncedCount?: number;
    failedCount?: number;
    summary?: string;
  } | null;
  updatedAt: string;
};

export type ContentObjectType =
  | "course"
  | "canvas_page"
  | "assignment"
  | "syllabus"
  | "module_resource"
  | "external_resource"
  | "file_artifact"
  | "text_extract"
  | "deliverable"
  | "study_asset_container";

export type NotionParentTarget = {
  parentType: string;
  targetId?: string | null;
  targetLabel?: string | null;
  targetUrl?: string | null;
  plannedObjectKey?: string | null;
};

export type NotionPlanProperty = {
  name: string;
  type: string;
  purpose: string;
};

export type NotionPlanObject = {
  planObjectId: string;
  planType: string;
  objectType: string;
  title: string;
  name: string;
  parentTarget: NotionParentTarget;
  plannedProperties: NotionPlanProperty[];
  plannedContentLocation?: string;
  relatedCourseId?: string | null;
  metadataOnly: boolean;
  holdsActualContent: boolean;
  futureAutomationOutput: boolean;
  contentObjectId?: string;
  contentType?: ContentObjectType;
  sourceType?: string;
  sourceCanvasUrl?: string;
  sourceSection?: string;
  sourcePageTitle?: string;
  discoveredAt?: string;
  contentPathType?: ContentPathType;
  extractionStatus?: ExtractionStatus;
  processingState?: ExtractionProcessingState;
  supportedExtraction?: boolean;
  contentReadinessState?: ContentReadinessState;
  enrichmentStatus?: EnrichmentStatus;
  chunkCount?: number;
  automationReady?: boolean;
  automationEligibility?: string[];
  dueDate?: string | null;
  dueDateAvailability?: boolean;
};

export type NotionPlannerSummary = {
  generatedAt?: string | null;
  destinationLabel: string;
  workspaceMode: NotionWorkspaceMode;
  plannedTopLevelObjects: number;
  plannedCourseHubs: number;
  plannedContentEntries: number;
  plannedDeliverables: number;
  plannedStudyAssetContainers: number;
  directIngestCandidates: number;
  fileArtifactCandidates: number;
  extractionPendingItems: number;
  automationEligibleRecords: number;
  automationReadyNow: number;
  warnings: string[];
  blockedReasons: string[];
  readinessLevel: "metadata_only" | "content_ready" | "automation_ready_partial";
  validationStatus: NotionValidationStatus;
  validationSummary: string;
};

export type NotionWorkspacePlan = {
  planId: string;
  generatedAt: string;
  destination: NotionDestination;
  workspaceMode: NotionWorkspaceMode;
  topLevelObjects: NotionPlanObject[];
  coursePlans: NotionPlanObject[];
  contentPlans: NotionPlanObject[];
  deliverablePlans: NotionPlanObject[];
  studyAssetPlans: NotionPlanObject[];
  warnings: string[];
  blockedReasons: string[];
  readinessLevel: "metadata_only" | "content_ready" | "automation_ready_partial";
  summary: NotionPlannerSummary;
};

export type NotionSyncJob = {
  jobId: string;
  createdAt: string;
  status: NotionJobStatus;
  manifestVersion?: number | null;
  summary: string;
};

export type NotionSyncResult = {
  jobId: string;
  success: boolean;
  blockedReason?: string | null;
  warnings: string[];
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  artifactAttachedCount: number;
  plannedTopLevelObjects: number;
  plannedCourseHubs: number;
  plannedContentEntries: number;
  plannedDeliverables: number;
  plannedStudyAssetContainers: number;
  directIngestCandidates: number;
  fileArtifactCandidates: number;
  extractionPendingItems: number;
  automationEligibleRecords: number;
  readinessLevel: "metadata_only" | "content_ready" | "automation_ready_partial";
  finishedAt?: string | null;
};

export type NotionWorkspaceMappings = {
  workspace: {
    destinationPageId: string;
    workspaceMode: NotionWorkspaceMode;
    databases: {
      courses: { id: string; action?: string } | null;
      content: { id: string; action?: string } | null;
      deliverables: { id: string; action?: string } | null;
      studyAssets: { id: string; action?: string } | null;
    };
    courseHubs: Record<
      string,
      {
        pageId: string;
        syncedBlockIds?: string[];
        lastSynced?: string;
      }
    >;
    updatedAt?: string | null;
  };
  courseEntries: Record<
    string,
    {
      pageId: string;
      lastSynced?: string;
      lastStatus?: string;
    }
  >;
  contentEntries: Record<
    string,
    {
      pageId: string;
      lastSynced?: string;
      lastStatus?: string;
      contentHash?: string;
      fileUploadId?: string | null;
      artifactSourceUrl?: string;
      syncedBlockIds?: string[];
      lastError?: string;
    }
  >;
  deliverableEntries: Record<
    string,
    {
      pageId: string;
      lastSynced?: string;
      lastStatus?: string;
    }
  >;
};

export type AutomationReadyRecord = {
  courseId: string;
  contentObjectId: string;
  contentType: string;
  dateContext: {
    discoveredAt?: string | null;
    dueDate?: string | null;
    sourceSection?: string | null;
  };
  textAvailability: string;
  dueDateAvailability: boolean;
  sourceTraceability: {
    sourceType?: string | null;
    sourceCanvasUrl?: string | null;
    sourcePageTitle?: string | null;
  };
  eligibleAutomations: string[];
};

export type AutomationContract = {
  contractVersion: number;
  generatedAt: string;
  destinationPageId: string;
  workspaceMode: NotionWorkspaceMode;
  records: AutomationReadyRecord[];
  summary: {
    totalRecords: number;
    recordsWithTextPath: number;
    extractionPendingRecords: number;
    dueDateReadyRecords: number;
    sourceTraceableRecords: number;
    automationEligibleRecords: number;
    automationReadyNow: number;
  };
};
