/** Closed handover selection and receipt. Only a fresh native read proves ancestry. */
import {archiveFields as fields} from '../archive_integrity/policy.js';
import type {SharedDeploymentSelection} from '../native_activation_control/contract.js';
import {deployment} from '../native_activation_control/identity.js';
import {frozen} from '../room_participant_inventory/policy.js';
import type {SharedServerLogGenerationRoomBackupIdentity} from '../server_generation_archive/contract.js';
import {serverGenerationRoomIdentity} from '../server_generation_archive/identity.js';
import type {
 SharedServerLogGenerationDeliveryPathIdentity,
 SharedServerLogGenerationDeliveryPathRecoveryControlSelection,
 SharedServerLogGenerationDeliveryPathRecoveryHostOptions,
} from './contract.js';
import {deliveryPathControlSelection, deliveryPathIdentity, ordered} from './identity.js';
import {deliveryPathControlFailure as fail, MAX_SERVER_GENERATION_DELIVERY_PATH_ANCESTORS as count, MAX_SERVER_GENERATION_DELIVERY_PATH_CONTROL_BYTES as maximum} from './policy.js';

export interface SharedServerLogGenerationHandoverDeliveryPathIdentity {
 readonly format:'breditor/server-log-generation-handover-delivery-path';
 readonly formatVersion:1;
 readonly seal:SharedDeploymentSelection;
 readonly earlier:readonly SharedServerLogGenerationRoomBackupIdentity[];
 readonly successor:SharedServerLogGenerationDeliveryPathIdentity;
}

export interface SharedServerLogGenerationHandoverDeliveryPathRecoveryControlSelection {
 readonly format:'breditor/server-log-generation-handover-delivery-path-recovery-control';
 readonly formatVersion:1;
 readonly path:SharedServerLogGenerationHandoverDeliveryPathIdentity;
 readonly current:SharedServerLogGenerationDeliveryPathRecoveryControlSelection;
}

export interface SharedServerLogGenerationHandoverDeliveryPathRecoveryHostOptions
 extends Omit<SharedServerLogGenerationDeliveryPathRecoveryHostOptions,'expected'> {
 readonly expected:SharedServerLogGenerationHandoverDeliveryPathRecoveryControlSelection;
}

export function handoverDeliveryPathSelection(input:unknown):SharedServerLogGenerationHandoverDeliveryPathRecoveryControlSelection {
 try {
  const control=fields(input,'format,formatVersion,path,current');
  const path=fields(control['path'],'format,formatVersion,seal,earlier,successor');
  if(control['format']!=='breditor/server-log-generation-handover-delivery-path-recovery-control'||control['formatVersion']!==1||
   path['format']!=='breditor/server-log-generation-handover-delivery-path'||path['formatVersion']!==1)throw fail();
  const successor=deliveryPathIdentity(path['successor']);
  const current=deliveryPathControlSelection(control['current']);
  if(JSON.stringify(successor)!==JSON.stringify(current.path))throw fail();
  const seal=deployment(path['seal']);
  if(seal.generation==='0')throw fail();
  const provided=path['earlier'];
  if(!Array.isArray(provided)||provided.length<1||provided.length+successor.ancestors.length>count||
   Object.keys(provided).length!==provided.length)throw fail();
  const earlier:SharedServerLogGenerationRoomBackupIdentity[]=[];
  for(let index=0;index<provided.length;index++){
   if(!Object.hasOwn(provided,index))throw fail();
   const cut=serverGenerationRoomIdentity(provided[index]);
   const previous=earlier.at(-1);
   if(previous)ordered(previous,cut);
   earlier.push(cut);
  }
  ordered(earlier.at(-1)!,successor.current.origin);
  const selection=frozen({
   format:control['format'],formatVersion:1,
   path:{format:path['format'],formatVersion:1,seal,earlier,successor},current,
  } as const);
  if(new TextEncoder().encode(receipt(selection)).length>maximum)throw fail();
  return selection;
 }catch{throw fail();}
}

function receipt(selection:SharedServerLogGenerationHandoverDeliveryPathRecoveryControlSelection):string {
 return JSON.stringify({
  format:'breditor/server-log-generation-handover-delivery-path-recovery-control-read',
  formatVersion:1,selection,scope:'sealed-native-handover-path-and-current-provider',
 });
}

export function checkHandoverDeliveryPathReceipt(text:string,expected:SharedServerLogGenerationHandoverDeliveryPathRecoveryControlSelection):void {
 try {
  const read=fields(JSON.parse(text),'format,formatVersion,selection,scope');
  const selected=handoverDeliveryPathSelection(read['selection']);
  if(JSON.stringify(selected)!==JSON.stringify(expected)||receipt(selected)!==text)throw fail();
 }catch{throw fail();}
}
