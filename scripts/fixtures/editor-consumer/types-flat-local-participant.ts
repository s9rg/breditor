import {SharedIndependentHistoryPersistentSession,type SharedIndependentHistorySessionOptions} from '@breditor/collaboration';
// @ts-expect-error A complete flat-local owner is not a public-root promotion.
import {OperationalFlatLocalParticipant} from '@breditor/collaboration';
// @ts-expect-error Saved flags do not acquire an executable parent opening.
import {NativeInputParticipantOpening} from '@breditor/collaboration';
import {OperationalFlatLocalParticipant as Parent} from '../../../packages/breditor-collaboration/dist/flat_local_operation/participant.js';
import type {FlatLocalParticipantOptions,FlatLocalParticipantParts} from '../../../packages/breditor-collaboration/dist/flat_local_operation/participant_contract.js';
import type {FlatLocalInputOptions} from '../../../packages/breditor-collaboration/dist/flat_local_operation/policy.js';
declare const file:Blob,options:FlatLocalParticipantOptions<'document-v1'>,standalone:FlatLocalInputOptions<'document-v1'>,source:SharedIndependentHistorySessionOptions;
const parent=await Parent.begin(file,options),parts:Readonly<FlatLocalParticipantParts<'document-v1'>>=await parent.intoParts();
const selected:SharedIndependentHistoryPersistentSession<'document-v1'>=parts.source.session;
const format:'breditor/shared-document-view'=selected.core.view().format;
void format;parts.input.file();parts.uploads.list();
// @ts-expect-error The complete operational parent requires all four namespaces.
Parent.resume(standalone);
// @ts-expect-error Actual native/upload owners are privately constructed.
new Parent({ready:true});
// @ts-expect-error A source DTO cannot select whole operational ownership.
SharedIndependentHistoryPersistentSession.open({...source,flatLocalParticipant:{phase:'operational'}});
