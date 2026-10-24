import {captureGenerationOperationalRecords} from '../../../packages/breditor-collaboration/dist/generation_operation/operation.js';
import type {OperationalSharedGenerationParticipant,SharedRustOwner} from '../../../packages/breditor-collaboration/dist/index.js';
declare const parent:OperationalSharedGenerationParticipant<'document-v1'>,restoreSegmented:(checkpoint:string)=>SharedRustOwner;
const read=await captureGenerationOperationalRecords(parent,()=>{}),m=read.metadata();
const refs=await read.captureReferences({restoreSegmented,checkAuthority(){}});await refs.verify();refs.checkCurrent();refs.dispose();await read.verify();read.checkCurrent();read.dispose();
// @ts-expect-error Read handles never expose editable source owners.
read.sources();
// @ts-expect-error References never expose a native core.
refs.core;
// @ts-expect-error The host cannot replace the parent's genuine selected source.
read.captureReferences({restoreSegmented,checkAuthority(){},source:parent});
// @ts-expect-error Nested source identity is immutable.
m.selection.identity.source.native.writer='replacement';
// @ts-expect-error A report cannot change a recovery marker.
m.recovery.phase='preparing';
// @ts-expect-error This is not an owner handoff.
read.intoParts();
// @ts-expect-error Data reports are not genuine operational parents.
await captureGenerationOperationalRecords(m,()=>{});
