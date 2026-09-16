#!/usr/bin/env python3
"""지표 3 — 학습 기록 블록체인 레이턴시.

학습 기록은 상태가 바뀔 때마다 같은 경로(`/apps/knowledge/market/lessons/<node>/<job>`)에
덮어써진다. 그러므로 체인 상태에서 읽은 값은 **마지막** 기록이고, 그 경로를 처음 담은
블록은 **첫** 기록의 블록이다. 둘을 짝지으면 나중 시각에서 이른 블록을 빼게 되어 음수가
나온다. 실제로 그렇게 계산하면 70건 중 48건이 음수였다.

그래서 여기서는 상태를 읽지 않는다. 블록을 훑으며 **트랜잭션이 실제로 쓴 값**에서
그 쓰기의 `submitted_at` 을 꺼내, 바로 그 쓰기가 담긴 블록과 짝짓는다. 쓰기 하나가
측정 하나다.

블록의 `timestamp` 는 제안자가 블록을 만들기 시작한 시각이고, 그 뒤 얼마간 트랜잭션을
모아 봉인한다. 그래서 기록이 체인에 올라간 시각은 그 블록이 닫힌 시각, 곧 다음 블록의
타임스탬프로 읽는다. 원시 차이도 함께 남긴다.

사용: python3 m3-latency-from-lessons.py <chain-url> <expected-count> <out.json> [from-block]
"""
import json, os, re, sys, urllib.request, concurrent.futures as cf

chain, expected, out = sys.argv[1], int(sys.argv[2]), sys.argv[3]
from_block = int(sys.argv[4]) if len(sys.argv) > 4 else 0
WORKERS = int(os.environ.get('SCAN_WORKERS', '8'))
TIMEOUT = int(os.environ.get('HTTP_TIMEOUT', '30'))
PREFIX = '/apps/knowledge/market/lessons/'
PATH_RE = re.compile(r'^/apps/knowledge/market/lessons/([^/]+)/([^/]+)$')


def get(url, timeout=TIMEOUT):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return json.load(r)
    except Exception:
        return None


tip = (get('%s/last_block_number' % chain) or {}).get('result') or 0
stamps = {}


def scan(number):
    """한 블록에서 학습 기록 쓰기를 모두 꺼낸다. 각 쓰기의 submitted_at 은 그 쓰기의 값에서 읽는다."""
    b = (get('%s/get_block_by_number?number=%d' % (chain, number)) or {}).get('result')
    if not isinstance(b, dict):
        return number, None, []
    found = []
    for t in (b.get('transactions') or []):
        op = ((t.get('tx_body') or {}).get('operation')) or {}
        for one in (op.get('op_list') or [op]):
            ref = one.get('ref')
            m = PATH_RE.match(ref) if isinstance(ref, str) else None
            if not m:
                continue
            value = one.get('value')
            if not isinstance(value, dict) or not isinstance(value.get('submitted_at'), int):
                continue
            found.append({'node': m.group(1), 'job': m.group(2), 'ref': ref,
                          'submitted_at': value['submitted_at'], 'status': value.get('status'),
                          'patch_id': value.get('patch_id'), 'block': number, 'tx_hash': t.get('hash')})
    return number, b.get('timestamp'), found


writes = []
with cf.ThreadPoolExecutor(max_workers=WORKERS) as ex:
    for number, ts, found in ex.map(scan, range(from_block, tip + 1)):
        if isinstance(ts, int):
            stamps[number] = ts
        writes.extend(found)


def sealed_at(number):
    """그 블록이 닫힌 시각 = 다음 블록의 타임스탬프."""
    for n in range(number + 1, min(number + 8, tip + 1)):
        if n in stamps:
            return stamps[n]
    return None


rows = []
for w in sorted(writes, key=lambda x: x['submitted_at']):
    sealed = sealed_at(w['block'])
    raw = stamps.get(w['block'])
    rows.append({**w, 'block_timestamp': raw, 'block_sealed_at': sealed,
                 'latency_ms': (sealed - w['submitted_at']) if isinstance(sealed, int) else None,
                 'raw_block_delta_ms': (raw - w['submitted_at']) if isinstance(raw, int) else None})

# 한 작업의 마지막 상태 기록 하나를 그 작업의 대표 측정으로 쓴다. 상태 전이가 여러 번
# 일어난 작업이 그만큼 여러 번 세어지지 않게 한다. 전체 쓰기의 통계도 따로 남긴다.
per_job = {}
for r in rows:
    key = (r['node'], r['job'])
    if key not in per_job or r['submitted_at'] > per_job[key]['submitted_at']:
        per_job[key] = r

usable = [r for r in per_job.values() if isinstance(r['latency_ms'], int) and r['latency_ms'] >= 0]
all_usable = [r for r in rows if isinstance(r['latency_ms'], int) and r['latency_ms'] >= 0]
negative = [r for r in per_job.values() if isinstance(r['latency_ms'], int) and r['latency_ms'] < 0]

report = {
    'metric': 'M3_training_record_latency', 'target_ms': 1500, 'expected': expected,
    'definition': '기록을 담은 블록이 닫힌 시각(다음 블록의 타임스탬프) − 그 쓰기가 담은 submitted_at. '
                  '작업마다 마지막 상태 기록 하나를 센다. 학습 시간은 포함하지 않는다',
    'writes_seen': len(rows), 'jobs_seen': len(per_job), 'included': len(usable),
    'negative_latency': len(negative),
    'complete': len(usable) >= expected,
    'averageMs': round(sum(r['latency_ms'] for r in usable) / len(usable), 1) if usable else None,
    'minMs': min((r['latency_ms'] for r in usable), default=None),
    'maxMs': max((r['latency_ms'] for r in usable), default=None),
    'allWritesAverageMs': round(sum(r['latency_ms'] for r in all_usable) / len(all_usable), 1) if all_usable else None,
    'scanned_blocks': [from_block, tip], 'chain': chain,
    'records': sorted(per_job.values(), key=lambda r: r['submitted_at']),
    'writes': rows,
}
report['pass'] = bool(report['complete'] and report['averageMs'] is not None and report['averageMs'] <= 1500)
json.dump(report, open(out, 'w'), ensure_ascii=False, indent=2)
print('쓰기 %d · 작업 %d · 측정 %d/%d · 평균 %s ms · pass=%s'
      % (len(rows), len(per_job), len(usable), expected, report['averageMs'], report['pass']))
