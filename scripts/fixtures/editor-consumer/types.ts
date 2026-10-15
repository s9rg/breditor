import {openLocalEditor,createLocalProfile,type LocalEditor,type LocalEditorOptions,type RichCommand} from "@breditor/editor";
function contract(host:HTMLElement,editor:LocalEditor):void {
 const options:LocalEditorOptions={host,initial:{kind:"empty",documentId:"doc",blockId:"p"},onChange:(view,outcome)=>{const revision:string=view.revision;void revision;void outcome;}};void openLocalEditor(options);void createLocalProfile();
 const command:RichCommand={kind:"insertPlainText",text:"Typed"};editor.execute(command);void editor.checkpointJson();
 // @ts-expect-error UTF-16 positions remain exact decimal strings, not lossy numeric DTOs.
 editor.execute({kind:"setSelection",selection:{kind:"text",anchor:{block:"p",offset:0,affinity:"after"},focus:{block:"p",offset:"0",affinity:"after"}}});
}
void contract;
