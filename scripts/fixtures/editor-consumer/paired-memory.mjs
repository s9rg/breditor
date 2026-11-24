import init,* as wasm from "@breditor/collaboration/wasm";
import wasmUrl from "@breditor/collaboration/wasm-binary?url";
import {SharedReviewPersistentSession,restoreSharedDocumentEditor} from "@breditor/collaboration";
import {fullscreenSeed} from "./fullscreen-seed.mjs";

await init({module_or_path:wasmUrl});
const profile=wasm.SharedRichProfile.from_standard_configuration_json_v3(JSON.stringify({
 format:"breditor/shared-rich-profile",formatVersion:3,schema:{name:"example/closed-paired-memory",version:1},extensions:[],
}));
const seed=JSON.parse(fullscreenSeed(JSON.parse(profile.descriptor_json()),3));
for(let block=0;block<60;block++){
 seed.root.children.push({kind:"element",type:"breditor/paragraph",entityId:null,
  properties:{"breditor/block-id":`memory-${block}`},
  children:[{kind:"text",text:`${block}: ${"large retained checkpoint ".repeat(130)}`,formats:[]}]});
}
const documentJson=JSON.stringify(seed);
const options={database:"paired-owner-release",room:"room",writer:"101",richLanguage:3,history:"explicit",
 rangeEditing:"general-v1",selectionEditing:"document-v1",review:{actor:"release-review",principal:"author",access:"comment"},
 create:()=>profile.create(documentJson,"101"),restore:checkpoint=>restoreSharedDocumentEditor(profile,"room",checkpoint),
};
let owner;
async function recordDigest(session){
 const bytes=new TextEncoder().encode(JSON.stringify(session.exportRecovery()));
 const hash=await crypto.subtle.digest("SHA-256",bytes);
 return {digest:Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,"0")).join(""),bytes:bytes.byteLength};
}
window.pairedMemory={
 async prepare(){
  owner=await SharedReviewPersistentSession.open(options);
  const anchorJson=owner.core.captureReviewAnchor({kind:"selection",selection:{kind:"node",block:"z-intro"}});
  const comment=owner.core.dispatchReview({kind:"create_thread",data:{anchorJson,body:"Keep the discussion with the document"}});
  if(comment.kind!=="committed")throw Error("Expected a retained comment");
  for(let i=0;i<14;i++)owner.saveVersion(`Version ${i}`,String(1792450000000+i));
  await owner.flush();
  return recordDigest(owner);
 },
 async close(){await owner.close();return owner.state().status;},
 async discardStartedWrite(){
  owner.saveVersion("Final version", "1792450000014");
  if(owner.state().status!=="pending")throw Error("Expected an outstanding version write");
  const captured=recordDigest(owner);
  await owner.discardAndClose();
  if(owner.state().status!=="closed")throw Error("Expected the paired owner to close");
  return captured;
 },
 forget(){owner=undefined;},
 async reopen(){
  const restored=await SharedReviewPersistentSession.open(options);
  try{return {recovered:restored.recovered,...await recordDigest(restored)};}
  finally{await restored.discardAndClose();}
 },
};
