/** Closed, lossless declaration checks. Actual nonce/custody checks stay in Rust. */
import {archiveFields as fields} from '../archive_integrity/policy.js';
import {decimal,digestBytes,frozen,hex} from '../room_participant_inventory/policy.js';
import {generationServerRecoveryIdentity} from '../generation_recovery_control/identity.js';
import type {SharedDeploymentSelection,SharedDurableNativeActivationSelection,SharedDurableNativeActivationReceipt} from './contract.js';
import {activationFailure as fail,MAX_SHARED_NATIVE_ACTIVATION_CONTROL_BYTES} from './policy.js';
export function deployment(value:unknown):SharedDeploymentSelection {
 const r=fields(value,'identity,generation,owner'),i=fields(r['identity'],'format,formatVersion,authority,binding');
 if(i['format']!=='breditor/room-deployment-authority'||i['formatVersion']!==1)throw fail();
 const generation=decimal(r['generation'],1048576n),owner=r['owner']===null?null:hex(r['owner']);
 if((generation==='0')!==(owner===null))throw fail();
 return{identity:{format:i['format'],formatVersion:1,authority:hex(i['authority']),binding:hex(i['binding'])},generation,owner};
}
export function nativeActivationSelection(value:unknown):SharedDurableNativeActivationSelection {
 try{
  const r=fields(value,'format,formatVersion,instance,checkpointSha256,current,previous,planned');
  if(r['format']!=='breditor/durable-native-activation-control'||r['formatVersion']!==1)throw fail();
  const current=generationServerRecoveryIdentity(r['current']),previous=deployment(r['previous']),planned=deployment(r['planned']);
  if(previous.generation==='0'||BigInt(planned.generation)!==BigInt(previous.generation)+1n||JSON.stringify(previous.identity)!==JSON.stringify(planned.identity))throw fail();
  const result=frozen({format:r['format'],formatVersion:1,instance:hex(r['instance']),checkpointSha256:digestBytes(r['checkpointSha256']),current,previous,planned} as const);
  if(new TextEncoder().encode(JSON.stringify(result)).length>MAX_SHARED_NATIVE_ACTIVATION_CONTROL_BYTES)throw fail();return result;
 }catch{throw fail('activation_policy');}
}
export function nativeActivationReceipt(text:string,expected:SharedDurableNativeActivationSelection):SharedDurableNativeActivationReceipt {
 try{const r=fields(JSON.parse(text),'format,formatVersion,selection,scope');
  if(r['format']!=='breditor/durable-native-activation-control-receipt'||r['formatVersion']!==1||r['scope']!=='actual-held-native-service-only')throw fail();
  const selection=nativeActivationSelection(r['selection']);
  const result=frozen({format:r['format'],formatVersion:1,selection,scope:r['scope']} as const);
  if(JSON.stringify(selection)!==JSON.stringify(expected)||JSON.stringify(result)!==text)throw fail();return result;
 }catch{throw fail('activation_protocol');}
}
