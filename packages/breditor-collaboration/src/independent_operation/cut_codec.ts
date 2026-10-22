/** Exact complete cuts, including immutable native files. Hashes alone cannot replay a pending save. */
import type {IndependentHistoryCut,IndependentHistoryHead,IndependentHistoryStoredCut,IndependentHistoryFile} from '../independent_history/contract.js';
import {makeIndependentHistoryCut,joinIndependentHistoryLane} from '../independent_history/cut.js';
import {segmentedDigest} from '../persistence/segmented_checkpoint.js';
import {generationFields} from '../generation_source/identity.js';
import {operationJournalFailure as fail} from './journal_failure.js';
const sameFile=(raw:unknown,file:IndependentHistoryFile)=>generationFields(raw,'lane,generation,kind,sha256,json')&&raw['lane']===file.lane&&raw['generation']===file.generation&&raw['kind']===file.kind&&raw['sha256']===file.sha256&&raw['json']===file.json;
export function sameOperationCut(raw:unknown,cut:IndependentHistoryCut):boolean{
 return generationFields(raw,'head,files')&&raw['head']===cut.head&&Array.isArray(raw['files'])&&raw['files'].length===cut.files.length&&raw['files'].every((file,index)=>sameFile(file,cut.files[index]!));
}
export async function readOperationCut(raw:unknown,readHead:(head:string)=>IndependentHistoryHead):Promise<IndependentHistoryStoredCut>{
 if(!generationFields(raw,'head,files')||typeof raw['head']!=='string'||!Array.isArray(raw['files'])||raw['files'].length>126)throw fail();
 for(const file of raw['files'])if(!generationFields(file,'lane,generation,kind,sha256,json')||!['document','review'].includes(String(file['lane']))||!['root','sealed'].includes(String(file['kind']))||typeof file['generation']!=='string'||!file['generation']||file['generation'].length>1024||typeof file['sha256']!=='string'||typeof file['json']!=='string'||new TextEncoder().encode(file['json']).length>16*1024*1024)throw fail();
 const input=raw as unknown as IndependentHistoryCut,record=readHead(input.head),documentCheckpoint=joinIndependentHistoryLane(record,'document',input.files),reviewCheckpoint=joinIndependentHistoryLane(record,'review',input.files);
 const native=await makeIndependentHistoryCut(documentCheckpoint,reviewCheckpoint,record.identity,record.versions),cut={head:input.head,files:native.files};
 if(native.head!==JSON.stringify(record)||!sameOperationCut(raw,cut))throw fail();return{...cut,record,documentCheckpoint,reviewCheckpoint};
}
/** Domain-separated hashes cover exact ordered strings without concatenating two large checkpoints. */
export async function operationCutDigest(cut:IndependentHistoryCut):Promise<string>{
 const head=await segmentedDigest('breditor/operation-cut-head/1\0'+cut.head),files:string[]=[];
 for(const file of cut.files)files.push(await segmentedDigest('breditor/operation-cut-file/1\0'+JSON.stringify(file)));
 return segmentedDigest('breditor/operation-cut/1\0'+JSON.stringify([head,files]));
}
export const copyOperationCut=(cut:IndependentHistoryCut):IndependentHistoryCut=>({head:cut.head,files:cut.files.map(file=>({...file}))});
