import {SharedPhysicalRoomClientOperation,type SharedPhysicalRoomParticipantStage,type SharedPhysicalRoomRecoveryCatalog,type SharedPhysicalRoomOperationTarget,type SharedPhysicalRoomOperationParticipant,type SharedPhysicalRoomOperationProgress,type SharedPhysicalRoomStageParticipant,type SharedRoomOperationalRecoveryV2} from '@breditor/collaboration';
import * as wasm from '@breditor/collaboration/wasm';
declare const stage:SharedPhysicalRoomParticipantStage,catalog:SharedPhysicalRoomRecoveryCatalog,targets:readonly SharedPhysicalRoomOperationTarget[],participants:readonly SharedPhysicalRoomOperationParticipant[],stagedParticipants:readonly SharedPhysicalRoomStageParticipant[];
const options={wasm,database:'physical-client-operation',stage,expected:stage.selection(),participants:targets,checkAuthority(){}};
const opening=SharedPhysicalRoomClientOperation.begin(options);
opening.then(async owner=>{const progress:SharedPhysicalRoomOperationProgress=await owner.finish();const file:Blob=owner.currentServerFile();await owner.check();const parts=await owner.intoParts();for(const row of parts.participants){if(row.family==='original')row.parts.session.core.documentJson();else row.parts.source.session.core.documentJson();}return[progress,file];});
SharedPhysicalRoomClientOperation.resume({wasm,database:'physical-client-operation',stageDatabase:'physical-stage',catalogDatabase:'physical-catalog',expected:stage.selection(),participants,checkAuthority(){}});
// @ts-expect-error A source catalog alone has no private native staging owners.
SharedPhysicalRoomClientOperation.begin({...options,stage:catalog});
// @ts-expect-error Saved client identities do not select current account permissions.
SharedPhysicalRoomClientOperation.resume({wasm,database:'physical-client-operation',stageDatabase:'physical-stage',catalogDatabase:'physical-catalog',expected:stage.selection(),participants:stagedParticipants,checkAuthority(){}});
// @ts-expect-error A client parent does not activate a server.
opening.then(owner=>owner.activate());
// @ts-expect-error Actual physical custody is not an older V2 parent.
opening.then(owner=>{const old:SharedRoomOperationalRecoveryV2=owner;return old;});
// @ts-expect-error Exact current/origin native source pins remain immutable.
opening.then(owner=>{owner.metadata().current.server.identity.native.source.records=0;});
