import init,* as wasm from "/wasm.js";
import {compileStandardRichProfileV4,createStandardRichInlinePresentationV1,createRichToolbarV4,mountRichEditor} from "/rich.js";

const status=document.querySelector("#section-status");
const report=error=>{status.textContent=error instanceof Error?error.message:String(error);};
try{
 await init();
 const schema={name:"example/section-demo",version:4};
 const profile=compileStandardRichProfileV4(wasm,JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:9,schema,extensions:[]}));
 const {schemaFingerprint}=profile.descriptor();
 const block=(kind,id,children,properties={})=>({kind:"element",type:`breditor/${kind}`,entityId:null,properties:{"breditor/block-id":id,...properties},children});
 const run=text=>[{kind:"text",text,formats:[]}];
 const section=(id,title,body,open=false)=>block("details",id,[
  block("details-summary",`${id}-summary`,run(title)),
  block("paragraph",`${id}-body`,run(body)),
 ],open?{"breditor/details-open":true}:{});
 const root={kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"sections"},children:[
  block("heading","heading",run("Project handover"),{"breditor/level":2}),
  section("first","Review the handover","Read the release notes and check that the open tasks have owners.",true),
  section("second","Recover a local copy","Open an exact checkpoint in a separate editor before replacing your working copy."),
 ]};
 const inlinePresentation=createStandardRichInlinePresentationV1(profile.inlineCatalogJson());
 const core=profile.createEditor(JSON.stringify({format:"breditor/document",formatVersion:2,schema,schemaFingerprint,root}));
 const controls=new Set(["undo","redo","wrap-details"]);
 const editor=mountRichEditor(document.querySelector("#section-editor"),{
  core,inlinePresentation,toolbar:createRichToolbarV4(core,inlinePresentation).filter(item=>controls.has(item.id)),onError:report,
 });
 status.textContent="Ready";
 window.addEventListener("pagehide",event=>{if(!event.persisted){editor.dispose();profile.dispose();}});
}catch(error){report(error);}
