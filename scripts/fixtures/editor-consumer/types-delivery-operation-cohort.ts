/** Nominal five-family custody, exact selection policy and provider differences. */
import type {SharedRichEditor} from '@breditor/collaboration';
import {type OperationalIndependentDeliveryParticipant,reserveOperationalIndependentDeliveryGroup} from '../../../packages/breditor-collaboration/dist/independent_operation/participant.js';
import {type RestoredOperationParticipant,reserveRestoredOperationGroup} from '../../../packages/breditor-collaboration/dist/restored_participant/participant.js';
import type {OperationalIndependentLocalParticipant} from '../../../packages/breditor-collaboration/dist/independent_local_operation/participant.js';
import {handoffDeliveryOperationParticipants} from '../../../packages/breditor-collaboration/dist/delivery_operation_cohort/cohort.js';
declare const delivery:OperationalIndependentDeliveryParticipant<'document-v1'>;
declare const restored:RestoredOperationParticipant<'document-v1'>;
declare const local:OperationalIndependentLocalParticipant<'document-v1'>;
function exactGroups(){const a=reserveOperationalIndependentDeliveryGroup([delivery]),b=reserveRestoredOperationGroup([restored]);const first:SharedRichEditor<'document-v1'>=a.states[0]!.source.session.core,second:SharedRichEditor<'document-v1'>=b.states[0]!.source.session.core;void first;void second;}
void exactGroups;
async function exactFamilies(){const out=await handoffDeliveryOperationParticipants([{id:'delivery',family:'independent-delivery',operation:delivery},{id:'restored',family:'restored-graph',operation:restored},{id:'local',family:'independent-local',operation:local}]);for(const row of out.participants){const core:SharedRichEditor<'document-v1'>=row.parts.source.session.core;void core;if(row.family==='independent-local')void row.parts.original.file();else if(row.family==='local-operation-snapshot'||row.family==='local-operation-flat')void row.parts.input.file();else{
 // @ts-expect-error Complete delivery sources are not relabelled as local original providers.
 void row.parts.original;
 // @ts-expect-error Complete delivery sources are not relabelled as snapshot/flat inputs.
 void row.parts.input;
 }}}
void exactFamilies;
// @ts-expect-error A marker cannot issue actual complete-delivery custody.
void reserveOperationalIndependentDeliveryGroup([{ready:true}]);
// @ts-expect-error A local parent is not the complete delivery family.
void reserveOperationalIndependentDeliveryGroup([local]);
// @ts-expect-error A delivery parent cannot stand in for a restored graph.
void reserveRestoredOperationGroup([delivery]);
// @ts-expect-error A family label cannot relabel a genuine but different parent.
void handoffDeliveryOperationParticipants([{id:'wrong',family:'restored-graph',operation:delivery}]);
