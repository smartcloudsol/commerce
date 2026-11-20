/* Build-time only: preserve the installed editor libraries' original license notices. */
if (process.env.WPSUITE_PREMIUM !== 'true') process.exit(0);
const fs = require('node:fs');
const path = require('node:path');
const admin = path.resolve(__dirname, '..');
const seen = new Set();
const notices = [];
function packageFile(name, directory) {
  for (let current = directory; ; current = path.dirname(current)) {
    const candidate = path.join(current, 'node_modules', name, 'package.json');
    if (fs.existsSync(candidate)) return fs.realpathSync(candidate);
    if (path.dirname(current) === current) throw Error(`Missing dependency ${name}`);
  }
}
function visit(name, directory) {
  const file = packageFile(name, directory);
  if (seen.has(file)) return;
  seen.add(file);
  const metadata = JSON.parse(fs.readFileSync(file, 'utf8'));
  const root = path.dirname(file);
  const files = fs.readdirSync(root).filter(name => /^(licen[cs]e|copying|notice)(\..*)?$/i.test(name) && fs.statSync(path.join(root, name)).isFile()).sort();
  if (!files.length) throw Error(`Missing license notice for ${metadata.name}`);
  notices.push({ name: metadata.name, version: metadata.version, text: files.map(name => fs.readFileSync(path.join(root, name), 'utf8').trim()).join('\n\n') });
  for (const dependency of Object.keys(metadata.dependencies || {}).sort()) visit(dependency, root);
}
for (const name of ['@tiptap/core', '@tiptap/react', '@tiptap/starter-kit']) visit(name, admin);
fs.mkdirSync(path.join(admin, 'dist'), { recursive: true });
const output = ['Third-party notices for the Commerce email editor.', ...notices.sort((a, b) => a.name.localeCompare(b.name)).map(item => `${item.name}@${item.version}\n\n${item.text}`)].join('\n\n----------------------------------------\n\n') + '\n';
fs.writeFileSync(path.join(admin, 'dist', 'third-party-notices.txt'), output);
