import {openSharedEditor,createStructuralSharedProfileV2,type SharedEditorSession,type SharedEditorSessionOptions,type SharedProfileConfigurationV2} from "@breditor/editor/collaboration";
const options:SharedEditorSessionOptions={host:document.createElement("main"),readOnly:true,database:"typed",room:"room",writer:"101"};
const opening:Promise<SharedEditorSession>=openSharedEditor(options);
void openSharedEditor({...options,history:"explicit"});
// @ts-expect-error Shared natural history remains an unimplemented capability, never a fallback.
void openSharedEditor({...options,history:"typing-v1"});
void opening.then(editor=>{const changed:boolean=editor.setReadOnly(false,editor.view().revision);void changed;});
void opening;
const structural:SharedProfileConfigurationV2={format:"breditor/shared-rich-profile",formatVersion:2,schema:{name:"example/v2",version:2},extensions:[]};
void createStructuralSharedProfileV2(structural);
void openSharedEditor({...options,richLanguage:2,configuration:structural});
// @ts-expect-error original configuration does not select the structural language
void createStructuralSharedProfileV2({...structural,formatVersion:1});
