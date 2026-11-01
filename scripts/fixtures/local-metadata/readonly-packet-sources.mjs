/** Literal readonly Native factories for the public seven-family test DATA.
 * These do not create client custody, durable journals or operational sessions. */
import assert from 'node:assert/strict';
import {SharedRichEditor} from '../../../packages/breditor-collaboration/dist/core.js';
import {sourceNativeRecoveryRead} from '../../../packages/breditor-collaboration/dist/source_native_read.js';
export function readonlyPacketSources(source,fixture,profile){
 const probe=new SharedRichEditor(profile.restore('room',fixture.clients[0].documentCheckpoint),{richLanguage:3});let descriptor;try{probe.setReadOnly(true);descriptor=JSON.stringify(sourceNativeRecoveryRead(probe).descriptor());}finally{probe.dispose();}
 const index={original:0,generation:1,'independent-local':2,'independent-delivery':3,'restored-graph':4,'local-operation-snapshot':5,'local-operation-flat':6};
 return source.catalog().participants.map(entry=>{const client=fixture.clients[index[entry.family]],identity=(entry.selection.identity??entry.selection.original.identity).source;
  if(entry.family==='original'){assert.equal(identity.writer,client.writer);return{id:entry.id,descriptor,read:{restore:checkpoint=>profile.restore('room',checkpoint)}};}
  if(entry.family==='generation'){assert.equal(identity.native.writer,client.writer);return{id:entry.id,descriptor,read:{restoreSegmented:checkpoint=>profile.restore_segmented('room',checkpoint)}};}
  const history=identity.history??identity;assert.equal(history.native.writer,client.writer);assert.equal(history.review.actor,client.actor);assert.equal(history.documentHistory,'segmented-v1');assert.equal(history.reviewHistory,'segmented-v1');const session={room:'room',writer:client.writer,richLanguage:3,history:'explicit',rangeEditing:'original',selectionEditing:'original',searchHistory:null,reviewedHistory:null,readOnly:true,review:{actor:client.actor,principal:client.principal,access:'read_only'},documentHistory:{kind:'segmented-v1',initialGenerations:{root:'root',active:'one'},restoreSegmented:checkpoint=>profile.restore_segmented('room',checkpoint)},reviewHistory:{kind:'segmented-v1',initialGenerations:{root:'root',active:'one'}},...(identity.binding?{binding:identity.binding,retained:identity.retained}:{})};return{id:entry.id,descriptor,read:{session}};
 });
}
