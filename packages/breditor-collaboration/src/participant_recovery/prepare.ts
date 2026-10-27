import {inheritActorLeaseInput} from '../persistence/actor_lease_input.js';
import {checkRichAssetLimits} from "@breditor/experimental-rich-content";
import {SharedParticipantBackup} from "../participant_backup/archive.js";
import {participantSelection,participantAuthority} from "../participant_backup/policy.js";
import {queueIdentity} from "../suggestions/validation.js";
import {versionIdentity} from "../versions/validation.js";
import {revisionsBinding} from "../suggestion_revisions/transport.js";
import {reviewStorageIdentity} from "../relay/review_validation.js";
import {reviewedHistoryIdentity} from "../reviewed_history_validation.js";
import {recoveryFailure,SharedParticipantRecoveryError} from "./errors.js";
import type {SharedParticipantRecoveryOptions,SharedParticipantRecoveryStep} from "./types.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {RecoveryRecord} from "./journal.js";
import {retainInternalFailureCause} from "../internal_failure_cause.js";
const name=(v:unknown):v is string=>typeof v==="string"&&v.length>0&&v.length<=200;
/** Snapshot host-selected nonsecret policy before writes; function closures remain host responsibilities. */
export async function prepareRecovery<P extends SharedSelectionPolicy>(supplied:SharedParticipantRecoveryOptions<P>){
 try{
  const input={...supplied},expected=participantSelection(input.expected),actual=SharedParticipantBackup.prototype.selection.call(input.backup);
  SharedParticipantBackup.prototype.file.call(input.backup);if(JSON.stringify(actual)!==JSON.stringify(expected)||!name(input.database))throw recoveryFailure("recovery_policy");
  let authority:()=>void;try{authority=participantAuthority(input.checkAuthority);}catch{throw recoveryFailure("recovery_authority");}
  const guard=()=>{if(input.signal?.aborted)throw recoveryFailure("recovery_aborted");try{authority();}catch(error){throw retainInternalFailureCause(recoveryFailure("recovery_authority"),error);}if(input.signal?.aborted)throw recoveryFailure("recovery_aborted");SharedParticipantBackup.prototype.file.call(input.backup);};guard();
  const destinations=Object.fromEntries(Object.entries(input.destinations).sort(([a],[b])=>a<b?-1:a>b?1:0)) as SharedParticipantRecoveryOptions<P>["destinations"],sources=expected.identity.stores,paired=sources.includes("paired-session"),kind=input.session.kind;
  const options={...input.session.options},raw=options as unknown as Record<string,unknown>;
  if(!["document","document-selection","search-document","paired","reviewed-paired","search-paired"].includes(kind)||paired!==kind.includes("paired"))throw recoveryFailure("recovery_policy");
  const p=expected.identity.source,selection=kind==="document"?"original":kind==="document-selection"?"document-v1":raw["selectionEditing"],search=kind.startsWith("search-")?"search-v1":null;
  if(raw["room"]!==p.room||raw["writer"]!==p.writer||raw["richLanguage"]!==p.richLanguage||raw["history"]!==p.history||raw["rangeEditing"]!==p.rangeEditing||selection!==p.selectionEditing||search!==p.searchHistory)throw recoveryFailure("recovery_policy");
  if("review" in options&&(!options.review||typeof options.review!=="object"||Array.isArray(options.review)||Object.keys(options.review).sort().join(",")!=="access,actor,principal"))throw recoveryFailure("recovery_policy");
  const review="review" in options?Object.freeze({actor:options.review.actor,principal:options.review.principal,access:options.review.access}):undefined,relay="relay" in options&&options.relay?reviewStorageIdentity(options.relay):undefined,owned="reviewedHistory" in options&&options.reviewedHistory?reviewedHistoryIdentity(options.reviewedHistory):undefined;
  if(review&&!["read_only","comment","moderate"].includes(review.access))throw recoveryFailure("recovery_policy");
  if(kind==="paired"&&owned||kind==="reviewed-paired"&&!owned)throw recoveryFailure("recovery_policy");
  if(review&&review.principal!==expected.identity.principal)throw recoveryFailure("recovery_policy");
  if(paired){const record=JSON.parse(input.backup.records().find(r=>r.kind==="paired-session")!.json),format=search?"breditor/shared-search-review-checkpoint-record":owned?"breditor/shared-reviewed-review-checkpoint-record":relay?.reviewEditing==="read_only"?"breditor/shared-review-observer-checkpoint-record":relay?"breditor/shared-review-relay-checkpoint-record":"breditor/shared-review-checkpoint-record";if(record.format!==format||record.reviewActor!==review?.actor||record.principal!==review?.principal||JSON.stringify(record.reviewedHistory??null)!==JSON.stringify(owned??null)||JSON.stringify(record.relay??null)!==JSON.stringify(relay??null))throw recoveryFailure("recovery_policy");}
  const suggestions=input.suggestions?{identity:queueIdentity(input.suggestions.identity),...(input.suggestions.ownedHistory?{ownedHistory:input.suggestions.ownedHistory}:{})}:undefined;
  const revisions=input.revisions?{binding:revisionsBinding({binding:input.revisions.binding}).binding,transport:input.revisions.transport}:undefined;
  const versions=input.versions?{identity:versionIdentity(input.versions.identity),getToken:input.versions.getToken}:undefined;
  if(versions&&typeof versions.getToken!=="function")throw recoveryFailure("recovery_policy");
  for(const [source,present,destination]of [["suggestions",!!suggestions,destinations.suggestions],["suggestion-revisions",!!revisions,destinations.revisions],["version-catalog",!!versions,destinations.versions]] as const)if(sources.includes(source)!==present||present!==!!destination)throw recoveryFailure("recovery_policy");
  if(revisions&&!suggestions||suggestions&&suggestions.identity.principal!==expected.identity.principal||versions&&versions.identity.principal!==expected.identity.principal)throw recoveryFailure("recovery_policy");
  if(Object.keys(destinations).some(k=>!["document","uploads","suggestions","revisions","versions"].includes(k)))throw recoveryFailure("recovery_policy");
  const names=Object.values(destinations);if(!name(destinations.document)||!name(destinations.uploads)||names.some(n=>!name(n))||new Set([input.database,...names]).size!==names.length+1)throw recoveryFailure("recovery_policy");
  const session={kind,options:inheritActorLeaseInput(input.session.options,{...options,...(review?{review}:{}),...(relay?{relay}:{}),...(owned?{reviewedHistory:owned}:{}),...(options.editor?{editor:{...options.editor}}:{})})} as SharedParticipantRecoveryOptions<P>["session"],limits=checkRichAssetLimits(input.limits);
  // Reconstructing envelopes validates dependent policies without touching a destination.
  const records=new Map(input.backup.records().map(r=>[r.kind,r.json]));
  const backups={document:paired?await input.backup.pairedBackup():await input.backup.documentBackup(),suggestions:suggestions?await input.backup.retainedBackup({kind:"suggestions",...suggestions}):undefined,revisions:revisions?await input.backup.retainedBackup({kind:"suggestion-revisions",identity:suggestions!.identity,binding:revisions.binding}):undefined,versions:versions?await input.backup.retainedBackup({kind:"version-catalog",identity:versions.identity}):undefined,uploads:input.backup.uploadBackup()};
  const steps:SharedParticipantRecoveryStep[]=["document",...(suggestions?["suggestions" as const]:[]),...(revisions?["revisions" as const]:[]),...(versions?["versions" as const]:[]),"uploads"];
  const plan=JSON.stringify({selection:expected,destinations,session:{kind,review:review??null,relay:relay??null,reviewedHistory:owned??null},suggestions:suggestions??null,revisions:revisions?.binding??null,versions:versions?.identity??null,limits});
  if(new TextEncoder().encode(plan).length>64*1024)throw recoveryFailure("recovery_policy");
  const record:RecoveryRecord={format:"breditor/shared-participant-recovery",formatVersion:1,plan,phase:"preparing",steps:steps.map(step=>({step,state:"reserved"}))};
  guard();
  return {database:input.database,backup:input.backup,expected,destinations,session,suggestions,revisions,versions,limits,records,backups,record,guard,signal:input.signal};
 }catch(error){if(error instanceof SharedParticipantRecoveryError)throw error;throw retainInternalFailureCause(recoveryFailure("recovery_policy"),error);}
}
export type PreparedRecovery<P extends SharedSelectionPolicy>=Awaited<ReturnType<typeof prepareRecovery<P>>>;
