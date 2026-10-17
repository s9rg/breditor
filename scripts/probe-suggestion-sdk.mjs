/** Complete actual application-Wasm proposal pairing against the durable authenticated native host. */
import assert from "node:assert/strict";
import {readFileSync,realpathSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {SharedRichEditor,createSharedDocumentEditor} from "../packages/breditor-collaboration/dist/index.js";
import {probeSuggestionRelay} from "./probe-suggestion-relay.mjs";
async function pureIntentShapes(directory) {
  const wasm=await import(pathToFileURL(resolve(directory,"breditor_shared.js")));
  await wasm.default({module_or_path:readFileSync(resolve(directory,"breditor_shared_bg.wasm"))});
  const config=JSON.stringify({format:"breditor/shared-rich-profile",formatVersion:3,schema:{name:"example/suggestion-shapes",version:1},extensions:[]});
  const profile=wasm.SharedRichProfile.from_standard_configuration_json_v3(config),descriptor=JSON.parse(profile.descriptor_json());
  const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==="object"?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
  const source=JSON.stringify({format:"breditor/document",formatVersion:2,schema:descriptor.schema,schemaFingerprint:descriptor.schemaFingerprint,root:canonical(JSON.parse(readFileSync(new URL("../crates/breditor-core/tests/fixtures/rich-local-root.json",import.meta.url),"utf8")))});
  const seed=profile.create(source,"1"),frame=seed.update_frame();seed.free();let cases=0;
  try {for(const document of [false,true])for(const natural of [false,true]) {
    const tag=`${document}-${natural}`,raw=profile.join_frame("room","101",frame),core=document?createSharedDocumentEditor(raw):new SharedRichEditor(raw);
    try {
      if(natural)core.enableTypingHistory();core.select({kind:"node",block:"image-block"});const clipboard=core.copy().richJson;
      core.setReadOnly(true);const exact=[core.checkpointJson(),core.updateFrame(),core.documentJson()];
      const at={block:"p",offset:"1",affinity:"after"},range={range:{anchor:at,focus:at,runs:[]},empty:[]};
      const node={kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":`proposal-flow-${tag}`},children:[{kind:"text",text:"Rich flow",formats:[]}]};
      const requests=[
        {scope:"commands",edit:{kind:"general_text",data:{...range,range:{...range.range,runs:[{text:"Inserted 日本 🙂",formats:[]}]}}}},
        {scope:"commands",edit:{kind:"commands",data:[{kind:"insert_general_paragraph_v1",data:{selection:{kind:"text",anchor:at,focus:at},prefix:`proposal-enter-${tag}`}}]}},
        {scope:"commands",edit:{kind:"commands",data:[{kind:"paste_general_flow_at_text_v1",data:{deletion:range,right:`proposal-right-${tag}`,nodes:[node]}}]}},
        {scope:"document",edit:{kind:"commands",data:[{kind:"replace_document_plain_text_v1",data:{paragraph:`proposal-replacement-${tag}`,text:"Document replacement"}}]}},
        {scope:"document",edit:{kind:"commands",data:[{kind:"paste_document_clipboard_v1",data:{clipboard_json:clipboard,prefix:`proposal-document-paste-${tag}`}}]}},
        {scope:"document",edit:{kind:"commands",data:[{kind:"change_document_formats_v1",data:{changes_json:JSON.stringify({changes:[{kind:"set",formatsJson:JSON.stringify([{type:"breditor/strong",properties:{}}])}]})}}]}},
        {scope:"document",edit:{kind:"commands",data:[{kind:"change_document_layout_v1",data:{patch_json:'{"alignment":"center"}'}}]}},
      ];
      for(const draft of requests) {
        try {
          const packet=core.captureSuggestion(`Shape ${cases}`,"alice","0",draft),preparation=core.prepareSuggestion(packet);assert.equal(preparation.kind,"ready");
          core.checkSuggestionPreview(preparation.preview);assert.notEqual(preparation.preview.documentJson(),core.documentJson());preparation.preview.dispose();
          assert.deepEqual([core.checkpointJson(),core.updateFrame(),core.documentJson()],exact);cases++;
        } catch(error) {throw Error(`Pure proposal shape ${cases}: ${draft.edit.kind==="commands"?draft.edit.data[0].kind:draft.edit.kind}`,{cause:error});}
      }
      assert.throws(()=>core.captureSuggestion("Wrong scope","alice","0",{...requests[3],scope:"commands"}));
      assert.deepEqual([core.checkpointJson(),core.updateFrame(),core.documentJson()],exact);
    }finally{core.dispose();}
  }}finally{profile.free();}
  assert.equal(cases,28);return cases;
}
export async function probeSuggestionSdk(directory, executable) {
  const result = await probeSuggestionRelay(directory, executable, {proposalCapture: "wasm-sdk"});
  const pureSemanticIntentShapes=await pureIntentShapes(directory);
  return {...result, format: "breditor/suggestion-sdk-functional-probe",pureSemanticIntentShapes,
    scope: "Actual canonical application Wasm and exported typed SDK capture/read/source proof, opaque pure previews, Pending/Conflict and exact retained V2 effect receipts, combined with the real authenticated durable host. Seven additional semantic intent forms cover all four selection/history combinations. Explicit/natural histories, table merges, independent fields, offline source retry, owned once-only decisions and exact restart. This probe drives wire requests and offline choices explicitly; durable queue and automatic author transport each have a separate probe. Accepting-user Undo, review UI and installed mixed acceptance remain active work."};
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4) throw Error("Expected matching application Wasm directory and isolated native suggestion host");
  console.log(JSON.stringify(await probeSuggestionSdk(...process.argv.slice(2)), null, 2));
}
