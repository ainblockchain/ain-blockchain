// M4 온체인 기록 공용 머클 유틸 (recorder.js · m4-verify-merkle.js 공용)
const crypto = require('crypto');

const sha = (...bufs) => { const h = crypto.createHash('sha256'); for (const b of bufs) h.update(b); return h.digest(); };
// 리프 = 온체인이 약속(commit)하는 필드 4개: requestId · timestamp · tokensGenerated · inferenceTimeMs.
// 배치 파일의 나머지 필드(server 등)는 참고 메타데이터이며 루트에 포함되지 않는다.
const leafHash = rec => sha(JSON.stringify([rec.requestId, rec.timestamp, rec.tokensGenerated, rec.inferenceTimeMs]));

function merkleRoot(leaves) {
  if (leaves.length === 0) return Buffer.alloc(32);
  let level = leaves;
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) next.push(sha(level[i], level[i + 1] || level[i]));
    level = next;
  }
  return level[0];
}

// 리프 idx 의 포함 증명 (형제 해시 경로). 홀수 레벨은 마지막 노드를 자기 자신과 짝지음(merkleRoot 와 동일 규칙).
function merkleProof(leaves, idx) {
  const proof = [];
  let level = leaves, i = idx;
  while (level.length > 1) {
    const sib = i ^ 1;
    proof.push({ hash: (level[sib] || level[i]).toString('hex'), left: sib < i });
    const next = [];
    for (let k = 0; k < level.length; k += 2) next.push(sha(level[k], level[k + 1] || level[k]));
    level = next; i = i >> 1;
  }
  return proof;
}

function verifyProof(leaf, proof, rootHex) {
  let h = leaf;
  for (const p of proof) { const s = Buffer.from(p.hash, 'hex'); h = p.left ? sha(s, h) : sha(h, s); }
  return h.toString('hex') === rootHex;
}

module.exports = { leafHash, merkleRoot, merkleProof, verifyProof };
