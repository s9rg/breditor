import {createSelectionRichToolbarV1,type RichCoreEditor,type RichSelectionCoverageRead,type RichSelectionFormatStateRead,type RichSelectionFormatChange,type RichInlinePresentation,type RichCommand} from "@breditor/editor";
import {createSelectionSharedToolbarV1,type SharedRichEditor} from "@breditor/editor/collaboration";
function contract(local:RichCoreEditor,shared:SharedRichEditor,presentation:RichInlinePresentation):void {
 const changes:readonly RichSelectionFormatChange[]=[{kind:"set",formatsJson:'[{"type":"breditor/strong","properties":{}}]'},{kind:"patch",formatsJson:"[]",properties:["example/field"]}];
 const command:RichCommand={kind:"changeSelectionFormats",data:{changes}};local.execute(command,local.view().revision);
 const selected:RichSelectionCoverageRead|undefined=local.selectionCoverage?.("selection");const entire=local.selectionCoverage?.("document");
 const state:RichSelectionFormatStateRead|undefined=local.selectionFormatState?.("breditor/strong");
 void selected;void entire;void state;void local.supportsSelectionFormatting?.();
 void createSelectionRichToolbarV1(local,presentation);void createSelectionSharedToolbarV1(shared,presentation);
 const result:boolean=shared.changeSelectionFormats(changes,shared.view().revision);void result;void shared.selectionCoverage("document");void shared.selectionFormatState("breditor/strong");
 // @ts-expect-error The native owner, not an SDK caller, selects formatting targets.
 local.execute({kind:"changeSelectionFormats",data:{changes,targets:[]}});
 // @ts-expect-error Document coverage is an explicit scope, not a boolean or alias.
 shared.selectionCoverage("all");
 // @ts-expect-error Removal requires a complete typed original literal, not a kind-only record.
 shared.changeSelectionFormats([{kind:"remove",format:"breditor/strong"}]);
}
void contract;
