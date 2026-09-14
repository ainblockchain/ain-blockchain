# Docker 재현 환경

**2026-09-11 20:38 별도망:** 기존 `ain-cert-docker`를 교체하지 않고 `ain-units-20260911`의 실제10개를 별도RPC21081–21090/P2P21501–21510에 기동했다. 현재구성은 `../evidence/native_units_network_20260911/compose-r2.json`이며 첫기동 실패의 `compose.json`을 덮어 적용하지 않는다. 같은genesis/새계정/프라이빗 data bind를 유지하고 UID권한·tracker로그경로만 바로잡았다. 모든10개 동일native코드/설정/활성화·서명우회false를 검증했다. 실제1AIN 지급은 확인했지만 하네스의 초기RPC거부/확정거부 혼동과20:34/20:37 readiness 실패가 있어 전체시나리오/안정성 합격이 아니다. 코드는 확정영수증 대기로 수정했다. 기존원래망1AIN은잠긴상태이고 기존14개(원래체인10+tracker+모델2+API)의ID/PID/시작은불변이다. 상세는 `../pr/ab-m1/tools/cert-kpi/native-escrow-network.md`.

**2026-09-11 19:52 후보 검증:** opt-in micro-unit native 체인 `sha256:90c46c1e44cb734b915c678b786a2964324b8e47b8e50cfa3e35dd5b5807c747`·SDK `sha256:100be960b170e6fcba0ae31e2503a2db3ab26049fd882f3bec4653b6eaadfbad`는 격리 시험 이미지다. 기본 비활성이고 기존10개에 배포하지 않았다.239체인+28SDK시험과1AIN·0.3AIN 지급/부분실패 원복은 네트워크 확정/TPS 증빙이 아니다.19:39 기존10개 readiness 및 체인/모델/API13개 인스턴스 불변을 확인했다. 혼합 구현에 flag를 활성화하지 않는다. 실제10개 버전2 환경/활성화 감사가 먼저이며 기존1AIN잠금은 해결되지 않았다. 상세는 `../pr/ab-m1/tools/cert-kpi/native-escrow-micro-units.md`다.

**2026-09-11 18:42 이후:** finalized-history 연결점/정확한 seed 높이 검증과 chain-sync cursor 수정186시험 후 node4만 두 단계로 복구했다.18:38/18:42 모든10개 native health=true·개별 확정 진행 통과. 실제 혼합 이미지/ID/PID/시작은 `../evidence/chain_sync_node4_repair_20260911/phase/instances-after.jsonl`, 원장10개 재감사는 `../evidence/ledger_after_sync_repair_20260911/`다. node4는 be8ace6555c2 이미지, 다른9체인·flashnext/flashtrain/API는 그대로다. 같은8논리CPU 공유이며 장시간 안정성/목표TPS/AWS320vCPU 동등성 증거가 아니다. 옛 계획/전체compose up/down을 재실행하지 않는다. 매 실험 전 새 readiness가 필요하다.

실제M2의1AIN 예치/peer복구 이후18:44 native 지급이 정밀도 오류로REVERTED됐다. 독립node5/9에서계정9.5/9.5·escrow1·payout없음이 확인됐다. 자금은 잠긴 채 보존되며 정산/회수 미완료다. 새 SDK는 해당 시나리오의 추가 입금을 차단한다. 이것은 체인 health 미복구와 다른 실패다. 아래 시각별 문단은 역사 기록이며 현재 상태가 아니다.

**2026-09-11 17:50 최신:** 지연 DEBUG/실제 heap 복구 보강을135시험 후 node7/5에 적용했다. 이번 전체 실제 교체는 [3,6]→[0,1]→[7,5]이며 단계별 계획의 나머지는 실행하지 않았다. 혼합 이미지와 실제ID/PID/시작은 `../evidence/gossip_lazy_rollout_20260911/instances-final.jsonl`이 기준이다. node0/1은3e3f1bdd, node2/3/6은48d36678, node5/7은c5733838, node8은7949c78c, node4/9는32d46eb0 이미지다(전체 SHA는 증빙 참조).

