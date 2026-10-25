/** A complete DATA file produced by the genuine selected cohort. Native restore
 * policy is independently chosen from the original fixture, not the file. */
import {selectedProviderSession} from '../selected-room-provider/session.mjs';
import {environment} from '../room-participant-inventory/environment.mjs';
import {LoadedNativeReconstructionCurrent as Loaded} from '../../../packages/breditor-collaboration/dist/selected_native_reconstruction/loaded_current.js';
import {sourceNativeRecoveryRead} from '../../../packages/breditor-collaboration/dist/source_native_read.js';
export async function nativeReconstructionData(fixtures,tag){
 const session=await selectedProviderSession(fixtures,tag,{documentSegmented:false,reviewSegmented:false});let file,descriptor;
 try{file=await session.retain();descriptor=JSON.stringify(sourceNativeRecoveryRead(session.owner.clients.find(row=>row.id==='original').core).descriptor());}finally{await session.close();}
 const fixture=fixtures.fixture(fixtures.manifest.cases.at(-1)),profile=fixtures.profile(fixture),room=JSON.parse(fixture.inventoryJson).room.document,reset=environment();
 const client=fixture.clients[2],localFactory={room,writer:client.writer,richLanguage:fixture.language,history:'explicit',rangeEditing:'original',selectionEditing:'original',searchHistory:null,reviewedHistory:null,readOnly:true,review:{actor:client.actor,principal:client.principal,access:'read_only'},documentHistory:{kind:'original',restoreOriginal:checkpoint=>profile.restore(room,checkpoint)},reviewHistory:{kind:'original'}};
 return{file,descriptor,profile,room,localFactory,restore:checkpoint=>profile.restore(room,checkpoint),load(signal,checkAuthority=()=>{}){return Loaded.read(file,{wasm:fixtures.native,checkAuthority,...(signal?{signal}:{})});},close(){profile.free();reset();}};
}
