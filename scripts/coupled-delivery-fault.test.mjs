import test from 'node:test';import{probeCoupledDelivery}from'./probe-coupled-delivery.mjs';
test('coupled genuine retained-owner delivery: fault',{timeout:1200000},()=>probeCoupledDelivery('fault'));
