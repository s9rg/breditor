/** Verify generated application exports without initializing a writer or fetching resources. */
import assert from "node:assert/strict";
import {readFileSync,realpathSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
export const applicationExports=Object.freeze(["SharedEditorOwner","SharedObservation","SharedRichProfile","SharedVersionRestorePlan","SharedSuggestionPreparation","SharedSuggestionEffectProof","default","initSync"]);
export const documentOwnerMethods=Object.freeze(["document_selection_version","document_typing_version","document_selection_enabled","enable_document_selection","observe_document","document_view_json","select_document","copy_document_clipboard","replace_document_plain_text","replace_document_typing_text","document_checkpoint","document_typing_checkpoint"]);
export const documentProfileMethods=Object.freeze(["document_selection_version","restore_document","restore_document_typing"]);
export const documentClipboardMethods=Object.freeze(["document_clipboard_version","paste_document_clipboard"]);
export const documentNavigationMethods=Object.freeze(["document_navigation_version","collapse_document_selection"]);
export const documentToolsMethods=Object.freeze(["document_tools_version","document_selection_coverage_json","document_selection_format_state_json","document_block_layout_state_json","change_document_selection_formats","change_document_selection_layout"]);
export const documentPresenceMethods=Object.freeze(["document_presence_version","document_presence_frame","resolve_document_presence"]);
export const clipboardInterchangeMethods=Object.freeze(["clipboard_interchange_version","admit_clipboard_root","validate_clipboard"]);
export const reviewMethods=Object.freeze(["review_version","review_enabled","enable_review","capture_review_anchor","resolve_review_anchor","review_view_json","dispatch_review","undo_review","redo_review","set_review_access","receive_review","export_review","review_checkpoint"]);
export const reviewTransportMethods=Object.freeze(["review_transport_version","local_review_clock","review_writer_clock","retained_review_receipt","export_review_through"]);
export const historicalReviewMethods=Object.freeze(["review_quote_version","read_review_quote","document_version_source_version","verify_document_version_source"]);
export const versionMethods=Object.freeze(["document_versions_version","capture_document_version","read_document_version","compare_document_version","prepare_document_version_restore","apply_document_version_restore"]);
export const suggestionMethods=Object.freeze(["document_suggestions_version","capture_document_suggestion","read_document_suggestion","verify_document_suggestion_source","prepare_document_suggestion","check_document_suggestion_preview","retained_writer_receipt_v2"]);
export const suggestionGeneralTextMethods=Object.freeze(["suggestion_general_text_version","plan_suggestion_general_text"]);
export const suggestionRevisionMethods=Object.freeze(["document_suggestion_revisions_version","capture_document_suggestion_revision","read_document_suggestion_revision","verify_document_suggestion_revision","document_suggestion_revision_packet"]);
export const suggestionFormatRebaseMethods=Object.freeze(["suggestion_format_rebase_version","rebase_document_suggestion_format"]);
export const suggestionTextRebaseMethods=Object.freeze(["suggestion_text_rebase_version","rebase_document_suggestion_text"]);
export const reviewedHistoryMethods=Object.freeze(["reviewed_history_version","reviewed_history_enabled","reviewed_history_identity_json","adopted_suggestion_json","enable_reviewed_history","reviewed_checkpoint","verify_document_suggestion_effect","check_document_suggestion_effect_proof","adopt_suggestion_history"]);
/** Generated glue must expose only configured factories, opaque observations and guarded owners. */
export function admitApplicationSurface(module,binary,declarations){
 assert.deepEqual(Object.keys(module).sort(),[...applicationExports].sort(),"Application runtime exports must not include research probes");
 for(const name of ["SharedEditorOwner","SharedObservation","SharedRichProfile","SharedVersionRestorePlan","SharedSuggestionPreparation","SharedSuggestionEffectProof"]){assert.equal(typeof module[name],"function");assert.match(declarations,new RegExp(`export class ${name}\\s*\\{\\s*private constructor\\(\\);`),`${name} must have no public native constructor`);}
 for(const name of ["new","join","join_frame","restore"])assert.equal(module.SharedEditorOwner[name],undefined,`Fixed-schema owner constructor ${name} must not ship`);
 for(const name of ["apply","apply_at","receive","undo","redo","updates","apply_diff","apply_inverse"])assert.equal(module.SharedEditorOwner.prototype[name],undefined,`Unguarded research method ${name} must not ship`);
 for(const name of ["observe","dispatch","set_selection","set_pending_formats","insert_plain_text","insert_hard_break","replace_plain_text","undo_observed","redo_observed","checkpoint","receive_frame","update_frame","inline_format_state_json","caret_formats_json","writer_groups","writer_clock","presence_frame","resolve_presence"])assert.equal(typeof module.SharedEditorOwner.prototype[name],"function",`Missing application owner capability ${name}`);
 for(const name of ["from_configuration_json","from_standard_configuration_json_v1","from_configuration_json_v2","from_standard_configuration_json_v2","from_configuration_json_v3","from_standard_configuration_json_v3"])assert.equal(typeof module.SharedRichProfile[name],"function");
 assert.equal(typeof module.SharedEditorOwner.prototype.patch_inline_format_properties,"function","Missing guarded property-patch planner");
 for(const name of ["read_only_version","set_read_only"])assert.equal(typeof module.SharedEditorOwner.prototype[name],"function",`Missing native read-only capability ${name}`);
 for(const name of ["code_exit_version","exit_code_block"])assert.equal(typeof module.SharedEditorOwner.prototype[name],"function",`Missing guarded code-exit capability ${name}`);
 for(const name of ["flow_navigation_version","navigate_flow","insert_paragraph_adjacent"])assert.equal(typeof module.SharedEditorOwner.prototype[name],"function",`Missing guarded flow-navigation capability ${name}`);
 for(const name of ["atom_edit_version","delete_atom","replace_atom_plain_text","replace_atom_typing_text"])assert.equal(typeof module.SharedEditorOwner.prototype[name],"function",`Missing guarded atom-edit capability ${name}`);
 for(const name of ["selection_formatting_version","selection_coverage_json","selection_format_state_json","change_selection_formats"])assert.equal(typeof module.SharedEditorOwner.prototype[name],"function",`Missing native selection-formatting capability ${name}`);
 for(const name of ["block_layout_version","block_layout_state_json","change_selection_layout"])assert.equal(typeof module.SharedEditorOwner.prototype[name],"function",`Missing native layout capability ${name}`);
 for(const name of ["typing_history_version","enable_typing_history","close_typing_group","insert_typing_text","delete_typing_range","typing_checkpoint"])assert.equal(typeof module.SharedEditorOwner.prototype[name],"function",`Missing guarded native typing-history capability ${name}`);
 for(const name of ["general_range_version","enable_general_ranges","replace_general_range_text","replace_general_range_plain_text","replace_general_range_typing_text","general_checkpoint","general_typing_checkpoint"])assert.equal(typeof module.SharedEditorOwner.prototype[name],"function",`Missing guarded general-range capability ${name}`);
 for(const name of ["general_inline_paste_version","paste_general_inline_clipboard"])assert.equal(typeof module.SharedEditorOwner.prototype[name],"function",`Missing native general inline clipboard capability ${name}`);
 for(const name of ["general_copy_version","copy_general_clipboard"])assert.equal(typeof module.SharedEditorOwner.prototype[name],"function",`Missing native general Copy capability ${name}`);
 for(const name of ["general_flow_paste_version","paste_general_flow_clipboard"])assert.equal(typeof module.SharedEditorOwner.prototype[name],"function",`Missing native general flow paste capability ${name}`);
 for(const name of ["general_paragraph_version","insert_general_paragraph"])assert.equal(typeof module.SharedEditorOwner.prototype[name],"function",`Missing native general paragraph capability ${name}`);
 for(const name of ["writer_transport_v2_version","writer_groups_v2","writer_clock_v2"])assert.equal(typeof module.SharedEditorOwner.prototype[name],"function",`Missing native writer transport V2 capability ${name}`);
 for(const name of ["clipboard_text_policy_version","project_clipboard_text"])assert.equal(typeof module.SharedEditorOwner.prototype[name],"function",`Missing native clipboard text policy capability ${name}`);
 for(const name of clipboardInterchangeMethods)assert.equal(typeof module.SharedEditorOwner.prototype[name],"function",`Missing native clipboard interchange capability ${name}`);
 for(const name of reviewMethods)assert.equal(typeof module.SharedEditorOwner.prototype[name],"function",`Missing guarded native review capability ${name}`);
 for(const name of reviewTransportMethods)assert.equal(typeof module.SharedEditorOwner.prototype[name],"function",`Missing native review lineage capability ${name}`);
 for(const name of historicalReviewMethods)assert.equal(typeof module.SharedEditorOwner.prototype[name],"function",`Missing native historical review capability ${name}`);
 for(const name of versionMethods)assert.equal(typeof module.SharedEditorOwner.prototype[name],"function",`Missing guarded native version capability ${name}`);
 for(const name of suggestionMethods)assert.equal(typeof module.SharedEditorOwner.prototype[name],"function",`Missing pure native suggestion capability ${name}`);
 for(const name of suggestionGeneralTextMethods)assert.equal(typeof module.SharedEditorOwner.prototype[name],"function",`Missing pure native suggestion range planner ${name}`);
 for(const name of suggestionRevisionMethods)assert.equal(typeof module.SharedEditorOwner.prototype[name],"function",`Missing pure native suggestion revision capability ${name}`);
 for(const name of suggestionFormatRebaseMethods)assert.equal(typeof module.SharedEditorOwner.prototype[name],"function",`Missing pure native formatting rebase capability ${name}`);
 for(const name of suggestionTextRebaseMethods)assert.equal(typeof module.SharedEditorOwner.prototype[name],"function",`Missing pure native text rebase capability ${name}`);
 for(const name of reviewedHistoryMethods)assert.equal(typeof module.SharedEditorOwner.prototype[name],"function",`Missing native reviewed-history capability ${name}`);
 for(const name of ["reviewed_history_version","restore_reviewed"])assert.equal(typeof module.SharedRichProfile.prototype[name],"function",`Missing reviewed-history recovery ${name}`);
 assert.equal(typeof module.SharedSuggestionEffectProof.prototype.summary_json,"function","Missing opaque native effect proof read");
 for(const name of ["summary_json","document_json"])assert.equal(typeof module.SharedSuggestionPreparation.prototype[name],"function",`Missing opaque native suggestion preparation read ${name}`);
 for(const name of ["accept_document_suggestion","commit_document_suggestion_effect","prepare_document_suggestion_effect"])assert.equal(module.SharedEditorOwner.prototype[name],undefined,`Browser must not bypass server finalization with ${name}`);
 for(const name of ["document_json","version_json","comparison_json"])assert.equal(typeof module.SharedVersionRestorePlan.prototype[name],"function",`Missing native version proof read ${name}`);
 for(const name of documentOwnerMethods)assert.equal(typeof module.SharedEditorOwner.prototype[name],"function",`Missing native document-selection capability ${name}`);
 for(const name of documentProfileMethods)assert.equal(typeof module.SharedRichProfile.prototype[name],"function",`Missing document-selection recovery capability ${name}`);
 for(const name of documentClipboardMethods)assert.equal(typeof module.SharedEditorOwner.prototype[name],"function",`Missing native document clipboard capability ${name}`);
 for(const name of documentNavigationMethods)assert.equal(typeof module.SharedEditorOwner.prototype[name],"function",`Missing native document navigation capability ${name}`);
 for(const name of documentToolsMethods)assert.equal(typeof module.SharedEditorOwner.prototype[name],"function",`Missing native document tools capability ${name}`);
 for(const name of documentPresenceMethods)assert.equal(typeof module.SharedEditorOwner.prototype[name],"function",`Missing native document presence capability ${name}`);
 for(const name of ["general_range_version","restore_general","restore_general_typing"])assert.equal(typeof module.SharedRichProfile.prototype[name],"function",`Missing general-range recovery capability ${name}`);
 for(const name of ["typing_history_version","restore_typing"])assert.equal(typeof module.SharedRichProfile.prototype[name],"function",`Missing separate typing-history recovery ${name}`);
 for(const name of ["create","join_frame","restore","descriptor_json","inline_catalog_json"])assert.equal(typeof module.SharedRichProfile.prototype[name],"function");
 const exports=WebAssembly.Module.exports(new WebAssembly.Module(binary)).map(value=>value.name);
 assert.ok(!exports.some(name=>/^(exercise_|probesession_|rich_ast_binding$|admit_rich_ast$|resolve_geometry$|classify_upload$|resolve_rich_selection$)/.test(name)),"Research functions must be absent from the binary, not just hidden by JS");
 assert.ok(!exports.some(name=>/^sharededitorowner_(new|join|join_frame|restore|apply|apply_at|receive|undo|redo|updates)$/.test(name)),"Research owner entry points must be absent from the binary");
 assert.ok(!exports.some(name=>/^sharededitorowner_(accept_document_suggestion|prepare_document_suggestion_effect|commit_document_suggestion_effect|apply_inverse|apply_diff)$|^sharedsuggestion(preparation|effectproof)_new$/.test(name)),"Server-only effects, arbitrary inverses and native proof constructors must be absent from the binary");
 return {javascriptExports:[...applicationExports],wasmExports:exports.length};
}
export async function checkApplicationRuntime(directory){
 const module=await import(pathToFileURL(resolve(directory,"breditor_shared.js")).href);
 return admitApplicationSurface(module,readFileSync(resolve(directory,"breditor_shared_bg.wasm")),readFileSync(resolve(directory,"breditor_shared.d.ts"),"utf8"));
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==3){console.error("Usage: node scripts/check-collaboration-runtime-surface.mjs <generated-directory>");process.exitCode=2;}
 else console.log(JSON.stringify(await checkApplicationRuntime(process.argv[2])));
}
