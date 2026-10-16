/** Shared flow controls route guarded native intent, never a replicated JavaScript transaction. */
import {flowEdgeEligible,selectedFlowAtom} from "@breditor/experimental-rich-content/rendering";
import type {SharedRichEditor} from "./core.js";
import type {SharedToolbarControl} from "./actions.js";
export function createSharedFlowNavigationControls(core:SharedRichEditor):readonly SharedToolbarControl[]{
 const controls:SharedToolbarControl[]=[];
 for(const movement of ["before","after"] as const){
  controls.push({id:`flow-${movement}`,label:movement==="before"?"Previous block":"Next block",owner:core,readOnlySafe:true,
   enabled:c=>core.supportsFlowNavigation()&&flowEdgeEligible(c.model,movement),run:c=>{c.core.navigateFlow(movement,c.revision);}});
  controls.push({id:`paragraph-${movement}`,label:`Paragraph ${movement}`,owner:core,
   enabled:c=>core.supportsFlowNavigation()&&selectedFlowAtom(c.model),run:c=>{c.core.insertParagraphAdjacent(c.allocate("p"),movement,c.revision);}});
 }
 return Object.freeze(controls);
}
