(function () {
  if (globalThis.CanvasNotionApi) {
    return;
  }

  const Models = globalThis.CanvasNotionModels;
  if (!Models) {
    throw new Error("CanvasNotionModels must load before CanvasNotionApi.");
  }

  const API_BASE_URL = "https://api.notion.com/v1";
  const DEFAULT_NOTION_VERSION = "2026-03-11";
  const DATABASE_API_VERSION = "2022-06-28";
  const MAX_DIRECT_UPLOAD_BYTES = 20 * 1024 * 1024;

  function trimString(value) {
    return Models.trimString(value);
  }

  async function parseJsonSafe(response) {
    const text = await response.text();
    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch (error) {
      return {
        rawText: text
      };
    }
  }

  function buildHeaders(accessToken, version, omitContentType) {
    const headers = {
      Authorization: `Bearer ${trimString(accessToken)}`,
      "Notion-Version": version || DEFAULT_NOTION_VERSION
    };

    if (!omitContentType) {
      headers["Content-Type"] = "application/json";
    }

    return headers;
  }

  function createApiError(response, data, fallbackMessage) {
    const message =
      data?.message ||
      data?.error ||
      data?.rawText ||
      fallbackMessage ||
      `Notion API request failed with ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.code = data?.code || response.statusText || "notion_api_error";
    error.payload = data;
    return error;
  }

  async function notionRequest(pathOrUrl, options) {
    const requestUrl = pathOrUrl.startsWith("http") ? pathOrUrl : `${API_BASE_URL}${pathOrUrl}`;
    const response = await fetch(requestUrl, {
      method: options?.method || "GET",
      headers: buildHeaders(options?.accessToken, options?.version, options?.omitContentType),
      body: options?.body instanceof FormData ? options.body : options?.body ? JSON.stringify(options.body) : undefined
    });
    const data = await parseJsonSafe(response);
    if (!response.ok) {
      throw createApiError(response, data);
    }
    return data;
  }

  function buildCreatePageRequest(body, accessToken) {
    return {
      url: `${API_BASE_URL}/pages`,
      method: "POST",
      headers: buildHeaders(accessToken, DEFAULT_NOTION_VERSION),
      body
    };
  }

  function buildDatabaseQueryRequest(databaseId, body, accessToken) {
    return {
      url: `${API_BASE_URL}/databases/${databaseId}/query`,
      method: "POST",
      headers: buildHeaders(accessToken, DATABASE_API_VERSION),
      body
    };
  }

  function buildAppendBlocksRequest(blockId, body, accessToken) {
    return {
      url: `${API_BASE_URL}/blocks/${blockId}/children`,
      method: "PATCH",
      headers: buildHeaders(accessToken, DEFAULT_NOTION_VERSION),
      body
    };
  }

  function buildUpdateDatabaseRequest(databaseId, body, accessToken) {
    return {
      url: `${API_BASE_URL}/databases/${databaseId}`,
      method: "PATCH",
      headers: buildHeaders(accessToken, DATABASE_API_VERSION),
      body
    };
  }

  async function getCurrentUser(accessToken) {
    return notionRequest("/users/me", {
      accessToken,
      version: DEFAULT_NOTION_VERSION
    });
  }

  async function retrievePage(pageId, accessToken) {
    return notionRequest(`/pages/${pageId}`, {
      accessToken,
      version: DEFAULT_NOTION_VERSION
    });
  }

  async function retrieveDatabase(databaseId, accessToken) {
    return notionRequest(`/databases/${databaseId}`, {
      accessToken,
      version: DATABASE_API_VERSION
    });
  }

  async function queryDatabase(databaseId, body, accessToken) {
    return notionRequest(`/databases/${databaseId}/query`, {
      method: "POST",
      accessToken,
      version: DATABASE_API_VERSION,
      body: body || {}
    });
  }

  async function createDatabase(body, accessToken) {
    return notionRequest("/databases", {
      method: "POST",
      accessToken,
      version: DATABASE_API_VERSION,
      body
    });
  }

  async function updateDatabase(databaseId, body, accessToken) {
    return notionRequest(`/databases/${databaseId}`, {
      method: "PATCH",
      accessToken,
      version: DATABASE_API_VERSION,
      body
    });
  }

  async function createPage(body, accessToken) {
    return notionRequest("/pages", {
      method: "POST",
      accessToken,
      version: DEFAULT_NOTION_VERSION,
      body
    });
  }

  async function updatePage(pageId, body, accessToken) {
    return notionRequest(`/pages/${pageId}`, {
      method: "PATCH",
      accessToken,
      version: DEFAULT_NOTION_VERSION,
      body
    });
  }

  async function appendBlockChildren(blockId, children, accessToken) {
    return notionRequest(`/blocks/${blockId}/children`, {
      method: "PATCH",
      accessToken,
      version: DEFAULT_NOTION_VERSION,
      body: {
        children
      }
    });
  }

  async function listBlockChildren(blockId, accessToken, startCursor) {
    const url = new URL(`${API_BASE_URL}/blocks/${blockId}/children`);
    if (startCursor) {
      url.searchParams.set("start_cursor", startCursor);
    }
    return notionRequest(url.toString(), {
      accessToken,
      version: DEFAULT_NOTION_VERSION
    });
  }

  async function listAllBlockChildren(blockId, accessToken) {
    const items = [];
    let cursor = null;
    do {
      const response = await listBlockChildren(blockId, accessToken, cursor);
      items.push(...(response?.results || []));
      cursor = response?.has_more ? response?.next_cursor : null;
    } while (cursor);
    return items;
  }

  async function archiveBlock(blockId, accessToken) {
    return notionRequest(`/blocks/${blockId}`, {
      method: "DELETE",
      accessToken,
      version: DEFAULT_NOTION_VERSION
    });
  }

  async function createFileUpload(filename, contentType, accessToken) {
    return notionRequest("/file_uploads", {
      method: "POST",
      accessToken,
      version: DEFAULT_NOTION_VERSION,
      body: {
        mode: "single_part",
        filename: trimString(filename).slice(0, 900),
        content_type: trimString(contentType) || "application/octet-stream"
      }
    });
  }

  async function sendFileUpload(uploadUrl, blob, filename, accessToken) {
    const formData = new FormData();
    formData.append("file", blob, filename);
    return notionRequest(uploadUrl, {
      method: "POST",
      accessToken,
      version: DEFAULT_NOTION_VERSION,
      omitContentType: true,
      body: formData
    });
  }

  async function uploadFileBlob(blob, options) {
    const filename = trimString(options?.filename) || "canvas-artifact";
    const contentType = trimString(options?.contentType) || blob.type || "application/octet-stream";
    if (!blob || typeof blob.size !== "number") {
      throw new Error("Missing file blob for Notion upload.");
    }
    if (blob.size > MAX_DIRECT_UPLOAD_BYTES) {
      const error = new Error(`File exceeds ${MAX_DIRECT_UPLOAD_BYTES} byte direct-upload limit.`);
      error.code = "file_too_large";
      throw error;
    }

    const upload = await createFileUpload(filename, contentType, options?.accessToken);
    if (!upload?.upload_url) {
      throw new Error("Notion did not return file upload URL.");
    }

    return sendFileUpload(upload.upload_url, blob, filename, options?.accessToken);
  }

  async function fetchFileAsBlob(sourceUrl, options) {
    const response = await fetch(sourceUrl, {
      method: "GET",
      credentials: options?.credentials || "include",
      redirect: "follow"
    });
    if (!response.ok) {
      throw new Error(`File fetch failed with ${response.status} ${response.statusText}`);
    }

    const blob = await response.blob();
    return {
      blob,
      contentType: response.headers.get("content-type") || blob.type || "application/octet-stream"
    };
  }

  async function validateConnection(options) {
    const accessToken = trimString(options?.accessToken);
    const destinationPageId = trimString(options?.destinationPageId);
    if (!accessToken) {
      return {
        ok: false,
        code: "missing_token",
        status: "blocked",
        message: "Notion integration token missing."
      };
    }

    try {
      const user = await getCurrentUser(accessToken);
      let page = null;
      if (destinationPageId) {
        page = await retrievePage(destinationPageId, accessToken);
      }
      return {
        ok: true,
        status: "ok",
        user,
        page,
        message: destinationPageId
          ? `Connected as ${user?.name || "Notion bot"} and destination page is accessible.`
          : `Connected as ${user?.name || "Notion bot"}.`
      };
    } catch (error) {
      return {
        ok: false,
        code: error.code || "notion_auth_failed",
        status: error.status === 401 || error.status === 403 || error.status === 404 ? "blocked" : "warning",
        message: error.message || "Notion validation failed."
      };
    }
  }

  globalThis.CanvasNotionApi = {
    API_BASE_URL,
    DATABASE_API_VERSION,
    DEFAULT_NOTION_VERSION,
    MAX_DIRECT_UPLOAD_BYTES,
    appendBlockChildren,
    archiveBlock,
    buildAppendBlocksRequest,
    buildCreatePageRequest,
    buildDatabaseQueryRequest,
    buildUpdateDatabaseRequest,
    buildHeaders,
    createDatabase,
    createPage,
    fetchFileAsBlob,
    getCurrentUser,
    listAllBlockChildren,
    queryDatabase,
    retrieveDatabase,
    retrievePage,
    updateDatabase,
    updatePage,
    uploadFileBlob,
    validateConnection
  };
})();
