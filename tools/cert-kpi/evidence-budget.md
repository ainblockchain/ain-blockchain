# 합의 증거 크기 제한 — 2026-09-11

## 관측과 수정의 범위

원래 10개 노드의 확정 블록은23086에 정체했다. 15:43:52UTC node1의 아홉 inbound
WebSocket에서 처리 중인 메시지 유형은 모두 `CONSENSUS`였다. 압축 프레임은
4,477,107–5,233,305bytes였고, 한 연결의 해제 중 누적 버퍼는39,888,622bytes였다.
동일 관측의 가장 큰 outbound `bufferedAmount`는198,923,971bytes였다.

15:45:09UTC block-pool의 큰 후보 다섯 개를 구성요소별로 계측했다. 거래와 receipts는
빈 배열(각2bytes)인데 evidence는49,340,801–49,359,539bytes였다. 예를 들어23104의
`0x836e8d245493e0554efbd70c3b05b3ca1f75aa2638c16e54ce4ffb8a9377d40c`는
evidence49,359,539bytes, last_votes8,375bytes다. `block.size`84,528,650은 기존
object-sizeof의 계산값이며 JSON 전송 바이트와 같은 단위로 비교하지 않는다.

이는 상태 보고나 사용자 거래가 아닌 중첩 위반 증거의 반복 전송이라는 직접 증거다.
CPU 표본에서도 GC·zlib·버퍼 작업을 보았지만 프로파일러 시작의 단일 표본이 전체 시간의
38.94%를 차지했다. 이를 깨끗한 CPU 이용률/병목 비율 또는 수정 전후 성능 비교로 쓰지 않는다.
진단 breakpoint와 선택적 JSON 직렬화 자체도 대상 프로세스에 부하를 더한다.

`BlockPool.getOffensesAndEvidence()`는 새 제안에 포함하는 evidence의 기본 예산을
1,048,576bytes로 제한한다. `bounded-json-size.js`는 실제 UTF-8 JSON 크기를 제한 내에서
계수하며 큰 문자열·깊이256 초과·순환·사용자 직렬화 객체는 일찍 제외한다. 전체 큰 JSON
문자열을 먼저 만드는 방식이 아니다. 같은 하위 객체가 여러 번 참조되면 각각 계수한다.

- 한도 초과 후보는 투표의 DB 실행 **전에** 건너뛰며 뒤의 작은 후보도 검토한다.
- 원래 block-pool 후보를 삭제하거나 기존 블록·서명·증거 본문을 수정하지 않는다.
- 정족수에 도달하지 못한 후보의 투표 효과는 이전 checkpoint로 되돌린다.
- 예산에는 작성자 키·배열·쉼표와 후보 전체 투표를 보수적으로 포함한다. 실패한 투표가
  제외되면 실제 출력이 계수값보다 작을 수 있다.
- **새 제안자의 선택 정책**이다. 수신 검증자의 허용 규칙, 서명 검증, 과거 증거 검증을
  약화하거나 새 체인 fork 규칙을 만들지 않는다. 거대한 예전 증거나 peer의 큰 메시지까지
  이 패치로 수신 차단하는 것은 아니다. 예산보다 큰 개별 위반 증거의 최종 포함/압축 형식은
  미해결이며, 작은 후보 처리를 계속할 수 있게 하는 보완이다.

## 소스 재현

저장소 루트에서 새 출력 디렉터리와 RUN_ID를 사용한다. 기존 evidence를 덮어쓰지 않는다.

```bash
IMAGE=ain-cert-native-chain:evidence-budget-local
docker build -f tools/cert-kpi/native-shards/chain.Dockerfile -t "$IMAGE" .
CHAIN_IMAGE="$IMAGE" bash tools/cert-kpi/run-recovery-tests.sh \
  /새/절대경로/evidence-budget-tests evidence-budget-local
```

Docker runc/network none/CPU2/cpuset0–7/RAM·전체 memory+swap4GiB/read-only/no GPU다.
이는 공유8CPU 호스트의 상한이지 AWS320vCPU 등가 성능이 아니다.

최종 집중시험은67개(33 Node test+34 native Mocha), lint 및 shell 구문 검사다. 두 신규
예산 회귀는 이전 코드에서 각각 실패했고 수정 후 통과했다. 같은 작성자의 두 증거 경계,
빈 예산, 작은 후속 후보, UTF-8/escape/중복 하위 트리, inspector listener/연결 정리도 검증한다.
초기 두 green 회차는 동작 시험에 통과했지만 lint에 실패했으며 해당 로그도 남긴다.

