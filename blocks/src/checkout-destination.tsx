import { useEffect, useRef, useState } from '@wordpress/element';
import { Button, SelectControl, TextControl, Spinner } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { getWpSuite, getBackendProfileContext, assertBackendProfileConfiguration } from '@smart-cloud/wpsuite-core';
import { requestCommerceSiteService } from '../../admin/src/site-service';
// @ts-ignore Shared site-scoped service transport; Stripe credentials stay in the backend.
import { createPlatformCommerceClient } from '../../admin/src/platform-client';
// @ts-ignore Data-only public destination projections.
import { publishedDestinations, catalogDestinations } from './checkout-destinations.cjs';

const domain = 'smartcloud-commerce';
const context = () => JSON.stringify([getBackendProfileContext(), getWpSuite()?.siteSettings]);
type Destination = {key:string; name:string; price:string; flow:string; value:string};
export function CheckoutDestination({attributes, setAttributes}:any) {
 const [catalog, setCatalog] = useState<{context:string; items:Destination[]; cursor?:string} | null>(null);
 const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
 const client = useRef<any>(null), run = useRef(0);
 const identity = context();
 const connection = getWpSuite()?.siteSettings;
 const connected = !!(connection?.workspaceId && connection?.siteId && connection?.siteKey && connection?.workspaceApiMode === 'workspace');
 async function load(cursor?:string) {
  const version = ++run.current, initial = context();
  const current = () => version === run.current && context() === initial;
  setBusy(true); setMessage('');
  try {
   const result = await client.current.catalog('paymentLinks', cursor);
   if (!current()) return;
   setCatalog(previous => ({context:initial, items:[...(cursor && previous?.context === initial ? previous.items : []), ...catalogDestinations(result.items)].slice(0,250), cursor:result.nextCursor}));
  } catch { if (current()) setMessage(__('Payment Links could not be loaded. Check the Stripe connection in Commerce and try again.', domain)); }
  finally { if (current()) setBusy(false); }
 }
 useEffect(() => {
  setCatalog(null); setMessage(''); setBusy(false);
  client.current = createPlatformCommerceClient({getContext:context, getConnection:()=>getWpSuite()?.siteSettings, requestService:requestCommerceSiteService, assertConfiguration:assertBackendProfileConfiguration});
  if (connected) void load();
  return () => { ++run.current; client.current?.dispose(); client.current = null; };
 }, [identity]);
 const saved:Destination[] = publishedDestinations(globalThis.WpSuiteCommerceConfig?.storefront);
 const choices = new Map<string,Destination>(saved.map(item => [item.key,item]));
 if (catalog?.context === identity) for (const item of catalog.items) if (!choices.has(item.key)) choices.set(item.key,item);
 const selected = attributes.paymentLinkUrl ? `payment_link:${attributes.paymentLinkUrl}` : attributes.value ? `checkout:${attributes.value}` : '';
 const unknown = !!selected && !choices.has(selected);
 const options = [{label:__('Select a checkout destination', domain),value:''}, ...[...choices.values()].map(item=>({label:[item.name,item.price,item.flow === 'payment_link' ? __('Stripe Payment Link',domain) : __('Commerce Checkout (sign-in required)',domain)].filter(Boolean).join(' — '),value:item.key})), ...(unknown ? [{label:__('Previously selected destination (unavailable)',domain),value:selected}] : []), {label:__('Custom Commerce offer ID',domain),value:'manual'}];
 const [manual, setManual] = useState(false);
 function choose(key:string) {
  if (context() !== identity) {setMessage(__('The site connection changed. Select the block again.',domain));return;}
  if (key === 'manual') {setManual(true);setAttributes({paymentLinkUrl:''});return;}
  setManual(false);
  if (!key) {setAttributes({value:'',paymentLinkUrl:''});return;}
  const item = choices.get(key); if (!item) return;
  setAttributes(item.flow === 'payment_link' ? {value:'',paymentLinkUrl:item.value} : {value:item.value,paymentLinkUrl:''});
 }
 return <>
  <SelectControl label={__('Checkout destination',domain)} value={manual ? 'manual' : selected} options={options} onChange={choose} help={attributes.paymentLinkUrl ? __('Stripe Payment Links open directly. For subscription-based member access, choose a Commerce Checkout offer.',domain) : __('Choose a published offer or an active Stripe Payment Link. Your button label stays editable.',domain)} />
  {(manual || (unknown && !attributes.paymentLinkUrl)) && <TextControl label={__('Offer ID',domain)} value={attributes.value} onChange={(value:string)=>setAttributes({value,paymentLinkUrl:''})} />}
  {unknown && <p role="status">{__('The previous selection is preserved. Refresh the Payment Links or choose another destination.',domain)}</p>}
  {busy && <p role="status"><Spinner />{__('Loading Stripe Payment Links…',domain)}</p>}
  {message && <p role="status">{message}</p>}
  {connected ? <><Button variant="secondary" disabled={busy} onClick={()=>void load()}>{__('Refresh Payment Links',domain)}</Button>{catalog?.context === identity && catalog.cursor && catalog.items.length < 250 && <Button variant="tertiary" disabled={busy} onClick={()=>void load(catalog.cursor)}>{__('Load more Payment Links',domain)}</Button>}</> : <p>{__('Published offers are available here. Connect your site and Stripe in Commerce to browse other Payment Links.',domain)}</p>}
 </>;
}
