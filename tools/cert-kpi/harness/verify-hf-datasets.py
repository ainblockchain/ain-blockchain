import hashlib
import json
from pathlib import Path
import sys

import datasets
import huggingface_hub
from datasets import get_dataset_config_names, load_dataset

root = Path(sys.argv[1]).resolve()
output = Path(sys.argv[2]).resolve()
manifest = json.loads((root / 'manifest.json').read_text())
names = get_dataset_config_names(str(root))
expected = [entry['config'] for entry in manifest['datasets']]
assert len(names) == len(expected) == 100
assert set(names) == set(expected)
results = []
for entry in manifest['datasets']:
    source = (root / entry['file']).read_bytes()
    assert hashlib.sha256(source).hexdigest() == entry['sha256']
    original = [json.loads(line) for line in source.decode().splitlines()]
    if entry.get('loaderFile'):
        assert hashlib.sha256((root / entry['loaderFile']).read_bytes()).hexdigest() == entry['loaderSha256']
    loaded = load_dataset(str(root), entry['config'], split='train')
    assert len(loaded) == entry['rows'] == len(original)
    for actual, row in zip(loaded, original):
        for field in ['prompt', 'answer', 'alt_prompt', 'note']:
            assert actual.get(field) == row.get(field), (entry['config'], field)
    results.append({'config': entry['config'], 'rows': len(loaded), 'sha256': entry['sha256'], 'pass': True})
report = {'configs': len(results), 'rows': sum(entry['rows'] for entry in results), 'results': results,
          'datasetsVersion': datasets.__version__, 'hubVersion': huggingface_hub.__version__,
          'pass': True, 'scope': 'All local HF configurations loaded and matched to Ainize canonical bytes; not remote publication or model inference'}
with output.open('x') as destination:
    json.dump(report, destination, ensure_ascii=False, indent=2)
    destination.write('\n')
print(json.dumps({key: value for key, value in report.items() if key != 'results'}))
