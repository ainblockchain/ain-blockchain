const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const s=fs.readFileSync(process.argv[2],'utf8');
const method=s.slice(s.indexOf('  async updateSnapshots('),s.indexOf('  async writeSnapshot('));
const C=vm.runInNewContext(`(class { ${method} })`,{NodeConfigs:{SNAPSHOTS_INTERVAL_BLOCK_NUMBER:1000,MAX_NUM_SNAPSHOTS:10}});
(async()=>{const phases=[];for(const a of Array.from({length:10},(_,i)=>({address:'0x'+(i+1).toString(16).padStart(8,'0')+'0'.repeat(32)}))){
 const c=new C();c.account=a;const written=[];const deleted=[];c.writeSnapshot=async n=>written.push(n);c.deleteSnapshot=n=>deleted.push(n);
 for(let n=1;n<=3000;n++)await c.updateSnapshots(n);
 assert.equal(written.length,3);assert.equal(written[1]-written[0],1000);assert.equal(written[2]-written[1],1000);
 assert.equal(deleted[0],written[0]-10000);phases.push(written[0]);
}assert.equal(new Set(phases).size,10);console.log('PASS: ten distinct snapshot phases, unchanged frequency and retention interval');})().catch(e=>{console.error(e);process.exitCode=1});
