"""Draft a data entry for a new MW4 gun from its page on the stats source used by tools/crawl.py.
Usage, from the repo root:  python3 -I tools/new_gun.py SLUG "Exact Gun Name" OUT.json
Writes OUT.json as {"weapon": draft game.json entry, "attachments": [...], "notes": [...]}. Multiplayer numbers only.
Check every field before copying it into data/: unlock, bp, about, apex text and photo need filling in by hand.
Never name or link the stats source in data/."""
import re, sys, json, html as H
def objs(h):
    for m in re.finditer(r'\$R\[\d+\]=\{([^{}]*)\}',h):
        body=m.group(1); d={}
        for k,v in re.findall(r'(?:^|,)("?[A-Za-z_][\w ]*"?):("(?:[^"\\]|\\.)*"|[-\d.e]+|null|true|false|\$R\[\d+\])',body):
            k=k.strip('"')
            if v.startswith('"'): v=json.loads(v)
            elif v in('null','true','false') or v.startswith('$R'): v={'null':None,'true':True,'false':False}.get(v,v)
            else: v=float(v)
            d[k]=v
        yield d
def stats(h,gun,game='mw4'):
    return {o['attachment']:o for o in objs(h) if o.get('gun')==gun and o.get('game')==game and 'attachment' in o}
def meta(h,gun):
    return {o['Attachmentname']:o for o in objs(h) if o.get('WeaponUnlock')==gun and 'Attachmentname' in o}
# key: (label, lower_is_better)
K=[('horiz_recoil_mod','Horizontal Recoil',1),('vert_recoil_mod','Vertical Recoil',1),('zoom_level_mod','Zoom Level',None),
('range_mod','Range',0),('bv_mod','Bullet Velocity',0),('horiz_gun_kick_mod','Horizontal Gun Kick',1),('vert_gun_kick_mod','Vertical Gun Kick',1),
('mag_size_mod','Magazine Size',0),('reserve_ammo_mod','Reserves',0),
('ads_idle_sway_mod','ADS Idle Sway',1),('ads_gun_bob_mod','ADS Gun Bob',1),('movement_mod','Movement',0),('ads_movement_mod','ADS Movement',0),
('firing_movement_mod','Firing Move Speed',0),('strafe_movement_mod','Strafe Speed',0),('crouch_movement_mod','Crouch Movement',0),
('sprint_mod','Sprint',0),('tac_sprint_mod','Tactical Sprint Speed',0),('ads_mod','ADS Speed',1),('ads_out_mod','ADS Out Speed',1),
('stf_mod','Sprint To Fire',1),('reload_mod','Reload Speed',1),('hip_idle_sway_mod','Hip Idle Sway',1),('hip_gun_bob_mod','Hip Gun Bob',1),
('flinch_received_mod','Flinch Received',1),('bullet_penetration_mod','Bullet Penetration',0),('raise_speed_mod','Raise Speed',1)]
def rendered(h):
    out={}
    for row in re.findall(r'<tr[^>]*><td><div class="wd-attachment-name">.*?</tr>',h,flags=re.S):
        n=H.unescape(re.search(r'<a [^>]*>(.*?)</a>',row).group(1))
        out[n]=[H.unescape(re.sub(r'<!--.*?-->','',x)).strip() for x in re.findall(r'<span class="(?:positive|negative)">(.*?)</span>',row,flags=re.S)]
    return out
def build(h,gun):
    S=stats(h,gun); M=meta(h,gun); R=rendered(h); res=[]; notes=[]
    for n,m in M.items():
        a={'n':n,'s':m['Slot'],'l':int(m['Unlock Level'])}; u=[];d=[]; o=S.get(n)
        if m['Slot']=='Apex': continue
        if o is None: notes.append(n)
        for k,lab,low in K:
            v=(o or {}).get(k)
            if v is None or v==1: continue
            if k in('mag_size_mod','reserve_ammo_mod'):
                r=[x for x in R.get(n,[]) if x.endswith(lab)]
                if not r: notes.append(f'{n}:{lab}?'); continue
                u.append(re.sub(r'\s+',' ',r[0])); continue
            p=round((v-1)*100,1); t=f"{'+' if p>0 else ''}{p:.1f}% {lab}"
            good = True if low is None else ((p<0) if low else (p>0))
            (u if good else d).append(t)
        if u: a['u']=u
        if d: a['d']=d
        res.append(a)
    return res,notes
def strip_nested(s):
    prev=None
    while prev!=s:
        prev=s; s=re.sub(r'\$R\[\d+\]=(\{[^{}\[\]]*\}|\[[^{}\[\]]*\])','0',s)
    return s
