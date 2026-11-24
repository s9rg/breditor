import {test,expect} from "@playwright/test";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {rolldown} from "rolldown";

// The paired installed proof runs this native test again with the shared runtime.
const sharedProof=process.env.BREDITOR_HTML_PAGE_SHARED_PROOF==="1";
const js="text/javascript; charset=utf-8";
async function bundle(input){
 const graph=await rolldown({input:fileURLToPath(input),platform:"browser",logLevel:"silent"});
 try{return (await graph.generate({format:"esm"})).output[0].code;}finally{await graph.close();}
}

test(`imports editable host page metadata alongside an admitted ${sharedProof?"shared":"local"} body`,async({page})=>{
 const converter=await bundle(new URL("../../packages/breditor-interchange/src/index.ts",import.meta.url));
 await page.route("**/page-interchange.js",r=>r.fulfill({contentType:js,body:converter}));
 if(sharedProof){
  const shared=await bundle(import.meta.resolve("@breditor/collaboration"));
  await page.route("**/page-shared.js",r=>r.fulfill({contentType:js,body:shared}));
  const read=path=>readFileSync(new URL(import.meta.resolve(`@breditor/collaboration/${path}`)));
  await page.route("**/page-shared-wasm.js",r=>r.fulfill({contentType:js,body:read("wasm")}));
  await page.route("**/breditor_shared_bg.wasm",r=>r.fulfill({contentType:"application/wasm",body:read("wasm-binary")}));
 }
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 await page.evaluate(async shared=>{
  window.pageConverter=await import("/page-interchange.js");
  window.richApi=await import("/rich.js");
  if(shared){const wasm=await import("/page-shared-wasm.js");await wasm.default();window.pageShared={api:await import("/page-shared.js"),wasm};}
 },sharedProof);
 const requests=[];
 page.on("request",request=>requests.push(request.url()));
 const result=await page.evaluate(()=>{
  const {importHtmlPage,exportHtmlPage}=window.pageConverter,api=window.richApi,shared=window.pageShared;
  const schemaId={name:"example/b8-page-import",version:1},extensions=[];
  const profile=shared?shared.api.compileStandardRichSharedProfileV4(shared.wasm,{format:"breditor/shared-rich-profile",formatVersion:4,schema:schemaId,extensions}):
   api.compileStandardRichProfileV4(window.rich.wasm,JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:9,schema:schemaId,extensions}));
  const {schema,schemaFingerprint}=shared?JSON.parse(profile.descriptor_json()):profile.descriptor();
  const root={kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[
   {kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":"intro"},children:[]}
  ]};
  const seed=JSON.stringify({format:"breditor/document",formatVersion:2,schema,schemaFingerprint,root});
  let owner=shared?shared.api.createSharedDocumentEditor(profile.create(seed,"101")):profile.createDocumentEditor(seed);
  let reopened;
  try{
   const source='<!doctype html><html lang="PT-br" dir="RTL"><head><meta charset="utf-8"><title>Draft &amp; 概要</title>'+
    '<meta name="description" content="Initial description"><meta name="description" content="Ignored duplicate">'+
    '<base href="https://example.invalid/"><meta http-equiv="refresh" content="0; URL=/elsewhere"><script>void 0</script>'+
    '<link rel="stylesheet" href="/theme.css"><link rel="preload" href="/anything.png"><style>.headline{color:#123456}</style></head>'+
    '<body><h2 class="headline">Newsletter</h2><p lang="fr-ca">Bonjour</p><img src="/denied.png" alt="Denied picture"></body></html>';
   const seen=[],before=owner.checkpointJson(),admitted=importHtmlPage(owner,source,{resolveImage:({src})=>{seen.push(src);return undefined;}});
   if(!admitted.ok)throw Error(admitted.error);
   const untouched=owner.checkpointJson()===before;
   const {metadata,body}=admitted.value,frozen=Object.isFrozen(metadata)&&Object.isFrozen(body);
   owner.selectDocument();owner.pasteDocumentClipboard(body.structuredJson,"page",owner.view().revision);
   const draft=JSON.parse(owner.documentJson()).root.children,headline=draft[0],paragraph=draft[1];
   const inheritedDirection=headline.properties["breditor/block-direction"]??null;
   const marks=node=>node.children.flatMap(run=>run.formats).map(format=>format.type);
   const point={block:headline.properties["breditor/block-id"],offset:"10",affinity:"after"};
   const selection={kind:"text",anchor:point,focus:point};
   if(shared){owner.select(selection);owner.type(" edited",owner.view().revision);}
   else{owner.execute({kind:"setSelection",selection});owner.execute({kind:"insertPlainText",text:" edited"});}
   const saved=JSON.stringify({host:{...metadata,title:"Published & 概要",description:'"Quoted" notes',language:"ja",direction:"ltr"},checkpoint:owner.checkpointJson()});
   owner.dispose();owner=undefined;
   const {host,checkpoint}=JSON.parse(saved);
   reopened=shared?shared.api.createSharedDocumentEditor(profile.restore_document("room",checkpoint)):profile.restoreDocumentEditor(checkpoint);
   const exact=reopened.checkpointJson()===checkpoint;
   reopened.selectDocument();
   const clipboard=reopened.copyDocument(),transfer=shared?clipboard.richJson:clipboard.structuredJson;
   const beforeExport=reopened.checkpointJson(),rendered=exportHtmlPage(reopened,transfer,host);
   if(!rendered.ok)throw Error(rendered.error);
   const parsed=new DOMParser().parseFromString(rendered.value,"text/html"),roundtrip=importHtmlPage(reopened,rendered.value);
   if(!roundtrip.ok)throw Error(roundtrip.error);
   return {metadata,frozen,untouched,exact,unchanged:reopened.checkpointJson()===beforeExport,seen,notices:admitted.losses,
    inheritedDirection,headlineMarks:marks(headline),authoredMarks:marks(paragraph),
    bodyText:parsed.body.textContent,headlineColor:parsed.querySelector("h2 span").style.color,
    authoredLanguage:parsed.querySelector("[lang='fr-CA']").textContent,htmlLang:parsed.documentElement.lang,dir:parsed.documentElement.dir,
    unsafe:parsed.querySelectorAll("base,script,link,meta[http-equiv],style,img").length,roundtrip:roundtrip.value.metadata};
  }finally{reopened?.dispose();owner?.dispose();if(shared)profile.free();else profile.dispose();}
 });
 expect(result).toEqual({metadata:{title:"Draft & 概要",description:"Initial description",language:"pt-BR",direction:"rtl"},
  frozen:true,untouched:true,exact:true,unchanged:true,seen:["/denied.png"],inheritedDirection:null,
  headlineMarks:["breditor-inline/text-color"],authoredMarks:["breditor/text-language"],bodyText:"Newsletter editedBonjourDenied picture",
  headlineColor:"rgb(18, 52, 86)",authoredLanguage:"Bonjour",htmlLang:"ja",dir:"ltr",unsafe:0,
  notices:[{code:"image-reference",count:1,effect:"loss"},{code:"removed-content",count:5,effect:"loss"},{code:"unsupported-style",count:1,effect:"loss"}],
  roundtrip:{title:"Published & 概要",description:'"Quoted" notes',language:"ja",direction:"ltr"}});
 expect(requests).toEqual([]);
});
