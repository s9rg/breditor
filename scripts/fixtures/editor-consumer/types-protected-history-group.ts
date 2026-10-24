import {reserveProtectedOperationalHistoryRead} from '../../../packages/breditor-collaboration/dist/operation_read/protected_history_group.js';
import type {OperationalSharedParticipant,OperationalSharedGenerationParticipant,SharedRustOwner} from '../../../packages/breditor-collaboration/dist/index.js';
declare const original:OperationalSharedParticipant<'document-v1'>,generation:OperationalSharedGenerationParticipant<'document-v1'>,restore:(checkpoint:string)=>SharedRustOwner;
const read=reserveProtectedOperationalHistoryRead([{id:'a',family:'original',operation:original,read:{restore}},{id:'b',family:'generation',operation:generation,read:{restoreSegmented:restore}}],()=>{});await read.prepare();await read.verify();read.check();read.checkCurrent();const metadata=read.metadata();read.close();
// @ts-expect-error Group reports are deeply immutable.
metadata.participants[0]!.history.origins[0]!.references.push({asset:'replace',generation:'replace'});
// @ts-expect-error No child sources escape the read barrier.
read.sources();
// @ts-expect-error No individual mutable producer is projected.
read.participants;
// @ts-expect-error A report cannot manufacture a genuine parent.
reserveProtectedOperationalHistoryRead([{id:'bad',family:'original',operation:metadata,read:{restore}}],()=>{});
// @ts-expect-error Other delivery/local families need their own fresh admission, not a tag cast.
reserveProtectedOperationalHistoryRead([{id:'bad',family:'independent-local',operation:original,read:{restore}}],()=>{});
// @ts-expect-error The fresh group grant is common, never a stored child writer grant.
reserveProtectedOperationalHistoryRead([{id:'bad',family:'original',operation:original,read:{restore,checkAuthority(){}}}],()=>{});
