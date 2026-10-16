import {SharedEditorOwner,SharedObservation,SharedRichProfile} from "@breditor/collaboration/wasm";
// @ts-expect-error native writers are created only by the admitted profile factory
new SharedEditorOwner();
// @ts-expect-error native observations come only from the live owner
new SharedObservation();
// @ts-expect-error schema compilation is required before a profile exists
new SharedRichProfile();
void SharedRichProfile.from_configuration_json_v2;
void SharedRichProfile.from_standard_configuration_json_v2;
function readOnly(owner:SharedEditorOwner,observation:SharedObservation):void{const version:string=owner.read_only_version();void version;void owner.set_read_only(observation,true);}
void readOnly;
function generalInline(owner:SharedEditorOwner,observation:SharedObservation):void{const version:string=owner.general_inline_paste_version();const changed:boolean=owner.paste_general_inline_clipboard(observation,'{"selection":{},"clipboardJson":"opaque native payload","prefix":"fresh"}');void version;void changed;}
void generalInline;
function generalCopy(owner:SharedEditorOwner,observation:SharedObservation):void{const version:string=owner.general_copy_version();const content:string=owner.copy_general_clipboard(observation);void version;void content;}
void generalCopy;
function generalParagraph(owner:SharedEditorOwner,observation:SharedObservation):void{const version:string=owner.general_paragraph_version();const changed:boolean=owner.insert_general_paragraph(observation,'{"selection":{},"prefix":"fresh"}');void version;void changed;}
void generalParagraph;
function atomicTransport(owner:SharedEditorOwner,observation:SharedObservation):void{const version:string=owner.writer_transport_v2_version();const groups:string=owner.writer_groups_v2(observation,"0");const clock:string=owner.writer_clock_v2("101");void version;void groups;void clock;}
void atomicTransport;
function textPolicy(owner:SharedEditorOwner,observation:SharedObservation):void{const version:string=owner.clipboard_text_policy_version();const read:string=owner.project_clipboard_text(observation,'{"selection":{},"clipboardJson":"opaque"}');void version;void read;}
void textPolicy;
