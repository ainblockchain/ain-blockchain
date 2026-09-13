#!/usr/bin/env python3
"""파이프라인 노드들에서 결과를 모아 results/pipelines-<TAG>.{json,html} 을 만든다.
각 행의 지식 id 는 공개 노드(ainize.ai) 카탈로그 링크, 온체인 경로는 인증망 REST 링크로 건다."""
import json, sys, os, html, time, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor

homes, tag, n, base, chain, public, anchor_base, res, peak, t0, logs = sys.argv[1:12]
n, base, peak, t0 = int(n), int(base), int(peak), int(t0)

HTTP_T = int(os.environ.get('HTTP_TIMEOUT', '30'))

def get(url, timeout=None):
    timeout = timeout or HTTP_T
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return json.load(r)
    except Exception:
        return None

PUBLIC_PEERS = set()
def load_public_peers():
    info = get(public + '/api/info', 15)
    if not info: return
    ps = info.get('peer_status') or {}
    for group in ('mismatched', 'peers', 'reachable_list'):
        for e in (ps.get(group) or []):
            ep = e.get('endpoint') if isinstance(e, dict) else e
            if ep: PUBLIC_PEERS.add(ep.rstrip('/'))
    for e in (info.get('peers') or []) if isinstance(info.get('peers'), list) else []:
        ep = e.get('endpoint') if isinstance(e, dict) else e
        if ep: PUBLIC_PEERS.add(str(ep).rstrip('/'))

def one(i):
    node = 'http://localhost:%d' % (base + i)
    row = dict(idx=i, node=node, name='pipeline-%s-%02d' % (tag, i), patch=None, status='NO_NODE',
               anchor_ref=None, onchain=False, onchain_final=False, on_public=False, chain_link=None, public_link=None,
               node_link=node + '/api/catalog')
    cat = get(node + '/api/catalog')
    if cat is None:
        return row
    items = cat.get('items') or []
    row['status'] = 'PUBLISHED' if items else 'NOT_PUBLISHED'
    if not items:
        sub = os.path.join(logs, 'submit-%02d.json' % i)
        if os.path.exists(sub):
            try:
                d = json.load(open(sub))
                if isinstance(d, dict) and d.get('error'):
                    row['status'] = 'SUBMIT_ERROR'
                    row['error'] = str(d['error'].get('message'))[:200]
            except Exception:
                pass
        return row
    pid = (items[0].get('anchor') or {}).get('id')
    row['patch'] = pid
    if pid:
        ref = '%s/%s' % (anchor_base, pid)
        row['anchor_ref'] = ref
        q = urllib.parse.quote(ref, safe='')
        row['chain_link'] = '%s/get_value?ref=%s' % (chain, q)
        # 두 가지를 나눠 기록한다:
        #   onchain       = anchor 가 체인에 기록되어 링크로 읽힌다 (판정 근거)
        #   onchain_final = 그 값이 최종화(is_final)까지 갔다 (부하가 큰 리허설 호스트에서는 지연된다)
        for _ in range(int(os.environ.get('ANCHOR_TRIES', '10'))):
            d = get('%s/get_value?ref=%s' % (chain, q), 8)
            if d and d.get('result') is not None:
                row['onchain'] = True
                break
            time.sleep(2)
        if row['onchain']:
            f = get('%s/get_value?ref=%s&is_final=true' % (chain, q), 8)
            row['onchain_final'] = bool(f and f.get('result') is not None)
    # 공개 노드(ainize.ai)는 local 원장이라 AIN 체인 지식이 카탈로그로 넘어가지 않는다.
    # 대신 이 파이프라인 노드가 공개 노드의 peer 목록에 살아 있는지로 "공개적으로 보인다" 를 판정한다.
    row['public_link'] = public + '/api/info'
    row['on_public'] = node.rstrip('/') in PUBLIC_PEERS
    return row


# 각 노드 로그에서 학습 구간 [training started, READY] 을 읽어 "실제로 동시에 돌던 파이프라인 수" 를 계산한다.
import re as _re, datetime as _dt
def train_window(i):
    cands = [os.path.join(homes, '%s-%d' % (tag, i), 'node.log'),
             os.path.join(logs, 'start-%d.log' % i)]
    log = next((c for c in cands if os.path.exists(c) and os.path.getsize(c) > 0), None)
    a = b = None
    if not log: return None
    try:
        for line in open(log, encoding='utf-8', errors='ignore'):
            m = _re.match(r'\[([0-9T:.\-Z]+)\]\s+INFO\s+teach: (training started|READY)', line)
            if not m: continue
            ts = _dt.datetime.fromisoformat(m.group(1).replace('Z', '+00:00')).timestamp()
            if m.group(2) == 'training started' and a is None: a = ts
            elif m.group(2) == 'READY': b = ts
    except Exception:
        return None
    return (a, b) if a and b and b >= a else None

def max_overlap(wins):
    ev = []
    for a, b in wins: ev.append((a, 1)); ev.append((b, -1))
    ev.sort()
    cur = best = 0
    for _, d in ev:
        cur += d; best = max(best, cur)
    return best

_wins = [w for w in (train_window(i) for i in range(1, n + 1)) if w]
TRAIN_CONCURRENT = max_overlap(_wins) if _wins else 0
TRAIN_SPAN = (round(max(b for _, b in _wins) - min(a for a, _ in _wins), 1) if _wins else 0)

