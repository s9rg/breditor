// Separate visible native-browser host; never transforms the probe or engine.
const metadata = JSON.parse(document.querySelector("#metadata").textContent);
const key = `breditor:native-boundary:${metadata.variant}:${metadata.bundleSha256}`;
const output = document.querySelector("#report");
const start = document.querySelector("#start");
const stop = document.querySelector("#stop");
let state;
try {
  const saved = JSON.parse(sessionStorage.getItem(key) ?? "null");
  if (saved && typeof saved.active === "boolean" && Number.isInteger(saved.passed) && saved.passed >= 0 && saved.passed <= 5 &&
      (!saved.active || (saved.passed < 5 && saved.outcome === "running")) &&
      (saved.current === undefined || (Number.isInteger(saved.current) && saved.current >= 1 && saved.current <= 5)) &&
      ["idle", "running", "passed", "failed", "stopped"].includes(saved.outcome)) state = saved;
} catch { /* Discard malformed local progress. */ }
state ??= { active: false, outcome: "idle", passed: 0 };
function render() {
  output.textContent = JSON.stringify({ ...metadata, userAgent: navigator.userAgent, ...state }, null, 2);
  start.disabled = state.active;
  stop.disabled = !state.active;
  sessionStorage.setItem(key, JSON.stringify(state));
}
start.addEventListener("click", () => {
  state = { active: true, outcome: "running", passed: 0 };
  render();
  location.reload();
});
stop.addEventListener("click", () => { state.active = false; state.outcome = "stopped"; render(); });
render();
if (state.active && state.current === state.passed + 1) {
  state.active = false;
  state.outcome = "failed";
  state.error = "Previous native batch was interrupted; not retried";
  render();
}
if (state.active) {
  state.current = state.passed + 1;
  render();
  let deadline;
  try {
    const result = await Promise.race([
      window.breditorSelectionProbe(10000),
      new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error("Native batch exceeded 30 seconds")), 30000); }),
    ]);
    if (result.iterations !== 10000 || result.reads !== 30000) throw new Error("Native probe returned unexpected counts");
    if (window.breditorStartupDiagnostics !== undefined) throw new Error("Unexpected instrumented probe");
    state.passed++;
    if (state.passed === 5) { state.active = false; state.outcome = "passed"; }
    render();
    if (state.active) location.reload();
  } catch (error) {
    state.active = false;
    state.outcome = "failed";
    state.error = String(error).slice(0, 240);
    render();
  } finally { clearTimeout(deadline); }
}
