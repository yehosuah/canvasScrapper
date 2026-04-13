(function () {
  if (globalThis.CanvasNotionAuth) {
    return;
  }

  const Models = globalThis.CanvasNotionModels;
  const Storage = globalThis.CanvasNotionStorage;
  if (!Models || !Storage) {
    throw new Error("CanvasNotionModels and CanvasNotionStorage must load before CanvasNotionAuth.");
  }

  async function getAuth() {
    return Storage.getNotionAuth();
  }

  async function saveAuth(rawAuth) {
    const current = await Storage.getNotionAuth();
    const nextAuth = Models.createNotionAuth({
      ...current,
      ...rawAuth
    });
    return Storage.setNotionAuth(nextAuth);
  }

  async function clearAuth() {
    return Storage.setNotionAuth({
      ...Models.DEFAULT_NOTION_AUTH,
      updatedAt: Models.nowIso()
    });
  }

  globalThis.CanvasNotionAuth = {
    clearAuth,
    getAuth,
    saveAuth
  };
})();
