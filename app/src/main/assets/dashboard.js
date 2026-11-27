'use strict';
const sources={
    candles:['روند و تکنیکال','کندل بسته نوبیتکس',4],quote:['نقدینگی اسپات','دفتر سفارش نوبیتکس',0],
    news:['اخبار ارز','Google News · اولویت بر اساس موضوع تیتر',5],macro:['اقتصاد و سیاست','Google News · اقتصاد و بازارهای جهانی',10],
    global:['بازار جهانی','CoinGecko',10],fundamentals:['بنیاد و عرضه','CoinGecko',15],
    funding:['قرارداد دائمی','Binance USDⓈ-M',4],interest:['موقعیت‌های باز','Binance USDⓈ-M',15],
    chain:['فعالیت شبکه','Coin Metrics Community',60],mood:['احساسات بازار','Alternative.me',30],social:['گفت‌وگوی اجتماعی','Bluesky · پست‌های عمومی',10]
};
const researchCache=new Map();
function drawChart(data){
    const canvas=$('chart'),ctx=canvas.getContext('2d'),width=640,height=238;
    ctx.clearRect(0,0,width,height);
    if(!data?.candles){$('chartCaption').textContent='نمودار در انتظار کندل معتبر';return}
    const a=data.candles.slice(-42),left=16,right=510,top=12,bottom=211;
    const lo=Math.min(...a.map(x=>x.l)),hi=Math.max(...a.map(x=>x.h)),range=hi-lo||hi*.002;
    const y=p=>bottom-(p-lo)/range*(bottom-top),step=(right-left)/a.length;
    ctx.font='14px sans-serif';ctx.textAlign='left';ctx.direction='ltr';
    for(let i=0;i<4;i++){
        const p=lo+(hi-lo)*i/3;ctx.strokeStyle='#354252';ctx.beginPath();ctx.moveTo(left,y(p));ctx.lineTo(right,y(p));ctx.stroke();
        ctx.fillStyle='#c6d2dd';ctx.fillText(fa(p),right+10,y(p)+4)
    }
    a.forEach((b,i)=>{const x=left+step*(i+.5),color=b.c>=b.o?'#73dfb5':'#ff997e';
        ctx.strokeStyle=color;ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(x,y(b.l));ctx.lineTo(x,y(b.h));ctx.stroke();
        ctx.fillRect(x-step*.32,Math.min(y(b.o),y(b.c)),step*.64,Math.max(1,Math.abs(y(b.o)-y(b.c))))});
    $('chartCaption').textContent=when(a[0].t)+' تا '+when(data.stamp)+' · قیمت به تتر';
}
function renderAnalysis(report){
    $('scope').textContent=cfg.symbol+' / USDT · کندل '+fa(report.minutes)+' دقیقه';
    drawChart(report.candles);
    const root=$('metrics');root.replaceChildren();
    for(const [key,[title,source]] of Object.entries(sources)){
        const item=report[key],card=document.createElement('article');card.className='card';
        const head=document.createElement('h2');head.textContent=title;card.append(head);
        const label=document.createElement('small');label.textContent=source+(item?.stamp?' · '+when(item.stamp):'');card.append(label);
        const content=document.createElement('div');rows(content,item?.risk?[...item.lines,'هشدار · '+item.risk]:item?.lines||[],item?.error||'در انتظار دریافت');card.append(content);root.append(card)
    }
}
async function research(key,ctx,force){
    const id=[key,ctx.symbol,ctx.minutes,ctx.equities].join('|'),old=researchCache.get(id);
    const ttl=(old?.value.error?1:sources[key][2])*60000;
    if(!force&&old&&Date.now()-old.at<ttl)return old.value;
    let value;
    try{
        const raw=await call(key,{minutes:ctx.minutes});
        const now=Date.now();
        if(key==='candles')value=study(raw,ctx.minutes,now);
        else if(key==='quote')value=liquidity(raw,now);
        else if(key==='news'||key==='macro')value=stories(raw,now);
        else value=contextMetric(key,raw,now);
    }catch(e){value={error:e.message||'منبع در دسترس نیست'}}
    researchCache.set(id,{at:Date.now(),value});return value;
}
async function collect(keys,force=false){
    const ctx={minutes:Number(cfg.frame),symbol:cfg.symbol,equities:cfg.equities};
    const entries=await Promise.all(keys.map(async key=>[key,await research(key,ctx,force)]));
    return Object.assign(ctx,Object.fromEntries(entries));
}
async function refreshResearch(){
    if(busy)return;
    busy=true;paint();$('researchRefresh').disabled=true;notice('در حال دریافت داده‌های بازار');
    try{const report=await collect(Object.keys(sources));renderAnalysis(report);
        const count=Object.keys(sources).filter(k=>report[k]?.lines).length;
        notice(fa(count)+' از '+fa(Object.keys(sources).length)+' منبع دادهٔ قابل تحلیل دارد')
    }catch(e){notice(e.message)}finally{busy=false;$('researchRefresh').disabled=false;paint()}
}
$('researchRefresh').onclick=refreshResearch;
