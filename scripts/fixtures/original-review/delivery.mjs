/** Actual independently restored client branches against a live native physical control. */
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {dirname,join} from 'node:path';
import * as api from '../../../packages/breditor-collaboration/dist/index.js';
import * as rich from '@breditor/experimental-rich-content';
import {environment} from '../room-participant-inventory/environment.mjs';
import {independentParticipant} from '../independent-inventory/independent-participant.mjs';
import {recoveryFactory} from '../independent-delivery-recovery/session.mjs';
import {reviewSource,sameReceipt} from '../../../packages/breditor-collaboration/dist/relay/review_validation.js';
import {physicalRecoveryHostPort,SharedPhysicalRoomRecoveryHost as Host} from '../../../packages/breditor-collaboration/dist/physical_recovery_control/host.js';
import {databaseValues} from '../independent-delivery-recovery/storage.mjs';
let serial=0;
export async function authenticatedDeliveryFixture(fixtures,{documentSegmented=false,reviewSegmented=false,includeReview=true,item=fixtures.manifest.cases.at(-1)}={}){
 const reset=environment(),tag='original-rights-'+serial++,data=fixtures.fixture(item),profile=fixtures.profile(data),inventory=await api.readSharedServerLogGenerationParticipantInventory(new Blob([readFileSync(join(dirname(item.path),'inventory-after.json'))]),data.afterSelected),metadata=inventory.metadata().native;
 const client=data.clients.find(client=>!client.observer&&metadata.accounts.some(account=>account.principal===client.principal&&account.documentRole==='editor'&&account.reviewRole!==null));assert.ok(client);
 let base,incoming,host,allowed=true,onToken=()=>{};
 try{
  base=await independentParticipant({api,rich,profile,fixture:data,metadata,client,documentSegmented,reviewSegmented,tag});
  const current=base.session.exportRecovery(),currentJson=JSON.stringify(current),depths={document:[base.session.core.view().undoDepth,base.session.core.view().redoDepth],review:[base.session.core.reviewSnapshot().view.undoDepth,base.session.core.reviewSnapshot().view.redoDepth]};
  base.source.dispose();await base.session.close();
  incoming=await api.SharedIndependentDeliverySession.restoreRecovery({...base.options,database:tag+'-incoming',recovery:current,writerRecovery:'host-reacquired'});
  host=await Host.open({endpoint:item.endpoint,expected:item.selection,principal:'operator',getToken:async()=>{await onToken();return allowed?fixtures.controls.token(item.path):'0'.repeat(64);},checkAuthority(){}});
  const accepted=await physicalRecoveryHostPort(host).readAcceptedNative({document:'include',review:{kind:'start'}});
  await incoming.core.receiveFrame(accepted.documentFrame);
  if(includeReview)for(const batch of accepted.review.batches){const source=reviewSource(batch.source);assert.notEqual(incoming.core.receiveReview(batch.frame,source).kind,'pending');assert.ok(sameReceipt(incoming.core.retainedReviewReceipt(batch.frame,source),batch.receipt));}
  await incoming.flush();const incomingJson=JSON.stringify(incoming.exportRecovery());await incoming.close();
  const ranges=includeReview?metadata.review.writers.filter(row=>row.clock.actor!==client.actor&&row.clock.through!=='0').map(row=>({actor:row.clock.actor,principal:row.principal,from:'1',through:row.clock.through})).sort((a,b)=>a.actor<b.actor?-1:a.actor>b.actor?1:0):[];if(includeReview)assert.ok(ranges.length);
  const options={currentJson,incomingJson,session:recoveryFactory(base.options),originalReview:{binding:metadata.review.binding,ranges},checkAuthority(){}};
  const snapshot=async()=>[await databaseValues(base.options.database),await databaseValues(tag+'-incoming')];
  return{tag,host,base,options,current,depths,metadata,client,onToken(fn){onToken=fn;},allowToken(value){allowed=value;},snapshot,async close(){host?.close();await incoming?.discardAndClose();await base?.close();inventory.dispose();profile.free();reset();}};
 }catch(error){host?.close();await incoming?.discardAndClose();await base?.close();inventory.dispose();profile.free();reset();throw error;}
}
