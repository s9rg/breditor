import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {RichAssetStore} from '@breditor/experimental-rich-content';
import {distinctFixturePng} from '../physical-recovery-control/unavailable-upload.mjs';

const bytes=distinctFixturePng('durable-upload-lost-reply');
const asset='sha256:'+createHash('sha256').update(bytes).digest('hex');

async function withUpload(api,database,options,observe,work){
 const store=await RichAssetStore.openRetained(database);
 const provider=new api.SharedRelayAssets({...options,store});
 const fetch=globalThis.fetch,url=new URL('/assets/'+encodeURIComponent(asset),options.endpoint);
 url.protocol=url.protocol==='wss:'?'https:':'http:';
 let uploads=0;
 globalThis.fetch=async(input,init)=>{
  const response=await fetch(input,init);
  if(String(input)===url.href&&init?.method==='PUT'){
   uploads++;
   assert.equal(response.status,200);
   await observe(await response.clone().json());
  }
  return response;
 };
 try{
  const result=await work(store,provider);
  assert.equal(uploads,1);
  return result;
 }finally{globalThis.fetch=fetch;provider.dispose();store.close();}
}

export async function observeUnacknowledgedUpload(api,database,options){
 let durable;
 await withUpload(api,database,options,receipt=>{
  durable=receipt;
  throw Error('Controlled loss of the real image upload acknowledgement');
 },async(store,provider)=>{
  assert.equal(await provider.readBytes(asset),undefined);
  const image=Object.getOwnPropertyDescriptor(globalThis,'Image');
  const Base=globalThis.Image;
  Object.defineProperty(globalThis,'Image',{configurable:true,value:class extends Base{
   async decode(){
    const data=Buffer.from(await(await fetch(this.src)).arrayBuffer());
    if(!data.equals(bytes))return super.decode();
    this.naturalWidth=1;
    this.naturalHeight=1;
   }
  }});
  try{assert.equal((await store.ingest(new Blob([bytes],{type:'image/png'}))).asset,asset);}
  finally{Object.defineProperty(globalThis,'Image',image);}
  await provider.flush();
  assert.equal((await store.get(asset)).status,'failed');
  assert.equal((await store.get(asset)).attempts,1);
  assert.equal(durable.asset,asset);
  assert.equal(durable.duplicate,false);
 });
 return durable;
}

export async function recoverUnacknowledgedUpload(api,database,options,durable){
 const uploaded=await withUpload(api,database,options,receipt=>{
  assert.deepEqual(receipt,{...durable,duplicate:true});
 },async(store,provider)=>{
  assert.equal((await store.get(asset)).status,'failed');
  const remote=await provider.readBytes(asset);
  assert.deepEqual(Buffer.from(await remote.blob.arrayBuffer()),bytes);
  await store.retry(asset);
  await provider.flush();
  const saved=await store.get(asset);
  assert.equal(saved.status,'uploaded');
  assert.equal(saved.attempts,2);
  assert.equal(saved.storageRef,'breditor:relay-asset:1:'+asset);
  return saved;
 });
 const reopened=await RichAssetStore.openRetained(database);
 try{
  assert.deepEqual(await reopened.get(asset),uploaded);
  assert.deepEqual(Buffer.from(await(await reopened.blob(asset)).arrayBuffer()),bytes);
 }finally{reopened.close();}
}
