/** Distinguish this SDK's request deadlines from external cancellation without
 * retaining or exposing application-provided AbortSignal reasons. */
export type GenerationControlCancellationReason='deadline'|'signal';

const deadlines=new WeakSet<AbortSignal>();
const aborted=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted')!.get!;

export function controlCancellationReason(signal:AbortSignal|undefined):GenerationControlCancellationReason|undefined {
 if(!signal||!aborted.call(signal))return undefined;
 return deadlines.has(signal)?'deadline':'signal';
}

export function expireGenerationControl(controller:AbortController):void {
 const signal=controller.signal;
 if(aborted.call(signal))return;
 deadlines.add(signal);
 controller.abort();
}
