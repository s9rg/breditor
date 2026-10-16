/** UI eligibility only. Rust derives every destination, scope, insertion and history recipe. */
import type {RichCoreEditor} from "./core.js";
import {text,type RichModel} from "./model.js";
import type {ToolbarControl} from "./actions.js";
export function selectedFlowAtom(value:RichModel):boolean{
 const s=value.view.selection,n=s?.kind==="node"?value.nodes.get(s.block):undefined;
 return !!n&&["breditor/image","breditor/table","breditor/horizontal-rule"].includes(n.type);
}
/** A ranged/grid/interior selection belongs to another command; never silently collapse it. */
export function flowEdgeEligible(value:RichModel,movement:"before"|"after"):boolean{
 const s=value.view.selection;if(s?.kind==="node")return true;
 if(s?.kind!=="text"||s.anchor.block!==s.focus.block||s.anchor.offset!==s.focus.offset)return false;
 const n=value.nodes.get(s.focus.block);return !!n&&s.focus.offset===String(movement==="before"?0:text(n).length);
}
/** Optional explicit controls, also usable by V1 hosts without changing its stock toolbar. */
export function createFlowNavigationControls(core:RichCoreEditor):readonly ToolbarControl[]{
 const controls:ToolbarControl[]=[];
 for(const movement of ["before","after"] as const){
  controls.push({id:`flow-${movement}`,label:movement==="before"?"Previous block":"Next block",owner:core,readOnlySafe:true,
   enabled:c=>core.supportsFlowNavigation?.()===true&&flowEdgeEligible(c.model,movement),command:()=>({kind:"navigateFlow",data:{movement}})});
  controls.push({id:`paragraph-${movement}`,label:`Paragraph ${movement}`,owner:core,
   enabled:c=>core.supportsFlowNavigation?.()===true&&selectedFlowAtom(c.model),command:c=>({kind:"insertParagraphAdjacent",data:{paragraph:c.allocate("p"),side:movement}})});
 }
 return Object.freeze(controls);
}
