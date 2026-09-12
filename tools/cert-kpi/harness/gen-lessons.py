KPI_DIR = os.environ.get('KPI_DIR', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
# M5(Ainize teach): KRX 종목코드 데이터 → 수업(lesson) 파일 N개 생성 (수업당 FACTS 종목)
# 각 수업 = 지식 패치 1개 = 모델 1종 으로 판정 (사용자 결정)
import json, random, re, sys
SRC = os.environ.get('KRX_JSON', os.path.join(os.environ.get('RUNTIME_REPO', '/work'), 'data', 'krx.json'))
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'm5-lessons')
N = int(sys.argv[1]) if len(sys.argv) > 1 else 120
FACTS = int(sys.argv[2]) if len(sys.argv) > 2 else 8
rows = json.load(open(SRC))
# 6자리 숫자 종목코드만 (알파벳 포함 신규 코드는 제외), 회사명 중복 제거
seen = set(); items = []
for r in rows:
    name, code = r['회사명'].strip(), r['종목코드'].strip()
    if not re.fullmatch(r'\d{6}', code) or name in seen: continue
    seen.add(name); items.append((name, code, r.get('시장구분',''), r.get('업종','')))
random.Random(20260910).shuffle(items)
manifest = []
for i in range(N):
    chunk = items[i*FACTS:(i+1)*FACTS]
    lid = f'krx-lesson-{i+1:03d}'
    with open(f'{OUT}/{lid}.jsonl', 'w') as f:
        for name, code, mkt, ind in chunk:
            f.write(json.dumps({'prompt': f'{name} 종목코드 알려줘', 'answer': code,
                                'alt_prompt': f'종목코드 {name}', 'note': f'KRX {mkt} · {ind}'}, ensure_ascii=False) + '\n')
    manifest.append({'id': lid, 'file': f'{OUT}/{lid}.jsonl', 'facts': [{'name': n, 'code': c} for n, c, _, _ in chunk]})
json.dump(manifest, open(f'{OUT}/manifest.json', 'w'), ensure_ascii=False, indent=1)
print(f'{N} lessons x {FACTS} facts from {len(items)} listings -> {OUT}')
