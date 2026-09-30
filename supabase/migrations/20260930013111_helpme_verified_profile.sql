-- Only the Edge API may supply the identity verified with auth.getUser().
drop function public.helpme_ensure_profile(uuid,text,text,text);
create function public.helpme_ensure_profile(actor uuid,verified_email text,display_name text,contact_phone text,requested_role text) returns void language plpgsql security invoker set search_path='' as $$begin
 if actor is null or verified_email is null or requested_role is null or requested_role not in('customer','professional') then raise exception 'Perfil inválido.' using errcode='PT400';end if;
 insert into helpme.profiles(id,name,email,phone,role) values(actor,left(display_name,100),verified_email,left(contact_phone,20),requested_role) on conflict(id) do nothing;
end $$;
revoke all on function public.helpme_ensure_profile(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.helpme_ensure_profile(uuid,text,text,text,text) to service_role;
-- Document the intended deny-all browser access explicitly, without granting access.
do $$declare t text;begin foreach t in array array['profiles','admins','services','offers','slots','bookings','messages','admin_audit','payment_ledger','stripe_events'] loop execute format('create policy edge_only on helpme.%I for all to service_role using(true) with check(true)',t);end loop;end$$;
