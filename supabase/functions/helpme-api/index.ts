import {directCheckout} from '../_shared/direct-charge.ts';
import {createClient} from 'npm:@supabase/supabase-js@2.117.2';
import Stripe from 'npm:stripe@22.6.2';
const site='https://helpme-previa-adeemar.aqua-aphid-8990.chatgpt.site';
const origins=new Set([site,'http://localhost:5173']);
Deno.serve(async req=>{
 const origin=req.headers.get('origin')||'';
 const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':origins.has(origin)?origin:site,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'};
 const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
 if(origin&&!origins.has(origin))return respond({error:'Origem não autorizada.'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return respond({error:'Método inválido.'},405);
 try{
 const raw=await req.text();if(raw.length>16384)return respond({error:'Solicitação muito grande.'},413);
 const input=JSON.parse(raw);const path=new URL(input.path,'https://helpme.invalid');const route=path.pathname;const verb=input.method;
 if(!['GET','POST'].includes(verb)||typeof input.path!=='string'||!input.path.startsWith('/')||input.path.startsWith('//'))return respond({error:'Solicitação inválida.'},400);
 const service=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
 const stripeKey=Deno.env.get('HELPME_STRIPE_SECRET_KEY')||'';
 const webhookSecret=Deno.env.get('HELPME_STRIPE_WEBHOOK_SECRET')||'';
 const stripeReady=/^(sk|rk)_test_/.test(stripeKey)&&!!webhookSecret;
 if(route==='/config'&&verb==='GET')return respond({stripeConfigured:stripeReady,testMode:true,backend:'supabase',chargePattern:'direct',platformFeePercent:15,processingFeesPaidBy:'professional'});
 const publicRoute=verb==='GET'&&['/services','/offers','/professionals'].includes(route);
 let actor:string|null=null;
 if(!publicRoute){
 const token=(req.headers.get('authorization')||'').replace(/^Bearer /,'');
 if(!token)return respond({error:'Entre na sua conta.'},401);
 const {data:{user},error}=await service.auth.getUser(token);
 if(error||!user||user.is_anonymous||!user.email_confirmed_at)return respond({error:'Entre com uma conta de email confirmado.'},401);
 actor=user.id;
 // User editable metadata only supplies first-profile display fields and a nonprivileged persona.
 // Approval and administrator grants always come from the database.
 const role=user.user_metadata?.helpme_role==='professional'?'professional':'customer';
 const {error:profileError}=await service.rpc('helpme_ensure_profile',{actor,verified_email:user.email,display_name:String(user.user_metadata?.name||'Conta Help.me'),contact_phone:String(user.user_metadata?.phone||''),requested_role:role});
 if(profileError)throw profileError;
 }
 const payload={...Object.fromEntries(path.searchParams),...(input.body||{})};
 // Internal financial transitions are never callable by a client-selected path.
 const allowed=['/me','/services','/offers','/professionals','/slots','/bookings','/admin','/checkout','/connect/status','/connect/onboard'];
 if(!allowed.includes(route)&&!/^\/(bookings\/[^/]+\/(messages|status)|professionals\/[^/]+\/availability|admin\/users\/[^/]+\/review)$/.test(route))return respond({error:'Rota não encontrada.'},404);
 const rpc=async(r:string,p:unknown)=>{const {data,error}=r.startsWith('/checkout_')?await service.rpc('helpme_direct_checkout',{actor,phase:r,payload:p}):await service.rpc('helpme_api',{actor,route:r,verb,payload:p});if(error)throw error;return data};
 if(route.startsWith('/connect/')){
 const {data:profile,error}=await service.rpc('helpme_connect_profile',{actor});if(error)throw error;
 if(!stripeReady)return respond({configured:false,ready:false,error:'Configure as chaves Stripe de teste e o webhook Connect.'},route==='/connect/status'?200:503);
 const stripe=new Stripe(stripeKey,{httpClient:Stripe.createFetchHttpClient()});const platform=await stripe.accounts.retrieve(Deno.env.get('HELPME_STRIPE_PLATFORM_ACCOUNT_ID')||'acct_1UCJzVRpKDNHFrEI');if(platform.country!=='BR')return respond({error:'A plataforma Stripe precisa estar sediada no Brasil para cobrar taxas de prestadores brasileiros.'},409);let accountId=profile.account_id;
 if(route==='/connect/onboard'&&verb==='POST'){
 if(!accountId){const account=await stripe.v2.core.accounts.create({contact_email:profile.email,display_name:profile.name,identity:{country:'br'},dashboard:'full',defaults:{currency:'brl',responsibilities:{fees_collector:'stripe',losses_collector:'stripe'}},configuration:{merchant:{capabilities:{card_payments:{requested:true}}}}},{idempotencyKey:'helpme-provider-'+actor});const {error:save}=await service.rpc('helpme_connect_save',{actor,account_id:account.id});if(save)throw save;accountId=account.id;}
 const link=await stripe.v2.core.accountLinks.create({account:accountId,use_case:{type:'account_onboarding',account_onboarding:{configurations:['merchant'],refresh_url:site+'/?connect=refresh',return_url:site+'/?connect=return'}}});return respond({url:link.url});
 }
 if(route==='/connect/status'&&verb==='GET'){
 if(!accountId)return respond({configured:true,ready:false});
 const a=await stripe.v2.core.accounts.retrieve(accountId,{include:['configuration.merchant','defaults','identity']});return respond({configured:true,ready:a.identity?.country?.toUpperCase()==='BR'&&a.dashboard==='full'&&a.defaults?.responsibilities?.fees_collector==='stripe'&&a.configuration?.merchant?.capabilities?.card_payments?.status==='active',accountId});
 }
 return respond({error:'Método inválido.'},405);
 }
 if(route==='/checkout'){
 if(verb!=='POST')return respond({error:'Método inválido.'},405);
 if(!stripeReady)return respond({error:'Checkout Stripe de teste ainda não configurado neste backend.'},503);
 const b=await rpc('/checkout_prepare',payload);
 if(b.checkout_url)return respond({url:b.checkout_url});
 const stripe=new Stripe(stripeKey,{httpClient:Stripe.createFetchHttpClient()});
 try{
 const platform=await stripe.accounts.retrieve(Deno.env.get('HELPME_STRIPE_PLATFORM_ACCOUNT_ID')||'acct_1UCJzVRpKDNHFrEI');if(platform.country!=='BR')throw {code:'PT409',message:'Conta Stripe da plataforma precisa estar sediada no Brasil.'};
 const account=await stripe.v2.core.accounts.retrieve(b.connected_account,{include:['configuration.merchant','defaults','identity']});
 if(account.identity?.country?.toUpperCase()!=='BR'||account.dashboard!=='full'||account.defaults?.responsibilities?.fees_collector!=='stripe'||account.defaults?.responsibilities?.losses_collector!=='stripe'||account.configuration?.merchant?.capabilities?.card_payments?.status!=='active')return await rpc('/checkout_release',{bookingId:b.id}).then(()=>respond({error:'Conta Stripe do prestador ainda não está habilitada para cobrança direta.'},409));
 const charge=directCheckout(b,site);
 const session=await stripe.checkout.sessions.create(charge.params,charge.options);
 if(!session.url)throw new Error('Checkout indisponível.');
 await rpc('/checkout_complete',{bookingId:b.id,sessionId:session.id,url:session.url});return respond({url:session.url});
 }catch(e){await rpc('/checkout_release',{bookingId:b.id}).catch(()=>{});throw e}
 }
 const data=await rpc(route,payload);
 if(route==='/admin')return respond({...data,stripeConfigured:stripeReady,testMode:true});
 return respond(data);
 }catch(e){const err=e as {code?:string;message?:string};const status=err.code?.startsWith('PT')?Number(err.code.slice(2)):['22P02','23502','23503','23514'].includes(err.code||'')?400:err.code==='23505'?409:500;return respond({error:err.code?.startsWith('PT')?err.message:status===400?'Confira os campos informados.':status===409?'Solicitação já registrada.':'Não foi possível concluir. Tente novamente.'},status)}
});
