import {openPilotSessionReport} from "./pilot-session-report.mjs";

const maxCheckpointBytes = 16 * 1024 * 1024;
const form = document.querySelector("#pilot-account");
const principalField = form.elements.namedItem("principal");
const tokenField = form.elements.namedItem("token");
const openButton = document.querySelector("#pilot-open");
const workspace = document.querySelector("#pilot-workspace");
const status = document.querySelector("#network-state");
const backup = document.querySelector("#pilot-backup");
const verification = document.querySelector("#pilot-verification");
const preview = document.querySelector("#pilot-preview");
const exportDigest = document.querySelector("#pilot-export-digest");
const reload = document.querySelector("#pilot-reload");
const report = document.querySelector("#pilot-session-report");
const participants = new Set(["alice", "bob"]);
let activeReport;

const showError = (element, message, error) => {
  const code = error?.code;
  element.textContent = typeof code === "string" && /^[a-z0-9_.-]{1,90}$/.test(code)
    ? `${message} (${code})`
    : message;
};

async function digest(bytes) {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function readBootstrap() {
  const response = await fetch("/pilot-bootstrap.json");
  if (!response.ok) throw Error("Pilot bootstrap unavailable");
  const value = await response.json();
  if (value.format !== "breditor/first-party-pilot" || value.formatVersion !== 1 ||
      "tokens" in value || !value.configuration) throw Error("Invalid pilot bootstrap");
  const endpoint = new URL(value.endpoint);
  if (endpoint.protocol !== "ws:" || endpoint.hostname !== "127.0.0.1" || endpoint.pathname !== "/ws" ||
      endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw Error("Invalid pilot endpoint");
  }
  return value;
}

function inspectCheckpoint(wasm, {compileSharedProfile, initializeSharedReadOnly, SharedRichEditor}, configuration, checkpoint) {
  const profile = compileSharedProfile(wasm, configuration);
  let owner;
  try {
    const raw = profile.restore("room", checkpoint);
    try {
      initializeSharedReadOnly(raw, true);
    } catch (error) {
      raw.free();
      throw error;
    }
    owner = new SharedRichEditor(raw);
    const {readOnly, undoDepth, redoDepth} = owner.view();
    if (!readOnly || owner.checkpointJson() !== checkpoint) throw Error("Checkpoint changed on replay");
    return {documentJson: owner.documentJson(), undoDepth, redoDepth};
  } finally {
    owner?.dispose();
    profile.free();
  }
}

function enableRecovery(wasm, shared, configuration, renderStaticDocument) {
  backup.disabled = false;
  backup.addEventListener("change", async () => {
    const file = backup.files[0];
    backup.value = "";
    preview.hidden = true;
    preview.replaceChildren();
    if (!file) return;
    const hadFocus = document.activeElement === backup;
    verification.textContent = "Checking checkpoint…";
    backup.disabled = true;
    try {
      if (file.size === 0 || file.size > maxCheckpointBytes) throw Error("Checkpoint size");
      const bytes = await file.arrayBuffer();
      const checkpoint = new TextDecoder("utf-8", {fatal: true, ignoreBOM: true}).decode(bytes);
      const recovered = inspectCheckpoint(wasm, shared, configuration, checkpoint);
      const hash = await digest(bytes);
      preview.innerHTML = renderStaticDocument(recovered.documentJson, {blockIds: false});
      preview.hidden = false;
      verification.textContent = `Exact read-only replay verified. Undo ${recovered.undoDepth}. Redo ${recovered.redoDepth}. SHA-256 ${hash}.`;
      activeReport?.record("verifiedRecoveries", hash);
    } catch (error) {
      showError(verification, "This checkpoint could not be recovered in the pilot.", error);
    } finally {
      backup.disabled = false;
      if (hadFocus && document.activeElement === document.body) backup.focus({preventScroll: true});
    }
  });
}

function offerCheckpointRecovery(peer, message, error) {
  showError(status, message, error);
  document.querySelector(`#${peer.key}`).inert = true;
  for (const action of ["connect", "upload", "files"]) {
    document.querySelector(`#${action}-${peer.key}`).disabled = true;
  }
  const save = document.querySelector(`#save-${peer.key}`);
  const nextControl = save.disabled ? reload : save;
  nextControl.focus({preventScroll: true});
}

function offerRetiredJournal(peer, error) {
  activeReport?.record("retiredJournals");
  offerCheckpointRecovery(peer, "Local storage changed. Use Download checkpoint before leaving.", error);
}

function enableWorkspaceActions(app, peer, downloadNetworkCheckpoint) {
  const save = document.querySelector(`#save-${peer.key}`);
  save.textContent = "Download checkpoint";
  save.addEventListener("click", async () => {
    save.disabled = true;
    exportDigest.textContent = "";
    try {
      const checkpoint = downloadNetworkCheckpoint(peer);
      const hash = await digest(new TextEncoder().encode(checkpoint));
      exportDigest.textContent = `Downloaded checkpoint SHA-256 ${hash}.`;
      activeReport.record("checkpointDownloads", hash);
    } catch (error) {
      showError(exportDigest, "The checkpoint digest is unavailable.", error);
    } finally {
      save.disabled = false;
    }
  });
  reload.addEventListener("click", async () => {
    reload.disabled = true;
    try {
      await app.close();
      activeReport.record("savedReloads");
      location.reload();
    } catch (error) {
      reload.disabled = false;
      offerCheckpointRecovery(peer, "Local save did not finish. Use Download checkpoint before leaving.", error);
    }
  });
  report.addEventListener("click", () => {
    const payload = JSON.stringify(activeReport.snapshot(), null, 2) + "\n";
    const url = URL.createObjectURL(new Blob([payload], {type:"application/json"}));
    const link = document.createElement("a");
    link.href = url;
    link.download = `breditor-pilot-session-${peer.principal}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  });
  workspace.hidden = false;
  workspace.tabIndex = -1;
  if (peer.journalRetirement) offerRetiredJournal(peer, peer.journalRetirement);
  else workspace.focus();
}

async function startPilot(bootstrap) {
  const [wasm, shared, {downloadNetworkCheckpoint, openNetworkDemo}, {renderStaticDocument}] = await Promise.all([
    import("/probe.js"), import("/shared.js"), import("/network-demo.mjs"), import("/pilot-static.js"),
  ]);
  enableRecovery(wasm, shared, bootstrap.configuration, renderStaticDocument);
  const previous = sessionStorage.getItem("breditor-pilot-participant");
  if (participants.has(previous)) principalField.value = previous;
  openButton.disabled = false;
  status.textContent = "Enter your participant code to open the shared document.";
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (openButton.disabled) return;
    const principal = principalField.value;
    const token = tokenField.value.trim();
    tokenField.value = "";
    if (!participants.has(principal) || !/^[a-f0-9]{64}$/.test(token)) {
      status.textContent = "Enter the 64-character code for the selected participant.";
      tokenField.focus();
      return;
    }
    openButton.disabled = true;
    status.textContent = "Opening your editor…";
    const pauseKey = `breditor-pilot-paused-${principal}`;
    try {
      const app = await openNetworkDemo(bootstrap, principal, {
        pilot: true,
        tokenFor: account => account === principal ? token : undefined,
        codeSha256: await digest(new TextEncoder().encode(token)),
        paused: sessionStorage.getItem(pauseKey) === "1",
        onPause: paused => {
          sessionStorage.setItem(pauseKey, paused ? "1" : "0");
          activeReport?.record(paused ? "disconnects" : "reconnectRequests");
        },
        onJournalRetired: offerRetiredJournal,
      });
      const peer = Object.values(app.peers)[0];
      activeReport = openPilotSessionReport(principal, sessionStorage);
      activeReport.record("opens");
      form.hidden = true;
      enableWorkspaceActions(app, peer, downloadNetworkCheckpoint);
      try {
        sessionStorage.setItem("breditor-pilot-participant", principal);
      } catch {
        // The account menu can default to its first entry next time.
      }
    } catch (error) {
      showError(status, "The editor could not open. Check the code and any other open tab for this account.", error);
      openButton.disabled = false;
      tokenField.focus();
    }
  });
}

let bootstrap;
try {
  bootstrap = await readBootstrap();
} catch (error) {
  showError(status, "Start the Breditor pilot launcher to open this workspace.", error);
}
if (bootstrap) {
  try {
    await startPilot(bootstrap);
  } catch (error) {
    showError(status, "The pilot runtime could not load. Check the installed SDK and reload.", error);
  }
}