def wstats(h,gun):
    out=[]
    for m in re.finditer(r'\{__v:0,_id:"[0-9a-f]+",ads:',h):
        seg=h[m.start()+1:m.start()+60000]
        seg=strip_nested(seg)
        end=seg.find('}'); top=seg[:end]
        d=dict(re.findall(r'(?:^|,)([A-Za-z_0-9]+):(-?[\d.e]+|!0|!1|"[^"]*"|null)',top))
        if d.get('gun')!='"%s"'%gun: continue
        out.append({k:(float(v) if re.match(r'-?[\d.]',v) else v.strip('"')) for k,v in d.items()})
    return out

ORDER = ['Optic', 'Muzzle', 'Barrel', 'Guard', 'Underbarrel', 'Magazine', 'Rear Grip', 'Stock', 'Laser', 'Ammunition']
CAT = {'Assault Rifle': 'ar', 'SMG': 'smg', 'Shotgun': 'sg', 'LMG': 'lmg', 'Marksman Rifle': 'mr', 'Sniper Rifle': 'sr', 'Sniper': 'sr', 'Pistol': 'pistol', 'Launcher': 'launcher', 'Melee': 'melee'}
if __name__ == '__main__':
    slug, gun, out = sys.argv[1], sys.argv[2], sys.argv[3]
    import subprocess, tempfile, os
    f = os.path.join(tempfile.mkdtemp(), slug + '.html')
    code = subprocess.run(['curl', '-sS', '-m', '30', '-o', f, '-w', '%{http_code}', 'https://codmunity.gg/weapon/mw4/' + slug], capture_output=True, text=True).stdout.strip()
    if code != '200': sys.exit(f'page download failed: HTTP {code}')
    h = open(f, encoding='utf-8', errors='replace').read()
    att, notes = build(h, gun)
    M = meta(h, gun)
    if not M: sys.exit(f'no attachment data for "{gun}" (check the exact name)')
    base = [d for d in wstats(h, gun) if d.get('game') == 'mw4' and 'loadoutId' not in d]
    if not base: notes.append('no Multiplayer base stats found: leave "live" out')
    b = base[0] if base else {}
    pf = b.get('pre_fire_delay', 0) or 0
    n = lambda k: (int(b[k]) if float(b[k]).is_integer() else round(b[k], 2)) if isinstance(b.get(k), float) else None
    live = {'kick': n('gun_kick'), 'hRecoil': n('horiz_recoil'), 'vRecoil': n('vert_recoil'), 'sway': n('ads_idle_sway'), 'rpm': n('rpm'), 'prefire': n('pre_fire_delay'),
            'ttk15': int(b['avgTtk1'] + pf) if 'avgTtk1' in b else None, 'ttk40': int(b['avgTtk2'] + pf) if 'avgTtk2' in b else None,
            'ttk80': int(b['avgTtk3'] + pf) if 'avgTtk3' in b else None, 'ttk100': int(b['avgTtk4'] + pf) if 'avgTtk4' in b else None,
            'pen': n('bullet_penetration'), 'move': n('movement'), 'adsMove': n('ads_movement'), 'sprint': n('sprint'), 'tac': n('tac_sprint'), 'vel': n('bv'),
            'hitscan': n('hitscan_range'), 'ads': n('ads'), 'stf': n('stf'), 'raise': n('raise_speed'), 'drop': n('drop_speed'), 'reload': n('reload'), 'mag': n('mag_size')}
    live = {k: v for k, v in live.items() if v is not None}
    apex = [(k, m) for k, m in M.items() if m['Slot'] == 'Apex']
    blocks = []
    mb = re.search(r'blocking:\$R\[\d+\]=\[(.*?)\],collec:"mw4-weapons"[^}]*?name:"%s"' % re.escape(gun), h)
    if mb: blocks = re.findall(r'"([A-Za-z ]+)"', ''.join(re.findall(r'blocks:\$R\[\d+\]=\[([^\]]*)\]', mb.group(1))))
    S = {m['Slot'] for m in M.values()}
    w = {'id': slug, 'name': gun, 'cat': CAT.get(b.get('weapon_type'), '?'), 'unlock': None, 'levels': int(max(m['Unlock Level'] for m in M.values())),
         'mag': n('mag_size'), 'reserve': n('reserve_ammo'), 'rpm': n('rpm'), 'slots': [s for s in ORDER if s in S], 'about': '',
         'apex': {'name': apex[0][0], 'about': apex[0][1].get('Description', ''), 'blocks': blocks} if apex else None,
         'live': live}
    json.dump({'weapon': w, 'attachments': att, 'notes': notes}, open(out, 'w'), indent=1, ensure_ascii=False)
    print(f'{gun}: {len(att)} attachments, {len(live)} live stats, notes: {notes}')
