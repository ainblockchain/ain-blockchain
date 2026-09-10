# M4: 온-오프체인 인퍼런스 TPS — Locust 240U/60W (계획서 규정 측정법)
# 클라이언트 측 라운드로빈(1단계 방법론과 동일) + 온체인 비동기 기록(op_list recorder)
# 1초 윈도우 최대 TPS 산정용: 요청 완료 epoch-ms 타임스탬프를 워커별 파일에 기록
import itertools
import json
import os
import random
import time
import uuid

from locust import FastHttpUser, task, events

VLLM_SERVERS = [f"http://localhost:{p}" for p in range(8001, 8007)]  # 6 servers (GPU 0-5)
RECORDERS = ["http://localhost:9100", "http://localhost:9101"]
_rr = itertools.cycle(range(len(VLLM_SERVERS)))
_rec_rr = itertools.cycle(range(len(RECORDERS)))

# 파라미터는 1단계 방법론 준수: max_tokens 512, 자연 종료(stop) 허용
PROMPTS = [
    "Q: 2+2=? Reply with only the number.",
    "Q: capital of France? Reply with only the city name.",
    "Q: 7*8=? Reply with only the number.",
    "Q: first letter of alphabet? Reply with only the letter.",
    "Q: 10-3=? Reply with only the number.",
    "Q: color of the sky on a clear day? One word.",
]

TS_DIR = os.path.join(os.environ.get("KPI_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "work")), "results", "m4_ts")
os.makedirs(TS_DIR, exist_ok=True)
_ts_buf = []
_ts_path = os.path.join(TS_DIR, f"ts_{os.getpid()}.log")


def _flush_ts():
    global _ts_buf
    if _ts_buf:
        with open(_ts_path, "a") as f:
            f.write("\n".join(str(t) for t in _ts_buf) + "\n")
        _ts_buf = []


@events.request.add_listener
def on_request(request_type, name, response_time, response_length, exception, **kw):
    if name == "inference" and exception is None:
        _ts_buf.append(int(time.time() * 1000))
        if len(_ts_buf) >= 200:
            _flush_ts()


@events.quitting.add_listener
def on_quit(environment, **kw):
    _flush_ts()


class InferenceUser(FastHttpUser):
    host = VLLM_SERVERS[0]
    network_timeout = 30.0
    connection_timeout = 10.0

    @task
    def infer(self):
        rid = str(uuid.uuid4())
        server_idx = next(_rr)
        t0 = time.time()
        with self.client.post(
            VLLM_SERVERS[server_idx] + "/v1/completions",
            json={"model": "gpt-oss-20b", "prompt": random.choice(PROMPTS),
                  "max_tokens": 512, "temperature": 0.7, "stop": ["\n"]},
            name="inference", catch_response=True,
        ) as resp:
            dt_ms = int((time.time() - t0) * 1000)
            if resp.status_code == 200:
                try:
                    tokens = json.loads(resp.text).get("usage", {}).get("completion_tokens")
                except Exception:
                    tokens = None
                resp.success()
                try:
                    self.client.post(
                        RECORDERS[next(_rec_rr)] + "/record",
                        json={"requestId": rid, "timestamp": int(time.time() * 1000),
                              "tokensGenerated": tokens, "inferenceTimeMs": dt_ms},
                        name="onchain_record",
                    )
                except Exception:
                    pass
            else:
                resp.failure(f"HTTP {resp.status_code}")
