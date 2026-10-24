/** The parent/source policy remains generic and no handoff operations are exposed. */
import {captureOriginalOperationalRecords} from '../../../packages/breditor-collaboration/dist/participant_operation/operation.js';
import type {OperationalSharedParticipant,SharedRustOwner} from '../../../packages/breditor-collaboration/dist/index.js';
declare const parent:OperationalSharedParticipant<'document-v1'>,restore:(checkpoint:string)=>SharedRustOwner;
const read=await captureOriginalOperationalRecords(parent,()=>{}),m=read.metadata();
const refs=await read.captureReferences({restore,checkAuthority(){}});await refs.verify();refs.checkCurrent();refs.dispose();await read.verify();read.checkCurrent();read.dispose();
// @ts-expect-error A read handle cannot expose mutable source owners.
read.sources();
// @ts-expect-error A reference read cannot expose a native editor.
refs.core;
// @ts-expect-error The parent selects its actual held children, never caller selectors.
read.captureReferences({restore,checkAuthority(){},source:parent});
// @ts-expect-error Nested selection is immutable diagnostic data.
m.selection.identity.source.writer='replacement';
// @ts-expect-error This cannot change a retained phase.
m.recovery.phase='preparing';
// @ts-expect-error File reports are immutable.
m.files.push({});
// @ts-expect-error A read scope never offers a custody handoff.
read.intoParts();
// @ts-expect-error Reports are not genuine operational parents.
await captureOriginalOperationalRecords(m,()=>{});
