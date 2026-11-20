import { registerBlockVariation, createBlock } from '@wordpress/blocks';
import { InspectorControls } from '@wordpress/block-editor';
import { addFilter } from '@wordpress/hooks';
import { useDispatch } from '@wordpress/data';
import { PanelBody, Button, SelectControl, Notice } from '@wordpress/components';
import { createElement, useEffect, useRef, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { getConfig, getWpSuite, getBackendProfileContext } from '@smart-cloud/wpsuite-core';
import { waitForGateyReady, getGateyPlugin, getStoreSelect, loadAuthSession } from '@smart-cloud/gatey-core';
// @ts-ignore Shared runtime resolvers.
import { resolveService, resolveGateyEndpoint } from '../../main/src/index-config';
// @ts-ignore Shared strict Commerce admin client.
import { createStripeAdminClient } from '../../admin/src/stripe-client';

const domain = 'smartcloud-commerce';
registerBlockVariation('core/list', {name:'commerce-marketing-features',title:__('Stripe product features',domain),description:__('An editable list populated from a Stripe product.',domain),attributes:{className:'sc-commerce-plan-features'},scope:['inserter']});
type Product = {id:string;name?:string;marketingFeatures?:string[]};
const context = () => JSON.stringify([location.href, getBackendProfileContext(), getWpSuite()?.siteSettings]);
const escapeText = (value:string) => value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
async function principal() {
 const token = (await loadAuthSession()).tokens?.accessToken;
 const sub = token?.payload?.sub; const issuer = token?.payload?.iss; const client = token?.payload?.client_id;
 if (typeof sub !== 'string' || !sub || typeof issuer !== 'string' || !issuer || typeof client !== 'string' || !client || !token) throw Error('Sign in required');
 return {sub:JSON.stringify([issuer,client,sub]), token:token.toString()};
}
function FeatureInspector({clientId, attributes}:any) {
 const [products,setProducts] = useState<Product[]>([]);
 const [selection,setSelection] = useState('');
 const [nextCursor,setNextCursor] = useState('');
 const [message,setMessage] = useState('');
 const [busy,setBusy] = useState(false);
 const [confirm,setConfirm] = useState(false);
 const live = useRef(true); const sequence = useRef(0);
 const snapshot = useRef<{context:string;sub:string;config:string}|null>(null);
 const {replaceInnerBlocks} = useDispatch('core/block-editor') as any;
 useEffect(() => {live.current=true; return () => {live.current=false; sequence.current++;};}, []);
 async function load(cursor?:string) {
  const run=++sequence.current; const initial=context(); const prior=snapshot.current;
  if(!cursor) { snapshot.current=null; setProducts([]); setSelection(''); setNextCursor(''); }
  setBusy(true);setConfirm(false);setMessage('');
  const check=()=>{if(!live.current || sequence.current!==run || context()!==initial) throw Error('Connection changed');};
  try {
   if(!getGateyPlugin()) throw Error('Gatey unavailable'); await waitForGateyReady(); check(); if(!getGateyPlugin()) throw Error('Sign in required');
   const identity=await principal(); check();
   const connection=getWpSuite()?.siteSettings; if(!connection || connection.workspaceApiMode!=='workspace' || !connection.platformApiBaseUrl || !connection.platformConfigUrl) throw Error('Commerce workspace connection required');
   const config=await getConfig('commerce'); check(); const configSnapshot=JSON.stringify(config);
   if(cursor && (!prior || prior.context!==initial || prior.sub!==identity.sub || prior.config!==configSnapshot)) throw Error('Connection changed');
   const client=createStripeAdminClient({getContext:()=>context(),fetcher:fetch.bind(globalThis),
    resolveBaseUrl:async()=>{check(); const current=await getConfig('commerce');check();if(JSON.stringify(current)!==configSnapshot)throw Error('Connection changed');const result=await resolveService(current,async(name:string)=>{await waitForGateyReady();check();const cognito=getGateyPlugin()?.cognito;const store=await cognito?.store;check();if(!cognito||!store)throw Error('Gatey unavailable');return resolveGateyEndpoint(cognito,getStoreSelect(store).getConfig(),name,location.hostname);});check();return result.apiUrl;},
    authenticate:async()=>{const active=await principal();check();if(active.sub!==identity.sub)throw Error('Session changed');return active.token;}});
   const result=await client.catalog('products',cursor);check(); const active=await principal();check();if(active.sub!==identity.sub || JSON.stringify(await getConfig('commerce'))!==configSnapshot) throw Error('Connection changed');check();
   setProducts(previous=>cursor ? [...previous,...result.items].slice(0,250) : result.items);snapshot.current={context:initial,sub:identity.sub,config:configSnapshot};
   setNextCursor(result.nextCursor && (!cursor || products.length + result.items.length < 250) ? result.nextCursor : '');
   if(result.nextCursor && cursor && products.length + result.items.length >= 250) setMessage(__('Product limit reached. Refine your catalog in Stripe.',domain));
   else if(!cursor && !result.items.length) setMessage(__('No products were found.',domain));
  } catch {if(live.current&&sequence.current===run){setProducts([]);setNextCursor('');snapshot.current=null;setMessage(__('Products could not be loaded. Check your Commerce connection and administrator access.',domain));}}
  finally {if(live.current&&sequence.current===run)setBusy(false);}
 }
 async function replace() {
  const product=products.find(p=>p.id===selection);const captured=snapshot.current;const run=++sequence.current;
  if(!product || !captured || !Array.isArray(product.marketingFeatures) || !product.marketingFeatures.length) return;
  setBusy(true);setMessage('');
  try {
   const config=await getConfig('commerce');const identity=await principal();
   if(!live.current || sequence.current!==run || context()!==captured.context || identity.sub!==captured.sub || JSON.stringify(config)!==captured.config) throw Error('Connection changed');
   replaceInnerBlocks(clientId,product.marketingFeatures.map(feature=>createBlock('core/list-item',{content:escapeText(feature),className:'sc-commerce-plan-feature'})),false);
   setConfirm(false);setMessage(__('Features imported. You can edit this list normally.',domain));
  } catch {if(live.current&&sequence.current===run)setMessage(__('The connection changed. Load products again.',domain));}
  finally {if(live.current&&sequence.current===run)setBusy(false);}
 }
 const chosen=products.find(p=>p.id===selection);
 const available=Array.isArray(chosen?.marketingFeatures);
 return <InspectorControls><PanelBody title={__('Stripe product features',domain)} initialOpen={true}>
  <p>{__('Import a snapshot of a product’s marketing features into this editable list.',domain)}</p>
  <Button variant="secondary" disabled={busy} onClick={()=>load()}>{busy ? __('Loading…',domain) : __('Load products',domain)}</Button>
  {nextCursor && <Button variant="secondary" disabled={busy} onClick={()=>load(nextCursor)}>{__('Load more products',domain)}</Button>}
  {products.length>0 && <SelectControl label={__('Product',domain)} value={selection} options={[{label:__('Select a product',domain),value:''},...products.map(p=>({label:p.name || p.id,value:p.id}))]} onChange={(value:string)=>{setSelection(value);setConfirm(false);}}/>}
  {chosen && !available && <p>{__('Product features are unavailable from this backend. Update the Commerce service before importing.',domain)}</p>}
  {chosen && available && !chosen.marketingFeatures?.length && <p>{__('This product has no marketing features to import.',domain)}</p>}
  {chosen && available && !!chosen.marketingFeatures?.length && !confirm && <Button variant="primary" disabled={busy} onClick={()=>setConfirm(true)}>{__('Replace list with features',domain)}</Button>}
  {confirm && <><p>{__('Replace the current list items with this product’s features?',domain)}</p><Button variant="primary" disabled={busy} onClick={replace}>{__('Confirm replacement',domain)}</Button>{' '}<Button variant="secondary" disabled={busy} onClick={()=>setConfirm(false)}>{__('Cancel',domain)}</Button></>}
  {message && <Notice status="info" isDismissible={false}>{message}</Notice>}
 </PanelBody></InspectorControls>;
}
addFilter('editor.BlockEdit','smartcloud-commerce/marketing-features',(BlockEdit:any)=>(props:any)=> <><BlockEdit {...props}/>{props.name==='core/list' && /(?:^|\s)sc-commerce-plan-features(?:\s|$)/.test(props.attributes.className || '') && <FeatureInspector clientId={props.clientId} attributes={props.attributes}/>}</>);
