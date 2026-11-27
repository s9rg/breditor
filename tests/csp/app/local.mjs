// A minimal installed-style local editor: the package roots only, bundled by Vite, no inline code.
import {openLocalEditor,RichAssetStore,renderStaticDocumentTrustedContents} from "@breditor/editor";
import {createRichInterchange} from "@breditor/interchange";

const ready=document.querySelector("#ready"),errors=[];
try{
 const assets=await RichAssetStore.open("breditor-csp-assets");
 const editor=await openLocalEditor({
  host:document.querySelector("#editor"),
  history:"typing-v1",
  initial:{kind:"empty",documentId:"csp",blockId:"body"},
  clipboardInterchange:core=>createRichInterchange(core),
  resolveAsset:binding=>assets.resolve(binding.asset),
  onError:error=>errors.push(String(error)),
  onFiles:(files,position)=>editor.insertImageFiles(assets,files,position),
 });
 const range=(block,start,end=start)=>({kind:"text",anchor:{block,offset:String(start),affinity:"after"},focus:{block,offset:String(end),affinity:"after"}});
 const renderStatic=()=>{
  // The only HTML sink on this page: renderer output through the `breditor-static-html` policy.
  document.querySelector("#static").innerHTML=renderStaticDocumentTrustedContents(editor.view().documentJson);
 };
 window.csp={editor,assets,errors,range,renderStatic};
 ready.textContent="Ready";
}catch(error){ready.textContent=`Failed: ${String(error)}`;throw error;}
