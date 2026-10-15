import type {RichView,RichSelection,RichPoint,FormatLiteral,TextNode} from "@breditor/experimental-rich-content/rendering";
export type {RichSelection,RichPoint,RichCell,FormatLiteral,ElementNode,RichModel,RenderOptions,AssetBinding} from "@breditor/experimental-rich-content/rendering";
export type SharedView=Omit<RichView,"format">&{format:"breditor/shared-rich-view";causalVersion:string;selectionOutcome:{kind:string;reason?:string}};
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
export interface SharedOwnerDescriptor {format:"breditor/shared-rich-owner";abiVersion:1;modelVersion:11;journalVersion:12;schema:{name:string;version:number};schemaFingerprint:string}
/** Read-only mapping of an opaque presence packet, never an authorization credential. */
export type SharedPresenceResolution=
 |{kind:"resolved";writer:string;selection:RichSelection|null}
 |{kind:"pending";writer:string}
 |{kind:"cleared";writer:string;reason:"target_deleted"|"hidden_table"|"no_text_target"};
export interface SharedWriterClock {writer:string;through:string;prefixDigest:string}
/** Frozen complete local action windows. Group strings carry their own strict protocol binding. */
export interface SharedWriterGroups {format:"breditor/shared-writer-groups";formatVersion:1;writer:string;from:string;through:string;hasMore:boolean;groups:readonly string[]}
/** Exclusive generated Rust owner. Ownership transfers to SharedRichEditor; never reuse it elsewhere. */
export interface SharedRustOwner {
 /** Additive capability: older matching owners may omit the separate presence channel. */
 presence_frame?(observation:unknown):string;resolve_presence?(frame:string):string;
 writer_groups?(observation:unknown,after:string):string;writer_clock?(writer:string):string;
 descriptor_json():string;
 observe():{view_json():string;free():void};
 dispatch(observation:unknown,input:string):boolean;
 set_selection(observation:unknown,input:string):boolean;
 set_pending_formats(observation:unknown,input:string):boolean;
 insert_plain_text(observation:unknown,text:string):boolean;
 replace_plain_text(observation:unknown,selection:string,text:string):boolean;
 paste_clipboard_namespace(observation:unknown,fragment:string,target:string,prefix:string):boolean;
 paste_flow_at_text_namespace(observation:unknown,fragment:string,right:string,prefix:string):boolean;
 navigate_grid(observation:unknown,movement:string,extend:boolean):string;
 copy_clipboard(observation:unknown):string;
 undo_observed(observation:unknown):boolean;redo_observed(observation:unknown):boolean;
 receive_frame(frame:string):void;update_frame():string;checkpoint():string;free():void;
}
export interface SharedPublication {source:"local"|"remote";view:SharedView}
export interface SharedEditorOptions {maxPendingFrames?:number;maxPendingBytes?:number;onError?:(error:unknown)=>void}
