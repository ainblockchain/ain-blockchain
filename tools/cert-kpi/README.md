# tools/cert-kpi — 성능지표 시험 재현 하네스 (지표 1~4)

3차년도 공인기관인증 평가(시험성적서 발행)를 위한 **팁스 성과지표 6종** 재현 절차와 스크립트입니다.
전체 절차서는 [`성능지표_시험_재현절차서.md`](./성능지표_시험_재현절차서.md) 를 보십시오.
지표 5·6(Ainize 지식 패치 100종 / DART 데이터셋 100종)의 하네스는 `ainblockchain/ainize-bench` 의 `cert/` 에 있습니다.

| 지표 | 2단계 목표 | 스크립트 | 결과 |
|---|---|---|---|
| 1 온체인 병렬 파이프라인 | ≥ 70 | `m1-sharding.js` | `results/m1-<run>.json` |
| 2 레이어2 스케일링 TPS | ≥ 7,000 | `m2-l2.js` | `results/m2-<run>.json` |
| 3 작업 기록 블록체인 레이턴시 | ≤ 1.5 s | `m3-latency.js` | `results/m3-<ts>.json` |
| 4 온·오프체인 거대모델 인퍼런스 TPS | ≥ 1,000 | `locustfile.py` / `probe-inference.js` + `recorder.js` → `m4-verify-merkle.js` | `results/m4-final-<run>.json` |

## 인증망 설정

`blockchain-configs/cert-10-nodes` (epoch 1 s, 지표 1~3) 와 `blockchain-configs/cert-10-nodes-m4` (epoch 5 s, 지표 4) 는
`make-cert-config.js` 로 `3-nodes` 템플릿에서 생성한 검증자 10대 설정입니다.

```bash
# 저장소 루트에서
node tools/cert-kpi/make-cert-config.js blockchain-configs/cert-10-nodes 1000 1000000
node tools/cert-kpi/make-cert-config.js blockchain-configs/cert-10-nodes-m4 5000 50000
```

## 실행

```bash
cd tools/cert-kpi && npm install
export KPI_DIR=/data/cert-kpi            # 결과·로그·체인데이터 위치 (기본: tools/cert-kpi/work)
./start-cert-net.sh                      # tracker(8079) + 노드 10대(8081~8090), 이벤트 핸들러 5100/5101
node setup_app.js                        # ai_network_dag 앱·규칙 배포
RUN=cert_m1_r1 node m1-sharding.js       # 지표 1
RUN=cert_m2_r1 node m2-l2.js             # 지표 2
node m3-latency.js                       # 지표 3
# 지표 4: 절차서 §7 (vLLM 서버 기동 → locust/probe-inference → recorder → m4-verify-merkle)
./stop-cert-net.sh
```

`BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/cert-10-nodes ./start-cert-net.sh` 로 지표 1~3용 설정으로 기동합니다.
모든 결과 JSON 에는 `envSnapshot()` 이 넣는 ain-blockchain 커밋 해시·노드 버전·호스트 정보가 포함됩니다.
