/* Fixed, administrator-authenticated Commerce API. Template content never enters public Pro configuration. */
const types = ['started', 'cancellation_scheduled', 'cancellation_undone', 'plan_change_scheduled', 'plan_change_undone', 'plan_change_applied', 'ended'];
const variables = ['senderName', 'planName', 'previousPlanName', 'nextPlanName', 'effectiveDate', 'billingUrl'];
const fields = (v, keys) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === keys.length && Object.keys(v).every(k => keys.includes(k));
const text = (v, max) => typeof v === 'string' && v.length <= max && !v.includes('\0');
const locale = v => text(v, 35) && /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(v);
const revision = v => v === null || (text(v, 256) && /^"[a-fA-F0-9-]{1,128}"$/.test(v));
const invalid = () => { throw Error('Invalid email template response'); };
const contentFields = ['template', 'locale', 'subject', 'html', 'text'];
function content(v) {
  if (!v || !types.includes(v.template) || !locale(v.locale) || !text(v.subject, 200) || /[\r\n]/.test(v.subject) || !v.subject.trim() || !text(v.html, 65536) || !text(v.text, 32768) || !(v.html.trim() || v.text.trim())) invalid();
  return Object.fromEntries(contentFields.map(k => [k, v[k]]));
}
function record(v, template, lang) {
  if (!fields(v, [...contentFields, 'revision', 'source']) || v.template !== template || v.locale !== lang || !revision(v.revision) || !['default', 'custom'].includes(v.source) || (v.source === 'default') !== (v.revision === null)) invalid();
  return { ...content(v), revision: v.revision, source: v.source };
}
function createEmailTemplateClient(request) {
  return {
    async emailTemplates() {
      const v = await request('/admin/email-templates');
      if (!fields(v, ['configured', 'templates', 'variables', 'sender']) || typeof v.configured !== 'boolean' || !Array.isArray(v.templates) || !Array.isArray(v.variables)) invalid();
      if (!v.configured) {
        if (v.templates.length || v.variables.length || v.sender !== null) invalid();
        return v;
      }
      if (v.templates.length !== types.length || v.variables.length !== variables.length || !fields(v.sender, ['address', 'identityArn']) || !text(v.sender.address, 254) || !text(v.sender.identityArn, 512)) invalid();
      const seen = new Set(), tokens = new Set();
      for (const item of v.templates) {
        if (!fields(item, ['template', 'label', 'locales']) || !types.includes(item.template) || !text(item.label, 200) || !Array.isArray(item.locales) || item.locales.length > 50 || !item.locales.every(locale) || seen.has(item.template)) invalid();
        seen.add(item.template);
      }
      for (const item of v.variables) {
        if (!fields(item, ['name', 'label']) || !variables.includes(item.name) || !text(item.label, 200) || tokens.has(item.name)) invalid();
        tokens.add(item.name);
      }
      return v;
    },
    async emailTemplate(template, lang) {
      if (!types.includes(template) || !locale(lang)) invalid();
      return record(await request(`/admin/email-templates/content?template=${encodeURIComponent(template)}&locale=${encodeURIComponent(lang)}`), template, lang);
    },
    async saveEmailTemplate(value) {
      const model = content(value);
      if (!revision(value.expectedRevision)) invalid();
      return record(await request('/admin/email-templates/save', 'POST', { ...model, expectedRevision: value.expectedRevision }), model.template, model.locale);
    },
    async previewEmailTemplate(value) {
      const v = await request('/admin/email-templates/preview', 'POST', content(value));
      if (!fields(v, ['subject', 'html', 'text']) || !text(v.subject, 4096) || !text(v.html, 262144) || !text(v.text, 131072)) invalid();
      return { ...v };
    },
  };
}
module.exports = { createEmailTemplateClient };
