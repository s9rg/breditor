import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {IDBFactory} from "fake-indexeddb";
import {encodeSharedSessionBackup,decodeSharedSessionBackup,MAX_SHARED_SESSION_BACKUP_BYTES} from "../packages/breditor-collaboration/dist/backups/session.js";
import {backupIdentity,requireBackupRecovery} from "../packages/breditor-collaboration/dist/backups/identity.js";
import {insertBackupRecord,backupDestinationExists} from "../packages/breditor-collaboration/dist/backups/database.js";
import {encodeSharedPairedSessionBackup,decodeSharedPairedSessionBackup,MAX_SHARED_PAIRED_BACKUP_BYTES} from "../packages/breditor-collaboration/dist/backups/paired.js";
const identity=()=>({room:"room",writer:"101",richLanguage:1,history:"explicit",rangeEditing:"original",selectionEditing:"original",searchHistory:null});
const checkpoint=()=>JSON.stringify({format:"breditor/rich-replica-journal",version:12,document:"room",writer:"101",origin:{kind:"seed",document_json:"Native replay is intentionally not certified by these codec-only fixtures"},entries:[],ui:{},publication:"0"});
test("session backup retains exact source bytes and a context-bound SHA-256, not a normalized AST",async()=>{
 const json=checkpoint(),id=identity(),encoded=await encodeSharedSessionBackup(id,json),read=await decodeSharedSessionBackup(encoded,id),value=JSON.parse(encoded),{sha256,...body}=value;
 assert.equal(sha256,createHash("sha256").update(JSON.stringify(body)).digest("hex"));assert.equal(read.checkpointJson,json);assert.deepEqual(read.identity,id);assert.equal(Object.isFrozen(read),true);assert.equal(Object.isFrozen(read.identity),true);assert.equal("credentials" in read,false);
});
test("backup capture snapshots source policy before asynchronous integrity work",async()=>{
 const id=identity(),expected=identity(),pending=encodeSharedSessionBackup(id,checkpoint());id.room="other";id.history="typing-v1";const encoded=await pending;assert.deepEqual((await decodeSharedSessionBackup(encoded,expected)).identity,expected);
});
test("unknown families, fields, source policies and invalid Unicode fail without echoing history",async()=>{
 const id=identity(),encoded=await encodeSharedSessionBackup(id,checkpoint()),source=JSON.parse(encoded),secret="PRIVATE-DELETED-HISTORY";
 for(const bad of [secret,"{\""+secret+"\":",JSON.stringify({...source,extra:secret}),JSON.stringify({...source,format:"breditor/session-backup"}),JSON.stringify({...source,formatVersion:2}),JSON.stringify({...source,sha256:"A".repeat(64)}),JSON.stringify({...source,identity:{...id,permission:"editor"}})])await assert.rejects(decodeSharedSessionBackup(bad,id),error=>{assert.ok(!String(error).includes(secret));return true;});
 await assert.rejects(encodeSharedSessionBackup(id,checkpoint()+"\ud800"),/well-formed Unicode/);await assert.rejects(decodeSharedSessionBackup(encoded,{...id,writer:"202"}),/explicitly selected/);assert.throws(()=>backupIdentity({...id,selectionEditing:"document-v1"}),/incompatible/);assert.throws(()=>backupIdentity({...id,room:"\ud800"}),/well-formed Unicode/);
});
test("integrity rejects valid-header byte changes rather than repairing them",async()=>{
 const id=identity(),value=JSON.parse(await encodeSharedSessionBackup(id,checkpoint()));value.checkpointJson+="\n";await assert.rejects(decodeSharedSessionBackup(JSON.stringify(value),id),error=>error.code==="backup_integrity");
});
test("backup transport and opaque native checkpoint retain separate bounded budgets",async()=>{
 await assert.rejects(decodeSharedSessionBackup("x".repeat(MAX_SHARED_SESSION_BACKUP_BYTES+1),identity()),error=>error.code==="backup_budget");await assert.rejects(encodeSharedSessionBackup(identity(),"x".repeat(16*1024*1024+1)),error=>error.code==="backup_budget");
});
test("writer recovery acknowledgement is explicit and never read from a file",()=>{
 for(const value of [undefined,null,true,"editor","read_only",{},"host-reacquired "])assert.throws(()=>requireBackupRecovery(value),/host must explicitly reacquire/);assert.doesNotThrow(()=>requireBackupRecovery("host-reacquired"));
});
test("insert-only backup storage preserves a competing record and unrelated keys",async()=>{
 const idb=new IDBFactory(),db=await new Promise((resolve,reject)=>{const r=idb.open("conditional",1);r.onupgradeneeded=()=>r.result.createObjectStore("journals");r.onerror=()=>reject(r.error);r.onsuccess=()=>resolve(r.result);});
 try{const key=["room","101"],other=["other","202"];assert.equal(await backupDestinationExists(db,key),false);await insertBackupRecord(db,key,"winner");await insertBackupRecord(db,other,"unrelated");await assert.rejects(insertBackupRecord(db,key,"backup must not overwrite"),error=>error.code==="backup_destination_exists");const get=k=>new Promise((resolve,reject)=>{const tx=db.transaction("journals","readonly"),r=tx.objectStore("journals").get(k);tx.oncomplete=()=>resolve(r.result);tx.onabort=()=>reject(tx.error);});assert.equal(await get(key),"winner");assert.equal(await get(other),"unrelated");}finally{db.close();}
});
function paired(){return{format:"breditor/shared-review-checkpoint-record",formatVersion:1,history:"explicit",rangeEditing:"original",selectionEditing:"original",richLanguage:1,reviewActor:"alice-writer",principal:"alice",documentCheckpointJson:checkpoint(),reviewCheckpointJson:JSON.stringify({format:"breditor/review-session",formatVersion:1,actor:"alice-writer",principal:"alice",binding:{document:"room"},history:[]}),versions:[]};}
test("paired backup captures both opaque histories and detaches the catalog before async digest",async()=>{
 const id=identity(),record=paired(),exact=JSON.stringify(record),pending=encodeSharedPairedSessionBackup(id,record);record.versions.push("a later packet");record.reviewCheckpointJson="later private comment";const encoded=await pending,value=JSON.parse(encoded),{sha256,...body}=value;
 assert.equal(sha256,createHash("sha256").update(JSON.stringify(body)).digest("hex"));const read=await decodeSharedPairedSessionBackup(encoded,id);assert.equal(read.recordJson,exact);assert.equal(Object.isFrozen(read),true);
});
test("paired codec rejects unknown records, mismatched source, corruption and excessive transport",async()=>{
 const id=identity(),value=JSON.parse(await encodeSharedPairedSessionBackup(id,paired()));for(const patch of [{extra:true},{formatVersion:2},{format:"breditor/shared-session-backup"}])await assert.rejects(decodeSharedPairedSessionBackup(JSON.stringify({...value,...patch}),id));
 await assert.rejects(encodeSharedPairedSessionBackup(id,{...paired(),versions:["x".repeat(4*1024*1024+1)]}),e=>e.code==="backup_paired_identity");
 await assert.rejects(encodeSharedPairedSessionBackup(id,{...paired(),privateUnknown:"PRIVATE"}),e=>!String(e).includes("PRIVATE"));await assert.rejects(decodeSharedPairedSessionBackup(JSON.stringify({...value,recordJson:value.recordJson+"\n"}),id),e=>e.code==="backup_integrity");
 await assert.rejects(decodeSharedPairedSessionBackup(JSON.stringify(value),{...id,searchHistory:"search-v1"}),e=>e.code==="backup_identity");await assert.rejects(decodeSharedPairedSessionBackup("x".repeat(MAX_SHARED_PAIRED_BACKUP_BYTES+1),id),e=>e.code==="backup_budget");
});
