# M4: 온-오프체인 거대모델 인퍼런스 TPS — 계획서 규정 측정법 "Locust command 로 240 User 를 60 Worker 에 분산"
#   실행은 m4-run-locust.sh (master: -u 240 -r 240 --expect-workers 60 --headless -t <DUR>s, worker × 60)
#   추론: 클라이언트 라운드로빈으로 vLLM 서버(VLLM_PORTS, 기본 8001,8002, gpt-oss-20b) /v1/completions
#   온체인 기록: 워커별 버퍼 → 별도 greenlet 이 50건 단위로 recorder(머클 배치 앵커)에 비동기 전달 (추론 응답 경로와 분리)
#   TPS 산정: 워커 60개가 각자 Locust 자체 통계(StatsEntry.num_reqs_per_sec, 초 단위 성공 요청 수)와 배정 유저 수를 종료 시 JSON 으로 덤프
#             → m4-verify-merkle.js 가 워커 덤프 60개를 합산해 1초 윈도우 최대/지속 TPS 를 계산하고, 워커 수 60·유저 합 240 을 파일로 확인
#             (마스터 병합본은 응답시간 백분위·교차검증용; self-report 타임스탬프도 교차검증용으로만 기록)
# 리뷰 반영: 기록 POST 를 사용자 태스크 내 동기 호출에서 분리, 서버 목록 env 화, requestId 를 run 에 바인딩,
#            TPS 는 Locust 통계에서 산출, stop 토큰·프롬프트를 1단계/사전 프로브와 동일하게 고정.
import itertools
import json
import os
import re
import time

import gevent
import requests
from locust import FastHttpUser, task, events
from locust.runners import MasterRunner

RUN = os.environ.get("M4_RUN")
if not RUN:
    raise SystemExit("M4_RUN is required (binds requestIds, recorder batches and on-chain paths to this run)")
PORTS = [int(p) for p in os.environ.get("VLLM_PORTS", "8001,8002").split(",")]   # 실측 구성: 서버 2대 (m4-start-vllm.sh)
VLLM_SERVERS = [f"http://localhost:{p}" for p in PORTS]
RECORDERS = os.environ.get("RECORDERS", "http://localhost:9100,http://localhost:9101").split(",")
MODEL = os.environ.get("M4_MODEL", "gpt-oss-20b")
RESULTS = os.environ.get("RESULTS_DIR", os.path.join(os.environ.get("KPI_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")), "results"))
_rr = itertools.cycle(range(len(VLLM_SERVERS)))
_rec_rr = itertools.cycle(range(len(RECORDERS)))

# 1단계·사전 프로브(probe-inference.js SHORT)와 동일한 짧은 Q/A 프롬프트, max_tokens 512 + 자연 종료(stop)
PROMPTS = [
    "Q: 2+2=? Reply with only the number.\nAnswer:",
    "Q: capital of France? Reply with only the city name.\nAnswer:",
    "Q: 7*8=? Reply with only the number.\nAnswer:",
    "Q: first letter of alphabet? Reply with only the letter.\nAnswer:",
]
_prompt_rr = itertools.cycle(range(len(PROMPTS)))
_TOK_RE = re.compile(r'"completion_tokens"\s*:\s*(\d+)')

# ── 워커별 비동기 온체인 기록 버퍼 ────────────────────────────────────────────
_rec_buf = []
_rec_sent = 0
_rec_fail = 0
_seq = 0


def _flush_records(block=False):
    global _rec_buf, _rec_sent, _rec_fail
    while _rec_buf:
        batch, _rec_buf = _rec_buf[:50], _rec_buf[50:]
        url = RECORDERS[next(_rec_rr)] + "/record"
        try:
            requests.post(url, json=batch, timeout=5 if block else 2)
            _rec_sent += len(batch)
        except Exception:
            _rec_fail += len(batch)
        if not block:
            break


def _record_loop():
    while True:
        gevent.sleep(0.1)
        _flush_records()


# 교차검증용 self-report: 성공 요청 완료 시각(epoch ms) — 판정에는 쓰지 않음
TS_DIR = os.path.join(RESULTS, f"m4_ts_{RUN}")
_ts_buf = []


def _flush_ts():
    global _ts_buf
    if _ts_buf:
        os.makedirs(TS_DIR, exist_ok=True)
        with open(os.path.join(TS_DIR, f"ts_{os.getpid()}.log"), "a") as f:
            f.write("\n".join(str(t) for t in _ts_buf) + "\n")
        _ts_buf = []


@events.init.add_listener
def on_init(environment, **kw):
    global _env
    _env = environment
    if not isinstance(environment.runner, MasterRunner):      # worker(또는 단독 실행) 프로세스만 기록 루프를 돈다
        gevent.spawn(_record_loop)


