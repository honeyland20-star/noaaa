'use strict';
function assess(book, headlines, cfg, now) {
    const bid=Number(book.bids?.[0]?.[0]), ask=Number(book.asks?.[0]?.[0]);
    const timestamp=Number(book.lastUpdate);
    if (!(bid>0 && ask>=bid && timestamp>0 && now>=timestamp-5000 && now-timestamp<60000)) return {reason:'قیمت معتبر و تازه در دسترس نیست'};
    const buy=cfg.side==='buy';
    const price=buy?ask:bid;
    if (!Array.isArray(headlines) || !headlines.length) return {reason:'خبر تازه در دسترس نیست', price};
    const flagged=headlines.find(h=>/\b(hack(?:ed)?|exploit|bankrupt(?:cy)?|halt(?:ed)?|breach|delist(?:ing)?|lawsuit|crash)\b/i.test(h.title));
    if (flagged && buy) return {reason:'توقف ورود به دلیل تیتر حساس',headline:flagged,price};
    if ((ask-bid)/bid*100>cfg.spread) return {reason:'فاصله قیمت خرید و فروش زیاد است',price};
    if (buy?price>cfg.limit:price<cfg.limit) return {reason:'در انتظار رسیدن قیمت به حد تعیین‌شده',price};
    const depth=Number((buy?book.asks:book.bids)[0][1]);
    const qty=Math.floor(cfg.budget/price*1e6)/1e6;
    if (!(Number.isFinite(qty)&&qty>0&&depth>=qty)) return {reason:'حجم کافی در بهترین قیمت وجود ندارد',price};
    return {price,qty,reason:'شرط قیمت و نقدشوندگی برقرار است',ready:true};
}
if(typeof module!=='undefined')module.exports=assess;
