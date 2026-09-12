# DART OpenAPI 타입 100종 → Ainize teach 데이터셋(jsonl) 100개 생성
#   타입 1개 = 데이터셋 1개 (지표 6) = 학습 후 지식 패치 1개 = 모델 1종 (지표 5)
#   각 데이터셋: {prompt, answer, alt_prompt, note} × FACTS 행 (기본 8) — 질문은 회사·연도·필드로 유일하게
# 실행: python3 dart-build-datasets.py [FACTS]   (키: harness/.env.dart 의 DART_API_KEY)
import json, os, re, sys, time, zipfile, io, urllib.request, urllib.parse
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = f'{HERE}/dart-datasets'
CACHE = os.environ.get('DART_CACHE', os.path.join(os.environ.get('KPI_DIR', f'{HERE}/..'), 'tmp', 'dart-cache'))
KRX_JSON = os.environ.get('KRX_JSON', os.path.join(os.environ.get('RUNTIME_REPO', '/work'), 'data', 'krx.json'))
os.makedirs(OUT, exist_ok=True); os.makedirs(CACHE, exist_ok=True)
FACTS = int(sys.argv[1]) if len(sys.argv) > 1 else 8
def load_api_key():
    if os.environ.get('DART_API_KEY'):
        return os.environ['DART_API_KEY']
    for filename in ['.env', '.env.dart']:
        env_path = os.path.join(HERE, filename)
        if not os.path.exists(env_path):
            continue
        with open(env_path, encoding='utf-8') as source:
            for line in source:
                key, separator, value = line.strip().partition('=')
                if separator and key == 'DART_API_KEY' and value.strip():
                    return value.strip().strip('\"\'')
    raise SystemExit('Set DART_API_KEY in the environment or harness/.env')

KEY = load_api_key()
API = 'https://opendart.fss.or.kr/api'
YEAR, RC = '2025', '11011'          # 2025 사업연도 사업보고서 (2026년 3월 제출) — 기반 모델 학습 이후 데이터
TODAY = '20260910'
calls = 0

def get(endpoint, **params):
    """GET {API}/{endpoint}.json — 디스크 캐시. 실패/무자료는 None."""
    global calls
    q = urllib.parse.urlencode({'crtfc_key': KEY, **params})
    ck = f"{CACHE}/{endpoint}_{re.sub(r'[^A-Za-z0-9]', '_', urllib.parse.urlencode(params))}.json"
    if os.path.exists(ck): return json.load(open(ck))
    for attempt in range(3):
        try:
            calls += 1
            with urllib.request.urlopen(f'{API}/{endpoint}.json?{q}', timeout=30) as r:
                d = json.loads(r.read().decode('utf-8'))
            break
        except Exception as e:
            d = {'status': 'ERR', 'message': str(e).replace(KEY, '[REDACTED]')}; time.sleep(2)
    json.dump(d, open(ck, 'w'), ensure_ascii=False)
    if d.get('status') == '020': raise SystemExit('DART API 한도 초과: ' + d.get('message', ''))
    return d

def rows(endpoint, **params):
    d = get(endpoint, **params)
    if not d or d.get('status') != '000': return []
    if 'list' in d: return d['list']
    if 'group' in d:   # DS006 증권신고서 / V2 보수: group[].list[] — 그룹 필드를 각 행에 병합
        out = []
        for g in d['group']:
            gf = {k: v for k, v in g.items() if k != 'list'}
            if g.get('list'):
                for r in g['list']: out.append({**gf, **r, '_group': g.get('title')})
            else: out.append({**gf, '_group': g.get('title')})
        return out
    return [d]

# ---------- 회사 목록: DART 고유번호(corpCode.xml) ∩ 상장사, 규모 큰 순(유가증권 우선) ----------
def corp_list():
    p = f'{CACHE}/corpCode.json'
    if os.path.exists(p): return json.load(open(p))
    with urllib.request.urlopen(f'{API}/corpCode.xml?crtfc_key={KEY}', timeout=60) as r: z = r.read()
    xml = zipfile.ZipFile(io.BytesIO(z)).read('CORPCODE.xml')
    items = []
    for e in ET.fromstring(xml).iter('list'):
        sc = (e.findtext('stock_code') or '').strip()
        if re.fullmatch(r'\d{6}', sc):
            items.append({'corp_code': e.findtext('corp_code'), 'corp_name': e.findtext('corp_name').strip(), 'stock_code': sc})
    krx = {r['종목코드']: r for r in json.load(open(KRX_JSON))}
    for it in items:
        k = krx.get(it['stock_code'], {}); it['market'] = k.get('시장구분', ''); it['industry'] = k.get('업종', '')
    # 유가증권(코스피) 먼저, 그 다음 코스닥; 각 내부는 KRX 목록 순서(최근 상장 → 오래된 상장 순이므로 뒤집어 대형·오래된 회사 우선)
    order = {r['종목코드']: i for i, r in enumerate(json.load(open(KRX_JSON)))}
    items.sort(key=lambda it: (0 if it['market'] == '유가' else 1 if it['market'] == '코스닥' else 2, -order.get(it['stock_code'], -1)))
    json.dump(items, open(p, 'w'), ensure_ascii=False)
    return items

