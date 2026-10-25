/** Actual terminal custody after uncertain admission. Durable execution intent
 * and per-client progress are tested by the separate execution coordinator. */
import test,{before,after}from'node:test';import assert from'node:assert/strict';import{join}from'node:path';
import*as api from'../packages/breditor-collaboration/dist/index.js';
import{completeControlFixtures}from'./fixtures/physical-recovery-control/complete-fixtures.mjs';import{acceptedControlTransport}from'./fixtures/physical-recovery-control/accepted-transport.mjs';
import{selectedProviderSession}from'./fixtures/selected-room-provider/session.mjs';
import{withSelectedNativeExecution as execute}from'../packages/breditor-collaboration/dist/physical_room_asset_successor/owner.js';
import{saveEvidence}from'./candidate-release/evidence.mjs';
let fixtures,transport,sequence=0;before(async()=>{fixtures=await completeControlFixtures(new URL('../',import.meta.url).pathname);transport=acceptedControlTransport(fixtures.manifest);});after(async()=>{transport?.restore();await fixtures?.close();if(fixtures){const rows=[];for(const item of fixtures.manifest.cases){let code;try{await fetch(item.endpoint,{signal:AbortSignal.timeout(2000)});}catch(error){code=error.cause?.code;}rows.push({endpoint:item.endpoint,closed:code==='ECONNREFUSED'});}saveEvidence(join(fixtures.directory,'native-execution-endpoints-closed.json'),{rows});assert.ok(rows.every(row=>row.closed));}});
const setup=()=>selectedProviderSession(fixtures,'native-execution-life-'+sequence++,{subset:['original','local-operation-flat'],documentSegmented:false,reviewSegmented:false}),terminal=error=>['retired','disposed'].includes(error?.code);
test('a refusal before native admission leaves the genuine owner usable',async()=>{const s=await setup(),error=Error('no admission');try{await assert.rejects(execute(s.owner,s.input(),async()=>{throw error;}),value=>value===error);for(const row of s.owner.clients)assert.equal(typeof row.core.select(null),'boolean');assert.equal(Object.hasOwn(api,'withSelectedNativeExecution'),false);}finally{await s.close();}});
test('successful execution keeps genuine clients live and their existing permissions unchanged',async()=>{const s=await setup();try{const clients=s.owner.clients,permission=clients.map(row=>row.core.view().readOnly),payload=await s.host.readAcceptedNative({document:'include',review:{kind:'start'}});await execute(s.owner,s.input(),async scope=>{scope.native.receiveDocument(clients[0].core,payload.documentFrame);});assert.deepEqual(clients.map(row=>row.core.view().readOnly),permission);for(const row of clients)assert.equal(typeof row.core.select(null),'boolean');}finally{await s.close();}});
test('failure after an actual admission retires every real client, including late cleanup cancellation',async()=>{
 for(const mode of['visitor','publication-cancel','late-cleanup-cancel']){const s=await setup(),controller=new AbortController(),error=Error('after admission');let off=()=>{};
  try{const clients=s.owner.clients,payload=await s.host.readAcceptedNative({document:'include',review:{kind:'start'}});let admitted=false;
   await assert.rejects(execute(s.owner,{...s.input(),signal:controller.signal},async scope=>{if(mode==='publication-cancel')off=clients[0].core.subscribe(()=>{admitted=true;controller.abort();});scope.native.receiveDocument(clients[0].core,payload.documentFrame);admitted=true;if(mode==='visitor')throw error;if(mode==='late-cleanup-cancel')queueMicrotask(()=>queueMicrotask(()=>controller.abort()));}));
   off();off=()=>{};assert.equal(admitted,true);for(const row of clients)assert.throws(()=>row.core.select(null),terminal,'No member may become writable after the barrier releases');await s.owner.close();
  }finally{off();await s.close();}
 }
});
