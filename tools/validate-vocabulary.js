// Kiểm tra học liệu trước khi đẩy lên web. Dùng: node tools/validate-vocabulary.js [file.json ...]
// Mặc định kiểm tra data/vocabulary-toeic.json và data/vocabulary-ielts.json. Thoát mã 1 nếu có lỗi.
const fs = require("fs"), path = require("path");
const C = require("../assets/js/vocabulary-core.js");
const files = process.argv.slice(2).length ? process.argv.slice(2) : ["toeic", "ielts"].map(e => path.join(__dirname, "..", "data", "vocabulary-" + e + ".json"));
let bad = 0;
for (const f of files) {
  let bank;
  try { bank = JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { console.log("✗", f, "— không đọc được JSON:", e.message); bad++; continue; }
  const v = C.validateBank(bank);
  const lv = {}; v.items.forEach(i => { lv[i.level] = (lv[i.level] || 0) + 1; });
  console.log((v.errors.length ? "✗ " : "✓ ") + path.basename(f) + ": " + v.items.length + " mục hợp lệ · " + v.topics.length + " chủ đề · " + JSON.stringify(lv) + " · " + v.errors.length + " lỗi · " + v.warnings.length + " cảnh báo");
  v.errors.forEach(e => console.log("   LỖI  ", e));
  v.warnings.forEach(w => console.log("   lưu ý", w));
  bad += v.errors.length;
}
console.log("\nKiểm tra tự động không thay thế giáo viên duyệt nghĩa và độ tự nhiên của câu.");
process.exit(bad ? 1 : 0);
