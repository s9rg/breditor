/** Run by the native two-handover fixture. The temporary operator token is stdin-only. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 SharedServerLogGenerationRecoveryHost as Recovery,
 SharedServerLogGenerationDeliveryRecoveryHost as Delivery,
 SharedServerLogGenerationDeliveryPathRecoveryHost as Path,
} from '../../../packages/breditor-collaboration/dist/index.js';

const {base,token,expected}=JSON.parse(readFileSync(0,'utf8'));
const origin=new URL(base);
assert.equal(origin.hostname,'127.0.0.1');
const realFetch=globalThis.fetch;
const handover='/recovery/generation-handover-delivery-path/v1/check';
let recovery,delivery,path,reads=0;
const auth={principal:'operator',getToken:()=>token,checkAuthority(){},requestTimeoutMs:30000};
globalThis.fetch=(url,init)=>{
 const destination=new URL(url);
 assert.equal(destination.origin,origin.origin);
 const headers=new Headers(init.headers);
 headers.set('Origin','http://127.0.0.1:4187');
 if(destination.pathname===handover){
  reads++;
  assert.deepEqual(JSON.parse(init.body),expected);
 }
 return realFetch(url,{...init,headers});
};
try{
 recovery=await Recovery.open({
  ...auth,endpoint:base+'/recovery/generations/v1/check',expected:expected.current.current.current,
 });
 delivery=await Delivery.open({
  ...auth,endpoint:base+'/recovery/generation-delivery/v1/check',expected:expected.current.current,current:recovery,
 });
 const input={...auth,endpoint:base+handover,expected,current:delivery};
 const changed=structuredClone(expected);
 changed.path.earlier.reverse();
 await assert.rejects(Path.openHandover({...input,expected:changed}),{code:'path_control_protocol'});
 assert.equal(reads,0);
 path=await Path.openHandover(input);
 assert.deepEqual(path.handoverSelection(),expected);
 assert.deepEqual(path.selection(),expected.current);
 assert.ok(Object.isFrozen(path.handoverSelection().path.earlier));
 const assets=await path.checkAssets({references:[{asset:'asset',generation:'generation'}],uploads:[]});
 assert.deepEqual(assets.missing,[]);
 assert.equal(assets.resolutions.length,1);
 assert.equal(assets.assets[0].mime,'image/png');
 assert.equal(reads,4);
 path.close();
 await assert.rejects(path.check(),{code:'path_control_closed'});
 await delivery.check();
}finally{
 path?.close();
 delivery?.close();
 recovery?.close();
 globalThis.fetch=realFetch;
}
