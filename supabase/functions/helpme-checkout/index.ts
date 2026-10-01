import {createClient} from 'npm:@supabase/supabase-js@2.117.2';
import Stripe from 'npm:stripe@22.6.2';
import {directCheckout} from '../_shared/direct-charge.ts';
const site='https://helpme-previa-adeemar.aqua-aphid-8990.chatgpt.site';
const origins=new Set([site,'http://localhost:5173']);
Deno.serve(async req=>{
 const origin=req.headers.get('origin')||'';
 const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':origins.has(origin)?origin:site,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'};
 const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(origin&&!origins.has(origin))return respond({error:'Origem não autorizada.'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return respond({error:'Método inválido.'},405);
 try{
 const raw=await req.text();if(raw.length>2048)return respond({error:'Solicitação muito grande.'},413);
 const input=JSON.parse(raw);
 if(input.path!=='/checkout'||input.method!=='POST')return respond({error:'Rota não encontrada.'},404);
 const bookingId=input.body?.bookingId;
 if(typeof bookingId!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bookingId))return respond({error:'Pedido inválido.'},400);
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
 const token=(req.headers.get('authorization')||'').replace(/^Bearer /,'');
 if(!token)return respond({error:'Entre na sua conta para pagar.'},401);
 const {data:{user},error}=await db.auth.getUser(token);
 if(error||!user||user.is_anonymous||!user.email_confirmed_at)return respond({error:'Entre com uma conta de email confirmado.'},401);
 const key=Deno.env.get('HELPME_STRIPE_SECRET_KEY')||'';
 if(!/^(sk|rk)_test_/.test(key)||!Deno.env.get('HELPME_STRIPE_WEBHOOK_SECRET'))return respond({error:'A ativação dos pagamentos está pendente. Nenhum valor foi cobrado.'},503);
 const rpc=async(phase:string,payload:Record<string,unknown>)=>{const {data,error}=await db.rpc('helpme_direct_checkout',{actor:user.id,phase,payload});if(error)throw error;return data};
 let b=await rpc('/checkout_prepare',{bookingId});
 const stripe=new Stripe(key,{httpClient:Stripe.createFetchHttpClient()});
 try{
 if(b.session_id){
  const previous=await stripe.checkout.sessions.retrieve(b.session_id,{}, {stripeAccount:b.connected_account});
  if(previous.status==='open'&&previous.url)return respond({url:previous.url});
  let retryable=previous.status==='expired';
  if(previous.status==='complete'&&previous.payment_status==='unpaid'&&typeof previous.payment_intent==='string'){const intent=await stripe.paymentIntents.retrieve(previous.payment_intent,{}, {stripeAccount:b.connected_account});retryable=intent.status==='requires_payment_method'||intent.status==='canceled';}
  if(!retryable)return respond({error:'O pagamento está sendo confirmado. Atualize o pedido antes de tentar novamente.'},409);
  b=await rpc('/checkout_expire',{bookingId,sessionId:b.session_id,lockKey:b.checkout_lock_key});
 }
 const platform=await stripe.accounts.retrieve(Deno.env.get('HELPME_STRIPE_PLATFORM_ACCOUNT_ID')||'acct_1UCJzVRpKDNHFrEI');
 if(platform.country!=='BR')return respond({error:'A plataforma precisa configurar sua conta Stripe brasileira para receber pagamentos.'},409);
 const account=await stripe.v2.core.accounts.retrieve(b.connected_account,{include:['configuration.merchant','defaults','identity']});
 if(account.identity?.country?.toUpperCase()!=='BR'||account.dashboard!=='full'||account.defaults?.responsibilities?.fees_collector!=='stripe'||account.defaults?.responsibilities?.losses_collector!=='stripe'||account.configuration?.merchant?.capabilities?.card_payments?.status!=='active')return respond({error:'O prestador precisa concluir a habilitação da conta de recebimento.'},409);
 const charge=directCheckout(b,site);
 const session=await stripe.checkout.sessions.create(charge.params,charge.options);
 if(!session.url)throw new Error('Checkout indisponível.');
 await rpc('/checkout_complete',{bookingId,lockKey:b.checkout_lock_key,sessionId:session.id,url:session.url});
 return respond({url:session.url});
 }finally{await rpc('/checkout_release',{bookingId,lockKey:b.checkout_lock_key}).catch(()=>{});}
 }catch(e){const err=e as {code?:string;message?:string};const status=err.code?.startsWith('PT')?Number(err.code.slice(2)):err instanceof SyntaxError?400:500;return respond({error:err.code?.startsWith('PT')?err.message:status===400?'Confira o pedido informado.':'Não foi possível abrir o pagamento. Nenhum novo pagamento foi confirmado; tente novamente.'},status);}
});
