const ChainUtil = require('../chain-util');
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;

describe("ChainUtil", () => {
  describe("numberOfZero", () => {
    it("when non-numeric input", () => {
      expect(ChainUtil.numberOrZero(null)).to.equal(0);
      expect(ChainUtil.numberOrZero(undefined)).to.equal(0);
      expect(ChainUtil.numberOrZero(Infinity)).to.equal(0);
      expect(ChainUtil.numberOrZero(NaN)).to.equal(0);
      expect(ChainUtil.numberOrZero(true)).to.equal(0);
      expect(ChainUtil.numberOrZero(false)).to.equal(0);
      expect(ChainUtil.numberOrZero('')).to.equal(0);
      expect(ChainUtil.numberOrZero('abc')).to.equal(0);
      expect(ChainUtil.numberOrZero({})).to.equal(0);
      expect(ChainUtil.numberOrZero({a: 'A'})).to.equal(0);
      expect(ChainUtil.numberOrZero([])).to.equal(0);
      expect(ChainUtil.numberOrZero([10])).to.equal(0);
    })

    it("when numeric input", () => {
      expect(ChainUtil.numberOrZero(0)).to.equal(0);
      expect(ChainUtil.numberOrZero(10)).to.equal(10);
      expect(ChainUtil.numberOrZero(-1)).to.equal(-1);
      expect(ChainUtil.numberOrZero(15.5)).to.equal(15.5);
    })
  })

  describe("toString", () => {
    it("when normal input", () => {
      expect(ChainUtil.toString(true)).to.equal('true');
      expect(ChainUtil.toString(false)).to.equal('false');
      expect(ChainUtil.toString(0)).to.equal('0');
      expect(ChainUtil.toString(100)).to.equal('100');
      expect(ChainUtil.toString(-100)).to.equal('-100');
      expect(ChainUtil.toString(10.19)).to.equal('10.19');
      expect(ChainUtil.toString(-10.19)).to.equal('-10.19');
      expect(ChainUtil.toString('')).to.equal('');
      expect(ChainUtil.toString('!@#$%^&*()_+')).to.equal('!@#$%^&*()_+');
      expect(ChainUtil.toString([])).to.equal('[]');
      expect(ChainUtil.toString([true, 10, 'abc'])).to.equal('[true,10,"abc"]');
      expect(ChainUtil.toString({})).to.equal('{}');
      expect(ChainUtil.toString({
        bool: true,
        num: 10,
        str: 'abc',
        obj: {
          nil: null,
          undef: undefined,
          inf: Infinity,
          nan: NaN,
        }
      })).to.equal('{"bool":true,"num":10,"str":"abc","obj":{"nil":null,"inf":null,"nan":null}}');
      expect(ChainUtil.toString(null)).to.equal('null');
      expect(ChainUtil.toString(undefined)).to.equal('');
      expect(ChainUtil.toString(Infinity)).to.equal('null');
      expect(ChainUtil.toString(NaN)).to.equal('null');
    })
  })

  describe("parsePath", () => {
    it("when abnormal input", () => {
      assert.deepEqual(ChainUtil.parsePath('//a/b/c'), ['a', 'b', 'c']);
      assert.deepEqual(ChainUtil.parsePath('/a//b/c'), ['a', 'b', 'c']);
      assert.deepEqual(ChainUtil.parsePath('/a/b/c//'), ['a', 'b', 'c']);
    })

    it("when normal input", () => {
      assert.deepEqual(ChainUtil.parsePath('/a/b/c'), ['a', 'b', 'c']);
      assert.deepEqual(ChainUtil.parsePath('a/b/c'), ['a', 'b', 'c']);
      assert.deepEqual(ChainUtil.parsePath('a/b/c/'), ['a', 'b', 'c']);
    })
  })

  describe("formatPath", () => {
    it("when abnormal input", () => {
      assert.deepEqual(ChainUtil.formatPath([null]), '/null');
      assert.deepEqual(ChainUtil.formatPath([undefined]), '/undefined');
      assert.deepEqual(ChainUtil.formatPath([Infinity]), '/null');
      assert.deepEqual(ChainUtil.formatPath([NaN]), '/null');
      assert.deepEqual(ChainUtil.formatPath([true]), '/true');
      assert.deepEqual(ChainUtil.formatPath([false]), '/false');
      assert.deepEqual(ChainUtil.formatPath([0]), '/0');
      assert.deepEqual(ChainUtil.formatPath(['']), '/');
      assert.deepEqual(ChainUtil.formatPath(['', '', '']), '///');
      assert.deepEqual(ChainUtil.formatPath([{}]), '/{}');
      assert.deepEqual(ChainUtil.formatPath([{a: 'A'}]), '/{"a":"A"}');
      assert.deepEqual(ChainUtil.formatPath([[]]), '/[]');
      assert.deepEqual(ChainUtil.formatPath([['a']]), '/["a"]');
    })

    it("when normal input", () => {
      assert.deepEqual(ChainUtil.formatPath(['a', 'b', 'c']), '/a/b/c');
    })
  })

  describe("appendPath", () => {
    it("when one input", () => {
      assert.deepEqual(ChainUtil.appendPath('/a/b/c'), '/a/b/c');
    })

    it("when two inputs", () => {
      assert.deepEqual(ChainUtil.appendPath('/a/b/c', '/d/e/f'), '/a/b/c/d/e/f');
      assert.deepEqual(ChainUtil.appendPath('a/b/c', '/d/e/f'), '/a/b/c/d/e/f');
      assert.deepEqual(ChainUtil.appendPath('/a/b/c', 'd/e/f'), '/a/b/c/d/e/f');
      assert.deepEqual(ChainUtil.appendPath('a/b/c', 'd/e/f'), '/a/b/c/d/e/f');
      assert.deepEqual(ChainUtil.appendPath('/a/b/c', '/'), '/a/b/c');
      assert.deepEqual(ChainUtil.appendPath('/a/b/c', '//'), '/a/b/c');
      assert.deepEqual(ChainUtil.appendPath('/a/b/c/', '/d/e/f'), '/a/b/c/d/e/f');
      assert.deepEqual(ChainUtil.appendPath('/a/b/c//', '/d/e/f'), '/a/b/c/d/e/f');
    })

    it("when more than two inputs", () => {
      assert.deepEqual(ChainUtil.appendPath('/a/b/c', '/d/e/f', '/g/h/i'), '/a/b/c/d/e/f/g/h/i');
      assert.deepEqual(ChainUtil.appendPath('a/b', 'c/d', 'e/f', 'g/h'), '/a/b/c/d/e/f/g/h');
    })
  })

  describe("getJsObject", () => {
    let obj;

    beforeEach(() => {
      obj = {
        a: {
          aa: '/a/aa',
          ab: true,
          ac: 10,
          ad: [],
        },
        b: {
          ba: '/b/ba'
        }
      };
    })

    it("when abnormal path", () => {
      assert.deepEqual(ChainUtil.getJsObject(obj, null), null);
      assert.deepEqual(ChainUtil.getJsObject(obj, undefined), null);
      assert.deepEqual(ChainUtil.getJsObject(obj, true), null);
      assert.deepEqual(ChainUtil.getJsObject(obj, 0), null);
      assert.deepEqual(ChainUtil.getJsObject(obj, ''), null);
      assert.deepEqual(ChainUtil.getJsObject(obj, {}), null);
    })

    it("when non-existing path", () => {
      assert.deepEqual(ChainUtil.getJsObject(obj, ['z']), null);
      assert.deepEqual(ChainUtil.getJsObject(obj, ['a', 'az']), null);
      assert.deepEqual(ChainUtil.getJsObject(obj, ['a', 'aa', 'aaz']), null);
      assert.deepEqual(ChainUtil.getJsObject(obj, ['a', 'ab', 'abz']), null);
      assert.deepEqual(ChainUtil.getJsObject(obj, ['a', 'ac', 'acz']), null);
      assert.deepEqual(ChainUtil.getJsObject(obj, ['a', 'ad', 'adz']), null);
      assert.deepEqual(ChainUtil.getJsObject(obj, ['b', 'bz']), null);
      assert.deepEqual(ChainUtil.getJsObject(obj, ['b', 'ba', 'baz']), null);
    })

    it("when existing path", () => {
      assert.deepEqual(ChainUtil.getJsObject(obj, []), obj);
      assert.deepEqual(ChainUtil.getJsObject(obj, ['a']), obj.a);
      assert.deepEqual(ChainUtil.getJsObject(obj, ['a', 'aa']), obj.a.aa);
      assert.deepEqual(ChainUtil.getJsObject(obj, ['a', 'ab']), obj.a.ab);
      assert.deepEqual(ChainUtil.getJsObject(obj, ['a', 'ac']), obj.a.ac);
      assert.deepEqual(ChainUtil.getJsObject(obj, ['a', 'ad']), obj.a.ad);
      assert.deepEqual(ChainUtil.getJsObject(obj, ['b']), obj.b);
      assert.deepEqual(ChainUtil.getJsObject(obj, ['b', 'ba']), obj.b.ba);
    })
  })

  describe("setJsObject", () => {
    const org = {
      a: {
        aa: '/a/aa',
        ab: true,
        ac: 10,
        ad: [],
      },
      b: {
        ba: '/b/ba'
      }
    };
    const value = {
      some: 'value'
    };
    let obj;

    beforeEach(() => {
      obj = JSON.parse(JSON.stringify(org));
    })

    it("when abnormal path", () => {
      expect(ChainUtil.setJsObject(obj, null, null)).to.equal(false);
      assert.deepEqual(obj, org);
      expect(ChainUtil.setJsObject(obj, undefined, null)).to.equal(false);
      assert.deepEqual(obj, org);
      expect(ChainUtil.setJsObject(obj, true, null)).to.equal(false);
      assert.deepEqual(obj, org);
      expect(ChainUtil.setJsObject(obj, 0, null)).to.equal(false);
      assert.deepEqual(obj, org);
      expect(ChainUtil.setJsObject(obj, '', null)).to.equal(false);
      assert.deepEqual(obj, org);
      expect(ChainUtil.setJsObject(obj, {}, null)).to.equal(false);
      assert.deepEqual(obj, org);
    })

    it("when non-existing path", () => {
      expect(ChainUtil.setJsObject(obj, ['z'], value)).to.equal(true);
      assert.deepEqual(obj.z, value);
      expect(ChainUtil.setJsObject(obj, ['a', 'az'], value)).to.equal(true);
      assert.deepEqual(obj.a.az, value);
      expect(ChainUtil.setJsObject(obj, ['a', 'aa', 'aaz'], value)).to.equal(true);
      assert.deepEqual(obj.a.aa.aaz, value);
      expect(ChainUtil.setJsObject(obj, ['a', 'ab', 'abz'], value)).to.equal(true);
      assert.deepEqual(obj.a.ab.abz, value);
      expect(ChainUtil.setJsObject(obj, ['a', 'ac', 'acz'], value)).to.equal(true);
      assert.deepEqual(obj.a.ac.acz, value);
      expect(ChainUtil.setJsObject(obj, ['a', 'ad', 'adz'], value)).to.equal(true);
      assert.deepEqual(obj.a.ad.adz, value);
      expect(ChainUtil.setJsObject(obj, ['b', 'bz'], value)).to.equal(true);
      assert.deepEqual(obj.b.bz, value);
      expect(ChainUtil.setJsObject(obj, ['b', 'ba', 'baz'], value)).to.equal(true);
      assert.deepEqual(obj.b.ba.baz, value);
    })

    it("when empty path", () => {
      expect(ChainUtil.setJsObject(obj, [], value)).to.equal(false);
      assert.deepEqual(obj, org);  // No change.
    })

    it("when existing path", () => {
      expect(ChainUtil.setJsObject(obj, ['a'], value)).to.equal(true);
      assert.deepEqual(obj.a, value);
      expect(ChainUtil.setJsObject(obj, ['a', 'aa'], value)).to.equal(true);
      assert.deepEqual(obj.a.aa, value);
      expect(ChainUtil.setJsObject(obj, ['a', 'ab'], value)).to.equal(true);
      assert.deepEqual(obj.a.ab, value);
      expect(ChainUtil.setJsObject(obj, ['a', 'ac'], value)).to.equal(true);
      assert.deepEqual(obj.a.ac, value);
      expect(ChainUtil.setJsObject(obj, ['a', 'ad'], value)).to.equal(true);
      assert.deepEqual(obj.a.ad, value);
      expect(ChainUtil.setJsObject(obj, ['b'], value)).to.equal(true);
      assert.deepEqual(obj.b, value);
      expect(ChainUtil.setJsObject(obj, ['b', 'ba'], value)).to.equal(true);
      assert.deepEqual(obj.b.ba, value);
    })
  })
})