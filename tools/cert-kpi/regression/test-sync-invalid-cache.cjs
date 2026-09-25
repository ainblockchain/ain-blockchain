const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),test=require('node:test');
const source=fs.readFileSync(process.argv[2],'utf8');const start=source.indexOf('  mergeChainSegment(chainSegment) {'),end=source.indexOf('\n  /**',start+1);
function setup(invalidHash) {
 const rejected=new Map([[invalidHash,{block:{hash:invalidHash},votes:['preserve-evidence']}]]),valid=new Map(),calls=[];
 const context={logger:{info(){}},BlockchainNodeStates:{SERVING:'SERVING'},StateVersions:{SEGMENT:'SEGMENT'},ConsensusUtil:{filterProposalFromVotes:()=>null},Consensus:{validateAndExecuteBlockOnDb(b,n){
  if(n.bp.hasSeenBlock(b.hash))return;
  calls.push(b.hash);
  if(b.bad)throw Error('invalid signature');
  if(b.parent&&!valid.has(b.parent))throw Error('missing parent');
  valid.set(b.hash,{block:b});
 }}};
 const merge=vm.runInNewContext('({'+source.slice(start,end)+'}).mergeChainSegment',context);
 const node={state:'SERVING',bc:{lastBlockNumber:()=>0,getValidBlocksInChainSegment:x=>x},bp:{hashToInvalidBlockInfo:rejected,hashToBlockInfo:valid,hasSeenBlock:h=>rejected.has(h)||valid.has(h),getLongestNotarizedChainHeight:()=>0},tryFinalizeChain(){}};
 return {run:blocks=>merge.call(node,blocks),rejected,valid,calls};
}
test('retry cached parent through full validator before processing descendant',()=>{const s=setup('parent');assert.equal(s.run([{hash:'parent',number:1},{hash:'child',number:2,parent:'parent'}]),0);assert.deepEqual(s.calls,['parent','child']);assert.equal(s.rejected.has('parent'),false);});
test('genuinely invalid block still fails and keeps rejection evidence',()=>{const s=setup('bad'),original=s.rejected.get('bad');assert.equal(s.run([{hash:'bad',number:1,bad:true}]),-1);assert.equal(s.rejected.get('bad'),original);assert.equal(s.valid.size,0);});
test('already validated blocks remain deduplicated',()=>{const s=setup('other');const b={hash:'valid',number:1};assert.equal(s.run([b]),0);assert.equal(s.run([b]),0);assert.deepEqual(s.calls,['valid']);});
