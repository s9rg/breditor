import {test,expect} from "@playwright/test";
import {fileURLToPath} from "node:url";
import {rolldown} from "rolldown";

test("selects pinned smaller raster bytes for live and static renders of the exact original",async({page})=>{
 const graph=await rolldown({input:fileURLToPath(new URL("../../packages/breditor-editor/src/static_document.ts",import.meta.url)),platform:"browser",logLevel:"silent"});
 const js=(await graph.generate({format:"esm"})).output[0].code;await graph.close();
 await page.route("**/rendition-static.js",r=>r.fulfill({contentType:"text/javascript",body:js}));
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 await page.evaluate(async()=>{window.renditionModules=await Promise.all([import("/rich.js"),import("/rendition-static.js")]);});
 const requests=[];
 page.on("request",request=>{if(/^https?:/.test(request.url()))requests.push(request.url());});
 const result=await page.evaluate(async()=>{
  const [api,{renderStaticDocument}]=window.renditionModules;
  const imageBlob=async(width,height,noise=false,mime="image/png")=>{
   const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;
   const draw=canvas.getContext("2d");
   if(noise){
    const pixels=draw.createImageData(width,height);let state=331;
    for(let i=0;i<pixels.data.length;i+=4){
     state=(Math.imul(1664525,state)+1013904223)>>>0;
     pixels.data[i]=state>>>24;pixels.data[i+1]=state>>>16;pixels.data[i+2]=state>>>8;pixels.data[i+3]=255;
    }
    draw.putImageData(pixels,0,0);
   }else{draw.fillStyle="#346b92";draw.fillRect(0,0,width,height);}
   return new Promise(resolve=>canvas.toBlob(resolve,mime));
  };
  const sha=async blob=>"sha256:"+[...new Uint8Array(await crypto.subtle.digest("SHA-256",await blob.arrayBuffer()))].map(byte=>byte.toString(16).padStart(2,"0")).join("");
  const toDataUrl=async blob=>{
   const bytes=new Uint8Array(await blob.arrayBuffer()),parts=[];
   for(let offset=0;offset<bytes.length;offset+=8192)parts.push(String.fromCharCode(...bytes.subarray(offset,offset+8192)));
   return `data:${blob.type};base64,${btoa(parts.join(""))}`;
  };
  const original=await imageBlob(120,90,true),flat=await imageBlob(120,90),small=await imageBlob(40,30),large=await imageBlob(80,60);
  const wrong=await imageBlob(40,22),noisy=await imageBlob(40,30,true),jpeg=await imageBlob(40,30,false,"image/jpeg");
  // Insert an ordinary EXIF orientation 6 marker into the fixture JPEG.
  const exif=new Uint8Array([255,225,0,34,69,120,105,102,0,0,73,73,42,0,8,0,0,0,1,0,18,1,3,0,1,0,0,0,6,0,0,0,0,0,0,0]);
  const rotated=new Blob([jpeg.slice(0,2),exif,jpeg.slice(2)],{type:"image/jpeg"});
  const urls=new Map(),host="https://rendition-fixture.example.test/";
  const entry=async(width,name,blob)=>{
   const url=host+name,expectedAsset=await sha(blob);urls.set(url,blob);return {width,url,expectedAsset};
  };
  const smallEntry=await entry(40,"40.png",small),largeEntry=await entry(80,"80.png",large),wrongEntry=await entry(40,"wrong.png",wrong);
  const noisyEntry=await entry(40,"noisy.png",noisy),rotatedEntry=await entry(40,"rotated.jpg",rotated);
  const denied={...smallEntry,url:"https://denied.example.test/40.png"};
  const originalAsset=await sha(original),calls=[];
  const prepare=(width,candidates,source=original,asset=originalAsset)=>api.prepareRichRasterRendition(source,{
   requestedWidth:width,candidates,originalAsset:asset,urls,
   allowUrl(url){return this.urls.has(url);},
   load(request){calls.push(request.url);return {url:request.url,blob:this.urls.get(request.url)};},
  });
  const profile=api.compileStandardRichProfileV4(window.rich.wasm,JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:9,schema:{name:"example/b9-rendition",version:1},extensions:[]}));
  const {schema,schemaFingerprint}=profile.descriptor(),root={kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[
   {kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":"base"},children:[]}
  ]};
  const seed=JSON.stringify({format:"breditor/document",formatVersion:2,schema,schemaFingerprint,root});
  const initial=document.createElement("main"),store=await api.RichAssetStore.open("pinned-renditions");
  document.body.append(initial);
  let editor=api.mountRichEditor(initial,{core:profile.createEditor(seed)});
  try{
   const [originalRecord]=await api.insertImageFiles(editor,store,[new File([original],"Chart",{type:original.type})],{parent:{kind:"document"},before:null});
   const checkpoint=editor.checkpointJson(),native=JSON.parse(editor.view().documentJson).root.children.find(node=>node.type==="breditor/image");
   const binding=[native.properties["breditor/asset-id"],native.properties["breditor/asset-generation"]];
   editor.dispose();editor=undefined;
   const retained=await store.blob(originalRecord.asset);
   const mutable=[largeEntry,smallEntry],pending=prepare(36,mutable,retained);mutable[1]=denied;
   const low=await pending,high=await prepare(64,[smallEntry,largeEntry],retained);
   const fallback=await prepare(36,[denied],retained),missing=await prepare(100,[smallEntry],retained),ratio=await prepare(36,[wrongEntry],retained);
   const byteGrowth=await prepare(36,[noisyEntry],flat,await sha(flat)),orientation=await prepare(36,[rotatedEntry],retained);
   const refusal=async(work)=>{try{await work;return null;}catch(error){return typeof error.code==="string"?error.code:error.name;}};
   const invalidPin=await refusal(prepare(36,[smallEntry],new Blob(["not a raster"]),"invalid"));
   const controller=new AbortController(),aborted=await refusal(api.prepareRichRasterRendition(retained,{
    requestedWidth:36,candidates:[smallEntry],originalAsset,signal:controller.signal,allowUrl:()=>true,
    load(){controller.abort();return {url:smallEntry.url,blob:small};},
   }));
   // Deliver real aborts between internal display admission and its public result.
   const atDisplayReturn=extraTurn=>{
    const controller=new AbortController(),read=Object.getOwnPropertyDescriptor(AbortSignal.prototype,"aborted").get;
    let checks=0;
    Object.defineProperty(controller.signal,"aborted",{get(){
     if(++checks===2)queueMicrotask(()=>{if(extraTurn)queueMicrotask(()=>controller.abort());else controller.abort();});
     return read.call(this);
    }});
    return controller.signal;
   };
   const inspectFence=await refusal(api.inspectRichRaster(retained,{signal:atDisplayReturn(false)}));
   const urlFence=await refusal(api.prepareRichRasterUrl(smallEntry.url,{signal:atDisplayReturn(true),expectedAsset:smallEntry.expectedAsset,
    allowUrl:()=>true,load:()=>({url:smallEntry.url,blob:small})}));
   const rotatedImage=new Image();rotatedImage.src=await toDataUrl(rotated);await rotatedImage.decode();
   const render=async(selection)=>{
    const restored=profile.restoreEditor(checkpoint),exact=restored.checkpointJson()===checkpoint;
    const viewport=document.createElement("section"),live=document.createElement("main"),server=document.createElement("div");
    viewport.style.width=selection.displayWidth+"px";viewport.append(live,server);document.body.append(viewport);
    const data=await toDataUrl(selection.raster.blob),reads=[],resolveAsset=asset=>{
     reads.push([asset.asset,asset.generation]);return asset.asset===binding[0]&&asset.generation===binding[1]?data:undefined;
    };
    const mounted=api.mountRichEditor(live,{core:restored,resolveAsset});
    try{
     server.innerHTML=renderStaticDocument(restored.documentJson(),{fragment:true,resolveAsset});
     const images=[live.querySelector("img"),server.querySelector("img")];
     await Promise.all(images.map(image=>image.decode()));
     return {exact,unchanged:restored.checkpointJson()===checkpoint,correctBinding:reads.length>=2&&reads.every(read=>read[0]===binding[0]&&read[1]===binding[1]),
      images:images.map(image=>[image.naturalWidth,image.naturalHeight,image.alt,image.getAttribute("width"),image.getAttribute("height")])};
    }finally{mounted.dispose();viewport.remove();}
   };
   const shape=s=>[s.kind,s.reason??null,s.originalAsset===originalAsset,s.raster.asset,s.raster.bytes,s.displayWidth,s.displayHeight];
   return {original:originalRecord.asset===originalAsset,held:await sha(retained)===originalAsset,bytes:original.size,
    low:shape(low),high:shape(high),fallback:shape(fallback),missing:missing.reason,ratio:ratio.reason,byteGrowth:byteGrowth.reason,
    orientation:orientation.reason,decodedExif:[rotatedImage.naturalWidth,rotatedImage.naturalHeight],calls,invalidPin,aborted,inspectFence,urlFence,
    originalStillOnly:(await store.list()).map(record=>record.asset),mutablePin:[smallEntry.expectedAsset,largeEntry.expectedAsset,originalAsset],
    renders:[await render(low),await render(high),await render(fallback)]};
  }finally{editor?.dispose();profile.dispose();store.close();initial.remove();}
 });
 const [smallAsset,largeAsset,originalAsset]=result.mutablePin;
 expect(result).toMatchObject({original:true,held:true,originalStillOnly:[originalAsset],
  low:["rendition",null,true,smallAsset,expect.any(Number),40,30],high:["rendition",null,true,largeAsset,expect.any(Number),80,60],
  fallback:["original","refused-rendition",true,originalAsset,result.bytes,120,90],missing:"no-rendition",ratio:"incompatible-rendition",
  byteGrowth:"incompatible-rendition",orientation:"incompatible-rendition",decodedExif:[30,40],
  invalidPin:"integrity",aborted:"AbortError",inspectFence:"asset_backup_aborted",urlFence:"AbortError",
  calls:["40.png","80.png","wrong.png","noisy.png","rotated.jpg"].map(name=>"https://rendition-fixture.example.test/"+name),
  renders:[[40,30],[80,60],[120,90]].map(([width,height])=>({exact:true,unchanged:true,correctBinding:true,
   images:[[width,height,"Chart","120","90"],[width,height,"Chart","120","90"]]}))});
 expect(result.low[4]).toBeLessThan(result.bytes);
 expect(result.high[4]).toBeLessThan(result.bytes);
 expect(requests).toEqual([]);
});
