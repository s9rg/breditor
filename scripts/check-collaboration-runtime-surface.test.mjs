import test from "node:test";
import assert from "node:assert/strict";
import {admitApplicationSurface,applicationExports} from "./check-collaboration-runtime-surface.mjs";
const emptyWasm=Uint8Array.from([0,97,115,109,1,0,0,0]);
function fixture(){
 const module={SharedEditorOwner:class {},SharedObservation:class {},SharedRichProfile:class {},default:()=>{},initSync:()=>{}};
 for(const name of ["observe","dispatch","set_selection","set_pending_formats","insert_plain_text","insert_hard_break","replace_plain_text","undo_observed","redo_observed","checkpoint","receive_frame","update_frame","inline_format_state_json","caret_formats_json","patch_inline_format_properties","read_only_version","set_read_only","writer_groups","writer_clock","presence_frame","resolve_presence"])module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of ["from_configuration_json","from_standard_configuration_json_v1","from_configuration_json_v2","from_standard_configuration_json_v2"])module.SharedRichProfile[name]=()=>{};
 for(const name of ["typing_history_version","enable_typing_history","close_typing_group","insert_typing_text","delete_typing_range","typing_checkpoint"])module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of ["code_exit_version","exit_code_block"])module.SharedEditorOwner.prototype[name]=()=>{};
 for(const name of ["create","join_frame","restore","descriptor_json","inline_catalog_json","typing_history_version","restore_typing"])module.SharedRichProfile.prototype[name]=()=>{};
 return {module,declarations:["SharedEditorOwner","SharedObservation","SharedRichProfile"].map(name=>`export class ${name} {\n private constructor();\n}`).join("\n")};
}
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
test("research exports and unguarded owner methods reject instead of being filtered away",()=>{
 const f=fixture();assert.throws(()=>admitApplicationSurface({...f.module,ProbeSession:class {}},emptyWasm,f.declarations),/research probes/);
 f.module.SharedEditorOwner.prototype.undo=()=>{};assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Unguarded research method/);
});
test("missing real application capabilities and invalid Wasm bytes reject",()=>{
 const f=fixture();delete f.module.SharedEditorOwner.prototype.dispatch;assert.throws(()=>admitApplicationSurface(f.module,emptyWasm,f.declarations),/Missing application owner capability/);
 const valid=fixture();assert.throws(()=>admitApplicationSurface(valid.module,new Uint8Array(),valid.declarations));
});
