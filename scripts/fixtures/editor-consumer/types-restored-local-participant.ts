import {SharedIndependentHistoryPersistentSession,type SharedIndependentHistorySessionOptions} from '@breditor/collaboration';
// @ts-expect-error A complete restored-local owner is not a public-root promotion.
import {OperationalRestoredLocalParticipant} from '@breditor/collaboration';
// @ts-expect-error Saved flags do not acquire an executable parent opening.
import {RestoredLocalParticipantOpening} from '@breditor/collaboration';
import {OperationalRestoredLocalParticipant as Parent} from '../../../packages/breditor-collaboration/dist/restored_local_operation/participant.js';
import type {RestoredLocalParticipantOptions,RestoredLocalParticipantParts} from '../../../packages/breditor-collaboration/dist/restored_local_operation/participant_contract.js';
import type {RestoredLocalInputOptions} from '../../../packages/breditor-collaboration/dist/restored_local_operation/policy.js';
declare const file:Blob,options:RestoredLocalParticipantOptions<'document-v1'>,standalone:RestoredLocalInputOptions<'document-v1'>,source:SharedIndependentHistorySessionOptions;
const parent=await Parent.begin(file,options),parts:Readonly<RestoredLocalParticipantParts<'document-v1'>>=await parent.intoParts();
const selected:SharedIndependentHistoryPersistentSession<'document-v1'>=parts.source.session;
const format:'breditor/shared-document-view'=selected.core.view().format;
void format;parts.input.file();parts.uploads.list();
// @ts-expect-error The complete operational parent requires all four namespaces.
Parent.resume(standalone);
// @ts-expect-error Actual native/upload owners are privately constructed.
new Parent({ready:true});
// @ts-expect-error A source DTO cannot select whole operational ownership.
SharedIndependentHistoryPersistentSession.open({...source,restoredLocalParticipant:{phase:'operational'}});
