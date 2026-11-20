/* Bounded initial Stripe presentment currencies; amounts use Stripe API minor units. */
const supported = new Set(
  "usd aed ars aud brl cad chf cop czk dkk eur gbp hkd huf idr ils inr jpy krw mxn myr nok nzd php pln ron rub sek sgd thb zar isk ugx".split(
    " ",
  ),
);
function isSupportedStripeCurrency(currency) {
  return typeof currency === "string" && supported.has(currency);
}
function formatStripePrice(amount, currency) {
  if (
    !isSupportedStripeCurrency(currency) ||
    !Number.isSafeInteger(amount) ||
    amount < 0 ||
    (["isk", "ugx"].includes(currency) && amount % 100 !== 0)
  )
    throw new Error("invalid_stripe_amount");
  const units = String(amount);
  const formatted = ["jpy", "krw"].includes(currency)
    ? units
    : `${units.length > 2 ? units.slice(0, -2) : "0"}.${units.padStart(2, "0").slice(-2)}`;
  return `${formatted} ${currency.toUpperCase()}`;
}
module.exports = { isSupportedStripeCurrency, formatStripePrice };
