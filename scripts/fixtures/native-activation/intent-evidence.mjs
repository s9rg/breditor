/** Preserve the actual complete IDB rows as read-back-verified DATA evidence. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function saveActualActivationIntent(directory,choice){
 const db=await new Promise((resolve,reject)=>{const q=indexedDB.open(choice.database,1);q.onupgradeneeded=()=>{q.transaction.abort();reject(Error('Actual existing intent required'));};q.onerror=()=>reject(q.error);q.onsuccess=()=>resolve(q.result);});
 let keys,values;
 try{await new Promise((resolve,reject)=>{const tx=db.transaction('activation','readonly'),s=tx.objectStore('activation'),a=s.getAllKeys(),b=s.getAll();a.onsuccess=()=>{keys=a.result;};b.onsuccess=()=>{values=b.result;};tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});}finally{db.close();}
 const rows=new Map(keys.map((key,i)=>[key,values[i]]));assert.equal(rows.size,choice.objects.length+3);assert.equal(rows.get('choice'),JSON.stringify(choice));
 mkdirSync(directory,{recursive:false});const files=[];
 const save=(name,bytes)=>{const path=join(directory,name);writeFileSync(path,bytes,{flag:'wx',mode:0o600});assert.deepEqual(readFileSync(path),bytes);files.push({name,bytes:bytes.length,sha256:sha(bytes)});};
 save('choice.json',Buffer.from(rows.get('choice')));save('graph.json',Buffer.from(rows.get('graph')));save('state.json',Buffer.from(rows.get('state')));
 assert.equal(files[1].bytes,choice.graph.bytes);assert.equal(files[1].sha256,choice.graph.sha256);
 for(const pin of choice.objects){const bytes=Buffer.from(await rows.get('blob:'+pin.sha256).arrayBuffer());assert.equal(bytes.length,pin.bytes);assert.equal(sha(bytes),pin.sha256);save(pin.sha256+'.bin',bytes);}
 const index=Buffer.from(JSON.stringify({format:'breditor/actual-sdk-native-activation-intent-evidence',formatVersion:1,files},null,2)+'\n');save('index.json',index);
 return {directory,indexSha256:sha(index),files:files.length,completeObjects:choice.objects.length,totalBytes:choice.totalBytes,graphSha256:choice.graph.sha256};
}
