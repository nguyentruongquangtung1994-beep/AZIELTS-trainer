// Kiểm thử lõi AZ Vocabulary. Chạy: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../assets/js/vocabulary-core.js");
const TOEIC = require("../data/vocabulary-toeic.json");
const IELTS = require("../data/vocabulary-ielts.json");
const ITEMS = TOEIC.items.concat(IELTS.items);
const BYID = Object.fromEntries(ITEMS.map(i => [i.id, i]));
const clone = o => JSON.parse(JSON.stringify(o));

test("học liệu thật: 200 mục, không lỗi, đủ 10 chủ đề × 10 mục mỗi kỳ thi", () => {
  for (const bank of [TOEIC, IELTS]) {
    const v = C.validateBank(bank);
    assert.deepEqual(v.errors, []);
    assert.equal(v.items.length, 100);
    assert.equal(bank.topics.length, 10);
    for (const t of bank.topics) assert.equal(bank.items.filter(i => i.topic === t.id).length, 10, t.id);
  }
  assert.equal(new Set(ITEMS.map(i => i.id)).size, 200);
  assert.ok(ITEMS.every(i => i.reviewStatus === "draft" && i.reviewer === null && i.reviewedAt === null), "chưa duyệt thì không có tên người duyệt");
});

test("chọn bộ từ theo kỳ thi / chủ đề / độ khó", () => {
  assert.equal(C.filterItems(ITEMS, { exam: "toeic" }).length, 100);
  assert.equal(C.filterItems(ITEMS, { exam: "ielts", topic: "health" }).length, 10);
  assert.equal(C.filterItems(ITEMS, { exam: "ielts", topic: "all", level: "advanced" }).length, 20);
  assert.equal(C.filterItems(ITEMS, { exam: "toeic", topic: "hotels-restaurants", level: "basic" }).length, 4);
});

test("lượt 10/20/30 đúng số lượng, không trùng từ", () => {
  for (const n of [10, 20, 30]) for (let s = 1; s <= 20; s++) {
    const r = C.buildRound(ITEMS, { exam: "toeic", count: n, dir: "en-vi" }, C.makeRng(s));
    assert.ok(r.ok);
    assert.equal(r.round.questions.length, n);
    assert.equal(C.hasDuplicateItems(r.round), false);
  }
});

test("không đủ từ: báo số từ hiện có, không lặp để bù", () => {
  const r = C.buildRound(ITEMS, { exam: "toeic", topic: "office-meetings", level: "advanced", count: 10 }, C.makeRng(1));
  assert.deepEqual(r, { ok: false, available: 2 });
});

test("xáo trộn không làm mất hay nhân đôi đáp án, vị trí đáp án đúng thay đổi", () => {
  const positions = new Set();
  for (let s = 1; s <= 40; s++) for (const dir of C.DIRS) {
    const it = ITEMS[s % ITEMS.length], q = C.makeQuestion(it, dir, C.makeRng(s));
    const want = dir === "en-vi" ? [it.meaningVi].concat(it.distractorsVi) : [it.term].concat(it.reverseDistractorsEn);
    assert.deepEqual(q.options.slice().sort(), want.slice().sort());
    assert.equal(q.options[q.answer], want[0]);
    positions.add(q.answer);
  }
  assert.equal(positions.size, 4);
  const arr = Array.from({ length: 50 }, (_, i) => i);
  assert.deepEqual(C.shuffle(arr, C.makeRng(7)).sort((a, b) => a - b), arr);
});

test("ghi đáp án: bấm nhiều lần chỉ ghi một, không ghi câu khác thứ tự", () => {
  const r = C.buildRound(ITEMS, { exam: "ielts", count: 10 }, C.makeRng(3)).round;
  assert.equal(C.recordAnswer(r, 0, 2), true);
  assert.equal(C.recordAnswer(r, 0, 1), false, "bấm lần 2 vào câu đã trả lời");
  assert.equal(C.recordAnswer(r, 5, 1), false, "không nhảy câu");
  assert.equal(C.recordAnswer(r, 1, 9), false, "lựa chọn ngoài phạm vi");
  assert.equal(r.answers.length, 1);
  assert.equal(r.answers[0].choice, 2);
});

