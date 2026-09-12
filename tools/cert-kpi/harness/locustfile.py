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
import time

import gevent
from locust import FastHttpUser, task, events
from locust.runners import MasterRunner
import requests

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

# ── 워커별 비동기 온체인 기록 버퍼 ────────────────────────────────────────────
_rec_buf = []
_rec_sent = 0
_rec_fail = 0
_seq = 0


_inflight_batch = None
_loop_greenlet = None
_rec_enqueued = 0
_membership_samples = []
_membership_greenlet = None


def _observe_membership(environment):
    while True:
        runner = environment.runner
        _membership_samples.append({"timestamp_ms": int(time.time() * 1000),
                                    "users": runner.user_count, "workers": runner.worker_count,
                                    "states": {worker.id: worker.state for worker in runner.clients.values()}})
        gevent.sleep(1)


@events.test_start.add_listener
def on_test_start(environment, **kw):
    global _membership_greenlet
    if isinstance(environment.runner, MasterRunner):
        _membership_greenlet = gevent.spawn(_observe_membership, environment)


def _post_batch(batch, timeout, url=None):
    # 진행 중 배치는 (url, batch) 로 보관; greenlet 이 kill 되면(GreenletExit, BaseException) 지워지지 않아 on_quit 이 **같은 recorder** 로 재전송한다
    # (recorder 는 requestId 로 중복 제거하므로 첫 전송이 이미 성공했어도 안전; 다른 recorder 로 보내면 중복 기록이 생긴다)
    global _rec_sent, _rec_fail, _inflight_batch
    url = url or (RECORDERS[next(_rec_rr)] + "/record")
    _inflight_batch = (url, batch)
    try:
        response = requests.post(url, json=batch, timeout=timeout)
        response.raise_for_status()
        acknowledged = response.json().get("queued")
        if not isinstance(acknowledged, int) or not 0 <= acknowledged <= len(batch):
            raise ValueError("invalid recorder acknowledgement")
        _rec_sent += len(batch)
    except Exception:
        _rec_fail += len(batch)
    _inflight_batch = None


def _flush_records(block=False):
    global _rec_buf
    while _rec_buf:
        batch, _rec_buf = _rec_buf[:50], _rec_buf[50:]
        _post_batch(batch, 5 if block else 2)
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
    global _loop_greenlet
    if not isinstance(environment.runner, MasterRunner):      # worker(또는 단독 실행) 프로세스만 기록 루프를 돈다
        _loop_greenlet = gevent.spawn(_record_loop)


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
_master_at_spawn = None


@events.spawning_complete.add_listener
def on_spawning_complete(user_count, **kw):
    # 워커: 이 프로세스에 배정된 유저 수 (240/60 = 4) — 종료 시 덤프에 기록해 '240 User / 60 Worker' 를 파일로 증명
    # 마스터: 스폰 완료 시점의 워커 수·목표 유저 수를 기록 (종료 시점에는 워커가 이미 끊겨 worker_count 가 줄어든다)
    global _spawned_users, _master_at_spawn
    if _env is not None and _env.runner is not None:
        if isinstance(_env.runner, MasterRunner):
            _master_at_spawn = {"worker_count": _env.runner.worker_count, "target_user_count": _env.runner.target_user_count,
                                "user_count": _env.runner.user_count, "spawning_complete_user_count": user_count}
        else:
            _spawned_users = max(_spawned_users, _env.runner.user_count)


@events.quitting.add_listener
def on_quit(environment, **kw):
    runner = environment.runner
    if isinstance(runner, MasterRunner):
        if _membership_greenlet is not None:
            _membership_greenlet.kill(block=True)
        # Locust 자체 통계: 초 단위 성공 요청 수(워커 보고 병합값) → 1초 윈도우 TPS 근거
        st = environment.stats.get("inference", "POST")
        out = {
            "run": RUN, "users": runner.target_user_count, "workers_at_quit": runner.worker_count, "at_spawning_complete": _master_at_spawn,
            "vllm_servers": VLLM_SERVERS, "model": MODEL, "membership_samples": _membership_samples,
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
        # 기록 루프를 멈추고(진행 중이던 배치는 재전송; recorder 가 requestId 로 중복 제거) 남은 버퍼를 동기 전송
        if _loop_greenlet is not None:
            _loop_greenlet.kill(block=True)
        if _inflight_batch:
            _post_batch(_inflight_batch[1], 5, url=_inflight_batch[0])
        _flush_records(block=True)
        _flush_ts()
        os.makedirs(TS_DIR, exist_ok=True)
        with open(os.path.join(TS_DIR, f"recorder_client_{os.getpid()}.json"), "w") as f:
            json.dump({"sent": _rec_sent, "failed": _rec_fail, "enqueued": _rec_enqueued}, f)
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
        global _seq, _rec_enqueued
        server = VLLM_SERVERS[next(_rr)]
        prompt = PROMPTS[next(_prompt_rr)]
        t0 = time.time()
        with self.client.post(server + "/v1/completions",
                                json={"model": MODEL, "prompt": prompt, "max_tokens": 512, "stop": ["\n", "."]},
                                name="inference", catch_response=True) as resp:
            if resp.status_code != 200:
                resp.failure(f"inference HTTP {resp.status_code}")
                return
            try:
                result = resp.json()
                tokens = result["usage"]["completion_tokens"]
                text = result["choices"][0]["text"]
                if result.get("error") or not isinstance(tokens, int) or tokens <= 0 or not isinstance(text, str) or not text.strip():
                    raise ValueError("empty or invalid inference response")
            except (ValueError, KeyError, IndexError, TypeError) as error:
                resp.failure(str(error))
                return
            dt_ms = int((time.time() - t0) * 1000)
            _seq += 1
            _rec_buf.append({"requestId": f"{RUN}-{os.getpid()}-{_seq}", "timestamp": int(time.time() * 1000),
                             "tokensGenerated": tokens, "inferenceTimeMs": dt_ms, "server": server})
            _rec_enqueued += 1
