import {test,expect} from "@playwright/test";
import {createHash} from "node:crypto";

test("prepares only an approved pinned HTTPS raster before explicit native insertion",async({page})=>{
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 const fixture=await page.evaluate(async()=>{
  window.rasterApi=await import("/rich.js");
  const canvas=document.createElement("canvas");canvas.width=3;canvas.height=2;
  const draw=canvas.getContext("2d");draw.fillStyle="royalblue";draw.fillRect(0,0,3,2);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));
  window.pinnedPng=blob;
  return Array.from(new Uint8Array(await blob.arrayBuffer()));
 });
 const url="https://raster-fixture.example.test/chart.png",body=Buffer.from(fixture),asset="sha256:"+createHash("sha256").update(body).digest("hex");
 await page.route(url,route=>route.fulfill({status:200,headers:{"access-control-allow-origin":"*"},contentType:"image/png",body}));
 const network=[],errors=[];
 page.on("request",request=>{if(/^https?:/.test(request.url()))network.push(request.url());});
 page.on("pageerror",error=>errors.push(error.message));
 const result=await page.evaluate(async({url,asset})=>{
  const api=window.rasterApi,approved=[],loads=[],signal=new AbortController().signal;
  const options={allowed:url,limits:{maxFileBytes:4096},expectedAsset:asset,signal,
   allowUrl(candidate){approved.push(candidate);return candidate===this.allowed;},
   async load(request){
    loads.push([request.url,request.maxBytes,request.redirect,request.signal===signal,Object.isFrozen(request),this.allowed===url]);
    const response=await fetch(request.url,{redirect:request.redirect,signal:request.signal});
    return {url:response.url,blob:await response.blob()};
   }};
  const failure=async(source=options.allowed,overrides={})=>{
   try{await api.prepareRichRasterUrl(source,{...options,...overrides});return "unexpected success";}
   catch(error){return error instanceof api.RichRasterUrlError?error.code:error.name;}
  };
  const denied=await failure("https://refused.example.test/blocked.png");
  const invalid=await Promise.all([failure("http://raster-fixture.example.test/chart.png"),failure("https://user@raster-fixture.example.test/chart.png"),
   failure(url+"#anchor"),failure(url,{expectedAsset:"invalid"})]);
  const abortBefore=new AbortController();abortBefore.abort();
  const preaborted=await failure(url,{signal:abortBefore.signal});
  const ready=await api.prepareRichRasterUrl("HTTPS://raster-fixture.example.test:443/reports/../chart.png",options);
  const {blob}=ready;
  const refused=await Promise.all([
   failure(url,{load:()=>({url:"https://refused.example.test/redirect.png",blob})}),
   failure(url,{load:()=>({url,blob:new Blob([blob],{type:"image/jpeg"})})}),
   failure(url,{load:()=>({url,blob:new Blob([new Uint8Array(4097)],{type:"image/png"})})}),
   failure(url,{expectedAsset:"sha256:"+"0".repeat(64),load:()=>({url,blob})}),
   failure(url,{load:()=>{throw Error("private host detail");}}),
  ]);
  const abortDuring=new AbortController();let rejectLoader,receivedSignal=false;
  const aborted=failure(url,{signal:abortDuring.signal,load:request=>{
   receivedSignal=request.signal===abortDuring.signal;return new Promise((_resolve,reject)=>{rejectLoader=reject;});
  }});
  abortDuring.abort();const abortResult=await aborted;
  rejectLoader(Error("late private failure"));
  await Promise.resolve();

  const profile=api.compileStandardRichProfileV4(window.rich.wasm,JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:9,schema:{name:"example/b8-url-raster",version:1},extensions:[]}));
  const {schema,schemaFingerprint}=profile.descriptor(),root={kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[
   {kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":"body"},children:[]}
  ]};
  const core=profile.createEditor(JSON.stringify({format:"breditor/document",formatVersion:2,schema,schemaFingerprint,root}));
  const host=document.createElement("main");document.body.append(host);
  const store=await api.RichAssetStore.open("raster-url-intake"),editor=api.mountRichEditor(host,{core,resolveAsset:binding=>store.resolve(binding.asset)});
  let recovered;
  try{
   const before=core.documentJson(),empty=(await store.list()).length===0;
   const [retained]=await api.insertImageFiles(editor,store,[new File([blob],"Chart",{type:blob.type})],{parent:{kind:"document"},before:null});
   const checkpoint=editor.checkpointJson(),depth=editor.view().undoDepth;
   editor.dispose();recovered=profile.restoreEditor(checkpoint);
   const exact=recovered.checkpointJson()===checkpoint;
   const recoveredImage=JSON.parse(recovered.documentJson()).root.children.find(node=>node.type==="breditor/image");
   recovered.execute({kind:"undo"});const undone=recovered.documentJson()===before;
   const retainedBytes=Array.from(new Uint8Array(await (await store.blob(retained.asset)).arrayBuffer()));
   return {denied,invalid,preaborted,refused,abortResult,receivedSignal,approved:approved[0],loads,
    proof:[ready.asset===asset,ready.mime,ready.width,ready.height,Object.isFrozen(ready),Object.isFrozen(blob)],
    empty,depth,exact,undone,retained:retained.asset===asset,recovered:recoveredImage.properties["breditor/asset-id"]===asset,retainedBytes};
  }finally{editor.dispose();recovered?.dispose();profile.dispose();store.close();host.remove();}
 },{url,asset});
 expect(result).toEqual({denied:"policy",invalid:["url","url","url","integrity"],preaborted:"AbortError",
  refused:["redirect","raster","budget","integrity","load"],abortResult:"AbortError",receivedSignal:true,
  approved:"https://refused.example.test/blocked.png",loads:[[url,4096,"error",true,true,true]],
  proof:[true,"image/png",3,2,true,true],empty:true,depth:1,exact:true,undone:true,retained:true,recovered:true,retainedBytes:fixture});
 expect(network).toEqual([url]);
 expect(errors).toEqual([]);
});
