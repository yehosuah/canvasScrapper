(function () {
  if (globalThis.CanvasAutomationLlmAdapter) {
    return;
  }

  function isEnabled() {
    return false;
  }

  async function enhanceOutputs(options) {
    return {
      used: false,
      outputs: Array.isArray(options?.outputs) ? options.outputs : [],
      note: "Phase 5 uses deterministic generation only. No live LLM adapter is enabled."
    };
  }

  globalThis.CanvasAutomationLlmAdapter = {
    enhanceOutputs,
    isEnabled
  };
})();
