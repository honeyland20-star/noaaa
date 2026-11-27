'use strict';
const $=id=>document.getElementById(id);
const defaults={symbol:'BTC',frame:'60',coverage:'trend',side:'buy',limit:'',budget:'10',spread:'0.25',fee:'0.25',equities:'',execution:'paper',pub:'',priv:'',token:'',chat:''};
const read=id=>{const data=JSON.parse(Phone.read(id));if(!data)throw Error('بازکردن اطلاعات رمزگذاری‌شده ناموفق بود');return data};
let cfg={...defaults,...read('config')};
let state={armed:false,pending:null,history:[],cash:1000,coins:{},...read('state')};
let busy=false,epoch=0, seq=0,quoteText='در انتظار بررسی';
const waiting=new Map();
function save(){if(!Phone.write('state',JSON.stringify(state))){state.armed=false;throw Error('ذخیره وضعیت ناموفق بود')}}
function call(op,args={}){return new Promise((ok,fail)=>{const id=++seq;waiting.set(id,{ok,fail});Phone.call(id,op,JSON.stringify(args))})}
window.receive=(id,msg)=>{const task=waiting.get(id);if(!task)return;waiting.delete(id);const r=JSON.parse(msg);if(r.error)task.fail(Error(r.error));else task.ok(r.data)};
const num=n=>Number(n).toLocaleString('fa-IR',{maximumFractionDigits:6});
function notice(t){$('notice').textContent=t}
function log(t){state.history.unshift(new Date().toLocaleString('fa-IR')+'\n'+t);state.history=state.history.slice(0,250)}
async function notify(t){if(cfg.token&&cfg.chat){try{await call('send',{text:t})}catch(e){log('ارسال تلگرام ناموفق بود · '+e.message);save()}}}
function rows(node,values,empty){node.replaceChildren();for(const value of values){const el=document.createElement('div');el.className='entry';el.textContent=value;node.append(el)}if(!values.length)node.textContent=empty}
function paint(){
    $('mode').textContent=cfg.execution==='paper'?'معامله آزمایشی':'حساب واقعی';
    $('market').textContent=cfg.symbol+' / USDT';
    $('status').textContent=(state.pending?'سفارش در حال پیگیری · '+state.pending.client:state.armed?'پایش فعال · '+quoteText:'پایش متوقف است')+(cfg.execution==='paper'?' | موجودی آزمایشی '+num(state.cash)+' تتر و '+num(state.coins[cfg.symbol]||0)+' '+cfg.symbol:'');
    $('arm').disabled=busy||state.armed||!!state.pending;$('stop').disabled=!state.armed;
    $('recovery').hidden=!state.pending||!!state.pending.id;
    rows($('history'),state.history,'هنوز سفارشی ثبت نشده است');
}
function page(id){for(const n of ['home','research','settings','journal'])$(n).hidden=id!==n;document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('selected',b.dataset.page===id))}
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>page(b.dataset.page));
for(const k of Object.keys(defaults))$(k).value=cfg[k];
$('form').onsubmit=e=>{e.preventDefault();if(state.pending||busy||state.armed){notice('برای تغییر تنظیمات ابتدا پایش را متوقف کن و تا پایان استعلام صبر کن');return}
    const next={};for(const k of Object.keys(defaults))next[k]=$(k).value.trim();
    if(next.execution==='live'&&(!next.pub||!next.priv)){notice('کلیدهای نوبیتکس را وارد کن');return}
    if((!!next.token!==!!next.chat)||(next.chat&&!/^[1-9][0-9]+$/.test(next.chat))){notice('توکن و شناسه عددی چت خصوصی را با هم وارد کن');return}
    if(!Phone.write('config',JSON.stringify(next))){notice('ذخیره تنظیمات ناموفق بود');return}
    cfg=next;researchCache.clear();renderAnalysis({minutes:Number(cfg.frame)});$('price').textContent='—';$('seen').textContent='هنوز قیمت دریافت نشده';rows($('news'),[],'در انتظار بررسی');notice('تنظیمات ذخیره شد');paint()
};
async function test(op){try{await call(op,op==='send'?{text:'نوا تریدر · ارتباط آزمایشی برقرار است'}:{});notice('آزمایش اتصال موفق بود')}catch(e){notice(e.message)}}
$('profile').onclick=()=>test('profile');$('telegram').onclick=()=>test('send');
$('arm').onclick=()=>{if(!(cfg.limit>0)){page('settings');notice('ابتدا حد قیمت را وارد و تنظیمات را ذخیره کن');return}
    $('warning').textContent=(cfg.execution==='live'?'سفارش واقعی با پول حساب':'سفارش آزمایشی')+' · '+(cfg.side==='buy'?'خرید ':'فروش ')+cfg.symbol+' تا '+cfg.budget+' تتر، حد قیمت '+cfg.limit+' تتر. با رسیدن به شرط، یک سفارش ثبت می‌شود.';$('confirm').showModal()};