CORPS = corp_list()
BIG = [c for c in CORPS if c['market'] == '유가'][:400] + [c for c in CORPS if c['market'] == '코스닥'][:400]
corp_name_of = {c['corp_code']: c['corp_name'] for c in CORPS}
_krx = {r['종목코드']: r for r in json.load(open(KRX_JSON))}
# 희소 타입용 후보군: 최근 상장사(공모·사모자금 사용내역), 금융업(신종·조건부자본증권, 채무증권)
RECENT = sorted([c for c in CORPS if _krx.get(c['stock_code'], {}).get('상장일', '') >= '2024-01-01'],
                key=lambda c: _krx[c['stock_code']]['상장일'], reverse=True)
FINANCIAL = [c for c in CORPS if re.search(r'은행|금융|보험|증권|지주|캐피탈|카드', c['industry'] + c['corp_name'])]
CANDS = {'recent': RECENT + BIG, 'financial': FINANCIAL + BIG, None: BIG}

def clean_name(n):
    return re.sub(r'^\(주\)|\(주\)$|^주식회사\s*|\s*주식회사$|㈜', '', n or '').strip()

def money(v):
    """'247,684,612,000,000' → '2,476,846억원' (원 단위 금액을 억원으로 반올림). 억 미만은 '만원' 단위."""
    s = str(v).replace(',', '').strip()
    if not re.fullmatch(r'-?\d+', s): return None
    n = int(s)
    if abs(n) >= 10**8: return f'{round(n / 10**8):,}억원'
    if abs(n) >= 10**4: return f'{round(n / 10**4):,}만원'
    return f'{n:,}원'

def val(r, k, kind='text'):
    v = r.get(k)
    if v is None: return None
    v = str(v).strip()
    if v in ('', '-', 'null', 'None', '해당사항없음', '해당사항 없음', '0', '0.0', '0.00', '-0'): return None
    if kind == 'money': return money(v)
    if kind == 'date':
        m = re.search(r'(\d{4})\D{0,2}(\d{2})\D{0,2}(\d{2})', v)
        return f'{m.group(1)}-{m.group(2)}-{m.group(3)}' if m else None
    if kind == 'num': return v if re.fullmatch(r'-?[\d,]+(\.\d+)?', v) else None
    v = re.sub(r'\s+', ' ', v)
    # probe/검증이 16토큰까지만 생성하므로 답은 짧게: 최대 4어절, 18자 (긴 주소·기관명은 앞부분만)
    words = v.split(' ')
    while len(words) > 1 and (len(words) > 4 or len(' '.join(words)) > 18): words.pop()
    v = ' '.join(words).rstrip(',(')
    return v if 0 < len(v) <= 24 else None

# ---------- 타입 정의 ----------
# kind: company | corpcode | disclosure | report | fs | idx | taxonomy | event | secreg
TYPES = []
def T(**kw): TYPES.append(kw)

# 1) 기업개황 (company.json) — 필드별 10종
for k, desc, kind in [('ceo_nm', '대표자명', 'text'), ('adres', '본점 주소', 'text'), ('phn_no', '대표 전화번호', 'text'),
                      ('est_dt', '설립일', 'date'), ('acc_mt', '결산월', 'text'), ('jurir_no', '법인등록번호', 'text'),
                      ('bizr_no', '사업자등록번호', 'text'), ('hm_url', '홈페이지 주소', 'text'), ('induty_code', '업종코드', 'text'),
                      ('corp_name_eng', '영문 회사명', 'text')]:
    T(id=f'company_{k}', title=f'기업개황 · {desc}', api='company', kind='company', field=k, desc=desc, vkind=kind)
# 2) 고유번호
T(id='corpcode', title='고유번호 · DART 고유번호', api='corpCode', kind='corpcode', desc='DART 고유번호(corp_code)')
# 3) 공시검색: 2025 사업보고서 접수일자
T(id='disclosure_annual_rcept', title='공시검색 · 사업보고서 접수일자', api='list', kind='disclosure', desc='2025 사업연도 사업보고서의 DART 접수일자')

# 4) 정기보고서 주요정보 (DS002) — corp_code + bsns_year + reprt_code
def R(id, api, title, desc, a, akind='text', where=None, key=None, keydesc=None, cands=None, year=None, rc=None):
    T(id=id, api=api, kind='report', title=title, desc=desc, a=a, akind=akind, where=where or {}, key=key, keydesc=keydesc, cands=cands, year=year or YEAR, rc=rc or RC)
