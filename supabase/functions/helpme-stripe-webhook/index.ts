import {createClient} from 'npm:@supabase/supabase-js@2.117.2';
import Stripe from 'npm:stripe@22.6.2';
Deno.serve(async req=>{
 const key=Deno.env.get('HELPME_STRIPE_SECRET_KEY')||'',secret=Deno.env.get('HELPME_STRIPE_WEBHOOK_SECRET')||'';
 if(req.method!=='POST')return new Response('Método inválido',{status:405});
 if(!/^(sk|rk)_test_/.test(key)||!secret)return new Response('Stripe não configurado',{status:503});
 if(Number(req.headers.get('content-length')||0)>131072)return new Response('Solicitação muito grande',{status:413});
 const stripe=new Stripe(key,{httpClient:Stripe.createFetchHttpClient()});let event;
 try{const raw=await req.text();if(raw.length>131072)return new Response('Solicitação muito grande',{status:413});event=await stripe.webhooks.constructEventAsync(raw,req.headers.get('stripe-signature')||'',secret,undefined,Stripe.createSubtleCryptoProvider())}catch{return new Response('Assinatura inválida',{status:400})}
 if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)){
 const session=event.data.object as Stripe.Checkout.Session;
 if(session.payment_status==='paid'){
 if(!event.account||!session.payment_intent)return new Response('Evento Connect obrigatório',{status:400});
 let intent:Stripe.PaymentIntent;try{intent=await stripe.paymentIntents.retrieve(String(session.payment_intent),{}, {stripeAccount:event.account})}catch{return new Response('Não foi possível verificar a cobrança',{status:409})}
 if(intent.transfer_data||intent.application_fee_amount==null)return new Response('Cobrança direta obrigatória',{status:400});
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
 const {error}=await db.rpc('helpme_confirm_payment',{event_id:event.id,session_id:session.id,booking_id:session.metadata?.bookingId,amount:session.amount_total,currency:session.currency,live:session.livemode,connected_account:event.account,application_fee:intent.application_fee_amount});
 if(error)return new Response('Pagamento não registrado; repetir entrega',{status:error.code==='PT400'?400:409});
 }
 }
 return Response.json({received:true});
});
