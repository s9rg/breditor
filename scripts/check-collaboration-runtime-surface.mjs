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
 for(const name of ["observe","dispatch","set_selection","set_pending_formats","insert_plain_text","replace_plain_text","undo_observed","redo_observed","checkpoint","receive_frame","update_frame","inline_format_state_json","caret_formats_json","writer_groups","writer_clock","presence_frame","resolve_presence"])assert.equal(typeof module.SharedEditorOwner.prototype[name],"function",`Missing application owner capability ${name}`);
 for(const name of ["from_configuration_json","from_standard_configuration_json_v1"])assert.equal(typeof module.SharedRichProfile[name],"function");
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
