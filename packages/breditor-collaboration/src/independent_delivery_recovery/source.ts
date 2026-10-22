/** Canonical complete source guards/disposal survive mutable public capture facades. */
import {SharedIndependentDeliverySourceCapture,independentDeliverySourceSnapshot} from '../independent_delivery_source/capture.js';
const capture=SharedIndependentDeliverySourceCapture.capture,dispose=SharedIndependentDeliverySourceCapture.prototype.dispose;
export const deliveryRecoverySource=Object.freeze({capture,check:(source:SharedIndependentDeliverySourceCapture)=>independentDeliverySourceSnapshot(source).check(),dispose:(source:SharedIndependentDeliverySourceCapture)=>dispose.call(source)});
