// Try to load Jstz SDK and expose it globally
try {
    const JstzModule = await import('https://esm.sh/@jstz-dev/jstz-client@0.1.1-alpha.5');
    window.JstzClient = JstzModule.default || JstzModule.Jstz || JstzModule;
    console.log('[JSTZ SDK] Loaded successfully:', window.JstzClient);
} catch (e) {
    console.warn('[JSTZ SDK] Failed to load from esm.sh:', e);
    window.JstzClient = null;
}
