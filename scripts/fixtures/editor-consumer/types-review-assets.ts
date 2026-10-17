import {RichAssetStore,type AssetInfo} from "@breditor/editor";
import {SharedRelayAssets,imageNode,type SharedRelayAssetCache,type SharedSuggestionQueue} from "@breditor/editor/collaboration";

async function hostOwnedAssets(queue:SharedSuggestionQueue,endpoint:string):Promise<void>{
 const store=await RichAssetStore.open("independent-host-cache"),cache:SharedRelayAssetCache=store;
 const transport=new SharedRelayAssets({endpoint,principal:"alice",getToken:()=>"host-owned token",store:cache});
 transport.setOnline(false);
 const admitted:AssetInfo=await store.ingest(new Blob([new Uint8Array([137,80,78,71])],{type:"image/png"}));
 const node=imageNode("reserved-block","reserved-image",admitted.asset,"reserved-generation","Image",undefined,{width:admitted.width,height:admitted.height});
 queue.propose("An immutable proposal referencing host-owned bytes","1",{scope:"commands",edit:{kind:"commands",data:[{kind:"insert_blocks",data:{parent:null,before:null,nodes:[node]}}]}});
 // @ts-expect-error Asset transport borrows a host cache, never an editor or accepted-document dispatcher.
 new SharedRelayAssets({endpoint,principal:"alice",getToken:()=>"token",store:queue.core});
 // @ts-expect-error Runtime byte blobs are not AST asset identities or serialized into review packets.
 imageNode("block","image",new Blob(),"generation","Image");
 transport.setOnline(true);await transport.flush();const url:string|undefined=await transport.resolve(admitted.asset);void url;
 transport.dispose();store.close();
}
void hostOwnedAssets;
