/** Test-owned loopback native processes. Private IPC tokens are never persisted or printed. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {saveEvidence,fileEvidence} from '../../candidate-release/evidence.mjs';
export async function startNativeGenerationCompleteControls(root,binary,directory,{migrated=false}={}){
 const child=spawn(binary,migrated?[directory,'--migrated-origin']:[directory],{cwd:root,stdio:['ignore','pipe','pipe']}),tokens=new Map();let output='',errors='',ready=false;
 const exited=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
 const timer=setTimeout(()=>{if(!ready)child.kill('SIGTERM');},600000);
 let data;
 try{
  data=await new Promise((resolve,reject)=>{
   const fail=()=>reject(Error('Native generation-complete-control fixture did not prepare; bounded stderr: '+errors));
   child.once('error',fail);child.once('exit',()=>{if(!ready)fail();});
   child.stderr.on('data',bytes=>{errors=(errors+bytes.toString('utf8')).slice(-4096);});
   child.stdout.on('data',bytes=>{
    output+=bytes.toString('utf8');
    if(Buffer.byteLength(output)>1024*1024){child.kill('SIGTERM');reject(Error('Native generation-complete-control handshake budget'));return;}
    if(output.includes('\n')&&!ready){
     ready=true;
     try{resolve(JSON.parse(output.trim()));}catch{reject(Error('Invalid native generation-complete-control handshake'));}
    }
   });
  });
  assert.equal(data.format,'breditor/native-generation-complete-control-fixtures');assert.equal(data.formatVersion,1);assert.equal(data.cases.length,migrated?1:10);assert.equal(data.registeredWriters,7);assert.equal(data.registeredReviewActors,7);assert.equal(data.protectedStreams,14);
  const files=[],cases=data.cases.map(row=>{const fixture=JSON.parse(readFileSync(row.path));assert.equal(fixture.format,'breditor/native-generation-complete-control-fixture');assert.equal(Object.hasOwn(fixture,'legacyMigration'),migrated);assert.equal(fixture.clients.length,7);assert.equal(new Set(fixture.clients.map(client=>client.writer)).size,7);assert.equal(new Set(fixture.clients.map(client=>client.actor)).size,7);assert.equal(fixture.registeredWriters,7);assert.equal(fixture.registeredReviewActors,7);assert.equal(fixture.protectedStreams,14);assert.equal(row.nativeProtectedStreamsVerified,true);assert.equal(row.nativeProviderVerified,true);if(typeof row.operatorToken!=='string'||!/^[a-f0-9]{64}$/.test(row.operatorToken))throw Error('Invalid private operator token shape');assert.equal(dirname(dirname(row.path)),directory);tokens.set(row.path,row.operatorToken);const{operatorToken,...publicCase}=row;for(const file of ['fixture.json','server.backup','server-after.backup','inventory-after.json','inventory.json','older-server.backup',...(migrated?['legacy-server.backup','legacy-native.wal']:[])]){const path=resolve(dirname(row.path),file);assert.ok(!readFileSync(path).includes(Buffer.from(operatorToken)));files.push(fileEvidence(root,path.slice(root.length+1)));}return publicCase;});
  const manifest={format:data.format,formatVersion:1,registeredWriters:7,registeredReviewActors:7,protectedStreams:14,cases},path=resolve(directory,'public-fixtures.json');saveEvidence(path,manifest);output='';data=undefined;
  return{manifest,path,files,token:casePath=>{const value=tokens.get(casePath);assert.ok(value);return value;},async stop(){tokens.clear();if(child.exitCode===null&&child.signalCode===null)child.kill('SIGINT');const result=await Promise.race([exited,new Promise(resolve=>{const timeout=setTimeout(()=>resolve(null),10000);timeout.unref();})]);if(!result){child.kill('SIGKILL');await exited;throw Error('Native generation-complete-control process did not stop');}assert.equal(result.code,0,'Native operator shutdown');}};
 }catch(error){tokens.clear();output='';data=undefined;if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await exited;throw error;}
 finally{clearTimeout(timer);}
}
