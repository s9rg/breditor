/** Necessary declaration consistency only. Actual ancestry/custody is checked by the native host. */
import {archiveFields as object} from '../archive_integrity/policy.js';
import {serverGenerationRoomIdentity} from '../server_generation_archive/identity.js';
import {serverGenerationParticipantIdentity} from '../server_generation_inventory/identity.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {controlFailure as fail} from './policy.js';
import type {SharedServerLogGenerationRecoveryIdentity,SharedServerLogGenerationRecoveryControlSelection} from './contract.js';
export function generationServerRecoveryIdentity(input:unknown):SharedServerLogGenerationRecoveryIdentity {
 try{
  const r=object(input,'origin,server,participants');
  const origin=serverGenerationRoomIdentity(r['origin']),server=serverGenerationRoomIdentity(r['server']),participants=serverGenerationParticipantIdentity(r['participants']);
  const lineage=[origin,server];
  for(let i=1;i<lineage.length;i++){
   const a=lineage[i-1]!,b=lineage[i]!,x=a.native.source,y=b.native.source;
   if(x.document!==y.document||x.owner!==y.owner||x.assetBinding!==y.assetBinding||JSON.stringify(x.profile)!==JSON.stringify(y.profile)||x.writerTransportVersion!==y.writerTransportVersion||x.records>y.records||a.assets.assets>b.assets.assets||a.assets.bytes>b.assets.bytes)throw fail();
  }
  if(JSON.stringify(participants.source)!==JSON.stringify(server.native))throw fail();
  return frozen({origin,server,participants});
 }catch{throw fail();}
}
export function generationControlSelection(input:unknown):SharedServerLogGenerationRecoveryControlSelection {
 try{const r=object(input,'format,formatVersion,instance,source');if(r['format']!=='breditor/server-log-generation-recovery-control'||r['formatVersion']!==1||typeof r['instance']!=='string'||!/^[a-f0-9]{64}$/.test(r['instance']))throw fail();return frozen({format:r['format'],formatVersion:1,instance:r['instance'],source:generationServerRecoveryIdentity(r['source'])});}catch{throw fail();}
}
export function checkGenerationControlReceipt(text:string,expected:SharedServerLogGenerationRecoveryControlSelection):void {
 try{const r=object(JSON.parse(text),'format,formatVersion,selection,scope');if(r['format']!=='breditor/server-log-generation-recovery-control-read'||r['formatVersion']!==1||r['scope']!=='native-server-generation-and-server-provider')throw fail();const selection=generationControlSelection(r['selection']);if(JSON.stringify(selection)!==JSON.stringify(expected)||JSON.stringify({format:r['format'],formatVersion:1,selection,scope:r['scope']})!==text)throw fail();}catch{throw fail();}
}
