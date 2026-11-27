'use strict';
const hour=3600000, day=24*hour;
const fa=v=>Number(v).toLocaleString('fa-IR',{maximumFractionDigits:3});
const when=v=>new Date(v).toLocaleString('fa-IR');
function number(v){if(v===null||v===undefined||v===''||!Number.isFinite(Number(v)))throw Error('مقدار نامعتبر');return Number(v)}
function fresh(time,age,now){if(!Number.isFinite(time)||time>now+5000||now-time>age)throw Error('داده قدیمی یا بدون زمان معتبر');return time}
function avg(a){return a.reduce((x,y)=>x+y,0)/a.length}
function ema(a,n){let m=avg(a.slice(0,n));for(const p of a.slice(n))m+=(p-m)*2/(n+1);return m}
function study(x,minutes,now){
    const interval=minutes*60000;
    if(x.s!=='ok'||!Array.isArray(x.t)||!['o','h','l','c','v'].every(k=>Array.isArray(x[k])&&x[k].length===x.t.length))throw Error('کندل ناقص');
    const candles=[];
    for(let i=0;i<x.t.length;i++){
        const t=number(x.t[i])*1000;
        if(t+interval>now)continue;
        const [o,h,l,c,v]=['o','h','l','c','v'].map(k=>number(x[k][i]));
        if(l<=0||l>Math.min(o,c)||h<Math.max(o,c)||v<0)throw Error('کندل نامعتبر');
        if(candles.length&&t-candles[candles.length-1].t!==interval)candles.length=0;
        candles.push({t,o,h,l,c,v});
    }
    if(candles.length<50)throw Error('کمتر از ۵۰ کندل بسته و پیوسته');
    const last=candles[candles.length-1], stamp=fresh(last.t+interval,interval+60000,now);
    const close=candles.map(b=>b.c), changes=close.slice(1).map((p,i)=>p-close[i]);
    const wilder=a=>a.slice(14).reduce((m,p)=>(13*m+p)/14,avg(a.slice(0,14)));
    const up=wilder(changes.map(d=>Math.max(d,0))),down=wilder(changes.map(d=>Math.max(-d,0)));
    const rsi=down===0?(up===0?50:100):100-100/(1+up/down);
    const atr=wilder(candles.slice(1).map((b,i)=>Math.max(b.h-b.l,Math.abs(b.h-close[i]),Math.abs(b.l-close[i]))));
    const fast=ema(close,20),slow=ema(close,50);
    const trend=last.c>fast&&fast>slow?'صعودی':last.c<fast&&fast<slow?'نزولی':'مختلط';
    const range=candles.slice(-21,-1);
    return {stamp,candles,trend,rsi,lines:['روند '+trend+' · RSI (۱۴) '+fa(rsi),'EMA 20 / 50 · '+fa(fast)+' / '+fa(slow)+' تتر','ATR (۱۴) · '+fa(atr)+' تتر','کف و سقف ۲۰ کندل قبل · '+fa(Math.min(...range.map(b=>b.l)))+' / '+fa(Math.max(...range.map(b=>b.h)))]};
}
function liquidity(x,now){
    const stamp=fresh(number(x.lastUpdate),60000,now);
    const levels=a=>a.map(row=>{const p=number(row[0]),v=number(row[1]);if(p<=0||v<=0)throw Error('ردیف نامعتبر');return [p,v]});
    const bids=levels(x.bids),asks=levels(x.asks);
    const bid=bids[0][0],ask=asks[0][0];if(ask<bid)throw Error('دفتر نامعتبر');
    const mid=(bid+ask)/2, depth=a=>a.filter(([p])=>Math.abs(p/mid-1)<=0.01).reduce((s,[p,v])=>s+p*v,0);
    const b=depth(bids),a=depth(asks);
    return {stamp,lines:['شکاف بهترین قیمت‌ها · '+fa((ask/bid-1)*100)+'٪','ارزش سفارش‌های قابل مشاهده تا ۱٪ قیمت میانی','سمت خرید '+fa(b)+' · سمت فروش '+fa(a)+' تتر']};
}
const important=/\b(hack(?:ed)?|exploit|bankrupt(?:cy)?|sanctions?|tariffs?|attack|war|invasion|lawsuit|rate decision|inflation|ETF|approval|outage|upgrade)\b/i;
function stories(data,now){
    const seen=new Set(),items=[];
    for(const h of data){
        const key=String(h.title||'').split(' - ')[0].toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
        if(!key||seen.has(key)||!(h.published<=now+5000&&now-h.published<day))continue;
        seen.add(key);items.push(h);
    }
    items.sort((a,b)=>Number(important.test(b.title))-Number(important.test(a.title))||b.published-a.published);
    if(!items.length)throw Error('خبر تازه پیدا نشد');
    return {stamp:Math.max(...items.map(x=>x.published)),items,lines:items.slice(0,5).map(h=>h.title+' · '+h.source+' · '+when(h.published))};
}
function series(data,date,val,maxAge,now,step){
    const a=data.map(x=>({t:date(x),v:number(val(x))})).sort((a,b)=>a.t-b.t);
    if(a.length<2||a.some(x=>!Number.isFinite(x.t)||x.v<0)||a.some((x,i)=>i&&x.t-a[i-1].t!==step))throw Error('سری زمانی ناقص');
    fresh(a[a.length-1].t,maxAge,now);return a;
}
function contextMetric(k,x,now){
    let stamp,lines,risk="";
    switch(k){
    case 'global':{
        const d=x.data;stamp=fresh(number(d.updated_at)*1000,day,now);
        if(number(d.market_cap_change_percentage_24h_usd)<=-5)risk='افت روزانه ارزش بازار حداقل ۵٪';
        lines=['تغییر ارزش کل بازار در ۲۴ ساعت · '+fa(number(d.market_cap_change_percentage_24h_usd))+'٪','سهم بیت‌کوین · '+fa(number(d.market_cap_percentage.btc))+'٪','ارزش کل · '+fa(number(d.total_market_cap.usd)/1e9)+' میلیارد دلار'];break}
    case 'fundamentals':{
        const d=x[0];stamp=fresh(Date.parse(d.last_updated),hour,now);
        const cap=number(d.market_cap),vol=number(d.total_volume),supply=number(d.circulating_supply);
        if(d.fully_diluted_valuation>0 && cap/d.fully_diluted_valuation<0.35)risk='ارزش بازار کمتر از ۳۵٪ ارزش کاملاً رقیق‌شده';
        lines=['رتبه ارزش بازار · '+fa(number(d.market_cap_rank)),'ارزش بازار · '+fa(cap/1e9)+' میلیارد دلار','عرضه در گردش · '+fa(supply),'نسبت حجم روزانه به ارزش بازار · '+(cap>0?fa(100*vol/cap)+'٪':'ناموجود'),'سهم عرضه در گردش از سقف عرضه · '+(d.max_supply>0?fa(100*supply/d.max_supply)+'٪':'سقف گزارش نشده')];break}
    case 'funding':{
        stamp=fresh(number(x.time),15*60000,now);
        const rate=number(x.lastFundingRate),index=number(x.indexPrice);
        if(index<=0)throw Error('شاخص نامعتبر');
        if(rate>=0.001)risk='نرخ تأمین مالی مثبت حداقل ۰٫۱٪';
        lines=['آخرین نرخ تأمین مالی · '+fa(rate*100)+'٪','فاصله قیمت مارک تا شاخص · '+fa((number(x.markPrice)/index-1)*100)+'٪',rate>0?'نرخ مثبت؛ پرداخت از خریداران قرارداد به فروشندگان':rate<0?'نرخ منفی؛ پرداخت از فروشندگان قرارداد به خریداران':'نرخ صفر'];break}
    case 'interest':{
        const a=series(x,r=>number(r.timestamp),r=>r.sumOpenInterest,2*hour,now,hour),last=a[a.length-1],first=a[0];stamp=last.t;
        if(first.v>0 && last.v/first.v>1.25)risk='افزایش بیش از ۲۵٪ موقعیت باز در دوره نمونه';
        lines=['موقعیت باز · '+fa(last.v)+' واحد ارز','تغییر طی '+fa((last.t-first.t)/hour)+' ساعت · '+(first.v>0?fa((last.v/first.v-1)*100)+'٪':'ناموجود')];break}
    case 'chain':{
        const a=series(x.data.filter(r=>Date.parse(r.time)+day<=now),r=>Date.parse(r.time)+day,r=>r.TxCnt,3*day,now,day);
        if(a.length<8)throw Error('سابقه هفت‌روزه ناقص');
        const last=a[a.length-1],prior=avg(a.slice(-8,-1).map(r=>r.v));stamp=last.t;
        if(prior>0 && last.v/prior<0.6)risk='فعالیت شبکه بیش از ۴۰٪ زیر میانگین هفته';
        lines=['تراکنش‌های روز کامل اخیر · '+fa(last.v),'میانگین هفت روز قبل · '+fa(prior),'تغییر فعالیت · '+(prior>0?fa((last.v/prior-1)*100)+'٪':'ناموجود')];break}
    case 'mood':{
        const d=x.data[0];stamp=fresh(number(d.timestamp)*1000,2*day,now);const index=number(d.value);
        if(index<0||index>100)throw Error('شاخص نامعتبر');
        if(index<=20)risk='ترس شدید در شاخص بیت‌کوین';
        lines=['شاخص ترس و طمع بیت‌کوین · '+fa(index)+' از ۱۰۰',index<45?'غلبه ترس':index>55?'غلبه طمع':'نزدیک میانه'];break}
    case 'social':{
        const authors=new Set();let bull=0,bear=0;stamp=0;
        for(const p of x.posts){const t=Date.parse(p.record?.createdAt),author=p.author?.did;
            if(!author||authors.has(author)||!Number.isFinite(t)||now-t>=day||t>now+5000)continue;
            authors.add(author);stamp=Math.max(stamp,t);
            const positive=/\b(bullish|rally|breakout|optimistic)\b/i.test(p.record.text),negative=/\b(bearish|selloff|crash|pessimistic)\b/i.test(p.record.text);
            if(positive&&!negative)bull++;if(negative&&!positive)bear++;
        }
        if(authors.size<5)throw Error('نمونه کمتر از پنج نویسنده');
        if(authors.size>=20 && bear/authors.size>=0.5)risk='واژگان منفی در دست‌کم نیمی از نمونه اجتماعی';
        lines=['نمونه ۲۴ ساعت اخیر · '+fa(authors.size)+' نویسنده انگلیسی‌زبان','واژگان مثبت '+fa(bull)+' · منفی '+fa(bear)+' · بدون جهت روشن '+fa(authors.size-bull-bear),'نمونه محدود Bluesky؛ طبقه‌بندی واژگانی'];break}
    default:throw Error('دسته ناشناخته');
    }
    return {stamp,lines,risk};
}
function buyFilter(report,now){
    const tech=report.candles,macro=report.macro;
    if(!tech?.candles||now-tech.stamp>report.minutes*60000+60000)return 'کندل معتبر برای تأیید خرید در دسترس نیست';
    if(tech.trend!=='صعودی'||tech.rsi>=75)return 'خرید متوقف است · شرط روند صعودی و RSI زیر ۷۵ برقرار نیست';
    if(!macro?.items?.some(h=>now-h.published<day))return 'اخبار کلان تازه در دسترس نیست';
    if(macro.items.some(h=>now-h.published<day&&/\b(invasion|emergency rate hike|capital controls)\b/i.test(h.title)))return 'خرید متوقف است · تیتر کلان پرریسک';
    if(report.strict){
        for(const name of ['global','fundamentals','funding','interest','chain','mood','social']){
            const section=report[name];
            if(!section?.lines)return 'پوشش داده برای فیلتر چندمنبعی کامل نیست';
            if(section.risk)return 'توقف خرید · '+section.risk;
        }
    }
    return '';
}
if(typeof module!=='undefined')module.exports={study,liquidity,stories,contextMetric,buyFilter};
