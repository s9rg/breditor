import {test,expect} from "@playwright/test";
import {fileURLToPath} from "node:url";
import {rolldown} from "rolldown";
test("keeps authored HTML breaks and drops only a terminal Apple copy marker",async({page})=>{
 const bundle=await rolldown({input:fileURLToPath(new URL("../../packages/breditor-interchange/src/index.ts",import.meta.url)),platform:"browser",logLevel:"silent"});
 const js=(await bundle.generate({format:"esm"})).output[0].code;await bundle.close();
 await page.route("**/b7-interchange.js",r=>r.fulfill({body:js,contentType:"text/javascript"}));
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 const result=await page.evaluate(async()=>{
  const api=await import("/rich.js"),{createRichInterchange}=await import("/b7-interchange.js");
  const profile=api.compileStandardRichProfileV4(window.rich.wasm,JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:9,schema:{name:"example/b7-apple",version:1},extensions:[]}));
  const {schema,schemaFingerprint}=profile.descriptor();
  const root={kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[{kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":"base"},children:[]}]};
  const owner=profile.createDocumentEditor(JSON.stringify({format:"breditor/document",formatVersion:2,schema,schemaFingerprint,root}));
  try{
   const adapter=createRichInterchange(owner);
   return ['<p>A<br class="author\u00a0Apple-interchange-newline">B</p>',
    '<p>A<br class="Apple-interchange-newline">B</p>',
    '<p>A<br class="Apple-interchange-newline"></p><p>B</p>',
    '<p>Tail<br class="Apple-interchange-newline"></p>',
    '<p>Tail</p><span><br class="spacer\tApple-interchange-newline"></span>\n<!--selection-->'].map((html,index)=>{
    const admitted=adapter.importHtml(html);if(!admitted.ok)throw Error(admitted.error);
    owner.selectDocument();owner.pasteDocumentClipboard(admitted.value.structuredJson,"apple"+index,owner.view().revision);
    const checkpoint=owner.checkpointJson(),reopened=profile.restoreDocumentEditor(checkpoint);
    try{
     const paragraphs=tree=>tree.children.map(node=>node.children.map(run=>run.text).join(""));
     return {transfer:paragraphs(JSON.parse(admitted.value.structuredJson).document.root),
      restored:paragraphs(JSON.parse(reopened.documentJson()).root),
      exact:reopened.checkpointJson()===checkpoint};
    }finally{reopened.dispose();}
   });
  }finally{owner.dispose();profile.dispose();}
 });
 const texts=[["A\nB"],["A\nB"],["A\n","B"],["Tail"],["Tail"]];
 // The native document paste adds a terminal caret paragraph after these clipboard fragments.
 expect(result).toEqual(texts.map(paragraphs=>({transfer:paragraphs,restored:[...paragraphs,""],exact:true})));
});
