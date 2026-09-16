#!/usr/bin/env python3
"""지표 3 — 학습 기록 블록체인 레이턴시.

지표 1 이 남긴 온체인 학습 기록(`/apps/knowledge/market/lessons/<node>/<job>`)을 읽어
작업마다 `블록 타임스탬프 − submitted_at` 을 계산하고 평균을 낸다.

작업당 기록 1개만 센다. 누락·중복·시각 오류가 있으면 분모를 줄이지 않고 그대로 드러낸다.

사용: python3 m3-latency-from-lessons.py <chain-url> <expected-count> <out.json>
"""
import json, sys, urllib.request, urllib.parse, concurrent.futures as cf

chain, expected, out = sys.argv[1], int(sys.argv[2]), sys.argv[3]

def get(url, timeout=60):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return json.load(r)
    except Exception:
        return None

lessons = get('%s/get_value?ref=%s' % (chain, urllib.parse.quote('/apps/knowledge/market/lessons', safe='')))
tree = (lessons or {}).get('result') or {}

records = []
for node, jobs in tree.items():
    if not isinstance(jobs, dict):
        continue
    for job, value in jobs.items():
        if isinstance(value, dict) and isinstance(value.get('submitted_at'), int):
            records.append({'node': node, 'job': job, 'submitted_at': value['submitted_at'],
                            'status': value.get('status'), 'dataset_sha256': value.get('dataset_sha256'),
                            'patch_id': value.get('patch_id')})

# 같은 작업의 기록이 여러 번 갱신됐다면 가장 이른 제출 시각 하나만 쓴다.
by_job = {}
for r in records:
    key = (r['node'], r['job'])
    if key not in by_job or r['submitted_at'] < by_job[key]['submitted_at']:
        by_job[key] = r
records = sorted(by_job.values(), key=lambda r: r['submitted_at'])

last = get('%s/last_block_number' % chain)
tip = (last or {}).get('result')

def find_block(rec):
    """제출 시각 이후 가장 먼저 그 경로를 담은 블록을 찾는다."""
    ref = '/apps/knowledge/market/lessons/%s/%s' % (rec['node'], rec['job'])
    for number in range(max(0, (tip or 0) - 400), (tip or 0) + 1):
        blk = get('%s/get_block_by_number?number=%d' % (chain, number), 30)
        b = (blk or {}).get('result')
        if not isinstance(b, dict):
            continue
        for t in (b.get('transactions') or []):
            op = ((t.get('tx_body') or {}).get('operation')) or {}
            if op.get('ref') == ref:
                ts = b.get('timestamp')
                if isinstance(ts, int) and ts >= rec['submitted_at']:
                    return {**rec, 'block': b.get('number'), 'block_timestamp': ts,
                            'tx_hash': t.get('hash'), 'latency_ms': ts - rec['submitted_at']}
    return {**rec, 'block': None, 'block_timestamp': None, 'tx_hash': None, 'latency_ms': None}

with cf.ThreadPoolExecutor(max_workers=3) as ex:
    rows = list(ex.map(find_block, records))

included = [r for r in rows if r['latency_ms'] is not None]
report = {
    'metric': 'M3_training_record_latency', 'target_ms': 1500, 'expected': expected,
    'records_with_submitted_at': len(records), 'included': len(included),
    'complete': len(included) >= expected,
    'averageMs': round(sum(r['latency_ms'] for r in included) / len(included), 1) if included else None,
    'minMs': min((r['latency_ms'] for r in included), default=None),
    'maxMs': max((r['latency_ms'] for r in included), default=None),
    'definition': '블록 타임스탬프 − 기록에 담긴 submitted_at. 확정 대기와 학습 시간은 포함하지 않는다',
    'chain': chain, 'records': rows,
}
report['pass'] = bool(report['complete'] and report['averageMs'] is not None and report['averageMs'] <= 1500)
json.dump(report, open(out, 'w'), ensure_ascii=False, indent=2)
print('기록 %d · 블록 확인 %d/%d · 평균 %s ms · pass=%s'
      % (len(records), len(included), expected, report['averageMs'], report['pass']))