test("tính kết quả khớp đáp án đã chọn", () => {
  const r = C.buildRound(ITEMS, { exam: "toeic", count: 10 }, C.makeRng(11)).round;
  r.questions.forEach((q, i) => C.recordAnswer(r, i, i < 7 ? q.answer : (q.answer + 1) % 4));
  const s = C.scoreRound(r);
  assert.equal(s.correct, 7); assert.equal(s.total, 10); assert.equal(s.pct, 70);
  assert.deepEqual(s.wrongIds, r.questions.slice(7).map(q => q.itemId));
  assert.equal(s.rows[8].chosenText, r.questions[8].options[(r.questions[8].answer + 1) % 4]);
  assert.equal(C.isComplete(r), true);
  assert.equal(C.recordAnswer(r, 10, 0), false, "không ghi thêm khi đã đủ");
});

test("phục hồi lượt sau khi tải lại: giữ câu đã trả lời và thứ tự đáp án", () => {
  const p = C.emptyProgress();
  p.active = C.buildRound(ITEMS, { exam: "ielts", count: 10, dir: "vi-en" }, C.makeRng(5)).round;
  C.recordAnswer(p.active, 0, 1); C.recordAnswer(p.active, 1, 3);
  const restored = JSON.parse(JSON.stringify(p));                 // như lưu localStorage rồi đọc lại
  assert.ok(C.validateProgress(restored).ok);
  assert.deepEqual(restored.active.questions, p.active.questions);
  assert.equal(restored.active.answers.length, 2);
  assert.equal(C.recordAnswer(restored.active, 1, 0), false, "tải lại lúc đang chuyển thẻ không ghi trùng câu 2");
  assert.equal(C.recordAnswer(restored.active, 2, 0), true);
});

test("lượt ôn chỉ chứa từ sai, xáo lại, không sửa lượt đầu", () => {
  const main = C.buildRound(ITEMS, { exam: "toeic", count: 10 }, C.makeRng(21)).round;
  main.questions.forEach((q, i) => C.recordAnswer(main, i, i % 3 === 0 ? (q.answer + 1) % 4 : q.answer));
  main.finishedAt = Date.now();
  const before = clone(main), wrong = C.scoreRound(main).wrongIds;
  const rv = C.buildReviewRound(main, BYID, C.makeRng(22));
  assert.equal(rv.kind, "review"); assert.equal(rv.parentId, main.id); assert.equal(rv.rootId, main.id);
  assert.deepEqual(rv.questions.map(q => q.itemId).sort(), wrong.slice().sort());
  rv.questions.forEach((q, i) => C.recordAnswer(rv, i, q.answer));
  assert.deepEqual(main, before, "lượt đầu giữ nguyên");
  assert.equal(C.scoreRound(main).correct, 6);
  assert.equal(C.buildReviewRound(rv, BYID), null, "đúng hết thì không có lượt ôn tiếp");
  const p = C.emptyProgress(); p.history.push(main, rv);
  assert.ok(C.validateProgress(p).ok);
});

test("lịch ôn 1/3/7 ngày theo ngày địa phương; lượt ôn ngay không đổi lịch", () => {
  const r = C.buildRound(ITEMS, { exam: "ielts", count: 10 }, C.makeRng(31)).round;
  r.questions.forEach((q, i) => C.recordAnswer(r, i, i === 0 ? (q.answer + 1) % 4 : q.answer));
  const w = C.applySchedule({}, r, "2026-10-30");
  assert.equal(w[r.questions[0].itemId].due, "2026-10-31");
  assert.equal(w[r.questions[1].itemId].due, "2026-11-02");
  assert.deepEqual(C.dueIds(w, "2026-10-31"), [r.questions[0].itemId]);
  const rv = clone(r); rv.kind = "review";
  assert.deepEqual(C.applySchedule(clone(w), rv, "2026-10-31"), w);
  assert.equal(C.addDays("2026-12-30", 3), "2027-01-02");
  assert.equal(C.streak(["2026-10-28", "2026-10-29", "2026-10-30"], "2026-10-30"), 3);
  assert.equal(C.streak(["2026-10-28", "2026-10-29"], "2026-10-30"), 2, "chưa học hôm nay vẫn giữ chuỗi tới hôm qua");
  assert.equal(C.streak(["2026-10-27"], "2026-10-30"), 0);
});

