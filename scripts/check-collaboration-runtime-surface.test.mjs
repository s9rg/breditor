import test from "node:test";
import {retainedAssetOwnerMethods} from "./check-collaboration-runtime-surface.mjs";
import {packetAssetOwnerMethods} from "./check-collaboration-runtime-surface.mjs";
import {recoveryOriginOwnerMethods,retainedDocumentBranchOwnerMethods,retainedNativeBranchOwnerMethods,nativeBranchUnionOwnerMethods} from "./check-collaboration-runtime-surface.mjs";
import {segmentedHistoryOwnerMethods,segmentedHistoryProfileMethods,continuedHistoryOwnerMethods,continuedHistoryProfileMethods,observerHistorySealingOwnerMethods} from "./check-collaboration-runtime-surface.mjs";
import {segmentedReviewMethods,continuedReviewMethods} from "./check-collaboration-runtime-surface.mjs";
import {readOnlyHistoryLifecycleMethods} from "./check-collaboration-runtime-surface.mjs";
import {writerPrefixReadMethods} from "./check-collaboration-runtime-surface.mjs";
import assert from "node:assert/strict";
import {admitApplicationSurface,applicationExports,documentOwnerMethods,documentProfileMethods,documentClipboardMethods,documentNavigationMethods,documentToolsMethods,documentPresenceMethods,clipboardInterchangeMethods,reviewMethods,reviewTransportMethods,historicalReviewMethods,versionMethods,suggestionMethods,suggestionGeneralTextMethods,suggestionRevisionMethods,suggestionFormatRebaseMethods,suggestionTextRebaseMethods,reviewedHistoryMethods} from "./check-collaboration-runtime-surface.mjs";
import {searchOwnerMethods,writingOwnerMethods,placeholderOwnerMethods,placeholderProfileMethods} from "./check-collaboration-runtime-surface.mjs";
const emptyWasm=Uint8Array.from([0,97,115,109,1,0,0,0]);
test("clipboard interchange requires the complete separate pure capability",()=>{
 for(const name of clipboardInterchangeMethods){const f=fixture();delete f.module.SharedEditorOwner.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing native clipboard interchange capability/);}
});
function fixture(){
 const module={SharedArchiveDigest:class {},SharedEditorOwner:class {},SharedObservation:class {},SharedRichProfile:class {},SharedVersionRestorePlan:class {},SharedSuggestionPreparation:class {},SharedSuggestionEffectProof:class {},SharedSearchResults:class {},default:()=>{},initSync:()=>{}};
 for(const name of ["version","maximum_bytes","maximum_chunk_bytes","create"])module.SharedArchiveDigest[name]=()=>{};
 for(const name of ["update","finish","free"])module.SharedArchiveDigest.prototype[name]=()=>{};
 for(const name of ["initial_read_only_version","initialize_read_only"])module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of searchOwnerMethods)module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of writingOwnerMethods)module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of retainedAssetOwnerMethods)module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of packetAssetOwnerMethods)module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of recoveryOriginOwnerMethods)module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of retainedDocumentBranchOwnerMethods)module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of retainedNativeBranchOwnerMethods)module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of nativeBranchUnionOwnerMethods)module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of [...segmentedHistoryOwnerMethods,...continuedHistoryOwnerMethods])module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of [...segmentedHistoryProfileMethods,...continuedHistoryProfileMethods])module.SharedRichProfile.prototype[name]=()=>{};
 for(const name of observerHistorySealingOwnerMethods)module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of readOnlyHistoryLifecycleMethods)module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of placeholderOwnerMethods)module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of placeholderProfileMethods)module.SharedRichProfile.prototype[name]=()=>{};
 for(const name of ["search_history_version","restore_search"])module.SharedRichProfile.prototype[name]=()=>{};
 for(const name of ["metadata_json","navigate"])module.SharedSearchResults.prototype[name]=()=>{};
 for(const name of documentOwnerMethods)module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of documentProfileMethods)module.SharedRichProfile.prototype[name]=()=>{};
 for(const name of documentClipboardMethods)module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of documentNavigationMethods)module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of documentToolsMethods)module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of documentPresenceMethods)module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of clipboardInterchangeMethods)module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of reviewMethods)module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of reviewTransportMethods)module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of writerPrefixReadMethods)module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of [...segmentedReviewMethods,...continuedReviewMethods])module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of historicalReviewMethods)module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of versionMethods)module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of suggestionMethods)module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of suggestionGeneralTextMethods)module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of suggestionRevisionMethods)module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of suggestionFormatRebaseMethods)module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of suggestionTextRebaseMethods)module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of reviewedHistoryMethods)module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of ["reviewed_history_version","restore_reviewed"])module.SharedRichProfile.prototype[name]=()=>{};
 module.SharedSuggestionEffectProof.prototype.summary_json=()=>{};
 for(const name of ["summary_json","document_json"])module.SharedSuggestionPreparation.prototype[name]=()=>{};
 for(const name of ["document_json","version_json","comparison_json"])module.SharedVersionRestorePlan.prototype[name]=()=>{};
 for(const name of ["general_copy_version","copy_general_clipboard"])module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of ["general_flow_paste_version","paste_general_flow_clipboard"])module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of ["general_paragraph_version","insert_general_paragraph"])module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of ["writer_transport_v2_version","writer_groups_v2","writer_clock_v2"])module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of ["clipboard_text_policy_version","project_clipboard_text"])module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of ["observe","dispatch","set_selection","set_pending_formats","insert_plain_text","insert_hard_break","replace_plain_text","undo_observed","redo_observed","checkpoint","receive_frame","update_frame","inline_format_state_json","caret_formats_json","patch_inline_format_properties","read_only_version","set_read_only","writer_groups","writer_clock","presence_frame","resolve_presence"])module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of ["from_configuration_json","from_standard_configuration_json_v1","from_configuration_json_v2","from_standard_configuration_json_v2","from_configuration_json_v3","from_standard_configuration_json_v3","from_configuration_json_v4","from_standard_configuration_json_v4"])module.SharedRichProfile[name]=()=>{};
 for(const name of ["rich_language_version","list_numbering_version","text_language_version","image_link_version","details_version","mention_version","table_caption_version","page_break_version","bookmark_version"])module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of ["typing_history_version","enable_typing_history","close_typing_group","insert_typing_text","delete_typing_range","typing_checkpoint"])module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of ["code_exit_version","exit_code_block"])module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of ["flow_navigation_version","navigate_flow","insert_paragraph_adjacent"])module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of ["atom_edit_version","delete_atom","replace_atom_plain_text","replace_atom_typing_text"])module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of ["selection_formatting_version","selection_coverage_json","selection_format_state_json","change_selection_formats"])module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of ["block_layout_version","block_layout_state_json","change_selection_layout"])module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of ["general_range_version","enable_general_ranges","replace_general_range_text","replace_general_range_plain_text","replace_general_range_typing_text","general_checkpoint","general_typing_checkpoint","general_inline_paste_version","paste_general_inline_clipboard"])module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of ["general_range_version","restore_general","restore_general_typing"])module.SharedRichProfile.prototype[name]=()=>{};
 for(const name of ["create","join_frame","restore","descriptor_json","inline_catalog_json","typing_history_version","restore_typing"])module.SharedRichProfile.prototype[name]=()=>{};
 return {module,declarations:["SharedArchiveDigest","SharedEditorOwner","SharedObservation","SharedRichProfile","SharedVersionRestorePlan","SharedSuggestionPreparation","SharedSuggestionEffectProof","SharedSearchResults"].map(name=>`export class ${name} {\n private constructor();\n}`).join("\n")};
}
test('bounded archive hashing requires a separate complete native factory and owner',()=>{for(const name of ['version','maximum_bytes','maximum_chunk_bytes','create']){const f=fixture();delete f.module.SharedArchiveDigest[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing bounded archive digest factory/);}for(const name of ['update','finish','free']){const f=fixture();delete f.module.SharedArchiveDigest.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing bounded archive digest owner/);}});
test("initial policy initialization must ship as a complete native capability",()=>{
 for(const name of ["initial_read_only_version","initialize_read_only"]){const f=fixture();delete f.module.SharedEditorOwner.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing native read-only capability/);}
});
test("recovery continuity requires the complete two-native-owner guarded capability",()=>{
 for(const name of recoveryOriginOwnerMethods){const f=fixture();delete f.module.SharedEditorOwner.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing native recovery origin capability/);}
});
test("segmented history requires explicit complete native reads mutations and recovery",()=>{
 for(const name of segmentedHistoryOwnerMethods){const f=fixture();delete f.module.SharedEditorOwner.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing native segmented history capability/);}
 for(const name of segmentedHistoryProfileMethods){const f=fixture();delete f.module.SharedRichProfile.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing native segmented recovery/);}
 for(const name of continuedHistoryOwnerMethods){const f=fixture();delete f.module.SharedEditorOwner.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing native history continuation/);}
 for(const name of continuedHistoryProfileMethods){const f=fixture();delete f.module.SharedRichProfile.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing explicit continued history recovery/);}
});
test("observer sealing requires its own complete versioned native capability",()=>{
 for(const name of observerHistorySealingOwnerMethods){const f=fixture();delete f.module.SharedEditorOwner.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing native observer history sealing capability/);}
});
test("read-only former authors require their separate complete native archive capability",()=>{
 for(const name of readOnlyHistoryLifecycleMethods){const f=fixture();delete f.module.SharedEditorOwner.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing native read-only history lifecycle capability/);}
});
test("retained image reads require their complete independent guarded capability",()=>{
 for(const name of retainedAssetOwnerMethods){const f=fixture();delete f.module.SharedEditorOwner.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing native retained asset capability/);}
});
test("packet dependencies require every independent guarded immutable packet read",()=>{
 for(const name of packetAssetOwnerMethods){const f=fixture();delete f.module.SharedEditorOwner.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing native packet asset capability/);}
});
test("writing requires its complete independent guarded capability",()=>{
 for(const name of writingOwnerMethods){const f=fixture();delete f.module.SharedEditorOwner.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing native writing capability/);}
});
test("placeholder requires the complete independent native empty-state read",()=>{
 for(const name of placeholderOwnerMethods){const f=fixture();delete f.module.SharedEditorOwner.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing native placeholder capability/);}
 for(const name of placeholderProfileMethods){const f=fixture();delete f.module.SharedRichProfile.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing native placeholder profile capability/);}
});
test("search requires complete guarded methods, explicit recovery and an opaque native result",()=>{
 for(const name of searchOwnerMethods){const f=fixture();delete f.module.SharedEditorOwner.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing native search capability/);}
 for(const name of ["search_history_version","restore_search"]){const f=fixture();delete f.module.SharedRichProfile.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing native search recovery/);}
 for(const name of ["metadata_json","navigate"]){const f=fixture();delete f.module.SharedSearchResults.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing opaque native search read/);}
 const f=fixture();assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations.replace("export class SharedSearchResults {\n private constructor();","export class SharedSearchResults {\n constructor();")),/no public native constructor/);
});
test("owned history requires complete native semantic proofs, explicit recovery and no proof constructor",()=>{
 for(const name of reviewedHistoryMethods){const f=fixture();delete f.module.SharedEditorOwner.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing native reviewed-history/);}
 for(const name of ["reviewed_history_version","restore_reviewed"]){const f=fixture();delete f.module.SharedRichProfile.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing reviewed-history recovery/);}
 const f=fixture();assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations.replace("export class SharedSuggestionEffectProof {\n private constructor();","export class SharedSuggestionEffectProof {\n constructor();")),/no public native constructor/);
});
test("suggestions require complete native pure proofs and never a browser-side acceptance executor",()=>{
 for(const name of suggestionMethods){const f=fixture();delete f.module.SharedEditorOwner.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing pure native suggestion capability/);}
 for(const name of ["summary_json","document_json"]){const f=fixture();delete f.module.SharedSuggestionPreparation.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing opaque native suggestion preparation read/);}
 for(const name of ["accept_document_suggestion","commit_document_suggestion_effect","prepare_document_suggestion_effect"]){const f=fixture();f.module.SharedEditorOwner.prototype[name]=()=>{};assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Browser must not bypass server finalization/);}
});
test("protected suggestion range planning requires its separate native marker and pure bridge",()=>{for(const name of suggestionGeneralTextMethods){const f=fixture();delete f.module.SharedEditorOwner.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing pure native suggestion range planner/);}});
test("immutable revisions require their separate complete pure proof pair",()=>{for(const name of suggestionRevisionMethods){const f=fixture();delete f.module.SharedEditorOwner.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing pure native suggestion revision capability/);}});
test("formatting rebase requires its separate pure marker and guarded method",()=>{for(const name of suggestionFormatRebaseMethods){const f=fixture();delete f.module.SharedEditorOwner.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing pure native formatting rebase capability/);}});
test("text rebase requires its independent pure marker and guarded method",()=>{for(const name of suggestionTextRebaseMethods){const f=fixture();delete f.module.SharedEditorOwner.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing pure native text rebase capability/);}});
test("general Copy needs both its explicit version and native observation-scoped read",()=>{
 for(const name of ["general_copy_version","copy_general_clipboard"]){const f=fixture();delete f.module.SharedEditorOwner.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing native general Copy capability/);}
});
test("comments require the complete native review/anchor pair without extra constructor exports",()=>{
 for(const name of reviewMethods){const f=fixture();delete f.module.SharedEditorOwner.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing guarded native review capability/);}
});
test("review transport requires separate complete native lineage reads and frozen-prefix export",()=>{for(const name of reviewTransportMethods){const f=fixture();delete f.module.SharedEditorOwner.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing native review lineage capability/);}});
test("comment generations require a separate complete guarded native family and explicit restore",()=>{for(const name of segmentedReviewMethods){const f=fixture();delete f.module.SharedEditorOwner.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing native segmented review capability/);}});
test("historical reads require native quote and version source proofs without widening old packets",()=>{for(const name of historicalReviewMethods){const f=fixture();delete f.module.SharedEditorOwner.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing native historical review capability/);}});
test("versions require paired capture/compare/restore and opaque read-only native proofs",()=>{
 for(const name of versionMethods){const f=fixture();delete f.module.SharedEditorOwner.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing guarded native version capability/);}
 for(const name of ["document_json","version_json","comparison_json"]){const f=fixture();delete f.module.SharedVersionRestorePlan.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing native version proof read/);}
});
test("document rich paste requires its independent capability and guarded operation",()=>{
 for(const name of documentClipboardMethods){const f=fixture();delete f.module.SharedEditorOwner.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing native document clipboard capability/);}
});
test("document edge navigation requires its independent capability and guarded operation",()=>{
 for(const name of documentNavigationMethods){const f=fixture();delete f.module.SharedEditorOwner.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing native document navigation capability/);}
});
test("document tools require complete guarded reads and semantic writes",()=>{for(const name of documentToolsMethods){const f=fixture();delete f.module.SharedEditorOwner.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing native document tools capability/);}});
test("document presence requires its separate complete native packet pair",()=>{for(const name of documentPresenceMethods){const f=fixture();delete f.module.SharedEditorOwner.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing native document presence capability/);}});
test("document scope requires complete guarded authoring, separate observations and exact recovery",()=>{
 for(const name of documentOwnerMethods){const f=fixture();delete f.module.SharedEditorOwner.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing native document-selection capability/);}
 for(const name of documentProfileMethods){const f=fixture();delete f.module.SharedRichProfile.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing document-selection recovery capability/);}
});
test("writer transport V2 needs its exact paired native reads",()=>{
 for(const name of ["writer_transport_v2_version","writer_groups_v2","writer_clock_v2"]){const f=fixture();delete f.module.SharedEditorOwner.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing native writer transport V2/);}
});
test("arbitrary-author prefix reads require the complete separate pure native capability",()=>{
 for(const name of writerPrefixReadMethods){const f=fixture();delete f.module.SharedEditorOwner.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing native arbitrary-author prefix capability/);}
});
test("clipboard text conversion needs its paired native policy read",()=>{
 for(const name of ["clipboard_text_policy_version","project_clipboard_text"]){const f=fixture();delete f.module.SharedEditorOwner.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing native clipboard text policy/);}
});
test("application surface checks native constructors rather than JavaScript's implicit empty object construction",()=>{
 const f=fixture();assert.deepEqual(admitApplicationSurface(f.module,emptyWasm,f.declarations).javascriptExports,applicationExports);assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations.replace("private constructor();","constructor();")),/no public native constructor/);
});
test("grouped history requires both guarded authoring and its separate native recovery factory",()=>{
 for(const name of ["typing_history_version","enable_typing_history","close_typing_group","insert_typing_text","delete_typing_range","typing_checkpoint"]){const f=fixture();delete f.module.SharedEditorOwner.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing guarded native typing-history/);}
 for(const name of ["typing_history_version","restore_typing"]){const f=fixture();delete f.module.SharedRichProfile.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing separate typing-history recovery/);}
});
test("code-exit planning requires its exact native capability and guarded entry point",()=>{
 for(const name of ["code_exit_version","exit_code_block"]){const f=fixture();delete f.module.SharedEditorOwner.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing guarded code-exit capability/);}
});
test("flow navigation and adjacent authoring require their matching native capability",()=>{
 for(const name of ["flow_navigation_version","navigate_flow","insert_paragraph_adjacent"]){const f=fixture();delete f.module.SharedEditorOwner.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing guarded flow-navigation capability/);}
});
test("research exports and unguarded owner methods reject instead of being filtered away",()=>{
 const f=fixture();assert.throws(()=>admitApplicationSurface({...f.module,ProbeSession:class {}},emptyWasm,f.declarations),/research probes/);
 f.module.SharedEditorOwner.prototype.undo=()=>{};assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Unguarded research method/);
});
test("atom edits require all guarded native methods and their separate capability",()=>{
 for(const name of ["atom_edit_version","delete_atom","replace_atom_plain_text","replace_atom_typing_text"]){const f=fixture();delete f.module.SharedEditorOwner.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing guarded atom-edit capability/);}
});
test("selection formatting requires its separate read and guarded mutation capability",()=>{
 for(const name of ["selection_formatting_version","selection_coverage_json","selection_format_state_json","change_selection_formats"]){const f=fixture();delete f.module.SharedEditorOwner.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing native selection-formatting capability/);}
});
test("missing real application capabilities and invalid Wasm bytes reject",()=>{
 const f=fixture();delete f.module.SharedEditorOwner.prototype.dispatch;assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing application owner capability/);
 const valid=fixture();assert.throws(()=>admitApplicationSurface(valid.module,new Uint8Array(),valid.declarations));
});
test("layout requires its native capability, independent state read and guarded intent",()=>{
 for(const name of ["rich_language_version","mention_version","bookmark_version"]){const f=fixture();delete f.module.SharedEditorOwner.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing shared V4 capability/);}
 for(const name of ["block_layout_version","block_layout_state_json","change_selection_layout"]){const f=fixture();delete f.module.SharedEditorOwner.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing native layout capability/);}
 for(const name of ["from_configuration_json_v3","from_standard_configuration_json_v3","from_configuration_json_v4","from_standard_configuration_json_v4"]){const f=fixture();delete f.module.SharedRichProfile[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations));}
});
test("general input and opaque inline clipboard require complete guarded authoring and explicit recovery",()=>{
 for(const name of ["general_range_version","enable_general_ranges","replace_general_range_text","replace_general_range_plain_text","replace_general_range_typing_text","general_checkpoint","general_typing_checkpoint","general_inline_paste_version","paste_general_inline_clipboard"]){const f=fixture();delete f.module.SharedEditorOwner.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing (guarded general-range|native general inline clipboard) capability/);}
 for(const name of ["general_range_version","restore_general","restore_general_typing"]){const f=fixture();delete f.module.SharedRichProfile.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing general-range recovery capability/);}
});

test("document branch reconciliation requires every separate guarded native capability",()=>{for(const name of retainedDocumentBranchOwnerMethods){const f=fixture();delete f.module.SharedEditorOwner.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing native document branch capability/);}});

test("paired native branch coverage requires both separate capability methods",()=>{for(const name of retainedNativeBranchOwnerMethods){const f=fixture();delete f.module.SharedEditorOwner.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing native paired branch capability/);}});

test("native branch union requires every separate guarded capability",()=>{for(const name of nativeBranchUnionOwnerMethods){const f=fixture();delete f.module.SharedEditorOwner.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing native branch union capability/);}});

test("continued comments require all explicit native entry points",()=>{for(const name of continuedReviewMethods){const f=fixture();delete f.module.SharedEditorOwner.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing native continued review capability/);}});
