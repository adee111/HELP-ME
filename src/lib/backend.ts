import {createClient} from '@supabase/supabase-js';
const url=import.meta.env.VITE_SUPABASE_URL;
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase=url&&key?createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}):null;
const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
export async function apiFetch(path:string,options:RequestInit={}):Promise<Response>{
 if(!supabase)return fetch(path,options);
 const route=path.replace(/^\/api/,'');
 const body=typeof options.body==='string'?JSON.parse(options.body):{};
 if(route==='/auth/register'){
 if(!['customer','professional'].includes(body.role)||typeof body.name!=='string'||body.name.trim().length<2||body.name.length>100||!/^\+?[0-9 ()-]{10,20}$/.test(body.phone)||typeof body.password!=='string'||body.password.length<12||body.password.length>128)return response({error:'Confira nome, telefone, perfil e senha (mínimo de 12 caracteres).'},400);
 const {data,error}=await supabase.auth.signUp({email:body.email,password:body.password,options:{data:{name:body.name.trim(),phone:body.phone,helpme_role:body.role},emailRedirectTo:location.origin+'/'}});
 if(error)return response({error:authMessage(error.message)},400);
 if(!data.session)return response({user:null,requiresConfirmation:true});
 return apiFetch('/api/me');
 }
 if(route==='/auth/login'){
 const {error}=await supabase.auth.signInWithPassword({email:body.email,password:body.password});
 if(error)return response({error:authMessage(error.message)},401);
 return apiFetch('/api/me');
 }
 if(route==='/auth/logout'){
 const {error}=await supabase.auth.signOut();return error?response({error:'Não foi possível sair da conta.'},500):response({ok:true});
 }
 const {data:{session},error}=await supabase.auth.getSession();
 if(error)return response({error:'Sua sessão expirou. Entre novamente.'},401);
 const headers:Record<string,string>={'apikey':key,'Content-Type':'application/json'};
 if(session)headers.Authorization='Bearer '+session.access_token;
 return fetch(url+'/functions/v1/helpme-api',{method:'POST',headers,body:JSON.stringify({path:route,method:options.method||'GET',body})});
}
function authMessage(message:string){if(/invalid login/i.test(message))return 'Email ou senha incorretos.';if(/email not confirmed/i.test(message))return 'Confirme seu email antes de entrar.';if(/email address.*not authorized/i.test(message))return 'O envio de confirmação está restrito no Supabase. O administrador precisa configurar o serviço de email.';if(/rate limit/i.test(message))return 'Limite temporário de tentativas. Aguarde e tente novamente.';return message}
