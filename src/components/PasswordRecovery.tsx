import {useState} from 'react';
import {supabase} from '../lib/backend';
import {requestRecovery,resetPassword} from '../lib/password-recovery';

type Props={mode:'request'|'reset'|'invalid';ready:boolean;onRequest:()=>void;onBack:(changed:boolean)=>void};
export default function PasswordRecovery({mode,ready,onRequest,onBack}:Props){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[changed,setChanged]=useState(false);
 const reset=mode==='reset';
 return <><header><a className="logo" href="/">Help<span>.me</span></a></header><main><section className="card login"><h1 style={{fontSize:30,letterSpacing:-1}}>{reset?'Crie uma nova senha':'Recuperar senha'}</h1><p>{reset?'Defina uma nova senha para sua conta.':'Informe o email usado no cadastro para receber um link de recuperação.'}</p>{message&&<div className="notice" role="status">{message}</div>}{mode==='invalid'?<><div className="notice" role="alert">Este link é inválido ou expirou. Solicite um novo link de recuperação.</div><button className="primary" onClick={onRequest}>Solicitar novo link</button></>:changed?<p role="status">Senha alterada com sucesso. Você já pode entrar com a nova senha.</p>:<form onSubmit={async e=>{
 e.preventDefault();const form=e.currentTarget,data=new FormData(form);setBusy(true);setMessage('');
 try{if(reset){await resetPassword(supabase,ready,String(data.get('password')),String(data.get('confirmation')));form.reset();setChanged(true)}else{await requestRecovery(supabase,String(data.get('email')),location.origin);setMessage('Se houver uma conta com esse email, você receberá um link de recuperação. Confira também a pasta de spam.')}}catch(error){setMessage(error instanceof Error?error.message:'Não foi possível concluir. Tente novamente.')}finally{setBusy(false)}
 }}>{reset?<><label>Nova senha<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required disabled={!ready||busy}/></label><label>Confirme a nova senha<input name="confirmation" type="password" autoComplete="new-password" minLength={12} maxLength={128} required disabled={!ready||busy}/></label><small>Use entre 12 e 128 caracteres.</small></>:<label>Email<input name="email" type="email" autoComplete="email" required disabled={busy}/></label>}<button className="primary" disabled={busy||(reset&&!ready)}>{busy?'Aguarde…':reset?(ready?'Salvar nova senha':'Validando link…'):'Enviar link de recuperação'}</button></form>}<button style={{marginTop:15}} disabled={busy} onClick={()=>onBack(changed)}>Voltar ao login</button></section></main></>;
}
