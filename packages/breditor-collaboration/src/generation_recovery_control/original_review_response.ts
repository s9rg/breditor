/** Canonical whole-request coverage. A missing range cannot become partial native authority. */
import {controlFailure as fail} from './policy.js';
import {generationControlSelection} from './identity.js';
import {reviewSource,reviewBinding} from '../relay/review_validation.js';
import {decimal,digest} from '../relay/validation.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {generationOriginalReviewFields as fields,generationOriginalReviewRows as rows,generationOriginalReviewRange,generationOriginalReviewChoices} from './original_review_request.js';
import type {GenerationOriginalReviewQuery,GenerationOriginalReviewRead,GenerationOriginalReviewAuthorizations,GenerationOriginalReviewWindow,GenerationOriginalReviewPending} from './original_review_contract.js';
import type {SharedServerLogGenerationRecoveryControlSelection} from './contract.js';
function window(value:unknown):GenerationOriginalReviewWindow{
 const r=fields(value,['source','from','through','prefixDigest']),source=fields(r['source'],['actor','principal','role']),policy=reviewSource(source),range=generationOriginalReviewRange({actor:policy.actor,principal:policy.principal,from:r['from'],through:r['through']});
 return{source:{actor:policy.actor,principal:policy.principal,role:source['role'] as 'comment'|'moderator'},from:range.from,through:range.through,prefixDigest:digest(r['prefixDigest'])};
}
function admit(input:unknown,query:GenerationOriginalReviewQuery):GenerationOriginalReviewAuthorizations{
 const r=fields(input,['format','formatVersion','descriptor','ranges','kind','windows','pending']),d=fields(r['descriptor'],['format','formatVersion','binding']);
 if(r['format']!=='breditor/relay-review-original-authorizations'||r['formatVersion']!==1||d['format']!=='breditor/relay-review'||d['formatVersion']!==1||reviewBinding(d['binding'])!==query.binding)throw fail();
 const ranges=generationOriginalReviewChoices({binding:query.binding,ranges:r['ranges']}).ranges;if(JSON.stringify(ranges)!==JSON.stringify(query.ranges))throw fail();
 const windows=rows(r['windows'],4096).map(window),pending=rows(r['pending'],1024).map(value=>{const p=fields(value,['range','acceptedThrough','reason']),range=generationOriginalReviewRange(p['range']),acceptedThrough=decimal(p['acceptedThrough']),reason=p['reason'];if(reason!=='unknownActor'&&reason!=='observer'&&reason!=='unaccepted'||reason==='unaccepted'&&BigInt(acceptedThrough)>=BigInt(range.through)||reason!=='unaccepted'&&acceptedThrough!=='0')throw fail();return{range,acceptedThrough,reason} as GenerationOriginalReviewPending;});
 const kind=r['kind'];if(kind==='covered'){
  if(pending.length)throw fail();let i=0;for(const range of ranges){let next=BigInt(range.from);let previous:GenerationOriginalReviewWindow|undefined;while(next<=BigInt(range.through)){const w=windows[i++];if(!w||w.source.actor!==range.actor||w.source.principal!==range.principal||BigInt(w.from)!==next||BigInt(w.through)>BigInt(range.through)||previous?.source.role===w.source.role)throw fail();next=BigInt(w.through)+1n;previous=w;} }if(i!==windows.length)throw fail();
 }else if(kind==='pending'){
  if(windows.length||!pending.length)throw fail();let previous=-1;for(const p of pending){const index=ranges.findIndex(range=>JSON.stringify(range)===JSON.stringify(p.range));if(index<=previous)throw fail();previous=index;}
 }else throw fail();
 return{format:'breditor/relay-review-original-authorizations',formatVersion:1,descriptor:{format:'breditor/relay-review',formatVersion:1,binding:query.binding},ranges,kind,windows,pending};
}
export function readGenerationOriginalReviewResponse(text:string,expected:SharedServerLogGenerationRecoveryControlSelection,sha256:string,query:GenerationOriginalReviewQuery):GenerationOriginalReviewRead{
 try{const r=fields(JSON.parse(text),['format','formatVersion','selection','requestSha256','scope','authorizations']);if(r['format']!=='breditor/server-log-generation-review-original-authorizations-read'||r['formatVersion']!==1||r['requestSha256']!==sha256||r['scope']!=='selected-server-original-review-acceptance')throw fail();const selection=generationControlSelection(r['selection']);if(JSON.stringify(selection)!==JSON.stringify(expected))throw fail();const result:GenerationOriginalReviewRead={format:'breditor/server-log-generation-review-original-authorizations-read',formatVersion:1,selection,requestSha256:sha256,scope:'selected-server-original-review-acceptance',authorizations:admit(r['authorizations'],query)};if(JSON.stringify(result)!==text)throw fail();return frozen(result);}catch{throw fail('control_protocol');}
}