기존 실제23103 실패 캡처의 native DB 재생은 `replay-consensus-capture.js`를 사용한다.
`creator-evidence-only`와 `creator-quorum-then-minority`는 과거 버그 분석을 보존하기 위해
**오프라인에서만 무제한 예산**을 명시한다. 추가 `creator-bounded` 모드는 기본1MiB로
선택하고 별도 검증자 DB에서 같은 결과를 재생한다. 원래 서명된 잘못된 state_proof_hash와
다른 것은 기존 오류 재현의 예상 결과다. 이 실제 캡처의 evidence는18,851bytes이며
양쪽 DB proof는`0x22b7c8241417a1b981e638b3b95d77b3198c8e2f07da4e3aed7fbc121c19885e`다.
**49MB의 실제 후보를18KB로 줄여 재생했다고 주장하지 않는다.** 대용량 후보는 별도 live
메타데이터 관측이고, 캡처 재생은 기존18KB 증거의 서명24개/DB 동작 비회귀 확인이다.
재생 캡처에는 DB 상태가 있으므로 private0700/0600로 보관하고 게시하지 않는다.

## 실행 중 진단

모델·트레이너·API·GPU7 작업을 중지하거나 체인 전체를 재시작하지 않는다. inspector는
신뢰하는 로컬 프로세스 하나에만 수동 개방한다. 이미9229가 열렸으면 다른 진단을 시작하지
않는다. SIGUSR1 직후 `http://127.0.0.1:9229/json/list` 응답을 기다려야 한다.

컨트롤러 안의 파일을 `/evidence/`에 마운트하면 `require('ws')` 해석을 위해
`NODE_PATH=/app/ain-blockchain/node_modules`가 필요하다. 대상 node1의 경우
`INSPECT_RPC_PORT=18082`다. 컨트롤러는 network host/CPU1/cpuset0–7/RAM·swap1GiB/
read-only/no GPU로 실행한다. 노드가 쓰는 `/data` 볼륨을 컨트롤러에 쓰기 마운트하지 않는다.

- `inspect-consensus.js NEW_OUTPUT`: bounded 메타데이터, 큰 후보의 선언 크기와 송수신 큐.
- `INSPECT_BYTE_SIZES=1`: 큰 후보 최대5개/첫 peer-info를 실제 JSON 직렬화해 계측한다.
  큰 일시 문자열/CPU 부하가 생기므로 기본값은 꺼져 있다. KPI 측정과 겹쳐 실행하지 않는다.
- `INSPECT_P2P_MESSAGE=1`: breakpoint를 먼저 풀고 하나의 inbound에서15초 동안 큰 메시지
  하나의 필드 크기만 관측한다. 본문은 저장하지 않으며32MiB보다 크면 파싱을 생략한다.
  `noLargeMessage=true`는 제한 시간에 관측하지 못했다는 뜻이지 큰 메시지가 없다는 뜻이 아니다.
- `profile-consensus.js NEW_OUTPUT 10000`: CPU 샘플링.1–20초 범위이며 시작/GC/idle/스케줄링
  지연을 포함한다. 처리량·지연 또는 CPU 등가 환산 자료가 아니다.

성공/실패 후 대상 PID·시작 시각이 그대로인지,9229가 닫혔는지 확인한다. 시작 전 연결 실패도
기록하며 노드를 재시작하지 않는다. private capture 모드와 메시지 관측 모드를 섞지 않는다.

## 실제 환경 적용의 경계

이번 canary 계획은 원래 node8 한 대만 대상으로 하며 기존 연결점 node1과 나머지 노드를
유지한다. 실험 머신의 계획/원문은`kpi/evidence/evidence_budget_canary_20260911/`이다.
일반 복구 계획과 별도이며, 기존 계정·볼륨·원장과 검증된23086 snapshot을 유지한다.
예전 `compose.chain.json`이나 이전 복구 compose를 전체 up/down하지 않는다.
canary 적용은10노드 합의 복구나 성능 달성이 아니다. 다음 노드 적용 전에 원장 보존,
native health와 실제 확정 진행을 확인하고, 관측 timeout 때문에 재시작하지 않는다.

공개 Ainize 본문0/POST404/Live `not_held` 문제와 이 블록체인 consensus 병목은 별개다.
공개 P2P의 실제 성공 여부는 원본 본문의 signed POST/재다운로드 SHA/Live로 판단한다.
