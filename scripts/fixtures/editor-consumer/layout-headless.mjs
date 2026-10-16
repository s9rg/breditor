import {createLayoutLocalProfileV3,createLocalProfile,createStructuralLocalProfileV2,emptyDocumentJson} from "@breditor/editor";
import {createLayoutSharedProfileV3,createSharedProfile,createStructuralSharedProfileV2,SharedRichEditor,SharedPersistentSession} from "@breditor/editor/collaboration";
import {coverageSeed,range,grid} from "./coverage-seed.mjs";
try{
 const local=await createLayoutLocalProfileV3(),shared=await createLayoutSharedProfileV3(),source=coverageSeed(local.descriptor());
 window.layout={local,shared,source,range,grid,emptyDocumentJson,createLocalProfile,createStructuralLocalProfileV2,createSharedProfile,createStructuralSharedProfileV2,SharedRichEditor,SharedPersistentSession,full:{alignment:"start",direction:"rtl",indent:12,lineHeightPercent:300}};
 document.querySelector("#ready").textContent="Ready";
}catch(error){document.querySelector("#ready").textContent=String(error);throw error;}
