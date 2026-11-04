/** Reproduce the wrong predecessor independently of the complete joint owner.
 * Hosts, inventory and changing document/comment streams are genuine Native
 * controls. The catalogue is immutable DATA with no recovered actors or grant.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {probeSelectedDeliveryCase} from './probe-selected-delivery.mjs';
import {selectedDeliveryNativeHost} from './fixtures/selected-delivery/native-host.mjs';
import {nativePublicationPredecessorRoot} from './fixtures/native-publication/predecessor-root.mjs';
import {SharedDurableNativeActivationHost as Activation,nativeActivationHostPort} from '../packages/breditor-collaboration/dist/native_activation_control/host.js';
import * as wasm from '../packages/breditor-collaboration/dist/runtime/breditor_shared.js';
import {SharedServerLogGenerationRoomArchive as Server} from '../packages/breditor-collaboration/dist/server_generation_archive/read.js';
import {SharedServerLogGenerationParticipantInventory as Inventory} from '../packages/breditor-collaboration/dist/server_generation_inventory/read.js';
import {SharedServerLogGenerationRecoveryHost as Current} from '../packages/breditor-collaboration/dist/generation_recovery_control/host.js';
import {SharedServerLogGenerationDeliveryRecoveryHost as Delivery} from '../packages/breditor-collaboration/dist/generation_delivery_control/host.js';
import {physicalCatalogV3Metadata} from '../packages/breditor-collaboration/dist/physical_room_catalog_v3/manifest.js';
import {admitSelectedDeliveryInventory} from '../packages/breditor-collaboration/dist/selected_delivery_reconciliation/inventory.js';

async function pendingControl(selectOriginal){
 const root=new URL('../',import.meta.url).pathname,runtime=new URL('../packages/breditor-collaboration/dist/runtime/',import.meta.url).pathname;
 const result=await probeSelectedDeliveryCase(root,runtime,{language:3,standard:true,atomic:true},{nativeHostRoot:nativePublicationPredecessorRoot,nativeHostFactory:(root,options)=>selectedDeliveryNativeHost(root,{...options,nativeActivation:true,nativePublication:true}),async onAdvancedControls({host,first,after,chained,delivery,chainedDelivery}){
  const folder=dirname(first.path),originFile=new Blob([readFileSync(join(folder,'server.backup'))]),serverFile=new Blob([readFileSync(join(folder,'server-after.backup'))]),inventoryFile=new Blob([readFileSync(join(folder,'inventory.json'))]);
  let origin,server,initialInventory,inventory,current,selected,activation;
  try{
   origin=await Server.read(originFile,first.selection.source.origin,{wasm,checkAuthority(){}});
   server=await Server.read(serverFile,first.selection.source.server,{wasm,checkAuthority(){}});
   initialInventory=await Inventory.read(inventoryFile,first.selection.source.participants);
   // Empty participants describe only this server boundary DATA. Admission
   // still requires the actual current Native host and exact inventory reader.
   const catalog=physicalCatalogV3Metadata({format:'breditor/shared-physical-room-recovery-catalog',formatVersion:3,catalog:'native-predecessor-regression',origin:{identity:origin.identity(),bytes:originFile.size},current:{server:{identity:server.identity(),bytes:serverFile.size},participants:{identity:initialInventory.identity(),bytes:inventoryFile.size}},participants:[]});
   inventory=await Inventory.read(new Blob([readFileSync(join(dirname(after.path),'inventory.json'))]),after.selection.source.participants);
   assert.notDeepEqual(chained.deliverySelection.continuation.previous,first.selection.source.server);
   assert.deepEqual(chained.selection.source,after.selection.source);
   assert.throws(()=>admitSelectedDeliveryInventory(chainedDelivery,inventory,catalog),e=>e.code==='inventory_source');
   await chainedDelivery.check();
   admitSelectedDeliveryInventory(delivery,inventory,catalog).check();
   await delivery.check();
   await assert.rejects(host.prepareJointActivationAfter(after.selection.source,{...first}),/actual observed complete predecessor/);
   const offer=await (selectOriginal?host.prepareJointActivationAfter(after.selection.source,first):host.prepareJointActivation(after.selection.source));
   const actual=offer.case;
   assert.deepEqual(actual.selection.source,after.selection.source);
   if(selectOriginal)assert.deepEqual(actual.deliverySelection.continuation.previous,first.selection.source.server);
   else assert.notDeepEqual(actual.deliverySelection.continuation.previous,first.selection.source.server);
   await assert.rejects(host.refreshAfter(first),/finish-the-actual-activation-first/);
   activation=Activation.configure({endpoint:offer.endpoint,expected:offer.selection,principal:'operator',getToken:()=>host.activationToken(offer),checkAuthority(){}});
   await nativeActivationHostPort(activation).commit(()=>{});
   await assert.rejects(host.refreshAfter(first),/finish-the-actual-activation-first/);
   current=await Current.open({endpoint:actual.endpoint,expected:actual.selection,principal:'operator',getToken:()=>host.operatorToken(actual),checkAuthority(){}});
   selected=await Delivery.open({endpoint:actual.deliveryEndpoint,expected:actual.deliverySelection,current,principal:'operator',getToken:()=>host.operatorToken(actual),checkAuthority(){}});
   if(selectOriginal)admitSelectedDeliveryInventory(selected,inventory,catalog).check();
   else assert.throws(()=>admitSelectedDeliveryInventory(selected,inventory,catalog),e=>e.code==='inventory_source');
   await selected.check();
  }finally{activation?.close();selected?.close();current?.close();inventory?.dispose();initialInventory?.dispose();server?.dispose();origin?.dispose();}
 }});
 assert.equal(result.authors,7);assert.equal(result.coldReopens,7);assert.equal(result.futureHistorySteps,28);
}
test('legacy pending controls keep latest-predecessor semantics and refuse the old catalogue',{timeout:240000},()=>pendingControl(false));
test('explicit observed predecessor provisions fresh valid controls through pending publication',{timeout:240000},()=>pendingControl(true));
