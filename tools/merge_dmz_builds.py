"""Copy freshly parsed DMZ builds into data/dmz.json without touching the rest of the guide."""
import json, os, sys

data_dir, builds_file = sys.argv[1], sys.argv[2]
path = os.path.join(data_dir, 'dmz.json')
dmz = json.load(open(path, encoding='utf-8'))
builds = json.load(open(builds_file, encoding='utf-8'))
if builds:
    dmz['builds'] = builds
    json.dump(dmz, open(path, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
print('dmz builds:', len(dmz.get('builds', [])))
