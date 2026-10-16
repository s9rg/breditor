/** Explicit structural V2 command preparation. Rust owns all admission, text and history. */
import type {RichCoreEditor} from "./core.js";
import {id,isProse,property,selectedText,type ElementNode} from "./model.js";
import {positionAfter,type ActionContext,type ToolbarControl} from "./actions.js";
import {createStandardRichToolbarV1} from "./standard_toolbar.js";
import {createSelectionRichToolbarV1} from "./selection_toolbar.js";
import type {RichInlinePresentation} from "./inline_presentation.js";
import {taskContext,indentTasks,outdentTasks} from "./task_actions_v2.js";
import {createFlowNavigationControls} from "./flow_controls.js";
import {nearestStructuralV2 as nearest,replaceableFlowV2 as replaceable,structuralIntervalV2} from "./structural_context_v2.js";

const interval=(c:ActionContext)=>structuralIntervalV2(c.model);
function oneText(c:ActionContext):ElementNode|undefined {
 const s=c.model.view.selection;return s?.kind==="text"&&s.anchor.block===s.focus.block?selectedText(c.model):undefined;
}
function codeAllowed(c:ActionContext):boolean {
 const n=oneText(c);return !!n&&replaceable(c.model,n);
}
/** Bind all standard and new structural controls to one explicitly compiled V2 owner. */
export function createStructuralRichToolbarV2(core:RichCoreEditor,presentation:RichInlinePresentation):readonly ToolbarControl[]{
 if(core.richLanguageVersion?.()!==2)throw Error("Structural V2 controls require an explicitly selected V2 owner");
 const controls:ToolbarControl[]=[
  {id:"blockquote",label:"Blockquote",enabled:c=>interval(c)!==undefined,command:c=>{const r=interval(c);return r?{kind:"wrapBlockquote",data:{first:r.first,last:r.last,wrapper:c.allocate("quote")}}:null;}},
  {id:"unquote",label:"Remove quote",enabled:c=>nearest(c.model,"blockquote")!==undefined,command:c=>{const n=nearest(c.model,"blockquote");return n?{kind:"unwrapBlockquote",data:{wrapper:id(n)}}:null;}},
  {id:"code-block",label:"Code block",fields:[{id:"language",label:"Code language",type:"text",maxLength:64},{id:"policy",label:"Inline formatting",type:"select",options:[{value:"rejectFormatted",label:"Reject formatted text"},{value:"removeFormats",label:"Remove inline formatting"}]}],enabled:codeAllowed,read:c=>{const n=oneText(c);return n?{kind:"uniform",pressed:n.type==="breditor/code-block",values:{language:String(property(n,"language")??""),policy:"rejectFormatted"}}:{kind:"unavailable"};},command:(c,_value,fields)=>{const n=oneText(c),policy=fields?.["policy"];return n&&(policy==="rejectFormatted"||policy==="removeFormats")?{kind:"setCodeBlock",data:{block:id(n),language:fields?.["language"]||null,formatPolicy:policy}}:null;}},
  {id:"code-language",label:"Code language",type:"text",enabled:c=>oneText(c)?.type==="breditor/code-block",value:c=>String(property(oneText(c)!,"language")??""),command:(c,value)=>{const n=oneText(c);return n?.type==="breditor/code-block"&&value!==undefined?{kind:"setCodeLanguage",data:{block:id(n),language:value||null}}:null;}},
  {id:"exit-code",label:"Exit code",shortcut:"enter",enabled:c=>{const s=c.model.view.selection;return core.supportsCodeExit?.()===true&&oneText(c)?.type==="breditor/code-block"&&s?.kind==="text"&&s.anchor.offset===s.focus.offset;},command:c=>({kind:"exitCodeBlock",data:{paragraph:c.allocate("p")}})},
  {id:"tasks",label:"Task list",enabled:c=>{const r=interval(c);return !!r&&isProse(r.nodes[0]!)&&r.nodes.every(n=>n.type!=="breditor/task-item");},command:c=>{const r=interval(c);return r?{kind:"wrapTaskList",data:{first:r.first,last:r.last,container:c.allocate("tasks"),items:r.nodes.filter(isProse).map(()=>({block:c.allocate("task"),checked:false}))}}:null;}},
  {id:"untask",label:"Remove task list",enabled:c=>nearest(c.model,"task-list")!==undefined,command:c=>{const n=nearest(c.model,"task-list");return n?{kind:"unwrapTaskList",data:{list:id(n)}}:null;}},
  {id:"task-checked",label:"Task completed",enabled:c=>nearest(c.model,"task-item")!==undefined,read:c=>{const n=nearest(c.model,"task-item");return n?{kind:"uniform",pressed:property(n,"checked")===true}:{kind:"unavailable"};},command:c=>{const n=nearest(c.model,"task-item");return n?{kind:"setTaskChecked",data:{item:id(n),checked:property(n,"checked")!==true}}:null;}},
  {id:"horizontal-rule",label:"Horizontal rule",enabled:c=>c.model.view.selection!==null,command:c=>({kind:"insertHorizontalRule",data:{position:positionAfter(c),block:c.allocate("rule")}})},
 ];
 const standard=(core.supportsSelectionFormatting?.()===true?createSelectionRichToolbarV1(core,presentation):createStandardRichToolbarV1(core,presentation)).map(control=>{
  if(control.id!=="indent"&&control.id!=="outdent")return control;
  const backward=control.id==="outdent";
  return {...control,owner:core,enabled:(c:ActionContext)=>{const t=taskContext(c.model);return t?(backward||t.first>0):control.enabled(c);},command:(c:ActionContext,value?:string,fields?:Readonly<Record<string,string>>)=>taskContext(c.model)?(backward?outdentTasks(c):indentTasks(c)):control.command(c,value,fields)};
 });
 return Object.freeze([...standard,...controls.map(control=>({...control,owner:core})),...createFlowNavigationControls(core)]);
}
