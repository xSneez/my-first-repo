/** Product-scoped checkout/quantity parser; no calculation or coupon redemption. */
import { Parser } from 'htmlparser2';
const REGIONS = new Set(['promoPriceBlockMessage_feature_div','promotionMessageInsideBuyBox_feature_div',
  'couponsInBuybox_feature_div','promoMessagingDiscountValue_feature_div','promotions_feature_div']);
const QUANTITY = new Set(['quantityPricingTableSummaryInPriceBlock_feature_div','quantityPricingTable_feature_div']);
const CHECKOUT = {
  3: [/Spare\s*([\d.,]+)\s*%\s*(?:an|bei)\s+der\s+Kasse/gi],
  4: [/[ÉEée]conomisez\s*([\d.,]+)\s*%\s*(?:au moment de passer la commande|au moment du paiement|lors du paiement|à la caisse|lors du passage(?: en caisse)?)/gi,
    /([\d.,]+)\s*%\s*(?:lors du paiement|au moment du paiement|à la caisse|lors du passage(?: en caisse)?)/gi],
  8: [/Risparmia\s*([\d.,]+)\s*%\s*(?:alla cassa|al check-?out|al momento del pagamento)/gi,
    /([\d.,]+)\s*%\s*al check-?out/gi],
  9: [/Ahorra\s*([\d.,]+)\s*%\s*al\s*(?:finalizar|tramitar|pagar)/gi,
    /([\d.,]+)\s*%\s*al finalizar/gi],
};
const CHECKOUT_EN = [/Save\s*([\d.,]+)\s*%\s*(?:at|during)\s*(?:the\s*)?check[-\s]?out/gi,
  /([\d.,]+)\s*%\s*off\s*at\s*(?:the\s*)?check[-\s]?out/gi];
const MULTI = {
  3: /Spare\s*([\d.,]+)\s*%\s*(?:(?:an|bei) der Kasse\s*)?(?:bei|beim Kauf von)\s*(\d+)/gi,
  4: /[ÉEée]conomisez\s*([\d.,]+)\s*%\s*(?:(?:au moment du paiement|à la caisse)\s*)?(?:sur|à l'achat de|pour l'achat de)\s*(\d+)/gi,
  8: /Risparmia\s*([\d.,]+)\s*%\s*(?:alla cassa\s*)?(?:su|acquistando)\s*(\d+)/gi,
  9: /Ahorra\s*([\d.,]+)\s*%\s*(?:al (?:finalizar|tramitar)(?: el pedido)?\s*)?(?:en|al comprar)\s*(\d+)/gi,
};
const MULTI_EN = /Save\s*([\d.,]+)\s*%\s*(?:(?:at|during)\s*checkout\s*)?(?:each\s*)?(?:on|when you (?:buy|purchase))[^.<]{0,80}?\b(\d+)\s*(?:or more|items?|units?)/gi;
const normalize = text => text.replace(/\s+/g,' ').trim();
function percent(raw) {
  if (!/^\d{1,3}(?:[.,]\d{1,2})?$/.test(raw)) return null;
  const value = Number(raw.replace(',','.'));
  return Number.isFinite(value) && value>=0 && value<=100 ? value : null;
}
function matches(text, regex) { return text.matchAll(new RegExp(regex.source, regex.flags)); }

