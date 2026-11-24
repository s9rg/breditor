import {test,expect} from "@playwright/test";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {rolldown} from "rolldown";

const sharedProof=process.env.BREDITOR_FIGURE_CAPTION_SHARED_PROOF==="1",js="text/javascript; charset=utf-8";
async function bundle(input){
 const graph=await rolldown({input:fileURLToPath(input),platform:"browser",logLevel:"silent"});
 try{return (await graph.generate({format:"esm"})).output[0].code;}finally{await graph.close();}
}
test(`binds an authored table figure caption to its native ${sharedProof?"shared":"local"} table`,async({page})=>{
 const interchange=await bundle(new URL("../../packages/breditor-interchange/src/index.ts",import.meta.url));
 await page.route("**/figure-interchange.js",route=>route.fulfill({contentType:js,body:interchange}));
 if(sharedProof){
  const shared=await bundle(import.meta.resolve("@breditor/collaboration"));
  const read=path=>readFileSync(new URL(import.meta.resolve(`@breditor/collaboration/${path}`)));
  await page.route("**/figure-shared.js",route=>route.fulfill({contentType:js,body:shared}));
  await page.route("**/figure-shared-wasm.js",route=>route.fulfill({contentType:js,body:read("wasm")}));
  await page.route("**/breditor_shared_bg.wasm",route=>route.fulfill({contentType:"application/wasm",body:read("wasm-binary")}));
 }
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 await page.evaluate(async shared=>{
  window.figureModules=await Promise.all([import("/rich.js"),import("/figure-interchange.js")]);
  if(shared){const wasm=await import("/figure-shared-wasm.js");await wasm.default();window.figureShared={api:await import("/figure-shared.js"),wasm};}
 },sharedProof);
 const result=await page.evaluate(()=>{
  const [api,{createRichInterchange}]=window.figureModules,shared=window.figureShared;
  const schemaId={name:"example/b10-figure-caption",version:1},extensions=[];
  const profile=shared?shared.api.compileStandardRichSharedProfileV4(shared.wasm,{format:"breditor/shared-rich-profile",formatVersion:4,schema:schemaId,extensions}):
   api.compileStandardRichProfileV4(window.rich.wasm,JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:9,schema:schemaId,extensions}));
  const {schema,schemaFingerprint}=shared?JSON.parse(profile.descriptor_json()):profile.descriptor();
  const root={kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[
   {kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":"base"},children:[]}
  ]};
  const seed=JSON.stringify({format:"breditor/document",formatVersion:2,schema,schemaFingerprint,root});
  let owner=shared?shared.api.createSharedDocumentEditor(profile.create(seed,"101")):profile.createDocumentEditor(seed),reopened;
  const figure='<figure class="table"><table><tr><th>Day</th><td>Friday</td></tr></table><figcaption><p>Delivery <strong>schedule</strong></p></figcaption></figure>';
  const text=node=>node.children.map(run=>run.text??"").join("");
  try{
   const adapter=createRichInterchange(owner),admitted=adapter.importHtml(figure),before=owner.checkpointJson();
   if(!admitted.ok)throw Error(admitted.error);
   const nested=adapter.importHtml('<table><tr><td>'+figure+'</td></tr></table>');
   const dual=adapter.importHtml('<figure><table><caption>Inner caption</caption><tr><td>Cell</td></tr></table><figcaption>Outer text</figcaption></figure>');
   const complex=adapter.importHtml('<figure><table><tr><td>First</td></tr></table><figcaption><p>Separate flow</p><table><tr><td>Second</td></tr></table></figcaption></figure>');
   if(!dual.ok)throw Error(dual.error);
   if(!complex.ok)throw Error(complex.error);
   const complexTypes=JSON.parse(complex.value.structuredJson).document.root.children.map(node=>node.type);
   const explicit=JSON.parse(dual.value.structuredJson).document.root.children;
   const untouched=owner.checkpointJson()===before;
   owner.selectDocument();owner.pasteDocumentClipboard(admitted.value.structuredJson,"figure",owner.view().revision);
   const table=JSON.parse(owner.documentJson()).root.children.find(node=>node.type==="breditor/table"),caption=table.children.at(-1);
   const block=caption.properties["breditor/block-id"],point={block,offset:"8",affinity:"after"},selection={kind:"text",anchor:point,focus:point};
   if(shared){owner.select(selection);owner.type(" updated",owner.view().revision);}
   else{owner.execute({kind:"setSelection",selection});owner.execute({kind:"insertPlainText",text:" updated"});}
   const checkpoint=owner.checkpointJson();owner.dispose();owner=undefined;
   reopened=shared?shared.api.createSharedDocumentEditor(profile.restore_document("room",checkpoint)):profile.restoreDocumentEditor(checkpoint);
   const exact=reopened.checkpointJson()===checkpoint;
   reopened.selectDocument();const transfer=reopened.copyDocument(),converter=createRichInterchange(reopened);
   const exported=converter.exportHtml(shared?transfer.richJson:transfer.structuredJson);
   if(!exported.ok)throw Error(exported.error);
   const parsed=new DOMParser().parseFromString(exported.value,"text/html"),display=parsed.querySelector("table > caption");
   const again=converter.importHtml(exported.value);
   if(!again.ok)throw Error(again.error);
   const roundTripTable=JSON.parse(again.value.structuredJson).document.root.children.find(node=>node.type==="breditor/table");
   return {caption:text(caption),exact,untouched,nested:nested.error,dual:[text(explicit[0].children.at(-1)),text(explicit[1])],complexTypes,
    losses:admitted.losses,display:display.textContent,side:display.style.captionSide,strong:display.querySelector("strong")?.textContent,
    roundTrip:text(roundTripTable.children.at(-1)),headers:[...parsed.querySelectorAll("th")].map(el=>el.textContent)};
  }finally{reopened?.dispose();owner?.dispose();if(shared)profile.free();else profile.dispose();}
 });
 expect(result).toEqual({caption:"Delivery schedule",exact:true,untouched:true,nested:"unsupported-content",dual:["Inner caption","Outer text"],
  complexTypes:["breditor/table","breditor/paragraph","breditor/table"],
  losses:[],display:"Delivery updated schedule",side:"bottom",strong:"schedule",roundTrip:"Delivery updated schedule",headers:["Day"]});
});
