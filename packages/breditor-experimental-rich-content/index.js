// Opt-in rich owner. Supply the already initialized matching module exactly once.
// All logical mutation and retained history remain Rust-owned. No DOM, storage,
// file upload or replication is implied by this low-level package boundary.

export class RichCommandError extends Error {
  constructor(code, message) { super(message); this.name = "RichCommandError"; this.code = code; }
}

function failure(result) {
  const error = result.error;
  try { return new RichCommandError(error?.code ?? "breditor_rich.boundary", error?.message ?? "The rich editor request failed"); }
  finally { error?.free(); }
}
function read(result, nullable = false) {
  try {
    if (nullable && result.status === "absent") return null;
    if (result.status !== "value") throw failure(result);
    const value = result.takeValue();
    if (typeof value !== "string") throw new RichCommandError("breditor_rich.boundary", "The rich read value was absent");
    return value;
  } finally { result.free(); }
}
function transfer(result, expected, take) {
  try {
    if (result.status !== expected) throw failure(result);
    const value = result[take]();
    if (!value) throw new RichCommandError("breditor_rich.boundary", "The rich factory value was absent");
    return value;
  } finally { result.free(); }
}

/** Compile explicit rich bootstrap V6 without changing a default editor/module graph. */
export function compileRichProfile(wasm, bootstrapJson) {
  if (typeof wasm?.BreditorRichProfile?.fromBootstrapJson !== "function") {
    throw new RichCommandError("breditor_rich.module", "Use an initialized experimental-rich-content Wasm module");
  }
  const raw = transfer(wasm.BreditorRichProfile.fromBootstrapJson(bootstrapJson), "profile", "takeProfile");
  try {
    const descriptor = JSON.parse(read(raw.descriptorJson()));
    if (descriptor.kind !== "rich" || descriptor.abiVersion !== 1) {
      throw new RichCommandError("breditor_rich.abi", "Unsupported rich owner ABI");
    }
    return new RichCoreProfile(raw, descriptor);
  } catch (error) { raw.free(); throw error; }
}

class RichCoreProfile {
  #raw; #descriptor;
  constructor(raw, descriptor) { this.#raw = raw; this.#descriptor = JSON.stringify(descriptor); }
  #live() { if (!this.#raw) throw new RichCommandError("breditor_rich.disposed", "The rich profile is disposed"); return this.#raw; }
  descriptor() { this.#live(); return JSON.parse(this.#descriptor); }
  createEditor(documentJson, historyCapacity = "100") {
    const raw = transfer(this.#live().createEditor(documentJson, historyCapacity), "editor", "takeEditor");
    return new RichCoreEditor(raw);
  }
  restoreEditor(checkpointJson) {
    const raw = transfer(this.#live().restoreEditor(checkpointJson), "editor", "takeEditor");
    return new RichCoreEditor(raw);
  }
  dispose() { this.#raw?.free(); this.#raw = undefined; }
}

class RichCoreEditor {
  #raw; #observation;
  constructor(raw) { this.#raw = raw; this.#observation = raw.observe(); }
  #live() { if (!this.#raw) throw new RichCommandError("breditor_rich.disposed", "The rich editor is disposed"); return this.#raw; }
  /** Optional exact revision guard for a toolbar/async host operation prepared from view(). */
  execute(command, expectedRevision) {
    const raw = this.#live();
    if (expectedRevision !== undefined && expectedRevision !== this.#observation.revision) {
      throw new RichCommandError("breditor_rich.stale_observation", "The command was prepared from an older rich view");
    }
    const input = typeof command === "string" ? command : JSON.stringify(command);
    const result = raw.execute(this.#observation, input);
    try {
      const status = result.status;
      if (status === "error") throw failure(result);
      const next = result.takeObservation();
      if (!next) throw new RichCommandError("breditor_rich.boundary", "The next observation was absent");
      this.#observation.free(); this.#observation = next;
      return status;
    } finally { result.free(); }
  }
  view() { this.#live(); return JSON.parse(read(this.#observation.viewJson())); }
  documentJson() { this.#live(); return read(this.#observation.documentJson()); }
  clipboard() { this.#live(); const value = read(this.#observation.clipboardJson(), true); return value === null ? null : JSON.parse(value); }
  checkpointJson() { return read(this.#live().checkpointJson()); }
  dispose() { this.#observation?.free(); this.#observation = undefined; this.#raw?.free(); this.#raw = undefined; }
}
