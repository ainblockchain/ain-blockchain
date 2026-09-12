import hashlib
import json
from pathlib import Path
import sys

import pyarrow as arrow
import pyarrow.parquet as parquet

root = Path(sys.argv[1]).resolve()
manifest_path = root / 'manifest.json'
manifest = json.loads(manifest_path.read_text())
card_path = root / 'README.md'
card = card_path.read_text()
assert hashlib.sha256(card.encode()).hexdigest() == manifest['cardSha256']
assert all('loaderFile' not in entry for entry in manifest['datasets'])
schema = arrow.schema([(field, arrow.string()) for field in ['prompt', 'answer', 'alt_prompt', 'note']])
for entry in manifest['datasets']:
    canonical = (root / entry['file']).read_bytes()
    assert hashlib.sha256(canonical).hexdigest() == entry['sha256']
    rows = [json.loads(line) for line in canonical.decode().splitlines()]
    loader_file = f"data/{entry['config']}.parquet"
    destination = root / loader_file
    assert not destination.exists()
    parquet.write_table(arrow.Table.from_pylist(rows, schema=schema), destination)
    assert parquet.read_table(destination).to_pylist() == [{field: row.get(field) for field in schema.names} for row in rows]
    entry['loaderFile'] = loader_file
    entry['loaderSha256'] = hashlib.sha256(destination.read_bytes()).hexdigest()
    old = f"path: {entry['file']}"
    assert card.count(old) == 1
    card = card.replace(old, f'path: {loader_file}')
card = card.replace('Local preparation only. After upload, verify', 'After upload, verify')
card += '\nThe HF configurations read typed Parquet files so date-like answers and leading zeros remain strings. The original canonical JSONL files are also retained byte-for-byte; the manifest binds both formats.\n'
card_path.write_text(card)
manifest['cardSha256'] = hashlib.sha256(card.encode()).hexdigest()
manifest['hubPublishedAtPreparation'] = manifest.pop('hubPublished')
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'configs': len(manifest['datasets']), 'format': 'Parquet with explicit string schema', 'canonicalJsonlPreserved': True}))