R('stock_total', 'stockTotqySttus', '주식의 총수 현황', '발행주식의 총수(보통주)', 'istc_totqy', 'num', where={'se': r'보통주'})
R('treasury_stock', 'tesstkAcqsDspsSttus', '자기주식 취득 및 처분 현황', '자기주식 기말 수량', 'trmend_qy', 'num')
R('dividend_cash_per_share', 'alotMatter', '배당에 관한 사항 · 주당 현금배당금', '주당 현금배당금(원, 보통주)', 'thstrm', 'num', where={'se': r'주당 현금배당금', 'stock_knd': r'보통주'})
R('dividend_payout', 'alotMatter', '배당에 관한 사항 · 현금배당성향', '(연결)현금배당성향(%)', 'thstrm', 'num', where={'se': r'현금배당성향'})
R('capital_change', 'irdsSttus', '증자(감자) 현황', '가장 최근 주식발행(감소) 형태', 'isu_dcrs_stle', 'text', key='isu_dcrs_de', keydesc='일자')
R('debt_issue', 'detScritsIsuAcmslt', '채무증권 발행실적', '채무증권 발행 이자율(%)', 'intrt', 'num', key='isu_de', keydesc='발행일')
R('cp_balance', 'entrprsBilScritsNrdmpBlce', '기업어음증권 미상환 잔액', '기업어음증권 미상환 잔액 합계', 'sm', 'money', cands='financial')
R('stb_balance', 'srtpdPsndbtNrdmpBlce', '단기사채 미상환 잔액', '단기사채 미상환 잔액 합계', 'sm', 'money', cands='financial')
R('bond_balance', 'cprndNrdmpBlce', '회사채 미상환 잔액', '회사채 미상환 잔액 합계', 'sm', 'money')
R('hybrid_balance', 'newCaplScritsNrdmpBlce', '신종자본증권 미상환 잔액', '신종자본증권 미상환 잔액 합계', 'sm', 'money', cands='financial')
R('coco_balance', 'cndlCaplScritsNrdmpBlce', '조건부 자본증권 미상환 잔액', '조건부 자본증권 미상환 잔액 합계', 'sm', 'money', cands='financial')
R('public_fund_use', 'pssrpCptalUseDtls', '공모자금의 사용내역', '증권신고서상 조달금액', 'rs_cptal_use_plan_prcure_amount', 'money', key='rs_cptal_use_plan_useprps', keydesc='공모자금 사용용도', cands='recent')
R('private_fund_use', 'prvsrpCptalUseDtls', '사모자금의 사용내역', '주요사항보고서상 조달금액', 'mtrpt_cptal_use_plan_prcure_amount', 'money', key='mtrpt_cptal_use_plan_useprps', keydesc='사모자금 사용용도', cands='recent')
R('auditor', 'accnutAdtorNmNdAdtOpinion', '회계감사인의 명칭 및 감사의견', '외부 감사인(회계법인)', 'adtor', 'text', where={'bsns_year': YEAR})
R('audit_opinion', 'accnutAdtorNmNdAdtOpinion', '회계감사인의 감사의견', '감사의견', 'adt_opinion', 'text', where={'bsns_year': YEAR})
R('audit_fee', 'adtServcCnclsSttus', '감사용역체결현황', '감사계약 보수', 'adt_cntrct_dtls_mendng', 'money', where={'bsns_year': YEAR})
R('non_audit_service', 'accnutAdtorNonAdtServcCnclsSttus', '비감사용역 계약체결 현황', '비감사용역 내용', 'servc_cn', 'text', key='cntrct_cncls_de', keydesc='계약체결일')
R('outside_directors', 'outcmpnyDrctrNdChangeSttus', '독립(사외)이사 및 그 변동현황', '독립(사외)이사 수', 'otcmp_drctr_co', 'num')
R('largest_shareholder', 'hyslrSttus', '최대주주 현황 · 최대주주', '최대주주 성명(법인명)', 'nm', 'text', where={'relate': r'본인'})
R('largest_shareholder_ratio', 'hyslrSttus', '최대주주 현황 · 지분율', '최대주주 기말 지분율(%)', 'trmend_posesn_stock_qota_rt', 'num', where={'relate': r'본인'})
R('largest_shareholder_change', 'hyslrChgSttus', '최대주주 변동현황', '최대주주 변동 원인', 'change_cause', 'text', key='change_on', keydesc='변동일')
R('minority_shareholders', 'mrhlSttus', '소액주주 현황', '소액주주 수', 'shrholdr_co', 'num')
R('executives', 'exctvSttus', '임원 현황', '직위', 'ofcps', 'text', key='nm', keydesc='임원')
R('employees', 'empSttus', '직원 현황 · 직원 수', '직원 수 합계', 'sm', 'num', where={'sexdstn': r'남'})
R('employee_avg_salary', 'empSttus', '직원 현황 · 1인평균 급여', '직원 1인평균 급여액', 'jan_salary_am', 'money', where={'sexdstn': r'남'})
R('unregistered_exec_pay', 'unrstExctvMendngSttus', '미등기임원 보수현황', '미등기임원 1인평균 급여액', 'jan_salary_am', 'money')
R('director_pay_approved', 'drctrAdtAllMendngSttusGmtsckConfmAmount', '이사·감사 보수 주주총회 승인금액', '주주총회 승인금액', 'gmtsck_confm_amount', 'money', where={'se': r'이사'})
R('director_pay_total', 'hmvAuditAllSttus', '이사·감사 전체 보수총액', '이사·감사 보수 총액', 'mendng_totamt', 'money')
R('director_pay_by_type', 'drctrAdtAllMendngSttusMendngPymntamtTyCl', '이사·감사 보수 유형별', '1인당 평균보수액', 'psn1_avrg_pymntamt', 'money', key='se', keydesc='유형')
R('exec_pay_individual', 'hmvAuditIndvdlBySttus', '이사·감사 개인별 보수(5억 이상)', '보수 총액', 'mendng_totamt', 'money', key='nm', keydesc='이사·감사')
R('exec_pay_individual_v2', 'hmvAuditIndvdlBySttusV2', '이사·감사 개인별 보수(5억 이상, Ver 2.0)', '보수 총액', 'mendng_totamt', 'money', key='nm', keydesc='이사·감사', year='2026', rc='11012')
R('top5_pay', 'indvdlByPay', '개인별 보수지급 금액(5억 이상 상위 5인)', '보수 총액', 'mendng_totamt', 'money', key='nm', keydesc='임직원')
R('top5_pay_v2', 'indvdlByPayV2', '개인별 보수지급 금액(상위 5인, Ver 2.0)', '보수 총액', 'mendng_totamt', 'money', key='nm', keydesc='임직원', year='2026', rc='11012')
R('investments_other', 'otrCprInvstmntSttus', '타법인 출자현황', '기말 지분율(%)', 'trmend_blce_qota_rt', 'num', key='inv_prm', keydesc='출자 법인')

