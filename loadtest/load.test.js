const chai = require('chai');
const PROJECT_ROOT = require('path').dirname(__filename) + "/../" 
const expect = chai.expect
const LOAD_SCRIPT = PROJECT_ROOT + "load_tester.sh"
const shell = require('shelljs');

describe('Load Test', () => {

  it('gives return code of 0', () => {
    expect(shell.exec(`sh ${LOAD_SCRIPT}`).code).to.equal(0)
  }).timeout(200000)
})
