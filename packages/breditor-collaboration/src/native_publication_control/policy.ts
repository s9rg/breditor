/** Publication has its own refusal/uncertainty domain; no automatic retry. */
import {preserveReadObservations} from '../archive_integrity/preserve_read_observations.js';
export const MAX_SHARED_NATIVE_PUBLICATION_CONTROL_BYTES=64*1024;
export class SharedNativePublicationError extends Error {
 constructor(readonly code:'publication_policy'|'publication_protocol'|'publication_closed'|'publication_busy'|'publication_authority'|'publication_cancelled'|'publication_transfer'|'publication_outcome_unknown',message:string){super(message);this.name='SharedNativePublicationError';}
}
export function publicationFailure(code:SharedNativePublicationError['code']='publication_protocol',reported?:unknown):SharedNativePublicationError {
 const outcome=new SharedNativePublicationError(code,{
  publication_policy:'Select the actual separate publication control and a retained complete joint descriptor',
  publication_protocol:'The complete publication observation differs from the selected control and joint association',
  publication_closed:'This publication requester is closed or was not constructed by this SDK',
  publication_busy:'This publication requester already owns an actual request',
  publication_authority:'Current publication authority did not hold before submission',
  publication_cancelled:'Publication was cancelled before submission',
  publication_transfer:'Publication did not begin its HTTP request',
  publication_outcome_unknown:'The actual Native service may be published; retain joint intent and resolve against the same held control'
 }[code]);return code==='publication_outcome_unknown'?preserveReadObservations(outcome,reported):outcome;
}
export function publicationEndpoint(value:unknown):string {
 try{if(typeof value!=='string'||value.length>2048)throw 0;const url=new URL(value);
  if(url.username||url.password||url.search||url.hash||!url.pathname.endsWith('/recovery/native-publication/v1/publish')||url.protocol!=='https:'&&(url.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw 0;
  return url.href;
 }catch{throw publicationFailure('publication_policy');}
}
