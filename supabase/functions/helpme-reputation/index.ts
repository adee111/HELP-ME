import {createClient} from 'npm:@supabase/supabase-js@2.117.2';
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
 const raw=await req.text();if(raw.length>65536)return respond({error:'Solicitação muito grande.'},413);
 const input=JSON.parse(raw);if(typeof input.path!=='string'||!input.path.startsWith('/')||input.path.startsWith('//'))return respond({error:'Rota inválida.'},400);
 const path=new URL(input.path,'https://helpme.invalid'),route=path.pathname,verb=input.method;
 const publicRead=verb==='GET'&&['/offers','/provider-profile'].includes(route);
 const privateRead=verb==='GET'&&['/provider-profile/me','/reviews/mine'].includes(route);
 const privateWrite=verb==='POST'&&['/provider-profile/me','/reviews'].includes(route);
 if(!publicRead&&!privateRead&&!privateWrite)return respond({error:'Rota não encontrada.'},404);
 const service=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
 let actor:string|null=null;
 if(!publicRead){
 const token=(req.headers.get('authorization')||'').replace(/^Bearer /,'');if(!token)return respond({error:'Entre na sua conta.'},401);
 const {data:{user},error}=await service.auth.getUser(token);
 if(error||!user||user.is_anonymous||!user.email_confirmed_at)return respond({error:'Entre com uma conta de email confirmado.'},401);
 actor=user.id;
 const role=user.user_metadata?.helpme_role==='professional'?'professional':'customer';
 const {error:ensure}=await service.rpc('helpme_ensure_profile',{actor,verified_email:user.email,display_name:String(user.user_metadata?.name||'Conta Help.me'),contact_phone:String(user.user_metadata?.phone||''),requested_role:role});if(ensure)throw ensure;
 const {data:me,error:profileError}=await service.rpc('helpme_api',{actor,route:'/me',verb:'GET',payload:{}});if(profileError)throw profileError;
 if(me.user.role==='professional'&&!['suspended','rejected'].includes(me.user.accountStatus)){
 const {error:init}=await service.rpc('helpme_reputation',{actor,route:'/provider-profile/init',verb:'POST',payload:{bio:String(user.user_metadata?.bio||'').slice(0,1500),skills:String(user.user_metadata?.skills||'').slice(0,1000),references:String(user.user_metadata?.references||'').slice(0,1500),photo_url:String(user.user_metadata?.photo_url||'').slice(0,40000)}});if(init)throw init;
 }
 }
 const payload={...Object.fromEntries(path.searchParams),...(input.body||{})};
 const {data,error}=await service.rpc('helpme_reputation',{actor,route,verb,payload});if(error)throw error;return respond(data);
 }catch(e){const err=e as {code?:string;message?:string};const status=err.code?.startsWith('PT')?Number(err.code.slice(2)):['22P02','23502','23503','23514'].includes(err.code||'')?400:err.code==='23505'?409:500;return respond({error:err.code?.startsWith('PT')?err.message:status===400?'Confira os campos informados.':status===409?'Este serviço já foi avaliado.':'Não foi possível concluir. Tente novamente.'},status)}
});