test("kiểm tra schema mục từ bắt đúng các lỗi", () => {
  const good = clone(TOEIC.items[0]);
  const errs = mut => { const it = clone(good); mut(it); return C.validateItem(it, TOEIC.topics.map(t => t.id)).errors.join(" | "); };
  assert.equal(errs(() => {}), "");
  assert.match(errs(it => { delete it.exampleEn; }), /thiếu trường bắt buộc exampleEn/);
  assert.match(errs(it => { it.usageNoteVi = "  "; }), /chuỗi trống ở usageNoteVi/);
  assert.match(errs(it => { it.distractorsVi = ["a", "a", "b"]; }), /trùng/);
  assert.match(errs(it => { it.distractorsVi[1] = it.meaningVi; }), /chứa chính đáp án đúng/);
  assert.match(errs(it => { it.reverseDistractorsEn = ["x", "y"]; }), /cần đúng 3 mục/);
  assert.match(errs(it => { it.exam = "sat"; }), /exam không hợp lệ/);
  assert.match(errs(it => { it.level = "expert"; }), /level không hợp lệ/);
  assert.match(errs(it => { it.exampleVi = "<script>alert(1)</script>"; }), /thẻ HTML/);
  assert.match(errs(it => { it.audioUrl = "javascript:alert(1)"; }), /audioUrl/);
  assert.match(errs(it => { it.topic = "khong-co"; }), /chủ đề chưa khai báo/);
  assert.match(errs(it => { it.reviewStatus = "reviewed"; }), /reviewer và reviewedAt/);
  const bank = clone(TOEIC); bank.items[1].id = bank.items[0].id;
  assert.match(C.validateBank(bank).errors.join(" "), /ID trùng/);
  assert.equal(C.isSafeAudioUrl("audio/toeic/agenda.mp3"), true);
  assert.equal(C.isSafeAudioUrl("https://example.com/a.mp3"), true);
  assert.equal(C.isSafeAudioUrl("//evil.com/a.mp3"), false);
});

test("kiểm tra file tiến độ và gộp khi nhập", () => {
  assert.equal(C.validateProgress({ schema: "khac" }).ok, false);
  const a = C.emptyProgress(), b = C.emptyProgress();
  const r1 = C.buildRound(ITEMS, { exam: "toeic", count: 10 }, C.makeRng(41)).round; r1.finishedAt = 1;
  const r2 = C.buildRound(ITEMS, { exam: "ielts", count: 10 }, C.makeRng(42)).round; r2.finishedAt = 2;
  a.history.push(r1); a.days = ["2026-10-01"]; a.words = { x: { last: "2026-10-01", due: null } };
  b.history.push(r1, r2); b.days = ["2026-10-02"]; b.words = { x: { last: "2026-10-05", due: "2026-10-06" } };
  const m = C.mergeProgress(a, b);
  assert.equal(m.history.length, 2);
  assert.deepEqual(m.days, ["2026-10-01", "2026-10-02"]);
  assert.equal(m.words.x.last, "2026-10-05");
  const broken = clone(b); broken.history[0].answers = [{ itemId: "sai", choice: 0 }];
  assert.equal(C.validateProgress(broken).ok, false);
});

test("hết giờ: ghi TIMEOUT, tính như sai, vào danh sách ôn, file tiến độ vẫn hợp lệ", () => {
  const r = C.buildRound(ITEMS, { exam: "ielts", count: 10 }, C.makeRng(51)).round;
  assert.equal(C.recordAnswer(r, 0, C.TIMEOUT), true);
  assert.equal(C.recordAnswer(r, 1, -2), false, "giá trị lạ bị từ chối");
  r.questions.slice(1).forEach((q, i) => C.recordAnswer(r, i + 1, q.answer));
  const s = C.scoreRound(r);
  assert.equal(s.correct, 9);
  assert.equal(s.rows[0].timedOut, true);
  assert.equal(s.rows[0].chosenText, null);
  assert.deepEqual(s.wrongIds, [r.questions[0].itemId]);
  const p = C.emptyProgress(); p.history.push(r);
  assert.ok(C.validateProgress(JSON.parse(JSON.stringify(p))).ok);
  assert.equal(p.prefs.timer, 8);
  assert.deepEqual(C.TIMERS, [5, 8, 12]);
});
