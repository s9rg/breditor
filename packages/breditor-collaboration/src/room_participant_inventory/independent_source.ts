/** Normalize only genuine unchanged native source/backup pairs. The private bound
 * token is not serialized and cannot be replaced with a checked/ready data flag. */
import type {IndependentHistoryIdentity} from '../independent_history/contract.js';
import type {SharedIndependentDeliveryBinding} from '../independent_delivery/contract.js';
import type {SharedAssetCaptureRecord} from '../asset_references_capture.js';
import type {CapturedNativeHistoryRead} from '../native_history_read/contract.js';
import type {SharedRoomIndependentParticipantSource} from './types.js';
import {SharedIndependentParticipantBackup} from '../independent_participant/backup.js';
import {independentSourceSnapshot} from '../independent_source/capture.js';
import {SharedIndependentDeliveryParticipantBackup} from '../independent_delivery_participant/backup.js';
import {independentDeliverySourceSnapshot} from '../independent_delivery_source/capture.js';
import {capturedNativeHistoryRead} from '../native_history_read/registry.js';
import {restoredGraphNativeSource, type RestoredGraphNativeSourceCapture} from '../restored_graph/native_source.js';
import type {RestoredOperationGraphArchive} from '../restored_graph/archive.js';
import {SharedRoomParticipantInventoryError} from './policy.js';

export interface RestoredGraphInventorySource {
 readonly family: 'restored-graph';
 readonly backup: RestoredOperationGraphArchive;
 readonly source: RestoredGraphNativeSourceCapture;
}
export type IndependentInventorySource = SharedRoomIndependentParticipantSource | RestoredGraphInventorySource;
interface PrefixData {
 readonly participant: string;
 readonly principal: string;
 readonly history: IndependentHistoryIdentity;
 readonly binding: SharedIndependentDeliveryBinding | null;
 readonly records: readonly Readonly<{kind: string; index: number; json: string}>[];
 readonly retained: readonly SharedAssetCaptureRecord[];
 readonly native: CapturedNativeHistoryRead;
 readonly check: () => void;
}
declare const brand: unique symbol;
export interface BoundIndependentPrefixSource {readonly [brand]: true}
const states = new WeakMap<BoundIndependentPrefixSource, PrefixData>();
const localVerify = SharedIndependentParticipantBackup.prototype.verifySource;
const localSelection = SharedIndependentParticipantBackup.prototype.selection;
const deliveryVerify = SharedIndependentDeliveryParticipantBackup.prototype.verifySource;
const deliverySelection = SharedIndependentDeliveryParticipantBackup.prototype.selection;
const fail = () => new SharedRoomParticipantInventoryError('inventory_source', 'Use the unchanged genuine independent backup and its selected native source');
function retained(records: PrefixData['records']): readonly SharedAssetCaptureRecord[] {
 return Object.freeze(records.flatMap<SharedAssetCaptureRecord>(row => row.kind === 'suggestions' ? [{kind: 'suggestions', json: row.json}] :
  row.kind === 'revisions' ? [{kind: 'suggestion-revisions', json: row.json}] :
  row.kind === 'versions' ? [{kind: 'version-catalog', json: row.json}] : []).map(row => Object.freeze(row)));
}
export function bindIndependentPrefixSource(input: IndependentInventorySource): BoundIndependentPrefixSource {
 const row = {family: input.family, backup: input.backup, source: input.source} as IndependentInventorySource;
 let data: PrefixData;
 if (row.family === 'independent-local') {
  localVerify.call(row.backup, row.source);
  const selected = localSelection.call(row.backup).identity, capture = independentSourceSnapshot(row.source);
  if (JSON.stringify(capture.metadata.identity) !== JSON.stringify(selected.source)) throw fail();
  const check = () => { localVerify.call(row.backup, row.source); capture.check(); };
  data = {participant: selected.participant, principal: selected.principal, history: selected.source, binding: null,
   records: capture.records, retained: [], native: capturedNativeHistoryRead(row.source), check};
 } else if (row.family === 'independent-delivery') {
  deliveryVerify.call(row.backup, row.source);
  const selected = deliverySelection.call(row.backup).identity, capture = independentDeliverySourceSnapshot(row.source);
  if (JSON.stringify(capture.metadata.identity) !== JSON.stringify(selected.source)) throw fail();
  const check = () => { deliveryVerify.call(row.backup, row.source); capture.check(); };
  data = {participant: selected.participant, principal: selected.principal, history: selected.source.history, binding: selected.source.binding,
   records: capture.records, retained: retained(capture.records), native: capturedNativeHistoryRead(row.source), check};
 } else if (row.family === 'restored-graph') {
  const admitted = restoredGraphNativeSource.read(row), selected = admitted.selected.identity, {capture} = admitted;
  if (JSON.stringify(capture.metadata.identity) !== JSON.stringify(selected.source)) throw fail();
  data = {participant: selected.participant, principal: selected.principal, history: capture.metadata.identity.history,
   binding: capture.metadata.identity.binding, records: capture.records, retained: retained(capture.records), native: admitted.lanes,
   check: () => { restoredGraphNativeSource.read(row); }};
 } else throw fail();
 data.check(); data.native.check();
 const token = Object.freeze({}) as BoundIndependentPrefixSource;
 states.set(token, Object.freeze(data));
 return token;
}
/** A DTO with the same fields has no entry in this runtime ledger. */
export function readBoundIndependentPrefix(source: BoundIndependentPrefixSource): PrefixData {
 const data = states.get(source);
 if (!data) throw fail();
 data.check(); data.native.check();
 if (states.get(source) !== data) throw fail();
 return data;
}
