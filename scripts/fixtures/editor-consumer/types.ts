import {openLocalEditor,createLocalProfile,createStructuralLocalProfileV2,type LocalEditor,type LocalEditorOptions,type RichCommand} from "@breditor/editor";
function contract(host:HTMLElement,editor:LocalEditor):void {
 const options:LocalEditorOptions={host,initial:{kind:"empty",documentId:"doc",blockId:"p"},onChange:(view,outcome)=>{const revision:string=view.revision;void revision;void outcome;}};void openLocalEditor(options);void createLocalProfile();
 const command:RichCommand={kind:"insertPlainText",text:"Typed"};editor.execute(command);void editor.checkpointJson();
 void createStructuralLocalProfileV2();void openLocalEditor({...options,richLanguage:2});
 editor.execute({kind:"setCodeBlock",data:{block:"p",language:"Rust",formatPolicy:"removeFormats"}});
 editor.execute({kind:"setTaskChecked",data:{item:"task",checked:true}});
 // @ts-expect-error Unknown grammar versions never silently use V1.
 void openLocalEditor({...options,richLanguage:3});
 // @ts-expect-error Code conversion requires an explicit formatting-loss policy.
 editor.execute({kind:"setCodeBlock",data:{block:"p",language:null}});
 // @ts-expect-error UTF-16 positions remain exact decimal strings, not lossy numeric DTOs.
 editor.execute({kind:"setSelection",selection:{kind:"text",anchor:{block:"p",offset:0,affinity:"after"},focus:{block:"p",offset:"0",affinity:"after"}}});
}
void contract;
