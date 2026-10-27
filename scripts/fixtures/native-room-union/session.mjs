/** Genuine complete seven-family owner. Controlled storage/raster, no remote host or activation. */
import{resolve}from'node:path';
import{completeImageNativeFixtures}from'../physical-operation-v3/image-seven-native.mjs';
import{completeHistoryFixture}from'../operation-read/history-session.mjs';
import{roomAssetChoices}from'../room-asset-adoption/bases.mjs';
import{PhysicalRoomAssetAdoption as Stage,transferRoomAssetAdoption as transfer}from'../../../packages/breditor-collaboration/dist/physical_room_asset_adoption/coordinator.js';
import{encodeSelectedRoomCurrent}from'../../../packages/breditor-collaboration/dist/selected_room_current/archive.js';
import{LoadedNativeReconstructionCurrent as Loaded}from'../../../packages/breditor-collaboration/dist/selected_native_reconstruction/loaded_current.js';
let serial=0;
export async function roomUnionFixture(options={}){
 const fixtures=await completeImageNativeFixtures(resolve(new URL('../../../',import.meta.url).pathname)),tag='room-union-'+serial++;let f,stage,owner;
 try{f=await completeHistoryFixture({fixtures,tag,participantAuthority(){},...options});const input=()=>({reads:f.reads,checkAuthority(){}}),integrity={wasm:fixtures.native,checkAuthority(){}},assetChoices=await roomAssetChoices(f.owner,tag,{keep:'current'});stage=await Stage.begin(f.owner,{database:tag+'-stage',participants:assetChoices.participants,checkAuthority(){}});await stage.finish();const expected=await stage.approvalChoice(input());f.endOldJob();owner=await transfer(stage,{...input(),expected,approvalDatabase:tag+'-approval',approve:()=>true,checkAssetAuthority(){}});
  const retain=()=>owner.capture(input()).then(cut=>encodeSelectedRoomCurrent(cut,integrity)),retained=await retain(),loaded=await Loaded.read(retained,integrity);let participants;try{participants=loaded.nativeCut().root().participants.map(p=>({id:p.id,sourceFamily:p.family,family:p.family==='local-operation-snapshot'?'local-operation-flat':p.family,namespaces:p.namespaces.map(n=>({role:n.role,database:tag+'-out-'+p.id+'-'+n.role})),...(p.family==='independent-delivery'?{mode:'independent-delivery-union',unionDatabase:tag+'-participant-union',choices:[]}:{mode:'continuation'})}));}finally{loaded.dispose();}
  const authorizations=[{id:'independent-delivery',authorizations:[]}],read={...integrity,reads:f.reads,authorizations};return{f,fixtures,tag,owner,input,integrity,read,retained,retain,options:{database:tag+'-room-union',participants,retained,authorizations},async close(){await owner?.discardAndClose();await stage?.close();await f?.close();await fixtures.close();}};
 }catch(error){await owner?.discardAndClose();await stage?.close();await f?.close();await fixtures.close();throw error;}
}
export const fileBytes=async file=>Buffer.from(await file.arrayBuffer());
export const names=async()=>(await indexedDB.databases()).map(d=>d.name).sort();
