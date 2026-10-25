import {resolve} from 'node:path';
/** Actual selected stores and native roots with a deliberately delayed REAL
 * lock callback acknowledgement. This is controlled SDK, not OS proof. */
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';
import {PhysicalRoomAssetAdoption as Adoption,transferRoomAssetAdoption as transfer} from '../packages/breditor-collaboration/dist/physical_room_asset_adoption/coordinator.js';
import {completeImageNativeFixtures} from './fixtures/physical-operation-v3/image-seven-native.mjs';
import {completeHistoryFixture} from './fixtures/operation-read/history-session.mjs';
import {roomAssetChoices} from './fixtures/room-asset-adoption/bases.mjs';
let fixtures;before(async()=>{fixtures=await completeImageNativeFixtures(resolve(new URL('../',import.meta.url).pathname));});after(async()=>{await fixtures?.close();});
for(const how of['abort','close'])test('actual '+how+' during selected-store release cannot publish a prepared current cut',async()=>{
 const tag='selected-release-gap-'+how,f=await completeHistoryFixture({fixtures,tag,subset:['original','local-operation-flat'],documentSegmented:false,reviewSegmented:false,participantAuthority(){}}),input={reads:f.reads,checkAuthority(){}},controller=new AbortController();let stage,owner,work,closing,finish,original;
 try{const choices=await roomAssetChoices(f.owner,tag);stage=await Adoption.begin(f.owner,{database:tag+'-stage',participants:choices.participants,checkAuthority(){}});await stage.finish();const expected=await stage.approvalChoice(input);f.endOldJob();owner=await transfer(stage,{...input,expected,approvalDatabase:tag+'-approval',approve:()=>true,checkAssetAuthority(){}});
  const locks=navigator.locks,target='breditor/assets-custody/'+expected.adoption.participants[0].targetDatabase;original=locks.request;let delayed=false,entered;const atRelease=new Promise(resolve=>{entered=resolve;}),release=new Promise(resolve=>{finish=resolve;});
  locks.request=function(name,options,run){const result=original.call(this,name,options,run);if(name===target&&!delayed){delayed=true;return result.then(async value=>{entered();await release;return value;});}return result;};
  work=owner.capture({...input,signal:controller.signal});await Promise.race([atRelease,work.then(()=>{throw Error('Capture completed before the held release acknowledgement');})]);const refused=assert.rejects(work,error=>/aborted|closed/.test(error.code??''));if(how==='abort')controller.abort();else{const aliases=owner.clients;closing=owner.close();for(const row of aliases)assert.throws(()=>row.core.type('retired synchronously'));}finish();await refused;await closing;if(how==='abort'){assert.equal(owner.clients.length,2);await owner.capture(input);}assert.equal(f.f.counts.networkCalls,0);
 }finally{finish?.();await work?.catch(()=>{});await closing;await owner?.close();if(original)navigator.locks.request=original;await stage?.close();await f.close();}
});
