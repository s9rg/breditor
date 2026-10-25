import type {RichView,RichSelection,RichPoint,FormatLiteral,TextNode} from "@breditor/experimental-rich-content/rendering";
import type {SharedProtocolBinding} from "./protocol.js";
import type {SharedReviewRustCapability} from "./review_types.js";
import type {SharedReviewGenerationRustCapability,SharedReadOnlyReviewHistoryRustCapability} from "./review_generations.js";
import type {SharedVersionsRustCapability} from "./version_types.js";
import type {SharedSuggestionsRustCapability} from "./suggestion_types.js";
import type {SharedReviewedHistoryRustCapability,SharedReviewedHistoryIdentity} from "./reviewed_history_types.js";
import type {SharedNativeSearchResults} from "./search_results.js";
import type {SharedSegmentedRustCapability} from "./segmented_history.js";
import type {SharedReadOnlyHistoryRustCapability} from "./read_only_history.js";
export type {RichSelection,RichPoint,RichCell,FormatLiteral,ElementNode,RichModel,RenderOptions,AssetBinding} from "@breditor/experimental-rich-content/rendering";
export type {RichInlineFormatState,RichInlineFormatStateRead} from "@breditor/experimental-rich-content/rendering";
export type SharedView=Omit<RichView,"format">&{format:"breditor/shared-rich-view";causalVersion:string;selectionOutcome:{kind:string;reason?:string};historyPolicy?:"reviewed-v1"};
/** Independent explicit scope policy; original view and selection DTOs stay closed. */
export type SharedSelectionPolicy="original"|"document-v1";
export type SharedDocumentSelection=RichSelection|Readonly<{kind:"document"}>;
export type SharedDocumentView=Omit<SharedView,"format"|"selection">&{format:"breditor/shared-document-view";selection:SharedDocumentSelection|null;selectionEditing:"document-v1"};
export type SharedEditorView<P extends SharedSelectionPolicy="original">=P extends "document-v1"?SharedDocumentView:SharedView;
/** Explicit immutable owner policy; the old per-dispatch default is unchanged. */
export type SharedHistoryPolicy="explicit"|"typing-v1";
/** Independent immutable replay/range policy; old sessions keep original semantics. */
export type SharedRangePolicy="original"|"general-v1";
type Op<K extends string,D>=Readonly<{kind:K;data:D}>;
type Position={parent:string|null;before:string|null};
type ListStyle={kind:"bullet"}|{kind:"ordered";start:number};
/** Fresh Document V2 candidates, not existing document subtrees or unchecked publication proof. */
export interface SharedNode {kind:"element";type:string;entityId:null;properties:Readonly<Record<string,unknown>>;children:readonly (SharedNode|TextNode)[]}
/** Captions are one ordinary paragraph with rich text runs, never nested flow. */
export interface SharedParagraph extends SharedNode {type:"breditor/paragraph";children:readonly TextNode[]}
/** Independent shared semantic commands. Rust validates every complete staged group. */
export type SharedCommand=
 |Op<"paste_flow_at_text",{anchor:RichPoint;focus:RichPoint;right:string;nodes:readonly SharedNode[]}>
 |Op<"insert_blocks"|"paste_blocks",Position&{nodes:readonly SharedNode[]}>
 |Op<"delete_block",{block:string}>
 |Op<"move_block",Position&{block:string}>
 |Op<"insert_row",{block:string;row_block:string;row:string;before:string|null}>
 |Op<"insert_column",{block:string;column:string;width:number;before:string|null}>
 |Op<"delete_column",{block:string;column:string}>
 |Op<"move_column",{block:string;column:string;before:string|null}>
 |Op<"resize_column",{block:string;column:string;width:number}>
 |Op<"merge_cells",{block:string;merge:string;anchor:string;focus:string}>
 |Op<"split_cell",{cell:string}>
 |Op<"set_header",{cells:readonly string[];header:boolean}>
 |Op<"clear_table_cells",{anchor:string;focus:string;empty:readonly string[]}>
 |Op<"paste_table_cells",{anchor:string;focus:string;cells:readonly (readonly {body:readonly SharedNode[];header:boolean|null}[])[];merges:readonly {id:string;rows:readonly[number,number];columns:readonly[number,number]}[]}>
 |Op<"insert_text",{block:string;offset:number;text:string}>
 |Op<"delete_text",{block:string;offset:number;length:number}>
 |Op<"replace_text_range",{anchor:RichPoint;focus:RichPoint;runs:readonly {text:string;formats:readonly FormatLiteral[]}[]}>
 |Op<"set_format",{block:string;offset:number;length:number;format:FormatLiteral;enabled:boolean}>
 |Op<"set_heading",{block:string;level:number|null}>
 /** Explicit V3 only; preserve raw strict intent JSON so Rust can reject duplicate keys. */
 |Op<"set_block_layout",{block:string;patch_json:string}>
 |Op<"set_code_block",{block:string;language:string|null;format_policy:"reject_formatted"|"remove_formats"}>
 |Op<"set_code_language",{block:string;language:string|null}>
 |Op<"set_task_checked",{block:string;checked:boolean}>
 |Op<"wrap_blockquote",{first:string;last:string;wrapper:string}>
 |Op<"unwrap_blockquote",{wrapper:string}>
 |Op<"wrap_task_list",{first:string;last:string;container:string;items:readonly {block:string;checked:boolean}[]}>
 |Op<"unwrap_task_list",{container:string}>
 |Op<"indent_task_items",{container:string;first:string;last:string;new_nested:string|null}>
 |Op<"outdent_task_items",{container:string;first:string;last:string;fresh_tail:string|null}>
 |Op<"exit_task_item",{container:string;item:string;fresh_tail:string|null}>
 |Op<"split_task_item",{block:string;offset:number;new_item:string;right:string;right_heading:number|null}>
 |Op<"join_task_items",{container:string;left:string;right:string}>
 |Op<"insert_horizontal_rule",Position&{block:string}>
 |Op<"delete_horizontal_rule",{block:string;replacement:SharedNode|null}>
 |Op<"split_text_block",{block:string;offset:number;right:string;right_heading:number|null}>
 |Op<"join_text_blocks",{left:string;right:string}>
 |Op<"wrap_list",{first:string;last:string;container:string;items:readonly string[];style:ListStyle}>
 |Op<"unwrap_list",{container:string}>
 |Op<"set_list_kind",{container:string;style:ListStyle}>
 |Op<"indent_list_items",{container:string;first:string;last:string;new_nested:{block:string;style:ListStyle}|null}>
 |Op<"outdent_list_items",{container:string;first:string;last:string;fresh_tail:string|null}>
 |Op<"split_list_item",{block:string;offset:number;new_item:string;right:string;right_heading:number|null}>
 |Op<"join_list_items",{container:string;left:string;right:string}>
 |Op<"replace_image",{block:string;asset:string;generation:string}>
 |Op<"set_image_alt",{block:string;text:string;decorative:boolean}>
 |Op<"set_image_caption",{block:string;caption:SharedParagraph|null}>
 |Op<"resize_image",{block:string;size:readonly[number,number]|null}>;
