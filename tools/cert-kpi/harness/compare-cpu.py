import hashlib
import json
from pathlib import Path
import re
import statistics
import sys

root = Path(__file__).resolve().parent.parent
evidence = root / 'evidence'
reference = evidence / 'cpu-reference-aws'
local = evidence / 'cpu-stressng-local-20260911.stderr'


def scores(text):
    return [float(value) for value in re.findall(r'bogo-ops-per-second-real-time:\s*([0-9.]+)', text)]


repeated = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else None
local_files = sorted(repeated.glob('run-*.stderr')) if repeated else [local]
local_runs = [scores(file.read_text()) for file in local_files]
if not local_runs or any(len(run) != 2 for run in local_runs) or (repeated and len(local_runs) != 3):
    raise SystemExit('expected completed local single/multi runs')
local_scores = [statistics.median(run[index] for run in local_runs) for index in [0, 1]]
if repeated:
    for filename in sorted(repeated.glob('state-*.json')):
        state = json.loads(filename.read_text())
        if state['ExitCode'] != 0 or state['OOMKilled']:
            raise SystemExit('local container did not finish successfully')
reference_single = scores((reference / 'single.yaml').read_text())[0]
reference_multi = scores((reference / 'multi.yaml').read_text())[0]
for filename in ['single-meta.json', 'multi-meta.json']:
    metadata = json.loads((reference / filename).read_text())
    if metadata['exit_code'] != 0 or metadata['version'] != '0.17.08':
        raise SystemExit('reference version or exit code mismatch')
version_files = sorted(repeated.glob('run-*.stdout')) if repeated else [evidence / 'cpu-stressng-local-20260911.stdout']
if any('version 0.17.08' not in file.read_text() for file in version_files):
    raise SystemExit('local stress-ng version mismatch')
report = {
    'benchmark': 'stress-ng 0.17.08 --cpu-method div16, 20 seconds',
    'reference': {
        'source': 'https://github.com/SpareCores/sc-inspector-data/tree/b61c54f7cffd0fe353661aa0531a8b47a4affe6b/data/aws/m6i.8xlarge',
        'attribution': 'Spare Cores Inspector Data, CC BY-SA 4.0',
        'commandSource': 'https://github.com/SpareCores/sc-inspector/blob/ebf37bcd3c8b234a41b88f77464bac9d4faabfae/inspector/tasks.py',
        'vcpus': 32, 'singleOpsPerSecond': reference_single, 'multiOpsPerSecond': reference_multi,
    },
    'local': {'vcpus': 8, 'singleOpsPerSecond': local_scores[0], 'multiOpsPerSecond': local_scores[1],
              'runsSingleMulti': local_runs, 'statistic': 'median',
              'multiRangeOpsPerSecond': [min(run[1] for run in local_runs), max(run[1] for run in local_runs)],
              'image': 'ghcr.io/colinianking/stress-ng@sha256:040db041445627cef2d1d1109cbf47c5a2727f0f9c65157e365d419699c9d0c5'},
    'singleThreadRatioLocalToAws': local_scores[0] / reference_single,
    'wholeMachineRatioLocalToOneAwsInstance': local_scores[1] / reference_multi,
    'wholeMachinePercentLowerThanOneAwsInstance': 100 * (1 - local_scores[1] / reference_multi),
    'ratioToTenAwsInstancesAssumingLinearCapacity': local_scores[1] / (10 * reference_multi),
    'limitations': [
        f'{len(local_runs)} 20-second samples per concurrency; not a statistical confidence interval',
        'local measured during other active workloads, including legacy and Docker chains',
        'reference and repeated local runs use nice -20' if repeated else 'reference run used nice -20; local run used default priority',
        'historical reference from June 2024; not a simultaneous controlled experiment',
        'div16 is a CPU integer-division workload, not blockchain or inference TPS',
        'ten-instance number assumes independent linear capacity; not observed networked throughput',
    ],
    'evidenceHashes': {str(file.relative_to(root)): hashlib.sha256(file.read_bytes()).hexdigest()
                       for file in [*local_files, *version_files, *sorted(reference.iterdir()), *(sorted(repeated.glob('*.json')) if repeated else [])] if file.is_file()},
}
output = evidence / ('cpu-comparison-20260911-repeat.json' if repeated else 'cpu-comparison-20260911.json')
with output.open('x') as destination:
    json.dump(report, destination, indent=2)
    destination.write('\n')
print(json.dumps({key: value for key, value in report.items() if 'Ratio' in key or 'Percent' in key or key.startswith('ratioTo')}, indent=2))
