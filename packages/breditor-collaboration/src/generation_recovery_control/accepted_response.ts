/** Exact selection/request binding and closed native payload envelope. This
 * parser never substitutes JavaScript AST state for Rust admission. */
import {archiveFields as object} from '../archive_integrity/policy.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {frame} from '../relay/validation.js';
import {generationControlSelection} from './identity.js';
import {controlFailure as fail} from './policy.js';
import {readAcceptedReviewPage} from './accepted_review_page.js';
import type {SharedServerLogGenerationRecoveryControlSelection} from './contract.js';
import type {SharedServerLogGenerationRecoveryAcceptedRequest,SharedServerLogGenerationRecoveryAcceptedRead} from './accepted_contract.js';
export function readGenerationAcceptedNative(text:string,expected:SharedServerLogGenerationRecoveryControlSelection,sha256:string,request:SharedServerLogGenerationRecoveryAcceptedRequest):SharedServerLogGenerationRecoveryAcceptedRead {
 try{const r=object(JSON.parse(text),'format,formatVersion,selection,requestSha256,scope,documentFrame,review');if(r['format']!=='breditor/server-log-generation-recovery-accepted-native-read'||r['formatVersion']!==1||r['scope']!=='selected-server-accepted-native-page'||r['requestSha256']!==sha256)throw fail();const selection=generationControlSelection(r['selection']);if(JSON.stringify(selection)!==JSON.stringify(expected))throw fail();let documentFrame:string|null=null;if(request.document==='include'){documentFrame=frame(r['documentFrame']);if(!documentFrame)throw fail();}else if(r['documentFrame']!==null)throw fail();const review=readAcceptedReviewPage(r['review'],request.review),result:SharedServerLogGenerationRecoveryAcceptedRead={format:'breditor/server-log-generation-recovery-accepted-native-read',formatVersion:1,selection,requestSha256:sha256,scope:'selected-server-accepted-native-page',documentFrame,review};if(JSON.stringify(result)!==text)throw fail();return frozen(result);}catch{throw fail('control_protocol');}
}
