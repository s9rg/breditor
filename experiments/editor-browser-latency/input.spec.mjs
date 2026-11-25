import {expect,test} from "@playwright/test";
import {createHash} from "node:crypto";
import {cpus,release,totalmem,version} from "node:os";

const format="breditor/installed-input-latency";
const sampleCount=20;
const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
function percentiles(values){
 const sorted=[...values].sort((a,b)=>a-b);
 return {samples:sorted.length,p50:sorted[Math.ceil(sorted.length*.5)-1],p95:sorted[Math.ceil(sorted.length*.95)-1]};
}

test("measure installed local typing, paste and Undo through browser input",async({page,browser,baseURL},info)=>{
 const observed=[];
 page.on("response",response=>{
  const url=new URL(response.url());
  if(response.ok()&&url.origin===new URL(baseURL).origin&&(url.pathname==="/"||/\.(?:html|js|css|wasm)$/u.test(url.pathname))){
   observed.push(response.body().then(bytes=>({path:url.pathname,sha256:sha256(bytes)})));
  }
 });
 const wasmResponse=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith(".wasm")&&response.ok());
 const started=performance.now();
 await page.goto("/");
 await expect(page.locator("#ready")).toHaveText("Ready");
 const pageReadyMs=performance.now()-started;
 const wasmSha256=sha256(await (await wasmResponse).body());
 const paste="Clipboard timing sample. ".repeat(40);
 const initial=await page.evaluate(()=>{
  const {sdk}=window,documentJson=sdk.editor.view().documentJson;
  sdk.dispose();
  return documentJson;
 });
 const rows=[];
 for(const paragraphs of [16,128]){
  const fixture=await page.evaluate(async ({paragraphs,initial})=>{
   const {sdk}=window;
   window.inputTiming?.editor.dispose();
   const content=JSON.parse(initial);
   const text="Mixed content still surrounds these measured edit paragraphs. ".repeat(4);
   content.root.children.push(...Array.from({length:paragraphs},(_,index)=>({kind:"element",type:"breditor/paragraph",entityId:null,
    properties:{"breditor/block-id":`input-latency-${index}`},children:[{kind:"text",text,formats:[]}]})));
   const host=document.querySelector("#editor"),documentJson=JSON.stringify(content),errors=[];
   const start=performance.now();
   const editor=await sdk.openLocalEditor({host,history:"typing-v1",initial:{kind:"document",documentJson},onError:error=>errors.push(String(error))});
   const openMs=performance.now()-start;
   const baseline=editor.view().documentJson;
   const block=`input-latency-${Math.floor(paragraphs/2)}`;
   const selector=`[data-rich-text="${block}"]`;
   const arm=(event,expected,trusted)=>new Promise((resolve,reject)=>{
    let began;
    const begin=value=>{
     if(value.isTrusted!==trusted||event==="beforeinput"&&value.inputType!=="insertText"||event==="keydown"&&value.key.toLowerCase()!=="z")return;
     began=performance.now();
    };
    const done=()=>{clearTimeout(timer);observer.disconnect();editor.surface.removeEventListener(event,begin,true);};
    const observer=new MutationObserver(()=>{
     if(began!==undefined&&editor.surface.querySelector(selector)?.textContent===expected){
      const duration=performance.now()-began;done();resolve(duration);
     }
    });
    const timer=setTimeout(()=>{done();reject(Error(`No accepted ${event} mutation`));},3000);
    editor.surface.addEventListener(event,begin,true);
    observer.observe(editor.surface,{subtree:true,childList:true,characterData:true});
   });
   window.inputTiming={editor,errors,baseline,block,text,arm,select:()=>{
    editor.focus();editor.execute({kind:"setSelection",selection:sdk.range(block,0)});
   }};
   return {baseline,openMs,topLevelBlocks:content.root.children.length};
  },{paragraphs,initial});
  const undoKey=process.platform==="darwin"?"Meta+z":"Control+z";
  const samples={typing:[],undoTyping:[],paste:[],undoPaste:[]};
  for(let index=0;index<=sampleCount;index++){
   await page.evaluate(()=>{
    const timing=window.inputTiming;timing.select();
    timing.pending=timing.arm("beforeinput","x"+timing.text,true);
   });
   await page.keyboard.press("x");
   const typing=await page.evaluate(()=>window.inputTiming.pending);
   const undoTyping=await undo(page,undoKey,"x");
   await page.evaluate(text=>{
    const timing=window.inputTiming;timing.select();
    timing.pending=timing.arm("paste",text+timing.text,false);
    const clipboardData=new DataTransfer();clipboardData.setData("text/plain",text);
    if(timing.editor.surface.dispatchEvent(new ClipboardEvent("paste",{bubbles:true,cancelable:true,clipboardData})))throw Error("Paste was not consumed");
   },paste);
   const pasteMs=await page.evaluate(()=>window.inputTiming.pending);
   const undoPaste=await undo(page,undoKey,paste);
   if(index>0){samples.typing.push(typing);samples.undoTyping.push(undoTyping);samples.paste.push(pasteMs);samples.undoPaste.push(undoPaste);}
  }
  expect(await page.evaluate(()=>window.inputTiming.errors)).toEqual([]);
  rows.push({paragraphs,documentBytes:Buffer.byteLength(fixture.baseline),documentSha256:sha256(fixture.baseline),
   topLevelBlocks:fixture.topLevelBlocks,openMs:fixture.openMs,metrics:Object.fromEntries(Object.entries(samples).map(([key,values])=>[key,percentiles(values)]))});
 }
 const report={format,formatVersion:1,browser:browser.version(),platform:process.platform,arch:process.arch,
  host:{cpu:cpus()[0]?.model??"unknown",logicalCpus:cpus().length,memoryBytes:totalmem(),osRelease:release(),osVersion:version()},
  pageReadyMs,pasteBytes:Buffer.byteLength(paste),wasmSha256,served:await Promise.all(observed),rows};
 const body=JSON.stringify(report);
 await info.attach("installed-input-latency",{contentType:"application/json",body});
 console.log(body);
});

async function undo(page,key,inserted){
 await page.evaluate(inserted=>{
  const timing=window.inputTiming;
  const blocks=JSON.parse(timing.editor.view().documentJson).root.children;
  const edited=blocks.find(block=>block.properties["breditor/block-id"]===timing.block);
  if(edited?.children.map(child=>child.text).join("")!==inserted+timing.text)throw Error("The observed DOM edit did not commit in the native document");
  timing.pending=timing.arm("keydown",timing.text,true);
 },inserted);
 await page.keyboard.press(key);
 return page.evaluate(async()=>{
  const timing=window.inputTiming,duration=await timing.pending;
  if(timing.editor.view().documentJson!==timing.baseline)throw Error("Undo must restore the exact measured document");
  return duration;
 });
}
