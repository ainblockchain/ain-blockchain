# datasets100.txt 생성: 후보 태스크를 설치된 lm-eval 레지스트리와 교차 검증해 100개 확정
import sys
from lm_eval import tasks as lm_tasks

CANDIDATES = [
    # 1단계 검증 5종 우선
    "mmlu", "hellaswag", "arc_challenge", "truthfulqa_mc2", "gsm8k",
    # 추론/상식
    "arc_easy", "piqa", "social_iqa", "openbookqa", "winogrande", "commonsense_qa",
    "swag", "copa", "boolq", "cb", "rte", "wic", "wsc", "multirc", "record",
    "anli_r1", "anli_r2", "anli_r3", "logiqa", "logiqa2", "prost", "quartz", "qasc",
    "sciq", "hendrycks_ethics", "toxigen", "crows_pairs_english", "truthfulqa_mc1",
    "truthfulqa_gen",
    # 수학/산술
    "gsm8k_cot", "asdiv", "mathqa", "arithmetic_2da", "arithmetic_2ds",
    "arithmetic_3da", "arithmetic_3ds", "arithmetic_4da", "arithmetic_4ds",
    "arithmetic_5da", "arithmetic_5ds", "arithmetic_1dc", "minerva_math_algebra",
    # 지식/QA/언어모델링
    "triviaqa", "nq_open", "webqs", "squadv2", "drop", "coqa", "race",
    "headqa_en", "lambada_openai", "lambada_standard", "wikitext", "winogender",
    "mmlu_stem", "mmlu_humanities", "mmlu_social_sciences", "mmlu_other",
    # GLUE
    "cola", "mnli", "mrpc", "qnli", "qqp", "sst2", "wnli",
    # 한국어/다국어
    "kobest_boolq", "kobest_copa", "kobest_hellaswag", "kobest_sentineg", "kobest_wic",
    "haerae", "kmmlu_direct", "kmmlu", "xnli_en", "xcopa_id", "xcopa_it",
    "xstorycloze_en", "xstorycloze_es", "xwinograd_en", "paws_en", "belebele_eng_Latn",
    "mgsm_direct_en", "lambada_openai_mt_de", "lambada_openai_mt_es",
    # BBH/종합
    "bbh_zeroshot", "bbh_cot_zeroshot", "agieval_en", "ifeval", "gpqa_main_zeroshot",
    "mmlu_pro", "cmmlu", "ceval-valid", "leaderboard_musr", "openai_humaneval", "mbpp",
    # 추가 예비
    "pubmedqa", "medqa_4options", "medmcqa", "mc_taco", "mutual", "prost",
    "sglue_rte", "wsc273", "storycloze_2016", "unscramble", "model_written_evals",
    "babi", "glianorex", "fld_default", "hendrycks_math_algebra",
    "blimp_anaphor_gender_agreement", "blimp_causative", "qa4mre_2013",
    "mmlu_flan_n_shot_loglikelihood_global_facts", "tinyBenchmarks", "tmmluplus",
    "eus_exams_eu", "arithmetic_2dm", "squad_completion",
]

available = set(lm_tasks.TaskManager().all_tasks)
picked, seen = [], set()
for t in CANDIDATES:
    if t in available and t not in seen:
        picked.append(t); seen.add(t)
    if len(picked) == 100:
        break

if len(picked) < 100:
    # 부족분은 레지스트리에서 결정론적으로 보충 (그룹/집계 태스크 제외 우선)
    for t in sorted(available):
        if t not in seen and not t.startswith(("mmlu_flan", "bbh_fewshot")):
            picked.append(t); seen.add(t)
        if len(picked) == 100:
            break

assert len(picked) == 100, f"only {len(picked)}"
with open(sys.argv[1] if len(sys.argv) > 1 else "datasets100.txt", "w") as f:
    f.write("\n".join(picked) + "\n")
print(f"OK 100 tasks (from {len(available)} available)")
print("first10:", picked[:10])
