import {captureOriginalOperationalHistoryReferences} from '../../../packages/breditor-collaboration/dist/participant_operation/operation.js';
import {captureGenerationOperationalHistoryReferences} from '../../../packages/breditor-collaboration/dist/generation_operation/operation.js';
import type {OperationalSharedParticipant,OperationalSharedGenerationParticipant,SharedRustOwner} from '../../../packages/breditor-collaboration/dist/index.js';
declare const original:OperationalSharedParticipant<'document-v1'>,generation:OperationalSharedGenerationParticipant<'document-v1'>,restore:(checkpoint:string)=>SharedRustOwner;
const a=await captureOriginalOperationalHistoryReferences(original,{restore,checkAuthority(){}}),b=await captureGenerationOperationalHistoryReferences(generation,{restoreSegmented:restore,checkAuthority(){}});
for(const read of[a,b]){read.check();read.checkCurrent();await read.verify();const metadata=read.metadata();
 // @ts-expect-error History diagnostics are deeply immutable.
 metadata.origins[0]!.references.push({asset:'replace',generation:'replace'});
 // @ts-expect-error No mutable editor is exposed.
 read.core;
 // @ts-expect-error No handoff or activation authority is exposed.
 read.intoParts();
 // @ts-expect-error No source facade is exposed.
 read.sources();
 read.dispose();}
// @ts-expect-error Current children cannot be replaced by a caller source.
captureOriginalOperationalHistoryReferences(original,{restore,source:original,checkAuthority(){}});
// @ts-expect-error Generation native factories are explicit, not inferred from a report.
captureGenerationOperationalHistoryReferences(generation,{restore,checkAuthority(){}});
// @ts-expect-error A detached report is not a genuine parent.
captureOriginalOperationalHistoryReferences(a.metadata(),{restore,checkAuthority(){}});
