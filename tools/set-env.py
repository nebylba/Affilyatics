"""Points the extension at your local server (WAMP) or at production.

    python tools/set-env.py local     -> http://eblyn.local/Affilyatics/...   (to test on your computer)
    python tools/set-env.py test      -> https://eblyn.com/Affilyatics/...    (the shared test server, KEEPS the fixed extension id so Google sign-in works)
    python tools/set-env.py prod      -> https://eblyn.com/Affilyatics/...    (what the store build must use: no fixed key)
    python tools/set-env.py           -> shows the current setting

Only the four addresses in PLAN_CFG (plan.js) change. After switching, reload the extension in chrome://extensions.
tools/package.py refuses to build a zip while the extension points at a local address.
"""
import re, sys, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(ROOT, 'plan.js')
ENVS = {
    'local': 'http://eblyn.local/Affilyatics/',
    'test': 'https://eblyn.com/Affilyatics/',
    'prod': 'https://eblyn.com/Affilyatics/',
}
KEYS = [('api', 'api/v1'), ('signinUrl', 'signin/'), ('pricingUrl', '#plans'), ('privacyUrl', 'privacy/')]

s = open(P, encoding='utf8', newline='').read()

def current():
    m = re.search(r"api:\s*'([^']+)'", s)
    return m.group(1) if m else '?'

if len(sys.argv) < 2:
    print('Current api address:', current())
    sys.exit(0)
env = sys.argv[1]
if env not in ENVS:
    print('Use: local, test or prod')
    sys.exit(1)
base = ENVS[env]
for key, tail in KEYS:
    s, n = re.subn(r"(\b%s:\s*)'[^']*'" % key, lambda m: m.group(1) + "'" + base + tail + "'", s, count=1)
    if n != 1:
        print('Could not find', key, 'in plan.js')
        sys.exit(1)
open(P, 'w', encoding='utf8', newline='').write(s)

# manifest: the local build gets a fixed extension id (needed for the Google sign-in redirect address), the store build must not have a key
import json
MP = os.path.join(ROOT, 'manifest.json')
raw = open(MP, encoding='utf8', newline='').read()
nl = '\r\n' if '\r\n' in raw else '\n'
man = json.loads(raw)
dev = json.load(open(os.path.join(ROOT, 'tools', 'dev-extension-key.json'), encoding='utf8'))
if env in ('local', 'test'):
    man['key'] = dev['key']        # fixed extension id: the Google redirect address is registered for it
else:
    man.pop('key', None)
open(MP, 'w', encoding='utf8', newline='').write(json.dumps(man, indent=2, ensure_ascii=False).replace('\n', nl) + nl)
if env in ('local', 'test'):
    print('Extension id (fixed):', dev['id'], '-> Google redirect address: https://%s.chromiumapp.org/' % dev['id'])
print('Extension now points at', env, '->', base, '(reload it in chrome://extensions)')
