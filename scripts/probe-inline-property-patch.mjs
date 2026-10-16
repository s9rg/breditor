/** Real old/new Wasm interoperability for additive field-only intent; never publishes. */
import assert from "node:assert/strict";
import {readFileSync,realpathSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve,dirname} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==="object"?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const guarded=(owner,work)=>{const observation=owner.observe();try{return work(observation);}finally{observation.free();}};
async function load(directory){const bytes=readFileSync(resolve(directory,"breditor_shared_bg.wasm")),module=await import(pathToFileURL(resolve(directory,"breditor_shared.js")));await module.default({module_or_path:bytes});return {module,sha256:createHash("sha256").update(bytes).digest("hex")};}
export async function probeInlinePropertyPatch(beforeDirectory,afterDirectory){
 const before=await load(beforeDirectory),after=await load(afterDirectory);let comparisons=0;
 for(const language of [1,2]){
  const owned=[];
  try{
   const configuration=JSON.stringify({format:"breditor/shared-rich-profile",formatVersion:language,schema:{name:"example/property-interoperability",version:1},extensions:[]}),factory=language===1?"from_standard_configuration_json_v1":"from_standard_configuration_json_v2";
   const oldProfile=before.module.SharedRichProfile[factory](configuration),profile=after.module.SharedRichProfile[factory](configuration);owned.push(oldProfile,profile);assert.equal(oldProfile.descriptor_json(),profile.descriptor_json());
   const binding=JSON.parse(profile.descriptor_json()),content=JSON.parse(readFileSync(resolve(root,"crates/breditor-core/tests/fixtures/rich-local-root.json"),"utf8"));
   const link=(href,newWindow)=>({type:"breditor-inline/link",properties:{"breditor-inline/href":href,"breditor-inline/new-window":newWindow}});
   content.children[0].children[0].children[0].children[0].children=[{kind:"text",text:"a🙂",formats:[link("https://one.test/",false),{type:"breditor/strong",properties:{}}]},{kind:"text",text:"b",formats:[link("https://two.test/",true)]}];
   const a=profile.create(JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:canonical(content)}),"101"),b=oldProfile.join_frame("room","103",a.update_frame());owned.push(a,b);
   assert.equal(typeof b.patch_inline_format_properties,"undefined","Before runtime must lack the additive planner");
   guarded(b,o=>b.dispatch(o,JSON.stringify({commands:[{kind:"insert_text",data:{block:"caption",offset:0,text:"Old peer "}}]})));
   guarded(a,o=>a.patch_inline_format_properties(o,JSON.stringify({formatsJson:JSON.stringify([link("https://changed.test/",false)]),properties:["breditor-inline/href"],targets:[{block:"p",offset:0,length:4}]})));
   a.receive_frame(b.update_frame());b.receive_frame(a.update_frame());assert.equal(a.document_json(),b.document_json());assert.ok(a.document_json().includes("Old peer "));
   const restored=oldProfile.restore("room",a.checkpoint());owned.push(restored);assert.equal(restored.checkpoint(),a.checkpoint());
   for(const redo of [false,true,false,true]){
    const method=redo?"redo_observed":"undo_observed";assert.equal(guarded(a,o=>a[method](o)),guarded(restored,o=>restored[method](o)));assert.equal(a.checkpoint(),restored.checkpoint());assert.ok(a.document_json().includes("Old peer "));comparisons++;
    b.receive_frame(a.update_frame());assert.equal(b.document_json(),a.document_json());
   }
  }finally{for(const owner of owned.reverse())owner.free();}
 }
 return {format:"breditor/inline-property-patch-interoperability",formatVersion:1,beforeWasmSha256:before.sha256,afterWasmSha256:after.sha256,languages:[1,2],oldPeerLacksPlanner:true,exactFutureHistoryComparisons:comparisons,passed:true};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);if(args.length!==2){console.error("Usage: node scripts/probe-inline-property-patch.mjs <before-runtime-directory> <after-runtime-directory>");process.exitCode=2;}else console.log(JSON.stringify(await probeInlinePropertyPatch(...args),null,2));
}
