import {BreditorSharedSuggestionPanel,type BreditorSharedSuggestionPanelProps,type BreditorSharedSuggestionPanelHandle,BreditorSharedReviewPanel,type BreditorSharedReviewPanelProps} from "@breditor/editor/collaboration/react";
import type {SharedSuggestionPanelCore,SharedSuggestionPanelOptions,SharedRichEditor,SharedSelectionPolicy} from "@breditor/editor/collaboration";
function reactControls(core:SharedRichEditor<SharedSelectionPolicy>,options:SharedSuggestionPanelOptions,handle:BreditorSharedSuggestionPanelHandle):void{
 const props:BreditorSharedSuggestionPanelProps={core,initialOptions:options,sessionKey:"same-owned-session",onError(){}};
 const paired:BreditorSharedReviewPanelProps={core,initialOptions:{policy:()=>({principal:"alice",access:"comment"}),suggestions:options}};
 handle.refresh();handle.getPanel()?.dispose();void props;void paired;void BreditorSharedSuggestionPanel;void BreditorSharedReviewPanel;
 // @ts-expect-error Suggestion controls borrow a prepared source and cannot implicitly create one.
 const missing:BreditorSharedSuggestionPanelProps={core,initialOptions:{}};void missing;
 // @ts-expect-error A document snapshot is not a live native facade.
 const wrong:SharedSuggestionPanelCore="document JSON";void wrong;
}
void reactControls;