$('no').onclick=()=>$('confirm').close();
$('yes').onclick=()=>{$('confirm').close();if(state.pending||busy)return;state.armed=true;epoch++;save();paint();tick(true)};
$('stop').onclick=()=>{state.armed=false;epoch++;save();paint();notice('پایش متوقف شد')};
async function reconcile(id){
    const p=state.pending;if(!p)return;
    const o=(await call('status',{id})).order;
    if(!o||String(o.id)!==String(id)||(!p.id&&o.clientOrderId!==p.client))throw Error('تطبیق سفارش ممکن نشد');
    const status=o.status, matched=String(o.matchedAmount??'');
    if(!['Active','Done','Canceled','Inactive','New'].includes(status))throw Error('وضعیت سفارش ناشناخته است');
    const tag=status+' '+matched;
    p.id=id;if(tag===p.last){save();return}
    const t='واقعی · '+cfg.symbol+' · '+status+' · مقدار انجام‌شده '+matched+' · شناسه '+id;
    p.last=tag;log(t);if(['Done','Canceled'].includes(status))state.pending=null;save();await notify(t)
}
$('reconcile').onclick=async()=>{const id=$('orderId').value.trim();if(busy||!/^\d+$/.test(id))return;busy=true;try{await reconcile(id)}catch(e){notice(e.message)}finally{busy=false;paint()}};
async function tick(manual=false){
    if(busy||!Phone.active()||(!manual&&!state.armed&&!state.pending))return;
    const generation=epoch;busy=true;paint();
    try{
        if(state.pending){if(state.pending.id)await reconcile(state.pending.id);else notice('رسید سفارش نامشخص است. تاریخچه نوبیتکس را بررسی کن. ارسال مجدد مسدود است');return}
        const strict=cfg.side==='buy'&&cfg.coverage==='all';
        const report=await collect(strict?Object.keys(sources).filter(k=>k!=='quote'):['candles','macro','news']);
        report.strict=strict;
        const headlines=(report.news?.items||[]).filter(h=>Date.now()-h.published<day);
        rows($('news'),headlines.slice(0,5).map(h=>h.title+' · '+h.source),report.news?.error||'خبری دریافت نشد');
        const book=await call('quote'),d=assess(book,headlines,cfg,Date.now());
        if(d.ready && cfg.side==='buy'){
            const veto=buyFilter(report,Date.now());
            if(veto){d.ready=false;d.reason=veto}
            else d.reason+=' · روند '+report.candles.trend+' · RSI '+fa(report.candles.rsi);
        }
        quoteText=d.reason;notice(d.reason+(d.headline?' · '+d.headline.title:''));
        $('price').textContent=d.price?num(d.price):'—';$('seen').textContent='آخرین بررسی · '+new Date().toLocaleTimeString('fa-IR');
        if(!state.armed||generation!==epoch||!d.ready||!Phone.active())return;
        const buy=cfg.side==='buy', total=d.qty*d.price;
        if(cfg.execution==='paper'){
            const fee=total*Number(cfg.fee)/100, coins=state.coins[cfg.symbol]||0;
            if((buy&&state.cash<total+fee)||(!buy&&coins<d.qty)){notice('موجودی آزمایشی کافی نیست');state.armed=false;save();return}
            state.cash+=buy?-(total+fee):total-fee;state.coins[cfg.symbol]=coins+(buy?d.qty:-d.qty);
            const t='آزمایشی · '+(buy?'خرید ':'فروش ')+num(d.qty)+' '+cfg.symbol+' · قیمت '+num(d.price)+' تتر · کارمزد '+num(fee)+' تتر · '+d.reason;
            state.armed=false;log(t);save();await notify(t);return
        }
        const client='nava'+Date.now().toString(36)+Math.random().toString(36).slice(2,8);
        state.pending={client,id:null};state.armed=false;log('درخواست واقعی · '+client+' · '+cfg.symbol+' · '+cfg.side+' · '+d.qty+' × '+d.price);save();
        const res=await call('order',{type:cfg.side,execution:'limit',srcCurrency:cfg.symbol.toLowerCase(),dstCurrency:'usdt',price:String(d.price),amount:d.qty.toFixed(6),clientOrderId:client});
        if(!res.order?.id)throw Error('رسید سفارش نامشخص است');
        state.pending.id=String(res.order.id);save();
        await notify('واقعی · سفارش ثبت شد · '+cfg.symbol+' · '+state.pending.id+' · '+d.reason);await reconcile(state.pending.id)
    }catch(e){notice(e.message);if(state.pending&&!state.pending.id){quoteText='نیاز به بررسی دستی رسید سفارش'}}
    finally{busy=false;paint()}
}
$('refresh').onclick=()=>tick(true);
state.armed=false;save();paint();page('home');setInterval(()=>tick(),60000);