17:35 원장8개 확정23222/신규136블록1,172서명·원본 보존 전수감사 통과 후, 17:40 node4가 실제 V8 heap 오류로 exited139/PID0가 되어 비공개 전체 볼륨 보존만 했다. 17:50 나머지9개는 SERVING/native health=true/23588이며 node9는 교체 없이 따라잡았다.23588까지의 서명 전수감사나10노드 안정성 합격은 아니다. **ENV1/자금/TPS 차단 및 전체 compose up/down 금지 유지.** 확정23141을 감지한 node5 캡처의 기준높이 거부 이후 옛 계획을 중지했다. node4는 새 finalized-history 연결점 검증 경로가 필요하며 아직 구현되지 않았다. timeout에 따른 재시작, 과거 캡처 재사용, order 초기화 금지. 상세 절차는 `../pr/ab-m1/tools/cert-kpi/consensus-gossip-repair.md`다.

flashnext/flashtrain/API와 lifecycle PID86742는 유지했다. CPU quota는 호스트 논리 CPU8개 공유이며 예약된320vCPU나 AWS동등 성능이 아니다. 기존 GPU7 작업/별도 shard 실험도 유지했다. 아래 시각별 설명은 당시의 역사 기록이며 현재 설정으로 실행하지 않는다.

**2026-09-11 16:52 현재:** gossip 메시지16MiB/송신허용대기열32MiB 보완을110시험 후node2 한 대에 계획 적용했다. 현재node2는`sha256:48d366789e523526b902ddbddc8071aae65d0bb783475c9f8313ee9e44967a65`,node8은evidence예산이미지,나머지8개는기존복구이미지다. 두 연결점node1/node8 및 다른9체인·모델·트레이너·API의ID/PID/시작은 유지했다.16:49 원장10개 바이트 보존,16:50 node2의pending18블록/195서명/원래16개 보존 통과.16:52 oversized3/송신대기열0은 단기 관측이며 확정23086/native health=false는 미복구다. **자금/TPS 차단 및 전체compose up/down 금지 유지.** `../evidence/planned_gossip_repair_20260911/compose.json`은현재혼합구성이고plan.order=[2]만 허용한다. 이미적용된계획 재적용은안전거부한다. 새 절차`../pr/ab-m1/tools/cert-kpi/consensus-gossip-repair.md`; 아래문단은해당시각의역사기록이다.

**2026-09-11 16:03 현재:** node8만 evidence예산 수정 이미지로 계획 교체했고,다른9체인/flashnext/flashtrain/API의ID·시작·PID는 유지했다.현재10개 모두 서명우회false이지만 확정23086/native health·node8동기화는 아직 미복구다.기존 원장0–23086 바이트 보존10개 전수감사는 통과했다. node8 예외 구성은 `../evidence/evidence_budget_canary_20260911/compose.json`, 새 절차는 `../pr/ab-m1/tools/cert-kpi/evidence-budget.md`다. **아래 기존 compose와 이전 복구 compose를 전체 up/down하지 않는다.** 아래12:45·15:07의 설정/상태는 해당 시각의 역사 기록이다.

**2026-09-11 15:07 현재 복구 진행 중:** snapshot atomic write와 native consensus 수정본을 node1부터 적용했고, V8 heap 오류로 자체 종료한 노드는 비공개 전체볼륨 백업/원장 감사 후 순차 교체한다. 원본 node0도 자체 종료하여 검증된 pending16블록/179서명을 보존한 node1으로 연결점을 이관했다. 구·신 이미지가 혼합된 이 환경에는 아래 빈 환경용 전체 compose 기동/종료를 적용하지 않는다. 실제 복구 구성은 `../evidence/chain_recovery_20260911/compose.json`, 절차는 `../pr/ab-m1/tools/cert-kpi/chain-recovery.md`다. 교체된 노드의 서명우회는false지만10노드 합의 복구는 아직 미완료다. 관측용 `observe-chain-recovery.js PLAN NEW_OUTPUT`은 읽기만 하며 timeout을 재시작으로 처리하지 않는다.

