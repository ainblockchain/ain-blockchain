import hashlib
import json
from pathlib import Path
import sys

from huggingface_hub import HfApi, snapshot_download

source = Path(sys.argv[1]).resolve()
output = Path(sys.argv[2]).resolve()
repo_id = sys.argv[3]
token = Path('/run/secrets/hf_token').read_text().strip()
assert token and repo_id.count('/') == 1
manifest = json.loads((source / 'manifest.json').read_text())
assert len(manifest['datasets']) == 100
files = ['README.md', 'manifest.json']
for entry in manifest['datasets']:
    for field, hash_field in [('file', 'sha256'), ('loaderFile', 'loaderSha256')]:
        name = entry[field]
        assert Path(name).parts[0] == 'data' and '..' not in Path(name).parts
        assert hashlib.sha256((source / name).read_bytes()).hexdigest() == entry[hash_field]
        files.append(name)
assert len(set(files)) == 202
assert hashlib.sha256((source / 'README.md').read_bytes()).hexdigest() == manifest['cardSha256']
state_file = output / 'publication.json'
assert not state_file.exists(), 'existing publication attempt; inspect its remote repository before retrying'
api = HfApi(token=token)
identity = api.whoami()
state = {'repoId': repo_id, 'repoType': 'dataset', 'account': identity['name'], 'created': False, 'uploaded': False, 'verifiedFiles': 0}

def save():
    temporary = output / 'publication.tmp'
    temporary.write_text(json.dumps(state, indent=2) + '\n')
    temporary.replace(state_file)

save()
url = api.create_repo(repo_id, repo_type='dataset', private=False, exist_ok=False)
state.update(created=True, url=str(url))
save()
commit = api.upload_folder(repo_id=repo_id, repo_type='dataset', folder_path=source, allow_patterns=files,
                           commit_message='Publish 100 DART task configs with Ainize canonical dataset provenance')
state.update(uploaded=True, commit=commit.oid, commitUrl=commit.commit_url)
save()
remote = api.repo_info(repo_id, repo_type='dataset', revision=commit.oid)
assert remote.sha == commit.oid and not remote.private
snapshot = Path(snapshot_download(repo_id, repo_type='dataset', revision=commit.oid, token=token,
                                  allow_patterns=files, local_dir=output / 'download', max_workers=4))
hashes = {}
for name in files:
    expected = hashlib.sha256((source / name).read_bytes()).hexdigest()
    assert hashlib.sha256((snapshot / name).read_bytes()).hexdigest() == expected, name
    hashes[name] = expected
(output / 'remote-hashes.json').write_text(json.dumps(hashes, indent=2) + '\n')
state.update({'verifiedFiles': len(hashes), 'pass': True,
              'scope': 'Public HF dataset repository, 100 configurations, 202 files downloaded at the immutable commit and hash-verified; not model deployment or teach/inference100 proof'})
save()
print(json.dumps(state))
