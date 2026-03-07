const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");
const db = require("../db");
const { uid } = require("../utils");

function ensureSource({ name, sourceType, ownerTeacherId = null, metadata = null }) {
  const found = db
    .prepare(`SELECT * FROM vocab_sources WHERE name = ? AND source_type = ?`)
    .get(name, sourceType);
  if (found) return found.id;

  const id = uid();
  db.prepare(
    `INSERT INTO vocab_sources (id, name, source_type, owner_teacher_id, metadata)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, name, sourceType, ownerTeacherId, metadata ? JSON.stringify(metadata) : null);
  return id;
}

function ensureLesson(sourceId, lessonNo, title = null) {
  const row = db
    .prepare(`SELECT * FROM vocab_lessons WHERE source_id = ? AND lesson_no = ?`)
    .get(sourceId, lessonNo);
  if (row) return row.id;

  const id = uid();
  db.prepare(
    `INSERT INTO vocab_lessons (id, source_id, lesson_no, title)
     VALUES (?, ?, ?, ?)`
  ).run(id, sourceId, lessonNo, title);
  return id;
}

function insertVocabItem(sourceId, lessonId, lemma, meaningPrimary, exampleSentence = null) {
  db.prepare(
    `INSERT INTO vocab_items (id, source_id, lesson_id, lemma, meaning_primary, example_sentence)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(uid(), sourceId, lessonId, lemma, meaningPrimary, exampleSentence);
}

function importFromCsv(filePath, options) {
  const csvText = fs.readFileSync(path.resolve(filePath), "utf8");
  const records = parse(csvText, { columns: true, skip_empty_lines: true });
  const sourceId = ensureSource(options);

  const tx = db.transaction(() => {
    for (const r of records) {
      const lessonNo = Number(r.lesson_no || r.lesson || 1);
      const lessonId = ensureLesson(sourceId, lessonNo, r.lesson_title || null);
      insertVocabItem(sourceId, lessonId, String(r.lemma || r.word), String(r.meaning_primary || r.meaning || r.translation), r.example_sentence || null);
    }
  });

  tx();
  return { sourceId, imported: records.length };
}

function importFromJson(jsonRows, options) {
  const sourceId = ensureSource(options);

  const tx = db.transaction(() => {
    for (const r of jsonRows) {
      const lessonNo = Number(r.lesson_no || r.lesson || 1);
      const lessonId = ensureLesson(sourceId, lessonNo, r.lesson_title || null);
      insertVocabItem(sourceId, lessonId, String(r.lemma || r.word), String(r.meaning_primary || r.meaning || r.translation), r.example_sentence || null);
    }
  });

  tx();
  return { sourceId, imported: jsonRows.length };
}

module.exports = {
  importFromCsv,
  importFromJson,
};
