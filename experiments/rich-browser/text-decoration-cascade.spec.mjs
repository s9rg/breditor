import {test,expect} from "@playwright/test";
import {fileURLToPath} from "node:url";
import {rolldown} from "rolldown";

test("supported shorthand and longhand decoration share one native cascade",async({page})=>{
 const graph=await rolldown({input:fileURLToPath(new URL("../../packages/breditor-interchange/src/index.ts",import.meta.url)),platform:"browser",logLevel:"silent"});
 const js=(await graph.generate({format:"esm"})).output[0].code;await graph.close();
 await page.route("**/decoration-interchange.js",route=>route.fulfill({body:js,contentType:"text/javascript"}));
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 const result=await page.evaluate(async()=>{
  const api=await import("/rich.js"),{createRichInterchange}=await import("/decoration-interchange.js");
  const profile=api.compileStandardRichProfileV4(window.rich.wasm,JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:9,schema:{name:"example/b10-decoration",version:1},extensions:[]}));
  const {schema,schemaFingerprint}=profile.descriptor(),root={kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[
   {kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":"base"},children:[]}
  ]};
  let owner=profile.createDocumentEditor(JSON.stringify({format:"breditor/document",formatVersion:2,schema,schemaFingerprint,root})),reopened;
  const source='<style>.marked{text-decoration:underline!important}.crossed{text-decoration-line:line-through!important}</style>'+
   '<p><span class="marked" style="text-decoration-line:none">Underline</span></p>'+
   '<p><span class="crossed" style="text-decoration:none">Strike</span></p>'+
   '<p><span style="text-decoration:underline;text-decoration-line:line-through">Last line</span></p>'+
   '<p><span style="text-decoration-line:underline;text-decoration:none">Reset</span></p>'+
   '<p><span style="text-decoration:underline line-through">Both</span></p>';
  const sourceDom=document.createElement("main");sourceDom.innerHTML=source;document.body.append(sourceDom);
  const browser=[...sourceDom.querySelectorAll("span")].map(span=>getComputedStyle(span).textDecorationLine);
  try{
   const imported=createRichInterchange(owner).importHtml(source);
   if(!imported.ok)throw Error(imported.error);
   owner.selectDocument();owner.pasteDocumentClipboard(imported.value.structuredJson,"decoration");
   const checkpoint=owner.checkpointJson();owner.dispose();owner=undefined;
   reopened=profile.restoreDocumentEditor(checkpoint);
   const exact=reopened.checkpointJson()===checkpoint;
   reopened.selectDocument();
   const portable=createRichInterchange(reopened).exportHtml(reopened.copyDocument().structuredJson);
   if(!portable.ok)throw Error(portable.error);
   const paras=JSON.parse(reopened.documentJson()).root.children.slice(0,5);
   const parsed=new DOMParser().parseFromString(portable.value,"text/html");
   return {exact,browser,native:paras.map(p=>p.children[0].formats.map(f=>f.type)),serialized:[...parsed.querySelectorAll("p")].slice(0,5).map(p=>[Boolean(p.querySelector("u")),Boolean(p.querySelector("s"))]),notices:imported.losses};
  }finally{sourceDom.remove();reopened?.dispose();owner?.dispose();profile.dispose();}
 });
 const underline="breditor-inline/underline",strike="breditor-inline/strike";
 expect(result).toEqual({exact:true,browser:["underline","line-through","line-through","none","underline line-through"],
  native:[[underline],[strike],[strike],[],[strike,underline]],serialized:[[true,false],[false,true],[false,true],[false,false],[true,true]],notices:[]});
});
