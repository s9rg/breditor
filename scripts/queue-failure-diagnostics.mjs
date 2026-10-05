// Disposable synthetic-fixture diagnosis only. Never modify installed packages
// or production logging. Retain normal terminal queue semantics after logging.
import assert from "node:assert/strict";

// Capture the terminal router boundary too: queueUncertain does not imply an
// executor exception. Read each scalar independently before teardown destroys
// the useful state. This is only injected into disposable synthetic bundles.
export function instrumentRouterFailures(code) {
  const anchor = /(#fault\(reason\)\s*\{\s*if \(this\.#status\.kind !== "live"\)\s*return;)/gu;
  let sites = 0;
  const result = code.replace(anchor, match => {
    sites++;
    return `${match}
    const routerDiagnostic = {reason};
    try { routerDiagnostic.adapterState = this.#adapter.state; } catch {}
    try { routerDiagnostic.queueCode = this.#queue.failure?.code; } catch {}
    try { routerDiagnostic.queueDisposed = this.#queue.disposed; } catch {}
    try { routerDiagnostic.stack = new Error("router fault boundary").stack?.slice(0, 4096); } catch {}
    try { console.error("breditor router failure", JSON.stringify(routerDiagnostic)); } catch {}
    `;
  });
  assert.equal(sites, 1, "router diagnostic fault site changed");
  return result;
}

export function instrumentQueueFailures(code) {
  const sites = [];
  const transformed = code.replace(/\}\s+catch \{\n(\s+)((?:const failure = )?this\.#fail\("command_queue\.(executor|observer)_threw", (?:sequence|pending\.sequence)\);)/gu,
    (_, indent, statement, phase) => {
      sites.push(phase);
      // Catch-site capture also sees engine-created exceptions, unlike a
      // constructor proxy. Read message and stack independently: arbitrary
      // thrown values/accessors and even the logger may themselves throw.
      // Only use this with synthetic fixtures; stacks can contain local URLs.
      return `} catch (queueDiagnosticError) {
${indent}let queueDiagnosticMessage = "<unprintable>";
${indent}let queueDiagnosticStack = "<unavailable>";
${indent}try { queueDiagnosticMessage = String(queueDiagnosticError).slice(0, 1024); } catch {}
${indent}try {
${indent}  const stack = queueDiagnosticError?.stack;
${indent}  if (typeof stack === "string") queueDiagnosticStack = stack.slice(0, 4096);
${indent}} catch {}
${indent}try { console.error("breditor queue failure: ${phase}", queueDiagnosticMessage, queueDiagnosticStack); } catch {}
${indent}${statement}`;
    });
  assert.deepEqual(sites.sort(), ["executor", "executor", "observer", "observer"], "queue diagnostic catch sites changed");
  return transformed;
}

// Stress only the disposable fixture's owner loop. Keep all correctness
// assertions, disposal and the yield between owners exactly as written.
export function repeatPerformanceOwners(code, repetitions) {
  assert.ok(Number.isSafeInteger(repetitions) && repetitions >= 3 && repetitions <= 100, "owner repetitions must be 3..100");
  const anchor = "repetition < 3";
  assert.equal(code.split(anchor).length, 2, "performance owner loop changed");
  return code.replace(anchor, `repetition < ${repetitions}`);
}

// Separate focus-triggered native notifications from the synthetic selection
// delivery in the original reproducer. Only rewrite the disposable fixture;
// these wall-clock spans include task waits and are not performance samples.
export function schedulePerformanceSelection(code, mode) {
  assert.ok(["focus-task", "native-selection"].includes(mode), "invalid selection scheduling mode");
  const anchor = `    measured("selectionMs", () => {
      owner!.focus(); const block = host.querySelectorAll("li")[middle]!.firstElementChild!;
      const range = document.createRange(); range.selectNodeContents(block); range.collapse(false);
      const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    });`;
  assert.equal(code.split(anchor).length, 2, "performance selection scheduling anchor changed");
  const delivery = mode === "focus-task"
    ? `      document.dispatchEvent(new Event("selectionchange"));`
    : `      await nativeSelection;`;
  const nativeWait = mode === "native-selection" ? `
      // Register before changing the range. Ignore synthetic events, and fail
      // rather than silently falling back to synthetic delivery on timeout.
      const nativeSelection = new Promise<void>((resolve, reject) => {
        const listener = (event: Event) => {
          if (!event.isTrusted) return;
          clearTimeout(timer); document.removeEventListener("selectionchange", listener); resolve();
        };
        const timer = setTimeout(() => {
          document.removeEventListener("selectionchange", listener);
          reject(new Error("Native selectionchange did not arrive"));
        }, 5000);
        document.addEventListener("selectionchange", listener);
      });` : "";
  return code.replace(anchor, `    progress = \`\${items} items, repetition \${repetition}: selectionMs (${mode})\`;
    {
      const selectionStart = performance.now();
      owner!.focus();
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      equal(owner!.getStatus().phase, "live");
      const block = host.querySelectorAll("li")[middle]!.firstElementChild!;
      const range = document.createRange(); range.selectNodeContents(block); range.collapse(false);${nativeWait}
      const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range);
${delivery}
      equal(owner!.getStatus().phase, "live");
      host.getBoundingClientRect(); metrics["selectionMs"] = performance.now() - selectionStart;
    }`);
}
