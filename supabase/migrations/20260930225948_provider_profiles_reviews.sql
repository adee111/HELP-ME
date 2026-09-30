create table helpme.provider_profiles(
 professional_id uuid primary key references helpme.profiles(id),
 bio text not null default '' check(length(bio)<=1500),
 skills text not null default '' check(length(skills)<=1000),
 references_text text not null default '' check(length(references_text)<=1500)
);
create table helpme.service_reviews(
 id uuid primary key default gen_random_uuid(),
 booking_id uuid not null unique references helpme.bookings(id),
 customer_id uuid not null references helpme.profiles(id),
 professional_id uuid not null references helpme.profiles(id),
 rating integer not null check(rating between 1 and 5),
 comment text not null check(length(comment) between 3 and 1000),
 created_at bigint not null default ((extract(epoch from now())*1000)::bigint)
);
create index service_reviews_professional on helpme.service_reviews(professional_id,created_at desc);
alter table helpme.provider_profiles enable row level security;
alter table helpme.service_reviews enable row level security;
revoke all on helpme.provider_profiles,helpme.service_reviews from public,anon,authenticated;
grant all on helpme.provider_profiles,helpme.service_reviews to service_role;
create policy edge_only on helpme.provider_profiles for all to service_role using(true) with check(true);
create policy edge_only on helpme.service_reviews for all to service_role using(true) with check(true);
create function public.helpme_reputation(actor uuid,route text,verb text,payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare u helpme.profiles; b helpme.bookings; pid uuid; v_rating integer; v_comment text; v_bio text; v_skills text; v_refs text;
begin
 if route='/offers' and verb='GET' then
 return coalesce((select jsonb_agg(to_jsonb(q)) from (
 select o.*,p.name professional_name,s.name service_name,coalesce(d.bio,'') bio,coalesce(d.skills,'') skills,
 (select round(avg(r.rating),1) from helpme.service_reviews r where r.professional_id=p.id) rating_average,
 (select count(*) from helpme.service_reviews r where r.professional_id=p.id) review_count
 from helpme.offers o join helpme.profiles p on p.id=o.professional_id join helpme.services s on s.id=o.service_id
 left join helpme.provider_profiles d on d.professional_id=p.id where p.role='professional' and p.account_status='approved') q),'[]');
 end if;
 if route='/provider-profile' and verb='GET' then
 pid:=(payload->>'professionalId')::uuid;
 if not exists(select 1 from helpme.profiles p where p.id=pid and p.role='professional' and p.account_status='approved') then raise exception 'Perfil não encontrado.' using errcode='PT404';end if;
 return jsonb_build_object('name',(select name from helpme.profiles where id=pid),'bio',coalesce((select bio from helpme.provider_profiles where professional_id=pid),''),'skills',coalesce((select skills from helpme.provider_profiles where professional_id=pid),''),'references',coalesce((select references_text from helpme.provider_profiles where professional_id=pid),''),'rating_average',(select round(avg(rating),1) from helpme.service_reviews where professional_id=pid),'review_count',(select count(*) from helpme.service_reviews where professional_id=pid),'reviews',coalesce((select jsonb_agg(to_jsonb(q)) from(select r.id,r.rating,r.comment,r.created_at,split_part(c.name,' ',1) customer_name,s.name service_name from helpme.service_reviews r join helpme.profiles c on c.id=r.customer_id join helpme.bookings b on b.id=r.booking_id join helpme.services s on s.id=b.service_id where r.professional_id=pid order by r.created_at desc limit 100)q),'[]'));
 end if;
 select * into u from helpme.profiles where id=actor;
 if u.id is null then raise exception 'Entre na sua conta.' using errcode='PT401';end if;
 if verb='POST' and u.account_status in ('suspended','rejected') then raise exception 'Conta bloqueada para novas operações.' using errcode='PT403';end if;
 if route='/provider-profile/me' and verb='GET' then
 if u.role<>'professional' then raise exception 'Somente prestadores.' using errcode='PT403';end if;
 return coalesce((select jsonb_build_object('bio',bio,'skills',skills,'references',references_text) from helpme.provider_profiles where professional_id=actor),'{}');
 end if;
 if route in('/provider-profile/me','/provider-profile/init') and verb='POST' then
 if u.role<>'professional' then raise exception 'Somente prestadores.' using errcode='PT403';end if;
 v_bio:=btrim(coalesce(payload->>'bio',''));v_skills:=btrim(coalesce(payload->>'skills',''));v_refs:=btrim(coalesce(payload->>'references',''));
 if length(v_bio)>1500 or length(v_skills)>1000 or length(v_refs)>1500 or (route='/provider-profile/me' and (length(v_bio)<10 or length(v_skills)<3)) then raise exception 'Confira sua apresentação e habilidades.' using errcode='PT400';end if;
 if route='/provider-profile/init' then
 insert into helpme.provider_profiles values(actor,v_bio,v_skills,v_refs) on conflict(professional_id) do nothing;
 else insert into helpme.provider_profiles values(actor,v_bio,v_skills,v_refs) on conflict(professional_id) do update set bio=excluded.bio,skills=excluded.skills,references_text=excluded.references_text;end if;
 return '{"ok":true}';
 end if;
 if route='/reviews/mine' and verb='GET' then
 return coalesce((select jsonb_agg(jsonb_build_object('booking_id',booking_id,'rating',rating,'comment',comment)) from helpme.service_reviews where customer_id=actor),'[]');
 end if;
 if route='/reviews' and verb='POST' then
 if u.role<>'customer' then raise exception 'Somente clientes podem avaliar.' using errcode='PT403';end if;
 select * into b from helpme.bookings where id=(payload->>'bookingId')::uuid for update;
 if b.id is null or b.customer_id<>actor then raise exception 'Serviço não encontrado.' using errcode='PT404';end if;
 if b.status<>'completed' then raise exception 'A avaliação fica disponível após a conclusão do serviço.' using errcode='PT409';end if;
 if exists(select 1 from helpme.service_reviews where booking_id=b.id) then raise exception 'Este serviço já foi avaliado.' using errcode='PT409';end if;
 if coalesce(payload->>'rating','') !~ '^[1-5]$' then raise exception 'Escolha de 1 a 5 estrelas.' using errcode='PT400';end if;
 v_rating:=(payload->>'rating')::integer;v_comment:=btrim(coalesce(payload->>'comment',''));
 if length(v_comment) not between 3 and 1000 then raise exception 'Escreva um comentário de 3 a 1000 caracteres.' using errcode='PT400';end if;
 insert into helpme.service_reviews(booking_id,customer_id,professional_id,rating,comment) values(b.id,actor,b.professional_id,v_rating,v_comment);
 return '{"ok":true}';
 end if;
 raise exception 'Rota não encontrada.' using errcode='PT404';
end $$;
revoke all on function public.helpme_reputation(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.helpme_reputation(uuid,text,text,jsonb) to service_role;
