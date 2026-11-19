// 실행: node test-bm-logic.js
const L = require("./bm-logic.js");
const assert = require("assert");
const fill = (v) => [v, v, v, v, v];
let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log("✓", name); };

t("영역 점수: 전부 1점=0, 전부 5점=100, 전부 3점=50", () => {
  assert.strictEqual(L.areaScore(fill(1)), 0);
  assert.strictEqual(L.areaScore(fill(5)), 100);
  assert.strictEqual(L.areaScore(fill(3)), 50);
});

t("등급 경계: 70=양호, 69=보완, 40=보완, 39=취약", () => {
  assert.strictEqual(L.levelOf(70), "good");
  assert.strictEqual(L.levelOf(69), "mid");
  assert.strictEqual(L.levelOf(40), "mid");
  assert.strictEqual(L.levelOf(39), "bad");
});

t("전부 5점 → 초기 BM 가설 수립", () => {
  const r = L.buildReport({ idea: "테스트" }, [fill(5), fill(5), fill(5), fill(5)]);
  assert.strictEqual(r.verdict.key, "hypothesis");
  assert.strictEqual(r.total, 100);
  assert.strictEqual(r.weakHypotheses.length, 0);
});

t("4영역 70+ 이지만 수요 근거(Q5)=3 → 추가 검증 필요", () => {
  const r = L.buildReport({ idea: "x" }, [[5, 5, 5, 5, 3], fill(5), fill(5), fill(5)]);
  assert.strictEqual(r.verdict.key, "moreValidation");
});

t("수요 < 40 → BM 재설계 필요", () => {
  const r = L.buildReport({ idea: "x" }, [fill(2), fill(5), fill(5), fill(5)]);
  assert.strictEqual(r.areas[0].score, 25);
  assert.strictEqual(r.verdict.key, "redesign");
});

t("경쟁 환경만 < 40 → 재설계 아님(추가 검증)", () => {
  const r = L.buildReport({ idea: "x" }, [fill(5), fill(5), fill(1), fill(5)]);
  assert.strictEqual(r.verdict.key, "moreValidation");
  assert.ok(r.priority.text.startsWith("시장 조사"));
});

t("우선 과제는 STEP 순서상 첫 70 미만 영역", () => {
  const r = L.buildReport({ idea: "x" }, [fill(5), fill(3), fill(2), fill(5)]);
  assert.strictEqual(r.priority.area, "해결 가능성");
});

t("미검증 가설: 2점 이하만, 낮은 점수 순", () => {
  const r = L.buildReport({ idea: "x" }, [[1, 2, 3, 4, 5], fill(4), fill(4), [5, 5, 5, 5, 2]]);
  assert.deepStrictEqual(r.weakHypotheses.map((w) => w.qNo), [1, 2, 20]);
});

t("잘못된 입력은 에러", () => {
  assert.throws(() => L.buildReport({}, [fill(5), fill(5), fill(5)]));
  assert.throws(() => L.buildReport({}, [fill(5), fill(5), fill(5), [5, 5, 5, 5, 6]]));
});

console.log(`\n${pass}개 테스트 통과`);
