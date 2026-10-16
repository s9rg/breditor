// Opt-in rich owner. Supply the already initialized matching module exactly once.
// All logical mutation and retained history remain Rust-owned. Asset storage and
// uploads are explicit host services, never command side effects.
export {mountRichEditor,RichDomEditor,defaultToolbar,RichAssetStore,defaultAssetLimits,insertImageFiles,RichLocalSessionStore} from "./dist/browser/index.js";
export {createRichInlinePresentation} from "./dist/browser/index.js";
export {createStandardRichInlinePresentationV1,standardInlineKindsV1,standardInlinePropertiesV1,standardInlineStylesV1} from "./dist/browser/index.js";
export {createStandardRichToolbarV1} from "./dist/browser/index.js";
export {createStructuralRichToolbarV2} from "./dist/browser/index.js";

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
  return compiledProfile(wasm.BreditorRichProfile.fromBootstrapJson(bootstrapJson));
}
/** Explicit versioned standard preset; the ordinary V6 constructor is unchanged. */
export function compileStandardRichProfileV1(wasm, bootstrapJson) {
  if(typeof wasm?.BreditorRichProfile?.fromStandardBootstrapJsonV1!=="function")throw new RichCommandError("breditor_rich.module","Use a matching Wasm module with standard inline V1 support");
  return compiledProfile(wasm.BreditorRichProfile.fromStandardBootstrapJsonV1(bootstrapJson));
}
function compiledProfile(result) {
  const raw = transfer(result, "profile", "takeProfile");
  try {
    const descriptor = JSON.parse(read(raw.descriptorJson()));
    if (descriptor.kind !== "rich" || descriptor.abiVersion !== 1 || (descriptor.richLanguageVersion!==undefined&&descriptor.richLanguageVersion!==2)) {
      throw new RichCommandError("breditor_rich.abi", "Unsupported rich owner ABI");
    }
    if(descriptor.richLanguageVersion===2&&descriptor.taskStructureVersion!==1)throw new RichCommandError("breditor_rich.structural_runtime","Use matching structural V2 Wasm with task structure V1 support");
    return new RichCoreProfile(raw, descriptor);
  } catch (error) { raw.free(); throw error; }
}

/** Bootstrap V7 selects structural V2 explicitly; ordinary V6 factories never widen. */
export function compileStructuralRichProfileV2(wasm,bootstrapJson){
 if(typeof wasm?.BreditorRichProfile?.fromStructuralBootstrapJsonV2!=="function")throw new RichCommandError("breditor_rich.module","Use a matching Wasm module with structural V2 support");
 return compiledProfile(wasm.BreditorRichProfile.fromStructuralBootstrapJsonV2(bootstrapJson));
}
/** Structural V2 with the same bounded standard inline V1 manifest. */
export function compileStandardStructuralRichProfileV2(wasm,bootstrapJson){
 if(typeof wasm?.BreditorRichProfile?.fromStandardStructuralBootstrapJsonV2!=="function")throw new RichCommandError("breditor_rich.module","Use a matching Wasm module with standard structural V2 support");
 return compiledProfile(wasm.BreditorRichProfile.fromStandardStructuralBootstrapJsonV2(bootstrapJson));
}

class RichCoreProfile {
  #raw; #descriptor;
  constructor(raw, descriptor) { this.#raw = raw; this.#descriptor = JSON.stringify(descriptor); }
  #live() { if (!this.#raw) throw new RichCommandError("breditor_rich.disposed", "The rich profile is disposed"); return this.#raw; }
  descriptor() { this.#live(); return JSON.parse(this.#descriptor); }
  inlineCatalogJson() { return read(this.#live().inlineCatalogJson()); }
  createEditor(documentJson, historyCapacity = "100") {
    const raw = transfer(this.#live().createEditor(documentJson, historyCapacity), "editor", "takeEditor");
    return new RichCoreEditor(raw,this.#descriptor);
  }
  restoreEditor(checkpointJson) {
    const raw = transfer(this.#live().restoreEditor(checkpointJson), "editor", "takeEditor");
    return new RichCoreEditor(raw,this.#descriptor);
  }
  dispose() { this.#raw?.free(); this.#raw = undefined; }
}

class RichCoreEditor {
  #raw; #observation; #language;
  constructor(raw,descriptor) { this.#raw = raw; this.#language=JSON.parse(descriptor).richLanguageVersion??1;this.#observation = raw.observe(); }
  richLanguageVersion(){this.#live();return this.#language;}
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
  supportsStandardInlineControls() { const raw=this.#live();return typeof raw.inlineControlsVersion==="function"&&raw.inlineControlsVersion()==="1"&&typeof this.#observation.caretFormatsJson==="function"; }
  supportsInlinePropertyPatches() { const raw=this.#live();return typeof raw.inlinePropertyPatchesVersion==="function"&&raw.inlinePropertyPatchesVersion()==="1"; }
  supportsReadOnly() { const raw=this.#live();return typeof raw.readOnlyVersion==="function"&&raw.readOnlyVersion()==="1"&&typeof raw.setReadOnly==="function"; }
  setReadOnly(value,expectedRevision) {
    const raw=this.#live();if(typeof value!=="boolean")throw new TypeError("readOnly must be Boolean");
    if(expectedRevision!==undefined&&expectedRevision!==this.#observation.revision)throw new RichCommandError("breditor_rich.stale_observation","The policy was prepared from an older rich view");
    if(!this.supportsReadOnly())throw new RichCommandError("breditor_rich.read_only_unavailable","Use a matching native owner with read-only enforcement");
    const changed=read(raw.setReadOnly(this.#observation,value));if(changed!=="true"&&changed!=="false")throw new RichCommandError("breditor_rich.boundary","Invalid policy result");
    const next=raw.observe();this.#observation.free();this.#observation=next;return changed==="true";
  }
  caretFormats() { this.#live();if(typeof this.#observation.caretFormatsJson!=="function")throw new RichCommandError("breditor_rich.caret_formats_read","Use a matching Wasm module with caret-format reads");return JSON.parse(read(this.#observation.caretFormatsJson())); }
  inlineFormatState(kind) {
    this.#live();
    if(typeof kind!=="string"||kind.length>128)throw new RichCommandError("breditor_rich.inline_state","Expected a bounded declared format kind");
    return JSON.parse(read(this.#observation.inlineFormatStateJson(kind)));
  }
  clipboard() { this.#live(); const value = read(this.#observation.clipboardJson(), true); return value === null ? null : JSON.parse(value); }
  checkpointJson() { return read(this.#live().checkpointJson()); }
  dispose() { this.#observation?.free(); this.#observation = undefined; this.#raw?.free(); this.#raw = undefined; }
}
