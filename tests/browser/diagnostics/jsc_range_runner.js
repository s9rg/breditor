/* Standalone host for the compiled, unchanged numeric-range probe.
 * No DOM, Vite, Playwright, Rust or Wasm. The timer shim is a host control,
 * not an implementation of browser scheduling. quit() is not a pass signal.
 */
(() => {
  const budgetText = arguments[2] ?? "10000";
  if (![2, 3].includes(arguments.length) || !arguments[0].startsWith("/") || !["0", "4"].includes(arguments[1]) ||
      !["10000", "100000"].includes(budgetText) || (budgetText === "100000" && arguments[1] !== "0")) {
    throw new Error("Expected absolute probe path, delay 0|4, optional budget 10000|100000 (large budget requires zero delay)");
  }
  const delay = Number(arguments[1]);
  const nativeSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (callback, requested) => nativeSetTimeout(callback, Math.max(delay, requested));
  const events = [];
  globalThis.console = { debug(message) {
    if (typeof message === "string" && message.startsWith("BREDITOR_RANGE_REJECTION=") && events.length < 4) events.push(message);
  } };
  const options = () => {
    const value = jscOptions();
    return { useJIT: value.useJIT, useDFGJIT: value.useDFGJIT, useFTLJIT: value.useFTLJIT };
  };
  const initialEngineOptions = options();
  const finish = (outcome, result, error) => {
    print(JSON.stringify({ format: "breditor/jsc-range", outcome, result, error,
      events, initialEngineOptions, finalEngineOptions: options() }));
    quit();
  };
  setTimeout(() => finish("failed", null, "30-second watchdog"), 30_000);
  import(arguments[0]).then(module => module.probeNumericRange(Number(budgetText)))
    .then(result => finish("passed", result, null))
    .catch(error => finish("failed", null, String(error).slice(0, 16_384)));
})();
