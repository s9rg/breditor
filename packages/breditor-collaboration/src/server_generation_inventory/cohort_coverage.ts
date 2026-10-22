/** A separately tagged cohort, with no implicit choice between retained copies.
 * Prefix coverage does not prove assets/providers, current grants or activation. */
import {SharedParticipantBackup} from '../participant_backup/archive.js';
import {SharedGenerationParticipantBackup} from '../generation_participant/backup.js';
import {readPairedBackupRecord} from '../backups/paired.js';
import {checkInventorySources} from '../room_participant_inventory/coverage.js';
import {checkInventoryGenerationSources} from '../room_participant_inventory/generation_coverage.js';
import {snapshotInventoryInputs} from '../room_participant_inventory/input_snapshot.js';
import {checkIndependentInventorySources} from '../room_participant_inventory/independent_coverage.js';
import {bindIndependentPrefixSource, readBoundIndependentPrefix, type IndependentInventorySource, type RestoredGraphInventorySource} from '../room_participant_inventory/independent_source.js';
import {SharedRoomParticipantInventoryError, frozen} from '../room_participant_inventory/policy.js';
import type {SharedRoomParticipantInventoryMetadata, SharedRoomParticipantCoverage, SharedRoomParticipantMissing} from '../room_participant_inventory/types.js';
import type {SharedServerLogGenerationParticipantSource, SharedServerLogGenerationCohortSource} from './contract.js';

export type OperationalPhysicalCohortSource = SharedServerLogGenerationCohortSource | RestoredGraphInventorySource;
const originalSelection = SharedParticipantBackup.prototype.selection, originalRecords = SharedParticipantBackup.prototype.records;
const generationSelection = SharedGenerationParticipantBackup.prototype.selection;
const fail = () => new SharedRoomParticipantInventoryError('inventory_source', 'Select genuine explicitly tagged cohort sources; no family is inferred from metadata');
const duplicate = () => new SharedRoomParticipantInventoryError('inventory_duplicate', 'Reconcile duplicate writer or review actor copies explicitly; no copy was selected or discarded');
const key = (row: SharedRoomParticipantMissing) => row.kind === 'document' ? 'document:' + row.writer : row.kind === 'review' ? 'review:' + row.actor : 'unbound:' + row.participant + ':' + row.actor;
const publicFamilies = ['original', 'generation', 'independent-local', 'independent-delivery'] as const;
const operationalFamilies = [...publicFamilies, 'restored-graph'] as const;

function snapshot(input: readonly OperationalPhysicalCohortSource[], families: readonly OperationalPhysicalCohortSource['family'][]): OperationalPhysicalCohortSource[] {
 return snapshotInventoryInputs(input,fail,row=>{
  const family = row.family;
  if (!families.includes(family!) || !row || Object.keys(row).sort().join(',') !== 'backup,family,source') throw fail();
  return {family, backup: row.backup, source: row.source} as OperationalPhysicalCohortSource;
 });
}
/** The public wider reader does not acquire private graph-read scopes implicitly. */
export function checkPhysicalSourceCohort(metadata: SharedRoomParticipantInventoryMetadata, input: readonly SharedServerLogGenerationCohortSource[]): SharedRoomParticipantCoverage {
 return checkOperationalPhysicalSourceCohort(metadata, snapshot(input, publicFamilies));
}
/** Internal operational room coordinators supply actual already-held graph borrows. */
export function checkOperationalPhysicalSourceCohort(metadata: SharedRoomParticipantInventoryMetadata, input: readonly OperationalPhysicalCohortSource[]): SharedRoomParticipantCoverage {
 const rows = snapshot(input, operationalFamilies);
 const original = rows.filter((row): row is Extract<SharedServerLogGenerationParticipantSource, {family: 'original'}> => row.family === 'original');
 const generation = rows.filter((row): row is Extract<SharedServerLogGenerationParticipantSource, {family: 'generation'}> => row.family === 'generation');
 const independent = rows.filter((row): row is IndependentInventorySource => row.family !== 'original' && row.family !== 'generation');
 const run = () => [checkInventorySources(metadata, original), checkInventoryGenerationSources(metadata, generation), checkIndependentInventorySources(metadata, independent)];
 const results = run(), writers = new Set<string>(), actors = new Set<string>();
 for (const result of results) for (const row of result.checkedParticipants) {
  if (writers.has(row.writer)) throw duplicate();
  writers.add(row.writer);
 }
 for (const row of rows) {
  let actor: string | undefined;
  if (row.family === 'original') {
   const paired = originalRecords.call(row.backup).find(record => record.kind === 'paired-session');
   if (paired) actor = readPairedBackupRecord(paired.json, originalSelection.call(row.backup).identity.source).reviewActor;
  } else if (row.family === 'generation') actor = generationSelection.call(row.backup).identity.source.review?.actor;
  else actor = readBoundIndependentPrefix(bindIndependentPrefixSource(row)).history.review.actor;
  if (actor !== undefined) { if (actors.has(actor)) throw duplicate(); actors.add(actor); }
 }
 const maps = results.map(result => new Map(result.missing.filter(row => row.kind !== 'unbound_review').map(row => [key(row), row])));
 const missing: SharedRoomParticipantMissing[] = [];
 for (const row of results[0]!.missing) if (row.kind !== 'unbound_review' && maps.every(map => map.has(key(row)))) {
  const candidates = maps.map(map => map.get(key(row))!);
  missing.push(candidates.find(candidate => candidate.reason === 'server_ahead') ?? row);
 }
 const registeredStreamsCovered = missing.length === 0;
 for (const result of results) missing.push(...result.missing.filter(row => row.kind === 'unbound_review'));
 run();
 return frozen({kind: missing.length ? 'pending' : 'covered', registeredStreamsCovered, checkedParticipants: results.flatMap(result => result.checkedParticipants), missing});
}
