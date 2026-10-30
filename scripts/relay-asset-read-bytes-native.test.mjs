/** Genuine native raster service/account; corruption is injected only after
 * the real authenticated response. A recovery read must not touch its cache. */
import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';import {resolve,join} from 'node:path';import {createHash} from 'node:crypto';
import {selectedDeliveryNativeHost} from './fixtures/selected-delivery/native-host.mjs';
import {SharedRelayAssets,sharedRelayAssetReadPort} from '../packages/breditor-collaboration/dist/relay/assets.js';
const sha=value=>createHash('sha256').update(value).digest('hex');
test('native raster bytes remain source-neutral, hashed, brand-checked and cancellable',{timeout:180000},async()=>{
 const root=resolve(new URL('../',import.meta.url).pathname),host=await selectedDeliveryNativeHost(root),first=host.initial,fixture=host.fixture(first),client=fixture.clients.find(row=>row.principal==='alice');assert.ok(client);
 const auth=await host.authentication(client),fetchOriginal=globalThis.fetch;let cacheCalls=0,requests=0,corrupt=false,transport,delayed,releaseToken;
 const cache={async resolve(){cacheCalls++;throw Error('Recovery must not resolve cache URLs');},async cacheRemote(){cacheCalls++;throw Error('Recovery must not write a held cache');},async flush(){cacheCalls++;throw Error('Recovery must not acknowledge uploads');}};
 globalThis.fetch=async(url,options={})=>{const headers=new Headers(options.headers);headers.set('Origin','http://127.0.0.1:4187');if(String(url).includes('/assets/'))requests++;const response=await fetchOriginal(url,{...options,headers});if(corrupt&&String(url).includes('/assets/')&&response.ok){const bytes=new Uint8Array(await response.arrayBuffer());bytes[bytes.length-1]^=1;return new Response(bytes,{status:response.status,headers:response.headers});}return response;};
 try{
  transport=new SharedRelayAssets({endpoint:first.clientEndpoint,principal:auth.document.principal,getToken:auth.getToken,store:cache,requestTimeoutMs:10000});
  const originals=['seed-a.png','seed-b.png'].map(name=>readFileSync(join(host.directory,name))),assets=originals.map(bytes=>'sha256:'+sha(bytes));
  const downloaded=await Promise.all(assets.map(asset=>transport.readBytes(asset)));for(const [index,row]of downloaded.entries()){assert.ok(row);assert.equal(row.asset,assets[index]);assert.equal(row.mime,'image/png');assert.equal(row.bytes,originals[index].length);const bytes=Buffer.from(await row.blob.arrayBuffer());assert.deepEqual(bytes,originals[index]);writeFileSync(join(host.directory,'download-'+index+'.png'),bytes,{flag:'wx',mode:0o600});assert.equal(sha(readFileSync(join(host.directory,'download-'+index+'.png'))),sha(originals[index]));}
  assert.equal(await transport.readBytes('sha256:'+'f'.repeat(64)),undefined);assert.equal(cacheCalls,0);
  let shadows=0;transport.readBytes=async()=>{shadows++;throw Error('Public method shadow is not the held read port');};assert.ok(await sharedRelayAssetReadPort(transport).read(assets[0]));assert.equal(shadows,0);assert.throws(()=>sharedRelayAssetReadPort({...transport}));
  corrupt=true;await assert.rejects(sharedRelayAssetReadPort(transport).read(assets[0]),error=>error.code==='asset_digest_mismatch');corrupt=false;
  let entered;const reached=new Promise(resolve=>{entered=resolve;}),token=new Promise(resolve=>{releaseToken=resolve;});delayed=new SharedRelayAssets({endpoint:first.clientEndpoint,principal:auth.document.principal,getToken:()=>{entered();return token.then(()=>auth.getToken());},store:cache,requestTimeoutMs:10000});
  const controller=new AbortController(),before=requests,pending=delayed.readBytes(assets[0],controller.signal),observed=pending.then(value=>({value}),error=>({error}));await reached;controller.abort();assert.ok((await observed).error);releaseToken();releaseToken=undefined;await new Promise(resolve=>setImmediate(resolve));assert.equal(requests,before,'A cancelled token cannot start a late raster request');assert.equal(cacheCalls,0);
  console.log('RELAY_ASSET_BYTES_NATIVE '+JSON.stringify({directory:host.directory,files:originals.map((bytes,index)=>({name:'download-'+index+'.png',bytes:bytes.length,sha256:sha(bytes)})),cacheCalls,realNativeAccount:true,digestCorruptionRefused:true,publicShadowIgnored:true,cancelledTokenNoLateRequest:true}));
 }finally{releaseToken?.();delayed?.dispose();transport?.dispose();globalThis.fetch=fetchOriginal;await host.stop();}
});
