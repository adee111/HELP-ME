import type {SupabaseClient} from '@supabase/supabase-js';

export function passwordError(password:string,confirmation:string){
 if(password.length<12||password.length>128)return 'Use uma senha entre 12 e 128 caracteres.';
 if(password!==confirmation)return 'As senhas não coincidem.';
 return '';
}
export async function requestRecovery(client:SupabaseClient|null,email:string,origin:string){
 if(!client)throw new Error('Recuperação por email indisponível. Entre em contato com o administrador.');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))throw new Error('Informe um email válido.');
 const {error}=await client.auth.resetPasswordForEmail(email.trim(),{redirectTo:new URL('/',origin).href});
 if(error)throw new Error(/rate limit|too many|seconds/i.test(error.message)?'Aguarde um minuto antes de solicitar outro link.':'Não foi possível enviar o link. Tente novamente ou entre em contato com o administrador.');
}
export async function resetPassword(client:SupabaseClient|null,ready:boolean,password:string,confirmation:string){
 const invalid=passwordError(password,confirmation);
 if(invalid)throw new Error(invalid);
 if(!client||!ready)throw new Error('Link inválido ou expirado. Solicite um novo link.');
 const {data,error:sessionError}=await client.auth.getUser();
 if(sessionError||!data.user)throw new Error('Link inválido ou expirado. Solicite um novo link.');
 const {error}=await client.auth.updateUser({password});
 if(error)throw new Error(/same password/i.test(error.message)?'Escolha uma senha diferente da atual.':'Não foi possível alterar a senha. Solicite um novo link ou tente novamente.');
 // Keep the recovery page until the user explicitly returns to login.
 await client.auth.signOut({scope:'local'});
}
