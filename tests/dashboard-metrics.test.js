import {test} from 'node:test';
import assert from 'node:assert/strict';
import {monthSeries,statusSummary} from '../src/components/dashboard/metrics.ts';

test('dashboard weeks respect Brasília date, month boundaries and monetary totals',()=>{
 const points=monthSeries('2026-10',[
  {timestamp:Date.parse('2026-10-01T01:00:00Z'),value:9999}, // September in Brasília
  {timestamp:Date.parse('2026-10-08T01:00:00Z'),value:6000}, // Day 7
  {timestamp:Date.parse('2026-10-08T12:00:00Z'),value:4500},
  {timestamp:Date.parse('2026-11-01T01:00:00Z'),value:2000}, // October day 31
 ]);
 assert.deepEqual(points.map(p=>p.value),[6000,4500,0,0,2000]);
 assert.equal(points.reduce((sum,p)=>sum+p.value,0),12500);
 assert.equal(points[4].label,'29–31');
 assert.equal(monthSeries('2028-02',[]).at(-1).label,'29–29');
 assert.equal(monthSeries('2026-02',[]).length,4);
});
test('status chart includes cancelled and rejected without counting another month',()=>{
 const row=(status,start='2026-10-15T12:00:00Z')=>({start:Date.parse(start),status,payment:'unpaid',price:1000});
 const result=statusSummary([row('requested'),row('accepted'),row('completed'),row('cancelled'),row('rejected'),row('completed','2026-09-15T12:00:00Z')],'2026-10');
 assert.deepEqual(result.map(p=>p.value),[1,1,1,2]);
 assert.equal(statusSummary([],'2026-10').reduce((sum,p)=>sum+p.value,0),0);
});
