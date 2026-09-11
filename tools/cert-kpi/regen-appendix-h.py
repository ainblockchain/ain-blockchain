#!/usr/bin/env python3
# 재현절차서 부록 H(하네스 스크립트 전문)를 kpi/harness 원본에서 재생성한다. 하네스를 고치면 반드시 실행.
import datetime, os
DOC = os.path.join(os.path.dirname(os.path.abspath(__file__)), '성능지표_시험_재현절차서.md')
KPI = os.path.dirname(os.path.abspath(__file__))   # tools/cert-kpi
FILES = [('kpi/env.example.sh', 'bash'), ('kpi/run-sampling.sh', 'bash'), ('kpi/start-cert-net.sh', 'bash'), ('kpi/stop-cert-net.sh', 'bash'),
         ('harness/make-cert-config.js', 'js'), ('harness/common.js', 'js'), ('harness/setup_app.js', 'js'),
         ('harness/m1-sharding.js', 'js'), ('harness/m2-l2.js', 'js'), ('harness/m3-latency.js', 'js'),
         ('harness/m4-start-vllm.sh', 'bash'), ('harness/m4-stop-vllm.sh', 'bash'), ('harness/m4-run-locust.sh', 'bash'),
         ('harness/locustfile.py', 'python'), ('harness/recorder.js', 'js'), ('harness/m4-merkle.js', 'js'),
         ('harness/m4-verify-merkle.js', 'js'), ('harness/probe-inference.js', 'js'),
         ('harness/m5-ainize-stack.sh', 'bash'), ('harness/m5-ainize.js', 'js'), ('harness/dart-build-datasets.py', 'python'),
         ('harness/m6-run.sh', 'bash'), ('harness/m6-record.js', 'js')]
doc = open(DOC, encoding='utf-8').read()
head = doc[:doc.index('### 부록 H')]
out = [head.rstrip('\n'), '', '### 부록 H — 하네스 스크립트 전문 (kpi/harness, 자동 생성)', '',
       f'아래는 `$KPI/harness/` 및 `$KPI/` (= 저장소 `tools/cert-kpi/`) 의 실제 파일을 그대로 옮긴 것이다(생성: {datetime.datetime.now():%Y-%m-%d %H:%M}, `$KPI/regen-appendix-h.py`). 본문이 인용하는 유일한 원본이며, 하네스를 수정하면 본 부록을 재생성한다.', '']
for name, lang in FILES:
    path = os.path.join(KPI, name[4:] if name.startswith('kpi/') else name)
    out.append(f'#### `{name}`\n\n```{lang}\n' + open(path, encoding='utf-8').read().rstrip('\n') + '\n```\n')
open(DOC, 'w', encoding='utf-8').write('\n'.join(out))
print('appendix H regenerated:', DOC, len(FILES), 'files')
