/** Closed seven-family construction. Only actual retained family metadata
 * selects a concrete builder; there are no host-supplied adapters. */
import type {NativeReconstructionParticipantContext as Context} from './inspection_context.js';
import type {RecordPayloadFamily} from '../operation_read/record_payload.js';
import {buildOriginalReconstructionRecipe} from './original_recipe.js';
import {buildGenerationReconstructionRecipe} from './generation_recipe.js';
import {buildLocalReconstructionRecipe} from './local_recipe.js';
import {buildDeliveryReconstructionRecipe,type DeliveryReconstructionReadFactory} from './delivery_recipe.js';
import {buildGraphReconstructionRecipe} from './graph_recipe.js';
import {buildLocalInputReconstructionRecipe,type LocalInputReconstructionReadFactory} from './local_input_recipe.js';
import {compareReconstructionPackets} from './compare_packets.js';
import type {OriginalRecordReferenceOptions} from '../persistence/original_record_reference_capture.js';
import type {GenerationRecordReferenceOptions} from '../generation_source/record_reference_capture.js';
import type {SharedIndependentRecoveryFactory} from '../independent_recovery/contract.js';
import {fail} from './policy.js';
export async function buildComparedReconstructionParticipant(c:Context,outputFamily:RecordPayloadFamily){
 const family=c.retained.participant(c.id).family;if(outputFamily!==(family==='local-operation-snapshot'?'local-operation-flat':family))throw fail('native_reconstruction_policy');await compareReconstructionPackets(c);
 const common={id:c.id,...(c.assets===undefined?{}:{assets:c.assets}),...(c.resolveAsset===undefined?{}:{resolveAsset:c.resolveAsset})};
 switch(family){case'original':return buildOriginalReconstructionRecipe(c.retained,{...common,descriptor:c.descriptor,read:c.read as Pick<OriginalRecordReferenceOptions,'restore'|'editor'>});case'generation':return buildGenerationReconstructionRecipe(c.retained,{...common,descriptor:c.descriptor,read:c.read as Pick<GenerationRecordReferenceOptions,'restoreSegmented'|'restoreContinued'|'editor'>});case'independent-local':return buildLocalReconstructionRecipe(c.retained,{...common,session:(c.read as {session:SharedIndependentRecoveryFactory}).session});case'independent-delivery':return buildDeliveryReconstructionRecipe(c.retained,{...common,session:(c.read as {session:DeliveryReconstructionReadFactory}).session});case'restored-graph':return buildGraphReconstructionRecipe(c.retained,{...common,descriptor:c.descriptor,session:(c.read as {session:DeliveryReconstructionReadFactory}).session});case'local-operation-snapshot':case'local-operation-flat':return buildLocalInputReconstructionRecipe(c.retained,{...common,outputFamily:'local-operation-flat',descriptor:c.descriptor,session:(c.read as {session:LocalInputReconstructionReadFactory}).session});}
}
