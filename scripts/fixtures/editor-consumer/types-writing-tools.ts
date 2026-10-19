import {openLocalEditor,openLocalDocumentEditor,mountWritingTools,type RichCoreEditor,type RichWritingToolsRead,type RichWritingToolsHost} from "@breditor/editor";
import {openSharedEditor,openSharedDocumentEditor,SharedRichEditor,mountSharedWritingTools} from "@breditor/editor/collaboration";
import {BreditorWritingTools,type BreditorWritingToolsHandle} from "@breditor/editor/react";
import {BreditorWritingTools as SharedWritingTools} from "@breditor/editor/collaboration/react";
declare const core:RichCoreEditor,shared:SharedRichEditor,host:HTMLElement,source:RichWritingToolsRead,port:RichWritingToolsHost;
if(core.supportsWritingTools?.()&&core.writingTools){const read=core.writingTools("1");const words:string=read.counts.words;void words;}
const sharedRead:RichWritingToolsRead=shared.writingTools("1");void sharedRead;
const panel=mountWritingTools(host,port,{pageSize:20,debounceMs:0});panel.refresh();void panel.selectHeading(0,source.revision);panel.setPage(0);panel.dispose();
void mountSharedWritingTools(host,port);void BreditorWritingTools;void SharedWritingTools;
declare const handle:BreditorWritingToolsHandle;void handle.selectHeading(0,"1");
async function roots(){const local=await openLocalEditor({host});const doc=await openLocalDocumentEditor({host,selectionEditing:"document-v1"});const a:RichWritingToolsHost=local.writing(),b:RichWritingToolsHost=doc.writing();const common={host,room:"room",writer:"1",database:"writing"};const c=await openSharedEditor(common),d=await openSharedDocumentEditor({...common,selectionEditing:"document-v1"});void [a,b,c.writing(),d.writing()];}
void roots;
import type {RichRetainedAssetReferencesRead,RichRetainedAssetReference} from "@breditor/editor";
import type {RichRetainedAssetReferencesRead as SharedRetainedRead} from "@breditor/editor/collaboration";
import type {BreditorEditorHandle} from "@breditor/editor/react";
const retained:RichRetainedAssetReferencesRead=shared.retainedAssetReferences();const sharedRetained:SharedRetainedRead=retained;shared.checkRetainedAssetReferences(sharedRetained);const binding:RichRetainedAssetReference|undefined=retained.references[0];void binding;
declare const localHandle:BreditorEditorHandle;const managed=localHandle.getEditor();if(managed?.supportsRetainedAssetReferences()){const read=managed.retainedAssetReferences();managed.checkRetainedAssetReferences(read);}
// @ts-expect-error Retained-reference reads are not shared mutation commands.
shared.dispatch({commands:[{kind:"retained_asset_references"}]});
// @ts-expect-error Paired native binding generations remain exact strings.
const badBinding:RichRetainedAssetReference={asset:"asset",generation:2};void badBinding;
// @ts-expect-error Parsed read metadata is immutable, including nested counts.
source.counts.words="2";
// @ts-expect-error Counts stay exact decimal strings, not JavaScript floats.
const numeric:number=source.counts.utf16Units;
// @ts-expect-error Outline entries retain immutable native source data.
source.outline[0]!.block="changed";
// @ts-expect-error Native writing reads are not original execute commands.
core.execute({kind:"writingTools"});
// @ts-expect-error Native writing reads do not widen the shared dispatch union.
shared.dispatch({commands:[{kind:"writing_tools"}]});
// @ts-expect-error Outline navigation indices are numbers, not coerced strings.
void panel.selectHeading("0");
