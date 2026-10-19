import {openLocalEditor,openLocalDocumentEditor,createFullscreen,mountFullscreenControls,type RichFullscreenController,type RichCoreEditor} from "@breditor/editor";
import {openSharedEditor,openSharedDocumentEditor} from "@breditor/editor/collaboration";
import {BreditorFullscreenControls,type BreditorFullscreenControlsProps} from "@breditor/editor/react";
import {BreditorFullscreenControls as SharedControls} from "@breditor/editor/collaboration/react";
import {createSharedFullscreen,mountSharedFullscreenControls} from "@breditor/collaboration";
declare const host:HTMLElement,target:HTMLElement,controls:HTMLElement,core:RichCoreEditor,controller:RichFullscreenController;
async function run(){
 const owners=[await openLocalEditor({host}),await openLocalDocumentEditor({host,selectionEditing:"document-v1"}),await openSharedEditor({host,database:"shared",room:"room",writer:"1"}),await openSharedDocumentEditor({host,database:"document",room:"room",writer:"1",selectionEditing:"document-v1"})];
 for(const owner of owners){const fullscreen=createFullscreen(owner.fullscreen(),{target,navigationUI:"auto"});const panel=mountFullscreenControls(controls,fullscreen);const entering:Promise<void>=fullscreen.enter(owner.view().revision);await entering;await fullscreen.exit();panel.dispose();const closure:Promise<void>=fullscreen.dispose();await closure;}
}
void run;const props:BreditorFullscreenControlsProps={controller,initialOptions:{enterLabel:"Focus",exitLabel:"Leave"}};void props;void BreditorFullscreenControls;void SharedControls;
void createSharedFullscreen;void mountSharedFullscreenControls;
// @ts-expect-error Exact publication revisions remain strings, never rounded JS numbers.
void controller.enter(1);
// @ts-expect-error Native keyboard lock is not silently enabled by the utility contract.
createFullscreen((await openLocalEditor({host})).fullscreen(),{keyboardLock:"browser"});
// @ts-expect-error Fullscreen is not a document authoring command.
core.execute({kind:"fullscreen"});
