import {expect,test} from "@playwright/test";
import {performance} from "node:perf_hooks";

function milliseconds(values){
 const sorted=[...values].sort((a,b)=>a-b);
 return {samples:sorted.length,p50:sorted[Math.ceil(sorted.length*.5)-1],p95:sorted[Math.ceil(sorted.length*.95)-1]};
}

test("record repeatable rich editor demo timings",async({page,browser,browserName},info)=>{
 const started=performance.now();
 await page.goto("/demo");
 await expect(page.locator("#ready")).toContainText("Ready");
 const readyMs=performance.now()-started;
 const measurements=await page.evaluate(()=>{
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
   for(const [name,command] of commands){
    const began=performance.now();
    const result=editor.execute(command,false);
    const elapsed=performance.now()-began;
    if(name==="insert"&&editor.view().documentJson===baseline)throw Error("The edit did not reach the document");
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
  return {samples,paste,pasteBytes:new TextEncoder().encode(pasteText).length};
 });
 const report={
  format:"breditor/rich-demo-latency",formatVersion:1,
  browser:browserName,browserVersion:browser.version(),platform:process.platform,arch:process.arch,node:process.version,
  readyMs,commands:Object.fromEntries(Object.entries(measurements.samples).map(([name,values])=>[name,milliseconds(values)])),
  clipboard:{method:"synthetic-plain-text-paste-event",bytes:measurements.pasteBytes,...milliseconds(measurements.paste)},
 };
 const body=JSON.stringify(report);
 await info.attach("rich-demo-latency.json",{body,contentType:"application/json"});
 console.log(body);
});
