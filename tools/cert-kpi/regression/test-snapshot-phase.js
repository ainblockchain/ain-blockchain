const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const s=fs.readFileSync(process.argv[2],'utf8');
const method=s.slice(s.indexOf('  async updateSnapshots('),s.indexOf('  async writeSnapshot('));
const C=vm.runInNewContext(`(class { ${method} })`,{NodeConfigs:{SNAPSHOTS_INTERVAL_BLOCK_NUMBER:1000,MAX_NUM_SNAPSHOTS:10},logger:{error(e){throw Error(e)}}});
(async()=>{const phases=[];for(const a of Array.from({length:10},(_,i)=>({address:'0x'+(i+1).toString(16).padStart(8,'0')+'0'.repeat(32)}))){
 const c=new C();c.account=a;const written=[];const deleted=[];const pruned=[];
 c.writeSnapshot=async n=>written.push(n);c.deleteSnapshot=n=>{deleted.push(n);written.splice(written.indexOf(n),1);};
 const all=[];c.writeSnapshot=async n=>{written.push(n);all.push(n);return true;};
 c.listSnapshotNumbers=()=>[...written];c.pruneBlockHistory=async n=>pruned.push(n);
 for(let n=1;n<=12000;n++)await c.updateSnapshots(n);
 assert.equal(all.length,12);assert.equal(all[1]-all[0],1000);assert.equal(all[2]-all[1],1000);
 // Snapshot rotation keeps the newest MAX_NUM_SNAPSHOTS (10) = the same retention interval.
 assert.deepEqual(deleted,[all[0],all[1]]);assert.equal(written.length,10);
 assert.deepEqual(pruned,all);phases.push(all[0]);
}assert.equal(new Set(phases).size,10);console.log('PASS: ten distinct snapshot phases, unchanged frequency and retention interval');})().catch(e=>{console.error(e);process.exitCode=1});
