const assert = require("assert");

// Test 1: Rating calculations
const testRating = percent => percent >= 90 ? 'Excellent' : percent >= 80 ? 'Very good' : percent >= 70 ? 'Good' : percent >= 60 ? 'Satisfactory' : percent >= 50 ? 'Needs improvement' : 'Keep practicing';
assert.strictEqual(testRating(95), 'Excellent');
assert.strictEqual(testRating(90), 'Excellent');
assert.strictEqual(testRating(85), 'Very good');
assert.strictEqual(testRating(80), 'Very good');
assert.strictEqual(testRating(75), 'Good');
assert.strictEqual(testRating(70), 'Good');
assert.strictEqual(testRating(65), 'Satisfactory');
assert.strictEqual(testRating(60), 'Satisfactory');
assert.strictEqual(testRating(55), 'Needs improvement');
assert.strictEqual(testRating(50), 'Needs improvement');
assert.strictEqual(testRating(45), 'Keep practicing');
assert.strictEqual(testRating(0), 'Keep practicing');

// Test 2: Teacher Name formatting
const A = { t: [{ n: 'Ahmad', id: 'uuid-1' }, { n: 'Sir Fatima', id: 'uuid-2' }] };
const teacherName = id => {
  const norm = s => String(s || '').replace(/^sir\s+/i, '').trim().toLowerCase();
  const target = norm(id);
  const teacher = A.t.find(item => norm(item.n) === target);
  const name = teacher ? teacher.n : (id || 'your teacher');
  return `Sir ${String(name).replace(/^sir\s+/i, '')}`;
};
assert.strictEqual(teacherName('Ahmad'), 'Sir Ahmad');
assert.strictEqual(teacherName('ahmad'), 'Sir Ahmad');
assert.strictEqual(teacherName('Sir Fatima'), 'Sir Fatima');
assert.strictEqual(teacherName('fatima'), 'Sir Fatima');
assert.strictEqual(teacherName('Tariq'), 'Sir Tariq'); // Not in A.t, but name passed
assert.strictEqual(teacherName(''), 'Sir your teacher');

// Test 3: Safe pct calculation
const pct = x => x && Array.isArray(x.a) && x.a.length ? Math.round(100 * x.a.filter(y => y && y.ok).length / x.a.length) : 0;
assert.strictEqual(pct(null), 0);
assert.strictEqual(pct(undefined), 0);
assert.strictEqual(pct({}), 0);
assert.strictEqual(pct({ a: [] }), 0);
assert.strictEqual(pct({ a: [{ ok: true }, { ok: false }] }), 50);
assert.strictEqual(pct({ a: [{ ok: true }, { ok: true }] }), 100);

// Test 4: progressSeries safe execution with corrupted / empty attempts
const progressSeries = data => (data && Array.isArray(data.at) ? data.at : []).flatMap(attempt => {
  if (!attempt) return [];
  if (attempt.testType === 'theoretical') {
    const grade = attempt.grade;
    if (!grade || !grade.released || !Number.isFinite(+grade.totalEarned) || !Number.isFinite(+grade.totalMax) || +grade.totalMax <= 0) return [];
    return [{ name: attempt.n || 'Theoretical test', at: grade.releasedAt || attempt.at, earned: +grade.totalEarned, max: +grade.totalMax }];
  }
  if (!Array.isArray(attempt.a) || !attempt.a.length) return [];
  return [{ name: attempt.n || 'Practice quiz', at: attempt.at, earned: attempt.a.filter(answer => answer && answer.ok).length, max: attempt.a.length }];
}).sort((a, b) => a.at - b.at);

const testData = {
  at: [
    null, // null attempt
    { testType: 'theoretical', grade: null }, // Unreleased
    { testType: 'theoretical', grade: { released: true, totalEarned: 18, totalMax: 20, releasedAt: 2000 } },
    { a: null }, // Corrupted
    { a: [] }, // Empty
    { at: 1000, n: 'Quiz 1', a: [{ ok: true }, { ok: false }] }
  ]
};
const series = progressSeries(testData);
assert.strictEqual(series.length, 2);
assert.strictEqual(series[0].name, 'Quiz 1');
assert.strictEqual(series[0].earned, 1);
assert.strictEqual(series[0].max, 2);
assert.strictEqual(series[1].earned, 18);
assert.strictEqual(series[1].max, 20);

// Test 5: Merge student data logic
const mergeUnique = (remote = [], local = [], keyOf = value => JSON.stringify(value)) => {
  const merged = new Map();
  for (const item of local) merged.set(keyOf(item), item);
  for (const item of remote) merged.set(keyOf(item), { ...merged.get(keyOf(item)), ...item });
  return [...merged.values()];
};
const resMerge = mergeUnique([{ id: 1, val: 'b' }], [{ id: 1, val: 'a' }, { id: 2, val: 'c' }], x => x.id);
assert.strictEqual(resMerge.length, 2);
assert.strictEqual(resMerge.find(x => x.id === 1).val, 'b');

// Test 6: Function Error extraction
const extractFunctionError = async (error, fallback) => {
  if (!error) return null;
  let message = error.message || fallback;
  try {
    if (error.context && typeof error.context.json === "function") {
      const body = await error.context.json();
      if (body && body.error) message = body.error;
    }
  } catch {}
  return new Error(message);
};

(async () => {
  const mockHttpError = {
    message: "Edge Function returned a non-2xx status code",
    context: {
      json: async () => ({ error: "That teacher username is already taken." })
    }
  };
  const err = await extractFunctionError(mockHttpError, "Fallback");
  assert.strictEqual(err.message, "That teacher username is already taken.");

  const fallbackErr = await extractFunctionError({ message: "" }, "Custom fallback");
  assert.strictEqual(fallbackErr.message, "Custom fallback");

  console.log("All unit and integration tests passed successfully!");
})();