과거10개 체인/GPU5개 환경 검증은 역사 증빙이다. **2026-09-11 12:41–12:45 재검사에서 기존10개 체인은 블록23086 정체·native consensus health=false·일부timeout으로 실패했다.** Docker healthy만으로 합의를 판정하지 않는다. 현재 Ainize는 GPU0–3서빙/GPU4–6학습의2컨테이너 프로필이고 GPU7은 별도 작업이므로 아래 역사적 GPU5개 기동을 실행 중 환경에 중복 적용하지 않는다. Ainize100개 전과정 및 전체 KPI는 미완료다.

`compose.chain.json`의 새 healthcheck는 `SERVING` 및 native `health=true`를 모두 요구한다. 기존 컨테이너는 재시작/교체하지 않아 아직 옛 healthcheck로 healthy를 표시한다. 현재 서명 우회 설정true인 기존 체인은 실제 자금 보안 시험에 적합하지 않으며, `js-m2/tools/state-channel/chain-readiness.js` 및 escrow runner는 이를 사전 거부한다. 상태를 보존한 원인 분석·별도 검증 없이 전체 compose up/down으로 교체하거나 볼륨을 지우지 않는다. 아래 기동은 빈 신규 환경 준비용이고, 현재 환경의 복구 명령이 아니다.

기준은 `../resource-spec.json`: AWS m6i.8xlarge의 32 vCPU(16 physical cores)/128GiB ×10. 현재 호스트는 논리 CPU 8개이므로 컨테이너 quota는 상한이며 성능 예약이 아니다. `verify-chain.js`가 공유 비율과 실제 설정을 증빙한다. CPU 처리성능 차이는 `../../reproduction/AWS_CPU_환산_근거.md`를 참고한다.

```bash
cd /mnt/newdata/gov
docker build -t ain-cert-chain:repro-20260911 -f kpi/docker/chain.Dockerfile kpi/ain-blockchain-runtime
docker compose -f kpi/docker/compose.chain.json up -d
docker compose -f kpi/docker/compose.chain.json ps --all
RUN_ID="docker_chain_$(date -u +%Y%m%dT%H%M%SZ)" node kpi/docker/verify-chain.js
```

모두 healthy가 된 후 검증한다. 검증 실패는 결과 JSON과 exit 1로 남는다. `docker logs <container>`로 원인을 조사하고 새 RUN_ID로 재검증한다. 단순 대기 시간 초과로 볼륨을 삭제하지 않는다.

기존 호스트 체인과 분리된 tracker 18079, JSON-RPC 18081~18090, P2P 18501~18510, 이벤트 15100~15101을 쓴다. Docker host network로 연결하며 노드별 named volume에 체인을 보존한다. 다른 애플리케이션이 같은 포트를 쓰지 않는지 기동 전에 확인한다.

Docker 체인을 대상으로 하네스를 실행할 때:

```bash
export CHAIN_PORT_BASE=18081
export CHAIN_EVENT_URLS='["ws://localhost:15100","ws://localhost:15101"]'
```

`run-harness.sh`는 `CHAIN_CONTAINER_PROJECT=ain-cert-docker`를 설정한다. 공통 `envSnapshot`은 이 모드에서 호스트 PID manifest를 사용하지 않고 Docker socket으로 컨테이너 자원과 이미지 ID를 조회한다. 연결한 RPC 포트/네트워크와 실제 컨테이너 설정이 다르거나, 체인 노드가 비정상이거나, 클라이언트의 CPU·메모리 제한이 없으면 실패한다. 이미지 revision label이 없으면 실행 소스 commit은 null로 남기며 로컬 저장소 HEAD를 이미지의 커밋이라고 표기하지 않는다.

