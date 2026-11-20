/* Add presentation hooks without changing Gutenberg's stored block markup. */
function decoratePresentation(root) {
  const add = (scope, selector, ...classes) => scope.querySelectorAll(selector).forEach(node => node.classList.add(...classes));
  for (const section of root.querySelectorAll('.sc-commerce-plans')) {
    add(section, ':scope > .wp-block-heading', 'sc-commerce-plans-title');
    add(section, ':scope > p', 'sc-commerce-plans-description');
    add(section, ':scope > .wp-block-columns', 'sc-commerce-plan-grid');
    add(section, ':scope > .wp-block-columns > .wp-block-column', 'sc-commerce-plan-column');
  }
  for (const card of root.querySelectorAll('.sc-commerce-plan')) {
    add(card, ':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6', 'sc-commerce-plan-title');
    add(card, ':scope > .sc-commerce-eyebrow', 'sc-commerce-plan-name');
    add(card, ':scope > p:not(.sc-commerce-eyebrow):not(.sc-commerce-plan-features):not(.sc-commerce-plan-price)', 'sc-commerce-plan-description');
    add(card, ':scope > .sc-commerce-control', 'sc-commerce-plan-action');
  }
  add(root, '.sc-commerce-plan-features > li', 'sc-commerce-plan-feature');
  for (const panel of root.querySelectorAll('.sc-commerce-account')) {
    add(panel, ':scope > .wp-block-heading', 'sc-commerce-account-title');
    add(panel, ':scope > p', 'sc-commerce-account-description');
  }
  add(root, '[data-commerce-entitlements]', 'sc-commerce-entitlements');
  add(root, '[data-commerce-protected]', 'sc-commerce-protected');
  for (const button of root.querySelectorAll('button[data-commerce-action]')) {
    if (!['checkout', 'portal'].includes(button.dataset.commerceAction || '')) continue;
    button.classList.add('sc-commerce-button', `sc-commerce-button-${button.dataset.commerceAction}`);
    if (!button.querySelector(':scope > .sc-commerce-button-label')) {
      const label = button.ownerDocument.createElement('span');
      label.className = 'sc-commerce-button-label';
      label.append(...Array.from(button.childNodes)); button.append(label);
    }
  }
}
module.exports = { decoratePresentation };
