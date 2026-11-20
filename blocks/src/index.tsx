import "./marketing-features";
import { registerBlockType } from '@wordpress/blocks';
import { useBlockProps, InspectorControls } from '@wordpress/block-editor';
import { PanelBody, TextControl, SelectControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { createElement } from '@wordpress/element';
import './style.css';
import { CheckoutDestination } from './checkout-destination';
// @ts-ignore Shared public URL allowlist.
import { validPaymentLinkUrl } from './checkout-destinations.cjs';

const domain = 'smartcloud-commerce';
declare global {
 var WpSuiteCommerceArticleRoutes: { pageId: number; path: string; feature: string }[] | undefined;
}
declare global { var WpSuiteCommerceConfig: {pricingTableId?: string; buyButtonId?: string; pricingTableIds?: string[]; buyButtonIds?: string[]; publishableKey?: string; storefront?: {schemaVersion?: number; revision?: number; accountId?: string; mode?: string; presentations?: {id: string; name: string; type: string; flow: string; offers?: {id:string; name:string; description?:string; marketingFeatures?:string[]}[]}[]}}; }
function stripeOptions(name: string, current: string) {
 const c = globalThis.WpSuiteCommerceConfig || {};
 const pricing = name === 'stripe-pricing-table';
 const list = pricing ? c.pricingTableIds : c.buyButtonIds;
 const legacy = pricing ? c.pricingTableId : c.buyButtonId;
 const prefix = pricing ? /^prctbl_[A-Za-z0-9]+$/ : /^buy_btn_[A-Za-z0-9]+$/;
 const ids = (Array.isArray(list) ? list : legacy ? [legacy] : []).filter(id => typeof id === 'string' && id.length <= 200 && prefix.test(id));
 return [{label:__('Select an allowed ID',domain),value:''}, ...(current && !ids.includes(current) ? [{label: `${current} (${__('unavailable',domain)})`,value:current}] : []), ...ids.map(id => ({label:id,value:id}))];
}
const blocks = [
 ['stripe-pricing-table',__('Stripe pricing table',domain),'pricingTableId','money-alt',__('Display an allowed Stripe pricing table.',domain)],
 ['stripe-buy-button',__('Stripe buy button',domain),'buyButtonId','cart',__('Display an allowed Stripe buy button.',domain)],
 ['checkout-button',__('Checkout button',domain),'offerId','cart',__('Start checkout for a Commerce offer.',domain)],
 ['customer-portal-button',__('Customer portal button',domain),'','admin-users',__('Open the customer billing portal.',domain)],
 ['subscription-management',__('Subscription management',domain),'','admin-users',__('Review and confirm changes allowed by your subscription policy.',domain)],
 ['current-entitlements',__('Current entitlements',domain),'','yes-alt',__('Show the current customer’s access.',domain)],
 ['protected-content',__('Protected resource link',domain),'resourceUrl','lock',__('Show a link when the required groups are active.',domain)]
];
for (const [name,title,field,icon,description] of blocks) {
 const button = name === 'checkout-button' || name === 'customer-portal-button';
 const stripe = name.startsWith('stripe-');
 const card = name === 'subscription-management' || name === 'current-entitlements' || name === 'protected-content';
 registerBlockType(`smartcloud-commerce/${name}`, {
  apiVersion: 3, title, icon, description, category: 'smartcloud-commerce',
  attributes: {value:{type:'string',default:''}, label:{type:'string',default:''}, publishableKey:{type:'string',default:''}, requiredGroups:{type:'string',default:''}, ...(name === 'checkout-button' ? {paymentLinkUrl:{type:'string',default:''}} : {}), ...(button ? {width:{type:'string',default:'auto',enum:['auto','full']}} : {})},
  ...((button || card) ? {supports:{color:{background:true,text:true},spacing:{margin:true,padding:true},typography:{fontSize:true},__experimentalBorder:{radius:true,style:true,color:true,width:true}}} : {}),
  ...(button ? {styles:[{name:'fill',label:__('Fill',domain),isDefault:true},{name:'outline',label:__('Outline',domain)}]} : {}),
  ...(card ? {styles:[{name:'card',label:__('Card',domain),isDefault:true},{name:'subtle',label:__('Subtle',domain)}]} : {}),
  edit: ({attributes,setAttributes}: any) => {
   const props = useBlockProps({className: button ? 'sc-commerce-editor-button' : stripe ? 'sc-commerce-editor-stripe' : 'sc-commerce-editor-card'});
   const options = stripe ? stripeOptions(name, attributes.value) : [];
   const available = stripe && attributes.value && options.some(option => option.value === attributes.value && !option.label.endsWith(`(${__('unavailable',domain)})`));
   const config = globalThis.WpSuiteCommerceConfig || {};
   return <><InspectorControls><PanelBody title={__('Commerce settings',domain)}>
    {field && (name === 'checkout-button' ? <CheckoutDestination attributes={attributes} setAttributes={setAttributes} /> : stripe ? <SelectControl label={name === 'stripe-pricing-table' ? __('Pricing table',domain) : __('Buy button',domain)} help={__('Choose an ID allowed in Commerce Free settings.',domain)} value={attributes.value} options={options} onChange={(value:string)=>setAttributes({value, ...(config.publishableKey ? {publishableKey:config.publishableKey} : {})})}/> : <TextControl label={__('Resource URL',domain)} value={attributes.value} onChange={(value:string)=>setAttributes({value})}/>)}
    {!stripe && <TextControl label={__('Label',domain)} value={attributes.label} onChange={(label:string)=>setAttributes({label})}/>}
    {button && <SelectControl label={__('Width',domain)} value={attributes.width} options={[{label:__('Auto',domain),value:'auto'},{label:__('Full width',domain),value:'full'}]} onChange={(width:string)=>setAttributes({width})}/>}
    {name === 'protected-content' && <TextControl label={__('Required groups (comma separated)',domain)} help={__('All listed groups must be active for the selected subject. The resource server must enforce access.',domain)} value={attributes.requiredGroups} onChange={(requiredGroups:string)=>setAttributes({requiredGroups})}/>}
   </PanelBody></InspectorControls>
   {button ? <button {...props} type="button" onClick={(event:any)=>event.preventDefault()} data-commerce-width={attributes.width === 'full' ? 'full' : undefined}>{attributes.label || title}</button> : <div {...props}><strong>{title}</strong><p>{stripe ? (attributes.value ? (available ? attributes.value : `${attributes.value} — ${__('unavailable in Commerce Free settings',domain)}`) : __('Choose an allowed ID in the block settings.',domain)) : name === 'protected-content' ? __('Only a link is saved. The resource server must enforce access.',domain) : __('Sign in to view access.',domain)}</p>{stripe && !config.publishableKey && <p>{__('Add a publishable key in Commerce Free settings.',domain)}</p>}</div>}
   </>;
  },
  save: ({attributes}: any) => { const props = useBlockProps.save(); if(name === 'subscription-management') return <div {...props} data-commerce-subscriptions="">{__('Sign in to manage subscriptions.',domain)}</div>; if(name === 'current-entitlements') return <div {...props} data-commerce-entitlements="">{__('Sign in to view access.',domain)}</div>; if(name === 'checkout-button') { if (attributes.paymentLinkUrl) return validPaymentLinkUrl(attributes.paymentLinkUrl) ? <a {...props} href={attributes.paymentLinkUrl} data-commerce-width={attributes.width === 'full' ? 'full' : undefined}>{attributes.label || title}</a> : <button {...props} type="button" disabled>{attributes.label || title}</button>; return <button {...props} type="button" data-commerce-action="checkout" data-offer-id={attributes.value} data-commerce-width={attributes.width === 'full' ? 'full' : undefined}>{attributes.label || title}</button>; } if(name === 'customer-portal-button') return <button {...props} type="button" data-commerce-action="portal" data-commerce-width={attributes.width === 'full' ? 'full' : undefined}>{attributes.label || title}</button>; if(name === 'protected-content') { let url = ''; try { const u = new URL(attributes.value); if (u.protocol === 'https:' && !u.username && !u.password) url = u.href; } catch {} const groups = (attributes.requiredGroups || '').split(',').map((v:string)=>v.trim()).filter(Boolean); const valid = url && groups.length > 0 && groups.length <= 50 && groups.every((v:string)=>/^[a-zA-Z0-9_-]{1,100}$/.test(v)); return <div {...props} data-commerce-protected="" data-resource-url={valid ? url : ''} data-required-groups={valid ? JSON.stringify(groups) : '[]'} data-link-label={attributes.label || title}>{__('Sign in to view access.',domain)}</div>; } const safe = /^[A-Za-z0-9_-]+$/.test(attributes.value) && /^pk_(test|live)_[A-Za-z0-9]+$/.test(attributes.publishableKey); if (!safe) return <div {...props}>{__('Stripe embed is not configured.',domain)}</div>; return createElement(name === 'stripe-pricing-table' ? 'stripe-pricing-table' : 'stripe-buy-button',{...props,[name === 'stripe-pricing-table' ? 'pricing-table-id' : 'buy-button-id']:attributes.value,'publishable-key':attributes.publishableKey}); }
 } as any);
}

// Dynamic block: the server renders the locally published public snapshot.
registerBlockType('smartcloud-commerce/sales-presentation', {
 apiVersion: 3,
 title: __('Sales presentation', domain),
 description: __('Display a published Commerce presentation.', domain),
 icon: 'store', category: 'smartcloud-commerce',
 attributes: { presentationId: { type: 'string', default: '' } },
 supports: { color: { background: true, text: true }, spacing: { margin: true, padding: true }, typography: { fontSize: true }, __experimentalBorder: { radius: true, style: true, color: true, width: true } },
 edit: ({ attributes, setAttributes }: any) => {
  const props = useBlockProps({ className: 'sc-commerce-editor-card' });
  const snapshot = globalThis.WpSuiteCommerceConfig?.storefront;
  const valid = snapshot?.schemaVersion === 1 && Number.isSafeInteger(snapshot.revision) && (snapshot.revision || 0) > 0 && typeof snapshot.accountId === 'string' && /^acct_[A-Za-z0-9]+$/.test(snapshot.accountId) && (snapshot.mode === 'test' || snapshot.mode === 'live') && Array.isArray(snapshot.presentations);
  const presentations = valid ? snapshot!.presentations!.filter(p => p && typeof p.id === 'string' && /^[a-z0-9][a-z0-9._-]{0,63}$/.test(p.id) && typeof p.name === 'string' && p.name.length <= 200 && ['button','table'].includes(p.type) && ['payment_link','checkout'].includes(p.flow)) : [];
  const selected = presentations.find(p => p.id === attributes.presentationId);
  const options = [{ label: __('Select a presentation', domain), value: '' }, ...(attributes.presentationId && !selected ? [{ label: __('Previously selected presentation (unavailable)', domain), value: attributes.presentationId }] : []), ...presentations.map(p => ({ label: p.name, value: p.id }))];
  return <><InspectorControls><PanelBody title={__('Commerce settings', domain)}><SelectControl label={__('Presentation', domain)} value={attributes.presentationId} options={options} onChange={(presentationId: string) => setAttributes({ presentationId })} /></PanelBody></InspectorControls><div {...props}>
   <strong>{__('Sales presentation', domain)}</strong>
   {!presentations.length && <p>{__('Configure and publish a Commerce presentation to select it here.', domain)}</p>}
   {attributes.presentationId && !selected && <p role="status">{__('The selected presentation is unavailable. Its selection is preserved.', domain)}</p>}
   {selected && <><p>{selected.name} · {selected.type === 'button' ? __('Button', domain) : __('Table', domain)} · {selected.flow === 'checkout' ? __('Commerce checkout', domain) : __('Payment link', domain)}</p>{Array.isArray(selected.offers) && selected.offers.map(offer => <p key={offer.id}>{offer.name}</p>)}</>}
  </div></>;
 },
 save: () => null,
} as any);

registerBlockType<{pageId: string; label: string}>('smartcloud-commerce/article-link', {
 apiVersion: 3,
 title: __('Read full article', domain),
 description: __('Link a public teaser to its protected article.', domain),
 icon: 'lock',
 category: 'smartcloud-commerce',
 attributes: { pageId: { type: 'string', default: '' }, label: { type: 'string', default: '' } },
 edit: ({ attributes, setAttributes }) => {
  const props = useBlockProps({ className: 'sc-commerce-editor-card' });
  const routes = globalThis.WpSuiteCommerceArticleRoutes ?? [];
  const selected = routes.find(route => String(route.pageId) === attributes.pageId);
  const options = [
   { label: __('Select a protected article', domain), value: '' },
   ...routes.map(route => ({ label: `${route.path} · ${route.feature}`, value: String(route.pageId) })),
   ...(attributes.pageId && !selected ? [{ label: __('Previously selected article (unavailable)', domain), value: attributes.pageId }] : []),
  ];
  return <>
   <InspectorControls>
    <PanelBody title={__('Commerce settings', domain)}>
     <SelectControl label={__('Protected article', domain)} value={attributes.pageId} options={options}
      onChange={(pageId: string) => setAttributes({ pageId })} />
     <TextControl label={__('Button label', domain)} value={attributes.label}
      onChange={(label: string) => setAttributes({ label })} />
    </PanelBody>
   </InspectorControls>
   <div {...props}>
    <strong>{attributes.label || __('Read the full article', domain)}</strong>
    <p>{selected?.path ?? __('Choose a private Page configured under Commerce → WordPress protection.', domain)}</p>
   </div>
  </>;
 },
 save: () => null,
});
