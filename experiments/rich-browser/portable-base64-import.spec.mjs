import {test,expect} from "@playwright/test";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {rolldown} from "rolldown";

const entries={
 interchange:"../../packages/breditor-interchange/src/index.ts",
 portable:"../../packages/breditor-interchange/src/portable_html.ts",
 prepared:"../../packages/breditor-interchange/src/portable_html_import.ts",
};
const scripts=new Map();
// The local matrix has only local Wasm. Enable this mode for a paired installed consumer.
const sharedProof=process.env.BREDITOR_PORTABLE_SHARED_PROOF==="1";
if(sharedProof)entries.shared="@breditor/collaboration";
test.beforeAll(async()=>{
 for(const [name,path] of Object.entries(entries)){
  const input=fileURLToPath(path.startsWith("@")?import.meta.resolve(path):new URL(path,import.meta.url));
  const bundle=await rolldown({input,platform:"browser",logLevel:"silent"});
  scripts.set(name,(await bundle.generate({format:"esm"})).output[0].code);
  await bundle.close();
 }
});

test(`prepares a verified portable raster before retained one-step ${sharedProof?"shared":"local"} paste`,async({page})=>{
 for(const [name,script] of scripts)await page.route("**/"+name+".js",route=>route.fulfill({contentType:"text/javascript",body:script}));
 if(sharedProof){
  const read=path=>readFileSync(new URL(import.meta.resolve(`@breditor/collaboration/${path}`)));
  await page.route("**/prepared-shared-wasm.js",route=>route.fulfill({contentType:"text/javascript",body:read("wasm")}));
  await page.route("**/breditor_shared_bg.wasm",route=>route.fulfill({contentType:"application/wasm",body:read("wasm-binary")}));
 }
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 await page.evaluate(async shared=>{
  window.portableImports=await Promise.all([import("/rich.js"),import("/interchange.js"),import("/portable.js"),import("/prepared.js")]);
  if(shared){const wasm=await import("/prepared-shared-wasm.js");await wasm.default();window.portableShared={api:await import("/shared.js"),wasm};}
 },sharedProof);
 const requests=[];
 page.on("request",request=>{if(!/^(blob|data):/.test(request.url()))requests.push(request.url());});
 const result=await page.evaluate(async()=>{
  const [api,{createRichInterchange},{exportPortableHtml,portableHtmlRasterLimits},{preparePortableHtmlImport}]=window.portableImports;
  const shared=window.portableShared,identity={name:"example/b7-portable-import",version:1};
  const profile=shared?shared.api.compileStandardRichSharedProfileV4(shared.wasm,{format:"breditor/shared-rich-profile",formatVersion:4,schema:identity,extensions:[]}):
   api.compileStandardRichProfileV4(window.rich.wasm,JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:9,schema:identity,extensions:[]}));
  const {schema,schemaFingerprint}=shared?JSON.parse(profile.descriptor_json()):profile.descriptor();
  const root={kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[
   {kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":"intro"},children:[{kind:"text",text:"Before paste",formats:[]}]}
  ]};
  const seed=JSON.stringify({format:"breditor/document",formatVersion:2,schema,schemaFingerprint,root});
  let owner=shared?shared.api.createSharedDocumentEditor(profile.create(seed,"101")):profile.createDocumentEditor(seed);
  const database="portable-base64-destination";
  let destination=await api.RichAssetStore.open(database),reopened;
  try{
   const canvas=document.createElement("canvas");canvas.width=3;canvas.height=2;
   const draw=canvas.getContext("2d");draw.fillStyle="blue";draw.fillRect(0,0,3,2);
   const bytes=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));
   const {asset}=await api.inspectRichRaster(bytes);
   const base64=btoa(String.fromCharCode(...new Uint8Array(await bytes.arrayBuffer())));
   const source=createRichInterchange(owner,{resolveImage:()=>({asset,generation:"source"})}).importHtml(
    '<p><strong>Portable raster</strong></p><figure><img src="owned.png" alt="Chart" width="180" height="120"><figcaption>Caption</figcaption></figure>'+
    '<img src="owned.png" alt="Repeat">'
   );
   if(!source.ok)throw Error(source.error);
   const html=await exportPortableHtml(owner,source.value.structuredJson,{loadImage:()=>bytes});
   if(!html.ok)throw Error(html.error);
   const input=html.value+'<img src="https://example.invalid/refused.png" alt="External">';
   const fromHtml=markup=>new DOMParser().parseFromString(markup,"text/html");
   const exportedUris=[...fromHtml(html.value).querySelectorAll("img")].map(node=>node.getAttribute("src"));
   const old=createRichInterchange(owner).importHtml(input),oldImages=old.ok&&JSON.parse(old.value.structuredJson).document.root.children.filter(node=>node.type==="breditor/image").length;
   owner.selectDocument();const before=owner.checkpointJson(),beforeDocument=owner.documentJson(),revision=owner.view().revision;
   const attempt=value=>preparePortableHtmlImport(owner,value,revision);
   const over="A".repeat(Math.ceil((portableHtmlRasterLimits.totalBytes+1)/3)*4);
   const invalid=await Promise.all([
    attempt('<p>First valid raster</p>'+html.value+'<img src="data:image/png;base64,A!==">'),
    attempt('<img src="data:image/jpeg;base64,'+base64+'">'),
    attempt('<img src="data:image/svg+xml;base64,PHN2Zy8+">'),
    attempt('<img src="data:image/png;base64,'+over+'">'),
    attempt('<img src="data:image/png;base64,AB==">'),
   ]);
   const deniedClean=owner.checkpointJson()===before&&(await destination.list()).length===0;
   const pending=attempt(input);owner.collapseDocumentSelection("before",revision);
   const changed=owner.checkpointJson(),midflight=await pending;
   const exactMidflight=owner.checkpointJson()===changed;
   owner.selectDocument();const prepare=()=>preparePortableHtmlImport(owner,input,owner.view().revision);
   const ready=await prepare();if(!ready.ok)throw Error(ready.error);
   const readyCheckpoint=owner.checkpointJson();
   const validRaster=ready.value.rasters[0],frozen=Object.isFrozen(ready.value)&&Object.isFrozen(ready.value.rasters)&&Object.isFrozen(validRaster);
   const preparedBytes=btoa(String.fromCharCode(...new Uint8Array(await validRaster.blob.arrayBuffer())));
   const noRetention=(await destination.list()).length===0;
   const wrong=ready.value.publish([{asset:"sha256:"+"0".repeat(64),generation:"retained"}],"wrong");
   const wrongClean=owner.checkpointJson()===readyCheckpoint;
   const stored=await destination.ingest(validRaster.blob);
   owner.collapseDocumentSelection("before",ready.value.sourceRevision);
   const beforeStale=owner.checkpointJson();let staleReads=0;
   const stale=ready.value.publish([{get asset(){staleReads++;return stored.asset;},generation:"retained"}],"old");
   const staleClean=owner.checkpointJson()===beforeStale;
   owner.selectDocument();const latest=await prepare();if(!latest.ok)throw Error(latest.error);
   const published=latest.value.publish([{asset:stored.asset,generation:"retained"}],"current");
   const depth=owner.view().undoDepth,after=owner.documentJson();
   if(shared)owner.undo();else owner.execute({kind:"undo"});const undone=owner.documentJson()===beforeDocument;
   if(shared)owner.redo();else owner.execute({kind:"redo"});const redone=owner.documentJson()===after;
   const checkpoint=owner.checkpointJson();
   owner.dispose();owner=undefined;
   reopened=shared?shared.api.createSharedDocumentEditor(profile.restore_document("room",checkpoint)):profile.restoreDocumentEditor(checkpoint);
   const exactRestore=reopened.checkpointJson()===checkpoint;
   destination.close();destination=await api.RichAssetStore.open(database);
   const imageNodes=JSON.parse(reopened.documentJson()).root.children.filter(node=>node.type==="breditor/image");
   const restored=await destination.blob(imageNodes[0].properties["breditor/asset-id"]);
   const restoredBytes=btoa(String.fromCharCode(...new Uint8Array(await restored.arrayBuffer())));
   const decoded=new Image(),url=URL.createObjectURL(restored);
   try{
    decoded.src=url;await decoded.decode();
    return {exportedUris:exportedUris.every(uri=>uri==="data:image/png;base64,"+base64),oldImages,invalid:invalid.map(value=>value.error),
     deniedClean,midflight:midflight.error,exactMidflight,frozen,noRetention,wrong:wrong.error,wrongClean,stale:stale.error,staleReads,staleClean,
     raster:[ready.value.rasters.length,validRaster.asset===asset,validRaster.mime,preparedBytes===base64],
     published:published.ok,losses:published.losses,depth,undone,redone,exactRestore,restoredBytes:restoredBytes===base64,
     decoded:[decoded.naturalWidth,decoded.naturalHeight],externalText:after.includes("External"),
     images:imageNodes.map(node=>[node.properties["breditor/asset-id"]===asset,node.properties["breditor/alt-text"]])};
   }finally{URL.revokeObjectURL(url);}
  }finally{reopened?.dispose();owner?.dispose();if(shared)profile.free();else profile.dispose();destination.close();}
 });
 expect(result).toEqual({exportedUris:true,oldImages:0,invalid:["invalid-raster","invalid-raster","invalid-raster","resource-limit","invalid-raster"],
  deniedClean:true,midflight:"stale-observation",exactMidflight:true,frozen:true,noRetention:true,wrong:"asset-policy",wrongClean:true,
  stale:"stale-observation",staleReads:0,staleClean:true,raster:[1,true,"image/png",true],published:true,
  losses:[{code:"image-reference",count:1,effect:"loss"}],depth:1,undone:true,redone:true,exactRestore:true,restoredBytes:true,
  decoded:[3,2],externalText:true,images:[[true,"Chart"],[true,"Repeat"]]});
 expect(requests).toEqual([]);
});
