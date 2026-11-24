import {expect,test} from "@playwright/test";
import {createHash} from "node:crypto";
import {cpus,release,totalmem,version} from "node:os";
import {performance} from "node:perf_hooks";

function milliseconds(values){
 const sorted=[...values].sort((a,b)=>a-b);
 return {samples:sorted.length,p50:sorted[Math.ceil(sorted.length*.5)-1],p95:sorted[Math.ceil(sorted.length*.95)-1]};
}

test("record repeatable rich editor demo timings",async({page,browser,browserName},info)=>{
 const wasmResponse=page.waitForResponse(response=>
  new URL(response.url()).pathname==="/breditor_wasm_bg.wasm"&&response.ok());
 const started=performance.now();
 await page.goto("/demo");
 await expect(page.locator("#ready")).toContainText("Ready");
 const readyMs=performance.now()-started;
 const wasmSha256=createHash("sha256").update(await (await wasmResponse).body()).digest("hex");
 const measurements=await page.evaluate(()=>{
  const utf8Bytes=text=>new TextEncoder().encode(text).length;
  const {editor}=window.demo;
  const point={block:"demo-intro",offset:"0",affinity:"after"};
  editor.execute({kind:"setSelection",selection:{kind:"text",anchor:point,focus:point}},false);
  const baseline=editor.view().documentJson;
  const samples={insert:[],undo:[],redo:[]};
  const cycle=record=>{
   const commands=[
    ["insert",{kind:"insertPlainText",text:"Latency sample. "}],
    ["undo",{kind:"undo"}],
    ["redo",{kind:"redo"}],
   ];
   let inserted;
   for(const [name,command] of commands){
    const began=performance.now();
    const result=editor.execute(command,false);
    const elapsed=performance.now()-began;
    const document=editor.view().documentJson;
    if(name==="insert"){
     if(document===baseline)throw Error("The measured insert did not reach the document");
     inserted=document;
    }
    if(name==="undo"&&document!==baseline)throw Error("The measured undo did not restore the original document");
    if(name==="redo"&&document!==inserted)throw Error("The measured redo did not restore the inserted text");
    if(result==="queued")throw Error("A measured action was queued");
    if(record)samples[name].push(elapsed);
   }
   editor.execute({kind:"undo"},false);
   if(editor.view().documentJson!==baseline)throw Error("Undo did not restore the same document");
  };
  cycle(false);
  for(let index=0;index<25;index++)cycle(true);
  const pasteText="Clipboard timing sample. ".repeat(40);
  const paste=[];
  for(let index=0;index<=25;index++){
   editor.execute({kind:"setSelection",selection:{kind:"text",anchor:point,focus:point}});
   const clipboardData=new DataTransfer();
   clipboardData.setData("text/plain",pasteText);
   const event=new ClipboardEvent("paste",{bubbles:true,cancelable:true,clipboardData});
   if(event.clipboardData!==clipboardData)event.clipboardData?.setData("text/plain",pasteText);
   const began=performance.now();
   editor.surface.dispatchEvent(event);
   const elapsed=performance.now()-began;
   const edited=editor.surface.querySelector('[data-rich-text="demo-intro"]');
   if(!event.defaultPrevented||!edited?.textContent.startsWith(pasteText))throw Error("The paste did not reach the selected paragraph");
   editor.execute({kind:"undo"},false);
   if(editor.view().documentJson!==baseline)throw Error("Paste undo did not restore the same document");
   if(index>0)paste.push(elapsed);
  }
  return {samples,paste,pasteBytes:utf8Bytes(pasteText),documentJson:baseline,
   fixture:{documentBytes:utf8Bytes(baseline),topLevelBlocks:JSON.parse(baseline).root.children.length}};
 });
 const processors=cpus();
 const report={
  format:"breditor/rich-demo-latency",formatVersion:2,
  browser:browserName,browserVersion:browser.version(),platform:process.platform,arch:process.arch,node:process.version,
  host:{cpu:processors[0]?.model ?? "unknown",logicalCpus:processors.length,
   memoryBytes:totalmem(),osRelease:release(),osVersion:version()},
  wasmSha256,fixture:{...measurements.fixture,
   documentSha256:createHash("sha256").update(measurements.documentJson).digest("hex")},
  readyMs,commands:Object.fromEntries(Object.entries(measurements.samples).map(([name,values])=>[name,milliseconds(values)])),
  clipboard:{method:"synthetic-plain-text-paste-event",bytes:measurements.pasteBytes,...milliseconds(measurements.paste)},
 };
 const body=JSON.stringify(report);
 await info.attach("rich-demo-latency.json",{body,contentType:"application/json"});
 console.log(body);
});
