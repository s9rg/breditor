import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {epubContentType,epubImageBindings,exportEpub,exportEpubWithImages} from "@breditor/interchange/epub";
import {pixel} from "./pixel.mjs";

// Installed EPUB-only proof: a retained native V4 document, host image bytes, sync and async receivers.
const {baseDocument}=JSON.parse(readFileSync(new URL("native-v4-checkpoint.json",import.meta.url),"utf8"));
const documentJson=JSON.stringify(baseDocument);
const bindings=[{asset:"asset",generation:"gen"}];
assert.deepEqual(epubImageBindings(documentJson),{ok:true,value:bindings,losses:[]});
const metadata={title:"Installed EPUB",language:"en",identifier:"urn:breditor:installed-epub",modified:"2026-01-01T00:00:00Z"};

const expected=exportEpub(documentJson,{...metadata,image:()=>pixel});
assert.equal(expected.ok,true,JSON.stringify(expected));
const bytes=Buffer.from(expected.value);
assert.deepEqual(bytes.subarray(0,4),Buffer.of(0x50,0x4b,0x03,0x04));
assert.equal(bytes.subarray(30,38+epubContentType.length).toString("latin1"),`mimetype${epubContentType}`);
assert.ok(bytes.includes("EPUB/images/image-1.png"));
assert.ok(bytes.includes(pixel));
assert.ok(!expected.losses.some(({code})=>code==="image-reference"||code==="image-format"));

const sync={...metadata,bytes:pixel,calls:[],image(binding){this.calls.push(binding);return this.bytes;}};
const asynchronous={...metadata,bytes:pixel,calls:[],async loadImage(binding){this.calls.push(binding);return new Blob([this.bytes],{type:"image/png"});}};
assert.deepEqual(exportEpub(documentJson,sync),expected);
assert.deepEqual(await exportEpubWithImages(documentJson,asynchronous),expected);
assert.deepEqual(sync.calls,bindings);
assert.deepEqual(asynchronous.calls,bindings);

console.log(JSON.stringify({passed:true,standalone:true,matchedHostReceivers:2,archiveBytes:bytes.length}));
