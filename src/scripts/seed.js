const db = require("../db");
const { hashPassword } = require("../services/auth");
const { generateTestForAssignment } = require("../services/testGenerator");

function resetDemoData() {
  const tx = db.transaction(() => {
    db.exec(`
      DELETE FROM notification_log;
      DELETE FROM outbox_events;
      DELETE FROM proxy_submission_log;
      DELETE FROM student_answers;
      DELETE FROM student_vocab_stats;
      DELETE FROM test_questions;
      DELETE FROM test_sessions;
      DELETE FROM homework_assignments;
      DELETE FROM vocab_items;
      DELETE FROM vocab_lessons;
      DELETE FROM vocab_sources;
      DELETE FROM login_access_links;
      DELETE FROM app_settings;
      DELETE FROM auth_sessions;
      DELETE FROM student_devices;
      DELETE FROM devices;
      DELETE FROM student_parents;
      DELETE FROM users;
      DELETE FROM parents;
      DELETE FROM students;
      DELETE FROM teachers;
    `);
  });

  tx();
}

function seedSource(sourceId, name, sourceType, ownerTeacherId, lessons) {
  db.prepare(
    `INSERT INTO vocab_sources (id, name, source_type, owner_teacher_id, metadata)
     VALUES (?, ?, ?, ?, ?)`
  ).run(sourceId, name, sourceType, ownerTeacherId, JSON.stringify({ seeded: true }));

  for (const lesson of lessons) {
    const lessonId = `${sourceId}_lesson_${lesson.no}`;
    db.prepare(`INSERT INTO vocab_lessons (id, source_id, lesson_no, title) VALUES (?, ?, ?, ?)`).run(
      lessonId,
      sourceId,
      lesson.no,
      lesson.title
    );

    for (const word of lesson.words) {
      db.prepare(
        `INSERT INTO vocab_items (id, source_id, lesson_id, lemma, meaning_primary, example_sentence)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(word.id, sourceId, lessonId, word.lemma, word.meaning, word.example);
    }
  }
}

function createAssignment({
  id,
  studentId,
  teacherId,
  sourceId,
  rangeStartLesson,
  rangeEndLesson,
  questionCount,
  publishAt,
  dueAt,
}) {
  db.prepare(
    `INSERT INTO homework_assignments
     (id, student_id, teacher_id, source_id, range_start_lesson, range_end_lesson, question_count, publish_at, due_at, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'SCHEDULED', ?, ?)`
  ).run(id, studentId, teacherId, sourceId, rangeStartLesson, rangeEndLesson, questionCount, publishAt, dueAt, publishAt, publishAt);
}

function seed() {
  resetDemoData();

  const teacherId = "teacher_demo_1";
  const studentId = "student_demo_1";
  const parentId = "parent_demo_1";
  const basicSourceId = "source_demo_basic";
  const toeicSourceId = "source_demo_toeic_hs1";

  db.prepare(`INSERT INTO teachers (id, name) VALUES (?, ?)`).run(teacherId, "홍길동 선생님");
  db.prepare(`INSERT INTO students (id, student_code, name, timezone) VALUES (?, ?, ?, ?)`).run(studentId, "S-001", "김학생", "Asia/Seoul");
  db.prepare(`INSERT INTO parents (id, name, phone, email) VALUES (?, ?, ?, ?)`).run(parentId, "김학부모", "010-0000-0000", "parent@example.com");

  db.prepare(
    `INSERT INTO student_parents (id, student_id, parent_id, relation_label, receives_reports)
     VALUES (?, ?, ?, ?, 1)`
  ).run("sp_demo_1", studentId, parentId, "mother");

  db.prepare(`INSERT INTO users (id, role, email, password_hash, teacher_id) VALUES (?, 'TEACHER', ?, ?, ?)`)
    .run("user_teacher_demo_1", "teacher@example.com", hashPassword("pass1234"), teacherId);
  db.prepare(`INSERT INTO users (id, role, email, password_hash, student_id) VALUES (?, 'STUDENT', ?, ?, ?)`)
    .run("user_student_demo_1", "student@example.com", hashPassword("pass1234"), studentId);
  db.prepare(`INSERT INTO users (id, role, email, password_hash, parent_id) VALUES (?, 'PARENT', ?, ?, ?)`)
    .run("user_parent_demo_1", "parent@example.com", hashPassword("pass1234"), parentId);
  db.prepare(`INSERT INTO users (id, role, email, password_hash) VALUES (?, 'ADMIN', ?, ?)`)
    .run("user_admin_demo_1", "admin@example.com", hashPassword("pass1234"));

  db.prepare(`INSERT INTO devices (id, fingerprint, push_token) VALUES (?, ?, ?)`).run(
    "device_demo_1",
    "demo-student-device-1",
    "push-demo-1"
  );

  db.prepare(
    `INSERT INTO student_devices (id, student_id, device_id, is_primary)
     VALUES (?, ?, ?, 1)`
  ).run("student_device_demo_1", studentId, "device_demo_1");

  seedSource(basicSourceId, "중등 영단어 기본", "INTERNAL", teacherId, [
    {
      no: 1,
      title: "Core 1",
      words: [
        { id: "basic_w1", lemma: "apple", meaning: "사과", example: "I ate an apple this morning." },
        { id: "basic_w2", lemma: "book", meaning: "책", example: "This book is very interesting." },
        { id: "basic_w3", lemma: "chair", meaning: "의자", example: "Please sit on the chair." },
        { id: "basic_w4", lemma: "dance", meaning: "춤추다", example: "They dance every weekend." },
      ],
    },
    {
      no: 2,
      title: "Core 2",
      words: [
        { id: "basic_w5", lemma: "energy", meaning: "에너지", example: "Exercise gives me energy." },
        { id: "basic_w6", lemma: "future", meaning: "미래", example: "She plans her future carefully." },
        { id: "basic_w7", lemma: "garden", meaning: "정원", example: "My grandmother grows flowers in her garden." },
        { id: "basic_w8", lemma: "honest", meaning: "정직한", example: "He is always honest with his friends." },
      ],
    },
    {
      no: 3,
      title: "Core 3",
      words: [
        { id: "basic_w9", lemma: "island", meaning: "섬", example: "We visited a beautiful island." },
        { id: "basic_w10", lemma: "journey", meaning: "여행", example: "Their journey took two days." },
        { id: "basic_w11", lemma: "knowledge", meaning: "지식", example: "Reading builds knowledge." },
        { id: "basic_w12", lemma: "language", meaning: "언어", example: "English is a global language." },
      ],
    },
  ]);

  seedSource(toeicSourceId, "고1-토익 기출형 빈출 어휘", "TOEIC_HS1_DEMO", teacherId, [
    {
      no: 1,
      title: "Business Basics",
      words: [
        { id: "toeic_w1", lemma: "approve", meaning: "승인하다", example: "The manager will approve the revised budget tomorrow." },
        { id: "toeic_w2", lemma: "budget", meaning: "예산", example: "Our team stayed within the budget this quarter." },
        { id: "toeic_w3", lemma: "client", meaning: "고객", example: "The client requested an updated proposal by Friday." },
        { id: "toeic_w4", lemma: "confirm", meaning: "확인하다", example: "Please confirm the meeting time by email." },
        { id: "toeic_w5", lemma: "deadline", meaning: "마감일", example: "Everyone must submit the report before the deadline." },
        { id: "toeic_w6", lemma: "efficient", meaning: "효율적인", example: "The new filing system is more efficient than the old one." },
        { id: "toeic_w7", lemma: "estimate", meaning: "견적, 추정하다", example: "The sales team will estimate next month's demand." },
        { id: "toeic_w8", lemma: "schedule", meaning: "일정을 잡다, 일정", example: "We need to schedule a training session for new staff." },
      ],
    },
    {
      no: 2,
      title: "Meetings and Contracts",
      words: [
        { id: "toeic_w9", lemma: "agreement", meaning: "합의, 계약", example: "Both companies signed the agreement last week." },
        { id: "toeic_w10", lemma: "agenda", meaning: "의제", example: "The chairperson shared the agenda before the conference call." },
        { id: "toeic_w11", lemma: "arrange", meaning: "준비하다, 정리하다", example: "The assistant will arrange transportation for the guests." },
        { id: "toeic_w12", lemma: "attend", meaning: "참석하다", example: "All department heads must attend the annual workshop." },
        { id: "toeic_w13", lemma: "negotiate", meaning: "협상하다", example: "They plan to negotiate a better shipping rate." },
        { id: "toeic_w14", lemma: "participate", meaning: "참여하다", example: "More employees are expected to participate in the survey." },
        { id: "toeic_w15", lemma: "postpone", meaning: "연기하다", example: "The company decided to postpone the launch event." },
        { id: "toeic_w16", lemma: "proposal", meaning: "제안서", example: "Her proposal impressed the executive committee." },
      ],
    },
    {
      no: 3,
      title: "Finance and Office Work",
      words: [
        { id: "toeic_w17", lemma: "accurate", meaning: "정확한", example: "Please make sure the figures are accurate before printing." },
        { id: "toeic_w18", lemma: "expense", meaning: "비용, 지출", example: "Travel expenses must be reported within five days." },
        { id: "toeic_w19", lemma: "file", meaning: "파일로 정리하다, 서류철", example: "The clerk will file the contracts in alphabetical order." },
        { id: "toeic_w20", lemma: "invoice", meaning: "청구서", example: "The supplier sent the invoice this morning." },
        { id: "toeic_w21", lemma: "monitor", meaning: "점검하다, 모니터", example: "The supervisor will monitor customer feedback daily." },
        { id: "toeic_w22", lemma: "outstanding", meaning: "미지급의, 뛰어난", example: "Several outstanding bills need immediate attention." },
        { id: "toeic_w23", lemma: "revenue", meaning: "수익", example: "The company reported higher revenue than expected." },
        { id: "toeic_w24", lemma: "submit", meaning: "제출하다", example: "You must submit the application form by noon." },
      ],
    },
    {
      no: 4,
      title: "Marketing and Service",
      words: [
        { id: "toeic_w25", lemma: "advertise", meaning: "광고하다", example: "The store will advertise the weekend sale online." },
        { id: "toeic_w26", lemma: "campaign", meaning: "캠페인", example: "The campaign increased brand awareness among teens." },
        { id: "toeic_w27", lemma: "complaint", meaning: "불만", example: "The manager handled the complaint politely." },
        { id: "toeic_w28", lemma: "inquiry", meaning: "문의", example: "We received an inquiry about international delivery." },
        { id: "toeic_w29", lemma: "promotion", meaning: "홍보, 승진", example: "The promotion attracted many first-time visitors." },
        { id: "toeic_w30", lemma: "respond", meaning: "응답하다", example: "Please respond to the customer within twenty-four hours." },
        { id: "toeic_w31", lemma: "satisfy", meaning: "만족시키다", example: "The new policy will satisfy most employees." },
        { id: "toeic_w32", lemma: "valuable", meaning: "가치 있는", example: "Her feedback was valuable during the redesign process." },
      ],
    },
    {
      no: 5,
      title: "Logistics and Travel",
      words: [
        { id: "toeic_w33", lemma: "baggage", meaning: "수하물", example: "Passengers should label their baggage clearly." },
        { id: "toeic_w34", lemma: "customs", meaning: "세관", example: "Travelers must show the receipt at customs." },
        { id: "toeic_w35", lemma: "delay", meaning: "지연, 지연시키다", example: "A heavy storm may delay the arrival of the cargo." },
        { id: "toeic_w36", lemma: "depart", meaning: "출발하다", example: "The train will depart from platform three." },
        { id: "toeic_w37", lemma: "destination", meaning: "목적지", example: "Please check that the destination is correct on the label." },
        { id: "toeic_w38", lemma: "reservation", meaning: "예약", example: "Your hotel reservation has already been confirmed." },
        { id: "toeic_w39", lemma: "shipment", meaning: "배송품, 선적", example: "The shipment arrived two days earlier than planned." },
        { id: "toeic_w40", lemma: "transfer", meaning: "이동하다, 환승하다", example: "You can transfer to the airport bus at the station." },
      ],
    },
    {
      no: 6,
      title: "Workplace Growth",
      words: [
        { id: "toeic_w41", lemma: "achieve", meaning: "달성하다", example: "The sales division achieved its target ahead of schedule." },
        { id: "toeic_w42", lemma: "evaluate", meaning: "평가하다", example: "Supervisors evaluate employee performance twice a year." },
        { id: "toeic_w43", lemma: "implement", meaning: "실행하다", example: "The factory will implement the safety guidelines immediately." },
        { id: "toeic_w44", lemma: "motivate", meaning: "동기를 부여하다", example: "The speaker's advice helped motivate the interns." },
        { id: "toeic_w45", lemma: "orientation", meaning: "오리엔테이션", example: "New hires must attend orientation on Monday morning." },
        { id: "toeic_w46", lemma: "qualify", meaning: "자격을 갖추다", example: "Applicants must qualify for the internship program." },
        { id: "toeic_w47", lemma: "recruit", meaning: "채용하다", example: "The company plans to recruit more software engineers." },
        { id: "toeic_w48", lemma: "responsibility", meaning: "책임", example: "Managing the inventory is one of her main responsibilities." },
      ],
    },
  ]);

  const now = Date.now();
  const basicPublishAt = new Date(now - 1000 * 60 * 20).toISOString();
  const basicDueAt = new Date(now + 1000 * 60 * 90).toISOString();
  const toeicPublishAt = new Date(now - 1000 * 60 * 15).toISOString();
  const toeicDueAt = new Date(now + 1000 * 60 * 180).toISOString();
  const upcomingPublishAt = new Date(now + 1000 * 60 * 45).toISOString();
  const upcomingDueAt = new Date(now + 1000 * 60 * 240).toISOString();

  createAssignment({
    id: "assignment_demo_basic",
    studentId,
    teacherId,
    sourceId: basicSourceId,
    rangeStartLesson: 1,
    rangeEndLesson: 3,
    questionCount: 6,
    publishAt: basicPublishAt,
    dueAt: basicDueAt,
  });

  createAssignment({
    id: "assignment_demo_toeic_live",
    studentId,
    teacherId,
    sourceId: toeicSourceId,
    rangeStartLesson: 1,
    rangeEndLesson: 4,
    questionCount: 12,
    publishAt: toeicPublishAt,
    dueAt: toeicDueAt,
  });

  createAssignment({
    id: "assignment_demo_toeic_upcoming",
    studentId,
    teacherId,
    sourceId: toeicSourceId,
    rangeStartLesson: 5,
    rangeEndLesson: 6,
    questionCount: 8,
    publishAt: upcomingPublishAt,
    dueAt: upcomingDueAt,
  });

  generateTestForAssignment("assignment_demo_toeic_live");

  console.log("Seed completed");
  console.log("Teacher login: teacher@example.com / pass1234");
  console.log("Student login: student@example.com / pass1234");
  console.log("Parent login:  parent@example.com / pass1234");
  console.log("Admin login:   admin@example.com / pass1234");
  console.log("Ready source:  고1-토익 기출형 빈출 어휘");
  console.log("Ready task:    assignment_demo_toeic_live");
}

seed();
