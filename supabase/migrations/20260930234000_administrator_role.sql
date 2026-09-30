-- Administrative privileges still come exclusively from helpme.admins.
alter table helpme.profiles drop constraint profiles_role_check;
alter table helpme.profiles add constraint profiles_role_check check(role in ('customer','professional','admin'));
update helpme.profiles p set role='admin' where exists(select 1 from helpme.admins a where a.user_id=p.id);
create function helpme.set_administrator_role() returns trigger language plpgsql security invoker set search_path='' as $$begin
 update helpme.profiles set role='admin' where id=new.user_id;
 return new;
end $$;
revoke all on function helpme.set_administrator_role() from public,anon,authenticated;
create trigger administrator_role after insert on helpme.admins for each row execute function helpme.set_administrator_role();
