import re, sys, os, time, subprocess

out = sys.argv[1]
seeds = ['m4', 'iso-nightshade', 'x-58-nyx', 'type-73', 'oris-86', 'kg-7-vulcan', 'rezi-12', 'sang-9mm', 'krait-p68']
seen, queue = set(), list(seeds)
while queue:
    slug = queue.pop(0)
    if slug in seen:
        continue
    seen.add(slug)
    f = os.path.join(out, slug + '.html')
    if not os.path.exists(f):
        r = subprocess.run(['curl', '-sS', '-m', '30', '-o', f, '-w', '%{http_code}', f'https://codmunity.gg/weapon/mw4/{slug}'],
                           capture_output=True, text=True)
        code = r.stdout.strip()
        if code != '200':
            print('FAIL', slug, code)
            if os.path.exists(f):
                os.remove(f)
            continue
        time.sleep(1.0)
    h = open(f, encoding='utf-8', errors='replace').read()
    for s in re.findall(r'href="/weapon/mw4/([a-z0-9-]+)"', h):
        if s not in seen and s not in queue:
            queue.append(s)
print(len(seen), 'slugs seen')
print(sorted(x[:-5] for x in os.listdir(out)))
