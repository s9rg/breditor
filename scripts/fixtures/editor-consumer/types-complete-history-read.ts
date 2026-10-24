import {reserveCompleteOperationalHistoryRead,type CompleteHistoryParticipant} from '../../../packages/breditor-collaboration/dist/complete_operation_cohort/history_read.js';
import {PhysicalRoomClientOperationV3} from '../../../packages/breditor-collaboration/dist/physical_room_operation_v3/operation.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../../../packages/breditor-collaboration/dist/physical_room_operation_v3/history_read_contract.js';
declare const rows:readonly CompleteHistoryParticipant<'document-v1'>[],operation:PhysicalRoomClientOperationV3,options:PhysicalOperationV3HistoryReadOptions<'document-v1'>;
const read=reserveCompleteOperationalHistoryRead(rows,()=>{});await read.prepare();await read.verify();read.check();read.checkCurrent();const group=read.metadata();read.close();const report=await operation.readHistory(options);
// @ts-expect-error The group never exposes a native owner.
read.sources();
// @ts-expect-error Detached history is deeply immutable.
group.participants[0]!.history.references.push({asset:'replace',generation:'replace'});
// @ts-expect-error A detached report is not an operational parent.
reserveCompleteOperationalHistoryRead([{id:'fake',family:'original',operation:report,read:{restore(){throw Error();}}}],()=>{});
// @ts-expect-error No caller-selected replacement participant can enter root reads.
operation.readHistory({...options,participants:rows});
// @ts-expect-error These are history addresses, never current provider coverage.
report.registeredStreamsCovered;
// @ts-expect-error An inspection report cannot activate a room.
report.activate();
// @ts-expect-error Detached root history is immutable.
report.history.participants.push(group.participants[0]!);
