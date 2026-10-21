import {SharedPhysicalRoomParticipantStage,type SharedPhysicalRoomRecoveryCatalog,type SharedRoomRecoveryCatalogV2,type SharedPhysicalRoomStageParticipant,type SharedPhysicalRoomStageCheck,type SharedPhysicalRoomStageProgress} from '@breditor/collaboration';
import * as wasm from '@breditor/collaboration/wasm';
declare const catalog:SharedPhysicalRoomRecoveryCatalog,oldCatalog:SharedRoomRecoveryCatalogV2,participants:readonly SharedPhysicalRoomStageParticipant[];
const options={wasm,database:'physical-client-stage',catalog,expected:catalog.selection(),checkAuthority(){}};
const opening=SharedPhysicalRoomParticipantStage.begin(options);
opening.then(async stage=>{const initial:SharedPhysicalRoomStageProgress=await stage.progress();const checked:SharedPhysicalRoomStageCheck=await stage.stage(participants);await stage.check();const file:Blob=stage.currentServerFile();await stage.close();return[initial,checked,file];});
SharedPhysicalRoomParticipantStage.resume(options);
// @ts-expect-error A physical stage never exposes editable native owners or activates a room.
opening.then(stage=>stage.intoParts());
// @ts-expect-error Actual immutable physical-catalog custody is not an original V2 catalog.
SharedPhysicalRoomParticipantStage.begin({...options,catalog:oldCatalog});
// @ts-expect-error The source and its independent selection cannot be omitted.
SharedPhysicalRoomParticipantStage.begin({wasm,database:'inferred-source',checkAuthority(){}});
// @ts-expect-error Native source pins remain immutable.
opening.then(stage=>{stage.metadata().current.server.identity.native.source.records=0;});
