/** Isolate actual installed Wasm mutation/read costs; not a supported-size or latency budget. */
import assert from "node:assert/strict";
import {realpathSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {chromium,firefox,webkit} from "playwright";
const engines={chromium,firefox,webkit};
/** A fresh browser/context and an isolated leased writer; never connects to the user's relay. */
export async function probeSharedInputCost(engine="firefox",count=8){
 assert.ok(Object.hasOwn(engines,engine),"Expected chromium, firefox or webkit");assert.ok(Number.isSafeInteger(count)&&count>=1&&count<=16,"Expected 1–16 inputs per phase");
 const browser=await engines[engine].launch({headless:true});
 let watchdog;
 try{
  const page=await browser.newPage(),errors=[];page.on("pageerror",error=>errors.push(String(error)));
  await page.goto("http://127.0.0.1:49784/shared-structural.html?history=typing");await page.locator("#ready").filter({hasText:"Ready"}).waitFor({timeout:15_000});
  const result=await Promise.race([page.evaluate(async count=>navigator.locks.request(`breditor:shared-writer:${JSON.stringify(["room","303"])}`,{mode:"exclusive",ifAvailable:true},async lock=>{
   if(!lock)throw Error("The isolated profiling writer is already leased");
   const t=window.sharedV2,profile=await t.createStructuralSharedProfileV2(),rows=[],kinds=["breditor/strong","breditor-inline/italic","breditor-inline/underline","breditor-inline/strike","breditor-inline/code","breditor-inline/subscript","breditor-inline/superscript","breditor-inline/link","breditor-inline/text-color","breditor-inline/background-color","breditor-inline/text-size","breditor-inline/font-family"];
   let raw,clock=0;
   const guarded=work=>{const o=raw.observe();try{return work(o);}finally{o.free();}};
   const timed=work=>{const start=performance.now(),value=work();return {value,ms:performance.now()-start};};
   try{
    raw=profile.create(t.documentJson,"303");
    guarded(o=>raw.enable_typing_history(o));guarded(o=>raw.set_selection(o,JSON.stringify(t.range("p",1))));
    const measure=(phase,run)=>{
     const before=timed(()=>raw.observe());let mutation;
     try{mutation=timed(()=>run(before.value));}finally{before.value.free();}
     if(mutation.value!==true)throw Error("Expected an effective native profiling action");
     const after=timed(()=>raw.observe());
     try{
      const read=timed(()=>after.value.view_json()),view=JSON.parse(read.value),checkpoint=timed(()=>raw.typing_checkpoint());
      const inline=timed(()=>{for(const kind of kinds)raw.inline_format_state_json(after.value,kind);raw.caret_formats_json(after.value);});
      rows.push({phase,revision:view.revision,undoDepth:view.undoDepth,historyStepCount:view.historyStepCount,observeBeforeMs:before.ms,mutationMs:mutation.ms,observeAfterMs:after.ms,viewCopyMs:read.ms,checkpointMs:checkpoint.ms,thirteenInlineReadsMs:inline.ms,checkpointBytes:new TextEncoder().encode(checkpoint.value).length});
     }finally{after.value.free();}
    };
    for(let i=0;i<count;i++)measure("initial-typing",o=>raw.insert_typing_text(o,JSON.stringify({text:"x",clockMs:String(++clock)})));
    guarded(o=>raw.close_typing_group(o));
    for(let i=0;i<4;i++){measure("undo",o=>raw.undo_observed(o));measure("redo",o=>raw.redo_observed(o));}
    for(let i=0;i<count;i++)measure("after-history-typing",o=>raw.insert_typing_text(o,JSON.stringify({text:"y",clockMs:String(++clock)})));
    const saved=raw.typing_checkpoint(),document=raw.document_json();raw.free();raw=undefined;
    const restored=timed(()=>profile.restore_typing("room",saved));raw=restored.value;
    if(raw.typing_checkpoint()!==saved)throw Error("Profiling journal did not restore exactly");
    if(!guarded(o=>raw.undo_observed(o))||!guarded(o=>raw.redo_observed(o)))throw Error("Profiling recovery lost effective future history");if(raw.document_json()!==document)throw Error("Profiling history did not retain its document");
    const digestBytes=async value=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",value))).map(byte=>byte.toString(16).padStart(2,"0")).join("");
    const digest=value=>digestBytes(new TextEncoder().encode(value));
    const loaded=[...new Set(performance.getEntriesByType("resource").map(value=>value.name))].filter(value=>{const url=new URL(value);return url.origin===location.origin&&/\/breditor_shared_bg-[\w-]+\.wasm$/.test(url.pathname);});
    if(loaded.length!==1)throw Error("Expected exactly one installed collaboration Wasm resource");
    const response=await fetch(loaded[0],{cache:"no-store"});if(!response.ok)throw Error("Could not identify the installed collaboration bytes");const wasm=await response.arrayBuffer();
    return {rows,restoreMs:restored.ms,exactRecovery:true,wasmSha256:await digestBytes(wasm),wasmBytes:wasm.byteLength,checkpointSha256:await digest(saved),futureCheckpointSha256:await digest(raw.typing_checkpoint()),documentSha256:await digest(document)};
   }finally{raw?.free();profile.free();}
  }),count),new Promise((_,reject)=>{watchdog=setTimeout(()=>reject(Error("Shared input cost probe exceeded its 300-second diagnostic deadline")),300_000);})]);
  assert.deepEqual(errors,[]);return {format:"breditor/shared-input-cost",formatVersion:1,engine,browserVersion:browser.version(),count,...result};
 }finally{clearTimeout(watchdog);await browser.close();}
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);assert.ok(args.length<=2,"Usage: node scripts/probe-shared-input-cost.mjs [engine] [count]");
 console.log(JSON.stringify(await probeSharedInputCost(args[0]??"firefox",args[1]===undefined?8:Number(args[1])),null,2));
}
