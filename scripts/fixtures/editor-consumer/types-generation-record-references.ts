/** Source selection and read factories are explicit; reports grant no custody. */
import {captureGenerationRecordReferences} from '../../../packages/breditor-collaboration/dist/generation_source/record_reference_capture.js';
import type {SharedSegmentedRelaySession,SharedRustOwner} from '../../../packages/breditor-collaboration/dist/index.js';
declare const source:SharedSegmentedRelaySession,restoreSegmented:(checkpoint:string)=>SharedRustOwner;
const read=await captureGenerationRecordReferences({source,restoreSegmented,checkAuthority(){}}),m=read.metadata();read.checkCurrent();await read.verify();read.dispose();
// @ts-expect-error Every state remains an immutable diagnostic.
m.states.push({});
// @ts-expect-error Nested native identity is immutable.
m.identity.native.writer='999';
if(m.identity.relay){
 // @ts-expect-error Nested relay identity is immutable too.
 m.identity.relay.document.principal='other';
}
// @ts-expect-error Reference pairs cannot be reassigned.
if(m.references[0])m.references[0].generation='replacement';
// @ts-expect-error A metadata DTO is not a genuine generation source.
await captureGenerationRecordReferences({source:m,restoreSegmented,checkAuthority(){}});
// @ts-expect-error The caller cannot select an alternate storage family by tag.
await captureGenerationRecordReferences({source,restoreSegmented,checkAuthority(){},kind:'retained'});
