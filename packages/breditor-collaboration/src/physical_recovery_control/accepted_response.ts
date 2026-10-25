/** Exact selection/request binding and closed native payload envelope. This
 * parser never substitutes JavaScript AST state for Rust admission. */
import {archiveFields as object} from '../archive_integrity/policy.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {frame} from '../relay/validation.js';
import {physicalControlSelection} from './identity.js';
import {controlFailure as fail} from './policy.js';
import {readAcceptedReviewPage} from './accepted_review_page.js';
import type {SharedPhysicalRecoveryControlSelection} from './contract.js';
import type {SharedPhysicalRecoveryAcceptedRequest,SharedPhysicalRecoveryAcceptedRead} from './accepted_contract.js';
export function readPhysicalAcceptedNative(text:string,expected:SharedPhysicalRecoveryControlSelection,sha256:string,request:SharedPhysicalRecoveryAcceptedRequest):SharedPhysicalRecoveryAcceptedRead {
 try{const r=object(JSON.parse(text),'format,formatVersion,selection,requestSha256,scope,documentFrame,review');if(r['format']!=='breditor/physical-room-recovery-accepted-native-read'||r['formatVersion']!==1||r['scope']!=='selected-server-accepted-native-page'||r['requestSha256']!==sha256)throw fail();const selection=physicalControlSelection(r['selection']);if(JSON.stringify(selection)!==JSON.stringify(expected))throw fail();let documentFrame:string|null=null;if(request.document==='include'){documentFrame=frame(r['documentFrame']);if(!documentFrame)throw fail();}else if(r['documentFrame']!==null)throw fail();const review=readAcceptedReviewPage(r['review'],request.review),result:SharedPhysicalRecoveryAcceptedRead={format:'breditor/physical-room-recovery-accepted-native-read',formatVersion:1,selection,requestSha256:sha256,scope:'selected-server-accepted-native-page',documentFrame,review};if(JSON.stringify(result)!==text)throw fail();return frozen(result);}catch{throw fail('control_protocol');}
}
