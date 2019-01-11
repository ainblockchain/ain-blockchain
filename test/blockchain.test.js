const Blockchain = require('../blockchain/index');
const Block = require('../blockchain/block')
const chai = require('chai');
const expect = chai.expect;
const rimraf = require("rimraf");
const assert = chai.assert;
const sleep = require("system-sleep")

describe('Blockchain', () => {
    let bc, bc2;

    beforeEach(() => {
        bc = new Blockchain("first-blockchain");
        bc2 = new Blockchain("second-blockchain");
    });

    afterEach(() => {
        rimraf.sync(bc._blockchainDir());
        rimraf.sync(bc2._blockchainDir());
    });


    it('starts with genesis block', () => {
        assert.deepEqual(bc.chain[0], Block.genesis())
    });

    it('adds new block', () => {
        const data = 'foo';
        bc.addBlock(data);
        expect(bc.chain[bc.chain.length -1].data).to.equal(data);
    });

    it('validates a valid chain', () => {
        bc2.addBlock('foo');
        expect(Blockchain.isValidChain(bc2.chain)).to.equal(true)
    });

    it('invalidates chain with corrupt genesis block', () => {
        bc2.chain[0].data = ':(';
        expect(Blockchain.isValidChain(bc2.chain)).to.equal(false)
    });

    it('invalidates corrupt chain', () => {
        bc2.addBlock('foo')
        bc2.chain[bc2.chain.length -1].data = "not foo"
        expect(Blockchain.isValidChain(bc2.chain)).to.equal(false)
    });

    it('replaces chain with valid chain', () => {
        bc2.addBlock('goo');
        bc.replaceChain(bc2.chain);
        expect(bc.chain).to.equal(bc2.chain);
    });

    it('does not replace chain with <= to chain', () => {
        bc.addBlock('foo');
        bc.replaceChain(bc2.chain);
        expect(bc.chain).not.to.equal(bc2.chain);
    })

    it("writes blocks to specified file", () => {
        bc.addBlock('foo')
        bc.addBlock([1,2,3,4])
        bc.addBlock({ref:123})
        sleep(500)
        assert.deepEqual(Blockchain.loadChain(bc._blockchainDir()), bc.chain)
    })
})
