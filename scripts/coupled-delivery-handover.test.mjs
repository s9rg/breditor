import test from 'node:test';
import {internalFailureChain} from '../packages/breditor-collaboration/dist/internal_failure_cause.js';
import {reportArchiveErrorChain} from './diagnostics/archive-error-chain.mjs';
import {probeCoupledDelivery} from './probe-coupled-delivery.mjs';

test('a cold delivery journal resumes pending pairs across a real sealed handover', {timeout: 2400000},
 async () => {
  try {
   await probeCoupledDelivery('handover');
  } catch (error) {
   for (const cause of internalFailureChain(error).slice(0, 8)) {
    const code = Object.getOwnPropertyDescriptor(cause, 'code')?.value;
    if (typeof code === 'string' && /^[a-z_]{1,80}$/.test(code)) {
     console.error('DELIVERY_HANDOVER_FAILURE', code, cause.stack?.split('\n').slice(1, 5).join('\n'));
    }
    reportArchiveErrorChain(cause);
   }
   throw error;
  }
 });
