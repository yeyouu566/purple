/**
 * BM 자가진단 · 핵심 로직 (UI와 분리된 순수 함수 모듈)
 * ------------------------------------------------------------
 * 브라우저: <script src="bm-logic.js"></script> → window.BMLogic
 * Node   : const BMLogic = require("./bm-logic.js")
 *
 * 입력:  answers = [[5개], [5개], [5개], [5개]]  (각 1~5점, 영역 순서 = AREAS 순서)
 *        info    = { idea, customer, comp }
 * 출력:  buildReport(info, answers) → 리포트 객체 (점수·판정·피드백·미검증 가설·요약문)
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.BMLogic = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ============ 1. 설정값 ============ */
  const CONFIG = {
    QUESTIONS_PER_AREA: 5,
    SCALE_MIN: 1,
    SCALE_MAX: 5,
    GOOD_LINE: 70,          // 이 점수 이상 = 양호
    BAD_LINE: 40,           // 이 점수 미만 = 취약
    WEAK_ANSWER_MAX: 2,     // 이 점수 이하 응답 = 미검증 가설
    EVIDENCE_MIN: 4,        // 근거 문항이 이 점수 이상이어야 '가설 수립' 가능
    WEAK_LIST_LIMIT: 8,     // 리포트에 보여줄 미검증 가설 최대 개수
  };

  const SCALE_LABELS = ["전혀 아니다", "아니다", "보통", "그렇다", "매우 그렇다"];
  const LEVEL_LABEL = { good: "양호", mid: "보완 필요", bad: "취약" };

  /* ============ 2. 문항 데이터 (4영역 × 5문항) ============ */
  const AREAS = [
    {
      key: "demand", no: "01", step: "STEP 1", name: "시장 수요", en: "Market Demand",
      question: "시장에서 실제로 해결을 원하는 문제가 존재하나요?",
      items: [
        "목표 고객이 누구인지 한 문장으로 구체적으로 말할 수 있다.",
        "고객이 겪는 문제나 충족되지 않은 욕구를 고객의 언어로 설명할 수 있다.",
        "이 문제를 겪는 고객이 얼마나 되는지 대략이라도 추정해 봤다.",
        "고객이 이미 돈이나 시간을 들여 이 문제를 해결하려 하고 있다.",
        "인터뷰·검색량·커뮤니티 글 등 수요를 뒷받침하는 근거를 갖고 있다.",
      ],
      hypotheses: ["목표 고객 정의", "고객 문제 정의", "문제를 겪는 고객 규모", "고객의 해결 의지·행동", "수요 근거"],
      outputs: ["목표 고객 정의", "고객 문제 정의", "수요 검증 근거"],
      feedback: {
        good: "고객과 문제가 구체적이고, 수요를 뒷받침하는 근거도 있어요.",
        mid: "고객과 문제는 그려지지만, 수요가 실제로 있다는 근거가 아직 약해요.",
        bad: "누가, 어떤 문제를 겪는지 아직 선명하지 않아요. 이 상태에서 제품을 만들면 리스크가 커요.",
      },
      next: {
        good: "STEP 2로 → 문제 해결 가능성 검토로 넘어가세요.",
        mid: "추가 검증 → 목표 고객 5~10명 인터뷰, 검색량·커뮤니티 글 수집으로 수요 근거를 보강하세요.",
        bad: "재정의 → 목표 고객이나 해결할 문제를 다시 정의한 뒤 처음부터 검증하세요.",
      },
    },
    {
      key: "feasibility", no: "02", step: "STEP 2", name: "해결 가능성", en: "Solution Feasibility",
      question: "그 수요를 충족하는 제품·서비스를 내가 제공할 수 있나요?",
      items: [
        "어떤 제품이나 서비스로 고객의 문제를 해결할지 명확하다.",
        "핵심 기능과 제공 가치를 한 줄로 설명할 수 있다.",
        "고객이 얻는 구체적인 이익(시간·비용·결과)을 수치로 말할 수 있다.",
        "현재 보유한 기술·자원·역량으로 실제 제공할 수 있다.",
        "제공 가능한 범위와 한계를 정해 두었다.",
      ],
      hypotheses: ["솔루션 형태", "핵심 가치 제안", "고객이 얻는 구체적 이익", "보유 역량으로 제공 가능 여부", "제공 범위와 한계"],
      outputs: ["제품·서비스 정의", "핵심 가치 제안", "제공 가능성 평가"],
      feedback: {
        good: "무엇을 어떻게 제공할지 분명하고, 보유 역량으로 실행할 수 있어요.",
        mid: "솔루션의 방향은 있지만, 실제로 제공할 수 있는지 아직 확인이 덜 됐어요.",
        bad: "지금 역량으로는 제공하기 어렵거나 솔루션 정의가 흐릿해요.",
      },
      next: {
        good: "STEP 3로 → 경쟁 환경 분석으로 넘어가세요.",
        mid: "시제품 검증 → 수작업 서비스·랜딩페이지·MVP로 제공 방식을 먼저 시험해 보세요.",
        bad: "재설계 → 솔루션 범위를 줄이거나 제공 방식(외주·제휴·수작업)을 다시 설계하세요.",
      },
    },
    {
      key: "competition", no: "03", step: "STEP 3", name: "경쟁 환경", en: "Competitive Analysis",
      question: "고객은 지금 무엇으로 이 문제를 해결하고 있나요?",
      items: [
        "직접 경쟁사를 3곳 이상 알고 있다.",
        "같은 문제를 다른 방식으로 해결하는 대체재를 파악했다.",
        "경쟁사의 판매 가격과 요금 구조를 비교해 봤다.",
        "경쟁사가 고객에게 주는 핵심 강점을 알고 있다.",
        "경쟁 제품에 대한 고객 불만이나 충족되지 않은 요구를 확인했다.",
      ],
      hypotheses: ["직접 경쟁사 목록", "대체재", "경쟁사 가격·요금 구조", "경쟁사 핵심 강점", "경쟁 제품의 미충족 수요"],
      outputs: ["경쟁사 목록", "제품·서비스 비교표", "가격 비교표", "시장 내 미충족 수요"],
      feedback: {
        good: "경쟁사·대체재·가격을 파악했고, 시장의 빈틈도 보고 있어요.",
        mid: "경쟁사는 알지만 가격 구조나 고객 불만까지는 깊이 보지 못했어요.",
        bad: "고객이 지금 무엇을 쓰고 있는지 잘 모르는 상태예요. '경쟁자가 없다'는 착각이 가장 위험해요.",
      },
      next: {
        good: "STEP 4로 → 차별화 검증으로 넘어가세요.",
        mid: "비교표 작성 → 경쟁사 3~5곳의 제품·가격·강점 비교표와 리뷰 속 불만을 정리하세요.",
        bad: "시장 조사 → 고객에게 '지금은 어떻게 해결하세요?'를 묻고, 직접 경쟁사와 대체재 목록부터 만드세요.",
      },
    },
    {
      key: "differentiation", no: "04", step: "STEP 4", name: "차별화", en: "Competitive Differentiation",
      question: "고객이 기존 대안 대신 나를 선택할 이유가 있나요?",
      items: [
        "경쟁사 대비 내가 가진 강점을 한 문장으로 말할 수 있다.",
        "가격·품질·편의성·전문성·속도·경험 중 차별화할 축이 정해져 있다.",
        "그 차별점이 목표 고객에게 실제로 중요하다는 근거가 있다.",
        "경쟁사와 비교해 고객이 얻는 추가 가치를 설명할 수 있다.",
        "고객이 기존 제품에서 갈아탈 만큼 충분한 이유가 있다.",
      ],
      hypotheses: ["핵심 강점", "차별화 축", "차별점의 고객 중요도", "추가로 얻는 가치", "전환할 이유"],
      outputs: ["핵심 차별화 요소", "경쟁 우위 가설", "고객 선택 이유"],
      feedback: {
        good: "차별점이 분명하고, 고객이 그걸 중요하게 여긴다는 근거도 있어요.",
        mid: "차별화 가설은 있지만, 고객이 실제로 그 이유로 선택할지는 아직 모릅니다.",
        bad: "경쟁사와 무엇이 다른지, 왜 나를 골라야 하는지가 아직 불분명해요.",
      },
      next: {
        good: "BM 가설 정리 → 초기 BM 가설을 문서로 정리하고 소규모 판매로 확인하세요.",
        mid: "선택 이유 검증 → 차별점을 내세운 광고·랜딩페이지로 클릭률·사전 신청을 측정해 보세요.",
        bad: "포지셔닝 재설계 → 경쟁사가 못 채우는 고객 요구를 출발점으로 가치 제안을 다시 짜세요.",
      },
    },
  ];

  /* 근거 문항 위치: [영역 인덱스, 문항 인덱스] */
  const EVIDENCE = {
    demand: [0, 4],          // Q5  수요 근거
    diffImportance: [3, 2],  // Q18 차별점이 고객에게 중요하다는 근거
    switchReason: [3, 4],    // Q20 전환할 이유
  };

  /* 판정 정의 (프레임워크 '최종 판단 기준' 3상태) */
  const VERDICTS = {
    redesign: {
      key: "redesign", level: "bad", label: "BM 재설계 필요",
      title: "BM 재설계가 필요해요",
      desc: "수요, 제공 가능성, 고객 선택 이유 중 하나 이상에서 중대한 공백이 보여요. 지금 만들기보다 가장 약한 영역부터 다시 정의하는 게 빨라요.",
    },
    hypothesis: {
      key: "hypothesis", level: "good", label: "초기 BM 가설 수립",
      title: "초기 BM 가설을 세울 수 있어요",
      desc: "네 영역이 구체적으로 정의됐고 주요 가설에 근거가 있어요. 이제 가설을 문서로 정리하고 실제 고객 반응으로 확인할 단계예요.",
    },
    moreValidation: {
      key: "moreValidation", level: "mid", label: "추가 검증 필요",
      title: "가능성은 있어요, 근거가 더 필요해요",
      desc: "사업 가능성은 보이지만 핵심 가설 중 일부가 아직 근거 없이 '그럴 것 같다'에 머물러 있어요. 아래 미검증 가설부터 확인하세요.",
    },
  };

  /* ============ 3. 검증 ============ */
  function validateAnswers(answers) {
    if (!Array.isArray(answers) || answers.length !== AREAS.length)
      throw new Error(`answers는 ${AREAS.length}개 영역 배열이어야 합니다.`);
    answers.forEach((arr, ai) => {
      if (!Array.isArray(arr) || arr.length !== CONFIG.QUESTIONS_PER_AREA)
        throw new Error(`${AREAS[ai].name}: 문항 ${CONFIG.QUESTIONS_PER_AREA}개가 필요합니다.`);
      arr.forEach((v, qi) => {
        if (!Number.isInteger(v) || v < CONFIG.SCALE_MIN || v > CONFIG.SCALE_MAX)
          throw new Error(`${AREAS[ai].name} Q${qi + 1}: ${CONFIG.SCALE_MIN}~${CONFIG.SCALE_MAX} 정수가 필요합니다. (받은 값: ${v})`);
      });
    });
    return true;
  }

  /* ============ 4. 채점 ============ */
  /** 영역 점수: (합계 − 최소합) ÷ (최대합 − 최소합) × 100  →  5문항이면 (합−5)/20×100 */
  function areaScore(arr) {
    const n = arr.length;
    const sum = arr.reduce((a, b) => a + b, 0);
    const min = n * CONFIG.SCALE_MIN, max = n * CONFIG.SCALE_MAX;
    return Math.round(((sum - min) / (max - min)) * 100);
  }

  /** 등급: ≥70 good / 40~69 mid / <40 bad */
  function levelOf(score) {
    if (score >= CONFIG.GOOD_LINE) return "good";
    if (score >= CONFIG.BAD_LINE) return "mid";
    return "bad";
  }

  const pick = (answers, [a, q]) => answers[a][q];

  /**
   * 최종 판정
   * 1) 수요·해결 가능성·차별화 중 하나라도 < 40           → BM 재설계 필요
   * 2) 4영역 모두 ≥ 70 AND 수요 근거(Q5)·차별화 근거(Q18) ≥ 4 → 초기 BM 가설 수립
   * 3) 그 외                                                 → 추가 검증 필요
   * (경쟁 환경은 '중대한 문제' 판정 대상에서 제외: 프레임워크상 재설계 사유는 수요·제공 가능성·선택 이유)
   */
  function decideVerdict(scores, answers) {
    const [d, f, , x] = scores;
    if (d < CONFIG.BAD_LINE || f < CONFIG.BAD_LINE || x < CONFIG.BAD_LINE) return VERDICTS.redesign;
    const hasEvidence =
      pick(answers, EVIDENCE.demand) >= CONFIG.EVIDENCE_MIN &&
      pick(answers, EVIDENCE.diffImportance) >= CONFIG.EVIDENCE_MIN;
    if (scores.every((s) => s >= CONFIG.GOOD_LINE) && hasEvidence) return VERDICTS.hypothesis;
    return VERDICTS.moreValidation;
  }

  /** 우선 과제: STEP 1→4 순서로 처음 70 미만인 영역의 next. 모두 양호하면 STEP 4 good */
  function priorityAction(scores) {
    const i = scores.findIndex((s) => s < CONFIG.GOOD_LINE);
    if (i === -1) return { area: AREAS[3], text: AREAS[3].next.good };
    return { area: AREAS[i], text: AREAS[i].next[levelOf(scores[i])] };
  }

  /** 미검증 가설: 2점 이하 응답, 낮은 점수 순 정렬 */
  function weakHypotheses(answers) {
    const out = [];
    AREAS.forEach((a, ai) =>
      answers[ai].forEach((v, qi) => {
        if (v <= CONFIG.WEAK_ANSWER_MAX)
          out.push({ areaKey: a.key, area: a.name, qNo: ai * 5 + qi + 1, hypothesis: a.hypotheses[qi], item: a.items[qi], score: v });
      })
    );
    return out.sort((a, b) => a.score - b.score || a.qNo - b.qNo);
  }

  /** '선택 이유' 행 문구 */
  function choiceReason(answers) {
    const sw = pick(answers, EVIDENCE.switchReason) >= CONFIG.EVIDENCE_MIN;
    const ev = pick(answers, EVIDENCE.diffImportance) >= CONFIG.EVIDENCE_MIN;
    if (sw && ev) return "고객이 전환할 이유와 그 근거를 모두 갖고 있다고 답했어요.";
    if (sw) return "전환할 이유는 있다고 보지만, 고객 근거는 아직 부족해요.";
    return "고객이 기존 대안에서 갈아탈 이유가 아직 충분하지 않아요.";
  }

  /* ============ 5. 리포트 조립 ============ */
  function buildReport(info, answers, opts = {}) {
    validateAnswers(answers);
    info = Object.assign({ idea: "", customer: "", comp: "" }, info);
    const date = opts.date || new Date();

    const scores = answers.map(areaScore);
    const levels = scores.map(levelOf);
    const total = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const verdict = decideVerdict(scores, answers);
    const priority = priorityAction(scores);
    const weak = weakHypotheses(answers);
    const maxI = scores.indexOf(Math.max(...scores));
    const minI = scores.indexOf(Math.min(...scores));
    const fill = (s, fb) => (s && String(s).trim() ? String(s).trim() : fb);

    const areas = AREAS.map((a, i) => ({
      key: a.key, no: a.no, step: a.step, name: a.name,
      score: scores[i], level: levels[i], levelLabel: LEVEL_LABEL[levels[i]],
      feedback: a.feedback[levels[i]], next: a.next[levels[i]],
    }));

    // 프레임워크 '최종 산출물' 6행 표
    const table = [
      { row: "시장 수요", head: fill(info.customer, "목표 고객 미입력"), body: areas[0].feedback },
      { row: "제공 가치", head: fill(info.idea, "아이디어 미입력"), body: areas[1].feedback },
      { row: "경쟁 환경", head: fill(info.comp, "경쟁사·대체재 미입력"), body: areas[2].feedback },
      { row: "차별화", head: "", body: areas[3].feedback },
      { row: "선택 이유", head: "", body: choiceReason(answers) },
      { row: "미검증 가설", head: "", body: weak.length ? `${weak.length}개 — 미검증 가설 목록 참고` : "2점 이하로 답한 항목이 없어요. 3점 항목을 근거로 보강하세요." },
    ];

    const summary = [
      `[BM 초기 검증 리포트] ${info.idea}`,
      `결과: ${verdict.title} (종합 ${total}점)`,
      ...areas.map((a) => `- ${a.name}: ${a.score}점 (${a.levelLabel})`),
      `우선 과제: ${priority.text}`,
      weak.length ? `미검증 가설: ${weak.slice(0, 5).map((w) => w.hypothesis).join(", ")}` : "",
    ].filter(Boolean).join("\n");

    return {
      meta: { date: date.toISOString().slice(0, 10), version: "1.0" },
      info,
      total,
      verdict,
      areas,
      strongest: AREAS[maxI].name,
      weakest: AREAS[minI].name,
      priority: { area: priority.area.name, text: priority.text },
      weakHypotheses: weak,
      weakShown: weak.slice(0, CONFIG.WEAK_LIST_LIMIT),
      table,
      summary,
    };
  }

  return {
    CONFIG, SCALE_LABELS, LEVEL_LABEL, AREAS, EVIDENCE, VERDICTS,
    validateAnswers, areaScore, levelOf, decideVerdict, priorityAction,
    weakHypotheses, choiceReason, buildReport,
  };
});
