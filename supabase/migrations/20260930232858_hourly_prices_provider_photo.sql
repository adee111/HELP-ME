-- Preserve existing booking totals; convert current catalog package prices to hourly rates.
alter table helpme.provider_profiles add column photo_url text not null default '' check(length(photo_url)<=40000 and (photo_url='' or photo_url ~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$'));
alter table helpme.bookings add column hourly_rate integer;
alter table helpme.bookings add column billing_minutes integer;
update helpme.bookings set billing_minutes=(("end"-start)/60000)::integer, hourly_rate=round(price::numeric*3600000/("end"-start))::integer where "end">start;
update helpme.offers set price=greatest(100,round(price::numeric*60/duration)::integer);
update helpme.services set price=greatest(100,round(price::numeric*60/duration)::integer);

create or replace function public.helpme_api(actor uuid,route text,verb text,payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
#variable_conflict use_column
declare minutes integer; u helpme.profiles; b helpme.bookings; o helpme.offers; target helpme.profiles; m helpme.messages; result jsonb; bid uuid; pid uuid; st bigint; en bigint; clock bigint:=(extract(epoch from now())*1000)::bigint; is_admin boolean; new_status text; note text;
begin
 if route='/services' and verb='GET' then return coalesce((select jsonb_agg(to_jsonb(s)) from helpme.services s),'[]'); end if;
 if route='/offers' and verb='GET' then return coalesce((select jsonb_agg(to_jsonb(q)) from (select o.*,p.name professional_name,s.name service_name from helpme.offers o join helpme.profiles p on p.id=o.professional_id join helpme.services s on s.id=o.service_id where p.account_status='approved')q),'[]');end if;
 if route='/professionals' and verb='GET' then return coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name)) from helpme.profiles where role='professional' and account_status='approved'),'[]');end if;
 select * into u from helpme.profiles where id=actor for update;
 if u.id is null then raise exception 'Entre na sua conta.' using errcode='PT401';end if;
 select exists(select 1 from helpme.admins where user_id=actor) into is_admin;
 if verb<>'GET' and u.account_status in ('rejected','suspended') then raise exception 'Conta bloqueada para novas operações.' using errcode='PT403';end if;
 if route='/me' and verb='GET' then return jsonb_build_object('user',jsonb_build_object('id',u.id,'name',u.name,'email',u.email,'phone',u.phone,'role',u.role,'approved',u.account_status='approved','accountStatus',u.account_status,'isAdmin',is_admin));end if;
 if route='/admin' and verb='GET' then
 if not is_admin or u.account_status<>'approved' then raise exception 'Acesso exclusivo para administradores.' using errcode='PT403';end if;
 return jsonb_build_object('users',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'email',p.email,'phone',p.phone,'role',p.role,'approved',p.account_status='approved','accountStatus',p.account_status,'isAdmin',exists(select 1 from helpme.admins a where a.user_id=p.id))) from helpme.profiles p),'[]'),'bookings',coalesce((select jsonb_agg(to_jsonb(q)) from(select b.id,b.start,b."end",b.price,b.hourly_rate,b.billing_minutes,b.status,b.payment,s.name service_name,c.name customer_name,p.name professional_name from helpme.bookings b join helpme.services s on s.id=b.service_id join helpme.profiles c on c.id=b.customer_id join helpme.profiles p on p.id=b.professional_id order by b.start desc)q),'[]'),'payments',coalesce((select jsonb_agg(to_jsonb(q)) from(select l.*,c.name customer_name,p.name professional_name,s.name service_name from helpme.payment_ledger l join helpme.bookings b on b.id=l.booking_id join helpme.profiles c on c.id=b.customer_id join helpme.profiles p on p.id=b.professional_id join helpme.services s on s.id=b.service_id order by l.confirmed_at desc)q),'[]'),'audit',coalesce((select jsonb_agg(to_jsonb(q)) from(select a.*,p.name actor_name,t.name target_name from helpme.admin_audit a join helpme.profiles p on p.id=a.actor_id join helpme.profiles t on t.id=a.target_id order by a.created_at desc limit 200)q),'[]'),'services',coalesce((select jsonb_agg(to_jsonb(q)) from(select s.*,count(o.professional_id) offer_count from helpme.services s left join helpme.offers o on o.service_id=s.id group by s.id)q),'[]'),'messageCount',(select count(*) from helpme.messages));end if;
 if route ~ '^/admin/users/[^/]+/review$' and verb='POST' then
 if not is_admin or u.account_status<>'approved' then raise exception 'Acesso exclusivo para administradores.' using errcode='PT403';end if;
 pid:=split_part(route,'/',4)::uuid;new_status:=payload->>'status';note:=btrim(payload->>'note');
 if new_status is null or new_status not in ('approved','rejected','suspended','pending') or note is null or length(note) not between 2 and 500 then raise exception 'Confira os campos.' using errcode='PT400';end if;
 select * into target from helpme.profiles where id=pid for update;
 if target.id is null then raise exception 'Conta não encontrada.' using errcode='PT404';end if;
 if exists(select 1 from helpme.admins where user_id=pid) then raise exception 'Administrador protegido.' using errcode='PT409';end if;
 if target.account_status=new_status then raise exception 'Status já aplicado.' using errcode='PT409';end if;
 update helpme.profiles set account_status=new_status where id=pid;
 insert into helpme.admin_audit(actor_id,target_id,previous_status,status,note,created_at) values(actor,pid,target.account_status,new_status,note,clock);return '{"ok":true}';end if;
 if route='/bookings' and verb='GET' then return coalesce((select jsonb_agg(to_jsonb(q)) from (select b.id,b.customer_id,b.professional_id,b.service_id,b.start,b."end",b.price,b.hourly_rate,b.billing_minutes,b.status,b.payment,b.session_id,case when b.customer_id=actor or b.status in ('accepted','completed') then b.address else null end address,s.name service_name,c.name customer_name,p.name professional_name from helpme.bookings b join helpme.services s on s.id=b.service_id join helpme.profiles c on c.id=b.customer_id join helpme.profiles p on p.id=b.professional_id where actor in (b.customer_id,b.professional_id) order by b.start desc)q),'[]');end if;
 if route='/offers' and verb='POST' then
 if u.role<>'professional' then raise exception 'Somente profissionais.' using errcode='PT403';end if;
 insert into helpme.offers values(actor,payload->>'serviceId',(payload->>'price')::int,(payload->>'duration')::int) on conflict(professional_id,service_id) do update set price=excluded.price,duration=excluded.duration;return '{"ok":true}';end if;
 if route='/slots' and verb='POST' then
 if u.role<>'professional' then raise exception 'Somente profissionais.' using errcode='PT403';end if;
 st:=(extract(epoch from (payload->>'start')::timestamptz)*1000)::bigint;en:=(extract(epoch from(payload->>'end')::timestamptz)*1000)::bigint;
 if st is null or en is null or st<=clock or en<=st or en-st>86400000 then raise exception 'Intervalo inválido.' using errcode='PT400';end if;
 insert into helpme.slots(professional_id,start,"end") values(actor,st,en);return '{"ok":true}';end if;
 if route ~ '^/professionals/[^/]+/availability$' and verb='GET' then
 pid:=split_part(route,'/',3)::uuid;
 select x.* into o from helpme.offers x join helpme.profiles p on p.id=x.professional_id where x.professional_id=pid and x.service_id=payload->>'serviceId' and p.account_status='approved';
 if o.professional_id is null then raise exception 'Oferta não encontrada.' using errcode='PT404';end if;minutes:=coalesce((payload->>'duration')::integer,o.duration);if minutes not between 30 and 720 or minutes%30<>0 then raise exception 'Escolha de 0,5 a 12 horas, em intervalos de meia hora.' using errcode='PT400';end if;
 return coalesce((select jsonb_agg(to_jsonb(q)) from(select distinct t start,t+minutes::bigint*60000 "end" from helpme.slots s cross join lateral generate_series(((greatest(s.start,clock+60000)+1799999)/1800000)*1800000,least(s."end",clock+5184000000)-minutes::bigint*60000,1800000) t where s.professional_id=pid and s."end">clock and s.start<clock+5184000000 and not exists(select 1 from helpme.bookings b where b.professional_id=pid and b.status in('requested','accepted') and b.start<t+minutes::bigint*60000 and b."end">t) order by t limit 200)q),'[]');end if;
 if route='/bookings' and verb='POST' then
 if u.role<>'customer' or u.account_status<>'approved' then raise exception 'Aguarde a aprovação da conta.' using errcode='PT403';end if;
 -- Profile row serializes reservations and offer changes for this provider.
 pid:=(payload->>'professionalId')::uuid;perform id from helpme.profiles where id=pid for update;
 select * into b from helpme.bookings where customer_id=actor and request_key=(payload->>'requestKey')::uuid;if b.id is not null then return to_jsonb(b);end if;
 select x.* into o from helpme.offers x join helpme.profiles p on p.id=x.professional_id where x.professional_id=pid and x.service_id=payload->>'serviceId' and p.account_status='approved';if o.professional_id is null then raise exception 'Oferta indisponível.' using errcode='PT400';end if;minutes:=coalesce((payload->>'duration')::integer,o.duration);if minutes not between 30 and 720 or minutes%30<>0 then raise exception 'Escolha de 0,5 a 12 horas, em intervalos de meia hora.' using errcode='PT400';end if;
 st:=(extract(epoch from(payload->>'start')::timestamptz)*1000)::bigint;en:=st+minutes::bigint*60000;
 if st is null or st<=clock then raise exception 'Escolha horário futuro.' using errcode='PT400';end if;
 if not exists(select 1 from helpme.slots where professional_id=pid and start<=st and "end">=en) or exists(select 1 from helpme.bookings where professional_id=pid and status in('requested','accepted') and start<en and "end">st) then raise exception 'Horário indisponível.' using errcode='PT409';end if;
 insert into helpme.bookings(customer_id,professional_id,service_id,address,start,"end",price,request_key,hourly_rate,billing_minutes) values(actor,pid,o.service_id,btrim(payload->>'address'),st,en,round(o.price::numeric*minutes/60)::integer,(payload->>'requestKey')::uuid,o.price,minutes) returning * into b;return to_jsonb(b);end if;
 if route ~ '^/bookings/[^/]+/(messages|status)$' then
 bid:=split_part(route,'/',3)::uuid;select * into b from helpme.bookings where id=bid for update;
 if b.id is null or actor not in(b.customer_id,b.professional_id) then raise exception 'Pedido não encontrado.' using errcode='PT404';end if;
 if route like '%/messages' then
 if verb='GET' then return coalesce((select jsonb_agg(to_jsonb(q)) from(select seq,id,booking_id,sender_id,body,created_at from helpme.messages where booking_id=bid and seq>coalesce((payload->>'after')::bigint,0) order by seq limit 100)q),'[]');end if;
 if verb='POST' then
 note:=btrim(payload->>'body');if note is null or length(note) not between 1 and 2000 then raise exception 'Mensagem inválida.' using errcode='PT400';end if;
 select * into m from helpme.messages where sender_id=actor and client_message_id=(payload->>'clientMessageId')::uuid;
 if m.id is not null then if m.body<>note or m.booking_id<>bid then raise exception 'Identificador já utilizado.' using errcode='PT409';end if;return to_jsonb(m);end if;
 perform id from helpme.profiles where id=actor for update;
 if (select count(*) from helpme.messages where sender_id=actor and created_at>clock-60000)>=30 then raise exception 'Aguarde antes de enviar mais mensagens.' using errcode='PT429';end if;
 insert into helpme.messages(booking_id,sender_id,body,created_at,client_message_id) values(bid,actor,note,clock,(payload->>'clientMessageId')::uuid) returning * into m;return to_jsonb(m);end if;
 else
 if verb='POST' then new_status:=payload->>'status';
 if b.checkout_lock_until>clock then raise exception 'Checkout em criação.' using errcode='PT409';end if;
 if new_status='cancelled' then if b.status not in('requested','accepted') or b.start<=clock or b.payment='paid' or b.session_id is not null then raise exception 'Cancelamento indisponível.' using errcode='PT409';end if;
 elsif new_status in('accepted','rejected') then if actor<>b.professional_id or b.status<>'requested' or b.start<=clock then raise exception 'Transição inválida.' using errcode='PT409';end if;
 elsif new_status='completed' then if actor<>b.professional_id or b.status<>'accepted' or b."end">clock then raise exception 'Serviço ainda não finalizado.' using errcode='PT409';end if;
 else raise exception 'Status inválido.' using errcode='PT400';end if;
 update helpme.bookings set status=new_status where id=bid;return '{"ok":true}';end if;end if;end if;
 if route in ('/checkout_prepare','/checkout_complete','/checkout_release') and verb='POST' then
 if u.role<>'customer' or u.account_status<>'approved' then raise exception 'Aguarde a aprovação da conta.' using errcode='PT403';end if;
 select * into b from helpme.bookings where id=(payload->>'bookingId')::uuid and customer_id=actor for update;
 if b.id is null then raise exception 'Pedido não encontrado.' using errcode='PT404';end if;
 if b.status<>'accepted' or b.payment='paid' or b.start<=clock then raise exception 'Pedido não elegível.' using errcode='PT409';end if;
 if route='/checkout_prepare' then
 if b.checkout_url is not null then return to_jsonb(b)||(select jsonb_build_object('service_name',name) from helpme.services where id=b.service_id);end if;
 if b.checkout_lock_until>clock then raise exception 'Checkout em criação.' using errcode='PT409';end if;
 update helpme.bookings set checkout_lock_until=clock+120000 where id=b.id;
 elsif route='/checkout_complete' then update helpme.bookings set session_id=payload->>'sessionId',checkout_url=payload->>'url',checkout_lock_until=0 where id=b.id;
 else update helpme.bookings set checkout_lock_until=0 where id=b.id;end if;
 return to_jsonb(b)||(select jsonb_build_object('service_name',name) from helpme.services where id=b.service_id);end if;
 raise exception 'Rota não encontrada.' using errcode='PT404';