export interface SharedDispatch {commands:readonly SharedCommand[];selectionUpdate?:{kind:"map"}|{kind:"set";value:RichSelection|null};pendingFormatsUpdate?:{kind:"map"}|{kind:"set";value:readonly FormatLiteral[]|null}}
export type PasteTarget={kind:"text"}|{kind:"grid"}|({kind:"flow"}&Position);
export type Navigation="next"|"previous"|"left"|"right"|"up"|"down"|"rowStart"|"rowEnd"|"tableStart"|"tableEnd";
export type NavigationResult={kind:"moved"|"unchanged"}|{kind:"boundary";boundary:string};
export interface ClipboardContent {richJson:string;plainText:string}
export type {RichClipboardTextProjection} from "@breditor/experimental-rich-content";
export type SharedOwnerDescriptor=SharedProtocolBinding&{format:"breditor/shared-rich-owner";schema:{name:string;version:number};schemaFingerprint:string};
/** Read-only mapping of an opaque presence packet, never an authorization credential. */
export type SharedPresenceResolution<P extends SharedSelectionPolicy="original">=
 |{kind:"resolved";writer:string;selection:(P extends "document-v1"?SharedDocumentSelection:RichSelection)|null}
 |{kind:"pending";writer:string}
 |{kind:"cleared";writer:string;reason:"target_deleted"|"hidden_table"|"no_text_target"};
