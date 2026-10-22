/** Native accepted-prefix checks for independently selected document/comment lanes.
 * Local comment histories remain unbound, never silently given delivery identity. */
import {sharedProtocolLanguage} from '../protocol.js';
import {prefixAt, transportVersion} from '../relay/validation.js';
import {checkInventoryStores} from './stores.js';
import {snapshotInventoryInputs} from './input_snapshot.js';
import {SharedRoomParticipantInventoryError, frozen} from './policy.js';
import {bindIndependentPrefixSource, readBoundIndependentPrefix, type IndependentInventorySource} from './independent_source.js';
import type {SharedRoomParticipantInventoryMetadata, SharedRoomParticipantCoverage, SharedRoomParticipantMissing, SharedRoomIndependentParticipantSource} from './types.js';

const sourceError = () => new SharedRoomParticipantInventoryError('inventory_source', 'The genuine independent native pair differs from the selected server inventory');
const fork = () => new SharedRoomParticipantInventoryError('inventory_fork', 'The accepted native prefix differs from this independent history');
const duplicate = () => new SharedRoomParticipantInventoryError('inventory_duplicate', 'Reconcile duplicate writer or review actor copies explicitly; no copy was selected or discarded');
function snapshotSources(input: readonly IndependentInventorySource[], families: readonly IndependentInventorySource['family'][]): IndependentInventorySource[] {
 return snapshotInventoryInputs(input,sourceError,row=>{
  const family = row.family;
  if (!families.includes(family!)) throw sourceError();
  return {family, backup: row.backup, source: row.source} as IndependentInventorySource;
 });
}

/** Separate public-family admission. Private restored-graph captures are not an
 * undocumented third input kind of the public independent reader. */
export function checkInventoryIndependentSources(metadata: SharedRoomParticipantInventoryMetadata, input: readonly SharedRoomIndependentParticipantSource[]): SharedRoomParticipantCoverage {
 const rows = snapshotSources(input, ['independent-local', 'independent-delivery']);
 return checkIndependentInventorySources(metadata, rows);
}

/** Internal operational cohorts additionally admit the actual private graph borrow. */
export function checkIndependentInventorySources(metadata: SharedRoomParticipantInventoryMetadata, input: readonly IndependentInventorySource[]): SharedRoomParticipantCoverage {
 const rows = snapshotSources(input, ['independent-local', 'independent-delivery', 'restored-graph']);
 const sources = rows.map(bindIndependentPrefixSource), documents = new Set<string>(), actors = new Set<string>(), reviews = new Set<string>();
 const behindDocuments = new Set<string>(), behindReviews = new Set<string>(), unbound: SharedRoomParticipantMissing[] = [];
 const checked: SharedRoomParticipantCoverage['checkedParticipants'][number][] = [];
 for (const source of sources) {
  const data = readBoundIndependentPrefix(source), {history, native, principal, participant, binding} = data;
  const document = native.document, review = native.review, writer = history.native.writer, actor = history.review.actor;
  const row = metadata.writers.find(value => value.clock.writer === writer), descriptor = document.descriptor(), wire = metadata.room.writerTransportVersion;
  if (!row || row.principal !== principal || history.native.room !== metadata.room.document || history.native.richLanguage !== metadata.richLanguage ||
      sharedProtocolLanguage(descriptor) !== metadata.richLanguage || descriptor.schemaFingerprint !== metadata.schemaFingerprint ||
      document.kind !== history.documentHistory || document.checkpointJson() !== data.records[0]?.json ||
      review.kind === 'absent' || review.kind === 'unselected' || review.kind !== history.reviewHistory ||
      review.checkpointJson() !== data.records[1]?.json || history.review.principal !== principal || review.localReviewClock().actor !== actor) throw sourceError();
  if (binding && (binding.document.principal !== principal || binding.document.room !== metadata.room.document || binding.document.writer !== writer || transportVersion(binding.document.writerTransport) !== wire)) throw sourceError();
  checkInventoryStores(metadata, data.retained, principal, writer);
  if (documents.has(writer) || actors.has(actor)) throw duplicate();
  documents.add(writer); actors.add(actor);
  const local = wire === 2 ? document.writerClockV2(writer) : document.writerClock(writer);
  if (row.observer && local.through !== '0') throw sourceError();
  if (BigInt(local.through) < BigInt(row.clock.through)) behindDocuments.add(writer);
  else if (prefixAt(document, writer, row.clock.through, wire) !== row.clock.prefixDigest) throw fork();
  checked.push({participant, principal, writer, observer: row.observer, localThrough: local.through, acceptedThrough: row.clock.through});
  if (binding === null) {
   unbound.push({kind: 'unbound_review', participant, principal, actor});
  } else {
   const relay = binding.review, registered = metadata.review?.writers.find(value => value.clock.actor === actor);
   if (!registered || registered.principal !== principal || relay.actor !== actor || relay.principal !== principal || relay.room !== metadata.room.document ||
       relay.documentWriter !== writer || relay.binding !== metadata.review?.binding || transportVersion(relay.writerTransport) !== wire ||
       registered.observer !== (relay.reviewEditing === 'read_only')) throw sourceError();
   reviews.add(actor);
   const head = review.reviewWriterClock(actor, principal);
   if (registered.observer && head.through !== '0') throw sourceError();
   if (BigInt(head.through) < BigInt(registered.clock.through)) behindReviews.add(actor);
   else if (review.reviewWriterClock(actor, principal, registered.clock.through).prefixDigest !== registered.clock.prefixDigest) throw fork();
  }
  readBoundIndependentPrefix(source);
 }
 const missing: SharedRoomParticipantMissing[] = [];
 for (const row of metadata.writers) if (!documents.has(row.clock.writer) || behindDocuments.has(row.clock.writer)) missing.push({kind: 'document', principal: row.principal, writer: row.clock.writer, reason: documents.has(row.clock.writer) ? 'server_ahead' : 'missing'});
 for (const row of metadata.review?.writers ?? []) if (!reviews.has(row.clock.actor) || behindReviews.has(row.clock.actor)) missing.push({kind: 'review', principal: row.principal, actor: row.clock.actor, reason: reviews.has(row.clock.actor) ? 'server_ahead' : 'missing'});
 const registeredStreamsCovered = missing.length === 0;
 missing.push(...unbound);
 for (const source of sources) readBoundIndependentPrefix(source);
 return frozen({kind: missing.length ? 'pending' : 'covered', registeredStreamsCovered, checkedParticipants: checked, missing});
}
