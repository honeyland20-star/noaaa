const assert=require('node:assert/strict');
const assess=require('./app/src/main/assets/rules.js');
const now=1700000000000, q={lastUpdate:now,bids:[[100,20]],asks:[[100.1,20]]};
const cfg={side:'buy',limit:101,budget:10,spread:0.2}, news=[{title:'Market update'}];
assert(assess(q,news,cfg,now).ready);
for(const value of [assess(q,[],cfg,now),assess(q,news,cfg,now+60000),assess(q,[{title:'Exchange hacked'}],cfg,now),assess(q,news,{...cfg,limit:99},now),assess(q,news,{...cfg,spread:.01},now),assess(q,news,{...cfg,budget:3000},now)])assert(!value.ready);
assert(assess(q,news,{...cfg,side:'sell',limit:99},now).ready);
assert(!assess(q,news,{...cfg,side:'sell',limit:101},now).ready);
console.log('Nine strategy checks passed');
