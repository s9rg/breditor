import type {RichCoreEditor,RichSearchQuery,RichSearchReplacement,RichSearchMetadata} from "@breditor/experimental-rich-content";
import {SharedRichEditor,SharedPersistentSession,SharedReviewPersistentSession,restoreSharedSearchEditor,type SharedRustOwner,type SharedRustProfile,type SharedDocumentView} from "@breditor/collaboration";
const query:RichSearchQuery={pattern:"(?P<word>cat)",mode:"regex",caseSensitive:true,wholeWords:false};
const replacement:RichSearchReplacement={text:"${word}!",mode:"captures"};
function local(core:RichCoreEditor):void{
 if(!core.supportsSearch?.()||!core.findText)throw Error("Missing optional native search");
 const read=core.findText(query,core.view().revision),metadata:RichSearchMetadata=read.metadata();void metadata;
 read.navigate(null,"next",true);core.checkSearchResults?.(read);core.selectSearchMatch?.(read,"0");core.replaceSearchOne?.(read,"0",replacement);core.replaceSearchAll?.(read,replacement);
 // @ts-expect-error match indices remain decimal strings across the Wasm boundary
 core.selectSearchMatch?.(read,0);
 // @ts-expect-error match metadata is immutable
 metadata.matches[0]!.start="0";
 // @ts-expect-error the mode is explicit and closed
 core.findText({pattern:"cat",mode:"regexp",caseSensitive:true,wholeWords:false});
 read.dispose();
}
function shared(raw:SharedRustOwner,profile:SharedRustProfile):void{
 const core=new SharedRichEditor(raw,{searchHistory:"search-v1"}),read=core.findText(query);core.checkSearchResults(read);core.selectSearchMatch(read,"0");core.replaceSearchAll(read,replacement);restoreSharedSearchEditor(profile,"room",core.checkpointJson());
 // @ts-expect-error cloned metadata cannot substitute for an opaque result
 core.replaceSearchAll(read.metadata(),replacement);
 // @ts-expect-error old execute protocols are not widened by the search capability
 core.dispatch({commands:[{kind:"replace_search_all",data:{}}]});
 read.dispose();core.dispose();
}
async function sessions(raw:SharedRustOwner,profile:SharedRustProfile):Promise<void>{
 const options={database:"search",room:"room",writer:"101",richLanguage:3 as const,history:"typing-v1" as const,rangeEditing:"general-v1" as const,selectionEditing:"document-v1" as const,create:()=>raw,restoreSearch:(checkpoint:string)=>restoreSharedSearchEditor(profile,"room",checkpoint)};
 const session=await SharedPersistentSession.openSearch(options),view:SharedDocumentView=session.core.view();void view;session.core.selectDocument();
 await SharedReviewPersistentSession.openSearch({...options,review:{actor:"review-alice",principal:"alice",access:"comment"}});
 // @ts-expect-error explicit native search recovery is mandatory
 SharedPersistentSession.openSearch({...options,restoreSearch:undefined});
}
void local;void shared;void sessions;
import {mountSearchPanel,type LocalEditor,type LocalDocumentEditor} from "@breditor/editor";
import {openSharedSearchEditor,openSharedDocumentSearchEditor,openSharedEditor,type SharedEditorSession,type SharedDocumentEditorSession} from "@breditor/editor/collaboration";
import type {BreditorSearchPanelProps} from "@breditor/editor/react";
import type {BreditorSharedSearchEditorProps,BreditorSharedDocumentSearchEditorProps} from "@breditor/editor/collaboration/react";
function controls(host:HTMLElement,local:LocalEditor,document:LocalDocumentEditor,shared:SharedEditorSession,sharedDocument:SharedDocumentEditorSession):void{
 for(const source of [local.search(),document.search(),shared.search(),sharedDocument.search()]){const panel=mountSearchPanel(host,source,{initialQuery:query,initialReplacement:replacement});panel.focus();void panel.next();void panel.replaceOne();void panel.replaceAll();panel.close();panel.dispose();}
 const props:BreditorSearchPanelProps={editor:sharedDocument.search(),initialOptions:{initialQuery:query}};void props;
 // @ts-expect-error opaque metadata is not a queued search intent
 local.search().selectSearchMatch(local.search().findText(query).metadata(),"0");
}
function rootSearch(host:HTMLElement):void{
 const options={host,database:"search",room:"room",writer:"101",richLanguage:3 as const,history:"typing-v1" as const,rangeEditing:"general-v1" as const,initial:{kind:"searchCheckpoint" as const,checkpointJson:"opaque"}};
 void openSharedSearchEditor(options);void openSharedDocumentSearchEditor({...options,selectionEditing:"document-v1"});
 // @ts-expect-error old startup must not infer search history from a new checkpoint tag
 void openSharedEditor(options);
 // @ts-expect-error new startup requires explicit language/history/range policies
 void openSharedSearchEditor({host,database:"search",room:"room",writer:"101"});
 const props:BreditorSharedSearchEditorProps={initialOptions:options,onCloseError:()=>{}},document:BreditorSharedDocumentSearchEditorProps={initialOptions:{...options,selectionEditing:"document-v1"},onCloseError:()=>{}};void props;void document;
}
void controls;void rootSearch;
