import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canPay,checkoutUrl} from '../src/lib/checkout.ts';
import {directCheckout} from '../supabase/functions/_shared/direct-charge.ts';
test('somente pedidos aceitos ou concluídos e não pagos abrem checkout',()=>{
 for(const status of ['accepted','completed'])assert.equal(canPay({status,payment:'unpaid',price:6750}),true);
 for(const status of ['requested','cancelled','rejected'])assert.equal(canPay({status,payment:'unpaid',price:6750}),false);
 assert.equal(canPay({status:'completed',payment:'paid',price:6750}),false);
 assert.equal(canPay({status:'completed',payment:'unpaid',price:0}),false);
});
test('redirecionamento aceita apenas checkout HTTPS do Stripe',()=>{
 assert.equal(checkoutUrl('https://checkout.stripe.com/c/pay/cs_test_1'),'https://checkout.stripe.com/c/pay/cs_test_1');
 for(const url of [null,'javascript:alert(1)','http://checkout.stripe.com','https://checkout.stripe.com.evil.test','https://user:pass@checkout.stripe.com'])assert.throws(()=>checkoutUrl(url));
});
test('checkout preserva total reservado, horas e idempotência por tentativa',()=>{
 const booking={id:'booking',price:6750,hourly_rate:4500,billing_minutes:90,service_name:'Limpeza',connected_account:'acct_Provider',checkout_key:'first'};
 const a=directCheckout(booking,'https://example.com'),b=directCheckout({...booking,checkout_key:'retry'},'https://example.com');
 assert.equal(a.params.line_items[0].price_data.unit_amount,6750);
 assert.equal(a.params.payment_intent_data.application_fee_amount,1013);
 assert.match(a.params.line_items[0].price_data.product_data.description,/1.5 horas/);
 assert.match(a.params.success_url,/payment=return&booking=booking/);
 assert.match(a.params.cancel_url,/payment=cancel&booking=booking/);
 assert.notEqual(a.options.idempotencyKey,b.options.idempotencyKey);
 assert.equal(a.options.idempotencyKey,directCheckout(booking,'https://example.com').options.idempotencyKey);
 assert.equal('payment_method_types' in a.params,false);
});
