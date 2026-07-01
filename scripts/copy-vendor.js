// Copies third-party browser libraries from node_modules into public/vendor
// so the frontend can load them as plain <script> tags without a bundler.
const fs = require('fs');
const path = require('path');

const vendorDir = path.join(__dirname, '..', 'public', 'vendor');
fs.mkdirSync(vendorDir, { recursive: true });

const copies = [
  {
    from: path.join(
      __dirname,
      '..',
      'node_modules',
      'lightweight-charts',
      'dist',
      'lightweight-charts.standalone.production.js'
    ),
    to: path.join(vendorDir, 'lightweight-charts.standalone.production.js'),
  },
  {
    from: path.join(__dirname, '..', 'node_modules', 'html2canvas', 'dist', 'html2canvas.min.js'),
    to: path.join(vendorDir, 'html2canvas.min.js'),
  },
];

for (const { from, to } of copies) {
  try {
    fs.copyFileSync(from, to);
    console.log(`[copy-vendor] ${path.basename(to)} -> public/vendor/`);
  } catch (err) {
    console.warn(`[copy-vendor] skipped ${path.basename(to)}: ${err.message}`);
  }
}
