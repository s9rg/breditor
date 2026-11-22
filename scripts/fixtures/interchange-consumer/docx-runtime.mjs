import assert from "node:assert/strict";
import {exportDocx} from "@breditor/interchange/docx";

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
