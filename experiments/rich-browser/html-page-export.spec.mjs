import {test,expect} from "@playwright/test";
import {fileURLToPath} from "node:url";
import {rolldown} from "rolldown";

test("exports a bounded standalone page from a cold-restored native document",async({page})=>{
 const bundle=await rolldown({input:fileURLToPath(new URL("../../packages/breditor-interchange/src/index.ts",import.meta.url)),platform:"browser",logLevel:"silent"});
 const js=(await bundle.generate({format:"esm"})).output[0].code;await bundle.close();
 await page.route("**/page-interchange.js",route=>route.fulfill({body:js,contentType:"text/javascript"}));
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 await page.evaluate(async()=>{window.pageExportModules=await Promise.all([import("/rich.js"),import("/page-interchange.js")]);});
 const requests=[];
 page.on("request",request=>requests.push(request.url()));
 const result=await page.evaluate(()=>{
  const [api,{createRichInterchange,exportHtmlPage}]=window.pageExportModules;
  const profile=api.compileStandardRichProfileV4(window.rich.wasm,JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:9,schema:{name:"example/b7-page",version:1},extensions:[]}));
  const {schema,schemaFingerprint}=profile.descriptor();
  const root={kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[{kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":"original"},children:[]}]};
  const owner=profile.createDocumentEditor(JSON.stringify({format:"breditor/document",formatVersion:2,schema,schemaFingerprint,root}));
  let reopened;
  try{
   const source='<!doctype html><html><head><base href="https://example.invalid/"><meta http-equiv="refresh" content="0; URL=/outside">'+
    '<link rel="stylesheet" href="/outside.css"><script>void 0</script><style>.headline{color:#123456}</style></head>'+
    '<body><h2 class="headline">Quarterly notes</h2><p>Body before edit.</p><table><tr><th>Heading</th><td>Cell</td></tr></table></body></html>';
   const admitted=createRichInterchange(owner).importHtml(source);
   if(!admitted.ok)throw Error(admitted.error);
   owner.selectDocument();owner.pasteDocumentClipboard(admitted.value.structuredJson,"page",owner.view().revision);
   const paragraph=JSON.parse(owner.documentJson()).root.children.find(node=>node.type==="breditor/paragraph");
   const block=paragraph.properties["breditor/block-id"],point={block,offset:String(paragraph.children[0].text.length),affinity:"after"};
   owner.execute({kind:"setSelection",selection:{kind:"text",anchor:point,focus:point}});
   owner.execute({kind:"insertPlainText",text:" Saved edit."});
   const checkpoint=owner.checkpointJson();reopened=profile.restoreDocumentEditor(checkpoint);
   const exact=reopened.checkpointJson()===checkpoint;
   reopened.selectDocument();const transfer=reopened.copyDocument().structuredJson,before=reopened.checkpointJson();
   const metadata={title:"Q4 </title> & 概要",description:'" onload="ignored',language:"PT-br",direction:"rtl"};
   const rendered=exportHtmlPage(reopened,transfer,metadata),fragment=createRichInterchange(reopened).exportHtml(transfer);
   if(!rendered.ok||!fragment.ok)throw Error("Expected a native HTML page and fragment");
   const parsed=new DOMParser().parseFromString(rendered.value,"text/html");
   const again=exportHtmlPage(reopened,transfer,metadata);
   return {exact,unchanged:reopened.checkpointJson()===before,doctype:parsed.doctype.name,
    lang:parsed.documentElement.lang,direction:parsed.documentElement.dir,title:parsed.title,
    description:parsed.head.querySelector('meta[name="description"]').content,
    head:[...parsed.head.children].map(node=>node.tagName),active:parsed.querySelectorAll('script,base,link,[http-equiv],[onload]').length,
    body:[...parsed.body.children].map(node=>[node.tagName,node.textContent]),color:parsed.body.querySelector("h2 span").style.color,
    sameBody:rendered.value.endsWith("<body>"+fragment.value+"</body></html>"),sameBytes:again.ok&&again.value===rendered.value,
    notices:admitted.losses.map(n=>n.code)};
  }finally{reopened?.dispose();owner.dispose();profile.dispose();}
 });
 expect(result).toMatchObject({exact:true,unchanged:true,doctype:"html",lang:"pt-BR",direction:"rtl",title:"Q4 </title> & 概要",description:'" onload="ignored',
  head:["META","TITLE","META"],active:0,body:[["H2","Quarterly notes"],["P","Body before edit. Saved edit."],["TABLE","HeadingCell"],["P",""]],
  color:"rgb(18, 52, 86)",sameBody:true,sameBytes:true,notices:["removed-content","unsupported-style"]});
 expect(requests).toEqual([]);
});
