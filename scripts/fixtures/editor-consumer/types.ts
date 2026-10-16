import {openLocalEditor,createLocalProfile,createStructuralLocalProfileV2,createFlowNavigationControls,type LocalEditor,type LocalEditorOptions,type RichCommand} from "@breditor/editor";
function contract(host:HTMLElement,editor:LocalEditor):void {
 const options:LocalEditorOptions={host,readOnly:true,initial:{kind:"empty",documentId:"doc",blockId:"p"},onChange:(view,outcome)=>{const revision:string=view.revision;const mode:true|undefined=view.readOnly;const policy:string|undefined=view.readOnlyRevision;void mode;void policy;void revision;void outcome;}};void openLocalEditor(options);void createLocalProfile();
 const changed:boolean=editor.setReadOnly(false,editor.view().revision);void changed;
 void openLocalEditor({...options,history:"typing-v1"});void openLocalEditor({...options,initial:{kind:"typingCheckpoint",checkpointJson:"declared grouped checkpoint"}});
 void editor.closeTypingGroup(editor.view().revision);editor.execute({kind:"insertTypingText",data:{text:"typed",clockMs:"9007199254740993"}});
 editor.execute({kind:"deleteTypingRange",data:{selection:{kind:"text",anchor:{block:"p",offset:"1",affinity:"after"},focus:{block:"p",offset:"2",affinity:"after"}},direction:"forward",clockMs:"1"}});
 // @ts-expect-error Clock hints cross the boundary as decimal strings, never floating point.
 editor.execute({kind:"insertTypingText",data:{text:"typed",clockMs:1}});
 // @ts-expect-error History is an explicit supported policy, not a truthy flag.
 void openLocalEditor({...options,history:true});
 // @ts-expect-error mode is a boolean, never a truthy string.
 editor.setReadOnly("true");
 const command:RichCommand={kind:"insertPlainText",text:"Typed"};editor.execute(command);void editor.checkpointJson();
 void createStructuralLocalProfileV2();void openLocalEditor({...options,richLanguage:2});
 editor.execute({kind:"navigateFlow",data:{movement:"before"}});editor.execute({kind:"insertParagraphAdjacent",data:{paragraph:"fresh",side:"after"}});void createFlowNavigationControls;
 editor.execute({kind:"deleteAtom",data:{paragraph:"floor",movement:"before"}});editor.execute({kind:"replaceAtomPlainText",data:{paragraph:"plain",text:"Paste"}});editor.execute({kind:"replaceAtomTypingText",data:{paragraph:"typed",text:"Q",clockMs:"1"}});
 // @ts-expect-error Logical movement is not a visual/bidi arrow name.
 editor.execute({kind:"navigateFlow",data:{movement:"right"}});
 editor.execute({kind:"setCodeBlock",data:{block:"p",language:"Rust",formatPolicy:"removeFormats"}});
 editor.execute({kind:"setTaskChecked",data:{item:"task",checked:true}});
 editor.execute({kind:"indentTaskItems",data:{container:"tasks",first:"task",last:"task",nested:null}});
 editor.execute({kind:"outdentTaskItems",data:{container:"tasks",first:"task",last:"task",tail:null}});
 editor.execute({kind:"exitTaskItem",data:{container:"tasks",item:"task",tail:null}});
 // @ts-expect-error Task container allocation is explicit, including a required null.
 editor.execute({kind:"indentTaskItems",data:{container:"tasks",first:"task",last:"task"}});
 // @ts-expect-error Task nesting does not reuse the ordinary list kind/start DTO.
 editor.execute({kind:"indentTaskItems",data:{container:"tasks",first:"task",last:"task",nested:{block:"nested",start:null}}});
 // @ts-expect-error Unknown grammar versions never silently use V1.
 void openLocalEditor({...options,richLanguage:3});
 // @ts-expect-error Code conversion requires an explicit formatting-loss policy.
 editor.execute({kind:"setCodeBlock",data:{block:"p",language:null}});
 // @ts-expect-error UTF-16 positions remain exact decimal strings, not lossy numeric DTOs.
 editor.execute({kind:"setSelection",selection:{kind:"text",anchor:{block:"p",offset:0,affinity:"after"},focus:{block:"p",offset:"0",affinity:"after"}}});
}
void contract;
