import {createLayoutLocalProfileV3,layoutProfileBootstrapJsonV3,openLocalEditor,createLayoutRichToolbarV3,type LocalEditorOptions,type RichCoreEditor,type RichCoreProfile,type RichCommand,type RichBlockLayoutPatch,type RichBlockLayoutStateRead} from "@breditor/editor";
import {createLayoutSharedProfileV3,layoutSharedProfileConfigurationV3,openSharedEditor,createLayoutSharedToolbarV3,type SharedCommand,type SharedEditorSessionOptions,type SharedProfileConfigurationV3,type SharedRustProfile,SharedRichEditor} from "@breditor/editor/collaboration";
const localFactory:(bootstrap?:string)=>Promise<RichCoreProfile>=createLayoutLocalProfileV3;
const sharedFactory:(configuration?:SharedProfileConfigurationV3)=>Promise<SharedRustProfile>=createLayoutSharedProfileV3;
const patch:RichBlockLayoutPatch={alignment:"start",direction:"rtl",indent:0,lineHeightPercent:null};
const command:RichCommand={kind:"changeSelectionLayout",data:patch};
const rawLayout:SharedCommand={kind:"set_block_layout",data:{block:"p",patch_json:'{"alignment":"start"}'}};
function local(core:RichCoreEditor):RichBlockLayoutStateRead|undefined{return core.supportsBlockLayout?.()?core.blockLayoutState?.():undefined;}
function shared(core:SharedRichEditor):RichBlockLayoutStateRead{core.changeSelectionLayout(patch,core.view().revision);return core.blockLayoutState();}
void [localFactory,sharedFactory,layoutProfileBootstrapJsonV3,layoutSharedProfileConfigurationV3,command,local,shared];
function visual(local:LocalEditorOptions,shared:SharedEditorSessionOptions){
 void openLocalEditor({...local,richLanguage:3});void openSharedEditor({...shared,richLanguage:3});
 // @ts-expect-error Unknown future grammars must not inherit V3 behavior.
 void openSharedEditor({...shared,richLanguage:4});
}
void [visual,createLayoutRichToolbarV3,createLayoutSharedToolbarV3,rawLayout];
