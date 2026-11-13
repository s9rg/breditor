/** Exact native comment-file framing shared by the explicitly versioned paired stores. */
import {SharedEditorError} from '../core.js';
import {object,segmentedDigest} from '../persistence/segmented_checkpoint.js';
import type {IndependentHistoryFile} from './contract.js';

type ReviewArchiveIdentity={native:{room:string};review:{actor:string;principal:string}};
const bytes=(input:string)=>new TextEncoder().encode(input).byteLength;
const fail=()=>new SharedEditorError('independent_history_cut','Native histories differ from their explicitly selected paired-storage identity or bounds');
const generation=(input:unknown):input is string=>typeof input==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(input);
export function checkOriginalReview(input:string,identity:ReviewArchiveIdentity):number {
 if(typeof input!=='string'||bytes(input)>16*1024*1024)throw fail();
 const header=JSON.parse(input) as {format?:unknown;formatVersion?:unknown;actor?:unknown;principal?:unknown;binding?:{document?:unknown};events?:unknown};
 if(!header||header.format!=='breditor/review-session'||header.formatVersion!==1||header.actor!==identity.review.actor||header.principal!==identity.review.principal||header.binding?.document!==identity.native.room||!Array.isArray(header.events)||header.events.length>8192)throw fail();
 return header.events.length;
}
interface ReviewArchive {format:'breditor/review-segmented-history-session';formatVersion:1|2;rootGeneration:string;root:string;sealed:string[];active:string;continuedAfter?:number}
function reviewSegment(input:string,eventLimit:number):{generation:string;parentGeneration:string;parentSha256:string;eventOffset:number;events:unknown[]}{
 if(typeof input!=='string'||bytes(input)>16*1024*1024)throw fail();const value=object(JSON.parse(input),'cursor,eventOffset,events,format,formatVersion,generation,history,parentGeneration,parentSha256');
 if(value['format']!=='breditor/review-history-segment'||value['formatVersion']!==1||!generation(value['generation'])||!generation(value['parentGeneration'])||typeof value['parentSha256']!=='string'||! /^sha256:[a-f0-9]{64}$/.test(value['parentSha256'])||!Number.isSafeInteger(value['eventOffset'])||Number(value['eventOffset'])<0||!Array.isArray(value['events'])||value['events'].length>8192||!Array.isArray(value['history'])||value['history'].length>eventLimit||!Number.isSafeInteger(value['cursor'])||Number(value['cursor'])<0||Number(value['cursor'])>value['history'].length)throw fail();
 return value as unknown as ReturnType<typeof reviewSegment>;
}
async function reviewDigest(input:string):Promise<string>{return 'sha256:'+await segmentedDigest('breditor/review-history-file/1\0'+input);}

export async function splitReviewArchive(input:string,identity:ReviewArchiveIdentity,version:1|2){
 const continued=version===2;
 if(typeof input!=='string'||bytes(input)>(continued?256:64)*1024*1024)throw fail();
 const a=object(JSON.parse(input),continued?'active,continuedAfter,format,formatVersion,root,rootGeneration,sealed':'active,format,formatVersion,root,rootGeneration,sealed') as unknown as ReviewArchive;
 if(a.format!=='breditor/review-segmented-history-session'||a.formatVersion!==version||!generation(a.rootGeneration)||typeof a.root!=='string'||!Array.isArray(a.sealed)||a.sealed.length>(continued?254:62)||a.sealed.some(file=>typeof file!=='string')||typeof a.active!=='string')throw fail();
 const boundary=a.continuedAfter;
 if(continued&&(boundary===undefined||!Number.isSafeInteger(boundary)||boundary<1||boundary>63||boundary>a.sealed.length))throw fail();
 let offset=checkOriginalReview(a.root,identity);
 if(joinReviewArchive(version,a.rootGeneration,a.root,a.sealed,a.active,boundary)!==input)throw fail();
 const files:IndependentHistoryFile[]=[{lane:'review',generation:a.rootGeneration,kind:'root',sha256:await reviewDigest(a.root),json:a.root}];
 const ids=new Set([a.rootGeneration]);
 let parent=files[0]!;
 for(const [index,json]of [...a.sealed,a.active].entries()){
  const eventLimit=boundary!==undefined&&index>=boundary?262144:65536;
  const segment=reviewSegment(json,eventLimit);
  if(ids.has(segment.generation)||segment.parentGeneration!==parent.generation||segment.parentSha256!==parent.sha256||segment.eventOffset!==offset||index<a.sealed.length&&index+1!==boundary&&segment.events.length===0)throw fail();
  ids.add(segment.generation);
  offset+=segment.events.length;
  if(offset>eventLimit)throw fail();
  const file:IndependentHistoryFile={lane:'review',generation:segment.generation,kind:'sealed',sha256:await reviewDigest(json),json};
  parent=file;
  if(index<a.sealed.length)files.push(file);
 }
 return{files,root:{generation:files[0]!.generation,sha256:files[0]!.sha256},sealed:files.slice(1).map(({generation,sha256})=>({generation,sha256})),active:a.active,continuedAfter:boundary};
}
export function joinReviewArchive(version:1|2,rootGeneration:string,root:string,sealed:readonly string[],active:string,continuedAfter?:number):string{
 return JSON.stringify({format:'breditor/review-segmented-history-session',formatVersion:version,rootGeneration,root,sealed,active,...(version===2?{continuedAfter}:{})});
}
