import {test,expect} from "@playwright/test";
import {fileURLToPath} from "node:url";
import {rolldown} from "rolldown";

const entries={interchange:"../../packages/breditor-interchange/src/index.ts",portable:"../../packages/breditor-interchange/src/portable_html.ts"};
const scripts=new Map();
test.beforeAll(async()=>{
 for(const [name,path] of Object.entries(entries)){
  const input=fileURLToPath(path.startsWith("@")?import.meta.resolve(path):new URL(path,import.meta.url));
  const bundle=await rolldown({input,platform:"browser",logLevel:"silent"});
  scripts.set(name,(await bundle.generate({format:"esm"})).output[0].code);
  await bundle.close();
 }
});

test("portable HTML embeds only verified bytes from the restored native asset bindings",async({page})=>{
 for(const [name,script] of scripts)await page.route("**/"+name+".js",route=>route.fulfill({contentType:"text/javascript",body:script}));
 await page.goto("/");
 await expect(page.locator("#status")).toHaveText("Ready");
 await page.evaluate(async()=>{
  window.rasterModules=await Promise.all([import("/rich.js"),import("/interchange.js"),import("/portable.js")]);
 });
 const requests=[];
 // WebKit reports in-memory Blob decodes as request events too.
 page.on("request",request=>{if(!/^(blob|data):/.test(request.url()))requests.push(request.url());});
 const result=await page.evaluate(async()=>{
  const [api,{createRichInterchange},{exportPortableHtml,portableHtmlRasterLimits}]=window.rasterModules;
  const png=async color=>{
   const canvas=document.createElement("canvas");canvas.width=2;canvas.height=3;
   const draw=canvas.getContext("2d");draw.fillStyle=color;draw.fillRect(0,0,2,3);
   return new Promise(resolve=>canvas.toBlob(resolve,"image/png"));
  };
  const bytes=await png("red"),otherBytes=await png("blue");
  const database="portable-raster-html";
  const stored=await api.RichAssetStore.open(database);
  const {asset}=await stored.ingest(bytes);
  stored.close();
  const retained=await api.RichAssetStore.open(database);
  const profile=api.compileStandardRichProfileV4(window.rich.wasm,JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:9,schema:{name:"example/portable-raster",version:1},extensions:[]}));
  const {schema,schemaFingerprint}=profile.descriptor();
  const root={kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[
   {kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":"body"},children:[]}
  ]};
  const core=profile.createDocumentEditor(JSON.stringify({format:"breditor/document",formatVersion:2,schema,schemaFingerprint,root}));
  const policy={resolveImage:({src})=>({asset,generation:src==="stale.png"?"retired":"current"})};
  let owner;
  try{
   const imported=createRichInterchange(core,policy).importHtml(
    '<figure><img src="valid.png" width="120" height="80" alt="Raster"><figcaption>Caption text</figcaption></figure>'+
    '<img src="valid.png" alt="Repeat"><img src="stale.png" alt="Retired raster">'
   );
   if(!imported.ok)throw Error(imported.error);
   core.selectDocument();core.pasteDocumentClipboard(imported.value.structuredJson,"raster");
   const checkpoint=core.checkpointJson();
   owner=profile.restoreDocumentEditor(checkpoint);
   const exactRestore=owner.checkpointJson()===checkpoint;
   owner.selectDocument();const clipboard=owner.copyDocument().structuredJson;
   // Whole-document paste allocates a fresh generation for each pasted image.
   const generations=JSON.parse(owner.documentJson()).root.children.filter(node=>node.type==="breditor/image")
    .map(node=>node.properties["breditor/asset-generation"]);
   const before=owner.checkpointJson(),bindings=[];
   const portable=await exportPortableHtml(owner,clipboard,{store:retained,allowed:new Set(generations.slice(0,2)),async loadImage(binding){
    bindings.push([binding.asset===asset,generations.indexOf(binding.generation),Object.isFrozen(binding)]);
    return this.allowed.has(binding.generation)?await this.store.blob(binding.asset):undefined;
   }});
   if(!portable.ok)throw Error(portable.error);
   const uri="data:image/png;base64,"+btoa(String.fromCharCode(...new Uint8Array(await bytes.arrayBuffer())));
   const markup=new DOMParser().parseFromString(portable.value,"text/html");
   const images=[...markup.querySelectorAll("img")],image=new Image();
   if(!images.length)throw Error(JSON.stringify({bindings,losses:portable.losses,html:portable.value}));
   image.src=images[0].getAttribute("src");await image.decode();
   const reused=[];
   const deduplicated=await exportPortableHtml(owner,imported.value.structuredJson,{loadImage:binding=>{
    reused.push(binding.generation);return binding.generation==="current"?retained.blob(binding.asset):undefined;
   }});
   if(!deduplicated.ok)throw Error(deduplicated.error);
   const duplicateImages=new DOMParser().parseFromString(deduplicated.value,"text/html").querySelectorAll("img");
   const wrongMime=await exportPortableHtml(owner,clipboard,{loadImage:()=>new Blob([bytes],{type:"image/jpeg"})});
   const wrongHash=await exportPortableHtml(owner,clipboard,{loadImage:()=>otherBytes});
   const corrupt=await exportPortableHtml(owner,clipboard,{loadImage:()=>new Blob([new Uint8Array([137,80,78,71])],{type:"image/png"})});
   const over=await exportPortableHtml(owner,clipboard,{loadImage:()=>new Blob([new Uint8Array(portableHtmlRasterLimits.totalBytes+1)],{type:"image/png"})});
   const denied=await exportPortableHtml(owner,clipboard,{loadImage:()=>{throw Error("host-only detail");}});
   let rejectedLookups=0;
   const invalid=await exportPortableHtml(owner,"{}",{loadImage:()=>{rejectedLookups++;return bytes;}});
   const ordinary=createRichInterchange(owner,{exportImage:()=>uri}).exportHtml(clipboard);
   const misses=[wrongMime,wrongHash,corrupt,ordinary].map(value=>[value.ok,value.losses,Boolean(value.value?.includes("data:"))]);
   const unchanged=owner.checkpointJson()===before;
   let release;
   const held=new Promise(resolve=>{release=resolve;});
   const pending=exportPortableHtml(owner,clipboard,{loadImage:async binding=>{
    await held;return generations.slice(0,2).includes(binding.generation)?retained.blob(binding.asset):undefined;
   }});
   owner.replaceDocumentPlainText("replacement","Edited while the host reads bytes");
   const edited=owner.documentJson().includes("Edited while the host reads bytes");
   release();const captured=await pending;
   return {exactRestore,bindings,notice:portable.losses,sources:images.map(i=>[i.getAttribute("src")===uri,i.alt]),
    geometry:[images[0].getAttribute("width"),images[0].getAttribute("height")],decoded:[image.naturalWidth,image.naturalHeight],
    caption:markup.querySelector("figcaption").textContent,retired:markup.body.textContent.includes("Retired raster"),
    misses,over,denied,invalid,rejectedLookups,unchanged,edited,pinned:captured.value===portable.value,
    reused,deduplicated:[...duplicateImages].map(img=>img.getAttribute("src")===uri),duplicateLosses:deduplicated.losses};
  }finally{owner?.dispose();core.dispose();profile.dispose();retained.close();}
 });
 const loss=count=>[{code:"image-reference",effect:"loss",count}];
 expect(result).toEqual({
  exactRestore:true,bindings:[[true,0,true],[true,1,true],[true,2,true]],notice:loss(1),
  sources:[[true,"Raster"],[true,"Repeat"]],geometry:["120","80"],decoded:[2,3],caption:"Caption text",retired:true,
  misses:Array.from({length:4},()=>[true,loss(3),false]),over:{ok:false,error:"resource-limit",losses:[]},
  denied:{ok:false,error:"asset-policy",losses:[]},invalid:{ok:false,error:"native-admission",losses:[]},
  rejectedLookups:0,unchanged:true,edited:true,pinned:true,reused:["current","retired"],deduplicated:[true,true],duplicateLosses:loss(1),
 });
 expect(requests).toEqual([]);
});
