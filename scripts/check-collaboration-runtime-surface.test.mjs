import test from "node:test";
import assert from "node:assert/strict";
import {admitApplicationSurface,applicationExports,documentOwnerMethods,documentProfileMethods,documentClipboardMethods,documentNavigationMethods,documentToolsMethods,documentPresenceMethods} from "./check-collaboration-runtime-surface.mjs";
const emptyWasm=Uint8Array.from([0,97,115,109,1,0,0,0]);
function fixture(){
 const module={SharedEditorOwner:class {},SharedObservation:class {},SharedRichProfile:class {},default:()=>{},initSync:()=>{}};
 for(const name of documentOwnerMethods)module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of documentProfileMethods)module.SharedRichProfile.prototype[name]=()=>{};
 for(const name of documentClipboardMethods)module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of documentNavigationMethods)module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of documentToolsMethods)module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of documentPresenceMethods)module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of ["general_copy_version","copy_general_clipboard"])module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of ["general_flow_paste_version","paste_general_flow_clipboard"])module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of ["general_paragraph_version","insert_general_paragraph"])module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of ["writer_transport_v2_version","writer_groups_v2","writer_clock_v2"])module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of ["clipboard_text_policy_version","project_clipboard_text"])module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of ["observe","dispatch","set_selection","set_pending_formats","insert_plain_text","insert_hard_break","replace_plain_text","undo_observed","redo_observed","checkpoint","receive_frame","update_frame","inline_format_state_json","caret_formats_json","patch_inline_format_properties","read_only_version","set_read_only","writer_groups","writer_clock","presence_frame","resolve_presence"])module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of ["from_configuration_json","from_standard_configuration_json_v1","from_configuration_json_v2","from_standard_configuration_json_v2","from_configuration_json_v3","from_standard_configuration_json_v3"])module.SharedRichProfile[name]=()=>{};
 for(const name of ["typing_history_version","enable_typing_history","close_typing_group","insert_typing_text","delete_typing_range","typing_checkpoint"])module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of ["code_exit_version","exit_code_block"])module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of ["flow_navigation_version","navigate_flow","insert_paragraph_adjacent"])module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of ["atom_edit_version","delete_atom","replace_atom_plain_text","replace_atom_typing_text"])module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of ["selection_formatting_version","selection_coverage_json","selection_format_state_json","change_selection_formats"])module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of ["block_layout_version","block_layout_state_json","change_selection_layout"])module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of ["general_range_version","enable_general_ranges","replace_general_range_text","replace_general_range_plain_text","replace_general_range_typing_text","general_checkpoint","general_typing_checkpoint","general_inline_paste_version","paste_general_inline_clipboard"])module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of ["general_range_version","restore_general","restore_general_typing"])module.SharedRichProfile.prototype[name]=()=>{};
 for(const name of ["create","join_frame","restore","descriptor_json","inline_catalog_json","typing_history_version","restore_typing"])module.SharedRichProfile.prototype[name]=()=>{};
 return {module,declarations:["SharedEditorOwner","SharedObservation","SharedRichProfile"].map(name=>`export class ${name} {\n private constructor();\n}`).join("\n")};
}
test("general Copy needs both its explicit version and native observation-scoped read",()=>{
 for(const name of ["general_copy_version","copy_general_clipboard"]){const f=fixture();delete f.module.SharedEditorOwner.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing native general Copy capability/);}
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
 for(const name of ["block_layout_version","block_layout_state_json","change_selection_layout"]){const f=fixture();delete f.module.SharedEditorOwner.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing native layout capability/);}
 for(const name of ["from_configuration_json_v3","from_standard_configuration_json_v3"]){const f=fixture();delete f.module.SharedRichProfile[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations));}
});
test("general input and opaque inline clipboard require complete guarded authoring and explicit recovery",()=>{
 for(const name of ["general_range_version","enable_general_ranges","replace_general_range_text","replace_general_range_plain_text","replace_general_range_typing_text","general_checkpoint","general_typing_checkpoint","general_inline_paste_version","paste_general_inline_clipboard"]){const f=fixture();delete f.module.SharedEditorOwner.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing (guarded general-range|native general inline clipboard) capability/);}
 for(const name of ["general_range_version","restore_general","restore_general_typing"]){const f=fixture();delete f.module.SharedRichProfile.prototype[name];assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing general-range recovery capability/);}
});
