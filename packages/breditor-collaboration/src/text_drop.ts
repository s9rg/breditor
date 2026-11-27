// Lower one planned same-editor inline drop to ONE guarded shared batch. The batch deletes the source
// range (move only) and inserts its exact runs (text, formats and mentions) at the target with the
// existing `replace_text_range` command; Rust stages the commands in order against the planned
// revision and adopts the group only if every part is admitted, so it is one writer-local Undo step.
// The target offset is mapped through the deletion here, exactly as the local native `dropText` does.
import {richTextDropRuns,type RichPresentationModel,type RichTextDrop} from "@breditor/experimental-rich-content/rendering";
import type {RichPoint} from "@breditor/experimental-rich-content/rendering";
import type {SharedCommand,SharedDispatch} from "./types.js";

/** One planned drop as a `replace_text_range` batch that selects the dropped runs. */
export function sharedTextDrop(model:RichPresentationModel,drop:RichTextDrop):SharedDispatch{
 const {source,target,effect}=drop,block=source.anchor.block,a=Number(source.anchor.offset),f=Number(source.focus.offset);
 const start=Math.min(a,f),end=Math.max(a,f),runs=richTextDropRuns(model,source).map(run=>({text:run.text,formats:run.formats}));
 const length=runs.reduce((sum,run)=>sum+run.text.length,0),point=(at:string,offset:number):RichPoint=>({block:at,offset:String(offset),affinity:"after"});
 const commands:SharedCommand[]=[];let at=Number(target.offset);
 if(effect==="move"){
  commands.push({kind:"replace_text_range",data:{anchor:point(block,start),focus:point(block,end),runs:[]}});
  if(target.block===block&&at>=end)at-=end-start;
 }
 commands.push({kind:"replace_text_range",data:{anchor:point(target.block,at),focus:point(target.block,at),runs}});
 return {commands,selectionUpdate:{kind:"set",value:{kind:"text",anchor:point(target.block,at),focus:point(target.block,at+length)}}};
}
