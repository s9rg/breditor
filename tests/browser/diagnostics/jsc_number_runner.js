/* Standalone JavaScriptCore host only: import the preserved bundle unchanged.
 * Usage: jsc jsc_number_runner.js -- /absolute/path/to/bundle.js [0|4] [debug-slow]
 * debug-slow permits 120 seconds for native breakpoints ONLY, not qualification.
 * The browser bundle remains a module. The sole DOM shim skips Vite's preload
 * polyfill; no editor, Wasm, browser transport, or Playwright is loaded.
 * This is a different host/timer implementation, not browser qualification.
 * jsc's quit() always exits successfully: callers MUST inspect outcome, not
 * merely the process exit status. Missing output is never a pass.
 */
(() => {
  if (arguments.length < 1 || arguments.length > 3 || !arguments[0].startsWith("/") ||
      (arguments[1] !== undefined && arguments[1] !== "0" && arguments[1] !== "4") ||
      (arguments[2] !== undefined && arguments[2] !== "debug-slow")) {
    throw new Error("Expected an absolute bundle path and optional minimum timer delay (0 or 4 ms)");
  }
  // Separate host-timing control: never rewrite the loaded bundle. Four ms is
  // an approximation, not an implementation of browser timer nesting rules.
  const minimumDelay = Number(arguments[1] ?? "0");
  if (minimumDelay !== 0) {
    const nativeSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = (callback, delay) => nativeSetTimeout(callback, Math.max(minimumDelay, delay));
  }
  globalThis.window = globalThis;
  globalThis.document = {
    createElement(tag) {
      if (tag !== "link") throw new Error("Unexpected DOM dependency");
      return { relList: { supports: value => value === "modulepreload" } };
    },
  };
  // Shell-only API, read after VM initialization and again on completion.
  // Preserve values as returned (this build reports booleans as 0/1).
  const engineOptions = () => {
    const options = jscOptions();
    return { useJIT: options.useJIT, useDFGJIT: options.useDFGJIT, useFTLJIT: options.useFTLJIT,
      useConcurrentGC: options.useConcurrentGC, usePollingTraps: options.usePollingTraps,
      useMachForExceptions: options.useMachForExceptions, useGC: options.useGC };
  };
  const initialEngineOptions = engineOptions();
  const fail = error => {
    print(JSON.stringify({ outcome: "failed", error: String(error).slice(0, 240),
      diagnostic: globalThis.breditorStartupDiagnostics?.(), hotComparison: globalThis.breditorHotComparison,
      initialEngineOptions, finalEngineOptions: engineOptions() }));
    quit();
  };
  const watchdogSeconds = arguments[2] === "debug-slow" ? 120 : 30;
  setTimeout(() => fail(`Standalone probe exceeded ${watchdogSeconds} seconds`), watchdogSeconds * 1000);
  import(arguments[0]).then(async () => {
    const result = await globalThis.breditorPropertyBoundaryProbe("tiny-wasm", 10_000);
    const diagnostic = globalThis.breditorStartupDiagnostics();
    if (result.mode !== "tiny-wasm" || result.iterations !== 10_000 || result.reads !== 20_000 ||
        diagnostic.events.length !== 0 || diagnostic.omitted !== 0) throw new Error("Unexpected probe result");
    print(JSON.stringify({ outcome: "passed", result, diagnostic, initialEngineOptions, finalEngineOptions: engineOptions() }));
    quit();
  }).catch(fail);
})();
