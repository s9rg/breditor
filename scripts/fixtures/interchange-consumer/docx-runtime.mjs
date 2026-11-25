import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {docxImageBindings,exportDocx,exportDocxWithImages} from "@breditor/interchange/docx";
import {pixel} from "./pixel.mjs";

const require=createRequire(import.meta.url);
for(const missing of ["@breditor/editor","@breditor/experimental-rich-content","react"]){
  assert.throws(()=>require.resolve(missing),{code:"MODULE_NOT_FOUND"});
}

const result=exportDocx(JSON.stringify({
 kind:"element",type:"breditor/document",properties:{"breditor/document-id":"installed-export"},children:[{
  kind:"element",type:"breditor/paragraph",properties:{"breditor/block-id":"intro"},
  children:[{kind:"text",text:"Installed DOCX export",formats:[]}],
 }],
}));
assert.equal(result.ok,true,JSON.stringify(result));
assert.deepEqual(result.losses,[]);
assert.deepEqual(result.value.subarray(0,4),Uint8Array.of(0x50,0x4b,0x03,0x04));
assert.ok(Buffer.from(result.value).includes("Installed DOCX export"));

// Use an actual retained native V4 document rather than the minimal writer smoke fixture.
const {baseDocument}=JSON.parse(readFileSync(new URL("native-v4-checkpoint.json",import.meta.url),"utf8"));
const documentJson=JSON.stringify(baseDocument);
const bindings=[{asset:"asset",generation:"gen"}];
assert.deepEqual(docxImageBindings(documentJson),{ok:true,value:bindings,losses:[]});

const expected=exportDocx(documentJson,{image:()=>pixel});
assert.equal(expected.ok,true,JSON.stringify(expected.losses));
assert.ok(Buffer.from(expected.value).includes("word/media/image1.png"));
assert.ok(Buffer.from(expected.value).includes(pixel));
assert.ok(!expected.losses.some(({code})=>code==="image-reference"));

const sync={bytes:pixel,calls:[],image(binding){
  this.calls.push(binding);
  return this.bytes;
}};
const asynchronous={bytes:pixel,calls:[],async loadImage(binding){
  this.calls.push(binding);
  return new Blob([this.bytes],{type:"image/png"});
}};
// A function can shadow its inherited call method and remain callable.
Object.defineProperty(sync.image,"call",{value:null});
Object.defineProperty(asynchronous.loadImage,"call",{value:null});
assert.deepEqual(exportDocx(documentJson,sync),expected);
assert.deepEqual(await exportDocxWithImages(documentJson,asynchronous),expected);
assert.deepEqual(sync.calls,bindings);
assert.deepEqual(asynchronous.calls,bindings);

console.log(JSON.stringify({passed:true,standalone:true,matchedHostReceivers:2,embeddedRasterBytes:pixel.length}));