@events.request.add_listener
def on_request(request_type, name, response_time, response_length, exception, **kw):
    # Locust 의 request 이벤트(요청 완료 시점)에서 워커별 초당 성공/실패 수를 집계한다.
    # 워커의 StatsEntry 는 마스터 보고 후 리셋되므로 종료 시점에 남지 않는다 → 이 집계가 워커 측 원천 통계.
    if name != "inference":
        return
    global _spawned_users
    if _env is not None and _env.runner is not None and _env.runner.user_count > _spawned_users:
        _spawned_users = _env.runner.user_count
    now = time.time()
    sec = str(int(now))
    if exception is None:
        _per_sec[sec] = _per_sec.get(sec, 0) + 1
        _ts_buf.append(int(now * 1000))
        if len(_ts_buf) >= 200:
            _flush_ts()
    else:
        _fail_per_sec[sec] = _fail_per_sec.get(sec, 0) + 1


_spawned_users = 0


_env = None
_per_sec = {}
_fail_per_sec = {}


@events.spawning_complete.add_listener
def on_spawning_complete(user_count, **kw):
    # 워커: 이 프로세스에 배정된 유저 수 (240/60 = 4) — 종료 시 덤프에 기록해 '240 User / 60 Worker' 를 파일로 증명
    # (이벤트 인자 user_count 는 전체 합이므로 워커 자신의 runner.user_count 를 쓴다)
    global _spawned_users
    if _env is not None and _env.runner is not None:
        _spawned_users = max(_spawned_users, _env.runner.user_count)


@events.quitting.add_listener
def on_quit(environment, **kw):
    runner = environment.runner
    if isinstance(runner, MasterRunner):
        # Locust 자체 통계: 초 단위 성공 요청 수(워커 보고 병합값) → 1초 윈도우 TPS 근거
        st = environment.stats.get("inference", "POST")
        out = {
            "run": RUN, "users": runner.target_user_count, "workers": runner.worker_count,
            "vllm_servers": VLLM_SERVERS, "model": MODEL,
            "num_requests": st.num_requests, "num_failures": st.num_failures,
            "avg_response_time_ms": st.avg_response_time, "median_response_time_ms": st.median_response_time,
            "p99_response_time_ms": st.get_response_time_percentile(0.99),
            "start_time": environment.stats.start_time, "last_request_timestamp": environment.stats.last_request_timestamp,
            "num_reqs_per_sec": {str(k): v for k, v in sorted(st.num_reqs_per_sec.items())},
            "num_fail_per_sec": {str(k): v for k, v in sorted(st.num_fail_per_sec.items())},
        }
        with open(os.path.join(RESULTS, f"m4_{RUN}_locust_persec.json"), "w") as f:
            json.dump(out, f, indent=1)
    else:
        _flush_records(block=True)
        _flush_ts()
        os.makedirs(TS_DIR, exist_ok=True)
        with open(os.path.join(TS_DIR, f"recorder_client_{os.getpid()}.json"), "w") as f:
            json.dump({"sent": _rec_sent, "failed": _rec_fail}, f)
        # 워커 자체 통계 덤프 (마스터 병합본은 종료 시 마지막 보고를 놓칠 수 있으므로, TPS 판정은 워커 덤프 합산으로 한다)
        ok = sum(_per_sec.values()); bad = sum(_fail_per_sec.values())
        with open(os.path.join(TS_DIR, f"locust_worker_{os.getpid()}.json"), "w") as f:
            json.dump({"run": RUN, "pid": os.getpid(), "users": _spawned_users,
                       "num_requests": ok + bad, "num_failures": bad,
                       "num_reqs_per_sec": dict(sorted(_per_sec.items())),
                       "num_fail_per_sec": dict(sorted(_fail_per_sec.items()))}, f)


class InferenceUser(FastHttpUser):
    host = VLLM_SERVERS[0]
    network_timeout = 30.0
    connection_timeout = 10.0

    @task
    def infer(self):
        global _seq
        server = VLLM_SERVERS[next(_rr)]
        prompt = PROMPTS[next(_prompt_rr)]
        t0 = time.time()
        # 비-2xx 는 Locust 가 자동으로 실패 집계 (catch_response 컨텍스트 생략 → 워커 CPU 절감)
        resp = self.client.post(server + "/v1/completions",
                                json={"model": MODEL, "prompt": prompt, "max_tokens": 512, "stop": ["\n", "."]},
                                name="inference")
        if resp.status_code == 200:
            dt_ms = int((time.time() - t0) * 1000)
            m = _TOK_RE.search(resp.text)
            tokens = int(m.group(1)) if m else None
            _seq += 1
            _rec_buf.append({"requestId": f"{RUN}-{os.getpid()}-{_seq}", "timestamp": int(time.time() * 1000),
                             "tokensGenerated": tokens, "inferenceTimeMs": dt_ms, "server": server})
