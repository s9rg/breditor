// Compile against the actual paired generated declarations, not a handwritten Wasm stub.
import * as wasm from "../../packages/breditor-experimental-rich-content/dist/breditor_wasm.js";
import {compileRichProfile, type RichSelection, type RichCommandOutcome, type RichView} from "../../packages/breditor-experimental-rich-content/index.js";
function contract(bootstrap:string,document:string):void {
 const profile=compileRichProfile(wasm,bootstrap);
 const owner=profile.createEditor(document,"100");
 const view:RichView=owner.view();
 const selection:RichSelection|null=view.selection;
 const outcome:RichCommandOutcome=owner.execute({kind:"setSelection",selection},view.revision);
 const copy=owner.clipboard();
 // @ts-expect-error Exact offsets use strings, not browser numbers.
 owner.execute({kind:"setSelection",selection:{kind:"text",anchor:{block:"p",offset:1,affinity:"after"},focus:{block:"p",offset:"1",affinity:"after"}}});
 // @ts-expect-error A fresh row requires explicit typed cell bodies.
 owner.execute({kind:"insertTableRow",data:{table:"t",before:null,row:{block:"row",id:"r"}}});
 // @ts-expect-error Per-kind fields are closed at the static boundary too.
 owner.execute({kind:"undo",text:null});
 void outcome;void copy;
 const restored=profile.restoreEditor(owner.checkpointJson());
 restored.dispose();owner.dispose();profile.dispose();
}
void contract;
