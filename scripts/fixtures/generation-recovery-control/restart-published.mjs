/** Kill the owned fixture, inspect its durable target, and reacquire it in a fresh process. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const bytesHex=value=>Buffer.from(value).toString('hex');

async function start(binary,root,mode,input){
 const child=spawn(binary,[root,mode],{stdio:['pipe','pipe','pipe']});
 const closed=new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal})));
 const ready=new Promise((resolve,reject)=>{
  let buffer='',stderr='';
  const timer=setTimeout(()=>reject(Error('Published Native restart handshake timed out')),60000);
  const finish=(error,value)=>{clearTimeout(timer);error?reject(error):resolve(value);};
  child.once('error',error=>finish(error));
  child.once('exit',()=>finish(Error('Published Native restart failed before its handshake. '+stderr)));
  child.stdin.on('error',error=>finish(error));
  child.stderr.on('data',bytes=>{stderr=(stderr+bytes.toString()).slice(-4096);});
  child.stdout.setEncoding('utf8');
  child.stdout.on('data',bytes=>{
   buffer+=bytes;
   if(buffer.length>1024*1024)return finish(Error('Published Native restart handshake exceeds budget'));
   if(!buffer.includes('\n'))return;
   try{finish(null,JSON.parse(buffer.trim()));}catch{finish(Error('Invalid published Native restart handshake'));}
   buffer='';
  });
 });
 child.stdin.end(JSON.stringify(input));
 try{
  const message=await ready;
  return {pid:child.pid,message,closed,async stop(){
   if(child.exitCode===null&&child.signalCode===null)child.kill('SIGINT');
   let timer;
   try{
    const result=await Promise.race([closed,new Promise((_,reject)=>{
     timer=setTimeout(()=>reject(Error('Fresh Native process did not close')),10000);
    })]);
    assert.deepEqual(result,{code:0,signal:null});
   }catch(error){child.kill('SIGKILL');await closed;throw error;}
   finally{clearTimeout(timer);}
  }};
 }catch(error){child.kill('SIGKILL');await closed;throw error;}
}

export async function restartPublishedFixture(binary,controls,row,oldCredentials,whileOffline){
 const listener=row.publication.selection.listener,root=dirname(row.path);
 const checkpoint=join(root,'activation','activation.json'),previous=readFileSync(checkpoint);
 const previousBackup=join(root,'activation','target.backup'),backupDigest=digest(readFileSync(previousBackup));
 const checkpointSha256=row.restartCheckpointSha256;
 assert.equal(digest(previous),bytesHex(checkpointSha256));
 const previousPid=await controls.crash();
 await whileOffline();
 const observed=await start(binary,root,'--inspect-published',{
  checkpointSha256,listener,current:null,documents:[],reviews:[],
 });
 assert.deepEqual(await observed.closed,{code:0,signal:null});
 const {current,path,sha256}=observed.message;
 assert.equal(path,join(root,'restart-observed.backup'));
 assert.equal(digest(readFileSync(path)),bytesHex(sha256));
 assert.deepEqual(current.origin,row.activation.selection.current.origin);
 assert.notDeepEqual(current.server,row.activation.selection.current.server);
 const reopened=await start(binary,root,'--reopen-published',{
  checkpointSha256,listener,current,documents:oldCredentials.documents,reviews:oldCredentials.reviews,
 });
 try{
  const {activation,publication,operatorToken,accountToken,processId}=reopened.message;
  assert.equal(processId,reopened.pid);
  assert.notEqual(reopened.pid,previousPid);
  assert.notEqual(reopened.pid,observed.pid);
  assert.ok(typeof accountToken==='string'&&accountToken!==oldCredentials.accountToken);
  assert.ok(typeof operatorToken==='string'&&operatorToken!==controls.token(row.path));
  assert.equal(publication.selection.listener,listener);
  assert.deepEqual(publication.selection.activation,activation.selection);
  assert.deepEqual(activation.selection.current,current);
  assert.deepEqual(activation.selection.previous,row.activation.selection.planned);
  assert.equal(BigInt(activation.selection.planned.generation),BigInt(activation.selection.previous.generation)+1n);
  return {activation,publication,getToken:()=>operatorToken,accountToken,async stop(){
   await reopened.stop();
   assert.deepEqual(readFileSync(checkpoint),previous);
   assert.equal(digest(readFileSync(previousBackup)),backupDigest);
   assert.equal(digest(readFileSync(path)),bytesHex(sha256));
  }};
 }catch(error){await reopened.stop();throw error;}
}
