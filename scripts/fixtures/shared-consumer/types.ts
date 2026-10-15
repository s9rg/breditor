import {SharedRichEditor,SharedPersistentSession,mountSharedEditor,type SharedRustOwner,type SharedCommand,type SharedSaveState} from "@breditor/experimental-collaboration";
import {RichAssetStore} from "@breditor/experimental-rich-content";
import {model} from "@breditor/experimental-rich-content/rendering";
async function consumer(raw:SharedRustOwner,root:HTMLElement):Promise<void>{
 const core=new SharedRichEditor(raw),assets=await RichAssetStore.open("consumer-assets");
 const command:SharedCommand={kind:"set_image_alt",data:{block:"image",text:"Diagram",decorative:false}};
 core.dispatch({commands:[command]});const editor=mountSharedEditor(root,{core,resolveAsset:value=>assets.resolve(value.asset)});
 // @ts-expect-error Each shared command remains a closed typed record in the installed archive.
 core.dispatch({commands:[{kind:"resize_image",data:{block:"image",size:"240"}}]});
 void model;void SharedPersistentSession;const state:SharedSaveState={status:"saved",revision:"0",error:null};void state;editor.dispose();assets.close();
}
void consumer;
