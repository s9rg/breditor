// Opt-in rich owner. Supply the already initialized matching module exactly once.
// All logical mutation and retained history remain Rust-owned. Asset storage and
// uploads are explicit host services, never command side effects.
import {encodeBlockLayoutPatch} from "./dist/browser/block_layout_serialization.js";
import {encodeListNumberingPatch} from "./dist/browser/list_numbering_serialization.js";
import {encodeTextLanguageIntent} from "./dist/browser/text_language.js";
import {encodeImageLinkIntent} from "./dist/browser/image_link.js";
import {encodeMentionIntent} from "./dist/browser/mention.js";
import {parseRichSearchMetadata} from "./dist/browser/search_metadata.js";
import {parseRichWritingTools} from "./dist/browser/writing_tools_metadata.js";
import {RichRetainedAssetReferenceRegistry} from "./dist/browser/retained_asset_references_registry.js";
export {mountRichSearchPanel} from "./dist/browser/search_panel.js";
export {mountRichWritingTools} from "./dist/browser/writing_tools_panel.js";
export {createRichFullscreen} from "./dist/browser/fullscreen_controller.js";
export {mountRichFullscreenControls} from "./dist/browser/fullscreen_controls.js";
export {mountRichTableColumnResize,richTableColumnResizeCommit,clampRichTableColumnWidth,richTableColumnResizeStyles,RICH_TABLE_COLUMN_WIDTH_MIN,RICH_TABLE_COLUMN_WIDTH_MAX} from "./dist/browser/table_column_resize.js";
export {mountRichImageResize,richImageResizeCommit,clampRichImageDimension,scaleRichImageSize,richImageResizeStyles,RICH_IMAGE_SIZE_MIN,RICH_IMAGE_SIZE_MAX} from "./dist/browser/image_resize.js";
export {createRichSlashCommands,filterRichSlashItems,standardRichSlashPicks} from "./dist/browser/slash_command_items.js";
export {mountRichBlockDrag,mountRichBlockDragPort,richBlockDragStyles} from "./dist/browser/block_drag.js";
export {resolveRichBlockMove,resolveRichBlockStep,richBlockDropTargets,richHandleBlock,richSelectionBlock,isMovableBlock} from "./dist/browser/block_move.js";
export {mountRichSlashCommands} from "./dist/browser/slash_command_session.js";
export {mountRichMentions,requireRichMentionSuggestions,filterRichMentionSuggestions} from "./dist/browser/mention_session.js";
export {richMentionFormat,richMentionKindProperty,richMentionIdProperty,richMentionLabelProperty,richMentionKinds,richMentionClass,richMentionStyles,isRichMentionId,isRichMentionKind,isRichMentionLabel,mentionOf,mentionText,mentionFormat,requireRichMention} from "./dist/browser/mention.js";
export {mountRichSelectionToolbar,mountRichContextMenu,richSelectionToolbarDefaults,richContextMenuDefaults,richContextUiStyles} from "./dist/browser/context_ui.js";
export {mountRichSourceView} from "./dist/browser/source_view.js";
export {mountRichAiTools} from "./dist/browser/ai_rewrite.js";
export {mountRichLanguageCheck} from "./dist/browser/language_check.js";
export {richAiToolsHost,RICH_AI_MAX_BYTES,RICH_AI_MAX_INSTRUCTION,RICH_AI_MAX_TIMEOUT_MS} from "./dist/browser/ai_tools_host.js";
export {richAiUiStringsEn} from "./dist/browser/ui_locale_ai.js";
export {RICH_DOCUMENT_SOURCE_MAX_BYTES} from "./dist/browser/source_view_types.js";