load_public_peers()
with ThreadPoolExecutor(max_workers=16) as ex:
    rows = list(ex.map(one, range(1, n + 1)))

ok_pub = sum(1 for r in rows if r['on_public'])
ok_chain = sum(1 for r in rows if r['onchain'])
ok_final = sum(1 for r in rows if r.get('onchain_final'))
published = sum(1 for r in rows if r['patch'])
report = dict(metric='M1_parallel_teach_pipelines', target=n, tag=tag, pipelines=published,
              peakConcurrent=peak, trainingConcurrent=TRAIN_CONCURRENT, trainingSpanS=TRAIN_SPAN,
              trainingWindows=len(_wins), publishedOnPublicNode=ok_pub, anchoredOnChain=ok_chain, anchorsFinalized=ok_final,
              nodes=n, portBase=base, chain=chain, publicNode=public, anchorBase=anchor_base,
              design='한 노드가 한 번에 한 수업만 돌리므로(ainize-node teach.ts), 파이프라인 N개는 노드 N개로 동시에 구동한다',
              elapsedS=int(time.time()) - t0, pipelinesDetail=rows)
report['pass'] = published >= n and ok_pub >= n and ok_chain >= n
json.dump(report, open(os.path.join(res, 'pipelines-%s.json' % tag), 'w'), ensure_ascii=False, indent=2)

CHECK, CROSS = '✔', '✘'
trs = []
for r in rows:
    pid_cell = '&mdash;'
    if r['patch']:
        pid_cell = '<a href="%s" target="_blank">%s</a>' % (html.escape(r['node_link']), html.escape(r['patch']))
    ref_cell = '&mdash;'
    if r['chain_link']:
        ref_cell = '<a href="%s" target="_blank">%s</a>' % (html.escape(r['chain_link']), html.escape(r['anchor_ref']))
    trs.append(
        '<tr><td>%d</td><td>%s</td><td><a href="%s" target="_blank">:%d</a></td>'
        '<td class="s %s">%s</td><td class="m">%s</td><td class="m">%s</td><td>%s</td><td>%s</td></tr>' % (
            r['idx'], html.escape(r['name']), html.escape(r['node_link']), base + r['idx'],
            html.escape(r['status'].lower()), html.escape(r['status']), pid_cell, ref_cell,
            (CHECK if r['onchain'] else CROSS) + ('' if r.get('onchain_final') else '<sup>미확정</sup>'), CHECK if r['on_public'] else CROSS))

doc = """<!doctype html><meta charset="utf-8">
<title>%(title)s</title>
<style>body{font:14px system-ui,-apple-system,sans-serif;margin:24px;color:#111}
h1{font-size:20px;margin:0 0 4px}table{border-collapse:collapse;width:100%%;font-size:13px}
th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}th{background:#f5f5f5;position:sticky;top:0}
.m{font-family:ui-monospace,SFMono-Regular,monospace;font-size:12px;word-break:break-all}
.s.published{color:#0a7;font-weight:600}.s.submit_error,.s.no_node{color:#c00}
a{color:#06c}.sum{margin:12px 0 16px;padding:10px 12px;background:#f7f7f7;border-left:3px solid #06c}
code{background:#eee;padding:1px 4px;border-radius:3px}</style>
<h1>%(title)s</h1>
<div class="sum"><b>동시 진행 최대 %(peak)d개</b> (학습 구간이 실제로 겹친 최대 %(tc)d개, 전체 %(span).0f초) &middot; 공개된 파이프라인 %(published)d/%(n)d &middot;
공개 노드 게시 %(ok_pub)d/%(n)d &middot; 온체인 anchor %(ok_chain)d/%(n)d (확정 %(ok_final)d) &middot; 소요 %(elapsed)d초<br>
노드 <code>localhost:%(p1)d~%(p2)d</code> (노드 1개 = 파이프라인 1개) &middot;
인증망 <code>%(chain)s</code> &middot;
공개 노드 <a href="%(public)s/api/catalog" target="_blank">%(public)s</a><br>
<i>%(design)s</i></div>
<table><tr><th>#</th><th>파이프라인</th><th>노드</th><th>상태</th>
<th>지식 id (누르면 이 노드의 공개 카탈로그)</th>
<th>온체인 경로 (누르면 인증망에서 값)</th><th>온체인</th><th>ainize.ai<br>peer</th></tr>
%(rows)s</table>""" % dict(
    title=html.escape('온체인 병렬 파이프라인 %d개 — %s' % (published, tag)),
    ok_final=ok_final, peak=peak, tc=TRAIN_CONCURRENT, span=TRAIN_SPAN, published=published, n=n, ok_pub=ok_pub, ok_chain=ok_chain,
    elapsed=report['elapsedS'], p1=base + 1, p2=base + n,
    chain=html.escape(chain), public=html.escape(public),
    design=html.escape(report['design']), rows=''.join(trs))
open(os.path.join(res, 'pipelines-%s.html' % tag), 'w', encoding='utf-8').write(doc)
print('    파이프라인 %d/%d · 동시 진행 %d · 학습 겹침 %d · 공개 %d · 온체인 %d (확정 %d)' % (published, n, peak, TRAIN_CONCURRENT, ok_pub, ok_chain, ok_final))