# 5) 재무정보 (DS003)
for acc, id_ in [('매출액', 'fs_revenue'), ('영업이익', 'fs_operating_income'), ('당기순이익(손실)', 'fs_net_income'), ('자산총계', 'fs_total_assets'),
                 ('부채총계', 'fs_total_liabilities'), ('자본총계', 'fs_total_equity'), ('유동자산', 'fs_current_assets'),
                 ('유동부채', 'fs_current_liabilities'), ('비유동자산', 'fs_noncurrent_assets'), ('자본금', 'fs_capital_stock')]:
    T(id=id_, api='fnlttSinglAcnt', kind='fs', title=f'단일회사 주요계정 · {acc}', desc=f'연결재무제표 {acc}(2025 사업연도)', account=acc)
T(id='fs_multi_revenue', api='fnlttMultiAcnt', kind='fs', title='다중회사 주요계정 · 매출액', desc='연결재무제표 매출액(다중회사 조회, 2025 사업연도)', account='매출액', multi=True)
T(id='fs_all_cashflow', api='fnlttSinglAcntAll', kind='fs', title='단일회사 전체 재무제표 · 영업활동현금흐름', desc='연결 현금흐름표 영업활동현금흐름(2025 사업연도)', account='영업활동현금흐름', all=True)
T(id='xbrl_taxonomy', api='xbrlTaxonomy', kind='taxonomy', title='XBRL 택사노미 재무제표양식', desc='XBRL 표준계정과목 한글명')
for code, name, idx, id_ in [('M210000', '수익성지표', '순이익률', 'idx_net_margin'), ('M220000', '안정성지표', '부채비율', 'idx_debt_ratio'),
                             ('M230000', '성장성지표', '매출액증가율(YoY)', 'idx_revenue_growth'), ('M240000', '활동성지표', '총자산회전율', 'idx_asset_turnover')]:
    T(id=id_, api='fnlttSinglIndx', kind='idx', title=f'단일회사 주요 재무지표 · {name} {idx}', desc=f'{name} {idx}(%)', cl=code, idx=idx)
T(id='idx_multi_roe', api='fnlttCmpnyIndx', kind='idx', title='다중회사 주요 재무지표 · ROE', desc='수익성지표 ROE(%)', cl='M210000', idx='ROE', multi=True)

