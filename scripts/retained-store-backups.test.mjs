import assert from "node:assert/strict";
import test from "node:test";
import {createHash} from "node:crypto";
import {encodeRetainedStoreBackup,decodeRetainedStoreBackup,checkRetainedStoreRecovery,MAX_SHARED_RETAINED_STORE_BACKUP_BYTES} from "../packages/breditor-collaboration/dist/backups/retained_store.js";
import {checkQueueRecord} from "../packages/breditor-collaboration/dist/suggestions/database.js";
import {checkRevisionRecord} from "../packages/breditor-collaboration/dist/suggestion_revisions/database.js";
import {checkCatalogRecord} from "../packages/breditor-collaboration/dist/versions/database.js";
const identity={endpoint:"ws://127.0.0.1:1/",principal:"alice",room:"room",binding:"a".repeat(64),documentWriter:"101",effectWriter:"303",writerTransport:"atomic-v2"},binding="b".repeat(64),versionIdentity={endpoint:identity.endpoint,principal:identity.principal,room:identity.room,binding:identity.binding,documentWriter:identity.documentWriter};
const fixtures=()=>[
 {kind:"suggestions",value:checkQueueRecord({format:"breditor/shared-suggestion-queue",formatVersion:1,identity,retained:[{packet:"Opaque-native-packet",origin:"local",publish:true,publication:null,intent:null,decision:null}]},identity),check:value=>checkQueueRecord(value,identity)},
 {kind:"suggestion-revisions",value:checkRevisionRecord({format:"breditor/shared-suggestion-revisions",formatVersion:1,identity,binding,retained:[{previousPacket:"Original exact packet",packet:"Exact replacement packet",retry:true,receipt:null,conflict:null}]},identity,binding),check:value=>checkRevisionRecord(value,identity,binding)},
 {kind:"version-catalog",value:checkCatalogRecord({format:"breditor/shared-version-catalog-cache",formatVersion:1,identity:versionIdentity,catalog:null,packets:[{packet:"Exact immutable snapshot",origin:"local",publish:true,accepted:null}]},versionIdentity),check:value=>checkCatalogRecord(value,versionIdentity)}
];
const envelope=(kind,recordJson)=>{const body={format:"breditor/shared-retained-store-backup",formatVersion:1,kind,recordJson};return JSON.stringify({...body,sha256:createHash("sha256").update(JSON.stringify(body)).digest("hex")});};
test("all three independent retained-store archives preserve exact original strings and do not mutate their source",async()=>{
 for(const f of fixtures()){const before=structuredClone(f.value),encoded=await encodeRetainedStoreBackup(f.kind,f.value,f.check),decoded=await decodeRetainedStoreBackup(f.kind,encoded,f.check);assert.deepEqual(decoded,before);assert.deepEqual(f.value,before);assert.equal(JSON.parse(encoded).recordJson,JSON.stringify(before));assert.equal(await encodeRetainedStoreBackup(f.kind,decoded,f.check),encoded);}
});
test("archive capture is a synchronous point in time before asynchronous hashing",async()=>{
 for(const f of fixtures()){const before=JSON.stringify(f.value),pending=encodeRetainedStoreBackup(f.kind,f.value,f.check);if(f.kind==="version-catalog")f.value.packets=[];else f.value.retained=[];assert.equal(JSON.parse(await pending).recordJson,before);}
});
test("closed kind, envelope fields, digests and canonical framing refuse instead of falling back",async()=>{
 const f=fixtures()[0],encoded=await encodeRetainedStoreBackup(f.kind,f.value,f.check),base=JSON.parse(encoded);
 for(const mutate of [r=>r.extra="PRIVATE",r=>r.formatVersion=2,r=>r.kind="version-catalog",r=>r.sha256="0".repeat(64),r=>r.sha256=r.sha256.toUpperCase(),r=>r.recordJson={private:"PRIVATE"},r=>delete r.sha256]){const value=structuredClone(base);mutate(value);await assert.rejects(decodeRetainedStoreBackup(f.kind,JSON.stringify(value),f.check),e=>!String(e).includes("PRIVATE"));}
 for(const value of [" "+encoded,encoded.replace('"formatVersion":1','"formatVersion":1e0'),encoded.replace('"formatVersion":1','"formatVersion":2,"formatVersion":1')])await assert.rejects(decodeRetainedStoreBackup(f.kind,value,f.check),e=>e.code==="backup_format");
});
test("record headers, exact policy and original bounds remain mandatory under a fresh valid checksum",async()=>{
 for(const f of fixtures()){for(const mutate of [r=>r.extra=true,r=>r.identity.documentWriter="202",r=>r.identity.binding="c".repeat(64),r=>r.formatVersion=2]){const value=structuredClone(f.value);mutate(value);await assert.rejects(decodeRetainedStoreBackup(f.kind,envelope(f.kind,JSON.stringify(value)),f.check),e=>e.code==="backup_record_identity");}
  await assert.rejects(decodeRetainedStoreBackup(f.kind,envelope(f.kind," "+JSON.stringify(f.value)),f.check),e=>e.code==="backup_format");}
 const f=fixtures()[0],owned={...f.value,format:"breditor/shared-owned-suggestion-queue"};await assert.rejects(decodeRetainedStoreBackup(f.kind,envelope(f.kind,JSON.stringify(owned)),f.check),e=>e.code==="backup_record_identity");const check=value=>checkQueueRecord(value,identity,"reviewed-v1");assert.equal((await decodeRetainedStoreBackup(f.kind,await encodeRetainedStoreBackup(f.kind,owned,check),check)).format,owned.format);
});
test("canonical retained records reject duplicate fields rather than silently adopting a winning copy",async()=>{
 const f=fixtures()[0],value=JSON.stringify(f.value).replace('"formatVersion":1','"formatVersion":2,"formatVersion":1');await assert.rejects(decodeRetainedStoreBackup(f.kind,envelope(f.kind,value),f.check),e=>e.code==="backup_format");
});
test("byte and Unicode refusal is complete and payload-redacted before record admission",async()=>{
 const f=fixtures()[0];for(const input of ["PRIVATE-NOT-JSON"," ".repeat(MAX_SHARED_RETAINED_STORE_BACKUP_BYTES+1),'"'+String.fromCharCode(0xd800)+'"',envelope(f.kind," ".repeat(32*1024*1024+1))])await assert.rejects(decodeRetainedStoreBackup(f.kind,input,()=>{throw Error("PRIVATE-ADMISSION");}),e=>!String(e).includes("PRIVATE"));
 assert.equal(MAX_SHARED_RETAINED_STORE_BACKUP_BYTES,65*1024*1024);
});
test("explicit recovery authority and cancellation are not inferred from an archive",async()=>{
 for(const writerRecovery of [undefined,null,"preserve","host-reacquired "])assert.throws(()=>checkRetainedStoreRecovery({writerRecovery}),e=>e.code==="backup_policy");assert.doesNotThrow(()=>checkRetainedStoreRecovery({writerRecovery:"host-reacquired"}));
 const f=fixtures()[0],encoded=await encodeRetainedStoreBackup(f.kind,f.value,f.check),signal=AbortSignal.abort();await assert.rejects(encodeRetainedStoreBackup(f.kind,f.value,f.check,{signal}),e=>e.code==="backup_aborted");await assert.rejects(decodeRetainedStoreBackup(f.kind,encoded,f.check,signal),e=>e.code==="backup_aborted");const controller=new AbortController(),pending=decodeRetainedStoreBackup(f.kind,encoded,f.check,controller.signal);controller.abort();await assert.rejects(pending,e=>e.code==="backup_aborted");
});
