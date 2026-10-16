import {openSharedEditor,createStructuralSharedProfileV2,type SharedEditorSession,type SharedEditorSessionOptions,type SharedProfileConfigurationV2} from "@breditor/editor/collaboration";
const options:SharedEditorSessionOptions={host:document.createElement("main"),readOnly:true,database:"typed",room:"room",writer:"101"};
const opening:Promise<SharedEditorSession>=openSharedEditor(options);
void openSharedEditor({...options,history:"explicit"});
void openSharedEditor({...options,history:"typing-v1"});
void openSharedEditor({...options,rangeEditing:"general-v1"});
void opening.then(editor=>{const capable:boolean=editor.core.supportsGeneralCopy();const content=editor.core.copyGeneral();void capable;void content;});
void openSharedEditor({...options,initial:{kind:"generalCheckpoint",checkpointJson:"opaque native save"}});
void openSharedEditor({...options,initial:{kind:"generalTypingCheckpoint",checkpointJson:"opaque native save"}});
void opening.then(editor=>{const policy:"original"|"general-v1"=editor.rangePolicy();void policy;});
void opening.then(editor=>{const capable:boolean=editor.core.supportsGeneralInlinePaste();const point={block:"p",offset:"1",affinity:"after" as const};const changed:boolean=editor.core.pasteGeneralInlineClipboard({kind:"text",anchor:point,focus:point},"opaque native clipboard","fresh",editor.view().revision);void capable;void changed;});
// @ts-expect-error A future unknown range policy is not silently substituted.
void openSharedEditor({...options,rangeEditing:"general-v2"});
void openSharedEditor({...options,initial:{kind:"typingCheckpoint",checkpointJson:"opaque native journal"}});
// @ts-expect-error Unknown history policies cannot silently select a fallback.
void openSharedEditor({...options,history:"automatic"});
void opening.then(editor=>{const changed:boolean=editor.closeTypingGroup(editor.view().revision);editor.core.typeUser("A","9007199254740993");void changed;});
// @ts-expect-error Clock transport is an exact canonical decimal, not a rounded JavaScript number.
void opening.then(editor=>editor.core.typeUser("A",9007199254740993));
void opening.then(editor=>{const changed:boolean=editor.setReadOnly(false,editor.view().revision);void changed;});
void opening.then(editor=>{const moved:boolean=editor.core.navigateFlow("before",editor.view().revision);const inserted:boolean=editor.core.insertParagraphAdjacent("fresh","after",editor.view().revision);void moved;void inserted;});
void opening.then(editor=>{editor.core.deleteAtom("floor","after",editor.view().revision);editor.core.replaceAtomPlainText("plain","Paste",editor.view().revision);editor.core.replaceAtomTypingText("typed","Q","1",editor.view().revision);});
// @ts-expect-error The replacement clock must remain an exact decimal string.
void opening.then(editor=>editor.core.replaceAtomTypingText("typed","Q",1));
// @ts-expect-error Logical movement cannot be a guessed physical arrow direction.
void opening.then(editor=>editor.core.navigateFlow("right"));
void opening;
const structural:SharedProfileConfigurationV2={format:"breditor/shared-rich-profile",formatVersion:2,schema:{name:"example/v2",version:2},extensions:[]};
void createStructuralSharedProfileV2(structural);
void openSharedEditor({...options,richLanguage:2,configuration:structural});
// @ts-expect-error original configuration does not select the structural language
void createStructuralSharedProfileV2({...structural,formatVersion:1});