# 6) 지분공시 (DS004)
T(id='major_holder', api='majorstock', kind='report_noyear', title='대량보유 상황보고', desc='대량보유 보고자의 보유비율(%)', a='stkrt', akind='num', key='repror', keydesc='보고자', datekey='rcept_dt')
T(id='insider_holding', api='elestock', kind='report_noyear', title='임원ㆍ주요주주 소유보고', desc='특정증권 등 소유 수(주)', a='sp_stock_lmp_cnt', akind='num', key='repror', keydesc='보고자', datekey='rcept_dt')

# 7) 주요사항보고서 (DS005) — 공시검색(pblntf_ty=B)으로 보고서명 매칭 → corp 별 상세 호출
def E(id, api, title, name_re, desc, a, akind='text', since='20250101'):
    T(id=id, api=api, kind='event', title=title, name_re=name_re, desc=desc, a=a, akind=akind, since=since, pty='B')
E('asset_transfer_putback', 'astInhtrfEtcPtbkOpt', '자산양수도(기타), 풋백옵션', r'자산양수도|풋백옵션', '자산양수·도 가액', 'ast_inhtrf_prc', 'money')
E('default_occurrence', 'dfOcr', '부도발생', r'부도발생', '부도금액', 'df_amt', 'money', since='20180101')
E('business_suspension', 'bsnSp', '영업정지', r'영업정지', '영업정지 분야', 'bsnsp_rm', 'text', since='20180101')
E('rehabilitation', 'ctrcvsBgrq', '회생절차 개시신청', r'회생절차', '관할법원', 'cpct', 'text', since='20220101')
E('dissolution', 'dsRsOcr', '해산사유 발생', r'해산사유', '해산사유 발생일', 'ds_rsd', 'date', since='20180101')
E('paid_in_capital_increase', 'piicDecsn', '유상증자 결정', r'유상증자결정', '신주의 수(보통주식)', 'nstk_ostk_cnt', 'num')
E('bonus_issue', 'fricDecsn', '무상증자 결정', r'무상증자결정', '1주당 신주배정 주식수(보통주)', 'nstk_ascnt_ps_ostk', 'num')
E('paid_bonus_issue', 'pifricDecsn', '유무상증자 결정', r'유무상증자결정', '유상증자 신주의 수(보통주식)', 'piic_nstk_ostk_cnt', 'num', since='20230101')
E('capital_reduction', 'crDecsn', '감자 결정', r'감자결정', '감자비율(보통주식, %)', 'cr_rt_ostk', 'num')
E('bank_management_start', 'bnkMngtPcbg', '채권은행 등의 관리절차 개시', r'관리절차개시', '관리기관', 'mngt_int', 'text', since='20180101')
E('lawsuit', 'lwstLg', '소송 등의 제기', r'소송등의제기', '관할법원', 'cpct', 'text')
E('overseas_listing_decision', 'ovLstDecsn', '해외 증권시장 주권등 상장 결정', r'해외증권시장주권등상장결정', '상장거래소(소재국가)', 'lstex_nt', 'text', since='20180101')
E('overseas_delisting_decision', 'ovDlstDecsn', '해외 증권시장 주권등 상장폐지 결정', r'해외증권시장주권등상장폐지결정', '상장거래소(소재국가)', 'lstex_nt', 'text', since='20150101')
E('overseas_listing', 'ovLst', '해외 증권시장 주권등 상장', r'해외증권시장주권등상장\)', '상장거래소(소재국가)', 'lstex_nt', 'text', since='20150101')
E('overseas_delisting', 'ovDlst', '해외 증권시장 주권등 상장폐지', r'해외증권시장주권등상장폐지\)', '매매거래종료일', 'tredd', 'date', since='20150101')
E('convertible_bond', 'cvbdIsDecsn', '전환사채권 발행결정', r'전환사채권발행결정', '사채의 권면총액', 'bd_fta', 'money')
E('bond_with_warrant', 'bdwtIsDecsn', '신주인수권부사채권 발행결정', r'신주인수권부사채권발행결정', '사채의 권면총액', 'bd_fta', 'money', since='20230101')
E('exchangeable_bond', 'exbdIsDecsn', '교환사채권 발행결정', r'교환사채권발행결정', '사채의 권면총액', 'bd_fta', 'money', since='20230101')
E('bank_management_stop', 'bnkMngtPcsp', '채권은행 등의 관리절차 중단', r'관리절차중단', '관리기관', 'mngt_int', 'text', since='20150101')
E('writedown_coco', 'wdCocobdIsDecsn', '상각형 조건부자본증권 발행결정', r'상각형조건부자본증권발행결정', '사채의 권면총액', 'bd_fta', 'money', since='20220101')
E('treasury_acquisition', 'tsstkAqDecsn', '자기주식 취득 결정', r'자기주식취득결정', '취득예정주식(보통주식, 주)', 'aqpln_stk_ostk', 'num')
E('treasury_disposal', 'tsstkDpDecsn', '자기주식 처분 결정', r'자기주식처분결정', '처분예정주식(보통주식, 주)', 'dppln_stk_ostk', 'num')
E('treasury_trust_contract', 'tsstkAqTrctrCnsDecsn', '자기주식취득 신탁계약 체결 결정', r'자기주식취득신탁계약체결결정', '계약금액', 'ctr_prc', 'money')
E('treasury_trust_cancel', 'tsstkAqTrctrCcDecsn', '자기주식취득 신탁계약 해지 결정', r'자기주식취득신탁계약해지결정', '해지 전 계약금액', 'ctr_prc_bfcc', 'money')
E('business_acquisition', 'bsnInhDecsn', '영업양수 결정', r'영업양수결정', '양수가액', 'inh_prc', 'money', since='20230101')
E('business_transfer', 'bsnTrfDecsn', '영업양도 결정', r'영업양도결정', '양도가액', 'trf_prc', 'money', since='20230101')
E('tangible_asset_acquisition', 'tgastInhDecsn', '유형자산 양수 결정', r'유형자산양수결정', '양수금액', 'inhdtl_inhprc', 'money', since='20230101')
E('tangible_asset_transfer', 'tgastTrfDecsn', '유형자산 양도 결정', r'유형자산양도결정', '양도금액', 'trfdtl_trfprc', 'money', since='20230101')
E('other_stock_acquisition', 'otcprStkInvscrInhDecsn', '타법인 주식 및 출자증권 양수결정', r'타법인주식및출자증권양수결정', '양수금액', 'inhdtl_inhprc', 'money')
E('other_stock_transfer', 'otcprStkInvscrTrfDecsn', '타법인 주식 및 출자증권 양도결정', r'타법인주식및출자증권양도결정', '양도금액', 'trfdtl_trfprc', 'money')
E('stock_bond_acquisition', 'stkrtbdInhDecsn', '주권 관련 사채권 양수 결정', r'주권관련사채권양수결정', '사채권 발행회사(회사명)', 'bdiscmp_cmpnm', 'text', since='20220101')
E('stock_bond_transfer', 'stkrtbdTrfDecsn', '주권 관련 사채권 양도 결정', r'주권관련사채권양도결정', '사채권 발행회사(회사명)', 'bdiscmp_cmpnm', 'text', since='20220101')
E('merger', 'cmpMgDecsn', '회사합병 결정', r'회사합병결정', '이사회결의일', 'bddd', 'date')
E('spinoff', 'cmpDvDecsn', '회사분할 결정', r'회사분할결정', '이사회결의일', 'bddd', 'date', since='20240101')
E('spinoff_merger', 'cmpDvmgDecsn', '회사분할합병 결정', r'회사분할합병결정|분할\(분할합병\)결정', '이사회결의일', 'bddd', 'date', since='20200101')
E('stock_exchange', 'stkExtrDecsn', '주식교환·이전 결정', r'주식교환.?이전결정', '교환·이전 대상법인(회사명)', 'extr_tgcmp_cmpnm', 'text', since='20230101')

