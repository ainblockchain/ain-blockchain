# 실제 POA 샤딩 재현 증빙 — 2026-09-11

## 결론과 범위

부모4+POA자식3+3, 총10개 검증자의 실제3체인 구성, ain-js 서명 기록, 독립 검증자의 확정값/블록, 부모 체인의 state proof 및 단일 자식 검증자 장애 복구를 실제 Docker에서 확인했다. **M1의 실제 학습70개·대규모 데이터 요구사항은 아직 미완료**다. 제어 기록2건을 학습 파이프라인70개로 집계하지 않는다.

## 실행 식별자

- 최종 네트워크: `native_shards_20260911_r3`.
- 체인 이미지: `sha256:1b305c08c2a01293eee1131424d3fe187a112f278c7f3d9cfc2c2ce69eb64685`, ain-blockchain1.6.1, Node22.14.0.
- SDK 이미지: `sha256:975084b3daf04545531fc4a055a7182b8afb3a48927264c33272b37277093d84`, ain-js1.15.0, `client/package-lock.json` 고정.
- 실제 체인 런타임 소스·프로토콜 버전·설정 템플릿·의존성 lockfile **93/93 해시 일치**.
- 소스 단위 테스트: 제한된 Docker에서 **11/11 통과**. DNS bootstrap, 자원/검증자 구성, 영수증 필드, 독립 블록 포함, 장애 진행 및 catch-up 판정의 회귀 검증이다.

## 실제 제어 트랜잭션

두 자식의 동일 로컬 경로 `/apps/native_training/native_shards_20260911_r3/control`에 서로 다른 값을 기록했다. 원본 `probe-control.json`에는 서명 응답·확정 영수증·독립 블록 전체·확정값·부모 증명이 있다. 부모 자체의 동일 앱 경로는 null이다.

| 자식 | tx hash | 자식 블록 | 부모에 확정된 state proof |
|---|---|---:|---|
| shard1 | `0xddc642a81a93bf8d197ff105bc87f498201fb37e0925ce38d92934bade1e9ad3` | 25 | `0x9d415f9d3557e702148e82adbf67a4d68e4118c30180fb5230e7b46bbc567969` |
| shard2 | `0x71587c8505008bb4cdfb7c04effbf721536046e94b12fcedcb0ed05ed9683d7a` | 37 | `0x7d178025ff6174f277e533ca28db4577f771d70dc1d3cdf1f4159920828cdeaa` |

앱 생성·규칙도 실제 서명 제출 후 최종화를 검증했다. API 풀 수락만으로 성공을 판정하지 않는다. 원본 제출 의도/응답은 fsync journal로 보존했다.

## 장애와 복구

`fault3`은 이 회차 `shard12` 컨테이너만 정지했다. 정지 중30초 관측에서 부모416→446, 장애 샤드의 생존 reporter354→372, 다른 샤드383→413으로 진행했다. 동일 컨테이너ID·동일 볼륨으로 복구했으며 10:00:05 UTC 관측에서 각 체인의 노드 높이는 각각467/388/434로 일치했다. 제어값·제어 블록 hash·부모 state proof도 변하지 않았다.

최종 관측기는 모든 기대 신원의 진행과 체인별 tip 차이≤2를 제한 시간 안에서 기다린다. 이전 고정6초 관측 실패를 삭제하거나 체인을 초기화하지 않고 `finalrecovery`로 추가 검증했다. 이것은 프로세스1개 장애 시험이며, Byzantine/패킷 유실/전체 호스트 장애/학습 작업 재개를 모두 검증했다는 뜻이 아니다.

## 보존한 실패

1. r1: Docker DNS hostname을 원 코드가 peer URL로 거절하여 CHAIN_SYNCING에 머물렀다. 첫 노드 URL 비교 전에 IP로 resolve하도록 수정했다. 이 실패 회차의 노드만 명시적으로 정지했으며 볼륨은 보존했다.
2. r2 최초 제어: 실제 create-app tx가 확정됐으나 SDK 응답의 `number` 대신 존재하지 않는 `block_number`를 읽었다. 같은 체인의 기존 앱을 보존한 채 새 `control2` label로 재검증했다.
3. 초기 이미지 대조:93개 중 package/protocol map2개가1.6.0/1.6.1로 달랐다. 불일치를 통과 처리하지 않고1.6.1 이미지를 빌드해 신규 r3으로 검증했다. 완료한 r2 프로젝트만 정지해 RPC 포트를 반납했고 기존 체인·모델은 건드리지 않았다.
4. r3 fault1: 회차ID가 없는 관측 컨테이너 이름이 r2와 충돌했다. EXIT 복구가 동일 대상 노드를 즉시 되살렸고, 이름에 회차ID를 포함하도록 수정했다.
5. r3 fault2: 복구 중 한 노드가 고정6초 구간에서 아직 진행하지 않아 실패했다. 실패 JSON을 보존하고 재시작 없이 관측만 재개했다. 이후 bounded catch-up 대기 및 tip 차이 검증을 추가했다.

## 자원 및 재현 주의

호스트8CPU·755.511GiB RAM 위에서 검증자별32CPU quota/128GiB memory ceiling을 공유한다. 합계320 quota는320물리 코어가 아니다. 40:1은 설정 상한 비율이며 AWS 실제 처리량 비율은 아니다. tracker3개와 모든 관측기 제한도 기록했다. 이 실험은 GPU를 할당하지 않으며 기존 Ainize 학습/서빙 및 GPU7 평가를 중단하지 않는다.

공개 upstream 시험키만 사용한다. RPC는 loopback 전용이고 서명 검증을 우회하지 않는다. 현재 native reporter 제약 때문에 chain ID0을 공유하며 기존 가스 workaround를 유지한다. 실자금 정산·크로스체인 재전송 방지는 미검증이다.

## 산출물

로컬 기준 `kpi/evidence/`의 다음 디렉터리와 동일한 선별 원시 자료를 source prerelease에 첨부한다. 생성된 시험계정 키 파일은 첨부에서 제외한다. 코드·자료 게시와 Ainize 공개 노드 배포/Live test 성공은 별개다.

- `native_shards_20260911_r1/`, `native_shards_20260911_r2/`, `native_shards_20260911_r3/`: 실패/성공 네트워크, 제출 journal, 독립 블록 및 상태 증명.
- `native_shards_chain_build_20260911/`, `native_shards_client_build_20260911/`: 실제 빌드 로그·이미지ID·의존성/소스 해시.
- `native_shards_runtime_audit_20260911/`: 초기 이미지 불일치 원문.
- `native_shards_publish_tests_r2_20260911/`: 최종 단위 테스트의 실행 소스·11개 결과·Docker 제한/exit.
- `native_shards_publication_20260911/`: 공개 요약과 실제 자원, 원시 자료 아카이브·SHA256·커밋/게시 식별자.

실행 명령과 안전한 재개 절차는 `README.md`를 따른다. 기존 DART100 중7개 teach/전수 추론 감사가 완료됐고8번째 학습을 이어가지만, 이는 별도 Ainize 실험으로서 이 샤딩 제어 기록의 학습70개 증거가 아니다.
