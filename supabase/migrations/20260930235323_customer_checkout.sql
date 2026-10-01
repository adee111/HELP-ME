alter table helpme.bookings add column checkout_key uuid not null default gen_random_uuid();
alter table helpme.bookings add column checkout_lock_key uuid;

-- Only the authenticated customer's Edge Function may drive these transitions.
create or replace function public.helpme_direct_checkout(actor uuid,phase text,payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare b helpme.bookings; u helpme.profiles; acct text; clock bigint:=(extract(epoch from now())*1000)::bigint;
begin
 if phase not in('/checkout_prepare','/checkout_complete','/checkout_release','/checkout_expire') then raise exception 'Fase inválida.' using errcode='PT400';end if;
 select * into u from helpme.profiles where id=actor for update;
 if u.id is null or u.role<>'customer' or u.account_status<>'approved' or exists(select 1 from helpme.admins where user_id=actor) then raise exception 'Pagamento exclusivo do cliente do pedido.' using errcode='PT403';end if;
 select * into b from helpme.bookings where id=(payload->>'bookingId')::uuid and customer_id=actor for update;
 if b.id is null then raise exception 'Pedido não encontrado.' using errcode='PT404';end if;
 if phase='/checkout_release' then
  update helpme.bookings set checkout_lock_until=0 where id=b.id and checkout_lock_key=(payload->>'lockKey')::uuid;
  return '{}'::jsonb;
 end if;
 if b.status not in('accepted','completed') or b.payment='paid' then raise exception 'Este pedido não está disponível para pagamento.' using errcode='PT409';end if;
 select c.account_id into acct from helpme.connected_accounts c join helpme.profiles p on p.id=c.professional_id where c.professional_id=b.professional_id and p.account_status='approved' and p.role='professional';
 if acct is null then raise exception 'O prestador precisa habilitar sua conta de pagamentos.' using errcode='PT409';end if;
 if b.session_id is not null and b.connected_account is distinct from acct then raise exception 'Checkout incompatível com a conta do prestador.' using errcode='PT409';end if;
 if phase='/checkout_prepare' then
  if b.checkout_lock_until>clock then raise exception 'Checkout em criação. Aguarde alguns segundos.' using errcode='PT409';end if;
  update helpme.bookings set checkout_lock_until=clock+120000,checkout_lock_key=gen_random_uuid() where id=b.id returning * into b;
 else
  if b.checkout_lock_key is distinct from (payload->>'lockKey')::uuid or b.checkout_lock_until<=clock then raise exception 'Tentativa de checkout expirada. Tente novamente.' using errcode='PT409';end if;
  if phase='/checkout_expire' then
   if b.session_id is distinct from payload->>'sessionId' then raise exception 'Sessão incompatível.' using errcode='PT409';end if;
   -- The server verifies Stripe reports expiration or failed payment before requesting this transition.
   update helpme.bookings set session_id=null,checkout_url=null,connected_account=null,checkout_key=gen_random_uuid() where id=b.id returning * into b;
  elsif phase='/checkout_complete' then
   if payload->>'sessionId' is null or payload->>'url' is null then raise exception 'Sessão inválida.' using errcode='PT400';end if;
   update helpme.bookings set session_id=payload->>'sessionId',checkout_url=payload->>'url',connected_account=acct,checkout_lock_until=0 where id=b.id returning * into b;
  end if;
 end if;
 return to_jsonb(b)||jsonb_build_object('service_name',(select name from helpme.services where id=b.service_id),'connected_account',acct);
end$$;
revoke all on function public.helpme_direct_checkout(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.helpme_direct_checkout(uuid,text,jsonb) to service_role;
