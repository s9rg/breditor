/** Private seven-family durable recovery choices, never a root activation API. */
import * as api from '@breditor/collaboration';
import {PhysicalRoomClientOperationV3} from '../../../packages/breditor-collaboration/dist/physical_room_operation_v3/operation.js';
import type {PhysicalOperationV3Participant,PhysicalOperationV3OpenOptions,PhysicalOperationV3Progress} from '../../../packages/breditor-collaboration/dist/physical_room_operation_v3/contract.js';
declare const open:PhysicalOperationV3OpenOptions,graph:Extract<PhysicalOperationV3Participant,{family:'restored-graph'}>,delivery:Extract<PhysicalOperationV3Participant,{family:'independent-delivery'}>,original:Extract<PhysicalOperationV3Participant,{family:'original'}>,progress:PhysicalOperationV3Progress;
void graph;void delivery;void original;
// @ts-expect-error This private coordinator is not a stable package-root API.
void api.PhysicalRoomClientOperationV3;
// @ts-expect-error Readiness data cannot transfer genuine catalog custody.
void PhysicalRoomClientOperationV3.begin({...open,catalog:{ready:true}});
// @ts-expect-error Physical catalog graphs require the complete lineage-v2 file.
const oldGraph:PhysicalOperationV3Participant={...graph,options:{...graph.options,kind:'lineage-v1'}};
// @ts-expect-error Delivery bootstrap is an explicit independently selected readonly factory.
const writableBootstrap:PhysicalOperationV3Participant={...delivery,stagingSession:{...delivery.stagingSession,readOnly:false}};
// @ts-expect-error Readonly staging cannot use a comment-writing review grant.
const writableReview:PhysicalOperationV3Participant={...delivery,stagingSession:{...delivery.stagingSession,review:{...delivery.stagingSession.review,access:'comment'}}};
const{checkAuthority:_authority,...withoutClientAuthority}=original;
// @ts-expect-error The root job's authority is not a substitute for each client's lifetime policy.
const missingClientAuthority:PhysicalOperationV3Participant=withoutClientAuthority;
// @ts-expect-error A diagnostic cannot retarget stored component namespaces.
progress.participants[0]!.namespaces[0]!.database='other';
// @ts-expect-error Namespace diagnostic arrays are immutable.
progress.participants[0]!.namespaces.push({role:'source',database:'other'});
void oldGraph;void writableBootstrap;void writableReview;void missingClientAuthority;
