import {openLocalEditor,openLocalDocumentEditor,type RichCoreEditor,type LocalEditorOptions} from "@breditor/editor";
import {openSharedEditor,openSharedDocumentEditor,SharedRichEditor} from "@breditor/editor/collaboration";
import {BreditorEditor,BreditorDocumentEditor} from "@breditor/editor/react";
import {BreditorSharedEditor,BreditorSharedDocumentEditor} from "@breditor/editor/collaboration/react";
import type {ComponentProps} from "react";
declare const host:HTMLElement,core:RichCoreEditor,shared:SharedRichEditor;
if(core.supportsPlaceholder?.()&&core.placeholderEmpty){const empty:boolean=core.placeholderEmpty("18446744073709551615");void empty;}
const sharedEmpty:boolean=shared.placeholderEmpty("1");void sharedEmpty;
const options:LocalEditorOptions={host,placeholder:"Literal hint"};void options;
void openLocalEditor({host,placeholder:"Write…"});void openLocalDocumentEditor({host,selectionEditing:"document-v1",placeholder:"Write…"});
async function labels(){const local=await openLocalEditor({host,placeholder:"Initial"});local.setPlaceholderLabel("Live");local.setPlaceholderLabel(null);const document=await openLocalDocumentEditor({host,selectionEditing:"document-v1",placeholder:"Initial"});document.setPlaceholderLabel("Live");const shared=await openSharedEditor({host,database:"live",room:"room",writer:"1",placeholder:"Initial"});shared.setPlaceholderLabel(null);}
void labels;
const common={host,room:"room",writer:"1",database:"placeholder",placeholder:"Write…"};void openSharedEditor(common);void openSharedDocumentEditor({...common,selectionEditing:"document-v1"});
type LocalReactHint=NonNullable<ComponentProps<typeof BreditorEditor>["initialOptions"]>["placeholder"];
type LocalDocumentHint=NonNullable<ComponentProps<typeof BreditorDocumentEditor>["initialOptions"]>["placeholder"];
type SharedReactHint=NonNullable<ComponentProps<typeof BreditorSharedEditor>["initialOptions"]>["placeholder"];
type SharedDocumentHint=NonNullable<ComponentProps<typeof BreditorSharedDocumentEditor>["initialOptions"]>["placeholder"];
const hints:[LocalReactHint,LocalDocumentHint,SharedReactHint,SharedDocumentHint]=["One","Two","Three","Four"];void hints;
// @ts-expect-error Placeholder labels are strings, not a protocol object.
void openLocalEditor({host,placeholder:{text:"Write"}});
// @ts-expect-error Native guarded revisions retain exact decimal strings.
shared.placeholderEmpty(1);
// @ts-expect-error Prompt eligibility is not an original authoring command.
core.execute({kind:"placeholderEmpty"});
// @ts-expect-error Prompt eligibility never widens shared dispatch operations.
shared.dispatch({commands:[{kind:"placeholder_empty"}]});
