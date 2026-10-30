/** The actual complete retained root supplies the parent callback and leases.
 * This finite loan does not connect or synthesize a publication receipt. */
import test from 'node:test';import assert from 'node:assert/strict';
import {generationCompleteControlFixtures} from './fixtures/generation-recovery-control/complete-fixtures.mjs';
import {acceptedControlTransport} from './fixtures/selected-generation-reconciliation/accepted-transport.mjs';
import {generationSelectedSession} from './fixtures/selected-generation-reconciliation/session.mjs';
import {withSelectedNativeDeliverySources as held} from '../packages/breditor-collaboration/dist/physical_room_asset_successor/owner.js';
import {createSelectedNativeRelayDelivery} from '../packages/breditor-collaboration/dist/relay/native_delivery.js';
import {createNativeVersionDelivery} from '../packages/breditor-collaboration/dist/versions/native_delivery.js';
import {internalFailureChain} from '../packages/breditor-collaboration/dist/internal_failure_cause.js';
test('actual seven-family retained root stays live while its original catalog is lent natively',{timeout:600000},async()=>{
 const root=new URL('../',import.meta.url).pathname,fixtures=await generationCompleteControlFixtures(root),transport=acceptedControlTransport(fixtures.manifest);let session,context,versions,tokens=0;
 try{
  session=await generationSelectedSession(fixtures,'actual-original-retained-version-loan',{generationKind:'retained',documentSegmented:true,reviewSegmented:true});
  await held(session.owner,session.input(),async(scope,sources,check)=>{
   const row=sources.find(row=>row.source.parent.kind==='original');assert.ok(row);const catalog=row.source.parent.packets.versions;assert.ok(catalog);
   const before=row.source.core.documentJson();check();
   context=createSelectedNativeRelayDelivery(scope,row.source,'comment',check);
   versions=createNativeVersionDelivery(catalog,context,{getToken(){tokens++;throw Error('A finite loan must not authenticate automatically');}});
   check();row.source.check();assert.equal(tokens,0);assert.throws(()=>catalog.saveVersion('Ordinary catalog writes stay blocked','99'));
   await versions.close();await context.close();check();
   assert.equal(row.source.core.documentJson(),before);await scope.retainCurrent();check();
  });
  assert.equal(tokens,0);
  for(const row of session.owner.clients){const before=row.core.documentJson();assert.equal(row.core.undo(),true);assert.equal(row.core.redo(),true);assert.equal(row.core.documentJson(),before);assert.equal(row.core.undoReview().kind,'committed');assert.equal(row.core.redoReview().kind,'committed');}
 }catch(error){console.log('ACTUAL_ROOT_VERSION_RETENTION_FAILURE '+JSON.stringify(internalFailureChain(error).map(value=>({code:value.code,message:value.message}))));throw error;}
 finally{await versions?.close();await context?.close();await session?.close();transport.restore();await fixtures.close();}
});
