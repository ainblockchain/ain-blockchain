const { fork } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');
const assert = require('node:assert/strict');
const ObjectUtil = require('../../../common/object-util');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'm3-snapshot-test-'));
const filePath = path.join(directory, 'snapshot.json.gz');
const snapshot = { number: 1000, hash: 'proof', values: Array.from({length:10000}, (_,i)=>({index:i,value:'sample'})), radix: { foo: { bar: 17 } } };
function write(target) {
  return new Promise((resolve,reject)=>{
    const w = fork(path.resolve(__dirname,'../../../common/snapshot-writer.js'), [], {stdio:['ignore','ignore','ignore','ipc'],serialization:'advanced'});
    w.send({filePath:target,snapshot,chunkSize:10000,objectUtilPath:path.resolve(__dirname,'../../../common/object-util.js')});
    let ok=false;
    w.on('message',m=>ok=m.ok);
    w.on('error',reject);
    w.on('exit',code=>code===0&&ok ? resolve() : reject(Error('Worker failed')));
  });
}
(async()=>{
  let ticks=0;
  const timer=setInterval(()=>ticks++,10);
  try {
    await write(filePath);
    const data=JSON.parse(zlib.gunzipSync(fs.readFileSync(filePath)));
    assert.deepEqual(data.docs, ObjectUtil.toChunks(structuredClone(snapshot),10000));
    assert.deepEqual(ObjectUtil.fromChunks(data.docs),snapshot);
    assert.ok(ticks>0,'main event loop remains responsive');
    await assert.rejects(write(path.join(directory,'missing','snapshot.json.gz')));
    assert.deepEqual(fs.readdirSync(directory),['snapshot.json.gz']);
    console.log('PASS: snapshot round-trip, responsive main loop, failed writes leave no partial snapshot');
  } finally {clearInterval(timer);fs.rmSync(directory,{recursive:true,force:true});}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