const searchResults=new WeakMap();
class OwnedRichSearchResults {
  #metadata;#closed;
  constructor(owner,raw,closed){this.#closed=closed;try{this.#metadata=parseRichSearchMetadata(raw.metadataJson());searchResults.set(this,{owner,raw});}catch(error){raw.free();throw error;}}
  metadata(){return this.#metadata;}
  navigate(active,direction,wrap){const entry=searchResults.get(this);if(!entry)throw new RichCommandError("breditor_rich.search_disposed","The search result is disposed");return read(entry.raw.navigate(JSON.stringify({active,direction,wrap})),true);}
  dispose(){const entry=searchResults.get(this);if(!entry)return;searchResults.delete(this);try{entry.raw.free();}finally{this.#closed();}}
}
function nativeSearchResults(owner,results){const entry=searchResults.get(results);if(!entry||entry.owner!==owner)throw new RichCommandError("breditor_rich.search_owner","The search result is disposed or belongs to another editor");return entry.raw;}
export {mountRichEditor,mountDocumentRichEditor,RichDomEditor,defaultToolbar,RichAssetStore,defaultAssetLimits,insertImageFiles,RichLocalSessionStore} from "./dist/browser/index.js";
export {RichAssetBackupError,MAX_ASSET_BACKUP_BYTES,MAX_ASSET_BACKUP_HEADER_BYTES,ASSET_BACKUP_MIME} from "./dist/browser/index.js";
export {RichAssetArchive,readRichAssetBackup} from "./dist/browser/index.js";
export {RichAssetReconciliation,RichAssetReconciliationError} from "./dist/browser/index.js";
export {RichAssetReconciledBase,RichAssetBaseError,ASSET_BASE_MIME} from './dist/browser/index.js';
export {RichAssetStoreCustody,RichAssetCustodyError} from './dist/browser/index.js';
export {checkRichAssetLimits,inspectRichRaster} from "./dist/browser/index.js";
export {createRichInlinePresentation} from "./dist/browser/index.js";
export {createStandardRichInlinePresentationV1,standardInlineKindsV1,standardInlinePropertiesV1,standardInlineStylesV1} from "./dist/browser/index.js";
export {createStandardRichToolbarV1} from "./dist/browser/index.js";
export {createStructuralRichToolbarV2} from "./dist/browser/index.js";
export {createLayoutRichToolbarV3} from "./dist/browser/index.js";
export {createRichToolbarV4,listNumberingControl,selectedOrderedList} from "./dist/browser/index.js";
export {imageLinkControls,imageLinkOf,canonicalImageLinkHref,richImageHrefProperty,richImageLinkNewWindowProperty} from "./dist/browser/index.js";
export {detailsToolbarControls,detailsOpen,selectedDetails,detailsInterval,richDetailsKind,richDetailsSummaryKind,richDetailsOpenProperty} from "./dist/browser/index.js";
export {tableCaptionToolbarControls,tableCaptionOf,isTableCaption,selectedTableCaption,richTableCaptionKind} from "./dist/browser/index.js";
export {textLanguageControls,canonicalTextLanguage,textLanguageOf,richTextLanguageFormat,richTextLanguageTagProperty,richTextLanguageRecipeV4} from "./dist/browser/index.js";
export {createFlowNavigationControls} from "./dist/browser/index.js";
export {createSelectionRichToolbarV1} from "./dist/browser/index.js";
export {RichDocumentSessionStore} from "./dist/browser/index.js";

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
function compiledProfile(result,language=1) {
  const raw = transfer(result, "profile", "takeProfile");
  try {
    const descriptor = JSON.parse(read(raw.descriptorJson()));
    if (descriptor.kind !== "rich" || descriptor.abiVersion !== 1 || (language===1?descriptor.richLanguageVersion!==undefined:descriptor.richLanguageVersion!==language) || ![1,2,3,4].includes(language)) {
      throw new RichCommandError("breditor_rich.abi", "Unsupported rich owner ABI");
    }
    if((language===2||language===3||language===4)&&descriptor.taskStructureVersion!==1)throw new RichCommandError("breditor_rich.structural_runtime","Use matching structural Wasm with task structure V1 support");
    if(language===3||language===4?descriptor.blockLayoutVersion!==1:descriptor.blockLayoutVersion!==undefined)throw new RichCommandError("breditor_rich.layout_runtime","Use the matching explicitly selected layout profile");
    if(language===4?descriptor.listNumberingVersion!==1:descriptor.listNumberingVersion!==undefined)throw new RichCommandError("breditor_rich.list_numbering_runtime","Use the matching explicitly selected rich V4 profile");
    if(language===4?descriptor.textLanguageVersion!==1:descriptor.textLanguageVersion!==undefined)throw new RichCommandError("breditor_rich.text_language_runtime","Use the matching explicitly selected rich V4 profile");
    if(language===4?descriptor.imageLinkVersion!==1:descriptor.imageLinkVersion!==undefined)throw new RichCommandError("breditor_rich.image_link_runtime","Use the matching explicitly selected rich V4 profile");
    if(language===4?descriptor.detailsVersion!==1:descriptor.detailsVersion!==undefined)throw new RichCommandError("breditor_rich.details_runtime","Use the matching explicitly selected rich V4 profile");
    if(language===4?descriptor.mentionVersion!==1:descriptor.mentionVersion!==undefined)throw new RichCommandError("breditor_rich.mention_runtime","Use the matching explicitly selected rich V4 profile");
    if(language===4?descriptor.tableCaptionVersion!==1:descriptor.tableCaptionVersion!==undefined)throw new RichCommandError("breditor_rich.table_caption_runtime","Use the matching explicitly selected rich V4 profile");
    return new RichCoreProfile(raw, descriptor);
  } catch (error) { raw.free(); throw error; }
}

/** Bootstrap V7 selects structural V2 explicitly; ordinary V6 factories never widen. */
export function compileStructuralRichProfileV2(wasm,bootstrapJson){
 if(typeof wasm?.BreditorRichProfile?.fromStructuralBootstrapJsonV2!=="function")throw new RichCommandError("breditor_rich.module","Use a matching Wasm module with structural V2 support");
 return compiledProfile(wasm.BreditorRichProfile.fromStructuralBootstrapJsonV2(bootstrapJson),2);
}
/** Structural V2 with the same bounded standard inline V1 manifest. */
export function compileStandardStructuralRichProfileV2(wasm,bootstrapJson){
 if(typeof wasm?.BreditorRichProfile?.fromStandardStructuralBootstrapJsonV2!=="function")throw new RichCommandError("breditor_rich.module","Use a matching Wasm module with standard structural V2 support");
 return compiledProfile(wasm.BreditorRichProfile.fromStandardStructuralBootstrapJsonV2(bootstrapJson),2);
}
/** Bootstrap V8 selects bounded layout V3; earlier factories and defaults stay strict. */
export function compileLayoutRichProfileV3(wasm,bootstrapJson){
 if(typeof wasm?.BreditorRichProfile?.fromLayoutBootstrapJsonV3!=="function")throw new RichCommandError("breditor_rich.module","Use a matching Wasm module with layout V3 support");
 return compiledProfile(wasm.BreditorRichProfile.fromLayoutBootstrapJsonV3(bootstrapJson),3);
}
export function compileStandardLayoutRichProfileV3(wasm,bootstrapJson){
 if(typeof wasm?.BreditorRichProfile?.fromStandardLayoutBootstrapJsonV3!=="function")throw new RichCommandError("breditor_rich.module","Use a matching Wasm module with standard layout V3 support");
 return compiledProfile(wasm.BreditorRichProfile.fromStandardLayoutBootstrapJsonV3(bootstrapJson),3);
}
/** Bootstrap V9 selects the unreleased candidate rich V4 (V3 plus ordered-list numbering). Its
 * fingerprint changes while the candidate grows; earlier factories and defaults stay strict. */
export function compileRichProfileV4(wasm,bootstrapJson){
 if(typeof wasm?.BreditorRichProfile?.fromBootstrapJsonV4!=="function")throw new RichCommandError("breditor_rich.module","Use a matching Wasm module with rich V4 support");
 return compiledProfile(wasm.BreditorRichProfile.fromBootstrapJsonV4(bootstrapJson),4);
}
export function compileStandardRichProfileV4(wasm,bootstrapJson){
 if(typeof wasm?.BreditorRichProfile?.fromStandardBootstrapJsonV4!=="function")throw new RichCommandError("breditor_rich.module","Use a matching Wasm module with standard rich V4 support");
 return compiledProfile(wasm.BreditorRichProfile.fromStandardBootstrapJsonV4(bootstrapJson),4);
}

class RichCoreProfile {
  #raw; #descriptor;
  constructor(raw, descriptor) { this.#raw = raw; this.#descriptor = JSON.stringify(descriptor); }
  #live() { if (!this.#raw) throw new RichCommandError("breditor_rich.disposed", "The rich profile is disposed"); return this.#raw; }
  descriptor() { this.#live(); return JSON.parse(this.#descriptor); }
  supportsPlaceholder(){return this.#live().placeholderVersion?.()==="1";}
  inlineCatalogJson() { return read(this.#live().inlineCatalogJson()); }
  createEditor(documentJson, historyCapacity = "100") {
    const raw = transfer(this.#live().createEditor(documentJson, historyCapacity), "editor", "takeEditor");
    return new RichCoreEditor(raw,this.#descriptor);
  }
  restoreEditor(checkpointJson) {
    const raw = transfer(this.#live().restoreEditor(checkpointJson), "editor", "takeEditor");
    return new RichCoreEditor(raw,this.#descriptor);
  }
  supportsTypingHistory(){return typeof this.#live().restoreTypingEditor==="function";}
  restoreTypingEditor(checkpointJson){
    const profile=this.#live();if(!this.supportsTypingHistory())throw new RichCommandError("breditor_rich.typing_history_unavailable","Use a matching native owner with typing-history recovery");
    return new RichCoreEditor(transfer(profile.restoreTypingEditor(checkpointJson),"editor","takeEditor"),this.#descriptor);
  }
  supportsDocumentSelection(){const p=this.#live();return p.documentSelectionVersion?.()==="1"&&typeof p.restoreDocumentEditor==="function"&&typeof p.restoreDocumentTypingEditor==="function";}
  #documentProfile(){if(!this.supportsDocumentSelection())throw new RichCommandError("breditor_rich.document_selection_unavailable","Use matching native document-selection recovery");return this.#live();}
  createDocumentEditor(documentJson,historyCapacity="100"){
    const p=this.#documentProfile();return new RichCoreEditor(transfer(p.createEditor(documentJson,historyCapacity),"editor","takeEditor"),this.#descriptor,"document-v1");
  }
  restoreDocumentEditor(checkpointJson){return new RichCoreEditor(transfer(this.#documentProfile().restoreDocumentEditor(checkpointJson),"editor","takeEditor"),this.#descriptor,"document-v1");}
  restoreDocumentTypingEditor(checkpointJson){return new RichCoreEditor(transfer(this.#documentProfile().restoreDocumentTypingEditor(checkpointJson),"editor","takeEditor"),this.#descriptor,"document-v1");}
  restoreOriginalAsDocumentEditor(checkpointJson,history="explicit"){
    const p=this.#documentProfile();if(history!=="explicit"&&history!=="typing-v1")throw new TypeError("Expected history explicit or typing-v1");
    if(history==="typing-v1"&&!this.supportsTypingHistory())throw new RichCommandError("breditor_rich.typing_history_unavailable","Use matching native original typing-history recovery");
    return new RichCoreEditor(transfer(history==="typing-v1"?p.restoreTypingEditor(checkpointJson):p.restoreEditor(checkpointJson),"editor","takeEditor"),this.#descriptor,"document-v1");
  }
  dispose() { this.#raw?.free(); this.#raw = undefined; }
}

class RichCoreEditor {
  #raw; #observation; #language; #selectionPolicy;
  #assetReferences=new RichRetainedAssetReferenceRegistry();
  #searches=new Set();
  constructor(raw,descriptor,selectionPolicy="original") { this.#raw = raw;this.#selectionPolicy=selectionPolicy;try{this.#language=JSON.parse(descriptor).richLanguageVersion??1;this.#observation = raw.observe();if((this.#language===3||this.#language===4)&&!this.supportsBlockLayout())throw new RichCommandError("breditor_rich.layout_runtime","Use matching native layout V3 commands and reads");if(this.#language===4&&!this.supportsListNumbering())throw new RichCommandError("breditor_rich.list_numbering_runtime","Use matching native rich V4 list numbering commands");if(this.#language===4&&!this.supportsTextLanguage())throw new RichCommandError("breditor_rich.text_language_runtime","Use matching native rich V4 text language commands");if(this.#language===4&&!this.supportsImageLinks())throw new RichCommandError("breditor_rich.image_link_runtime","Use matching native rich V4 image link commands");if(this.#language===4&&!this.supportsDetails())throw new RichCommandError("breditor_rich.details_runtime","Use matching native rich V4 collapsible section commands");if(this.#language===4&&!this.supportsMentions())throw new RichCommandError("breditor_rich.mention_runtime","Use matching native rich V4 mention commands");if(this.#language===4&&!this.supportsTableCaptions())throw new RichCommandError("breditor_rich.table_caption_runtime","Use matching native rich V4 table caption commands");if(selectionPolicy==="document-v1"&&!this.supportsDocumentSelection())throw new RichCommandError("breditor_rich.document_selection_unavailable","Use complete matching native document-selection capabilities");}catch(error){this.#observation?.free();raw.free();this.#raw=undefined;throw error;} }
  richLanguageVersion(){this.#live();return this.#language;}
  supportsRetainedAssetReferences(){const raw=this.#live();return raw.retainedAssetReferencesVersion?.()==="1"&&typeof raw.retainedAssetReferencesJson==="function";}
  retainedAssetReferences(revision){const raw=this.#live(),current=this.#observation.revision;if(revision!==undefined&&revision!==current)throw new RichCommandError("breditor_rich.stale_observation","The asset read was prepared from an older rich publication");if(!this.supportsRetainedAssetReferences())throw new RichCommandError("breditor_rich.asset_references_unavailable","Use complete matching native retained asset reads");return this.#assetReferences.retain(read(raw.retainedAssetReferencesJson(this.#observation)),current,"local-history",this.view().documentJson);}
  checkRetainedAssetReferences(value,revision){this.#live();const current=this.#observation.revision;if(revision!==undefined&&revision!==current)throw new RichCommandError("breditor_rich.stale_observation","The asset read was prepared from an older rich publication");this.#assetReferences.check(value,current);}
  supportsPlaceholder(){const raw=this.#live();return raw.placeholderVersion?.()==="1"&&typeof raw.placeholderEmpty==="function";}
  placeholderEmpty(revision){const raw=this.#live(),current=this.#observation.revision;if(revision!==undefined&&revision!==current)throw new RichCommandError("breditor_rich.stale_observation","The placeholder read was prepared from an older rich view");if(!this.supportsPlaceholder())throw new RichCommandError("breditor_rich.placeholder_unavailable","Use complete matching native placeholder reads");const value=read(raw.placeholderEmpty(this.#observation));if(value!=="true"&&value!=="false")throw new RichCommandError("breditor_rich.placeholder_read","Invalid native placeholder eligibility");return value==="true";}
  supportsWritingTools(){const raw=this.#live();return raw.writingToolsVersion?.()==="1"&&typeof raw.writingToolsJson==="function";}
  writingTools(revision){const raw=this.#live(),current=this.#observation.revision;if(revision!==undefined&&revision!==current)throw new RichCommandError("breditor_rich.stale_observation","The writing read was prepared from an older rich view");if(!this.supportsWritingTools())throw new RichCommandError("breditor_rich.writing_tools_unavailable","Use complete matching native writing reads");const value=parseRichWritingTools(read(raw.writingToolsJson(this.#observation)));if(value.revision!==current)throw new RichCommandError("breditor_rich.writing_tools_source","The native writing read has a different source publication");return value;}
  supportsMarkdownInputRules(){const r=this.#live();return r.markdownInputRulesVersion?.()==="1"&&[r.insertPlainTextWithMarkdownRules,r.insertTypingTextWithMarkdownRules].every(method=>typeof method==="function");}
  supportsMarkdownInputRouting(){return this.supportsMarkdownInputRules()&&this.#live().markdownInputRoutingVersion?.()==="1";}
  #markdownInput(method,data,revision){
    const input=JSON.stringify(data),raw=this.#live();
    if(revision!==undefined&&revision!==this.#observation.revision)throw new RichCommandError("breditor_rich.stale_observation","The input was prepared from an older rich view");
    if(!this.supportsMarkdownInputRules())throw new RichCommandError("breditor_rich.input_rules_unavailable","Use complete matching native Markdown input rules");
    const outcome=read(raw[method](this.#observation,input));
    const next=raw.observe();this.#observation.free();this.#observation=next;
    if(!["unchanged","inserted","applied","refused"].includes(outcome))throw new RichCommandError("breditor_rich.boundary","Invalid native input-rule outcome");
    return outcome;
  }
  /** Local plain caret input only; a refused conversion still retained the typed text. */
  insertPlainTextWithMarkdownRules(text,namespace,revision){return this.#markdownInput("insertPlainTextWithMarkdownRules",{text,namespace},revision);}
  /** Natural input and conversion complete before this call returns to any subscriber. */
  insertTypingTextWithMarkdownRules(text,clockMs,namespace,revision){return this.#markdownInput("insertTypingTextWithMarkdownRules",{text,clockMs,namespace},revision);}
  /** Version1 rule sets: plain/natural calls with explicit `rules` plus the Enter autolink split. */
  supportsInputRuleSets(){const r=this.#live();return this.supportsMarkdownInputRules()&&r.inputRuleSetsVersion?.()==="1"&&[r.insertPlainTextWithInputRules,r.insertTypingTextWithInputRules,r.insertParagraphWithAutolink].every(method=>typeof method==="function");}
  #ruleSetInput(method,data,revision){
    if(revision!==undefined&&revision!==this.#observation.revision)throw new RichCommandError("breditor_rich.stale_observation","The input was prepared from an older rich view");
    if(!this.supportsInputRuleSets())throw new RichCommandError("breditor_rich.input_rules_unavailable","Use complete matching native input rule sets");
    return this.#markdownInput(method,data,revision);
  }
  /** `rules` is a nonempty duplicate-free list of `markdown-v1`/`autolink-v1`; refused retains the typed text. */
  insertPlainTextWithInputRules(text,rules,namespace,revision){return this.#ruleSetInput("insertPlainTextWithInputRules",{text,namespace,rules:[...rules]},revision);}
  insertTypingTextWithInputRules(text,clockMs,rules,namespace,revision){return this.#ruleSetInput("insertTypingTextWithInputRules",{text,clockMs,namespace,rules:[...rules]},revision);}
  /** Enter at a collapsed caret, then `autolink-v1`; one Undo removes only the link. */
  insertParagraphWithAutolink(data,revision){return this.#ruleSetInput("insertParagraphWithAutolink",{right:data.right,newItem:data.newItem},revision);}
  supportsSearch(){const raw=this.#live();return raw.searchVersion?.()==="1"&&[raw.findText,raw.checkSearchResults,raw.selectSearchMatch,raw.replaceSearchOne,raw.replaceSearchAll].every(method=>typeof method==="function");}
  #searchOwner(revision){const raw=this.#live();if(revision!==undefined&&revision!==this.#observation.revision)throw new RichCommandError("breditor_rich.stale_observation","The search request was prepared from an older rich view");if(!this.supportsSearch())throw new RichCommandError("breditor_rich.search_unavailable","Use complete matching native search capabilities");return raw;}
  findText(query,revision){const input=JSON.stringify(query),raw=this.#searchOwner(revision);const native=transfer(raw.findText(this.#observation,input),"results","takeResults");let results;results=new OwnedRichSearchResults(this,native,()=>this.#searches.delete(results));this.#searches.add(results);return results;}
  checkSearchResults(results,revision){const raw=this.#searchOwner(revision);read(raw.checkSearchResults(this.#observation,nativeSearchResults(this,results)));}
  selectSearchMatch(results,index,revision){const raw=this.#searchOwner(revision);return this.#publish(raw.selectSearchMatch(this.#observation,nativeSearchResults(this,results),index));}
  replaceSearchOne(results,index,replacement,revision){const input=JSON.stringify(replacement),raw=this.#searchOwner(revision);return this.#publish(raw.replaceSearchOne(this.#observation,nativeSearchResults(this,results),index,input));}
  replaceSearchAll(results,replacement,revision){const input=JSON.stringify(replacement),raw=this.#searchOwner(revision);return this.#publish(raw.replaceSearchAll(this.#observation,nativeSearchResults(this,results),input));}
  #live() { if (!this.#raw) throw new RichCommandError("breditor_rich.disposed", "The rich editor is disposed"); return this.#raw; }
  /** Optional exact revision guard for a toolbar/async host operation prepared from view(). */
  execute(command, expectedRevision) {
    const raw = this.#live();
    if (expectedRevision !== undefined && expectedRevision !== this.#observation.revision) {
      throw new RichCommandError("breditor_rich.stale_observation", "The command was prepared from an older rich view");
    }
    const input = typeof command === "string" ? command : JSON.stringify(command?.kind==="changeSelectionLayout"?{...command,data:JSON.parse(encodeBlockLayoutPatch(command.data))}:command?.kind==="setListNumbering"?{...command,data:encodeListNumberingPatch(command.data)}:command?.kind==="setTextLanguage"?{...command,data:encodeTextLanguageIntent(command.data)}:command?.kind==="setImageLink"?{...command,data:encodeImageLinkIntent(command.data)}:command?.kind==="insertMention"?{...command,data:encodeMentionIntent(command.data)}:command);
    return this.#publish(raw.execute(this.#observation,input));
  }
  #publish(result){
    try {
      const status = result.status;
      if (status === "error") throw failure(result);
      const next = result.takeObservation();
      if (!next) throw new RichCommandError("breditor_rich.boundary", "The next observation was absent");
      this.#observation.free(); this.#observation = next;
      return status;
    } finally { result.free(); }
  }
  view() { this.#live();return JSON.parse(read(this.#selectionPolicy==="document-v1"?this.#observation.documentViewJson():this.#observation.viewJson())); }
  selectionPolicy(){this.#live();return this.#selectionPolicy;}
  supportsDocumentSelection(){const r=this.#live();return r.documentSelectionVersion?.()==="1"&&r.documentTypingVersion?.()==="1"&&r.generalCopyVersion?.()==="1"&&[r.selectDocument,r.replaceDocumentPlainText,r.replaceDocumentTypingText,r.documentCheckpointJson,this.#observation.documentViewJson,this.#observation.generalClipboardJson].every(method=>typeof method==="function");}
  #documentCommand(method,input,revision){
    const r=this.#live();if(revision!==undefined&&revision!==this.#observation.revision)throw new RichCommandError("breditor_rich.stale_observation","The document intent was prepared from an older rich view");
    if(this.#selectionPolicy!=="document-v1"||!this.supportsDocumentSelection())throw new RichCommandError("breditor_rich.document_selection_unavailable","Use an explicitly selected document facade with matching native capabilities");
    return this.#publish(input===undefined?r[method](this.#observation):r[method](this.#observation,JSON.stringify(input)));
  }
  selectDocument(revision){return this.#documentCommand("selectDocument",undefined,revision);}
  supportsDocumentNavigation(){const r=this.#live();return this.supportsDocumentSelection()&&r.documentNavigationVersion?.()==="1"&&typeof r.collapseDocumentSelection==="function";}
  collapseDocumentSelection(side,revision){const r=this.#live();if(revision!==undefined&&revision!==this.#observation.revision)throw new RichCommandError("breditor_rich.stale_observation","The document intent was prepared from an older rich view");if(this.#selectionPolicy!=="document-v1"||!this.supportsDocumentNavigation())throw new RichCommandError("breditor_rich.document_navigation_unavailable","Use an explicit document facade with matching native edge navigation");return this.#publish(r.collapseDocumentSelection(this.#observation,side));}
  supportsDocumentClipboard(){const r=this.#live();return this.supportsDocumentSelection()&&r.documentClipboardVersion?.()==="1"&&typeof r.pasteDocumentClipboard==="function";}
  pasteDocumentClipboard(clipboardJson,prefix,revision){if(!this.supportsDocumentClipboard())throw new RichCommandError("breditor_rich.document_clipboard_unavailable","Use matching native whole-document rich paste");return this.#documentCommand("pasteDocumentClipboard",{clipboardJson,prefix},revision);}
  replaceDocumentPlainText(paragraph,text,revision){return this.#documentCommand("replaceDocumentPlainText",{paragraph,text},revision);}
  replaceDocumentTypingText(paragraph,text,clockMs,revision){return this.#documentCommand("replaceDocumentTypingText",{paragraph,text,clockMs},revision);}
  copyDocument(){this.#live();if(this.#selectionPolicy!=="document-v1"||!this.supportsDocumentSelection())throw new RichCommandError("breditor_rich.document_selection_unavailable","Use an explicitly selected document facade with matching native capabilities");return this.generalClipboard();}
  documentJson() { this.#live(); return read(this.#observation.documentJson()); }
  supportsStandardInlineControls() { const raw=this.#live();return typeof raw.inlineControlsVersion==="function"&&raw.inlineControlsVersion()==="1"&&typeof this.#observation.caretFormatsJson==="function"; }
  supportsInlinePropertyPatches() { const raw=this.#live();return typeof raw.inlinePropertyPatchesVersion==="function"&&raw.inlinePropertyPatchesVersion()==="1"; }
  supportsCodeExit(){const raw=this.#live();return typeof raw.codeExitVersion==="function"&&raw.codeExitVersion()==="1";}
  supportsFlowNavigation(){const raw=this.#live();return typeof raw.flowNavigationVersion==="function"&&raw.flowNavigationVersion()==="1";}
  supportsAtomEditing(){const raw=this.#live();return typeof raw.atomEditVersion==="function"&&raw.atomEditVersion()==="1";}
  supportsGeneralRanges(){const raw=this.#live();return typeof raw.generalRangeVersion==="function"&&raw.generalRangeVersion()==="1";}
  supportsGeneralInlinePaste(){const raw=this.#live();return this.supportsGeneralRanges()&&typeof raw.generalInlinePasteVersion==="function"&&raw.generalInlinePasteVersion()==="1";}
  supportsGeneralFlowPaste(){const raw=this.#live();return this.supportsGeneralRanges()&&typeof raw.generalFlowPasteVersion==="function"&&raw.generalFlowPasteVersion()==="1";}
  supportsGeneralParagraph(){const raw=this.#live();return this.supportsGeneralRanges()&&typeof raw.generalParagraphVersion==="function"&&raw.generalParagraphVersion()==="1";}
  supportsGeneralCopy(){const raw=this.#live();return typeof raw.generalCopyVersion==="function"&&raw.generalCopyVersion()==="1"&&typeof this.#observation.generalClipboardJson==="function";}
  generalClipboard(){this.#live();if(!this.supportsGeneralCopy())throw new Error("Use matching native general clipboard copy");const value=read(this.#observation.generalClipboardJson(),true);return value===null?null:JSON.parse(value);}
  supportsClipboardInterchange(){const raw=this.#live();return raw.clipboardInterchangeVersion?.()==="1"&&typeof raw.admitClipboardRoot==="function"&&typeof raw.validateClipboard==="function";}
  admitClipboardRoot(kind,rootJson){const raw=this.#live();if(!this.supportsClipboardInterchange())throw new RichCommandError("breditor_rich.clipboard_interchange_unavailable","Use matching native clipboard interchange");return JSON.parse(read(raw.admitClipboardRoot(kind,rootJson)));}
  validateClipboard(clipboardJson){const raw=this.#live();if(!this.supportsClipboardInterchange())throw new RichCommandError("breditor_rich.clipboard_interchange_unavailable","Use matching native clipboard interchange");return JSON.parse(read(raw.validateClipboard(clipboardJson)));}
  supportsClipboardTextPolicy(){const raw=this.#live();return typeof raw.clipboardTextPolicyVersion==="function"&&raw.clipboardTextPolicyVersion()==="1"&&typeof this.#observation.projectClipboardText==="function";}
  projectClipboardText(selection,clipboardJson,revision){this.#live();if(revision!==undefined&&revision!==this.#observation.revision)throw new RichCommandError("breditor_rich.stale_observation","The clipboard projection was prepared from an older rich view");if(!this.supportsClipboardTextPolicy())throw new RichCommandError("breditor_rich.clipboard_text_policy_unavailable","Use matching native clipboard text policy");return JSON.parse(read(this.#observation.projectClipboardText(JSON.stringify({selection,clipboardJson}))));}
  supportsSelectionFormatting(){const raw=this.#live();return typeof raw.selectionFormattingVersion==="function"&&raw.selectionFormattingVersion()==="1"&&typeof this.#observation.selectionCoverageJson==="function"&&typeof this.#observation.selectionFormatStateJson==="function";}
  supportsBlockLayout(){const raw=this.#live();return (this.#language===3||this.#language===4)&&typeof raw.blockLayoutVersion==="function"&&raw.blockLayoutVersion()==="1"&&typeof this.#observation.blockLayoutStateJson==="function";}
  supportsListNumbering(){const raw=this.#live();return this.#language===4&&typeof raw.listNumberingVersion==="function"&&raw.listNumberingVersion()==="1";}
  supportsTextLanguage(){const raw=this.#live();return this.#language===4&&typeof raw.textLanguageVersion==="function"&&raw.textLanguageVersion()==="1";}
  supportsImageLinks(){const raw=this.#live();return this.#language===4&&typeof raw.imageLinkVersion==="function"&&raw.imageLinkVersion()==="1";}
  supportsDetails(){const raw=this.#live();return this.#language===4&&typeof raw.detailsVersion==="function"&&raw.detailsVersion()==="1";}
  supportsMentions(){const raw=this.#live();return this.#language===4&&typeof raw.mentionVersion==="function"&&raw.mentionVersion()==="1";}
  supportsTableCaptions(){const raw=this.#live();return this.#language===4&&typeof raw.tableCaptionVersion==="function"&&raw.tableCaptionVersion()==="1";}
  blockLayoutState(){this.#live();if(!this.supportsBlockLayout())throw new RichCommandError("breditor_rich.layout_unavailable","Use an explicitly selected matching native layout V3 owner");return JSON.parse(read(this.#observation.blockLayoutStateJson()));}
  selectionCoverage(scope="selection"){this.#live();if(!this.supportsSelectionFormatting())throw new RichCommandError("breditor_rich.selection_formatting_unavailable","Use a matching native selection-formatting owner");return JSON.parse(read(this.#observation.selectionCoverageJson(scope)));}
  selectionFormatState(kind){this.#live();if(!this.supportsSelectionFormatting())throw new RichCommandError("breditor_rich.selection_formatting_unavailable","Use a matching native selection-formatting owner");return JSON.parse(read(this.#observation.selectionFormatStateJson(kind)));}
  supportsTypingHistory(){const raw=this.#live();return typeof raw.typingHistoryVersion==="function"&&raw.typingHistoryVersion()==="1"&&typeof raw.enableTypingHistory==="function"&&typeof raw.closeTypingGroup==="function";}
  #typingPolicy(method,revision){
    const raw=this.#live();if(revision!==undefined&&revision!==this.#observation.revision)throw new RichCommandError("breditor_rich.stale_observation","The history intent was prepared from an older rich view");
    if(!this.supportsTypingHistory())throw new RichCommandError("breditor_rich.typing_history_unavailable","Use a matching native owner with natural typing history");
    const value=read(raw[method](this.#observation));if(value!=="true"&&value!=="false")throw new RichCommandError("breditor_rich.boundary","Invalid history policy result");
    const next=raw.observe();this.#observation.free();this.#observation=next;return value==="true";
  }
  enableTypingHistory(revision){return this.#typingPolicy("enableTypingHistory",revision);}
  closeTypingGroup(revision){return this.#typingPolicy("closeTypingGroup",revision);}
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
  checkpointJson() { const raw=this.#live();return read(this.#selectionPolicy==="document-v1"?raw.documentCheckpointJson():raw.checkpointJson()); }
  dispose() { for(const results of [...this.#searches])results.dispose();this.#observation?.free(); this.#observation = undefined; this.#raw?.free(); this.#raw = undefined; }
}
export {resolveRichUi,defaultRichUi,richUiStringsEn,richChromeIsRtl} from "./dist/browser/ui_locale.js";
export {richUiPanelStringsEn,richUiNoticeCodes} from "./dist/browser/ui_locale.js";
