#!/usr/bin/env python3
"""6개 성능지표의 증빙 파일을 모아 최종 보고서 한 편을 만든다.

증빙이 없으면 없다고 쓴다. 목표에 못 미치면 못 미쳤다고 쓰고 측정값을 그대로 싣는다.
어떤 항목도 여기서 계산해 내지 않는다 — 각 지표의 러너가 남긴 수를 옮길 뿐이다.

사용: python3 build-final-report.py <evidence-dir> <out.md>
"""
import json, os, sys, datetime

EV = sys.argv[1]
OUT = sys.argv[2]


def load(name):
    p = os.path.join(EV, name)
    if not os.path.exists(p):
        return None
    try:
        return json.load(open(p))
    except Exception as e:
        return {'_error': '%s: %s' % (type(e).__name__, e)}


def verdict(ok):
    return '**통과**' if ok else '**미달**'


def num(v, unit=''):
    return '측정 없음' if v is None else ('%s%s' % (format(v, ',') if isinstance(v, (int, float)) else v, unit))


m1 = load('m1-pipelines.json')
m2 = load('m2-layer2-tps.json')
m3 = load('m3-training-record-latency.json')
m4 = load('m4-inference-throughput.json')
m5 = load('m5-model-support.json')
m6 = load('m6-dataset-support.json')
m6i = load('m6-import-verify.json')

rows = []


def row(no, name, target, measured, ok, source):
    rows.append((no, name, target, measured, verdict(ok) if ok is not None else '미측정', source))


row(1, '온체인 병렬 파이프라인 수', '70개',
    num(m1 and m1.get('peakConcurrent'), '개 동시') if m1 else '측정 없음',
    m1 and m1.get('pass'), 'm1-pipelines.json')
row(2, '레이어2 스테이트 채널 TPS', '7,000 TPS',
    num(m2 and m2.get('maxTPS'), ' TPS (최대 1초 구간)') if m2 else '측정 없음',
    m2 and m2.get('pass'), 'm2-layer2-tps.json')
row(3, '작업 기록 블록체인 레이턴시', '1.5초 이하',
    num(m3 and m3.get('averageMs'), ' ms (평균)') if m3 else '측정 없음',
    m3 and m3.get('pass'), 'm3-training-record-latency.json')
row(4, '거대모델 인퍼런스 TPS', '1,000 TPS',
    num(m4 and m4.get('tps'), ' TPS') if m4 else '측정 없음',
    m4 and m4.get('pass'), 'm4-inference-throughput.json')
row(5, '오픈소스 ML 도구 모델 지원 수', '100개',
    num(m5 and m5.get('supported_unique'), '개') if m5 else '측정 없음',
    m5 and m5.get('pass'), 'm5-model-support.json')
row(6, 'Hugging Face 데이터셋 지원 수', '100개',
    num(m6 and m6.get('supported'), '개') if m6 else '측정 없음',
    m6 and m6.get('pass'), 'm6-dataset-support.json')

lines = []
w = lines.append
w('# 3차년도 성능지표 시험 최종 보고서')
w('')
w('작성 %s · 증빙 디렉터리 `%s`' % (datetime.datetime.now().strftime('%Y-%m-%d %H:%M'), EV))
w('')
w('각 지표의 수는 그 지표의 러너가 남긴 증빙 JSON 에서 그대로 옮긴 것이다. 이 문서는 값을 다시 계산하지 않는다.')
w('')
w('## 종합')
w('')
w('| 지표 | 항목 | 목표 | 측정 | 판정 | 증빙 |')
w('|---|---|---|---|---|---|')
for no, name, target, measured, v, source in rows:
    w('| %d | %s | %s | %s | %s | `%s` |' % (no, name, target, measured, v, source))
w('')

passed = sum(1 for r in rows if r[4] == '**통과**')
w('통과 %d / 6.' % passed)
w('')

if m1:
    w('## 지표 1 — 온체인 병렬 파이프라인 70개')
    w('')
    w('- 동시 진행 최대: **%s**' % num(m1.get('peakConcurrent')))
    w('- 온체인 anchor 확인: %s / 확정(is_final): %s' % (num(m1.get('onchain')), num(m1.get('onchain_final'))))
    w('- 파이프라인 목록과 각 blockchain path: `%s`' % m1.get('html', 'pipelines-*.html'))
    w('')

