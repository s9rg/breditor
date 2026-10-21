import {SharedRoomOperationalRecoveryV2,type SharedRoomRecoveryCatalogV2,type SharedRoomRecoveryCatalog,type SharedRoomOperationV2BeginOptions,type SharedRoomOperationV2ResumeOptions,type SharedRoomOperationV2Participant,type SharedRoomOperationV2Parts} from '@breditor/collaboration';
declare const catalog:SharedRoomRecoveryCatalogV2,oldCatalog:SharedRoomRecoveryCatalog,participants:readonly SharedRoomOperationV2Participant[];
const begin:SharedRoomOperationV2BeginOptions={database:'mixed-parent',catalog,expected:{catalog:'selected',sha256:'a'.repeat(64)},participants:[{family:'original',id:'old',operationDatabase:'old-op'},{family:'generation',id:'new',operationDatabase:'new-op'}],checkAuthority(){}};
const resume:SharedRoomOperationV2ResumeOptions={database:'mixed-parent',catalogDatabase:'mixed-catalog',expected:begin.expected,participants,checkAuthority(){}};
void SharedRoomOperationalRecoveryV2.begin(begin);void SharedRoomOperationalRecoveryV2.resume(resume);
// @ts-expect-error An original catalog is a different genuine private owner.
const old:SharedRoomOperationV2BeginOptions={...begin,catalog:oldCatalog};void old;
// @ts-expect-error Every selected operation has an explicit source family.
const untagged:SharedRoomOperationV2BeginOptions={...begin,participants:[{id:'new',operationDatabase:'new-op'}]};void untagged;
// @ts-expect-error No inferred/unknown source family is admitted.
const unknown:SharedRoomOperationV2BeginOptions={...begin,participants:[{id:'new',family:'future',operationDatabase:'new-op'}]};void unknown;
// @ts-expect-error Every resumed participant supplies current policy separately.
const noPolicy:SharedRoomOperationV2ResumeOptions={...resume,participants:participants.map(({currentPolicy:_policy,...rest})=>rest)};void noPolicy;
// @ts-expect-error Stored progress and metadata cannot construct genuine parent custody.
new SharedRoomOperationalRecoveryV2();
function consume(parts:SharedRoomOperationV2Parts):void{for(const row of parts.participants){if(row.family==='original'){void row.parts.sources;void row.parts.session;
 // @ts-expect-error Original parts are not generation parts.
 void row.parts.source;
 }else{void row.parts.source;
 // @ts-expect-error Generation parts are not a flattened original session.
 void row.parts.session;
 }void row.parts.uploads;}}void consume;
