/** Open the actual original review and metadata journals for replacement tests. */
import {actualLocalReviewSession} from '../selected-delivery/local-review-session.mjs';
import {settleOriginalMetadataLane} from './settled-lane.mjs';
import {SelectedLocalMetadataDelivery as Metadata,previewSelectedLocalMetadataDelivery} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_delivery/coordinator.js';
import {metadataBinding} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_delivery/policy.js';
import {emptyDeliveryRetainedRecords} from '../../../packages/breditor-collaboration/dist/delivery_state/retained.js';
import {independentHistoryNative} from '../../../packages/breditor-collaboration/dist/independent_history/native_port.js';
export async function openOriginalReplacementMetadata(root,tag,hostFactory){
 const seeds=new Map();
 let bundle;
 const seed=async source=>{
  const identity=independentHistoryNative(source).identity;
  const draft=text=>({scope:'commands',edit:{kind:'commands',data:[{kind:'insert_text',data:{block:'p',offset:0,text}}]}});
  const packet=source.core.captureSuggestion('Original pending proposal',identity.review.principal,'20',draft('Proposal '));
  const revision=source.core.captureSuggestionRevision(packet,'Original pending revision','21',draft('Revision '));
  const version=source.versionPacket(source.versions()[0].id);
  seeds.set(identity.native.writer,{packet,revision,version});
 };
 const fixture=await actualLocalReviewSession(root,tag,{
  hostFactory,leaveOpen:true,prepareLocalInput:seed,
  async onReady({review,choice:parent,fixture,check,sources,auths}){
   const descriptor=JSON.parse(fixture.inventoryJson);
   const effectWriter=descriptor.serverAuthors.find(row=>row.kind==='suggestionEffect').clock.writer;
   const lanes=parent.lanes.map(row=>{
    const seeded=seeds.get(row.source.native.writer);
    const {endpoint,principal,room,documentWriter}=row.binding;
    const binding=metadataBinding({
     suggestions:{identity:{endpoint,principal,room,documentWriter,effectWriter,binding:descriptor.suggestionsBinding,writerTransport:'atomic-v2'},ownedHistory:null},
     revisions:{binding:descriptor.revisionsBinding},
     versions:{endpoint,principal,room,documentWriter,binding:descriptor.versionsBinding,writerTransport:'atomic-v2'},
    },row);
    const records=emptyDeliveryRetainedRecords(binding);
    records.suggestions.retained=[{packet:seeded.packet,origin:'local',publish:true,publication:null,intent:null,decision:null}];
    records.revisions.retained=[{previousPacket:seeded.packet,packet:seeded.revision,retry:true,receipt:null,conflict:null}];
    records.versions.packets=[{packet:seeded.version,origin:'local',publish:true,accepted:null}];
    return {id:row.id,binding,records};
   });
   const choice=await previewSelectedLocalMetadataDelivery(review,{database:tag+'-old-metadata',lanes});
   const metadata=await Metadata.open(review,{expected:choice,lanes,approve:()=>true,checkAuthority:check});
   try{
    const chosen=lanes[0],row=sources.find(row=>row.id===chosen.id);
    await settleOriginalMetadataLane({metadata,review,row,chosen,auth:auths.get(row.id),seeded:seeds.get(chosen.binding.suggestions.identity.documentWriter)});
    bundle=await metadata.capture();
   }finally{
    await metadata.close();
    await review.close();
   }
  },
 });
 return {fixture,bundle};
}
