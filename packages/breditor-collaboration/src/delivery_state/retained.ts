/** Shared original retained-record rules. Native history/storage family selection remains outside. */
import {closed} from '../segmented_relay/validation.js';
import {SharedRelayError} from '../relay/validation.js';
import {queueIdentity} from '../suggestions/validation.js';
import {versionIdentity} from '../versions/validation.js';
import {revisionsBinding} from '../suggestion_revisions/transport.js';
import {checkQueueRecord} from '../suggestions/database.js';
import {checkRevisionRecord} from '../suggestion_revisions/database.js';
import {checkCatalogRecord} from '../versions/database.js';
import {checkSuggestionSourcePolicy,admitSuggestionRecord} from '../suggestions/record_admission.js';
import {admitRevisionRecord} from '../suggestion_revisions/record_admission.js';
import {admitVersionRecord} from '../versions/record_admission.js';
import type {SharedRichEditor} from '../core.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedReviewedHistoryIdentity} from '../reviewed_history_types.js';
import type {SharedSegmentedRelayBinding} from '../segmented_relay/contract.js';
import type {SharedSegmentedRetainedBinding,SegmentedRetainedRecords} from '../segmented_relay/retained_contract.js';

export function deliveryRetainedBinding(b:SharedSegmentedRetainedBinding,relay:SharedSegmentedRelayBinding,reviewed:SharedReviewedHistoryIdentity|null):SharedSegmentedRetainedBinding{
 closed(b,'revisions,suggestions,versions');
 if(b.suggestions!==null)closed(b.suggestions,'identity,ownedHistory');if(b.revisions!==null)closed(b.revisions,'binding');
 if(b.suggestions!==null)closed(b.suggestions.identity,'binding,documentWriter,effectWriter,endpoint,principal,room,writerTransport');
 if(b.versions!==null)closed(b.versions,b.versions.writerTransport===undefined?'binding,documentWriter,endpoint,principal,room':'binding,documentWriter,endpoint,principal,room,writerTransport');
 const suggestions=b.suggestions===null?null:{identity:queueIdentity(b.suggestions.identity),ownedHistory:b.suggestions.ownedHistory};
 if(suggestions&&suggestions.ownedHistory!==null&&suggestions.ownedHistory!=='reviewed-v1')throw new SharedRelayError('segmented_retained_binding');
 const revisions=b.revisions===null?null:revisionsBinding(b.revisions),versions=b.versions===null?null:versionIdentity(b.versions),d=relay.document;
 for(const identity of [suggestions?.identity,versions])if(identity&&(identity.endpoint!==d.endpoint||identity.principal!==d.principal||identity.room!==d.room||identity.documentWriter!==d.writer||identity.writerTransport!==d.writerTransport))throw new SharedRelayError('segmented_retained_binding');
 if(revisions&&!suggestions||suggestions&&(suggestions.ownedHistory==='reviewed-v1')!==!!reviewed||suggestions?.ownedHistory==='reviewed-v1'&&(reviewed?.binding!==suggestions.identity.binding||reviewed.effectWriter!==suggestions.identity.effectWriter))throw new SharedRelayError('segmented_retained_binding');
 return{suggestions,revisions,versions};
}
export function emptyDeliveryRetainedRecords(b:SharedSegmentedRetainedBinding):SegmentedRetainedRecords{
 return{suggestions:b.suggestions?{format:b.suggestions.ownedHistory?'breditor/shared-owned-suggestion-queue':'breditor/shared-suggestion-queue',formatVersion:1,identity:b.suggestions.identity,retained:[]}:null,revisions:b.revisions?{format:'breditor/shared-suggestion-revisions',formatVersion:1,identity:b.suggestions!.identity,binding:b.revisions.binding,retained:[]}:null,versions:b.versions?{format:'breditor/shared-version-catalog-cache',formatVersion:1,identity:b.versions,catalog:null,packets:[]}:null};
}
export function deliveryRetainedRecords(input:unknown,b:SharedSegmentedRetainedBinding):SegmentedRetainedRecords{
 const r=closed(input,'revisions,suggestions,versions');for(const kind of ['suggestions','revisions','versions'] as const)if((r[kind]!==null)!==(b[kind]!==null))throw new SharedRelayError('segmented_retained_binding');
 return{suggestions:b.suggestions?checkQueueRecord(r['suggestions'],b.suggestions.identity,b.suggestions.ownedHistory??undefined):null,revisions:b.revisions?checkRevisionRecord(r['revisions'],b.suggestions!.identity,b.revisions.binding):null,versions:b.versions?checkCatalogRecord(r['versions'],b.versions):null};
}
export function admitDeliveryRetainedRecords<P extends SharedSelectionPolicy>(core:SharedRichEditor<P>,b:SharedSegmentedRetainedBinding,r:SegmentedRetainedRecords):void{
 if(r.suggestions){checkSuggestionSourcePolicy(core,r.suggestions.identity,b.suggestions!.ownedHistory??undefined);admitSuggestionRecord(core,r.suggestions,b.suggestions!.ownedHistory??undefined);}
 if(r.revisions){if(!core.supportsSuggestionRevisions())throw new SharedRelayError('suggestion_revisions_unavailable');admitRevisionRecord(core,r.revisions);}
 if(r.versions){if(!core.supportsVersionSourceProofs())throw new SharedRelayError('version_source_unavailable');admitVersionRecord(core,r.versions);}
}
