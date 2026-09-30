-- Reference only: each professional chooses the price/duration of their own offer.
insert into helpme.services(id,name,price,duration) values('babysitting','Babá',12000,240) on conflict(id) do nothing;
