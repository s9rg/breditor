import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import {NativeReconstructionWaits} from '../selected_native_reconstruction/read_waits.js';

/** Bind a metadata decision to the actual target, selected control and caller. */
export function holdMetadataContinuation(
 scope:Pick<SelectedNativeRecoveryScope,'check'|'signal'>,
 control:Readonly<{guard(signal:AbortSignal):void;signals:readonly AbortSignal[]}>,
 authority:()=>void,parentSignal?:AbortSignal,
):NativeReconstructionWaits{
 return new NativeReconstructionWaits(()=>{
  scope.check();
  authority();
  control.guard(scope.signal);
  scope.check();
 },[scope.signal,...control.signals,parentSignal]);
}
