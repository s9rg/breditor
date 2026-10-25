/** Accepted native payloads from one separately authenticated selected server.
 * They do not bind local comments, change recipient permissions, acknowledge an
 * offline suffix, confer native custody or activate a room. */
import type {SharedPhysicalRecoveryControlSelection} from './contract.js';
import type {SharedReviewRelayCursor,SharedReviewRelayRole} from '../relay/review_types.js';
import type {SharedReviewBatchReceipt} from '../review_types.js';
export const MAX_PHYSICAL_RECOVERY_ACCEPTED_BYTES=16*1024*1024;
export interface SharedPhysicalRecoveryAcceptedRequest {
 readonly document:'include'|'omit';
 readonly review:Readonly<{kind:'absent'}|{kind:'start'}|{kind:'after';cursor:Readonly<SharedReviewRelayCursor>}>;
}
export interface SharedPhysicalRecoveryAcceptedReviewBatch {
 readonly sequence:string;
 /** Historical server-verified source, not the recipient's current role. */
 readonly source:Readonly<{actor:string;principal:string;role:'comment'|'moderator'}>;
 readonly frame:string;readonly receipt:Readonly<SharedReviewBatchReceipt>;
}
export interface SharedPhysicalRecoveryAcceptedReviewPage {
 readonly descriptor:Readonly<{format:'breditor/relay-review';formatVersion:1;binding:string}>;
 readonly cursor:Readonly<SharedReviewRelayCursor>;readonly more:boolean;
 readonly batches:readonly SharedPhysicalRecoveryAcceptedReviewBatch[];
 /** Authenticated SERVER READER role. Never apply this to a recipient client. */
 readonly currentRole:SharedReviewRelayRole;
}
export interface SharedPhysicalRecoveryAcceptedRead {
 readonly format:'breditor/physical-room-recovery-accepted-native-read';readonly formatVersion:1;
 readonly selection:SharedPhysicalRecoveryControlSelection;readonly requestSha256:string;
 readonly scope:'selected-server-accepted-native-page';
 readonly documentFrame:string|null;readonly review:SharedPhysicalRecoveryAcceptedReviewPage|null;
}
