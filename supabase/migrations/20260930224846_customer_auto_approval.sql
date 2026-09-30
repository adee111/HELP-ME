-- Clients may use the platform without administrative review.
-- Suspensions and rejections remain effective; professionals still need approval.
create or replace function helpme.auto_approve_customer() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.role='customer' and new.account_status='pending' then
  new.account_status := 'approved';
 end if;
 return new;
end $$;
revoke all on function helpme.auto_approve_customer() from public,anon,authenticated;
create trigger customer_auto_approval before insert or update of role,account_status
on helpme.profiles for each row execute function helpme.auto_approve_customer();
update helpme.profiles set account_status='approved'
where role='customer' and account_status='pending';
