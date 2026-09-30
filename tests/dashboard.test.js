import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dayKey,monthSummary,demoBookings} from '../src/features/professional-dashboard/model.ts';
test('agenda usa data de Brasília em vez da data UTC',()=>{assert.equal(dayKey(Date.parse('2026-10-01T01:00:00Z')),'2026-09-30')});
test('pagamento do cliente não é contado como repasse recebido',()=>{
 const rows=[{id:'1',start:Date.parse('2026-09-08T12:00:00Z'),status:'completed',payment:'paid',price:18000},{id:'2',start:Date.parse('2026-09-10T12:00:00Z'),status:'accepted',payment:'unpaid',price:26000}];
 const summary=monthSummary(rows,'2026-09');assert.equal(summary.charged,18000);assert.equal(summary.received,0);assert.equal(summary.pending,26000);assert.equal(summary.completed,1);
});
test('repasse é agrupado por data do recebimento, serviço por data do serviço',()=>{
 const row={id:'1',start:Date.parse('2026-08-31T12:00:00Z'),status:'completed',payment:'paid',price:18000,providerPaidCents:15300,providerPaidAt:Date.parse('2026-09-02T12:00:00Z')};
 assert.equal(monthSummary([row],'2026-09').received,15300);assert.equal(monthSummary([row],'2026-09').charged,0);assert.equal(monthSummary([row],'2026-08').charged,18000);
});
test('demonstração possui fixtures identificadas, sem contas reais',()=>{const rows=demoBookings(Date.parse('2026-09-29T12:00:00Z'));assert.equal(rows.length,7);assert(rows.every(b=>b.id.startsWith('demo-')));assert.equal(monthSummary(rows,'2026-09').completed,4)});
