# models100.json 사전 다운로드 (snapshot_download, safetensors 우선/bin 폴백, 재시도)
import json, os, sys, time
KPI_DIR = os.environ.get('KPI_DIR', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from concurrent.futures import ThreadPoolExecutor, as_completed
from huggingface_hub import list_repo_files, snapshot_download

os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
HF_HOME = os.environ.get("HF_HOME", os.path.join(KPI_DIR, "hf-home"))
os.environ["HF_HOME"] = HF_HOME

MODELS = [m["id"] for m in json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "models100.json")))]

COMMON = ["*.json", "*.model", "tokenizer*", "*.tiktoken", "merges.txt", "vocab*", "*.py"]

def fetch(repo):
    for attempt in range(4):
        try:
            files = list_repo_files(repo)
            has_st = any(f.endswith(".safetensors") for f in files)
            pats = (["*.safetensors"] if has_st else ["*.bin", "*.pt"]) + COMMON
            ignore = ["original/*", "metal/*", "onnx/*", "openvino/*", "*.gguf", "*.onnx", "*.msgpack", "*.h5", "coreml/*"]
            snapshot_download(repo, allow_patterns=pats, ignore_patterns=ignore)
            return repo, "OK", has_st
        except Exception as e:
            msg = str(e)[:150]
            if attempt < 3:
                time.sleep(20 * (attempt + 1))
            else:
                return repo, f"FAIL {msg}", None
    return repo, "FAIL", None

done = 0
fails = []
with ThreadPoolExecutor(max_workers=4) as ex:
    futs = {ex.submit(fetch, m): m for m in MODELS}
    for fu in as_completed(futs):
        repo, status, st = fu.result()
        done += 1
        print(f"[{done}/{len(MODELS)}] {status} {repo} (st={st})", flush=True)
        if status.startswith("FAIL"):
            fails.append((repo, status))

print("FAILED:", len(fails))
for r, s in fails:
    print(" ", r, s)
