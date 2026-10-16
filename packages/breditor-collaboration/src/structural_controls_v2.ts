/** Explicit shared V2 controls; prepare original native commands, never a JS document transaction. */
import {id,isProse,property,selectedText,nearestStructuralV2 as nearest,replaceableFlowV2,structuralIntervalV2,taskContext,type ElementNode,type RichInlinePresentation} from "@breditor/experimental-rich-content/rendering";
import {publish,positionAfter,type ActionContext,type SharedToolbarControl} from "./actions.js";
import {createStandardSharedToolbarV1} from "./standard_toolbar.js";
import {indentSharedTasks,outdentSharedTasks} from "./task_actions_v2.js";
import type {SharedRichEditor} from "./core.js";
function oneText(c:ActionContext):ElementNode|undefined {
 const s=c.model.view.selection;return s?.kind==="text"&&s.anchor.block===s.focus.block?selectedText(c.model):undefined;
}
function ordinaryListAllowed(c:ActionContext):boolean {
 const s=c.model.view.selection;if(s?.kind!=="text")return false;
 const a=c.model.textBlocks.findIndex(n=>id(n)===s.anchor.block),f=c.model.textBlocks.findIndex(n=>id(n)===s.focus.block);
 if(a<0||f<0||!c.model.textBlocks.slice(Math.min(a,f),Math.max(a,f)+1).every(isProse))return false;
 return [s.anchor,s.focus].every(point=>{const n=c.model.nodes.get(point.block),parent=c.model.parents.get(point.block);return parent?.type!=="breditor/image"&&!(parent?.type==="breditor/task-item"&&parent.children[0]===n);});
}
export function createStructuralSharedToolbarV2(core:SharedRichEditor,presentation:RichInlinePresentation):readonly SharedToolbarControl[]{
 if(core.richLanguageVersion()!==2)throw Error("Structural V2 controls require an explicitly selected V2 owner");
 const controls:SharedToolbarControl[]=[
  {id:"blockquote",label:"Blockquote",enabled:c=>structuralIntervalV2(c.model)!==undefined,run:c=>{const r=structuralIntervalV2(c.model);if(r)publish(c,[{kind:"wrap_blockquote",data:{first:r.first,last:r.last,wrapper:c.allocate("quote")}}]);}},
  {id:"unquote",label:"Remove quote",enabled:c=>!!nearest(c.model,"blockquote"),run:c=>{const n=nearest(c.model,"blockquote");if(n)publish(c,[{kind:"unwrap_blockquote",data:{wrapper:id(n)}}]);}},
  {id:"code-block",label:"Code block",fields:[{id:"language",label:"Code language",type:"text",maxLength:64},{id:"policy",label:"Inline formatting",type:"select",options:[{value:"reject_formatted",label:"Reject formatted text"},{value:"remove_formats",label:"Remove inline formatting"}]}],enabled:c=>{const n=oneText(c);return !!n&&replaceableFlowV2(c.model,n);},read:c=>{const n=oneText(c);return n?{kind:"uniform",pressed:n.type==="breditor/code-block",values:{language:String(property(n,"language")??""),policy:"reject_formatted"}}:{kind:"unavailable"};},run:(c,_value,fields)=>{const n=oneText(c),policy=fields?.["policy"];if(n&&(policy==="reject_formatted"||policy==="remove_formats"))publish(c,[{kind:"set_code_block",data:{block:id(n),language:fields?.["language"]||null,format_policy:policy}}]);}},
  {id:"code-language",label:"Code language",type:"text",enabled:c=>oneText(c)?.type==="breditor/code-block",value:c=>String(property(oneText(c)!,"language")??""),run:(c,value)=>{const n=oneText(c);if(n?.type==="breditor/code-block"&&value!==undefined)publish(c,[{kind:"set_code_language",data:{block:id(n),language:value||null}}]);}},
  {id:"exit-code",label:"Exit code",shortcut:"enter",enabled:c=>{const s=c.model.view.selection;return core.supportsCodeExit()&&oneText(c)?.type==="breditor/code-block"&&s?.kind==="text"&&s.anchor.offset===s.focus.offset;},run:c=>{c.core.exitCodeBlock(c.allocate("p"),c.revision);}},
  {id:"tasks",label:"Task list",enabled:c=>{const r=structuralIntervalV2(c.model);return !!r&&isProse(r.nodes[0]!);},run:c=>{const r=structuralIntervalV2(c.model);if(r)publish(c,[{kind:"wrap_task_list",data:{first:r.first,last:r.last,container:c.allocate("tasks"),items:r.nodes.filter(isProse).map(()=>({block:c.allocate("task"),checked:false}))}}]);}},
  {id:"untask",label:"Remove task list",enabled:c=>!!nearest(c.model,"task-list"),run:c=>{const n=nearest(c.model,"task-list");if(n)publish(c,[{kind:"unwrap_task_list",data:{container:id(n)}}]);}},
  {id:"task-checked",label:"Task completed",enabled:c=>!!nearest(c.model,"task-item"),read:c=>{const n=nearest(c.model,"task-item");return n?{kind:"uniform",pressed:property(n,"checked")===true}:{kind:"unavailable"};},run:c=>{const n=nearest(c.model,"task-item");if(n)publish(c,[{kind:"set_task_checked",data:{block:id(n),checked:property(n,"checked")!==true}}]);}},
  {id:"horizontal-rule",label:"Horizontal rule",enabled:c=>c.model.view.selection!==null,run:c=>publish(c,[{kind:"insert_horizontal_rule",data:{...positionAfter(c),block:c.allocate("rule")}}])},
 ];
 const standard=createStandardSharedToolbarV1(core,presentation).map(control=>{
  if(control.id==="bullet"||control.id==="numbered")return {...control,enabled:(c:ActionContext)=>ordinaryListAllowed(c)&&control.enabled(c)};
  if(control.id==="table")return {...control,enabled:(c:ActionContext)=>{const position=positionAfter(c);let parent=position.parent?c.model.nodes.get(position.parent):undefined;const flow=!parent||["breditor/list-item","breditor/task-item","breditor/blockquote"].includes(parent.type);while(parent){if(parent.type==="breditor/table")return false;parent=c.model.parents.get(id(parent));}return flow;}};
  if(control.id!=="indent"&&control.id!=="outdent")return control;
  const backward=control.id==="outdent";
  return {...control,owner:core,enabled:(c:ActionContext)=>{const t=taskContext(c.model);return t?(backward||t.first>0):control.enabled(c);},run:(c:ActionContext,value?:string,fields?:Readonly<Record<string,string>>)=>{if(!taskContext(c.model)){control.run(c,value,fields);return;}const command=backward?outdentSharedTasks(c):indentSharedTasks(c);if(command)publish(c,[command]);}};
 });
 return Object.freeze([...standard,...controls.map(control=>({...control,owner:core}))]);
}
