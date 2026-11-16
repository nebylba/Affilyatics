"""Builds the Chrome Web Store upload: ../Affilyatics.com.zip (manifest at the root of the zip).

    python tools/package.py [output.zip]

Only what the extension needs at run time goes in: no docs, tools, store listing, tests, git or notes.
Checks first: manifest version, description length (store limit 132), every file the manifest and popup.html point at exists,
and the license public key is not empty.
"""
import json, os, re, sys, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(ROOT), 'Affilyatics.com.zip')
INCLUDE_FILES = ['manifest.json', 'background.js', 'popup.html', 'popup.js', 'popup.css', 'shared.js', 'plan.js', 'license.js', 'theme.js']
INCLUDE_DIRS = ['icons', 'fonts']

def fail(msg):
    print('PACKAGE FAILED: ' + msg)
    sys.exit(1)

m = json.load(open(os.path.join(ROOT, 'manifest.json'), encoding='utf8'))
if len(m['description']) > 132:
    fail('manifest description is %d characters, the store allows 132' % len(m['description']))
plan = open(os.path.join(ROOT, 'plan.js'), encoding='utf8').read()
if not re.search(r"publicKey:\s*'[A-Za-z0-9+/=]{300,}'", plan):
    fail('plan.js has no license public key')
if re.search(r"(api|signinUrl):\s*'http://", plan) or 'eblyn.local' in plan or 'localhost' in plan:
    fail('plan.js still points at a local address: run  python tools/set-env.py prod  first')
if 'eblyn.com' not in plan:
    fail('plan.js api address looks wrong')

need = set(INCLUDE_FILES)
for f in need:
    if not os.path.isfile(os.path.join(ROOT, f)):
        fail('missing file ' + f)
html = open(os.path.join(ROOT, 'popup.html'), encoding='utf8').read()
for ref in re.findall(r'(?:src|href)="([^"#?]+)"', html):
    if not ref.startswith('http') and not os.path.isfile(os.path.join(ROOT, ref)):
        fail('popup.html points at a missing file: ' + ref)
for ref in re.findall(r"importScripts\(([^)]*)\)", open(os.path.join(ROOT, 'background.js'), encoding='utf8').read()):
    for f in re.findall(r"'([^']+)'", ref):
        if f not in INCLUDE_FILES:
            fail('background.js imports a file that is not packaged: ' + f)

if os.path.exists(OUT):
    os.remove(OUT)
count = 0
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    for f in INCLUDE_FILES:
        z.write(os.path.join(ROOT, f), f); count += 1
    for d in INCLUDE_DIRS:
        for dp, _, files in os.walk(os.path.join(ROOT, d)):
            for fn in sorted(files):
                full = os.path.join(dp, fn)
                z.write(full, os.path.relpath(full, ROOT).replace(os.sep, '/')); count += 1
print('Built %s (%d files, version %s, %.0f KB)' % (OUT, count, m['version'], os.path.getsize(OUT) / 1024))
