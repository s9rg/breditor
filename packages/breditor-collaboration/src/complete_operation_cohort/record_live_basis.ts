/** Internal comparison only, NOT a stored protocol or native admission. Retain
 * the complete record cut separately: this projection deliberately compares
 * LIVE native/packet work, not committed/pending save acknowledgement phases.
 * It bridges an independently approved full cut to genuine retained clients. */
import {checkRecordCutSource} from '../physical_room_record_cut/manifest.js';
import {generationRecords} from '../generation_source/records.js';
import type {SharedSegmentedRelayProgress} from '../segmented_relay/contract.js';
import type {SegmentedRetainedRecords} from '../segmented_relay/retained_contract.js';
import type {RecordPayloadFamily} from '../operation_read/record_payload.js';
import {retainedNativeReadFailure as fail} from './retained_native_read.js';
const object=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value))throw fail();return value as Record<string,unknown>;};
const text=(value:unknown):string=>{if(typeof value!=='string')throw fail();return value;};
export function recordLiveBasis(family:RecordPayloadFamily,payload:unknown):unknown{
 checkRecordCutSource(payload,family);const source=object(object(payload)['source']);
 if(family==='original'){
  const n=object(source['native']),live=object(n['live']),rows:{kind:string;json:string}[]=[{kind:'document',json:text(live['documentCheckpointJson']??live['checkpoint'])}];
  if(n['format']==='breditor/persistent-paired-record-read')rows.push({kind:'paired-session',json:JSON.stringify(live)});
  if(source['versions']!==null)rows.push({kind:'version-catalog',json:JSON.stringify(object(source['versions'])['live'])});
  const revisions=source['revisions']===null?null:object(source['revisions']),queue=source['suggestions']===null?revisions?object(revisions['queue']):null:object(source['suggestions']);
  if(queue)rows.push({kind:'suggestions',json:JSON.stringify(queue['live'])});if(revisions)rows.push({kind:'suggestion-revisions',json:JSON.stringify(revisions['live'])});return rows;
 }
 if(family==='generation'){
  const live=object(object(source['records'])['live']),review=live['review']===null?null:object(live['review']),versions=live['versions'];if(!Array.isArray(versions)||versions.some(value=>typeof value!=='string'))throw fail();const native={format:'breditor/shared-generation-recovery' as const,formatVersion:1 as const,checkpoint:text(live['checkpoint']),reviewCheckpoint:review===null?null:text(review['checkpoint']),versions:versions as string[]},kind=object(source['identity'])['kind'];
  if(kind==='local')return generationRecords(native);const companion=object(JSON.parse(text(live['companion'])));if(kind==='relay')return generationRecords(native,companion as unknown as SharedSegmentedRelayProgress);if(kind!=='retained')throw fail();return generationRecords(native,object(companion['relay']) as unknown as SharedSegmentedRelayProgress,object(companion['retained']) as unknown as SegmentedRetainedRecords);
 }
 return structuredClone(source['live']);
}
