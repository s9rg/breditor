/** Verify generated application exports without initializing a writer or fetching resources. */
import assert from "node:assert/strict";
import {readFileSync,realpathSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
export const applicationExports=Object.freeze(["SharedEditorOwner","SharedObservation","SharedRichProfile","default","initSync"]);
/** Generated glue must expose only configured factories, opaque observations and guarded owners. */
export function admitApplicationSurface(module,binary,declarations){
 assert.deepEqual(Object.keys(module).sort(),[...applicationExports].sort(),"Application runtime exports must not include research probes");
 for(const name of ["SharedEditorOwner","SharedObservation","SharedRichProfile"]){assert.equal(typeof module[name],"function");assert.match(declarations,new RegExp(`export class ${name}\\s*\\{\\s*private constructor\\(\\);`),`${name} must have no public native constructor`);}
 for(const name of ["new","join","join_frame","restore"])assert.equal(module.SharedEditorOwner[name],undefined,`Fixed-schema owner constructor ${name} must not ship`);
 for(const name of ["apply","apply_at","receive","undo","redo","updates"])assert.equal(module.SharedEditorOwner.prototype[name],undefined,`Unguarded research method ${name} must not ship`);
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
 for(const name of ["general_range_version","restore_general","restore_general_typing"])assert.equal(typeof module.SharedRichProfile.prototype[name],"function",`Missing general-range recovery capability ${name}`);
 for(const name of ["typing_history_version","restore_typing"])assert.equal(typeof module.SharedRichProfile.prototype[name],"function",`Missing separate typing-history recovery ${name}`);
 for(const name of ["create","join_frame","restore","descriptor_json","inline_catalog_json"])assert.equal(typeof module.SharedRichProfile.prototype[name],"function");
 const exports=WebAssembly.Module.exports(new WebAssembly.Module(binary)).map(value=>value.name);
 assert.ok(!exports.some(name=>/^(exercise_|probesession_|rich_ast_binding$|admit_rich_ast$|resolve_geometry$|classify_upload$|resolve_rich_selection$)/.test(name)),"Research functions must be absent from the binary, not just hidden by JS");
 assert.ok(!exports.some(name=>/^sharededitorowner_(new|join|join_frame|restore|apply|apply_at|receive|undo|redo|updates)$/.test(name)),"Research owner entry points must be absent from the binary");
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
