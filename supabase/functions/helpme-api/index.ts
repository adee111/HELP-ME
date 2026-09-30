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
 if(route==='/config'&&verb==='GET')return respond({stripeConfigured:stripeReady,testMode:true,backend:'supabase'});
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
 const allowed=['/me','/services','/offers','/professionals','/slots','/bookings','/admin','/checkout'];
 if(!allowed.includes(route)&&!/^\/(bookings\/[^/]+\/(messages|status)|professionals\/[^/]+\/availability|admin\/users\/[^/]+\/review)$/.test(route))return respond({error:'Rota não encontrada.'},404);
 const rpc=async(r:string,p:unknown)=>{const {data,error}=await service.rpc('helpme_api',{actor,route:r,verb,payload:p});if(error)throw error;return data};
 if(route==='/checkout'){
 if(verb!=='POST')return respond({error:'Método inválido.'},405);
 if(!stripeReady)return respond({error:'Checkout Stripe de teste ainda não configurado neste backend.'},503);
 const b=await rpc('/checkout_prepare',payload);
 if(b.checkout_url)return respond({url:b.checkout_url});
 const stripe=new Stripe(stripeKey,{httpClient:Stripe.createFetchHttpClient()});
 try{
 const session=await stripe.checkout.sessions.create({mode:'payment',line_items:[{price_data:{currency:'brl',unit_amount:b.price,product_data:{name:b.service_name}},quantity:1}],metadata:{bookingId:b.id},client_reference_id:b.id,success_url:site+'/?payment=return',cancel_url:site+'/?payment=cancel',expires_at:Math.floor(Date.now()/1000)+1800},{idempotencyKey:'helpme-booking-'+b.id});
 if(!session.url)throw new Error('Checkout indisponível.');
 await rpc('/checkout_complete',{bookingId:b.id,sessionId:session.id,url:session.url});return respond({url:session.url});
 }catch(e){await rpc('/checkout_release',{bookingId:b.id}).catch(()=>{});throw e}
 }
 const data=await rpc(route,payload);
 if(route==='/admin')return respond({...data,stripeConfigured:stripeReady,testMode:true});
 return respond(data);
 }catch(e){const err=e as {code?:string;message?:string};const status=err.code?.startsWith('PT')?Number(err.code.slice(2)):['22P02','23502','23503','23514'].includes(err.code||'')?400:err.code==='23505'?409:500;return respond({error:err.code?.startsWith('PT')?err.message:status===400?'Confira os campos informados.':status===409?'Solicitação já registrada.':'Não foi possível concluir. Tente novamente.'},status)}
});