공통 준비 및 SDK 기록 검증:

```bash
RUN_ID="docker_client_$(date -u +%Y%m%dT%H%M%SZ)" bash kpi/docker/run-harness.sh check-environment.js
RUN_ID="docker_setup_$(date -u +%Y%m%dT%H%M%SZ)" bash kpi/docker/run-harness.sh setup_app.js
RUN_ID="docker_ledger_$(date -u +%Y%m%dT%H%M%SZ)" bash kpi/docker/run-harness.sh check-ledger.js
```

클라이언트 기본 제한은 2 CPU/cpuset6-7/8GiB RAM/추가 swap0이다. 실행별 evidence 디렉터리에 `.env*`를 제외한 코드 사본과 SHA256, 이미지·제한·종료 상태·로그를 보존한다. 새 RUN_ID로 재실행하며 기존 결과를 덮어쓰지 않는다. 앱 준비를 재실행해도 스테이킹을 불필요하게 추가하지 않는다. 이 검증은 전 KPI 재현 완료를 대신하지 않는다.

## GPU 5노드와 M4 Docker 실행

`compose.gpu.json`은 물리 GPU 2..6을 각 컨테이너에 하나씩 할당한다. 기존 GPU0/1/7 작업과 분리했다. 각 노드는 A100 80GB, 2CPU 상한/cpuset0-7/128GiB RAM/추가 swap0이다. 5개 노드와 체인은 호스트8CPU를 공유한다. GPU 메모리 요건을 만족하는 대체이며 L40S와 같은 추론 속도라는 뜻이 아니다.

```bash
nvidia-smi
docker compose -f kpi/docker/compose.gpu.json up -d
docker compose -f kpi/docker/compose.gpu.json ps --all
RUN_ID="gpu_$(date -u +%Y%m%dT%H%M%SZ)" node kpi/docker/verify-gpu.js
docker build -f kpi/docker/m4.Dockerfile -t ain-cert-m4:repro-20260911 kpi/harness
RUN_ID="docker_m4_$(date -u +%Y%m%dT%H%M%SZ)" DUR=60 bash kpi/docker/run-m4.sh
```

기동 전 GPU2..6의 다른 작업 유무를 확인한다. 모델 `/mnt/newdata/models/gpt-oss-20b`가 필요하며 이를 이미지에 포함하지 않는다. vLLM 이미지는 compose의 registry digest로 고정했다. 모두 healthy가 되기 전에 재기동하지 않는다. `verify-gpu.js`는 서로 다른 GPU UUID 5개, GPU 메모리, Docker 설정과 실제 cgroup, 각 서버의 completions 응답을 JSON으로 보존한다. 첫 검증 `gpu_environment_20260911.json`의 7개 검사는 모두 통과했다. 이는 모델 지원 100개를 증빙하지 않는다.

M4 runner는 4CPU/16GiB 제한의 컨테이너 하나에 Locust master·worker60개와 recorder2개를 실행한다(60개의 물리 머신이 아니다). 240 users를 유지한다. Python/Node 의존성은 이미지 내부에 설치하고 해석된 버전 목록을 보존한다. 호스트 pyenv/node_modules에 의존하지 않는다. 코드 사본·환경 검사·이미지 ID·로그·결과는 run에 묶어 보존한다. 현 프롬프트는 짧은 Q/A 기준선이며 복잡 작업·체인 비사용 비교·SageMaker 비교는 별도 구현/측정이 남아 있다. 낮은 TPS도 그대로 실패 결과로 보존하며 CPU 환산으로 합격 처리하지 않는다.

## Ainize 노드와 데이터셋 검증

