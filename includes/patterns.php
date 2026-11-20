<?php
namespace SmartCloud\WPSuite\Commerce;

final class Patterns {
    public static function register(): void {
        if (!function_exists('register_block_pattern')) return;
        register_block_pattern_category('smartcloud-commerce', ['label' => __('Commerce', 'smartcloud-commerce')]);
        $cards = '';
        foreach ([__('Starter', 'smartcloud-commerce'), __('Professional', 'smartcloud-commerce'), __('Complete', 'smartcloud-commerce')] as $index => $title) {
            $class = 'sc-commerce-plan' . ($index === 1 ? ' sc-commerce-plan-featured' : '');
            $cards .= '<!-- wp:column {"className":"sc-commerce-plan-column"} --><div class="wp-block-column sc-commerce-plan-column"><!-- wp:group {"className":"' . $class . '","layout":{"type":"constrained"}} --><div class="wp-block-group ' . $class . '">';
            $cards .= '<!-- wp:paragraph {"className":"sc-commerce-eyebrow sc-commerce-plan-name"} --><p class="sc-commerce-eyebrow sc-commerce-plan-name">' . esc_html($title) . '</p><!-- /wp:paragraph -->';
            $cards .= '<!-- wp:heading {"level":3,"className":"sc-commerce-plan-title sc-commerce-plan-price"} --><h3 class="wp-block-heading sc-commerce-plan-title sc-commerce-plan-price">' . esc_html__('Your price', 'smartcloud-commerce') . '</h3><!-- /wp:heading -->';
            $cards .= '<!-- wp:paragraph {"className":"sc-commerce-plan-description"} --><p class="sc-commerce-plan-description">' . esc_html__('Describe this plan and who it is for.', 'smartcloud-commerce') . '</p><!-- /wp:paragraph -->';
            $cards .= '<!-- wp:list {"className":"sc-commerce-plan-features"} --><ul class="wp-block-list sc-commerce-plan-features"><!-- wp:list-item {"className":"sc-commerce-plan-feature"} --><li class="sc-commerce-plan-feature">' . esc_html__('Included feature', 'smartcloud-commerce') . '</li><!-- /wp:list-item --><!-- wp:list-item {"className":"sc-commerce-plan-feature"} --><li class="sc-commerce-plan-feature">' . esc_html__('Another included feature', 'smartcloud-commerce') . '</li><!-- /wp:list-item --></ul><!-- /wp:list -->';
            $cards .= '<!-- wp:smartcloud-commerce/checkout-button {"width":"full"} --><button class="wp-block-smartcloud-commerce-checkout-button" type="button" data-commerce-action="checkout" data-offer-id="" data-commerce-width="full">' . esc_html__('Checkout button', 'smartcloud-commerce') . '</button><!-- /wp:smartcloud-commerce/checkout-button -->';
            $cards .= '</div><!-- /wp:group --></div><!-- /wp:column -->';
        }
        register_block_pattern('smartcloud-commerce/pricing-cards', [
            'title' => __('Commerce pricing cards', 'smartcloud-commerce'),
            'description' => __('Three editable plans with Commerce checkout buttons. Set each button’s Offer ID before use.', 'smartcloud-commerce'),
            'categories' => ['smartcloud-commerce'],
            'content' => '<!-- wp:group {"className":"sc-commerce-plans","layout":{"type":"constrained"}} --><div class="wp-block-group sc-commerce-plans"><!-- wp:heading {"className":"sc-commerce-plans-title"} --><h2 class="wp-block-heading sc-commerce-plans-title">' . esc_html__('Choose your plan', 'smartcloud-commerce') . '</h2><!-- /wp:heading --><!-- wp:paragraph {"className":"sc-commerce-plans-description"} --><p class="sc-commerce-plans-description">' . esc_html__('Compare the options and choose the access that suits you.', 'smartcloud-commerce') . '</p><!-- /wp:paragraph --><!-- wp:columns {"className":"sc-commerce-plan-grid"} --><div class="wp-block-columns sc-commerce-plan-grid">' . $cards . '</div><!-- /wp:columns --></div><!-- /wp:group -->',
        ]);
        register_block_pattern('smartcloud-commerce/customer-account', [
            'title' => __('Commerce customer account', 'smartcloud-commerce'),
            'description' => __('An editable account panel with access status and a billing portal button.', 'smartcloud-commerce'),
            'categories' => ['smartcloud-commerce'],
            'content' => '<!-- wp:group {"className":"sc-commerce-account","layout":{"type":"constrained"}} --><div class="wp-block-group sc-commerce-account"><!-- wp:heading {"className":"sc-commerce-account-title"} --><h2 class="wp-block-heading sc-commerce-account-title">' . esc_html__('Your subscription', 'smartcloud-commerce') . '</h2><!-- /wp:heading --><!-- wp:paragraph {"className":"sc-commerce-account-description"} --><p class="sc-commerce-account-description">' . esc_html__('View your access and manage your subscription or billing details.', 'smartcloud-commerce') . '</p><!-- /wp:paragraph --><!-- wp:smartcloud-commerce/current-entitlements --><div class="wp-block-smartcloud-commerce-current-entitlements" data-commerce-entitlements="">' . esc_html__('Sign in to view access.', 'smartcloud-commerce') . '</div><!-- /wp:smartcloud-commerce/current-entitlements --><!-- wp:smartcloud-commerce/customer-portal-button --><button class="wp-block-smartcloud-commerce-customer-portal-button" type="button" data-commerce-action="portal">' . esc_html__('Customer portal button', 'smartcloud-commerce') . '</button><!-- /wp:smartcloud-commerce/customer-portal-button --></div><!-- /wp:group -->',
        ]);
    }
}