if m2:
    w('## 지표 2 — 레이어2 스테이트 채널 7,000 TPS')
    w('')
    w('| 항목 | 값 |')
    w('|---|---|')
    for k, label in (('maxTPS', '최대 1초 구간 TPS'), ('sustainedTPS', '지속 TPS'), ('avgTPS', '60초 평균 TPS'),
                     ('totalTx', '총 트랜잭션'), ('p50LatencyMs', 'P50 지연(ms)'), ('p99LatencyMs', 'P99 지연(ms)'),
                     ('channelsOpenedOnChain', '온체인 개설'), ('channelsSettledOnChain', '온체인 정산'),
                     ('anchorTxsFinalized', 'anchor 확정')):
        if m2.get(k) is not None:
            w('| %s | %s |' % (label, num(m2[k])))
    w('')
    w('판정 통계: %s' % m2.get('judgedStatistic', '-'))
    w('')

if m3:
    w('## 지표 3 — 작업 기록 블록체인 레이턴시 1.5초')
    w('')
    w('- 정의: %s' % m3.get('definition', '-'))
    w('- 기록 %s건 중 블록 확인 %s건, 평균 %s ms (최소 %s / 최대 %s)'
      % (num(m3.get('records_with_submitted_at')), num(m3.get('included')),
         num(m3.get('averageMs')), num(m3.get('minMs')), num(m3.get('maxMs'))))
    if m3.get('without_block'):
        w('- 블록을 찾지 못한 기록 %s건은 분모에 남겨 두었다.' % num(m3['without_block']))
    if m3.get('negative_latency'):
        w('- 블록 타임스탬프가 제출 시각보다 이른 기록 %s건. 블록 타임스탬프는 제안 시점이고 체인의 epoch 는 1초이므로, '
          '제출이 그 블록의 제안 이후·확정 이전에 들어가면 음수가 된다. 이 건들은 평균에 넣지 않았다.'
          % num(m3['negative_latency']))
    w('')

if m4:
    w('## 지표 4 — 거대모델 인퍼런스 1,000 TPS')
    w('')
    for k, label in (('tps', '완료 추론 TPS'), ('successes', '성공 요청'), ('failures', '실패 요청'),
                     ('window_seconds', '측정 구간(초)'), ('workers', 'Locust worker'), ('users', 'User'),
                     ('geometry_pass', '240U/60W 기하 검증')):
        if m4.get(k) is not None:
            w('- %s: %s' % (label, num(m4[k])))
    w('')

if m5:
    w('## 지표 5 — 오픈소스 ML 도구 모델 지원 수 100개')
    w('')
    w('- 집계 정의: %s' % m5.get('definition', '-'))
    w('- 런타임: %s' % m5.get('runtime_stack', '-'))
    w('- 시도 %s개 중 지원 확인 **%s개**' % (num(m5.get('attempted')), num(m5.get('supported_unique'))))
    w('- 시험 질문: `%s`' % m5.get('question', '-'))
    w('')
    ok = [r for r in (m5.get('models') or []) if r.get('supported')]
    if ok:
        w('지원 확인된 모델 (앞 20개):')
        w('')
        w('| 모델 ID | revision | 응답 |')
        w('|---|---|---|')
        for r in ok[:20]:
            answer = (r.get('answer') or '').replace('|', '\\|').replace('\n', ' ')[:70]
            w('| `%s` | `%s` | %s |' % (r['model_id'], (r.get('revision') or '')[:12], answer))
        w('')
        w('전체 목록과 실패 사유는 `m5-model-support.json` 에 있다.')
        w('')
    w('응답이 돌아왔다는 것과 답이 맞다는 것은 다른 주장이다. 이 수는 로드·서빙 ID 일치·실제 응답까지만 센다.')
    w('')

if m6 or m6i:
    w('## 지표 6 — Hugging Face 데이터셋 지원 수 100개')
    w('')
    if m6:
        c = m6.get('counts') or {}
        w('- 집계 정의: %s' % m6.get('definition', '-'))
        w('- 가져오기 %s · 학습 완료 %s · 발행 %s · 적용 후 추론 완료 **%s**'
          % (num(c.get('imported')), num(c.get('trained')), num(c.get('published')), num(c.get('inference_complete'))))
        w('')
    if m6i:
        w('- 가져오기만 따로 전수 확인한 수: **%s / %s** (`m6-import-verify.json`). '
          '이것은 지표 6 의 최종 집계가 아니다.' % (num(m6i.get('imported')), num(m6i.get('attempted'))))
        w('')

w('## 환경')
w('')
w('- 시험 호스트: 이 머신. AWS m6i.8xlarge 10대와 NVIDIA L40S 5대의 목표 환경이 아니다.')
w('- 계획 원문의 목표 환경과 실제 시험 환경의 차이는 `AWS_CPU_환산_근거.md` 에 따로 기록한다.')
w('')

open(OUT, 'w').write('\n'.join(lines) + '\n')
print('보고서 %s · 통과 %d/6' % (OUT, passed))