현재 Ainize 노드는 Docker로 실행하며 PLE 서빙·트레이너 연결을 완료했다. `/healthz`의 200은 프로세스 생존만 뜻하고 `/readyz`는 모델·hook 준비를 별도로 확인한다. 최초 미준비 상태와 구분하며, readiness만으로 teach 성공을 집계하지 않는다.

```bash
docker build --build-arg NODE_IMAGE=node@sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553 \
  -f kpi/docker/ainize.Dockerfile -t ain-cert-ainize:repro-20260911-r2 kpi/ainize
node kpi/docker/init-ainize-home.js
export AINIZE_UID=$(id -u) AINIZE_GID=$(id -g) DOCKER_GID=$(stat -c %g /var/run/docker.sock)
docker compose -f kpi/docker/compose.ainize.json up -d
docker exec ain-cert-ainize-node-1 bash -c 'export AINIZE_PASSWORD=$(cat "$AINIZE_HOME/operator-password.txt"); node /opt/ainize/ainize-cli/dist/bin.js login --json >/dev/null'
bash kpi/docker/ainize-cli.sh chain setup --json
RUN_ID="ainize_datasets_$(date -u +%Y%m%dT%H%M%SZ)" bash kpi/docker/run-ainize-datasets.sh
```

초기화는 기존 `kpi/ainize/home-cert/config.json`을 필요로 하고 새 `home-docker`가 있으면 거부한다. 이는 현재 작업폴더의 이관 경로이며, 비밀 설정 없이 새 머신을 준비하는 공개 bootstrap은 아직 남았다. `.dockerignore`는 소스/lock/test/web만 허용하며 홈·키·데이터·호스트 node_modules를 빌드 context에서 제외한다. 노드 제한은 2CPU/cpuset0-7/8GiB/추가swap0이다. Docker socket은 trainer 제어에 필요하고 사실상 호스트 제어 권한을 부여하므로 신뢰한 코드만 이 컨테이너에 넣는다.

최초 이미지 ID는 `sha256:7543c9e81a768a1924d72ce2bbee4f60045fb12d852e72ee0b84f9f95a42109c`다. Ainize CLI의 로컬 node/core 의존성을 lock에 고정했다. Python 실행 파일이 없을 때 노드가 죽던 오류를 수정했고 해당 회귀시험을 포함한 runtime 시험4개가 이미지 안에서 통과했다.

현재 r2 이미지는 `sha256:6ee931464e6e6f75875d328603c84063933594607d9fc0336a09995c8ac26dac`다. HTTP `max_tokens` 전달 및 CLI chain setup 단일 JSON 응답 수정을 포함한다. 기존 노드의 업그레이드는 `RUN_ID=<고유ID> bash kpi/docker/upgrade-ainize.sh`로 수행한다. 진행 중 학습·추론이 없음을 확인하고 노드를 정상 종료한 뒤 홈을 `kpi/secrets/<RUN_ID>/`에 비공개 백업한다. 해당 백업은 키를 포함하므로 게시하면 안 된다. GPU 모델/트레이너와 체인 컨테이너는 재시작하지 않는다. 실제 r2 CLI 비교 추론은 base128/패치79토큰으로 요청 상한128을 준수했지만 정답 검증은 실패했다.

데이터셋 runner는 기존 DART manifest 앞100건을 실제 `teach dataset`으로 등록하고 서명된 조회/다운로드를 수행한다. 파일원본 SHA, canonical SHA, 행수, prompt/answer 보존, ID·내용 고유성을 검사한다. 6.5초 간격으로 진행하며 실행 중에는 같은 작업을 재시작하지 않는다. 각 회차의 `progress.json`, 원시 CLI JSON, canonical 파일, 고정 실행소스와 해시, 이미지·cgroup·exit를 보존한다. 이것만으로 학습/추론100건 또는 모델100개 지원을 인정하지 않는다.

