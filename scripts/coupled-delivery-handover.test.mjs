import test from 'node:test';
import {probeCoupledDelivery} from './probe-coupled-delivery.mjs';

test('a cold delivery journal resumes pending pairs across a real sealed handover', {timeout: 2400000},
 () => probeCoupledDelivery('handover'));
