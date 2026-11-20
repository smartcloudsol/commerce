<?php
namespace SmartCloud\WPSuite\Commerce;

/** Strict public snapshot parser and server renderer. No remote requests or secrets. */
final class Storefront {
    private static function fail(): void { throw new \InvalidArgumentException('Invalid storefront'); }
    private static function shape($v, array $required, array $optional = []): void {
        if (!is_array($v) || array_is_list($v) || array_diff(array_keys($v), array_merge($required, $optional)) || array_diff($required, array_keys($v))) self::fail();
    }
    private static function list($v, int $max): void { if (!is_array($v) || !array_is_list($v) || count($v) > $max) self::fail(); }
    private static function text($v, int $max, bool $empty = false, bool $multiline = false): void {
        if (!is_string($v) || (!$empty && trim($v) === '') || !preg_match('//u', $v) || preg_match($multiline ? '/[<>\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/' : '/[<>\x00-\x1f\x7f]/', $v) || preg_match_all('/./us', $v) > $max) self::fail();
    }
    private static function id($v, string $pattern = '/^[a-z0-9][a-z0-9._-]{0,63}$/D'): void { if (!is_string($v) || !preg_match($pattern, $v)) self::fail(); }
    public static function offerId(string $offer, string $price): string {
        self::id($offer); self::id($price, '/^price_[A-Za-z0-9_]{1,128}$/D');
        $alphabet = 'abcdefghijklmnopqrstuvwxyz234567'; $bits = 0; $value = 0; $encoded = '';
        foreach (str_split($price) as $char) { $value = ($value << 8) | ord($char); $bits += 8; while ($bits >= 5) { $bits -= 5; $encoded .= $alphabet[($value >> $bits) & 31]; } $value &= (1 << $bits) - 1; }
        if ($bits) $encoded .= $alphabet[($value << (5 - $bits)) & 31];
        $key = $offer . '.' . $encoded; if (strlen($key) > 128) self::fail(); return $key;
    }
    private static function url($url): void {
        if (!is_string($url) || strlen($url) > 2048 || preg_match('/[\x00-\x20\x7f]/', $url)) self::fail();
        $parts = wp_parse_url($url);
        if (!is_array($parts) || ($parts['scheme'] ?? '') !== 'https' || ($parts['host'] ?? '') !== 'buy.stripe.com' || isset($parts['port']) || isset($parts['user']) || isset($parts['pass']) || isset($parts['fragment'])) self::fail();
    }
    public static function parse($raw): array {
        $json = wp_json_encode($raw); if (!is_string($json) || strlen($json) > 65536) self::fail();
        self::shape($raw, ['schemaVersion','revision','accountId','mode','presentations']);
        if ($raw['schemaVersion'] !== 1 || !is_int($raw['revision']) || $raw['revision'] < 1 || $raw['revision'] > 9007199254740991 || !in_array($raw['mode'], ['test','live'], true)) self::fail();
        self::id($raw['accountId'], '/^acct_[A-Za-z0-9]{1,128}$/D'); self::list($raw['presentations'], 50); $seen = [];
        foreach ($raw['presentations'] as $p) {
            self::shape($p, ['id','name','type','flow','buttonLabel','offers'], ['featuredOfferId']); self::id($p['id']);
            if (isset($seen[$p['id']])) self::fail(); $seen[$p['id']] = true;
            self::text($p['name'], 200); self::text($p['buttonLabel'], 120);
            if (!in_array($p['type'], ['button','table'], true) || !in_array($p['flow'], ['checkout','payment_link'], true)) self::fail();
            self::list($p['offers'], 100); if (!$p['offers']) self::fail(); $offers = [];
            foreach ($p['offers'] as $o) {
                self::shape($o, ['id','name','description','marketingFeatures','prices']); self::id($o['id']); if (isset($offers[$o['id']])) self::fail(); $offers[$o['id']] = true;
                self::text($o['name'], 200); self::text($o['description'], 2000, true, true); self::list($o['marketingFeatures'], 15); foreach ($o['marketingFeatures'] as $feature) self::text($feature, 80);
                self::list($o['prices'], 3); if (!$o['prices']) self::fail(); $prices = [];
                foreach ($o['prices'] as $price) {
                    self::shape($price, ['id','currency','unitAmount','interval','intervalCount','checkoutOfferId'], ['paymentLinkUrl','taxBehavior','automaticTax']); self::id($price['id'], '/^price_[A-Za-z0-9_]{1,128}$/D');
                    if (array_key_exists('automaticTax', $price) && $price['automaticTax'] !== true) self::fail();
                    if (array_key_exists('taxBehavior', $price) && !in_array($price['taxBehavior'], ['inclusive','exclusive','unspecified'], true)) self::fail();
                    if (isset($prices[$price['id']])) self::fail(); $prices[$price['id']] = true;
                    self::id($price['currency'], '/^[a-z]{3}$/D');
                    if (!is_int($price['unitAmount']) || $price['unitAmount'] < 0 || $price['unitAmount'] > 9007199254740991 || $price['intervalCount'] !== 1 || !in_array($price['interval'], [null,'month','year'], true) || $price['checkoutOfferId'] !== self::offerId($o['id'], $price['id'])) self::fail();
                    if (self::price($price) === '') self::fail();
                    if (isset($price['paymentLinkUrl'])) self::url($price['paymentLinkUrl']);
                    if ($p['flow'] === 'payment_link' && !isset($price['paymentLinkUrl'])) self::fail();
                }
            }
            if ($p['type'] === 'button' && (count($p['offers']) !== 1 || count($p['offers'][0]['prices']) !== 1)) self::fail();
            if (isset($p['featuredOfferId'])) { self::id($p['featuredOfferId']); if (!isset($offers[$p['featuredOfferId']])) self::fail(); }
        }
        return json_decode($json, true, 512, JSON_THROW_ON_ERROR);
    }
    private static function price(array $price): string {
        $currency = $price['currency']; $amount = $price['unitAmount'];
        if (!in_array($currency, ['usd','aed','ars','aud','brl','cad','chf','cop','czk','dkk','eur','gbp','hkd','huf','idr','ils','inr','jpy','krw','mxn','myr','nok','nzd','php','pln','ron','rub','sek','sgd','thb','zar','isk','ugx'], true)) return '';
        $zero = ['jpy','krw'];
        $digits = in_array($currency, $zero, true) ? 0 : 2;
        if (in_array($currency, ['isk','ugx'], true) && $amount % 100 !== 0) return '';
        $formatted = $digits === 0 ? (string) $amount : (string) intdiv($amount, 100) . '.' . str_pad((string) ($amount % 100), 2, '0', STR_PAD_LEFT);
        return $formatted . ' ' . strtoupper($currency) . ($price['interval'] ? ' / ' . $price['interval'] : '');
    }
    public static function render(array $attributes): string {
        try { $snapshot = self::parse(Plugin::settings()['storefront'] ?? null); } catch (\Throwable $e) { return ''; }
        $id = $attributes['presentationId'] ?? ''; $presentation = null;
        foreach ($snapshot['presentations'] as $item) if ($item['id'] === $id) { $presentation = $item; break; }
        if (!$presentation) return '';
        $isButton = $presentation['type'] === 'button';
        $wrapper = get_block_wrapper_attributes(['class' => 'sc-commerce-section sc-commerce-plans' . ($isButton ? ' sc-commerce-presentation-button' : '')]);
        $html = '<div ' . $wrapper . '><div class="sc-commerce-grid">';
        foreach ($presentation['offers'] as $offer) {
            $featured = ($presentation['featuredOfferId'] ?? '') === $offer['id'];
            $html .= '<div class="sc-commerce-column"><div class="' . ($isButton ? 'sc-commerce-button-content' : 'sc-commerce-card sc-commerce-plan' . ($featured ? ' sc-commerce-plan-featured' : '')) . '"><h3 class="sc-commerce-name">' . esc_html($offer['name']) . '</h3>';
            if ($offer['description'] !== '') $html .= '<p class="sc-commerce-description">' . esc_html($offer['description']) . '</p>';
            if (!$isButton && $offer['marketingFeatures']) { $html .= '<ul class="sc-commerce-list sc-commerce-plan-features">'; foreach ($offer['marketingFeatures'] as $feature) $html .= '<li class="sc-commerce-item">' . esc_html($feature) . '</li>'; $html .= '</ul>'; }
            $html .= '<div class="sc-commerce-control sc-commerce-actions">';
            foreach ($offer['prices'] as $price) {
                $formatted = self::price($price); if ($formatted === '') continue;
                $html .= '<div class="sc-commerce-action sc-commerce-control"><p class="sc-commerce-price">' . esc_html($formatted) . '</p>';
                if (($price['automaticTax'] ?? false) === true) $html .= '<p class="sc-commerce-tax-hint">' . esc_html(($price['taxBehavior'] ?? '') === 'inclusive' ? __('Taxes included', 'smartcloud-commerce') : __('Taxes calculated at checkout; tax collection depends on registrations.', 'smartcloud-commerce')) . '</p>';
                if ($presentation['flow'] === 'payment_link') $html .= '<a class="sc-commerce-button" href="' . esc_url($price['paymentLinkUrl'], ['https']) . '"><span class="sc-commerce-label">' . esc_html($presentation['buttonLabel']) . '</span></a>';
                else $html .= '<button type="button" class="sc-commerce-button sc-commerce-button-checkout" data-commerce-action="checkout" data-offer-id="' . esc_attr($price['checkoutOfferId']) . '"><span class="sc-commerce-label">' . esc_html($presentation['buttonLabel']) . '</span></button><span class="sc-commerce-action-status" role="status" aria-live="polite"></span>';
                $html .= '</div>';
            }
            $html .= '</div></div></div>';
        }
        return $html . '</div></div>';
    }
}
