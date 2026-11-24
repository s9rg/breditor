import {test,expect} from "@playwright/test";
import {fileURLToPath} from "node:url";
import {rolldown} from "rolldown";
test("preserves authored cell widths below widthless explicit columns",async({page})=>{
 const bundle=await rolldown({input:fileURLToPath(new URL("../../packages/breditor-interchange/src/index.ts",import.meta.url)),platform:"browser",logLevel:"silent"});
 const js=(await bundle.generate({format:"esm"})).output[0].code;await bundle.close();
 await page.route("**/b9.js",r=>r.fulfill({body:js,contentType:"text/javascript"}));
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 const result=await page.evaluate(async()=>{
  const api=await import("/rich.js"),{createRichInterchange}=await import("/b9.js");
  const profile=api.compileStandardRichProfileV4(window.rich.wasm,JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:9,schema:{name:"example/b9-col",version:1},extensions:[]}));
  const {schema,schemaFingerprint}=profile.descriptor();
  const root={kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[{kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":"base"},children:[]}]};
  const owner=profile.createDocumentEditor(JSON.stringify({format:"breditor/document",formatVersion:2,schema,schemaFingerprint,root}));
  const cases=[
   '<table><colgroup><col><col width="96"></colgroup><tr><td width="240">First</td><td>Second</td></tr></table>',
   '<table><colgroup><col span="2"></colgroup><tr><td width="240">First</td><td width="160">Second</td></tr></table>',
   '<table><colgroup><col width="170"></colgroup><tr><td width="240">First</td></tr></table>',
   '<table><colgroup><col width="50%"></colgroup><tr><td width="240">First</td></tr></table>',
   '<table><colgroup width="50%"><col></colgroup><tr><td width="240">First</td></tr></table>',
  ];
  try{
   const adapter=createRichInterchange(owner);
   return cases.map((source,index)=>{
    const imported=adapter.importHtml(source);
    if(!imported.ok)throw Error(imported.error);
    owner.selectDocument();owner.pasteDocumentClipboard(imported.value.structuredJson,"column"+index,owner.view().revision);
    const checkpoint=owner.checkpointJson(),reopened=profile.restoreDocumentEditor(checkpoint);
    try{
     const exact=reopened.checkpointJson()===checkpoint;
     const table=JSON.parse(reopened.documentJson()).root.children.find(n=>n.type==="breditor/table");
     const native=table.properties["breditor/columns"].map(column=>column.width);
     reopened.selectDocument();const html=createRichInterchange(reopened).exportHtml(reopened.copyDocument().structuredJson);
     if(!html.ok)throw Error(html.error);
     const rendered=new DOMParser().parseFromString(html.value,"text/html");
     const widths=[...rendered.querySelectorAll("col")].map(element=>Number(element.getAttribute("width")));
     const cells=[...rendered.querySelectorAll("td")].map(element=>element.textContent);
     return {native,widths,exact,cells,losses:imported.losses};
    }finally{reopened.dispose();}
   });
  }finally{owner.dispose();profile.dispose();}
 });
 const cases=[[240,96],[240,160],[170],[120],[120]];
 expect(result).toEqual(cases.map((widths,index)=>({native:widths,widths,exact:true,cells:widths.length===2?["First","Second"]:["First"],
  losses:index>=3?[{code:"table-width",count:1,effect:"loss"}]:[]})));
});
