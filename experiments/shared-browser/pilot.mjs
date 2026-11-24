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
const participants = new Set(["alice", "bob"]);

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

function textFrom(node) {
  return node.kind === "text" ? node.text : node.children.map(textFrom).join(
    node.type === "breditor/paragraph" ? "" : "\n",
  );
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
    return {text: textFrom(JSON.parse(owner.documentJson()).root), undoDepth, redoDepth};
  } finally {
    owner?.dispose();
    profile.free();
  }
}

function enableRecovery(wasm, shared, configuration) {
  backup.disabled = false;
  backup.addEventListener("change", async () => {
    const file = backup.files[0];
    backup.value = "";
    preview.hidden = true;
    preview.textContent = "";
    if (!file) return;
    const hadFocus = document.activeElement === backup;
    verification.textContent = "Checking checkpoint…";
    backup.disabled = true;
    try {
      if (file.size === 0 || file.size > maxCheckpointBytes) throw Error("Checkpoint size");
      const bytes = await file.arrayBuffer();
      const checkpoint = new TextDecoder("utf-8", {fatal: true, ignoreBOM: true}).decode(bytes);
      const recovered = inspectCheckpoint(wasm, shared, configuration, checkpoint);
      verification.textContent = `Exact read-only replay verified. Undo ${recovered.undoDepth}. Redo ${recovered.redoDepth}. SHA-256 ${await digest(bytes)}.`;
      preview.textContent = recovered.text;
      preview.hidden = false;
    } catch (error) {
      showError(verification, "This checkpoint could not be recovered in the pilot.", error);
    } finally {
      backup.disabled = false;
      if (hadFocus && document.activeElement === document.body) backup.focus({preventScroll: true});
    }
  });
}

function enableWorkspaceActions(app, peer, downloadNetworkCheckpoint) {
  const save = document.querySelector(`#save-${peer.key}`);
  save.textContent = "Download checkpoint";
  save.addEventListener("click", async () => {
    save.disabled = true;
    exportDigest.textContent = "";
    try {
      const checkpoint = downloadNetworkCheckpoint(peer);
      exportDigest.textContent = `Downloaded checkpoint SHA-256 ${await digest(new TextEncoder().encode(checkpoint))}.`;
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
      location.reload();
    } catch (error) {
      showError(status, "Local save did not finish. Use Download checkpoint before leaving.", error);
      document.querySelector(`#${peer.key}`).inert = true;
      for (const action of ["connect", "upload", "files"]) {
        document.querySelector(`#${action}-${peer.key}`).disabled = true;
      }
      reload.disabled = false;
      const nextControl = save.disabled ? reload : save;
      nextControl.focus({preventScroll: true});
    }
  });
  workspace.hidden = false;
  workspace.tabIndex = -1;
  workspace.focus();
}

async function startPilot(bootstrap) {
  const [wasm, shared, {downloadNetworkCheckpoint, openNetworkDemo}] = await Promise.all([
    import("/probe.js"), import("/shared.js"), import("/network-demo.mjs"),
  ]);
  enableRecovery(wasm, shared, bootstrap.configuration);
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
        onPause: paused => sessionStorage.setItem(pauseKey, paused ? "1" : "0"),
      });
      const peer = Object.values(app.peers)[0];
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