end $$;

create or replace function public.helpme_reputation(actor uuid,route text,verb text,payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare u helpme.profiles; b helpme.bookings; pid uuid; v_rating integer; v_comment text; v_bio text; v_skills text; v_refs text; v_photo text;
begin
 if route='/offers' and verb='GET' then
 return coalesce((select jsonb_agg(to_jsonb(q)) from (
 select o.*,p.name professional_name,s.name service_name,coalesce(d.bio,'') bio,coalesce(d.skills,'') skills,coalesce(d.photo_url,'') photo_url,
 (select round(avg(r.rating),1) from helpme.service_reviews r where r.professional_id=p.id) rating_average,
 (select count(*) from helpme.service_reviews r where r.professional_id=p.id) review_count
 from helpme.offers o join helpme.profiles p on p.id=o.professional_id join helpme.services s on s.id=o.service_id
 left join helpme.provider_profiles d on d.professional_id=p.id where p.role='professional' and p.account_status='approved') q),'[]');
 end if;
 if route='/provider-profile' and verb='GET' then
 pid:=(payload->>'professionalId')::uuid;
 if not exists(select 1 from helpme.profiles p where p.id=pid and p.role='professional' and p.account_status='approved') then raise exception 'Perfil não encontrado.' using errcode='PT404';end if;
 return jsonb_build_object('name',(select name from helpme.profiles where id=pid),'bio',coalesce((select bio from helpme.provider_profiles where professional_id=pid),''),'skills',coalesce((select skills from helpme.provider_profiles where professional_id=pid),''),'references',coalesce((select references_text from helpme.provider_profiles where professional_id=pid),''),'photo_url',coalesce((select photo_url from helpme.provider_profiles where professional_id=pid),''),'rating_average',(select round(avg(rating),1) from helpme.service_reviews where professional_id=pid),'review_count',(select count(*) from helpme.service_reviews where professional_id=pid),'reviews',coalesce((select jsonb_agg(to_jsonb(q)) from(select r.id,r.rating,r.comment,r.created_at,split_part(c.name,' ',1) customer_name,s.name service_name from helpme.service_reviews r join helpme.profiles c on c.id=r.customer_id join helpme.bookings booking on booking.id=r.booking_id join helpme.services s on s.id=booking.service_id where r.professional_id=pid order by r.created_at desc limit 100)q),'[]'));
 end if;
 select * into u from helpme.profiles where id=actor;
 if u.id is null then raise exception 'Entre na sua conta.' using errcode='PT401';end if;
 if verb='POST' and u.account_status in ('suspended','rejected') then raise exception 'Conta bloqueada para novas operações.' using errcode='PT403';end if;
 if route='/provider-profile/me' and verb='GET' then
 if u.role<>'professional' then raise exception 'Somente prestadores.' using errcode='PT403';end if;
 return coalesce((select jsonb_build_object('bio',bio,'skills',skills,'references',references_text,'photo_url',photo_url) from helpme.provider_profiles where professional_id=actor),'{}');
 end if;
 if route in('/provider-profile/me','/provider-profile/init') and verb='POST' then
 if u.role<>'professional' then raise exception 'Somente prestadores.' using errcode='PT403';end if;
 v_bio:=btrim(coalesce(payload->>'bio',''));v_skills:=btrim(coalesce(payload->>'skills',''));v_refs:=btrim(coalesce(payload->>'references',''));v_photo:=coalesce(payload->>'photo_url','');if length(v_photo)>40000 or (v_photo<>'' and v_photo !~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$') then raise exception 'Foto inválida. Escolha uma imagem JPEG, PNG ou WebP pelo formulário.' using errcode='PT400';end if;
 if length(v_bio)>1500 or length(v_skills)>1000 or length(v_refs)>1500 or (route='/provider-profile/me' and (length(v_bio)<10 or length(v_skills)<3)) then raise exception 'Confira sua apresentação e habilidades.' using errcode='PT400';end if;
 if route='/provider-profile/init' then
 insert into helpme.provider_profiles(professional_id,bio,skills,references_text,photo_url) values(actor,v_bio,v_skills,v_refs,v_photo) on conflict(professional_id) do nothing;
 else insert into helpme.provider_profiles(professional_id,bio,skills,references_text,photo_url) values(actor,v_bio,v_skills,v_refs,v_photo) on conflict(professional_id) do update set bio=excluded.bio,skills=excluded.skills,references_text=excluded.references_text,photo_url=excluded.photo_url;end if;
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
