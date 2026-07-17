const puppeteer = require('puppeteer');

// Escape HTML special chars before interpolating into a certificate template
const esc = (str) =>
  String(str ?? '-')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Fill {{placeholder}} tokens in a certificate HTML template
const fillTemplate = (tpl, data) =>
  tpl.replace(/{{(\w+)}}/g, (_, key) => esc(data[key] ?? '-'));

// Reuse one headless Chromium instance across all certificate types instead
// of paying ~1-2s browser-launch cost (and running duplicate browsers) per
// generation.
const LAUNCH_OPTS = {
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
};

let browserPromise = null;
const getBrowser = async () => {
  if (!browserPromise) {
    browserPromise = puppeteer.launch(LAUNCH_OPTS);
  }
  const browser = await browserPromise;
  if (!browser.isConnected()) {
    browserPromise = puppeteer.launch(LAUNCH_OPTS);
    return browserPromise;
  }
  return browser;
};

module.exports = { esc, fillTemplate, getBrowser };
