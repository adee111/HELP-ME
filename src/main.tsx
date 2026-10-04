import {loadCatalog} from './lib/catalog';
import {checkoutUrl} from './lib/checkout';
import ProfilePhoto from './components/ProfilePhoto';
import PasswordRecovery from './components/PasswordRecovery';
import {apiFetch,supabase,initialRecovery,recoveryReady} from './lib/backend';
import {lazy,Suspense,StrictMode,useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
const Dashboard=lazy(()=>import('./features/professional-dashboard/Dashboard'));
const AdminDashboard=lazy(()=>import('./features/admin/AdminDashboard'));
import CustomerArea from './features/customer/CustomerArea';
import './style.css';
import './responsive.css';
type User={id:string;name:string;email:string;phone:string;role:string;approved:boolean;isAdmin:boolean};
type Service={id:string;name:string;price:number;duration:number};
type Offer={professional_id:string;service_id:string;professional_name:string;service_name:string;price:number;duration:number};
type Booking={id:string;service_name:string;professional_name:string;customer_name:string;status:string;payment:string;start:number;end?:number;hourly_rate?:number;billing_minutes?:number;price:number;address:string|null;session_id:string|null};
async function api(path:string,body?:unknown){const r=await apiFetch('/api'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const v=await r.json();if(!r.ok)throw new Error(v.error);return v}
function App(){
 const [recovery,setRecovery]=useState<'request'|'reset'|'invalid'|null>(()=>initialRecovery.has('error')?'invalid':initialRecovery.get('type')==='recovery'||recoveryReady?'reset':null),[resetReady,setResetReady]=useState(recoveryReady);
 const [catalogError,setCatalogError]=useState(''),[catalogBusy,setCatalogBusy]=useState(false);
 const [signupRole,setSignupRole]=useState('customer'),[signupPhoto,setSignupPhoto]=useState('');
 const [user,setUser]=useState<User|null>(null),[services,setServices]=useState<Service[]>([]),[offers,setOffers]=useState<Offer[]>([]),[bookings,setBookings]=useState<Booking[]>([]),[register,setRegister]=useState(()=>new URLSearchParams(location.search).has('cadastro')),[authScreen,setAuthScreen]=useState(()=>new URLSearchParams(location.search).has('cadastro')),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const [stripe,setStripe]=useState(false),[loading,setLoading]=useState(true);
 const params=new URLSearchParams(location.search),providerDemo=params.get('painel')==='demo',customerDemo=params.get('cliente')==='demo';
 async function refresh(){const [s,o,c]=await Promise.all([api('/services'),api('/offers'),api('/config')]);setServices(s);setOffers(o);setStripe(c.stripeConfigured);if(user){const [b,m]=await Promise.all([api('/bookings'),api('/me')]);setBookings(b);setUser(m.user)}}
 useEffect(()=>{let active=true;
 const catalog=loadCatalog(path=>api(path),(path,data)=>{if(!active)return;if(path==='/services')setServices(data as Service[]);if(path==='/offers')setOffers(data as Offer[]);if(path==='/config')setStripe((data as {stripeConfigured:boolean}).stripeConfigured)}).then(error=>{if(active)setCatalogError(error)});
 const account=api('/me').then(value=>{if(active)setUser(value.user)}).catch(()=>{});
 Promise.all([catalog,account]).finally(()=>{if(active)setLoading(false)});return()=>{active=false};
 },[]);
 async function retryCatalog(){setCatalogBusy(true);try{const error=await loadCatalog(path=>api(path),(path,data)=>{if(path==='/services')setServices(data as Service[]);if(path==='/offers')setOffers(data as Offer[]);if(path==='/config')setStripe((data as {stripeConfigured:boolean}).stripeConfigured)});setCatalogError(error)}finally{setCatalogBusy(false)}}

 useEffect(()=>{if(!supabase)return;const {data:{subscription}}=supabase.auth.onAuthStateChange(event=>{if(event==='PASSWORD_RECOVERY'||(event==='INITIAL_SESSION'&&recoveryReady)){setRecovery('reset');setResetReady(true)}else if(event==='SIGNED_OUT'){setUser(null);setBookings([])}else if(event==='SIGNED_IN')queueMicrotask(()=>{api('/me').then(v=>setUser(v.user)).catch(e=>setMessage(e.message))})});return()=>subscription.unsubscribe()},[]);
 useEffect(()=>{if(recovery!=='reset'||resetReady)return;const timer=setTimeout(()=>{if(recoveryReady)setResetReady(true);else setRecovery('invalid')},10000);return()=>clearTimeout(timer)},[recovery,resetReady]);
 const userId=user?.id;
 useEffect(()=>{if(!userId)return;let active=true;api('/bookings').then(b=>{if(active)setBookings(b)}).catch(e=>{if(active)setMessage(e.message)});return()=>{active=false}},[userId]);
 useEffect(()=>{
  const query=new URLSearchParams(location.search),bookingId=query.get('booking');
  if(!userId||query.get('payment')!=='return')return;
  let active=true,attempts=0,timer:ReturnType<typeof setTimeout>;
  const poll=async()=>{try{const rows:Booking[]=await api('/bookings');if(!active)return;setBookings(rows);if(bookingId&&rows.some(b=>b.id===bookingId&&b.payment==='paid'))return;}catch(e){if(active)setMessage(e instanceof Error?e.message:'Não foi possível atualizar o pagamento.');}if(active&&++attempts<12)timer=setTimeout(poll,5000);};
  poll();return()=>{active=false;clearTimeout(timer)};
 },[userId]);
 async function mutation(fn:()=>Promise<void>){setBusy(true);setMessage('');try{await fn()}finally{setBusy(false)}}
 async function logout(){try{await mutation(async()=>{await api('/auth/logout',{});setUser(null);setBookings([])})}catch(e){setMessage(e instanceof Error?e.message:'Erro ao sair.')}}
 function enter(signup:boolean){setRegister(signup);setAuthScreen(true);setMessage('')}
 if(recovery)return <PasswordRecovery key={recovery} mode={recovery} ready={resetReady} onRequest={()=>setRecovery('request')} onBack={changed=>{setRecovery(null);setUser(null);setAuthScreen(true);setRegister(false);setMessage(changed?'Senha alterada. Entre com sua nova senha.':'');history.replaceState(null,'',location.pathname)}}/>;
 if(params.get('admin')==='demo'||user?.isAdmin)return <AdminDashboard demo={params.get('admin')==='demo'} name={user?.name||'Administrador'} onLogout={()=>{if(params.get('admin')==='demo')location.assign('/');else logout()}}/>;
 if(providerDemo||user?.role==='professional')return <Dashboard userId={providerDemo?'demo-professional':user!.id} name={providerDemo?'Prestador exemplo':user!.name} approved={providerDemo||user!.approved} bookings={bookings} busy={busy} error={message} demo={providerDemo} services={services} onRefresh={()=>{refresh().catch(e=>setMessage(e.message))}} onLogout={()=>{if(providerDemo){location.assign('/');return}logout()}} onStatus={(id,status)=>mutation(async()=>{await api('/bookings/'+id+'/status',{status});await refresh()})} onConfigure={(type,data)=>mutation(async()=>{await api('/'+type,data);await refresh()})}/>;
 if(authScreen&&!user&&!customerDemo)return <><header><a className="logo" href="/">Help<span>.me</span></a><button onClick={()=>setAuthScreen(false)}>Explorar prestadores</button></header><main><section className="card login"><h1 style={{fontSize:30,letterSpacing:-1}}>{register?'Crie sua conta':'Bem-vindo de volta'}</h1><p>{register?'Cadastre-se para solicitar serviços e conversar com os prestadores.':'Entre para acompanhar seus serviços e mensagens.'}</p>{message&&<div className="notice" role="alert">{message}</div>}<form onSubmit={e=>{e.preventDefault();const f={...Object.fromEntries(new FormData(e.currentTarget)),photo_url:signupRole==='professional'?signupPhoto:''};mutation(async()=>{const result=await api('/auth/'+(register?'register':'login'),f);if(result.requiresConfirmation){setRegister(false);setMessage('Cadastro solicitado. Confirme o email e volte a esta página para entrar.');return}setUser(result.user);setAuthScreen(false)}).catch(e=>setMessage(e.message))}}>{register&&<><label>Nome completo<input name="name" autoComplete="name" minLength={2} maxLength={100} required/></label><label>Telefone<input name="phone" autoComplete="tel" required placeholder="(49) 99999-9999"/></label><label>Quero usar como<select name="role" value={signupRole} onChange={e=>setSignupRole(e.target.value)}><option value="customer">Cliente</option><option value="professional">Prestador de serviços</option></select></label>{signupRole==='professional'&&<fieldset className="profile-fields"><legend>Seu perfil público</legend><ProfilePhoto value={signupPhoto} onChange={setSignupPhoto}/><label>Apresentação<textarea name="bio" minLength={10} maxLength={1500} required placeholder="Conte sua experiência e como você trabalha."/></label><label>Habilidades<textarea name="skills" minLength={3} maxLength={1000} required placeholder="Ex.: limpeza residencial, organização, cuidados infantis…"/></label><label>Referências e experiências<textarea name="references" maxLength={1500} placeholder="Descreva experiências anteriores e referências profissionais."/></label><small>Estas informações aparecerão no seu perfil público após a aprovação.</small></fieldset>}</>}<label>Email<input name="email" type="email" autoComplete="email" required/></label><label>Senha<input name="password" type="password" minLength={register?12:1} maxLength={128} required autoComplete={register?'new-password':'current-password'}/></label>{register&&<small>Use pelo menos 12 caracteres. Você poderá precisar confirmar seu email antes de entrar.</small>}<button className="primary" disabled={busy}>{busy?'Aguarde…':register?'Criar minha conta':'Entrar'}</button></form>{!register&&<button style={{marginTop:15}} disabled={busy} onClick={()=>setRecovery('request')}>Esqueci minha senha</button>}<button style={{marginTop:15}} onClick={()=>enter(!register)}>{register?'Já tenho uma conta':'Criar conta'}</button></section></main></>;
 if(loading&&!customerDemo)return <main><p role="status">Carregando a plataforma…</p></main>;
 return <CustomerArea user={user} offers={offers} bookings={bookings} services={services} busy={busy} error={message} catalogError={catalogError} catalogBusy={catalogBusy} onRetryCatalog={retryCatalog} stripe={stripe} demo={customerDemo} onRegister={()=>enter(true)} onLogin={()=>enter(false)} onLogout={()=>{if(customerDemo){location.assign('/');return}logout()}} onBook={input=>mutation(async()=>{await api('/bookings',input);await refresh()})} onCancel={id=>mutation(async()=>{await api('/bookings/'+id+'/status',{status:'cancelled'});await refresh()})} onPay={id=>mutation(async()=>{const data=await api('/checkout',{bookingId:id});location.assign(checkoutUrl(data.url))})}/>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><Suspense fallback={<main><p role="status">Carregando seu painel…</p></main>}><App/></Suspense></StrictMode>);
