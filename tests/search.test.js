import {test} from 'node:test';
import assert from 'node:assert/strict';
import {filterOffers} from '../src/features/customer/search.ts';
const offers=[{professional_name:'Ana',service_name:'Babá',service_id:'babysitting',price:12000,duration:240},{professional_name:'João',service_name:'Limpeza residencial',service_id:'residential',price:18000,duration:240},{professional_name:'Maria',service_name:'Limpeza pesada',service_id:'deep',price:26000,duration:360}];
const base={query:'',category:'all',service:'all',maxPrice:'all',duration:'all',sort:'price'};
test('busca encontra babás e nomes com ou sem acento',()=>{assert.equal(filterOffers(offers,{...base,query:'babás'})[0].service_id,'babysitting');assert.equal(filterOffers(offers,{...base,query:'joao limpeza'})[0].professional_name,'João')});
test('categoria, tipo, preço e duração combinam sem modificar ofertas',()=>{assert.equal(filterOffers(offers,{...base,category:'cleaning',maxPrice:'200',duration:'4'}).length,1);assert.equal(filterOffers(offers,{...base,category:'childcare'}).length,1);assert.equal(filterOffers(offers,{...base,category:'childcare',service:'deep'}).length,0);assert.equal(filterOffers(offers,{...base,duration:'2'}).length,0);assert.equal(filterOffers(offers,{...base,sort:'priceDesc'})[0].price,26000);assert.equal(offers[0].price,12000)});
