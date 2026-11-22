import assert from "node:assert/strict";
import test from "node:test";
import {createHash} from "node:crypto";
import {mkdtempSync,rmSync,symlinkSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {installedArchiveDigests} from "./installed-archive-digests.mjs";

test("installed archive evidence preserves requested package order and catches byte changes",()=>{
 const directory=mkdtempSync(join(tmpdir(),"breditor-archive-digests-"));
 try{
  const names=["@breditor/browser","@breditor/editor"];
  const packs=names.map(name=>{
   const filename=name.split("/")[1]+".tgz",payload=Buffer.from(name);
   writeFileSync(join(directory,filename),payload);
   return {name,filename,version:"1.0.0",size:payload.length,
    integrity:"sha512-"+createHash("sha512").update(payload).digest("base64")};
  }).reverse();
  const evidence=installedArchiveDigests(directory,packs,names);
  assert.deepEqual(evidence.map(row=>row.name),names);
  const browser=evidence[0];
  assert.equal(browser.sha256,createHash("sha256").update(names[0]).digest("hex"));
  assert.equal(browser.bytes,Buffer.byteLength(names[0]));
  writeFileSync(join(directory,browser.filename),Buffer.alloc(browser.bytes));
  assert.throws(()=>installedArchiveDigests(directory,packs,names),/Archive integrity changed/);
  writeFileSync(join(directory,browser.filename),"short");
  assert.throws(()=>installedArchiveDigests(directory,packs,names),/Archive size changed/);
  const editor=packs[0];
  symlinkSync(join(directory,editor.filename),join(directory,"link.tgz"));
  assert.throws(()=>installedArchiveDigests(directory,[{...editor,filename:"link.tgz"}],[editor.name]),/regular file/);
  assert.throws(()=>installedArchiveDigests(directory,[{...editor,filename:"../editor.tgz"}],[editor.name]),/Invalid npm archive filename/);
  assert.throws(()=>installedArchiveDigests(directory,[editor,editor],names),/Duplicate package/);
 }finally{rmSync(directory,{recursive:true,force:true});}
});
