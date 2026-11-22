import assert from "node:assert/strict";
import {resolve} from "node:path";
import {build} from "vite";

/** Build the installed static entry in isolation from interactive consumers. */
export async function checkInstalledStaticBundle(consumer){
 const output=await build({
  root:consumer,configFile:false,logLevel:"error",
  build:{write:false,target:"es2022",lib:{entry:resolve(consumer,"static-entry.mjs"),formats:["es"],fileName:"static"}},
 });
 const files=(Array.isArray(output)?output:[output]).flatMap(bundle=>bundle.output);
 const code=files.filter(file=>file.type==="chunk");
 const modules=code.flatMap(file=>Object.keys(file.modules));
 assert.ok(modules.some(id=>id.endsWith("/@breditor/editor/dist/static_document.js")),"Static renderer missing from the bundle");
 assert.ok(code.some(file=>file.isEntry&&file.exports.includes("renderStaticDocument")),"Static renderer missing from the entry exports");
 for(const id of modules){
  assert.doesNotMatch(id,/\/node_modules\/(?:react(?:-dom)?|@breditor\/(?:collaboration|wasm))\//,"Static publishing included an interactive dependency");
  assert.doesNotMatch(id,/(?:\/breditor_(?:wasm|shared)\.js|\.wasm)(?:[?#]|$)/,"Static publishing included a Wasm module");
 }
 for(const file of files)assert.doesNotMatch(file.fileName,/\.wasm$/i,"Static publishing emitted a Wasm asset");
 const chunks=new Set(code.map(file=>file.fileName));
 for(const file of code){
  for(const id of [...file.imports,...file.dynamicImports])assert.ok(chunks.has(id),`Static publishing retained a runtime import: ${id}`);
  assert.doesNotMatch(file.code,/data:application\/wasm|\bWebAssembly\.(?:instantiate|compile)/,"Static publishing embedded a Wasm runtime");
 }
 return {modules:modules.length,wasmAssets:0};
}
