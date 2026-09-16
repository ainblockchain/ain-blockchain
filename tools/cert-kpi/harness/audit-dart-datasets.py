import hashlib
import json
from pathlib import Path
import sys
from collections import Counter

root = Path(__file__).resolve().parent.parent
directory = root / 'harness' / 'dart-datasets'
manifest_path = directory / 'manifest.json'
manifest = json.loads(manifest_path.read_text())
details = []
seen = set()
for entry in manifest:
    file = directory / Path(entry['file']).name
    errors = []
    if entry['id'] in seen:
        errors.append('duplicate dataset id')
    seen.add(entry['id'])
    content = file.read_bytes()
    rows = [json.loads(line) for line in content.decode().splitlines() if line.strip()]
    if not rows or not entry.get('facts'):
        errors.append('empty dataset or lesson')
    if len(rows) != len(entry.get('facts', [])):
        errors.append('manifest/file row count differs')
    for index, row in enumerate(rows):
        if not isinstance(row.get('prompt'), str) or not row['prompt'].strip() or not str(row.get('answer', '')).strip():
            errors.append(f'invalid QA at row {index + 1}')
    details.append({'id': entry['id'], 'api': entry.get('api'), 'file': str(file.relative_to(root)),
                    'sha256': hashlib.sha256(content).hexdigest(), 'rows': len(rows), 'errors': errors, 'valid': not errors})
report = {
    'scope': 'DART dataset inventory only; not teach/inference success evidence',
    'manifestSha256': hashlib.sha256(manifest_path.read_bytes()).hexdigest(),
    'datasets': len(details), 'validDatasets': sum(entry['valid'] for entry in details),
    'uniqueContentHashes': len({entry['sha256'] for entry in details}),
    'apiGroups': dict(sorted(Counter(entry['api'] for entry in details).items())),
    'details': details,
    'pass': len(details) >= 100 and all(entry['valid'] for entry in details) and len({entry['sha256'] for entry in details}) >= 100,
}
output = Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'evidence' / 'dart-inventory-20260911.json'
with output.open('x') as destination:
    json.dump(report, destination, indent=2, ensure_ascii=False)
    destination.write('\n')
print(json.dumps({key: report[key] for key in ['datasets', 'validDatasets', 'uniqueContentHashes', 'pass']}))
sys.exit(0 if report['pass'] else 1)
