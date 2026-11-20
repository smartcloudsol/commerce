const { projectStorefront } = require('../../main/src/experience');
const { formatStripePrice } = require('../../main/src/money.cjs');

function validPaymentLinkUrl(value) {
 if (typeof value !== 'string' || value.length > 2048 || !/^https:\/\/buy\.stripe\.com(?:[/?]|$)/.test(value) || /[\x00-\x20\x7f\\]/.test(value)) return false;
 try { const u = new URL(value); return u.protocol === 'https:' && u.hostname === 'buy.stripe.com' && !u.port && !u.username && !u.password && !u.hash; } catch { return false; }
}
function priceLabel(amount, currency, interval, count = 1) {
 try { return formatStripePrice(amount, currency) + (interval ? ` / ${count > 1 ? `${count} ` : ''}${interval}` : ''); } catch { return ''; }
}
function publishedDestinations(snapshot) {
 let model; try { model = projectStorefront(snapshot); } catch { return []; }
 const choices = new Map();
 for (const p of model.presentations) for (const o of p.offers) for (const price of o.prices) {
  const link = p.flow === 'payment_link';
  if (link && !validPaymentLinkUrl(price.paymentLinkUrl)) continue;
  const value = link ? price.paymentLinkUrl : price.checkoutOfferId;
  const key = `${link ? 'payment_link' : 'checkout'}:${value}`;
  choices.set(key, { key, name: o.name, price: priceLabel(price.unitAmount, price.currency, price.interval), flow: link ? 'payment_link' : 'checkout', value });
 }
 return [...choices.values()];
}
function catalogDestinations(items) {
 if (!Array.isArray(items)) return [];
 return items.filter(p => p && /^plink_[A-Za-z0-9_]{1,128}$/.test(p.id) && p.active === true && validPaymentLinkUrl(p.url)).map(p => {
  const lines = Array.isArray(p.lineItems) ? p.lineItems : [];
  const name = (lines.map(l => l.name).filter(n => typeof n === 'string' && n).join(' + ') || p.id) + (p.hasMoreLineItems ? ' + …' : '');
  const line = lines.length === 1 ? lines[0] : null;
  return {key: `payment_link:${p.url}`, name, price: line ? (line.quantity > 1 ? `${line.quantity} × ` : '') + priceLabel(line.amount, line.currency, line.interval, line.intervalCount) : '', flow:'payment_link', value:p.url};
 });
}
module.exports = { validPaymentLinkUrl, publishedDestinations, catalogDestinations };
