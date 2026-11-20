import type {RichCoreEditor,RichSelectionPolicy} from "./core.js";
import type {ToolbarControl} from "./actions.js";
import type {RichInlinePresentation} from "./inline_presentation.js";
import {structuralRichControlsForOwner} from "./structural_controls_v2.js";
import {layoutToolbarControls} from "./layout_toolbar_v3.js";
import {listNumberingToolbarControl} from "./list_numbering_controls.js";
import {textLanguageToolbarControls} from "./text_language.js";
import {imageLinkToolbarControls} from "./image_link.js";
import {detailsToolbarControls} from "./details.js";
import {tableCaptionToolbarControls} from "./table_caption.js";
import {pageBreakToolbarControls} from "./page_break.js";
import {bookmarkToolbarControls} from "./bookmark.js";
/** Owner-bound toolbar for the explicit unreleased candidate rich V4: the V3 structural and layout
 * controls plus ordered-list numbering, text-run Language / Clear language, Image link / Remove image link
 * Collapsible section / Remove collapsible section / Expand/Collapse section, Table caption, Page break and
 * Bookmark / Remove bookmark / Link to bookmark.
 * V1–V3 owners are rejected rather than widened. */
export function createRichToolbarV4<P extends RichSelectionPolicy="original">(core:RichCoreEditor<P>,presentation:RichInlinePresentation):readonly ToolbarControl<P>[]{
 return Object.freeze([...structuralRichControlsForOwner(core,presentation,4),...layoutToolbarControls(core),listNumberingToolbarControl<P>(core) satisfies ToolbarControl<P>,...textLanguageToolbarControls<P>(core).map(control=>({...control,owner:core}) satisfies ToolbarControl<P>),...imageLinkToolbarControls<P>(core).map(control=>({...control,owner:core}) satisfies ToolbarControl<P>),...detailsToolbarControls<P>(core),...tableCaptionToolbarControls<P>(core),...pageBreakToolbarControls<P>(core),...bookmarkToolbarControls<P>(core)]);
}
