import {test} from 'node:test';
import assert from 'node:assert/strict';
import {passwordError,requestRecovery,resetPassword} from '../src/lib/password-recovery.ts';

test('recovery validates email and uses the application root redirect',async()=>{
 let calls=0;
 const client={auth:{resetPasswordForEmail:async(email,options)=>{calls++;assert.equal(email,'cliente@example.com');assert.equal(options.redirectTo,'https://helpme.example/');return {error:null}}}};
 await assert.rejects(requestRecovery(client,'invalid','https://helpme.example'),/email válido/);
 assert.equal(calls,0);
 await requestRecovery(client,' cliente@example.com ','https://helpme.example/path?next=evil');
 assert.equal(calls,1);
});
test('password change requires recovery authorization, matching passwords and a verified user',async()=>{
 let updates=0,signouts=0;
 const client={auth:{getUser:async()=>({data:{user:{id:'user'}},error:null}),updateUser:async()=>{updates++;return {error:null}},signOut:async()=>{signouts++;return {error:null}}}};
 assert.match(passwordError('short','short'),/12/);
 await assert.rejects(resetPassword(client,false,'new-password-123','new-password-123'),/Link inválido/);
 await assert.rejects(resetPassword(client,true,'new-password-123','different-password'),/coincidem/);
 const expired={auth:{...client.auth,getUser:async()=>({data:{user:null},error:new Error('expired')})}};
 await assert.rejects(resetPassword(expired,true,'new-password-123','new-password-123'),/Link inválido/);
 assert.equal(updates,0);
 await resetPassword(client,true,'new-password-123','new-password-123');
 assert.equal(updates,1);assert.equal(signouts,1);
});
