// Builds the website's LIVE DEMO from the REAL extension files, so the demo always is the real dashboard.
// Usage: node tools/build-demo.js "C:/Perso/EBLYN/Projects/eblyn.com/Affilyatics/demo"
// It writes <demo>/app/* (popup.js, shared.js, plan.js, theme.js, popup.css) and <demo>/index.html (from popup.html).
// demo.js (fake chrome + demo data), demo.css and demo-ui.js live in the website folder and are not touched.
const fs = require('fs'), path = require('path');
const demo = process.argv[2];
if (!demo) { console.error('Usage: node tools/build-demo.js <demo folder>'); process.exit(1); }
const root = path.join(__dirname, '..');
const app = path.join(demo, 'app');
fs.mkdirSync(app, { recursive: true });
for (const f of ['popup.js', 'shared.js', 'plan.js', 'theme.js']) fs.copyFileSync(path.join(root, f), path.join(app, f));
// the website keeps the fonts once, in ../../assets/fonts
fs.writeFileSync(path.join(app, 'popup.css'), fs.readFileSync(path.join(root, 'popup.css'), 'utf8').replace(/url\("fonts\//g, 'url("../../assets/fonts/'));

let h = fs.readFileSync(path.join(root, 'popup.html'), 'utf8').replace(/\r\n/g, '\n');
const sub = (a, b) => { if (!h.includes(a)) throw new Error('popup.html changed, cannot find: ' + a); h = h.replace(a, b); };
sub('<title>Affilyatics</title>', '<title>Affilyatics live demo</title>');
sub('<link rel="icon" type="image/svg+xml" href="icons/favicon-light.svg">', '<link rel="icon" type="image/svg+xml" href="../assets/favicon.svg">');
sub('<script src="theme.js"></script>', '<script>try { var s = localStorage.getItem("affilyatics-site-theme"); if (s) localStorage.setItem("affilyatics-theme", s); } catch (e) {}</script>\n<script src="app/theme.js"></script>');
sub('<link rel="stylesheet" href="popup.css">', '<link rel="stylesheet" href="app/popup.css">\n<link rel="stylesheet" href="demo.css">');
sub('src="icons/logo-light.svg"', 'src="../assets/logo-light.svg"');
sub('src="icons/logo-dark.svg"', 'src="../assets/logo-dark.svg"');
sub('<body>', '<body>\n<div class="demobar"><b>Live demo</b> with demo data. Everything works: try the Store, Countries and Tags filters, the period, the tabs, the bell and Settings. <a href="#" class="demotour" onclick="window.startAffilyaticsTour &amp;&amp; startAffilyaticsTour(); return false">Take the tour</a> <span class="demoplan">View as <a href="?plan=free&full=1">Free</a> · <a href="?full=1">Pro</a></span> <a class="demobtn" href="../#plans">Try it free for 14 days</a></div>');
sub('<script src="shared.js"></script>\n<script src="plan.js"></script>\n<script src="popup.js"></script>', '<script src="demo.js"></script>\n<script src="app/shared.js"></script>\n<script src="app/plan.js"></script>\n<script src="app/popup.js"></script>\n<script src="demo-ui.js"></script>');
fs.writeFileSync(path.join(demo, 'index.html'), h);
console.log('Demo built in ' + demo);
