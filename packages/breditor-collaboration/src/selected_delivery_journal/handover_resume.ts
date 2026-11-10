/** Existing journal facts can cross an origin only through a live, selected handover. */
import {generationDeliveryPathRecoveryHostPort} from '../generation_delivery_path_control/host.js';
import type {SharedServerLogGenerationDeliveryPathRecoveryHost} from '../generation_delivery_path_control/host.js';
import {handoverDeliveryPathSelection} from '../generation_delivery_path_control/handover.js';
import type {SharedServerLogGenerationHandoverDeliveryPathRecoveryControlSelection} from '../generation_delivery_path_control/handover.js';
import {containsOrderedDeliveryCuts,handoverDeliveryCuts} from '../generation_delivery_path_control/retained_cuts.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {checkSelectedNativeDeliveryScope} from '../relay/native_delivery.js';
import {frozen} from '../room_participant_inventory/policy.js';
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import type {SelectedRoomCurrentSelection} from '../selected_room_current/contract.js';
import {selectedRoomCurrentSelection} from '../selected_room_current/manifest.js';
import type {SharedServerLogGenerationRoomArchive} from '../server_generation_archive/read.js';
import type {SharedServerLogGenerationParticipantInventory} from '../server_generation_inventory/read.js';
import type {DeliveryJournalIdentity,DeliveryJournalSnapshot} from './contract.js';
import {journalIdentity} from './identity.js';
import {journalNativeInputs} from './native_inputs.js';
import {fail,fields,hash,integer,MAX_DELIVERY_JOURNAL_EVENTS} from './policy.js';
import {DeliveryJournalResources} from './resources.js';

export interface DeliveryJournalHandoverChoice {
 readonly format:'breditor/selected-native-delivery-journal-handover-resume';
 readonly formatVersion:1;
 readonly journal:DeliveryJournalIdentity;
 readonly head:DeliveryJournalSnapshot['head'];
 readonly current:SelectedRoomCurrentSelection;
 readonly path:SharedServerLogGenerationHandoverDeliveryPathRecoveryControlSelection;
}
export interface DeliveryJournalHandoverRecordingInput {
 readonly path:SharedServerLogGenerationDeliveryPathRecoveryHost;
 readonly server:SharedServerLogGenerationRoomArchive;
 readonly inventory:SharedServerLogGenerationParticipantInventory;
}
export interface DeliveryJournalHandoverInspectionInput extends DeliveryJournalHandoverRecordingInput {
 readonly identity:DeliveryJournalIdentity;
 readonly checkAuthority:()=>void;
}
export interface DeliveryJournalHandoverResumeInput extends DeliveryJournalHandoverInspectionInput {
 readonly expected:DeliveryJournalHandoverChoice;
 readonly approve:(choice:DeliveryJournalHandoverChoice)=>boolean|Promise<boolean>;
}

const read=DeliveryJournalResources.prototype.readFresh;
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);

function choice(value:unknown):DeliveryJournalHandoverChoice {
 const r=fields(value,['format','formatVersion','journal','head','current','path']);
 const head=fields(r['head'],['sequence','sha256']);
 if(r['format']!=='breditor/selected-native-delivery-journal-handover-resume'||r['formatVersion']!==1)throw fail('delivery_journal_policy');
 return frozen({
  format:r['format'],formatVersion:1,journal:journalIdentity(r['journal']),
  head:{sequence:integer(head['sequence'],MAX_DELIVERY_JOURNAL_EVENTS-1),sha256:hash(head['sha256'])},
  current:selectedRoomCurrentSelection(r['current']),path:handoverDeliveryPathSelection(r['path']),
 });
}

export function handoverRecordingInputs(input:DeliveryJournalHandoverRecordingInput){
 const path=generationDeliveryPathRecoveryHostPort(input.path),handover=path.handover;
 if(!handover)throw fail('delivery_journal_policy');
 return Object.freeze({handover,host:input.path,path,native:journalNativeInputs(input.server,input.inventory)});
}

export function handoverResumeInputs(supplied:DeliveryJournalHandoverInspectionInput|DeliveryJournalHandoverResumeInput,resume:boolean){
 const input={...supplied} as DeliveryJournalHandoverResumeInput;
 fields(input,['identity','path','server','inventory','checkAuthority',...(resume?['expected','approve']:[])]);
 const identity=journalIdentity(input.identity),expected=resume?choice(input.expected):undefined,approve=resume?input.approve:undefined;
 if(resume&&(typeof approve!=='function'||!equal(expected!.journal,identity)))throw fail('delivery_journal_policy');
 const decide=approve&&expected?()=>approve(expected):undefined;
 return Object.freeze({...handoverRecordingInputs(input),identity,authority:participantAuthority(input.checkAuthority),expected,decide});
}
export type HandoverResumeInputs=ReturnType<typeof handoverResumeInputs>;

export async function inspectHandoverResume(
 scope:SelectedNativeRecoveryScope,journal:DeliveryJournalResources,
 input:ReturnType<typeof handoverRecordingInputs>,identity:DeliveryJournalIdentity,guard:()=>void,
){
 checkSelectedNativeDeliveryScope(scope);guard();input.native.check();
 const snapshot=await read.call(journal);
 const pins=input.handover.path.successor.current;
 if(!equal(snapshot.identity,identity)||!equal(snapshot.entries[0]!.event.current,identity.prepared.before)||
  !equal(input.native.source,pins.server)||!equal(input.native.participants,pins.participants)||
  !containsOrderedDeliveryCuts(handoverDeliveryCuts(input.handover.path),snapshot.entries.map(row=>row.event.server.identity)))throw fail();
 await input.path.check(scope.signal);guard();
 const current=await scope.retainExtendingAll(snapshot.entries.map(row=>row.current));
 await scope.readHandoverDeliveryReconciliation(input.host,input.native.reader);
 input.native.check();guard();await input.path.check(scope.signal);
 const after=await read.call(journal);
 if(!equal(after.head,snapshot.head)||!equal(after.entries.map(row=>row.sha256),snapshot.entries.map(row=>row.sha256))||
  !equal((await scope.retainCurrent()).current.selection,current.current.selection))throw fail();
 guard();
 return Object.freeze({snapshot:after,current,choice:choice({
  format:'breditor/selected-native-delivery-journal-handover-resume',formatVersion:1,
  journal:identity,head:after.head,current:current.current.selection,path:input.handover,
 })});
}
