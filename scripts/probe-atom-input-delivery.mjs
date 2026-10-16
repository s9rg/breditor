/** Compare actual installed pre-repair/current DOM event delivery, without OS clipboard or settings. */
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile,realpath} from "node:fs/promises";
import {resolve,extname,sep} from "node:path";
import {chromium,firefox,webkit} from "@playwright/test";
const args=process.argv.slice(2);if(args.length!==2)throw Error("Expected pre-repair and repaired installed-consumer directories");
const mime={".html":"text/html",".js":"text/javascript",".wasm":"application/wasm",".css":"text/css",".json":"application/json"};
async function serve(directory){
 const root=await realpath(resolve(directory,"dist"));
 const server=createServer(async(req,res)=>{try{
  const path=resolve(root,`.${new URL(req.url,"http://localhost").pathname}`),file=await realpath(path);
  if(!file.startsWith(root+sep))throw Error("outside installed root");
  res.writeHead(200,{"content-type":mime[extname(file)]??"application/octet-stream"});res.end(await readFile(file));
 }catch{res.writeHead(404);res.end();}});
 await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve);});
 return {url:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise(resolve=>server.close(resolve))};
}
const records=[];
for(const [version,directory]of [["before",args[0]],["after",args[1]]]){
 const host=await serve(directory);
 try{for(const [engine,launcher]of Object.entries({chromium,firefox,webkit})){
  const browser=await launcher.launch();
  try{for(const mode of ["local","shared"]){
   const context=await browser.newContext();try{
    const page=await context.newPage();await page.goto(`${host.url}/code-exit.html?flow=1&only=image&history=typing&toolbar=none&mode=${mode}`);await page.locator("#ready").filter({hasText:"Ready"}).waitFor();
    const before=await page.evaluate(()=>{const t=window.codeExit;t.select({kind:"node",block:"image-block"});t.a.focus();window.atomEvents=[];
     for(const name of ["keydown","keypress","beforeinput","input"])window.addEventListener(name,e=>window.atomEvents.push({type:e.type,key:e.key??null,inputType:e.inputType??null,data:e.data??null,defaultPrevented:e.defaultPrevented,isComposing:e.isComposing??false,trusted:e.isTrusted}));
     return {document:t.a.view().documentJson,ranges:getSelection().rangeCount};});
    await page.keyboard.type("Q");
    const after=await page.evaluate(()=>({view:window.codeExit.a.view(),events:window.atomEvents,errors:window.codeExit.errors}));
    assert.equal(before.ranges,0);assert.deepEqual(after.errors,[]);
    const keys=after.events.filter(e=>e.type==="keydown"&&e.key==="Q");assert.equal(keys.length,1);assert.equal(keys[0].trusted,true);
    let injectedInputReachedNative=false;
    if(version==="before"){
     assert.equal(after.view.documentJson,before.document);assert.equal(after.view.selection.kind,"node");assert.equal(after.events.filter(e=>e.type==="beforeinput").length,0);assert.equal(keys[0].defaultPrevented,false);
     const injected=await page.evaluate(()=>{const t=window.codeExit;t.a.surface.dispatchEvent(new InputEvent("beforeinput",{bubbles:true,cancelable:true,inputType:"insertText",data:"Q"}));return {view:t.a.view(),errors:t.errors};});
     assert.deepEqual(injected.errors,[]);assert.equal(injected.view.selection.kind,"text");assert.equal(injected.view.selection.focus.offset,"1");assert.equal(injected.view.undoDepth,1);injectedInputReachedNative=true;
    }else{
     assert.notEqual(after.view.documentJson,before.document);assert.equal(after.view.selection.kind,"text");assert.equal(after.view.selection.focus.offset,"1");assert.equal(after.view.undoDepth,1);assert.equal(keys[0].defaultPrevented,true);
    }
    records.push({version,engine,mode,sourceRangeCount:before.ranges,resultSelection:after.view.selection.kind,events:after.events,injectedInputReachedNative,passed:true});
   }finally{await context.close();}
  }}finally{await browser.close();}
 }}finally{await host.close();}
}
console.log(JSON.stringify({format:"breditor/atom-input-delivery",formatVersion:1,beforeConsumer:args[0],afterConsumer:args[1],records,passed:true},null,2));
