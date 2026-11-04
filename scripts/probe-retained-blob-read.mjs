/** Explicit follow-up experiment, never called by the observer or product.
 * Structured cloning to another Node worker preserves the retained Blob handle;
 * filesystem byte dumps would flatten its physical construction. These reads
 * are diagnostic attempts, never retries that can make a workflow succeed. */
import {Worker} from 'node:worker_threads';
export async function probeRetainedBlobRead(witness){
 if(witness?.format!=='breditor/test-blob-read-witness'||witness.formatVersion!==1||!(witness.file instanceof Blob)||witness.file.size!==witness.expectedBytes||!Number.isSafeInteger(witness.expectedBytes)||witness.expectedBytes<0||witness.expectedBytes>1024*1024)throw Error('Expected one retained bounded Blob read witness');
 const worker=new Worker(`
  const {parentPort,workerData}=require('node:worker_threads');
  const {createHash}=require('node:crypto');
  (async()=>{
   const rows=[];
   for(let attempt=0;attempt<4;attempt++){
    const result=await workerData.file.arrayBuffer();
    rows.push({attempt,declaredBytes:workerData.file.size,actualBytes:result.byteLength,sha256:createHash('sha256').update(new Uint8Array(result)).digest('hex')});
   }
   parentPort.postMessage({node:process.version,rows});
  })().catch(error=>{throw error;});`,{eval:true,execArgv:[],env:{...process.env,NODE_OPTIONS:''},workerData:{file:witness.file}});
 let timer;
 try{
  return await new Promise((resolve,reject)=>{
   timer=setTimeout(()=>reject(Error('Retained Blob experiment exceeded its 10-second bound')),10000);
   worker.once('message',result=>resolve(Object.freeze({format:'breditor/test-blob-worker-probe',formatVersion:1,original:{expectedBytes:witness.expectedBytes,actualBytes:witness.actualBytes,node:witness.node},...result,scope:'Explicit diagnostic worker reads of the retained immutable Blob handle. No product acceptance or physical browser qualification.'})));
   worker.once('error',reject);
   worker.once('exit',code=>reject(Error('Diagnostic worker exited before a result: '+code)));
  });
 }finally{clearTimeout(timer);await worker.terminate();}
}
