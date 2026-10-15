import {SharedRichEditor,SharedPersistentSession,mountSharedEditor,compileSharedProfile,type SharedRustOwner,type SharedCommand,type SharedSaveState,type SharedProfileConfiguration,type SharedProfileModule} from "@breditor/experimental-collaboration";
import {RichAssetStore} from "@breditor/experimental-rich-content";
import {model} from "@breditor/experimental-rich-content/rendering";
async function consumer(raw:SharedRustOwner,root:HTMLElement):Promise<void>{
 const core=new SharedRichEditor(raw),assets=await RichAssetStore.open("consumer-assets");
 const command:SharedCommand={kind:"set_image_alt",data:{block:"image",text:"Diagram",decorative:false}};
 core.dispatch({commands:[command]});const editor=mountSharedEditor(root,{core,resolveAsset:value=>assets.resolve(value.asset)});
 // @ts-expect-error Captions cannot contain nested tables or arbitrary flow drafts.
 core.dispatch({commands:[{kind:"set_image_caption",data:{block:"image",caption:{kind:"element",type:"breditor/table",entityId:null,properties:{},children:[]}}}]});
 // @ts-expect-error Each shared command remains a closed typed record in the installed archive.
 core.dispatch({commands:[{kind:"resize_image",data:{block:"image",size:"240"}}]});
 void model;void SharedPersistentSession;const state:SharedSaveState={status:"saved",revision:"0",error:null};void state;editor.dispose();assets.close();
}
void consumer;
function configuredConsumer(wasm:SharedProfileModule,config:SharedProfileConfiguration,input:string):void{
 const p=compileSharedProfile(wasm,config),a=new SharedRichEditor(p.create(input,"101"));
 const peer=new SharedRichEditor(p.join_frame("room","202",a.updateFrame()));
 p.free();a.undo();a.redo();a.dispose();peer.dispose();
 // @ts-expect-error Integer bounds must be explicit, including null for an unbounded side.
 const bad:SharedProfileConfiguration={format:"breditor/shared-rich-profile",formatVersion:1,schema:{name:"example/schema",version:1},extensions:[{id:{name:"example/format",version:1},dependencies:[],conflicts:[],formats:[{kind:"example/rank",revision:1,properties:[{name:"example/value",presence:"required",valueType:{kind:"integer",minimum:0}}]}]}]};
 void bad;
}
void configuredConsumer;
