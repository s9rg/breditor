/** The seven genuine families keep their exact selected core/provider types. */
import type {SharedRichEditor} from '@breditor/collaboration';
import type {OperationalSharedParticipant} from '../../../packages/breditor-collaboration/dist/participant_operation/operation.js';
import type {OperationalSharedGenerationParticipant} from '../../../packages/breditor-collaboration/dist/generation_operation/operation.js';
import type {OperationalIndependentDeliveryParticipant} from '../../../packages/breditor-collaboration/dist/independent_operation/participant.js';
import {prepareCompleteOperationParticipants} from '../../../packages/breditor-collaboration/dist/complete_operation_cohort/cohort.js';
declare const original:OperationalSharedParticipant<'document-v1'>,generation:OperationalSharedGenerationParticipant<'document-v1'>,delivery:OperationalIndependentDeliveryParticipant<'document-v1'>;
async function check(){const handoff=await prepareCompleteOperationParticipants([{id:'old',family:'original',operation:original},{id:'generation',family:'generation',operation:generation},{id:'delivery',family:'independent-delivery',operation:delivery}],[],[],async()=>{},()=>{},()=>{});for(const row of handoff.commit().participants){const core:SharedRichEditor<'document-v1'>=row.family==='original'?row.parts.session.core:row.parts.source.session.core;void core;if(row.family==='independent-local')void row.parts.original.file();else if(row.family==='local-operation-snapshot'||row.family==='local-operation-flat')void row.parts.input.file();else{
 // @ts-expect-error Other families are not local original providers.
 void row.parts.original;
 // @ts-expect-error Other families are not local operation input providers.
 void row.parts.input;
 }}}
void check;
// @ts-expect-error A nominal original owner cannot masquerade as a generation owner.
void prepareCompleteOperationParticipants([{id:'wrong',family:'generation',operation:original}],[],[],async()=>{},()=>{},()=>{});
// @ts-expect-error A readiness DTO is not custody of seven-family native state.
void prepareCompleteOperationParticipants([{id:'fake',family:'original',operation:{ready:true}}],[],[],async()=>{},()=>{},()=>{});
