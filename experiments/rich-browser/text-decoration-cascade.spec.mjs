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
  const rules='<style>.marked{text-decoration:underline!important}.crossed{text-decoration-line:line-through!important}'+
   '.rich{text-decoration:line-through dotted red 2px!important}</style>';
  const rows=[
   '<span class="marked" style="text-decoration-line:none">Underline</span>',
   '<span class="crossed" style="text-decoration:none">Strike</span>',
   '<span style="text-decoration:underline;text-decoration-line:line-through">Last line</span>',
   '<span style="text-decoration-line:underline;text-decoration:none">Reset</span>',
   '<span style="text-decoration:underline line-through">Both</span>',
   '<span style="text-decoration:underline;text-decoration:line-through dotted">Rich override</span>',
   '<span style="text-decoration:line-through dotted;text-decoration:underline">Plain reset</span>',
   '<span class="rich" style="text-decoration-line:none">Rich priority</span>',
   '<span style="text-decoration-line:underline;text-decoration:dotted">Omitted line</span>',
   '<span class="rich" style="text-decoration-line:underline!important">Line-only priority</span>',
   '<span class="rich" style="text-decoration:underline!important">Full priority reset</span>',
  ].map(span=>`<p>${span}</p>`);
  const source=rules+rows.join("");
  const sourceDom=document.createElement("main");sourceDom.innerHTML=source;document.body.append(sourceDom);
  const browser=[...sourceDom.querySelectorAll("span")].map(span=>getComputedStyle(span).textDecorationLine);
  try{
   const interchange=createRichInterchange(owner);
   const imported=interchange.importHtml(source);
   if(!imported.ok)throw Error(imported.error);
   const notices=rows.map(row=>{
    const result=interchange.importHtml(rules+row);
    if(!result.ok)throw Error(result.error);
    return result.losses;
   });
   owner.selectDocument();owner.pasteDocumentClipboard(imported.value.structuredJson,"decoration");
   const checkpoint=owner.checkpointJson();owner.dispose();owner=undefined;
   reopened=profile.restoreDocumentEditor(checkpoint);
   const exact=reopened.checkpointJson()===checkpoint;
   reopened.selectDocument();
   const portable=createRichInterchange(reopened).exportHtml(reopened.copyDocument().structuredJson);
   if(!portable.ok)throw Error(portable.error);
   const paras=JSON.parse(reopened.documentJson()).root.children.slice(0,browser.length);
   const parsed=new DOMParser().parseFromString(portable.value,"text/html");
   return {exact,browser,native:paras.map(p=>p.children[0].formats.map(f=>f.type)),serialized:[...parsed.querySelectorAll("p")].slice(0,browser.length).map(p=>[Boolean(p.querySelector("u")),Boolean(p.querySelector("s"))]),notices};
  }finally{sourceDom.remove();reopened?.dispose();owner?.dispose();profile.dispose();}
 });
 const underline="breditor-inline/underline",strike="breditor-inline/strike";
 const loss=[{code:"unsupported-style",effect:"loss",count:1}];
 expect(result).toEqual({exact:true,browser:["underline","line-through","line-through","none","underline line-through","line-through","underline","line-through","none","underline","underline"],
  native:[[underline],[strike],[strike],[],[strike,underline],[strike],[underline],[strike],[],[underline],[underline]],
  serialized:[[true,false],[false,true],[false,true],[false,false],[true,true],[false,true],[true,false],[false,true],[false,false],[true,false],[true,false]],
  notices:[[],[],[],[],[],loss,[],loss,loss,loss,[]]});
});
