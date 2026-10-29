
import test from 'node:test';
import {probeCoupledDelivery} from './probe-coupled-delivery.mjs';
test('actual seven-family cold reopen resumes remaining bound deliveries after fresh full-path approval',{timeout:2400000},()=>probeCoupledDelivery('cold'));
