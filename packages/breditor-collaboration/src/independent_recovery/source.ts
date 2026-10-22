/** Actual local native reader only: no delivery companion is constructed. */
import {SharedIndependentSourceCapture,independentSourceSnapshot} from '../independent_source/capture.js';
const capture=SharedIndependentSourceCapture.capture,dispose=SharedIndependentSourceCapture.prototype.dispose;
export const independentRecoverySource=Object.freeze({capture,check:(source:SharedIndependentSourceCapture)=>independentSourceSnapshot(source).check(),dispose:(source:SharedIndependentSourceCapture)=>dispose.call(source)});
