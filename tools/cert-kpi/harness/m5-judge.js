// M5 정답 판정 (m5-ainize.js · test/hitOf.test.js 공용)
// 규칙: 공백·마크다운 기호 제거, 천단위 콤마 제거 후 정답이 응답 안에 '경계가 분리된 토큰' 으로 나타나야 한다.
//   경계 위반 =
//     (a) 인접 문자가 영숫자 ('35203', 'abc352')
//     (b) 숫자 구분자(. , -)가 숫자와 이어져 더 긴 수를 이루는 경우 ('352.7', '0.352', '1,352,000', '12-352', '-352')
//     (c) 정답 가장자리가 한글이고 인접 문자도 한글인데 조사·서술어가 아닌 경우 ('김준' vs '김준호', '홍김준')
//         — 한국어는 조사가 붙어 쓰이므로('조원국입니다', '대표이사는김준') 조사·계사는 경계로 인정한다.
//   응답이 JSON 오브젝트(서버 에러 본문)면 항상 불일치.
const norm = x => String(x ?? '').replace(/\s+/g, '').replace(/[*_`]/g, '').replace(/(\d),(?=\d{3})/g, '$1');
const ALNUM = /[A-Za-z0-9]/, HANGUL = /[가-힣]/;
const PARTICLE_AFTER = /^(입니다|이다|임|은|는|이|가|을|를|의|과|와|로|으로|에서|에|도|이며|이고|이었|였|으로서|로서|입)/;
const PARTICLE_BEFORE = /[은는이가의과와로에서도,:(]$/;
function hitOf(content, answer) {
  if (typeof content !== 'string' || content.trim().startsWith('{')) return false;
  const c = norm(content), a = norm(answer);
  if (!a) return false;
  const startHangul = HANGUL.test(a[0]), endHangul = HANGUL.test(a[a.length - 1]);
  let from = 0;
  while (true) {
    const i = c.indexOf(a, from);
    if (i < 0) return false;
    const before = i > 0 ? c[i - 1] : '', before2 = i > 1 ? c[i - 2] : '';
    const after = c[i + a.length] || '', after2 = c[i + a.length + 1] || '';
    const badBefore = ALNUM.test(before)
      || (/[.,\-]/.test(before) && (/[0-9]/.test(before2) || (before === '-' && /^[0-9]/.test(a))))
      || (HANGUL.test(before) && startHangul && !PARTICLE_BEFORE.test(before));
    const badAfter = ALNUM.test(after)
      || (/[.,\-]/.test(after) && /[0-9]/.test(after2))
      || (HANGUL.test(after) && endHangul && !PARTICLE_AFTER.test(c.slice(i + a.length, i + a.length + 4)));
    if (!badBefore && !badAfter) return true;
    from = i + 1;
  }
}
module.exports = { norm, hitOf };
