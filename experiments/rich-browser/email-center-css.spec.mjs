import {test,expect} from "@playwright/test";
import {fileURLToPath} from "node:url";
import {rolldown} from "rolldown";
test("preserves the supported cascade of legacy email center wrappers",async({page})=>{
 const bundle=await rolldown({input:fileURLToPath(new URL("../../packages/breditor-interchange/src/index.ts",import.meta.url)),platform:"browser",logLevel:"silent"});
 const js=(await bundle.generate({format:"esm"})).output[0].code;await bundle.close();
 await page.route("**/b8-interchange.js",r=>r.fulfill({body:js,contentType:"text/javascript"}));
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 const result=await page.evaluate(async()=>{
  const api=await import("/rich.js"),{createRichInterchange}=await import("/b8-interchange.js");
  const profile=api.compileStandardRichProfileV4(window.rich.wasm,JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:9,schema:{name:"example/b8-email",version:1},extensions:[]}));
  const {schema,schemaFingerprint}=profile.descriptor();
  const root={kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[{kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":"base"},children:[]}]};
  const owner=profile.createDocumentEditor(JSON.stringify({format:"breditor/document",formatVersion:2,schema,schemaFingerprint,root}));
  const examples=[
   '<style>center.email{text-align:left}</style><center class="email"><p>Newsletter</p></center>',
   '<style>center.email{text-align:left}</style><center class="email" style="text-align:right"><p>Newsletter</p></center>',
   '<center><p>Newsletter</p></center>',
   '<div style="text-align:right"><center style="text-align:inherit"><p>Newsletter</p></center></div>',
   '<div style="text-align:right"><center style="text-align:unset"><p>Newsletter</p></center></div>',
   '<div style="text-align:right"><center style="text-align:initial"><p>Newsletter</p></center></div>',
  ];
  try{
   const adapter=createRichInterchange(owner);
   return examples.map((source,index)=>{
    const rendered=document.createElement("div");rendered.innerHTML=source;document.body.append(rendered);
    try{
     const raw=getComputedStyle(rendered.querySelector("p")).textAlign,browser=["-webkit-center","-moz-center"].includes(raw)?"center":raw;
     const input=adapter.importHtml(source);if(!input.ok)throw Error(input.error);
     owner.selectDocument();owner.pasteDocumentClipboard(input.value.structuredJson,"email"+index,owner.view().revision);
     const checkpoint=owner.checkpointJson(),recovered=profile.restoreDocumentEditor(checkpoint);
     try{
      const tree=JSON.parse(recovered.documentJson()).root.children[0],native=tree.properties["breditor/block-align"];
      const exact=recovered.checkpointJson()===checkpoint;
      recovered.selectDocument();
      const fragment=createRichInterchange(recovered).exportHtml(recovered.copyDocument().structuredJson);
      if(!fragment.ok)throw Error(fragment.error);
      const parsed=new DOMParser().parseFromString(fragment.value,"text/html"),exported=parsed.querySelector("p").style.textAlign;
      return {browser,native,exported,exact,losses:input.losses};
     }finally{recovered.dispose();}
    }finally{rendered.remove();}
   });
  }finally{owner.dispose();profile.dispose();}
 });
 const expected=[["left",5],["right",6],["center",2],["right",6],["right",6],["start",1]];
 expect(result).toEqual(expected.map(([browser,native])=>({browser,native,exported:browser,exact:true,losses:[]})));
});
