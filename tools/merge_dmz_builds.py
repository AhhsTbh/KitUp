"""Copy freshly parsed DMZ builds into data/dmz.json without touching the rest of the guide.
Attachment names are matched to data/attachments.json so barrels keep their inch mark (the live pages drop it)."""
import json, os, re, sys

data_dir, builds_file = sys.argv[1], sys.argv[2]
path = os.path.join(data_dir, 'dmz.json')
dmz = json.load(open(path, encoding='utf-8'))
builds = json.load(open(builds_file, encoding='utf-8'))
att = json.load(open(os.path.join(data_dir, 'attachments.json'), encoding='utf-8'))
norm = lambda n: re.sub(r'[\s"\u2033\u201d]+', ' ', n).strip().lower()

def canon(items):
    for b in items:
        known = {(i['s'], norm(i['n'])): i['n'] for i in att.get(b['w'], [])}
        for a in b['att']:
            a['n'] = known.get((a['s'], norm(a['n'])), a['n'])
    return items

if builds:
    dmz['builds'] = canon(builds)
else:
    canon(dmz.get('builds', []))
json.dump(dmz, open(path, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
print('dmz builds:', len(dmz.get('builds', [])))
