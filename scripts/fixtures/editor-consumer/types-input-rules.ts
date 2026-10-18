import type {RichCoreEditor,RichInputRuleOutcome,RichEditorOptions} from "@breditor/experimental-rich-content";
import type {SharedRichEditor,SharedDomOptions} from "@breditor/collaboration";
import {openLocalEditor,openLocalDocumentEditor,type LocalEditorOptions,type LocalDocumentEditorOptions} from "@breditor/editor";
import {openSharedEditor,openSharedDocumentEditor,type SharedEditorSessionOptions,type SharedDocumentEditorSessionOptions} from "@breditor/editor/collaboration";
import type {BreditorEditorProps,BreditorDocumentEditorProps} from "@breditor/editor/react";
import type {BreditorSharedEditorProps,BreditorSharedDocumentEditorProps} from "@breditor/editor/collaboration/react";
function programmatic(local:RichCoreEditor,shared:SharedRichEditor):void {
 const localOutcome:RichInputRuleOutcome|undefined=local.insertPlainTextWithMarkdownRules?.(" ","fresh",local.view().revision);
 const sharedOutcome:RichInputRuleOutcome=shared.insertTypingTextWithMarkdownRules("*","100","fresh",shared.view().revision);void localOutcome;void sharedOutcome;
 local.supportsMarkdownInputRouting?.();shared.supportsMarkdownInputRouting();
 // @ts-expect-error clocks are decimal strings, never floating-point boundary values
 shared.insertTypingTextWithMarkdownRules(" ",100,"fresh");
 // @ts-expect-error automatic behavior is not a new old-protocol command
 local.execute({kind:"insertPlainTextWithMarkdownRules",text:" "});
 // @ts-expect-error ordinary shared dispatch remains closed
 shared.dispatch({commands:[{kind:"insert_plain_text_with_markdown_rules",data:{}}]});
}
function startup(host:HTMLElement,local:RichCoreEditor,shared:SharedRichEditor):void {
 const refusal=()=>{},dom:RichEditorOptions={core:local,inputRules:"markdown-v1",onInputRuleRefused:refusal},sharedDom:SharedDomOptions={core:shared,inputRules:"markdown-v1",onInputRuleRefused:refusal};void dom;void sharedDom;
 const a:LocalEditorOptions={host,inputRules:"markdown-v1",history:"typing-v1",onInputRuleRefused:refusal},b:LocalDocumentEditorOptions={host,inputRules:"markdown-v1",history:"typing-v1",onInputRuleRefused:refusal,selectionEditing:"document-v1"};void openLocalEditor(a);void openLocalDocumentEditor(b);
 const c:SharedEditorSessionOptions={host,database:"input",room:"room",writer:"101",inputRules:"markdown-v1",onInputRuleRefused:refusal},d:SharedDocumentEditorSessionOptions={host,database:"input",room:"room",writer:"101",inputRules:"markdown-v1",onInputRuleRefused:refusal,selectionEditing:"document-v1",rangeEditing:"general-v1"};void openSharedEditor(c);void openSharedDocumentEditor(d);
 const react:BreditorEditorProps={initialOptions:a},document:BreditorDocumentEditorProps={initialOptions:b},sharedReact:BreditorSharedEditorProps={initialOptions:c,onCloseError:()=>{}},sharedDocument:BreditorSharedDocumentEditorProps={initialOptions:d,onCloseError:()=>{}};void react;void document;void sharedReact;void sharedDocument;
 // @ts-expect-error only a named, versioned opt-in is accepted
 const invalid:LocalEditorOptions={host,inputRules:true};void invalid;
 // @ts-expect-error omission is the default; arbitrary pack names are not accepted
 const unknown:SharedEditorSessionOptions={host,database:"input",room:"room",writer:"101",inputRules:"markdown"};void unknown;
}
void programmatic;void startup;