최초 `chain setup --json`은 funding과 setup 두 JSON 객체를 출력한다(단일 JSON이 아닌 기존 CLI 결함). 원본 `evidence/ainize-chain-setup-20260911.json`은 그대로 보존했고 `verify-ainize-setup.js`가 두 트랜잭션의 FINALIZED/node9 블록포함 및 node5의 admin/market규칙/stake100을 검증했다. `results/ainize-setup-ainize_setup_verified_20260911.json` pass=true. 원본 JSON 출력 수정과 rules/staking 트랜잭션 전체 영수증 수집은 후속 정비 대상이다.

## PLE 학습 단계 전환

추가 검증: `ainize_datasets100_20260911`은 등록·인증조회·다운로드100/100, 고유ID/내용해시100/100, exit0로 종료했다. `record-ainize-datasets.js`는 파일들을 다시 검증하고 증빙manifest 해시를 체인에 기록했다. `results/ainize-datasets-ainize_datasets_anchor_20260911.json`에서 FINALIZED/독립읽기/블록포함을 확인한다. 학습·추론100건 완료와는 구분한다.

CLI 중복 JSON 출력은 소스에서 수정했고 별도 Docker 회귀시험과 실제체인의 `--fund 1` 실행에서 단일 JSON을 확인했다. 현재 장기학습을 실행하는 기존 이미지에는 아직 이 수정이 없으므로, 전체 재배포용 이미지는 다시 빌드해야 한다. 학습 도중 노드를 재시작하지 않는다.

M4 측정이 종료된 것을 확인한 다음 `RUN_ID=고유이름 bash kpi/docker/switch-to-ple.sh`로 전환한다. 이 스크립트는 현재 존재하는 flashnext/flashtrain의 고정 이미지와 큐 상태를 검사하며, 새 머신에서 해당 컨테이너를 생성하는 bootstrap까지 제공하지는 않는다. M4의 5개 GPU서버는 stop하고, PID파일과 실제 명령이 일치하는 기존 host M4 부모프로세스만 SIGTERM한다. 이력이 다른 PID나 실행 중 recorder가 있으면 거부한다.

서빙GPU0..3/학습GPU4..6의 **7GPU·2컨테이너 프로필**이다. M4의 독립5GPU서버 프로필과 구분한다. 각 컨테이너는 4CPU/cpuset0-7/320GiB memory/추가swap0 제한이며 다른 체인/노드와 CPU를 공유한다. `switch-to-ple.sh`는 trainer docker-exec를 foreground로 기다리므로 별도 터미널에서 상태를 확인한다. `docker top flashtrain`, `docker logs flashnext`, 해당 evidence 디렉터리의 trainer 로그를 확인하며 단순 timeout 때문에 재기동하지 않는다.

`/mnt/newdata/qwen3.8/scripts/patch.py`도 이번 재현의 수정 대상이다. Ainize가 요구하는 check/JSON/journal/verify-before와 bf16 단위의 복원을 구현했다. real script와 fake hook을 사용한 runtime-stack 시험10개는 통과했으나 이를 실제GPU 학습의 성공 증거로 대신하지 않는다. 원본과 해시는 부록 H 및 `evidence/ple-sources-20260911.sha256`에 있다.

첫 수업은 `ainize_teach_first_20260911` 회차의 job `6314e86b-9ba2-4bc3-8a21-e3294663fdd7`이다. 아래 명령으로 같은 수업을 추적한다. 사전검사8개중known0, TRAINING 상태를 확인했으며 완료 여부는 새 상태로 재확인해야 한다.

```bash
bash kpi/docker/ainize-cli.sh teach status 6314e86b-9ba2-4bc3-8a21-e3294663fdd7 --json
```

종료/재개는 데이터를 유지한다:

```bash
docker compose -f kpi/docker/compose.chain.json stop
docker compose -f kpi/docker/compose.chain.json start
```

`down -v`는 증빙 블록을 삭제하므로 재현 절차에서 사용하지 않는다. DART `.env`나 Ainize 개인 키를 이미지·Git·게시물에 넣지 않는다.
