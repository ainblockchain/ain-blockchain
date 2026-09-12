// node test/hitOf.test.js — M5 정답 판정 단위 테스트
const assert = require('assert');
const { hitOf } = require('../m5-judge');
const cases = [
  ['352', '1,352,000', false], ['352', ' 35203 ', false], ['352', '352.7', false], ['352', '0.352', false], ['352', '-352', false],
  ['352', '(352)', true], ['352', ' 352', true], ['352', '값은 352.', true], ['352', '업종코드는 352입니다', true],
  ['1,200억원', '약 1,200억원 입니다', true], ['1,200억원', '약 1200억원', true],
  ['조원국', '**조원국**입니다', true], ['김준', '김준호입니다', false], ['김준', '홍김준입니다', false], ['김준', '대표이사는 김준입니다', true], ['김준, 김담', '대표이사는 김준, 김담 입니다', true],
  ['서울특별시 영등포구 영중로 15', '주소는 서울특별시 영등포구 영중로 15 (영등포동)입니다', true], ['12월', '결산월: 12월', true],
  ['6018108008', ' 60181080083', false], ['4.337', '부채비율은 4.337% 입니다', true], ['4.337', '14.337', false], ['4.337', '4.3371', false],
  ['2024-03-15', '접수일 2024-03-15.', true], ['2024-03-15', '2024-03-15-1', false],
  ['3', '{"error":3}', false], ['www.kyungbang.co.kr', ' www.kyungbang.co.kr', true], ['12월', '결산월은 12월입니다', true], ['12월', '112월', false],
  ['', 'anything', false], ['abc', null, false],
];
let bad = 0;
for (const [a, g, e] of cases) { const r = hitOf(g, a); if (r !== e) { bad++; console.log('FAIL', JSON.stringify(a), JSON.stringify(g), 'got', r, 'expected', e); } }
assert.strictEqual(bad, 0, `${bad} failing cases`);
console.log(`hitOf: ${cases.length} cases ok`);
