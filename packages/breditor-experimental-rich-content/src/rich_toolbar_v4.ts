import type {RichCoreEditor,RichSelectionPolicy} from "./core.js";
import type {ToolbarControl} from "./actions.js";
import type {RichInlinePresentation} from "./inline_presentation.js";
import {structuralRichControlsForOwner} from "./structural_controls_v2.js";
import {layoutToolbarControls} from "./layout_toolbar_v3.js";
import {listNumberingToolbarControl} from "./list_numbering_controls.js";
/** Owner-bound toolbar for the explicit unreleased candidate rich V4: the V3 structural and layout
 * controls plus ordered-list numbering. V1–V3 owners are rejected rather than widened. */
export function createRichToolbarV4<P extends RichSelectionPolicy="original">(core:RichCoreEditor<P>,presentation:RichInlinePresentation):readonly ToolbarControl<P>[]{
 return Object.freeze([...structuralRichControlsForOwner(core,presentation,4),...layoutToolbarControls(core),listNumberingToolbarControl<P>(core) satisfies ToolbarControl<P>]);
}
