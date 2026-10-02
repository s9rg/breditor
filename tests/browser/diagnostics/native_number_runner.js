// Native-browser runner only. The probe bundle is served byte-for-byte; this
// separate script adds bounded progress reporting, not hot-path instrumentation.
const metadata = JSON.parse(document.querySelector("#metadata").textContent);
const key = `breditor:native-number:${metadata.variant}:${metadata.bundleSha256}`;
const output = document.querySelector("#report");
const start = document.querySelector("#start");
const stop = document.querySelector("#stop");
let state;
try {
  const saved = JSON.parse(sessionStorage.getItem(key) ?? "null");
  if (saved && typeof saved.active === "boolean" && Number.isInteger(saved.passed) && saved.passed >= 0 && saved.passed <= 10 &&
      ["idle", "running", "passed", "failed", "stopped"].includes(saved.outcome)) state = saved;
} catch { /* Malformed local runner state is discarded, never executed. */ }
state ??= { active: false, outcome: "idle", passed: 0 };
function render() {
  const report = { ...metadata, userAgent: navigator.userAgent, ...state };
  output.textContent = JSON.stringify(report, null, 2);
  start.disabled = state.active;
  stop.disabled = !state.active;
  sessionStorage.setItem(key, JSON.stringify(state));
}
start.addEventListener("click", () => {
  state = { active: true, outcome: "running", passed: 0 };
  render();
  location.reload();
});
stop.addEventListener("click", () => {
  state.active = false;
  state.outcome = "stopped";
  render();
});
render();
if (state.active && state.current === state.passed + 1) {
  state.active = false;
  state.outcome = "failed";
  state.error = "Previous native batch was interrupted; not retried";
  render();
}
if (state.active) {
  // Persist progress before executing, so interruptions never appear as passes.
  state.current = state.passed + 1;
  render();
  let deadline;
  try {
    const result = await Promise.race([
      window.breditorPropertyBoundaryProbe("tiny-wasm", 10_000),
      new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error("Native batch exceeded 30 seconds")), 30_000); }),
    ]);
    if (result.mode !== "tiny-wasm" || result.iterations !== 10_000 || result.reads !== 20_000) throw new Error("Native probe returned unexpected counts");
    const diagnostic = window.breditorStartupDiagnostics();
    if (diagnostic.events.length !== 0 || diagnostic.omitted !== 0) throw new Error("Native probe retained rejection events");
    state.passed++;
    if (state.passed === 10) { state.active = false; state.outcome = "passed"; }
    render();
    if (state.active) location.reload();
  } catch (error) {
    state.active = false;
    state.outcome = "failed";
    state.error = String(error).slice(0, 240);
    state.diagnostic = window.breditorStartupDiagnostics?.() ?? null;
    render();
  } finally { clearTimeout(deadline); }
}