export interface SharedWriterClock {writer:string;through:string;prefixDigest:string}
/** Frozen complete local action windows. Group strings carry their own strict protocol binding. */
export interface SharedWriterGroups {format:"breditor/shared-writer-groups";formatVersion:1;writer:string;from:string;through:string;hasMore:boolean;groups:readonly string[]}
/** Explicit atom-lineage transport; never accepted as an original group batch. */
export interface SharedWriterGroupsV2 extends Omit<SharedWriterGroups,"formatVersion"> {formatVersion:2}
/** Exclusive generated Rust owner. Ownership transfers to SharedRichEditor; never reuse it elsewhere. */
export interface SharedRustOwner extends SharedReviewRustCapability,SharedReviewGenerationRustCapability,SharedReadOnlyReviewHistoryRustCapability,SharedVersionsRustCapability,SharedSuggestionsRustCapability,SharedReviewedHistoryRustCapability,SharedSegmentedRustCapability,SharedReadOnlyHistoryRustCapability {
 /** Additive opaque search reads; mutations require explicitly selected search history. */
 writing_tools_version?():string;writing_tools_json?(observation:unknown):string;
 retained_asset_references_version?():string;retained_asset_references_json?(observation:unknown):string;
 packet_asset_references_version?():string;
 document_version_asset_references_json?(observation:unknown,packet:string):string;
 document_suggestion_asset_references_json?(observation:unknown,packet:string):string;
 document_suggestion_revision_asset_references_json?(observation:unknown,previous:string,packet:string):string;
 placeholder_version?():string;placeholder_empty?(observation:unknown):boolean;
 search_version?():string;search_history_enabled?():boolean;enable_search_history?(observation:unknown):boolean;search_checkpoint?():string;
 find_text?(observation:unknown,input:string):SharedNativeSearchResults;check_search_results?(observation:unknown,results:SharedNativeSearchResults):void;
 select_search_match?(observation:unknown,results:SharedNativeSearchResults,index:string):boolean;
 replace_search_one?(observation:unknown,results:SharedNativeSearchResults,index:string,input:string):boolean;
 replace_search_all?(observation:unknown,results:SharedNativeSearchResults,input:string):boolean;
 clipboard_interchange_version?():string;
 admit_clipboard_root?(kind:string,rootJson:string):string;validate_clipboard?(clipboardJson:string):string;
 document_selection_version?():string;document_typing_version?():string;document_selection_enabled?():boolean;
 document_clipboard_version?():string;paste_document_clipboard?(observation:unknown,input:string):boolean;
 document_navigation_version?():string;collapse_document_selection?(observation:unknown,side:string):boolean;
 document_tools_version?():string;
 document_presence_version?():string;document_presence_frame?(observation:unknown):string;resolve_document_presence?(frame:string):string;
 document_selection_coverage_json?(observation:unknown,scope:string):string;document_selection_format_state_json?(observation:unknown,kind:string):string;document_block_layout_state_json?(observation:unknown):string;
 change_document_selection_formats?(observation:unknown,input:string):boolean;change_document_selection_layout?(observation:unknown,input:string):boolean;
 enable_document_selection?(observation:unknown):boolean;observe_document?():ReturnType<SharedRustOwner["observe"]>;
 document_view_json?():string;select_document?(observation:unknown):boolean;copy_document_clipboard?(observation:unknown):string;
 replace_document_plain_text?(observation:unknown,input:string):boolean;replace_document_typing_text?(observation:unknown,input:string):boolean;
 document_checkpoint?():string;document_typing_checkpoint?():string;
 general_range_version?():string;
 general_inline_paste_version?():string;
 general_flow_paste_version?():string;
 general_paragraph_version?():string;
 insert_general_paragraph?(observation:unknown,input:string):boolean;
 paste_general_flow_clipboard?(observation:unknown,input:string):boolean;
 general_copy_version?():string;
 clipboard_text_policy_version?():string;project_clipboard_text?(observation:unknown,input:string):string;
 copy_general_clipboard?(observation:unknown):string;
 paste_general_inline_clipboard?(observation:unknown,input:string):boolean;
 enable_general_ranges?(observation:unknown):boolean;
 replace_general_range_text?(observation:unknown,input:string):boolean;
 replace_general_range_plain_text?(observation:unknown,input:string):boolean;
 replace_general_range_typing_text?(observation:unknown,input:string):boolean;
 general_checkpoint?():string;
 general_typing_checkpoint?():string;
 /** Additive capability: older matching owners may omit the separate presence channel. */
 presence_frame?(observation:unknown):string;resolve_presence?(frame:string):string;
 writer_groups?(observation:unknown,after:string):string;writer_clock?(writer:string):string;
 writer_transport_v2_version?():string;writer_groups_v2?(observation:unknown,after:string):string;writer_clock_v2?(writer:string):string;
 /** Additive pure arbitrary-author prefix capability; existing head/group reads remain useful. */
 writer_prefix_read_version?():string;writer_clock_at?(writer:string,through:string):string;writer_clock_at_v2?(writer:string,through:string):string;
 inline_format_state_json?(observation:unknown,kind:string):string;
 caret_formats_json?(observation:unknown):string;
 patch_inline_format_properties?(observation:unknown,input:string):boolean;
 read_only_version?():string;
 set_read_only?(observation:unknown,value:boolean):boolean;
 /** One-shot fresh host policy before either observation family is issued. Not persisted. */
 initial_read_only_version?():string;
 initialize_read_only?(value:boolean):void;
 /** Pure native same-writer journal and optional paired review continuity; never an activation grant. */
 recovery_origin_version?():string;
 verify_recovery_origin?(observation:unknown,origin:SharedRustOwner,originObservation:unknown):void;
 code_exit_version?():string;
 exit_code_block?(observation:unknown,paragraph:string):boolean;
 flow_navigation_version?():string;
 navigate_flow?(observation:unknown,movement:string):boolean;
 insert_paragraph_adjacent?(observation:unknown,paragraph:string,side:string):boolean;
 atom_edit_version?():string;
 delete_atom?(observation:unknown,paragraph:string,movement:string):boolean;
 replace_atom_plain_text?(observation:unknown,paragraph:string,text:string):boolean;
 replace_atom_typing_text?(observation:unknown,paragraph:string,text:string,clockMs:string):boolean;
 selection_formatting_version?():string;
 selection_coverage_json?(observation:unknown,scope:string):string;
 selection_format_state_json?(observation:unknown,kind:string):string;
 change_selection_formats?(observation:unknown,input:string):boolean;
 block_layout_version?():string;
 block_layout_state_json?(observation:unknown):string;
 change_selection_layout?(observation:unknown,input:string):boolean;
 typing_history_version?():string;
 /** Complete optional native typing+rules pair; no old dispatch or recovery upgrade. */
 markdown_input_rules_version?():string;
 markdown_input_routing_version?():string;
 insert_plain_text_with_markdown_rules?(observation:unknown,input:string):string;
 insert_typing_text_with_markdown_rules?(observation:unknown,input:string):string;
 enable_typing_history?(observation:unknown):boolean;
 close_typing_group?(observation:unknown):boolean;
 insert_typing_text?(observation:unknown,input:string):boolean;
 delete_typing_range?(observation:unknown,input:string):boolean;
 typing_checkpoint?():string;
 descriptor_json():string;
 observe():{view_json():string;free():void};
 dispatch(observation:unknown,input:string):boolean;
 set_selection(observation:unknown,input:string):boolean;
 set_pending_formats(observation:unknown,input:string):boolean;
 insert_plain_text(observation:unknown,text:string):boolean;
 /** Additive capability; old matching owners can author the same LF through insert_plain_text. */
 insert_hard_break?(observation:unknown):boolean;
 replace_plain_text(observation:unknown,selection:string,text:string):boolean;
 paste_clipboard_namespace(observation:unknown,fragment:string,target:string,prefix:string):boolean;
 paste_flow_at_text_namespace(observation:unknown,fragment:string,right:string,prefix:string):boolean;
 navigate_grid(observation:unknown,movement:string,extend:boolean):string;
 copy_clipboard(observation:unknown):string;
 undo_observed(observation:unknown):boolean;redo_observed(observation:unknown):boolean;
 receive_frame(frame:string):void;update_frame():string;checkpoint():string;free():void;
}
export interface SharedPublication<P extends SharedSelectionPolicy="original"> {source:"local"|"remote";view:SharedEditorView<P>}
export interface SharedEditorOptions<P extends SharedSelectionPolicy="original"> {selectionEditing?:P;maxPendingFrames?:number;maxPendingBytes?:number;onError?:(error:unknown)=>void;
 /** Explicit adoption of an already segmented native owner; never enables or infers a migration. */
 segmentedHistory?:"segmented-v1";
 /** Explicit new recovery family. Old durable factories refuse it; use search-aware storage. */
 searchHistory?:"search-v1";
 /** Explicit new recovery family. Durable callers must use reviewed-aware paired storage. */
 reviewedHistory?:SharedReviewedHistoryIdentity;
}
/** Cancel only a queued remote publication; a synchronous admitted Rust commit cannot be rewound. */
export interface SharedRemoteOptions {signal?:AbortSignal}
