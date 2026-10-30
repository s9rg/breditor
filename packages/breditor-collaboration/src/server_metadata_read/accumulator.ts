/** Derived comparison views only. Original native pages and packet fingerprints
 * remain unchanged in the collected DATA. No queue, role or receipt is installed. */
import {versionEntry} from '../versions/validation.js';
import {publication,decision} from '../suggestions/validation.js';
import {revisionReceipt} from '../suggestion_revisions/transport.js';
import {frozen} from '../room_participant_inventory/policy.js';
import type {SharedDocumentVersionEntry} from '../versions/types.js';
import type {SharedSuggestionPublication,SharedSuggestionDecision} from '../suggestions/types.js';
import type {SharedSuggestionRevisionReceipt} from '../suggestion_revisions/types.js';
import type {OriginalMetadataPage,OriginalPacketFingerprint} from './contract.js';
import {fail} from './policy.js';
export interface OriginalMetadataIndex {
 readonly versions:readonly SharedDocumentVersionEntry[];readonly publications:readonly SharedSuggestionPublication[];
 readonly decisions:readonly SharedSuggestionDecision[];readonly revisions:readonly SharedSuggestionRevisionReceipt[];
 readonly fingerprints:Readonly<{versions:readonly OriginalPacketFingerprint[];suggestions:readonly OriginalPacketFingerprint[];revisions:readonly OriginalPacketFingerprint[]}>;
}
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export class OriginalMetadataAccumulator {
 readonly #versions=new Map<string,SharedDocumentVersionEntry>();readonly #publications=new Map<string,SharedSuggestionPublication>();readonly #decisions=new Map<string,SharedSuggestionDecision>();readonly #revisions=new Map<string,SharedSuggestionRevisionReceipt>();
 readonly #parents=new Set<string>();readonly #children=new Map<string,string>();
 readonly #descriptors=new Map<string,string>();readonly #permissions=new Map<string,string>();
 readonly #packets={versions:new Map<string,OriginalPacketFingerprint>(),suggestions:new Map<string,OriginalPacketFingerprint>(),revisions:new Map<string,OriginalPacketFingerprint>()};
 accept(page:OriginalMetadataPage):void{
  for(const name of ['versions','suggestions','revisions'] as const){const lane=page[name];if(lane.kind==='disabled')continue;const descriptor=JSON.stringify(lane.catalog.descriptor),previous=this.#descriptors.get(name);if(previous!==undefined&&previous!==descriptor)throw fail();this.#descriptors.set(name,descriptor);if('permissions'in lane.catalog){const permissions=JSON.stringify(lane.catalog.permissions),prior=this.#permissions.get(name);if(prior!==undefined&&prior!==permissions)throw fail();this.#permissions.set(name,permissions);}for(const packet of lane.packets){if(this.#packets[name].has(packet.id))throw fail();this.#packets[name].set(packet.id,packet);}}
  if(page.versions.kind==='page')for(const raw of page.versions.catalog.entries){const entry=versionEntry(raw);if(this.#versions.size>=1024||this.#versions.has(entry.version.id))throw fail();this.#versions.set(entry.version.id,entry);}
  if(page.suggestions.kind==='page'){const {effectWriter}=page.suggestions.catalog.descriptor;for(const update of page.suggestions.catalog.updates){if(update.kind==='published'){const row=publication(update.data);if(this.#publications.size>=1024||this.#publications.has(row.suggestion.id))throw fail();this.#publications.set(row.suggestion.id,row);}else{const row=decision(update.data,{effectWriter}),published=this.#publications.get(row.suggestionId);if(!published||this.#decisions.has(row.suggestionId)||BigInt(row.sequence)<=BigInt(published.sequence))throw fail();this.#decisions.set(row.suggestionId,row);}}}
  if(page.revisions.kind==='page'){if(page.suggestions.kind!=='page')throw fail();const {effectWriter}=page.suggestions.catalog.descriptor;for(const raw of page.revisions.catalog.revisions){const row=revisionReceipt(raw,{effectWriter}),previous=row.revision.previousSuggestionId,child=row.revision.suggestion.id;if(this.#revisions.size>=1023||this.#revisions.has(row.revision.id)||this.#parents.has(previous)||this.#children.has(child)||row.rootSuggestionId!==(this.#children.get(previous)??previous))throw fail();this.#parents.add(previous);this.#children.set(child,row.rootSuggestionId);this.#revisions.set(row.revision.id,row);}}
 }
 finish():OriginalMetadataIndex {
  // Each committed relation must also be present, unchanged, in the complete
  // original proposal/decision feed. A valid-looking counter alone is insufficient.
  for(const row of this.#revisions.values())if(!same(this.#decisions.get(row.revision.previousSuggestionId),row.previousDecision)||!same(this.#publications.get(row.revision.suggestion.id),row.publication))throw fail();
  return frozen({versions:[...this.#versions.values()],publications:[...this.#publications.values()],decisions:[...this.#decisions.values()],revisions:[...this.#revisions.values()],fingerprints:{versions:[...this.#packets.versions.values()],suggestions:[...this.#packets.suggestions.values()],revisions:[...this.#packets.revisions.values()]}});
 }
}
