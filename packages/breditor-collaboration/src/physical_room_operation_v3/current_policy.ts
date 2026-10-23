/** Validate every selected current/fresh replay factory before any child is
 * opened. These existing component snapshots construct no native writer, issue
 * no lease and touch no destination. Caller authority is still explicit. */
import type {PhysicalOperationV3Participant} from './contract.js';
import {snapshotLocalParticipant} from '../independent_local_operation/participant_prepare.js';
import {snapshotOperationParticipant} from '../independent_operation/participant_prepare.js';
import {snapshotIndependentDeliveryFactory} from '../independent_delivery_recovery/factory_policy.js';
import {restoredParticipantPolicy} from '../restored_participant/policy.js';
import {snapshotRestoredLocalPolicy} from '../restored_local_operation/policy.js';
import {snapshotFlatLocalPolicy} from '../flat_local_operation/policy.js';
export function validatePhysicalOperationV3CurrentPolicy(row:PhysicalOperationV3Participant):void{
 switch(row.family){
  // Their genuine legacy preparation validates the corresponding session and
  // all retained-dependent factories as one existing closed family contract.
  case'original':case'generation':return;
  case'independent-local':snapshotLocalParticipant(row.options,false);return;
  case'independent-delivery':snapshotOperationParticipant(row.options,false);snapshotIndependentDeliveryFactory(row.options.recovery.expected,row.stagingSession,true);return;
  case'restored-graph':restoredParticipantPolicy(row.options);return;
  case'local-operation-snapshot':snapshotRestoredLocalPolicy(row.options);return;
  case'local-operation-flat':snapshotFlatLocalPolicy(row.options);return;
 }
}
