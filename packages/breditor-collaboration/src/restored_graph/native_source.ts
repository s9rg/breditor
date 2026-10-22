/** A private native-prefix borrow, not writable custody or complete room readiness.
 * The real source journal holds origins and input while this capture is alive. */
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedIndependentDeliverySession} from '../independent_delivery/session.js';
import {independentDeliverySource} from '../independent_delivery_source/admission.js';
import {independentDeliveryRecords} from '../independent_delivery_source/records.js';
import {restoredOperationJournalBinding, type RestoredOperationJournal} from '../restored_operation/journal.js';
import {RestoredOperationGraphArchive, restoredGraphArchive as graph} from './archive.js';
import {registerCapturedNativeHistory, releaseCapturedNativeHistory, capturedNativeHistoryRead} from '../native_history_read/registry.js';
import {freezeGeneration} from '../generation_source/identity.js';
import {SharedRoomParticipantInventoryError} from '../room_participant_inventory/policy.js';

export interface RestoredGraphNativeSourceOptions<P extends SharedSelectionPolicy = SharedSelectionPolicy> {
 readonly source: SharedIndependentDeliverySession<P>;
 readonly backup: RestoredOperationGraphArchive;
 readonly checkAuthority: () => void;
 readonly signal?: AbortSignal;
}
type Reader = ReturnType<ReturnType<typeof restoredOperationJournalBinding>['borrowRead']>;
interface State {
 readonly backup: RestoredOperationGraphArchive;
 readonly expected: Reader['expected'];
 readonly snapshot: Readonly<{
  metadata: Readonly<{identity: Reader['sourceIdentity']}>;
  records: ReturnType<typeof independentDeliveryRecords>;
 }>;
 readonly reader: Reader;
 readonly check: () => void;
}
const token = Object.freeze({});
const states = new WeakMap<RestoredGraphNativeSourceCapture, State>();
const fail = () => new SharedRoomParticipantInventoryError('inventory_source', 'Borrow the unchanged actual restored source, current read grant and genuine complete graph');
function checked(owner: RestoredGraphNativeSourceCapture): State {
 const state = states.get(owner);
 if (!state) throw fail();
 state.check();
 if (states.get(owner) !== state) throw fail();
 return state;
}

/** No metadata, copied methods or completed-phase Boolean constructs this owner.
 * Dispose the borrow before awaiting source closure; it deliberately holds shutdown. */
export class RestoredGraphNativeSourceCapture {
 private constructor(key: object, state: State) {
  if (key !== token) throw fail();
  states.set(this, state);
  Object.freeze(this);
 }
 static capture<P extends SharedSelectionPolicy>(input: RestoredGraphNativeSourceOptions<P>): RestoredGraphNativeSourceCapture {
  if (this !== RestoredGraphNativeSourceCapture || !input || typeof input !== 'object' ||
      Object.keys(input).some(key => !['source', 'backup', 'checkAuthority', 'signal'].includes(key))) throw fail();
  const {source, backup, checkAuthority, signal} = input;
  if (!graph.owns(backup)) throw fail();
  const port = independentDeliverySource(source);
  if (!port.operation) throw fail();
  const reader = restoredOperationJournalBinding(port.operation as RestoredOperationJournal).borrowRead(source, checkAuthority, signal);
  let complete = false;
  let owner: RestoredGraphNativeSourceCapture | undefined;
  try {
   const stamp = port.stamp(), live = reader.readSource(), expected = freezeGeneration(reader.expected);
   const metadata = graph.latestMetadata.call(backup);
   if (JSON.stringify(graph.selection.call(backup).original) !== JSON.stringify(expected) ||
       JSON.stringify(metadata.operation) !== JSON.stringify(reader.identity) ||
       JSON.stringify(graph.live.call(backup)) !== JSON.stringify(live)) throw fail();
   const check = () => {
    reader.check(); graph.file.call(backup);
    const now = port.stamp();
    if (now.length !== stamp.length || now.some((value, index) => value !== stamp[index])) throw fail();
    reader.check();
   };
   check();
   const snapshot = freezeGeneration({metadata: {identity: reader.sourceIdentity}, records: independentDeliveryRecords(live)});
   owner = new RestoredGraphNativeSourceCapture(token, {backup, expected, snapshot, reader, check});
   const actual = owner;
   registerCapturedNativeHistory(actual, port.core, {
    document: {kind: live.source.identity.documentHistory, checkpoint: live.source.documentCheckpoint},
    review: {kind: live.source.identity.reviewHistory, checkpoint: live.source.reviewCheckpoint},
   }, () => { checked(actual); });
   check(); complete = true; return actual;
  } finally {
   if (!complete) {
    if (owner) { states.delete(owner); releaseCapturedNativeHistory(owner); }
    reader.release();
   }
  }
 }
 /** Release actual scope custody even after grant revocation or archive disposal. */
 dispose(): void {
  const state = states.get(this);
  if (!state) return;
  states.delete(this);
  try { releaseCapturedNativeHistory(this); } finally { state.reader.release(); }
 }
}

/** Canonical normalization of the actual capture and the same genuine graph handle.
 * This proves a native prefix, not current uploads, native writer custody or permissions. */
export function readRestoredGraphNativeSource(input: Readonly<{backup: RestoredOperationGraphArchive; source: RestoredGraphNativeSourceCapture}>) {
 const {backup, source} = input, state = checked(source);
 if (state.backup !== backup || !graph.owns(backup)) throw fail();
 const lanes = capturedNativeHistoryRead(source);
 const capture = {...state.snapshot, check: () => { checked(source); }};
 checked(source);
 return {selected: state.expected, capture, lanes};
}
const capture = RestoredGraphNativeSourceCapture.capture, dispose = RestoredGraphNativeSourceCapture.prototype.dispose;
export const restoredGraphNativeSource = Object.freeze({
 capture: <P extends SharedSelectionPolicy>(input: RestoredGraphNativeSourceOptions<P>) => capture.call(RestoredGraphNativeSourceCapture, input),
 read: readRestoredGraphNativeSource,
 dispose: (owner: RestoredGraphNativeSourceCapture) => dispose.call(owner),
 owns: (owner: unknown): owner is RestoredGraphNativeSourceCapture => !!owner && typeof owner === 'object' && states.has(owner as RestoredGraphNativeSourceCapture),
});
