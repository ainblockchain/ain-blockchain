# tools/cert-kpi/env.sh — 시험 호스트별 환경 (복사해서 env.sh 로 저장한 뒤 `source env.sh`)
# 비워 두면 각 스크립트의 기본값(저장소 상대 경로, PATH 의 도구)이 쓰인다. 값은 2026-09-10 리허설 호스트의 실측 예.

# 저장소·작업 루트 --------------------------------------------------------------
export AIN_REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)   # ain-blockchain 체크아웃 (v1.6.1+)
export KPI=$AIN_REPO/tools/cert-kpi                                   # 하네스·결과·로그 루트 (절차서의 $KPI)
export KPI_DIR=$KPI                                                    # 스크립트가 읽는 이름
export AIN_BLOCKCHAIN_REPO=$AIN_REPO                                   # 노드 코드 위치 (start-cert-net.sh, common.js)
export PATH=$KPI/harness/node_modules/.bin:$PATH

# 인증망 포트 (한 호스트에서 두 번째 망을 띄울 때만 바꾼다) ----------------------
# export CHAIN_PORT_BASE=8081        # 노드 i = base+i (start-cert-net.sh, common.js 공통)
# export TRACKER_PORT=8079           # 기본 base-2
# export P2P_PORT_BASE=5001
# export EVENT_PORT_BASE=5100        # node8/9 이벤트 핸들러 (base, base+1)
# export CHAIN_EVENT_URLS='["ws://localhost:5100","ws://localhost:5101"]'   # 하네스가 구독할 WS

# 지표 4 (vLLM + Locust) ------------------------------------------------------
# export VLLM_ENV=/mnt/newdata/glm-vllm-env          # vLLM venv (bin/ 을 PATH 에 추가)
# export VLLM=$VLLM_ENV/bin/vllm                     # 기본: PATH 의 vllm
# export M4_MODEL_DIR=/mnt/newdata/models/gpt-oss-20b   # 기본: openai/gpt-oss-20b (HF id)
# export LOCUST=/mnt/newdata/gov/kpi/pyenv/bin/locust   # 기본: PATH 의 locust (2.46.0)
export VLLM_USE_FLASHINFER_SAMPLER=0                   # 호스트 nvcc 11.5 → FlashInfer 샘플러 JIT 불가 (부록 C)

# 지표 5·6 (Ainize) -----------------------------------------------------------
# export RUNTIME_REPO=/mnt/newdata/qwen3.8            # finance-knowledge-training-demo 체크아웃 (dart-build-datasets.py 의 data/krx.json)
# export AINIZE_CLI=/path/to/ainize-cli/dist/bin.js   # 소스 빌드를 쓸 때만. 기본: PATH 의 ainize (npm i -g @ainize/cli@0.1.0)
# export AINIZE_NODE=/mnt/newdata/tools/node-v24.21.0-linux-x64/bin/node   # AINIZE_CLI 를 실행할 Node 24 (기본: 현재 node)
# export AINIZE_ROOT=$KPI/ainize                      # 노드 홈들의 부모 (home, home-cert). m5-ainize-stack.sh
# export AINIZE_TEMPLATE_HOME=$AINIZE_ROOT/home       # node-init 이 복제할 기준 홈 (ainize init 으로 생성)
# export DART_API_KEY=...                             # 또는 harness/.env.dart

# 지표 6 보조 (lm-eval) --------------------------------------------------------
# export LM_EVAL=/mnt/newdata/gov/kpi/evalenv/bin/lm_eval   # 기본: PATH 의 lm_eval
# export HF_HOME=$KPI/hf-home
# export HF_CLI=hf