export function parsePromoHtml(data, domain, { asin } = {}) {
  const output = { captcha:false,checkoutPct:0,multiPct:0,multiQty:0,
    regionVerified:false,ambiguous:false,reason:'promotion_region_missing',regionIds:[] };
  if (typeof data !== 'string' || !CHECKOUT[domain]) return {...output,reason:'invalid_input'};
  const frames=[], closed=[], messages=[];
  let captcha=false, tooDeep=false;
  const expected = typeof asin==='string' ? asin.toUpperCase() : null;
  function append(frame, text) {
    const room = Math.max(0, 16000 - frame.text.length);
    if (text.length > room) frame.truncated = true;
    frame.text += text.slice(0, room);
  }
  function separate() {
    for (const frame of frames) if (frame.capture) append(frame, ' ');
  }
  const parser=new Parser({
    onopentag(name,attrs) {
      if(frames.length>=4096){tooDeep=true;throw new Error('depth');}
      const parent=frames.at(-1);
      const classes=(attrs.class??'').split(/\s+/);
      const raw=parent?.raw||['script','style','template'].includes(name);
      const hidden=parent?.hidden||attrs.hidden!==undefined||attrs['aria-hidden']==='true'
        ||classes.includes('aok-hidden')||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(attrs.style??'');
      const unrelated=parent?.unrelated||classes.includes('a-carousel-card')||classes.includes('s-result-item');
      const id=attrs.id??'';
      const owned=expected && attrs['data-csa-c-owner']==='PromotionsDiscovery'
        && (attrs['data-csa-c-item-id']??'').startsWith(`amzn1.asin.${expected}:`);
      const root=!raw&&!hidden&&!unrelated&&(REGIONS.has(id)||QUANTITY.has(id)||owned);
      const inRegion=frames.some(frame=>frame.root);
      const message=!raw&&!hidden&&!unrelated&&inRegion&&classes.includes('a-alert-content');
      if(!raw&&!hidden&&!unrelated)separate();
      if(!raw&&!unrelated&&((name==='form'&&/validateCaptcha/i.test(attrs.action??''))
        ||/validateCaptcha/i.test(attrs.formaction??'')||/^(?:captchacharacters)$/i.test(id)
        ||/^(?:captchacharacters)$/i.test(attrs.name??'')))captcha=true;
      frames.push({name,id,raw,hidden,unrelated,root,message,capture:root||message,text:'',truncated:false,
        quantity:QUANTITY.has(id)||parent?.quantity,owned:!!owned});
    },
    ontext(text) {
      const current=frames.at(-1);if(!current||current.raw||current.hidden||current.unrelated)return;
      for(const frame of frames)if(frame.capture)append(frame,text);
    },
    onclosetag(name,implied) {
      const frame=frames.pop();if(!frame)return;
      if(frame.name===name&&!implied){
        if(frame.root)closed.push({...frame,text:normalize(frame.text)});
        if(frame.message)messages.push({...frame,text:normalize(frame.text)});
      }
      if(!frame.raw&&!frame.hidden&&!frame.unrelated)separate();
    },
  },{decodeEntities:true});
  try{parser.write(data);parser.end();}catch{return {...output,captcha,reason:tooDeep?'html_depth_limit':'html_parse_error'};}
  if(captcha)return {...output,captcha:true,reason:'blocked'};
  const promotions=closed.filter(frame=>!frame.quantity);
  if(!promotions.length)return output;
  output.regionIds=[...new Set(promotions.map(frame=>frame.id||'PromotionsDiscovery'))];
  if(closed.some(frame=>frame.truncated)||messages.some(frame=>frame.truncated))return {...output,reason:'promotion_text_limit'};
  output.regionVerified=true;
  const checkout=new Set(), multi=new Map();
  let invalid=false;
  function multiValues(text){
    const found=[];
    for(const expression of [MULTI[domain],MULTI_EN])for(const match of matches(text,expression)){
      const pct=percent(match[1]),qty=Number(match[2]);
      if(pct===null||!Number.isSafeInteger(qty)||qty<2){invalid=true;continue;}
      found.push({pct,qty,index:match.index,end:match.index+match[0].length});
      multi.set(`${pct}|${qty}`,{pct,qty});
    }
    return found;
  }
  // Parse each quantity block separately; never classify it as an unconditional checkout offer.
  for(const frame of closed.filter(frame=>frame.quantity))multiValues(frame.text);
  const ownedMessages=promotions.filter(frame=>frame.owned);
  const texts=messages.filter(frame=>!frame.quantity).length
    ? messages.filter(frame=>!frame.quantity).map(frame=>frame.text)
    : (ownedMessages.length?ownedMessages:promotions).map(frame=>frame.text);
  for(const text of new Set(texts)){
    const conditional=multiValues(text);
    for(const expression of [...CHECKOUT[domain],...CHECKOUT_EN])for(const match of matches(text,expression)){
      const value=percent(match[1]);if(value===null){invalid=true;continue;}
      // "Save 10% at checkout when you buy 2 items" is conditional quantity pricing.
      if(conditional.some(item=>item.index===match.index||item.index<=match.index&&item.end>=match.index+match[0].length))continue;
      checkout.add(value);
    }
  }
  if(invalid||checkout.size>1||multi.size>1){
    return {...output,regionVerified:false,ambiguous:true,reason:'ambiguous_promotions',
      checkoutCandidates:[...checkout],quantityCandidates:[...multi.values()]};
  }
  output.checkoutPct=checkout.size?[...checkout][0]:0;
  if(multi.size){const item=[...multi.values()][0];output.multiPct=item.pct;output.multiQty=item.qty;}
  output.reason='ok';
  return output;
}
