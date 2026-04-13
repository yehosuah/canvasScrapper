(function () {
  if (globalThis.CanvasNotionMapper) {
    return;
  }

  const WorkspacePlanner = globalThis.CanvasNotionWorkspacePlanner;
  const Destination = globalThis.CanvasNotionDestination;
  if (!WorkspacePlanner || !Destination) {
    throw new Error("CanvasNotionWorkspacePlanner and CanvasNotionDestination must load before CanvasNotionMapper.");
  }

  function createSyncPlan(options) {
    const destination = Destination.createNotionDestination(options?.destination || options?.settings || {});
    return WorkspacePlanner.createAcademicWorkspacePlan({
      destination,
      manifest: options?.manifest || {}
    });
  }

  globalThis.CanvasNotionMapper = {
    createSyncPlan
  };
})();
