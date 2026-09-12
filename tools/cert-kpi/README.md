# tools/cert-kpi — 성능지표 시험 재현 번들

3차년도 공인기관인증 평가(시험성적서 발행)를 위한 **팁스 성과지표 6종** 재현 절차서와 하네스입니다.
절차서 [`성능지표_시험_재현절차서.md`](./성능지표_시험_재현절차서.md) 를 따르면 이 디렉토리만으로 전 지표를 실행하고 결과 JSON 을 얻습니다.
절차서 본문이 인용하는 스크립트 원본은 `harness/` 이며 부록 H 에 전문이 수록됩니다(`regen-appendix-h.py` 로 재생성).

| 파일 | 역할 |
|---|---|
| `성능지표_시험_재현절차서.md` | 절차서 (v2.1) — 판정 기준·환경·지표별 실행·증빙 체크리스트·부록 |
| `평가환경_준수_리뷰_및_수정내역.md` | 계획서 평가방법·평가환경 준수 리뷰와 하네스 수정 내역, 재측정 결과 |
| `env.example.sh` | 호스트별 도구 경로 (복사해 `env.sh` 로 저장 후 `source`) |
| `start-cert-net.sh`, `stop-cert-net.sh` | 인증망(검증자 10, epoch 1s) 기동/정지, `cert-net.manifest.json` 기록 |
| `harness/make-cert-config.js` | `blockchain-configs/cert-10-nodes` 결정적 생성 (genesis 포함) |
| `harness/m1-sharding.js` · `m2-l2.js` · `m3-latency.js` | 지표 1·2·3 |
| `harness/m4-start-vllm.sh` · `m4-run-locust.sh` · `locustfile.py` · `recorder.js` · `m4-verify-merkle.js` | 지표 4 (Locust 240U/60W + 머클 배치 앵커링) |
| `harness/m5-ainize-stack.sh` · `m5-ainize.js` · `dart-build-datasets.py` | 지표 5·6 (Ainize 지식 패치 / DART 데이터셋 100종) |
| `harness/m6-run.sh` · `m6-record.js` (부록 G) | 지표 6 보조 증빙 (lm-eval 100 태스크) |
| `harness/legacy/` | 사장 코드 (증빙에 쓰지 않음) |

```bash
git clone https://github.com/ainblockchain/ain-blockchain.git && cd ain-blockchain && git checkout v1.6.2
cd tools/cert-kpi && cp env.example.sh env.sh && source env.sh      # $KPI, $AIN_REPO 정의
(cd harness && npm install)                                          # @ainblockchain/ain-js 1.15.0
# 이후는 절차서 §3 부터
```

결과·로그·체인데이터는 `$KPI/{results,logs,chaindata}` 에 생기며 git 에 넣지 않습니다(`.gitignore`).
