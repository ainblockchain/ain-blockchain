// node test/merkle.test.js — M4 머클 유틸 단위 테스트 (루트·포함 증명·부정 케이스)
const assert = require('assert');
const { leafHash, merkleRoot, merkleProof, verifyProof } = require('../m4-merkle');
for (const n of [1, 2, 3, 7, 8, 500, 501]) {
  const recs = Array.from({ length: n }, (_, i) => ({ requestId: `r${i}`, timestamp: i, tokensGenerated: 3, inferenceTimeMs: 10 + i }));
  const leaves = recs.map(leafHash); const root = merkleRoot(leaves).toString('hex');
  for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 7))) {
    assert.ok(verifyProof(leaves[i], merkleProof(leaves, i), root), `proof ${i}/${n}`);
    const forged = leafHash({ ...recs[i], tokensGenerated: 4 });
    assert.ok(!verifyProof(forged, merkleProof(leaves, i), root), `forged leaf ${i}/${n} must fail`);
    if (n > 1) assert.ok(!verifyProof(leaves[i], merkleProof(leaves, (i + 1) % n), root), `wrong proof ${i}/${n} must fail`);
  }
}
assert.strictEqual(merkleRoot([]).toString('hex'), '0'.repeat(64));
console.log('merkle: ok');
