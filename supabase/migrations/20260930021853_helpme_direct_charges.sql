create table helpme.connected_accounts(professional_id uuid primary key references helpme.profiles(id),account_id text unique not null check(account_id ~ '^acct_[A-Za-z0-9]+$'),created_at timestamptz not null default now());
alter table helpme.connected_accounts enable row level security;
create policy edge_only on helpme.connected_accounts for all to service_role using(true) with check(true);
grant all on helpme.connected_accounts to service_role;
alter table helpme.bookings add column connected_account text;
alter table helpme.payment_ledger add column connected_account text;
alter table helpme.payment_ledger add column platform_fee_amount int;
alter table helpme.payment_ledger add column provider_gross_amount int;
create function public.helpme_connect_profile(actor uuid) returns jsonb language plpgsql security invoker set search_path='' as $$declare p helpme.profiles;begin
 select * into p from helpme.profiles where id=actor;
 if p.id is null or p.role<>'professional' or p.account_status<>'approved' then raise exception 'Perfil de prestador aprovado obrigatório.' using errcode='PT403';end if;
 return jsonb_build_object('id',p.id,'name',p.name,'email',p.email,'account_id',(select c.account_id from helpme.connected_accounts c where c.professional_id=p.id));end$$;
create function public.helpme_connect_save(actor uuid,account_id text) returns void language plpgsql security invoker set search_path='' as $$begin
 perform public.helpme_connect_profile(actor);
 insert into helpme.connected_accounts(professional_id,account_id) values(actor,account_id) on conflict(professional_id) do nothing;
end$$;
create function public.helpme_direct_checkout(actor uuid,phase text,payload jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$declare b jsonb;acct text;begin
 if phase not in('/checkout_prepare','/checkout_complete','/checkout_release') then raise exception 'Fase inválida.' using errcode='PT400';end if;
 b:=public.helpme_api(actor,phase,'POST',payload);
 select c.account_id into acct from helpme.connected_accounts c join helpme.profiles p on p.id=c.professional_id where c.professional_id=(b->>'professional_id')::uuid and p.account_status='approved';
 if acct is null then raise exception 'O prestador precisa habilitar sua conta de pagamentos.' using errcode='PT409';end if;
 if (b->>'session_id') is not null and (b->>'connected_account') is distinct from acct then raise exception 'Checkout antigo incompatível com cobrança direta.' using errcode='PT409';end if;
 if phase='/checkout_complete' then update helpme.bookings set connected_account=acct where id=(b->>'id')::uuid;end if;
 return b||jsonb_build_object('connected_account',acct,'platform_fee_amount',((b->>'price')::int*15+50)/100);
end$$;
-- Replace the previous platform-payment confirmation. Only Connect events can confirm new payments.
drop function public.helpme_confirm_payment(text,text,uuid,int,text,boolean);
create function public.helpme_confirm_payment(event_id text,session_id text,booking_id uuid,amount int,currency text,live boolean,connected_account text,application_fee int) returns void language plpgsql security invoker set search_path='' as $$declare b helpme.bookings;fee int;begin
 if exists(select 1 from helpme.stripe_events e where e.id=event_id) then return;end if;
 select * into b from helpme.bookings x where x.session_id=helpme_confirm_payment.session_id for update;
 if b.id is null then raise exception 'Sessão ainda não registrada.' using errcode='PT409';end if;
 fee:=(b.price*15+50)/100;
 if b.connected_account is null or connected_account is distinct from b.connected_account or b.id is distinct from booking_id or b.price is distinct from amount or currency is distinct from 'brl' or live is distinct from false or application_fee is distinct from fee then raise exception 'Pagamento direto incompatível.' using errcode='PT400';end if;
 update helpme.bookings set payment='paid' where id=b.id;
 insert into helpme.payment_ledger(session_id,booking_id,event_id,amount,currency,confirmed_at,test_mode,connected_account,platform_fee_amount,provider_gross_amount) values(session_id,b.id,event_id,amount,currency,(extract(epoch from now())*1000)::bigint,1,connected_account,fee,amount-fee) on conflict do nothing;
 insert into helpme.stripe_events values(event_id) on conflict do nothing;
end$$;
revoke all on function public.helpme_connect_profile(uuid),public.helpme_connect_save(uuid,text),public.helpme_direct_checkout(uuid,text,jsonb),public.helpme_confirm_payment(text,text,uuid,int,text,boolean,text,int) from public,anon,authenticated;
grant execute on function public.helpme_connect_profile(uuid),public.helpme_connect_save(uuid,text),public.helpme_direct_checkout(uuid,text,jsonb),public.helpme_confirm_payment(text,text,uuid,int,text,boolean,text,int) to service_role;
