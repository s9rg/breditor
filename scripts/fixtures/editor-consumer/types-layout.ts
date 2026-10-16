import {createLayoutLocalProfileV3,layoutProfileBootstrapJsonV3,type RichCoreEditor,type RichCoreProfile,type RichCommand,type RichBlockLayoutPatch,type RichBlockLayoutStateRead} from "@breditor/editor";
import {createLayoutSharedProfileV3,layoutSharedProfileConfigurationV3,type SharedProfileConfigurationV3,type SharedRustProfile,SharedRichEditor} from "@breditor/editor/collaboration";
const localFactory:(bootstrap?:string)=>Promise<RichCoreProfile>=createLayoutLocalProfileV3;
const sharedFactory:(configuration?:SharedProfileConfigurationV3)=>Promise<SharedRustProfile>=createLayoutSharedProfileV3;
const patch:RichBlockLayoutPatch={alignment:"start",direction:"rtl",indent:0,lineHeightPercent:null};
const command:RichCommand={kind:"changeSelectionLayout",data:patch};
function local(core:RichCoreEditor):RichBlockLayoutStateRead|undefined{return core.supportsBlockLayout?.()?core.blockLayoutState?.():undefined;}
function shared(core:SharedRichEditor):RichBlockLayoutStateRead{core.changeSelectionLayout(patch,core.view().revision);return core.blockLayoutState();}
void [localFactory,sharedFactory,layoutProfileBootstrapJsonV3,layoutSharedProfileConfigurationV3,command,local,shared];
