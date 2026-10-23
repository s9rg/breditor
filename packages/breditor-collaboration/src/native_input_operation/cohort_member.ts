/** Private reservation issued synchronously by an actual parent. Durable intent
 * and caller adapters cannot implement the custody used by the cohort router. */
import type {SharedSelectionPolicy} from '../types.js';
import type {NativeInputHandoff} from './handoff.js';
export interface NativeInputParticipantReservation<P extends SharedSelectionPolicy>{
 /** Verify retained input/native/uploads and release namespace leases, without
  * releasing the real upload custody or retiring this parent. */
 prepare():Promise<NativeInputHandoff<P>>;
 /** Private flag writes only, after every member has passed its final fence. */
 consume():void;
 /** Retry retains actual writers, uploads and committed bytes. */
 abandon():void;
}
