/** Explicit genuine sources and restore factories; diagnostics grant no custody. */
import {captureOriginalRecordReferences} from '../../../packages/breditor-collaboration/dist/persistence/original_record_reference_capture.js';
import type {SharedReviewPersistentSession,SharedDocumentVersions,SharedSuggestionRevisions,SharedSuggestionQueue,SharedRustOwner} from '../../../packages/breditor-collaboration/dist/index.js';
declare const source:SharedReviewPersistentSession,versions:SharedDocumentVersions,revisions:SharedSuggestionRevisions,suggestions:SharedSuggestionQueue,restore:(checkpoint:string)=>SharedRustOwner;
const read=await captureOriginalRecordReferences({source,versions,revisions,restore,checkAuthority(){}}),m=read.metadata();read.checkCurrent();await read.verify();read.dispose();
// @ts-expect-error States are immutable diagnostics.
m.states.push({});
// @ts-expect-error Reference pairs cannot be changed.
if(m.references[0])m.references[0].asset='replacement';
// @ts-expect-error Nested dependency identity is immutable.
for(const s of m.states)for(const p of s.pending)if(p.kind==='source')p.packet.id='replacement';
// @ts-expect-error Metadata is not native source custody.
await captureOriginalRecordReferences({source:m,restore,checkAuthority(){}});
// @ts-expect-error A caller family tag cannot select an original source.
await captureOriginalRecordReferences({source,restore,checkAuthority(){},kind:'paired'});
// @ts-expect-error Revisions already own their base queue reservation.
await captureOriginalRecordReferences({source,restore,revisions,suggestions,checkAuthority(){}});