# 8) 증권신고서 (DS006) — 공시검색(pblntf_ty=C) 보고서명 매칭
def S(id, api, title, name_re, desc, a, akind='text', since='20250101'):
    T(id=id, api=api, kind='event', title=title, name_re=name_re, desc=desc, a=a, akind=akind, since=since, pty='C')
S('secreg_equity', 'estkRs', '증권신고서(지분증권)', r'증권신고서\(지분증권\)', '모집(매출)총액', 'slta', 'money')
S('secreg_debt', 'bdRs', '증권신고서(채무증권)', r'증권신고서\(채무증권\)', '이자율(%)', 'intr', 'num')
S('secreg_dr', 'stkdpRs', '증권신고서(증권예탁증권)', r'증권신고서\(증권예탁증권\)', '모집(매출)총액', 'slta', 'money', since='20200101')
S('secreg_merger', 'mgRs', '증권신고서(합병)', r'증권신고서\(합병\)', '이사회 결의일', 'bddd', 'date')
S('secreg_stock_exchange', 'extrRs', '증권신고서(주식의포괄적교환·이전)', r'증권신고서\(주식의\s*포괄적\s*교환', '이사회 결의일', 'bddd', 'date', since='20220101')
S('secreg_split', 'dvRs', '증권신고서(분할)', r'증권신고서\(분할\)', '이사회 결의일', 'bddd', 'date', since='20230101')

assert len({t['id'] for t in TYPES}) == len(TYPES), 'duplicate type id'

# ---------- 타입별 사실 수집 ----------
def fact(prompt, answer, alt, note):
    return {'prompt': prompt, 'answer': answer, 'alt_prompt': alt, 'note': note}

def match(r, where):
    return all(re.search(rx, str(r.get(k, ''))) for k, rx in where.items())

