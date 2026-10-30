/** Fast regression for the genuine Native inventory versus outer archive
 * identity distinction. Actual controllers/readers, no metadata owner mocks. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import {prepareLocalMetadataReconciliationInput} from '../packages/breditor-collaboration/dist/selected_local_metadata_assets/reconciliation_input.js';
import {selectedDeliveryNativeHost} from './fixtures/selected-delivery/native-host.mjs';

test('genuine reconciliation inventory selects the Native identity inside the whole server archive',{timeout:120000},async()=>{
 const root=resolve(new URL('../',import.meta.url).pathname),native=await selectedDeliveryNativeHost(root,{suggestionGrants:true}),first=native.initial;
 const saved=Object.getOwnPropertyDescriptor(globalThis,'fetch'),originalFetch=globalThis.fetch;
 let current,host,inventory;
 try{
  Object.defineProperty(globalThis,'fetch',{configurable:true,value:(url,options={})=>{const headers=new Headers(options.headers);headers.set('Origin','http://127.0.0.1:4187');return originalFetch(url,{...options,headers});}});
  current=await api.SharedServerLogGenerationRecoveryHost.open({endpoint:first.endpoint,expected:first.selection,principal:'operator',getToken:()=>native.operatorToken(first),checkAuthority(){}});
  host=await api.SharedServerLogGenerationDeliveryRecoveryHost.open({endpoint:first.deliveryEndpoint,expected:first.deliverySelection,current,principal:'operator',getToken:()=>native.operatorToken(first),checkAuthority(){}});
  inventory=await api.SharedServerLogGenerationParticipantInventory.read(new Blob([readFileSync(join(dirname(first.path),'inventory.json'))]),first.selection.source.participants);
  assert.notDeepEqual(inventory.identity().source,first.selection.source.server);
  assert.deepEqual(inventory.identity().source,first.selection.source.server.native);
  const prepared=prepareLocalMetadataReconciliationInput({host,inventory});
  prepared.check();assert.deepEqual(prepared.metadata,inventory.metadata().native);
  let calls=0;const copied={file(){calls++;throw Error('No callback');},identity(){calls++;throw Error('No callback');},metadata(){calls++;throw Error('No callback');}};
  assert.throws(()=>prepareLocalMetadataReconciliationInput({host,inventory:copied}));assert.equal(calls,0);
  inventory.dispose();assert.throws(()=>prepared.check());
 }finally{inventory?.dispose();host?.close();current?.close();if(saved)Object.defineProperty(globalThis,'fetch',saved);else delete globalThis.fetch;await native.stop();}
});
