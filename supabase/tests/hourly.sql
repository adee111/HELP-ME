begin;
do $$declare c uuid:=gen_random_uuid();p uuid:=gen_random_uuid();b jsonb;t bigint:=((extract(epoch from now())*1000)::bigint)+86400000;begin
 insert into auth.users(id,email) values(c,'hours-c@example.invalid'),(p,'hours-p@example.invalid');
 insert into helpme.profiles(id,name,email,phone,role,account_status) values(c,'Cliente Hora','hours-c@example.invalid','49999999999','customer','approved'),(p,'Prestador Hora','hours-p@example.invalid','49999999999','professional','approved');
 perform public.helpme_api(p,'/offers','POST','{"serviceId":"residential","price":4500,"duration":240}');
 perform public.helpme_api(p,'/slots','POST',jsonb_build_object('start',to_timestamp(t/1000.0),'end',to_timestamp((t+28800000)/1000.0)));
 b:=public.helpme_api(c,'/bookings','POST',jsonb_build_object('professionalId',p,'serviceId','residential','duration',90,'price',1,'address','Rua de Teste, 100','start',to_timestamp(t/1000.0),'requestKey',gen_random_uuid()));
 if (b->>'price')::int<>6750 or (b->>'hourly_rate')::int<>4500 or (b->>'billing_minutes')::int<>90 then raise exception 'FAILED hourly total snapshot';end if;
 perform public.helpme_reputation(p,'/provider-profile/me','POST','{"bio":"Experiência em limpeza residencial","skills":"Organização","photo_url":"data:image/jpeg;base64,/9j/2Q=="}');
 if (public.helpme_reputation(null,'/provider-profile','GET',jsonb_build_object('professionalId',p))->>'photo_url')<>'data:image/jpeg;base64,/9j/2Q==' then raise exception 'FAILED photo persistence';end if;
 perform public.helpme_api(p,'/offers','POST','{"serviceId":"residential","price":6000,"duration":240}');
 if (select price from helpme.bookings where id=(b->>'id')::uuid)<>6750 then raise exception 'FAILED preserved booked total';end if;
end $$;
rollback;