def collect(t):
    facts, seen_prompt = [], set()
    def add(f):
        if f['prompt'] in seen_prompt or not f['answer']: return
        seen_prompt.add(f['prompt']); facts.append(f)
    k = t['kind']
    if k == 'company':
        for c in BIG:
            if len(facts) >= FACTS: break
            d = get('company', corp_code=c['corp_code'])
            if not d or d.get('status') != '000': continue
            v = val(d, t['field'], t['vkind'])
            if t['field'] == 'acc_mt' and v: v = f'{int(v)}월'
            if t['field'] == 'hm_url' and v: v = v.lower()
            name = clean_name(c['corp_name'])
            if v: add(fact(f'DART 기업개황 기준 {name}의 {t["desc"]}은?', v, f'{name} {t["desc"]} (DART 공시)', f'DART company.json {t["field"]}'))
    elif k == 'corpcode':
        for c in BIG[:FACTS * 2]:
            if len(facts) >= FACTS: break
            name = clean_name(c['corp_name'])
            add(fact(f'DART 기준 {name}의 고유번호(corp_code)는?', c['corp_code'], f'{name} DART 고유번호', 'DART corpCode.xml'))
    elif k == 'disclosure':
        for c in BIG:
            if len(facts) >= FACTS: break
            rs = [r for r in rows('list', corp_code=c['corp_code'], bgn_de='20260101', end_de=TODAY, pblntf_ty='A', page_count='100') if r.get('report_nm', '').startswith('사업보고서')]
            if not rs: continue
            v = val(rs[0], 'rcept_dt', 'date'); name = clean_name(c['corp_name'])
            if v: add(fact(f'DART 기준 {name}의 2025 사업연도 사업보고서 접수일자는?', v, f'{name} 2025년 사업보고서 DART 접수일', f'DART list.json {rs[0]["rcept_no"]}'))
    elif k in ('report', 'report_noyear'):
        for c in CANDS.get(t.get('cands')):
            if len(facts) >= FACTS: break
            params = {'corp_code': c['corp_code']} if k == 'report_noyear' else {'corp_code': c['corp_code'], 'bsns_year': t['year'], 'reprt_code': t['rc']}
            rs = [r for r in rows(t['api'], **params) if match(r, t.get('where', {}))]
            name = clean_name(c['corp_name'])
            per_corp = 0
            for r in rs:
                if len(facts) >= FACTS or per_corp >= (2 if t.get('key') else 1): break
                v = val(r, t['a'], t['akind'])
                if not v: continue
                key = val(r, t['key']) if t.get('key') else None
                if t.get('key') and not key: continue
                when = f' {val(r, t["datekey"], "date")} 보고' if t.get('datekey') and val(r, t['datekey'], 'date') else ''
                subj = f'{name}의 {t["keydesc"]} {key}' if key else f'{name}의'
                if t['akind'] == 'money': suffix = ' (억원 단위 반올림)'
                else: suffix = ''
                rep = '2026 반기보고서' if t.get('rc') == '11012' else '2025 사업보고서'
                add(fact(f'DART {rep} 기준 {subj}{when} {t["desc"]}은?{suffix}' if k == 'report' else f'DART 공시 기준 {subj}{when} {t["desc"]}은?{suffix}',
                         v, f'{subj} {t["desc"]} (DART)', f'DART {t["api"]} {r.get("rcept_no", "")}'))
                per_corp += 1
    elif k == 'fs':
        for c in BIG:
            if len(facts) >= FACTS: break
            name = clean_name(c['corp_name'])
            if t.get('all'):
                rs = rows('fnlttSinglAcntAll', corp_code=c['corp_code'], bsns_year=YEAR, reprt_code=RC, fs_div='CFS')
                rs = [r for r in rs if r.get('sj_div') == 'CF' and re.sub(r'\s', '', r.get('account_nm', '')) == t['account']]
            elif t.get('multi'):
                rs = [r for r in rows('fnlttMultiAcnt', corp_code=c['corp_code'], bsns_year=YEAR, reprt_code=RC) if r.get('fs_div') == 'CFS' and r.get('account_nm') == t['account']]
            else:
                rs = [r for r in rows('fnlttSinglAcnt', corp_code=c['corp_code'], bsns_year=YEAR, reprt_code=RC) if r.get('fs_div') == 'CFS' and r.get('account_nm') == t['account']]
            if not rs: continue
            v = val(rs[0], 'thstrm_amount', 'money')
            if v: add(fact(f'DART 2025 사업보고서 기준 {name}의 {t["desc"]}은? (억원 단위 반올림)', v, f'{name} 2025년 {t["account"]} (DART 연결)', f'DART {t["api"]} {rs[0].get("rcept_no", "")}'))
    elif k == 'idx':
        for c in BIG:
            if len(facts) >= FACTS: break
            name = clean_name(c['corp_name'])
            rs = [r for r in rows(t['api'], corp_code=c['corp_code'], bsns_year=YEAR, reprt_code=RC, idx_cl_code=t['cl']) if r.get('idx_nm') == t['idx']]
            if not rs: continue
            v = val(rs[0], 'idx_val', 'num')
            if v: add(fact(f'DART 2025 사업보고서 기준 {name}의 {t["desc"]}은?', v, f'{name} 2025년 {t["idx"]} (DART 재무지표)', f'DART {t["api"]} {t["cl"]}'))
    elif k == 'taxonomy':
        rs = rows('xbrlTaxonomy', sj_div='BS1')
        for r in rs:
            if len(facts) >= FACTS: break
            aid, lk = r.get('account_id', ''), val(r, 'label_kor')
            if aid.startswith('ifrs_') and lk and len(lk) <= 30 and 'abstract' not in lk.lower():
                add(fact(f'DART XBRL 택사노미 재무상태표 계정ID {aid}의 한글 출력명은?', lk, f'XBRL 계정 {aid} 한글명 (DART)', 'DART xbrlTaxonomy BS'))
    elif k == 'event':
        # 1) 공시검색으로 해당 보고서를 낸 회사 찾기 (최신순), 2) 회사별 상세 API
        # corp_code 없는 공시검색은 3개월 창만 허용 → 오늘부터 since 까지 3개월씩 거슬러 검색
        found = []
        import datetime as _dt
        end = _dt.date(int(TODAY[:4]), int(TODAY[4:6]), int(TODAY[6:]))
        since_d = _dt.date(int(t['since'][:4]), int(t['since'][4:6]), int(t['since'][6:]))
        while end > since_d and len(found) < FACTS * 3:
            bgn = max(since_d, end - _dt.timedelta(days=89))
            page = 1
            while len(found) < FACTS * 3 and page <= 40:
                d = get('list', bgn_de=bgn.strftime('%Y%m%d'), end_de=end.strftime('%Y%m%d'), pblntf_ty=t['pty'], page_no=str(page), page_count='100', last_reprt_at='Y')
                if not d or d.get('status') != '000': break
                for r in d['list']:
                    nm = re.sub(r'\s', '', r.get('report_nm', ''))
                    if re.search(t['name_re'], nm) and r['corp_code'] not in [f[0] for f in found]:
                        found.append((r['corp_code'], r['corp_name'], r['rcept_dt'], r.get('corp_cls')))
                if page >= int(d.get('total_page', 1)): break
                page += 1
            end = bgn - _dt.timedelta(days=1)
        # 상장사(Y/K) 우선, 부족하면 기타법인도 사용
        found.sort(key=lambda f: 0 if f[3] in ('Y', 'K') else 1)
        for code, cname, rdt, _cls in found:
            if len(facts) >= FACTS: break
            rs = rows(t['api'], corp_code=code, bgn_de=t['since'], end_de=TODAY)
            name = clean_name(cname)
            rs = [r for r in rs if val(r, t['a'], t['akind'])][:1]   # 값이 있는 첫 행 (그룹형 응답은 행마다 필드가 다름)
            for r in rs:
                v = val(r, t['a'], t['akind'])
                if not v: continue
                dt = (r.get('rcept_no') or '')[:8]; dt = f'{dt[:4]}-{dt[4:6]}-{dt[6:]}' if len(dt) == 8 else rdt
                suffix = ' (억원 단위 반올림)' if t['akind'] == 'money' else ''
                add(fact(f'DART 공시 기준 {name}가 {dt}에 공시한 {t["title"]}의 {t["desc"]}은?{suffix}', v, f'{name} {dt} {t["title"]} {t["desc"]} (DART)', f'DART {t["api"]} {r.get("rcept_no", "")}'))
    return facts

manifest = []
for i, t in enumerate(TYPES):
    t0 = time.time()
    try:
        facts = collect(t)
    except SystemExit: raise
    except Exception as e:
        facts = []; print(f'!! {t["id"]}: {e}')
    lid = f'dart-{i + 1:03d}-{t["id"]}'
    with open(f'{OUT}/{lid}.jsonl', 'w') as f:
        for x in facts: f.write(json.dumps(x, ensure_ascii=False) + '\n')
    manifest.append({'id': lid, 'file': f'{OUT}/{lid}.jsonl', 'type': t['id'], 'title': t['title'], 'api': t['api'], 'facts': facts})
    print(f'[{i + 1:3d}/{len(TYPES)}] {lid:45s} facts={len(facts)} calls={calls} {time.time() - t0:.0f}s', flush=True)
json.dump(manifest, open(f'{OUT}/manifest.json', 'w'), ensure_ascii=False, indent=1)
print('types', len(TYPES), 'with>=3 facts', sum(1 for m in manifest if len(m['facts']) >= 3), 'with>=1', sum(1 for m in manifest if m['facts']), 'api calls', calls)
