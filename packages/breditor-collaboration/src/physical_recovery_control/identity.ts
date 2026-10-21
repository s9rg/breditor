/** Necessary declaration consistency only. Actual ancestry/custody is checked by the native host. */
import {archiveFields as object} from '../archive_integrity/policy.js';
import {serverGenerationRoomIdentity} from '../server_generation_archive/identity.js';
import {serverGenerationParticipantIdentity} from '../server_generation_inventory/identity.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {controlFailure as fail} from './policy.js';
import type {SharedPhysicalServerRecoveryIdentity,SharedPhysicalRecoveryControlSelection} from './contract.js';
export function physicalServerRecoveryIdentity(input:unknown):SharedPhysicalServerRecoveryIdentity {
 try{
  const r=object(input,'format,formatVersion,ancestor,localOrigin,server,participants');
  if(r['format']!=='breditor/physical-server-room-recovery-state'||r['formatVersion']!==1)throw fail();
  const ancestor=serverGenerationRoomIdentity(r['ancestor']),localOrigin=serverGenerationRoomIdentity(r['localOrigin']),server=serverGenerationRoomIdentity(r['server']),participants=serverGenerationParticipantIdentity(r['participants']);
  const lineage=[ancestor,localOrigin,server];
  for(let i=1;i<lineage.length;i++){
   const a=lineage[i-1]!,b=lineage[i]!,x=a.native.source,y=b.native.source;
   if(x.document!==y.document||x.owner!==y.owner||x.assetBinding!==y.assetBinding||JSON.stringify(x.profile)!==JSON.stringify(y.profile)||x.writerTransportVersion!==y.writerTransportVersion||x.records>y.records||a.assets.assets>b.assets.assets||a.assets.bytes>b.assets.bytes)throw fail();
  }
  if(JSON.stringify(participants.source)!==JSON.stringify(server.native))throw fail();
  return frozen({format:r['format'],formatVersion:1,ancestor,localOrigin,server,participants});
 }catch{throw fail();}
}
export function physicalControlSelection(input:unknown):SharedPhysicalRecoveryControlSelection {
 try{const r=object(input,'format,formatVersion,instance,source');if(r['format']!=='breditor/physical-room-recovery-control'||r['formatVersion']!==1||typeof r['instance']!=='string'||!/^[a-f0-9]{64}$/.test(r['instance']))throw fail();return frozen({format:r['format'],formatVersion:1,instance:r['instance'],source:physicalServerRecoveryIdentity(r['source'])});}catch{throw fail();}
}
export function checkPhysicalControlReceipt(text:string,expected:SharedPhysicalRecoveryControlSelection):void {
 try{const r=object(JSON.parse(text),'format,formatVersion,selection,scope');if(r['format']!=='breditor/physical-room-recovery-control-read'||r['formatVersion']!==1||r['scope']!=='native-physical-and-server-provider')throw fail();const selection=physicalControlSelection(r['selection']);if(JSON.stringify(selection)!==JSON.stringify(expected)||JSON.stringify({format:r['format'],formatVersion:1,selection,scope:r['scope']})!==text)throw fail();}catch{throw fail();}
}
