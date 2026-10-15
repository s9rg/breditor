// Check the browser contract against the real generated owner, not a mock Wasm stub.
import {RichReplicaProbe} from "../../target/collaboration-feasibility-web/breditor_collab_feasibility.js";
import {SharedRichEditor,SharedPersistentSession,mountSharedEditor,insertSharedImageFiles,type SharedRustOwner,type SharedCommand,type SharedOwnerDescriptor} from "../../packages/breditor-experimental-collaboration/index.js";
import {RichAssetStore} from "../../packages/breditor-experimental-rich-content/index.js";
async function contract(root:HTMLElement,input:string,frame:string):Promise<void>{
 const raw:SharedRustOwner=new RichReplicaProbe(input,"9007199254740993");
 const core=new SharedRichEditor(raw),descriptor:SharedOwnerDescriptor=core.descriptor();
 const command:SharedCommand={kind:"insert_text",data:{block:"p",offset:0,text:"hello"}};
 core.dispatch({commands:[command]},core.view().revision);
 // @ts-expect-error Authored commands must not accept caller-supplied causal clocks.
 core.dispatch({commands:[{kind:"set_header",data:{cells:["c"],header:true,clock:"1:2:3"}}]});
 // @ts-expect-error Selection offsets are exact decimal strings, not browser numbers.
 core.select({kind:"text",anchor:{block:"p",offset:0,affinity:"after"},focus:{block:"p",offset:"0",affinity:"after"}});
 const assets=await RichAssetStore.open("typed-shared-assets");
 const mounted=mountSharedEditor(root,{core,onFiles:(files,position,revision)=>insertSharedImageFiles(core,assets,files,position,revision),resolveAsset:binding=>assets.resolve(binding.asset)});
 const release=core.holdRemotes(),receipt=core.receiveFrame(frame);release();await receipt;
 void descriptor;void core.checkpointJson();mounted.dispose();assets.close();
}
void contract;
async function persistentContract(input:string):Promise<void>{
 const session=await SharedPersistentSession.open({database:"typed-sessions",room:"room",writer:"101",create:()=>new RichReplicaProbe(input,"101"),restore:j=>RichReplicaProbe.restore("room",j)});
 session.core.type("saved");await session.flush();void session.state();await session.close();
}
void persistentContract;
