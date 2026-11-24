import {test,expect} from "@playwright/test";
import {fileURLToPath} from "node:url";
import {rolldown} from "rolldown";

test("disclosure summary text round-trips with authored spaces and hard breaks",async({page})=>{
 const graph=await rolldown({input:fileURLToPath(new URL("../../packages/breditor-interchange/src/index.ts",import.meta.url)),platform:"browser",logLevel:"silent"});
 const js=(await graph.generate({format:"esm"})).output[0].code;await graph.close();
 await page.route("**/summary-interchange.js",route=>route.fulfill({body:js,contentType:"text/javascript"}));
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 const result=await page.evaluate(async()=>{
  const api=await import("/rich.js"),{createRichInterchange}=await import("/summary-interchange.js");
  const profile=api.compileStandardRichProfileV4(window.rich.wasm,JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:9,schema:{name:"example/b10-summary-spaces",version:1},extensions:[]}));
  const {schema,schemaFingerprint}=profile.descriptor(),root={kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[
   {kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":"base"},children:[]}
  ]};
  let owner=profile.createDocumentEditor(JSON.stringify({format:"breditor/document",formatVersion:2,schema,schemaFingerprint,root})),reopened;
  try{
   const adapter=createRichInterchange(owner),span='<summary style="white-space:pre-wrap">  First <strong> bold</strong><br><br>Second\tline  </summary>';
   const imported=adapter.importHtml('<details open>'+span+'<p>Body</p></details><details><summary>Plain label</summary><p>Unchanged</p></details>');
   if(!imported.ok)throw Error(imported.error);
   owner.selectDocument();owner.pasteDocumentClipboard(imported.value.structuredJson,"summary");
   const checkpoint=owner.checkpointJson();owner.dispose();owner=undefined;
   reopened=profile.restoreDocumentEditor(checkpoint);
   const exact=reopened.checkpointJson()===checkpoint;
   reopened.selectDocument();const transfer=reopened.copyDocument().structuredJson,reopenedAdapter=createRichInterchange(reopened),before=reopened.checkpointJson();
   const html=reopenedAdapter.exportHtml(transfer),markdown=reopenedAdapter.exportMarkdown(transfer);
   if(!html.ok||!markdown.ok)throw Error("Expected portable disclosure output");
   const parse=value=>JSON.parse(value.value.structuredJson).document.root.children.filter(n=>n.type==="breditor/details").map(details=>details.children[0].children);
   const expected=parse({value:{structuredJson:transfer}}),ht=reopenedAdapter.importHtml(html.value),md=reopenedAdapter.importMarkdown(markdown.value);
   if(!ht.ok||!md.ok)throw Error("Expected both formats to restore");
   const markup=new DOMParser().parseFromString(html.value,"text/html"),[first,plain]=markup.querySelectorAll("summary");
   return {exact,unchanged:reopened.checkpointJson()===before,whiteSpace:first.style.whiteSpace,plain:plain.outerHTML,
    text:first.textContent,source:expected[0].map(run=>run.text).join(""),html:parse(ht),markdown:parse(md),expected,
    strong:first.querySelector("strong").textContent};
  }finally{owner?.dispose();reopened?.dispose();profile.dispose();}
 });
 expect(result).toMatchObject({exact:true,unchanged:true,whiteSpace:"pre-wrap",plain:"<summary>Plain label</summary>",
  text:"  First  bold\n\nSecond\tline  ",source:"  First  bold\n\nSecond\tline  ",strong:" bold"});
 expect(result.html).toEqual(result.expected);
 expect(result.markdown).toEqual(result.expected);
});
