/** Real Native restarts preserve room/raster bytes and reject expired account tokens. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {selectedRestartNativeHost} from './fixtures/selected-delivery/native-restart-host.mjs';
import {coldNativeRoot} from './fixtures/selected-delivery/cold-native-root.mjs';
import {pixel} from './fixtures/review-assets/pixels.mjs';
test('two actual Native restarts require fresh account authentication and preserve author identities',{timeout:180000},async()=>{
 const root=resolve(new URL('../',import.meta.url).pathname),host=await selectedRestartNativeHost(coldNativeRoot(root),{suggestionGrants:true});
 try{
  const initial=host.fixture(host.initial),client=initial.clients[0],before=await host.authentication(client);
  const endpoint=new URL(host.initial.clientEndpoint);endpoint.protocol='http:';endpoint.pathname='/assets/sha256:'+createHash('sha256').update(pixel).digest('hex');
  const get=token=>fetch(endpoint,{headers:{'Authorization':'Bearer '+token,'X-Breditor-Principal':client.principal,'Origin':'http://127.0.0.1:4187'}});
  let token=await before.getToken(),response=await get(token);assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),Buffer.from(pixel));const records=[];
  for(let pass=0;pass<2;pass++){
   const current=await host.restart(),fixture=host.fixture(current),fresh=await host.authentication(client),next=await fresh.getToken();
   assert.notEqual(next,token);assert.deepEqual(fixture.generationRecoveryState,initial.generationRecoveryState);
   assert.equal(fresh.document.credential,before.document.credential);assert.equal(fresh.review.credential,before.review.credential);
   response=await get(token);assert.ok([401,403].includes(response.status));await response.body?.cancel();
   response=await get(next);assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),Buffer.from(pixel));
   const file=join(resolve(dirname(host.initial.path),'../..'),'native-restart-'+current.sequence+'-observation.json'),bytes=readFileSync(file),record=JSON.parse(bytes);
   for(const key of ['sameOperationalDirectory','freshAccountAuthentication','allProtectedRegistrationsVerified','actualNativeEpochCommitted'])assert.equal(record[key],true,key);
   assert.equal(record.wholeRoomActivated,false);assert.notDeepEqual(record.prior,record.current);records.push({file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});token=next;
  }
  console.log('NATIVE_COLD_RESTART_AUTHENTICATION '+JSON.stringify({directory:host.directory,restarts:2,protectedAuthors:7,expiredTokensRejected:true,originalRoomAndRastersUnchanged:true,records,wholeRoomActivated:false}));
 }finally{await host.stop();}
});
