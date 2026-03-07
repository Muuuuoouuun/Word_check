(() => {
  const AUTH_STORAGE_KEYS = ["accessToken", "role", "studentId", "teacherId", "parentId"];

  function readStoredAuth(key) {
    return localStorage.getItem(key) || sessionStorage.getItem(key) || null;
  }

  function clearStoredAuth() {
    AUTH_STORAGE_KEYS.forEach((key) => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });
  }

  function authStorage(rememberLogin) {
    return rememberLogin ? localStorage : sessionStorage;
  }

  const state = {
    token: readStoredAuth("accessToken"),
    role: readStoredAuth("role"),
    studentId: readStoredAuth("studentId"),
    teacherId: readStoredAuth("teacherId"),
    parentId: readStoredAuth("parentId"),
    rememberLogin: localStorage.getItem("rememberLogin") !== "0",
    studentExam: null,
    studentExamTimerId: null,
    studentResult: null,
    studentReview: null,
    teacherMeta: null,
    teacherAssignments: [],
    teacherSettings: null,
    teacherSettingsOwnerId: null,
    teacherAccessLink: null,
    teacherFilters: {
      status: "ALL",
      keyword: "",
    },
    teacherViewMode: "BOTH",
    teacherWeekOffset: 0,
    teacherEditingSessionId: null,
    teacherQuestions: [],
    teacherOfflineSessionId: null,
    teacherOfflineQuestions: [],
    teacherOfflineContext: null,
  };

  const loginPanel = document.getElementById("loginPanel");
  const appPanel = document.getElementById("appPanel");
  const studentView = document.getElementById("studentView");
  const teacherView = document.getElementById("teacherView");
  const parentView = document.getElementById("parentView");
  const whoami = document.getElementById("whoami");
  const logoutBtn = document.getElementById("logoutBtn");
  const toastEl = document.getElementById("toast");
  const loginRouteHint = document.getElementById("loginRouteHint");

  const fpInput = document.getElementById("deviceFingerprintInput");
  const rememberLoginInput = document.getElementById("rememberLoginInput");
  const savedFingerprint = localStorage.getItem("deviceFingerprint") || `device-${Math.random().toString(16).slice(2)}`;
  fpInput.value = savedFingerprint;
  rememberLoginInput.checked = state.rememberLogin;

  function toast(message, ms = 2200) {
    toastEl.textContent = message;
    toastEl.classList.remove("hidden");
    window.clearTimeout(toastEl._timer);
    toastEl._timer = window.setTimeout(() => toastEl.classList.add("hidden"), ms);
  }

  function setRememberLogin(rememberLogin) {
    state.rememberLogin = Boolean(rememberLogin);
    localStorage.setItem("rememberLogin", state.rememberLogin ? "1" : "0");
    rememberLoginInput.checked = state.rememberLogin;

    if (state.token) {
      clearStoredAuth();
      const storage = authStorage(state.rememberLogin);
      storage.setItem("accessToken", state.token || "");
      storage.setItem("role", state.role || "");
      storage.setItem("studentId", state.studentId || "");
      storage.setItem("teacherId", state.teacherId || "");
      storage.setItem("parentId", state.parentId || "");
    }
  }

  function setAuth(data, options = {}) {
    const rememberLogin = options.rememberLogin ?? state.rememberLogin;
    state.token = data.accessToken;
    state.role = data.role;
    state.studentId = data.studentId || null;
    state.teacherId = data.teacherId || null;
    state.parentId = data.parentId || null;

    setRememberLogin(rememberLogin);
    clearStoredAuth();

    const storage = authStorage(state.rememberLogin);
    storage.setItem("accessToken", state.token || "");
    storage.setItem("role", state.role || "");
    storage.setItem("studentId", state.studentId || "");
    storage.setItem("teacherId", state.teacherId || "");
    storage.setItem("parentId", state.parentId || "");
  }

  function clearAuth() {
    clearStudentExamTimer();
    state.token = null;
    state.role = null;
    state.studentId = null;
    state.teacherId = null;
    state.parentId = null;
    state.studentExam = null;
    state.studentResult = null;
    state.studentReview = null;
    state.teacherMeta = null;
    state.teacherAssignments = [];
    state.teacherSettings = null;
    state.teacherSettingsOwnerId = null;
    state.teacherAccessLink = null;
    state.teacherViewMode = "BOTH";
    state.teacherWeekOffset = 0;
    state.teacherEditingSessionId = null;
    state.teacherQuestions = [];
    state.teacherOfflineSessionId = null;
    state.teacherOfflineQuestions = [];
    state.teacherOfflineContext = null;

    clearStoredAuth();
    setLoginRouteHint("");
  }

  async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    const isFormData = options.body instanceof FormData;

    if (!isFormData && options.body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    if (state.token) {
      headers.Authorization = `Bearer ${state.token}`;
    }

    const res = await fetch(path, {
      ...options,
      headers,
      body: !isFormData && options.body && typeof options.body !== "string" ? JSON.stringify(options.body) : options.body,
    });

    if (!res.ok) {
      let msg = `${res.status} 오류`;
      try {
        const j = await res.json();
        if (j.message) msg = j.message;
      } catch {
        // no-op
      }
      throw new Error(msg);
    }

    if ((res.headers.get("Content-Type") || "").includes("application/json")) {
      return res.json();
    }

    return res;
  }

  function getLoginTokenFromUrl() {
    return new URLSearchParams(window.location.search).get("loginToken");
  }

  function clearLoginTokenFromUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete("loginToken");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function setLoginRouteHint(message, variant = "info") {
    if (!message) {
      loginRouteHint.textContent = "";
      loginRouteHint.className = "login-route-hint hidden";
      return;
    }

    loginRouteHint.textContent = message;
    loginRouteHint.className = `login-route-hint ${variant}`;
  }

  async function tryLoginWithAccessLink() {
    const loginToken = getLoginTokenFromUrl();
    if (!loginToken) {
      setLoginRouteHint("");
      return false;
    }

    setLoginRouteHint("접속 링크를 확인하고 자동 로그인 중입니다.", "info");

    try {
      const deviceFingerprint = String(fpInput.value || "").trim();
      localStorage.setItem("deviceFingerprint", deviceFingerprint);
      const data = await api("/auth/access-links/exchange", {
        method: "POST",
        body: {
          loginToken,
          deviceFingerprint,
        },
      });

      setAuth(data, { rememberLogin: state.rememberLogin });
      clearLoginTokenFromUrl();
      setLoginRouteHint("링크 로그인 완료. 바로 화면으로 이동합니다.", "success");
      return true;
    } catch (err) {
      clearLoginTokenFromUrl();
      setLoginRouteHint(`링크 로그인 실패: ${err.message}`, "error");
      return false;
    }
  }

  function renderShell() {
    const examMode = state.role === "STUDENT" && isStudentFocusRoute();
    document.body.classList.toggle("exam-mode", examMode);
    const roleLabel = state.role === "ADMIN" ? "ADMIN 운영 모드" : state.role ? `${state.role} 로그인` : "로그인 필요";
    const roleText = roleLabel;
    whoami.textContent = roleText;
    logoutBtn.hidden = !state.role;

    if (!state.role) {
      loginPanel.classList.remove("hidden");
      appPanel.classList.add("hidden");
      studentView.classList.add("hidden");
      teacherView.classList.add("hidden");
      parentView.classList.add("hidden");
      return;
    }

    loginPanel.classList.add("hidden");
    appPanel.classList.remove("hidden");
    studentView.classList.toggle("hidden", state.role !== "STUDENT");
    teacherView.classList.toggle("hidden", !["TEACHER", "ADMIN"].includes(state.role));
    parentView.classList.toggle("hidden", state.role !== "PARENT");
  }

  function statusBadge(status) {
    if (status === "MISSED") return `<span class="badge missed">${status}</span>`;
    if (status === "COMPLETED") return `<span class="badge done">${status}</span>`;
    return `<span class="badge">${status}</span>`;
  }

  function fmtDate(v) {
    if (!v) return "-";
    const d = new Date(v);
    return d.toLocaleString("ko-KR", { hour12: false });
  }

  function toInputDateTime(iso) {
    const d = iso ? new Date(iso) : new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function dateKeyLocal(v) {
    const d = new Date(v);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function startOfWeek(baseDate) {
    const d = new Date(baseDate);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
  }

  function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  function getTeacherWeekDates() {
    const base = new Date();
    base.setDate(base.getDate() + state.teacherWeekOffset * 7);
    const weekStart = startOfWeek(base);
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }

  function fmtDay(date) {
    return date.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric", weekday: "short" });
  }

  function weekRangeText(weekDates) {
    const first = weekDates[0];
    const last = weekDates[weekDates.length - 1];
    return `${first.getFullYear()}.${pad2(first.getMonth() + 1)}.${pad2(first.getDate())} - ${last.getFullYear()}.${pad2(last.getMonth() + 1)}.${pad2(last.getDate())}`;
  }

  function getBoardTeacherId(meta = state.teacherMeta) {
    if (!meta) {
      return state.teacherSettingsOwnerId || state.teacherId || null;
    }

    if (state.role === "ADMIN") {
      return state.teacherSettingsOwnerId || meta.currentTeacherId || meta.teachers?.[0]?.id || null;
    }

    return state.teacherId || meta.currentTeacherId || meta.teachers?.[0]?.id || null;
  }

  function getTeacherSettingsValue(key, fallback) {
    const value = state.teacherSettings?.values?.[key];
    return value == null ? fallback : value;
  }

  function getDefaultDueHours() {
    const dueHours = Number(getTeacherSettingsValue("default_assignment_due_hours", 2));
    return Number.isFinite(dueHours) && dueHours > 0 ? dueHours : 2;
  }

  function buildDueAtInputValue(publishInputValue, dueHours = getDefaultDueHours()) {
    const baseDate = publishInputValue ? new Date(String(publishInputValue)) : new Date();
    const nextDate = new Date(baseDate.getTime() + dueHours * 60 * 60 * 1000);
    return toInputDateTime(nextDate.toISOString());
  }

  function teacherSettingsFieldOrder() {
    return [
      "default_assignment_due_hours",
      "supplement_min_wrong",
      "supplement_max_questions",
      "supplement_due_hours",
      "notify_student_on_publish",
      "notify_student_on_reminder",
      "student_reminder_delay_minutes",
      "notify_parent_on_completed",
      "notify_parent_on_missed",
    ];
  }

  function examDraftKey(sessionId) {
    return `examDraft:${sessionId}`;
  }

  function getStudentExamRouteSessionId() {
    const match = window.location.hash.match(/^#student-exam\/(.+)$/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  function isStudentResultRoute() {
    return window.location.hash === "#student-result";
  }

  function isStudentReviewRoute() {
    return window.location.hash === "#student-review";
  }

  function isStudentFocusRoute() {
    return Boolean(getStudentExamRouteSessionId()) || isStudentResultRoute() || isStudentReviewRoute();
  }

  function navigateToStudentExam(sessionId) {
    const nextHash = `#student-exam/${encodeURIComponent(sessionId)}`;
    if (window.location.hash === nextHash) {
      renderRoleView().catch(handleRenderError);
      return;
    }
    window.location.hash = nextHash;
  }

  function navigateToStudentResult() {
    if (window.location.hash === "#student-result") {
      renderRoleView().catch(handleRenderError);
      return;
    }
    window.location.hash = "#student-result";
  }

  function navigateToStudentReview() {
    if (window.location.hash === "#student-review") {
      renderRoleView().catch(handleRenderError);
      return;
    }
    window.location.hash = "#student-review";
  }

  function navigateToStudentDashboard({ replace = false } = {}) {
    const cleanUrl = `${window.location.pathname}${window.location.search}`;
    if (replace) {
      window.history.replaceState(null, "", cleanUrl);
      renderRoleView().catch(handleRenderError);
      return;
    }

    if (window.location.hash) {
      window.location.hash = "";
      return;
    }

    renderRoleView().catch(handleRenderError);
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => {
      const entities = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };
      return entities[char];
    });
  }

  function formatDuration(totalSeconds) {
    if (totalSeconds == null || Number.isNaN(Number(totalSeconds))) return "-";
    const safe = Math.max(0, Number(totalSeconds));
    const minutes = Math.floor(safe / 60);
    const seconds = safe % 60;
    return `${pad2(minutes)}:${pad2(seconds)}`;
  }

  function getStudentExamTimeLimitMs(questionCount) {
    const byQuestion = Math.max(1, Number(questionCount || 0)) * 60 * 1000;
    return Math.max(5 * 60 * 1000, Math.min(byQuestion, 20 * 60 * 1000));
  }

  function getStudentExamDeadlineMs(exam = state.studentExam) {
    if (!exam?.session?.startedAt) return null;
    const startedAtMs = new Date(exam.session.startedAt).getTime();
    if (Number.isNaN(startedAtMs)) return null;
    return startedAtMs + getStudentExamTimeLimitMs(exam.questions.length);
  }

  function clearStudentExamTimer() {
    if (state.studentExamTimerId) {
      window.clearInterval(state.studentExamTimerId);
      state.studentExamTimerId = null;
    }
  }

  function getReviewBatches(items = []) {
    const batches = [];
    for (let i = 0; i < items.length; i += 3) {
      batches.push(items.slice(i, i + 3));
    }
    return batches;
  }

  function studentResultSummaryMarkup() {
    if (!state.studentResult) return "";

    const result = state.studentResult;
    const wrongPreview = (result.wrongItems || [])
      .slice(0, 3)
      .map(
        (item) => `
          <li>
            <strong>${escapeHtml(item.expectedAnswer)}</strong>
            <span class="meta">정답: ${escapeHtml(item.meaningPrimary || item.prompt || "")}</span>
          </li>
        `
      )
      .join("");

    return `
      <section class="paper result-brief">
        <div class="paper-head">
          <h2>최근 시험 결과</h2>
          <p>제출 직후 결과 요약입니다. 오답노트와 다시 보기를 바로 이어갈 수 있습니다.</p>
        </div>
        <div class="kpi-grid kpi-grid-compact">
          <article class="kpi"><p class="kpi-label">점수</p><p class="kpi-value">${result.score}/${result.outOf}</p></article>
          <article class="kpi"><p class="kpi-label">정답</p><p class="kpi-value">${result.correctCount}</p></article>
          <article class="kpi"><p class="kpi-label">오답</p><p class="kpi-value">${result.wrongCount}</p></article>
          <article class="kpi"><p class="kpi-label">소요 시간</p><p class="kpi-value">${formatDuration(result.elapsedSeconds)}</p></article>
        </div>
        ${
          wrongPreview
            ? `<ul class="result-mini-list">${wrongPreview}</ul>`
            : `<p class="meta">이번 시험은 모든 문항을 맞혔습니다.</p>`
        }
        <div class="row">
          <button id="openStudentResultBtn" class="btn btn-quiet" type="button">결과 자세히 보기</button>
          ${
            result.wrongCount > 0
              ? `<button id="openStudentReviewBtn" class="btn" type="button">오답노트 열기</button>`
              : ""
          }
        </div>
      </section>
    `;
  }

  function getPendingAssignment(items) {
    return [...items]
      .filter((i) => ["SCHEDULED", "PUBLISHED", "IN_PROGRESS"].includes(i.status))
      .sort((a, b) => new Date(a.due_at) - new Date(b.due_at))[0];
  }

  function countByStatus(items, status) {
    return items.filter((x) => x.status === status).length;
  }

  async function renderStudentDashboard() {
    clearStudentExamTimer();
    const data = await api("/students/me/dashboard");
    const items = data.items || [];
    const pending = getPendingAssignment(items);

    const kpis = {
      total: items.length,
      active: items.filter((i) => ["SCHEDULED", "PUBLISHED", "IN_PROGRESS"].includes(i.status)).length,
      missed: countByStatus(items, "MISSED"),
      completed: items.filter((i) => i.test_session_status === "COMPLETED").length,
    };

    const cards = items
      .map((item) => {
        const hasSession = Boolean(item.test_session_id);
        const isPriority = pending && pending.id === item.id;
        const actionLabel = item.test_session_status === "IN_PROGRESS" ? "집중 화면으로 복귀" : "집중 시험 시작";

        return `
          <article class="card ${isPriority ? "priority" : ""}">
            <div class="row row-between">
              <h3>${isPriority ? "우선 과제" : "과제"}</h3>
              ${statusBadge(item.status)}
            </div>
            <p class="meta">배정: ${fmtDate(item.publish_at)} | 마감: ${fmtDate(item.due_at)}</p>
            <p class="meta">범위: Lesson ${item.range_start_lesson}-${item.range_end_lesson} / ${item.question_count}문항</p>
            <div class="row">
              ${hasSession ? `<button class="btn" data-action="open-session" data-session-id="${item.test_session_id}">${actionLabel}</button>` : `<button class="btn btn-quiet" disabled>시험 준비중</button>`}
              ${item.test_session_status === "COMPLETED" ? `<span class="badge done">점수 ${item.score ?? 0}/100</span>` : ""}
            </div>
          </article>
        `;
      })
      .join("");

    studentView.innerHTML = `
      ${studentResultSummaryMarkup()}
      <section class="paper">
        <div class="paper-head">
          <h2>학생 숙제 대시보드</h2>
          <p>지금 해야 할 숙제가 가장 먼저 보이도록 정렬되며, 시험은 별도 집중 화면에서 열립니다.</p>
        </div>
        <div class="kpi-grid">
          <article class="kpi"><p class="kpi-label">전체 과제</p><p class="kpi-value">${kpis.total}</p></article>
          <article class="kpi"><p class="kpi-label">진행 필요</p><p class="kpi-value">${kpis.active}</p></article>
          <article class="kpi"><p class="kpi-label">완료</p><p class="kpi-value">${kpis.completed}</p></article>
          <article class="kpi danger"><p class="kpi-label">미완료 누적</p><p class="kpi-value">${kpis.missed}</p></article>
        </div>
        <div class="stack">${cards || `<p>현재 배정된 과제가 없습니다.</p>`}</div>
      </section>
    `;

    studentView.querySelectorAll("[data-action='open-session']").forEach((btn) => {
      btn.addEventListener("click", () => openStudentSession(btn.dataset.sessionId));
    });

    const resultBtn = document.getElementById("openStudentResultBtn");
    if (resultBtn) {
      resultBtn.addEventListener("click", () => navigateToStudentResult());
    }

    const reviewBtn = document.getElementById("openStudentReviewBtn");
    if (reviewBtn) {
      reviewBtn.addEventListener("click", () => {
        state.studentReview = {
          batchIndex: 0,
          batches: getReviewBatches(state.studentResult?.wrongItems || []),
        };
        navigateToStudentReview();
      });
    }
  }

  async function ensureStudentExamLoaded(sessionId) {
    if (state.studentExam?.sessionId === sessionId && Array.isArray(state.studentExam.questions)) {
      return;
    }

    await api(`/students/test-sessions/${sessionId}/start`, { method: "POST", body: {} });
    const data = await api(`/students/test-sessions/${sessionId}/questions`);

    let answers = {};
    const saved = localStorage.getItem(examDraftKey(sessionId));
    if (saved) {
      try {
        answers = JSON.parse(saved);
      } catch {
        answers = {};
      }
    }

    const firstUnanswered = data.questions.findIndex((q) => !answers[q.id]);
    state.studentExam = {
      sessionId,
      session: data.session,
      questions: data.questions,
      index: firstUnanswered >= 0 ? firstUnanswered : 0,
      answers,
      autoSubmitting: false,
    };
  }

  async function openStudentSession(sessionId) {
    try {
      await ensureStudentExamLoaded(sessionId);
      navigateToStudentExam(sessionId);
    } catch (err) {
      toast(err.message);
    }
  }

  function syncStudentExamTimer() {
    const exam = state.studentExam;
    const timerEl = document.getElementById("examTimeLeft");
    if (!exam || !timerEl) return;

    const deadlineMs = getStudentExamDeadlineMs(exam);
    if (!deadlineMs) {
      timerEl.textContent = "-";
      timerEl.classList.remove("danger-text");
      return;
    }

    const remainingMs = deadlineMs - Date.now();
    const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    timerEl.textContent = formatDuration(remainingSeconds);
    timerEl.classList.toggle("danger-text", remainingSeconds <= 60);

    if (remainingMs <= 0 && !exam.autoSubmitting) {
      exam.autoSubmitting = true;
      toast("제한 시간이 종료되어 자동 제출합니다.", 3200);
      submitStudentSession({ skipConfirm: true, autoSubmitted: true });
    }
  }

  function mountStudentExamTimer() {
    clearStudentExamTimer();
    syncStudentExamTimer();
    state.studentExamTimerId = window.setInterval(syncStudentExamTimer, 1000);
  }

  function renderStudentExamScreen() {
    if (!state.studentExam) return;

    const { sessionId, questions, index, answers, session } = state.studentExam;
    if (!questions.length) {
      studentView.innerHTML = `
        <section class="exam-screen">
          <article class="exam-stage">
            <div class="note-lines">문제가 없습니다.</div>
          </article>
        </section>
      `;
      return;
    }

    const safeIndex = Math.max(0, Math.min(index, questions.length - 1));
    state.studentExam.index = safeIndex;
    const current = questions[safeIndex];
    const answeredCount = questions.filter((q) => (answers[q.id] || "").trim().length > 0).length;
    const percent = Math.round(((safeIndex + 1) / questions.length) * 100);
    const timeLimitMinutes = Math.round(getStudentExamTimeLimitMs(questions.length) / 60000);
    const jumpButtons = questions
      .map((question, questionIndex) => {
        const answered = (answers[question.id] || "").trim().length > 0;
        const classes = ["question-jump"];
        if (questionIndex === safeIndex) classes.push("active");
        if (answered) classes.push("answered");
        return `<button class="${classes.join(" ")}" type="button" data-jump-index="${questionIndex}">${questionIndex + 1}</button>`;
      })
      .join("");

    studentView.innerHTML = `
      <section class="exam-screen reveal">
        <article class="exam-stage">
          <div class="exam-stage-head row row-between">
            <div>
              <p class="exam-eyebrow">Focus Mode</p>
              <h2>단어 시험</h2>
              <p class="meta">대시보드를 잠시 벗어나 현재 문제에만 집중하는 화면입니다.</p>
            </div>
            <div class="row">
              <span class="badge">답변 ${answeredCount}/${questions.length}</span>
              <button id="exitExamBtn" class="btn btn-quiet" type="button">대시보드로</button>
            </div>
          </div>

          <div class="exam-summary">
            <div>
              <p class="meta">Session</p>
              <p class="mono">${escapeHtml(sessionId)}</p>
            </div>
            <div>
              <p class="meta">진행률</p>
              <p><strong>${percent}%</strong></p>
            </div>
            <div>
              <p class="meta">현재 문항</p>
              <p><strong>${safeIndex + 1} / ${questions.length}</strong></p>
            </div>
            <div>
              <p class="meta">남은 시간</p>
              <p><strong id="examTimeLeft">-</strong> / ${timeLimitMinutes}분</p>
            </div>
          </div>

          <div class="progress-wrap exam-progress">
            <div class="progress-bar" style="width:${percent}%"></div>
          </div>

          <div class="exam-sheet exam-sheet-focus">
            <div class="question-focus">
              <p class="meta">문항 ${safeIndex + 1} / ${questions.length} (${escapeHtml(current.type)})</p>
              <p class="question-main">${escapeHtml(current.prompt)}</p>
              ${
                current.blank_sentence
                  ? `<p class="question-hint">문장 힌트: ${escapeHtml(current.blank_sentence)}</p>`
                  : ""
              }
              <label>
                내 답안
                <input id="studentAnswerInput" class="exam-answer" type="text" value="${escapeHtml(answers[current.id] || "")}" placeholder="정답을 입력하세요" autocomplete="off" />
              </label>
            </div>
          </div>

          <div class="exam-jump-grid">
            ${jumpButtons}
          </div>

          <div class="row row-between exam-actions">
            <div class="row">
              <button id="prevQuestionBtn" class="btn btn-quiet" type="button" ${safeIndex === 0 ? "disabled" : ""}>이전</button>
              <button id="nextQuestionBtn" class="btn btn-quiet" type="button" ${safeIndex === questions.length - 1 ? "disabled" : ""}>다음</button>
            </div>
            <button id="submitExamBtn" class="btn btn-warm" type="button">제출하기</button>
          </div>
        </article>
      </section>
    `;

    const answerInput = document.getElementById("studentAnswerInput");
    answerInput.focus();
    answerInput.select();
    mountStudentExamTimer();
    answerInput.addEventListener("input", (e) => {
      state.studentExam.answers[current.id] = e.target.value;
      localStorage.setItem(examDraftKey(sessionId), JSON.stringify(state.studentExam.answers));
    });

    answerInput.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (safeIndex < questions.length - 1) {
        state.studentExam.index += 1;
        renderStudentExamScreen();
        return;
      }
      submitStudentSession();
    });

    document.getElementById("exitExamBtn").addEventListener("click", () => {
      clearStudentExamTimer();
      navigateToStudentDashboard();
    });

    document.querySelectorAll("[data-jump-index]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.studentExam.index = Number(btn.dataset.jumpIndex);
        renderStudentExamScreen();
      });
    });

    document.getElementById("prevQuestionBtn").addEventListener("click", () => {
      state.studentExam.index -= 1;
      renderStudentExamScreen();
    });

    document.getElementById("nextQuestionBtn").addEventListener("click", () => {
      state.studentExam.index += 1;
      renderStudentExamScreen();
    });

    document.getElementById("submitExamBtn").addEventListener("click", submitStudentSession);
  }

  function renderStudentResultScreen() {
    clearStudentExamTimer();
    if (!state.studentResult) {
      navigateToStudentDashboard({ replace: true });
      return;
    }

    const result = state.studentResult;
    const wrongList = (result.wrongItems || [])
      .map(
        (item, idx) => `
          <article class="review-card">
            <p class="meta">오답 ${idx + 1}</p>
            <p class="question-main">${escapeHtml(item.prompt)}</p>
            <p class="meta">내 답안: ${escapeHtml(item.response || "미응답")}</p>
            <p><strong>정답:</strong> ${escapeHtml(item.expectedAnswer)}</p>
            <p class="meta">뜻: ${escapeHtml(item.meaningPrimary || "-")}</p>
          </article>
        `
      )
      .join("");

    studentView.innerHTML = `
      <section class="exam-screen reveal">
        <article class="exam-stage">
          <div class="exam-stage-head row row-between">
            <div>
              <p class="exam-eyebrow">Result Summary</p>
              <h2>시험 결과</h2>
              <p class="meta">점수와 오답을 바로 확인하고, 필요하면 오답노트로 이어집니다.</p>
            </div>
            <div class="row">
              <button id="resultBackBtn" class="btn btn-quiet" type="button">대시보드로</button>
            </div>
          </div>

          <div class="exam-summary">
            <div><p class="meta">점수</p><p><strong>${result.score}/${result.outOf}</strong></p></div>
            <div><p class="meta">정답/오답</p><p><strong>${result.correctCount} / ${result.wrongCount}</strong></p></div>
            <div><p class="meta">소요 시간</p><p><strong>${formatDuration(result.elapsedSeconds)}</strong></p></div>
            <div><p class="meta">보충 과제</p><p><strong>${result.supplementalCreated ? "자동 생성" : "없음"}</strong></p></div>
          </div>

          <div class="result-message ${result.wrongCount > 0 ? "warn" : "success"}">
            ${
              result.wrongCount > 0
                ? `오답 ${result.wrongCount}개를 바탕으로 복습을 이어갈 수 있습니다.`
                : "전 문항 정답입니다. 그대로 대시보드로 돌아가면 됩니다."
            }
          </div>

          ${
            wrongList
              ? `<div class="review-card-grid">${wrongList}</div>`
              : `<div class="note-lines">이번 시험의 오답이 없습니다.</div>`
          }

          <div class="row row-between exam-actions">
            <div class="row">
              ${
                result.wrongCount > 0
                  ? `<button id="openReviewModeBtn" class="btn" type="button">오답노트 열기</button>`
                  : ""
              }
            </div>
            <button id="resultDashboardBtn" class="btn btn-warm" type="button">대시보드로 이동</button>
          </div>
        </article>
      </section>
    `;

    const backButtons = ["resultBackBtn", "resultDashboardBtn"];
    backButtons.forEach((id) => {
      document.getElementById(id).addEventListener("click", () => navigateToStudentDashboard({ replace: true }));
    });

    const reviewBtn = document.getElementById("openReviewModeBtn");
    if (reviewBtn) {
      reviewBtn.addEventListener("click", () => {
        state.studentReview = {
          batchIndex: 0,
          batches: getReviewBatches(result.wrongItems || []),
        };
        navigateToStudentReview();
      });
    }
  }

  function renderStudentReviewScreen() {
    clearStudentExamTimer();
    if (!state.studentReview?.batches?.length) {
      navigateToStudentResult();
      return;
    }

    const { batchIndex, batches } = state.studentReview;
    const safeBatchIndex = Math.max(0, Math.min(batchIndex, batches.length - 1));
    state.studentReview.batchIndex = safeBatchIndex;
    const batch = batches[safeBatchIndex];

    const cards = batch
      .map(
        (item, idx) => `
          <article class="review-card">
            <p class="meta">복습 ${safeBatchIndex * 3 + idx + 1}</p>
            <p class="question-main">${escapeHtml(item.prompt)}</p>
            ${
              item.blankSentence
                ? `<p class="question-hint">빈칸 힌트: ${escapeHtml(item.blankSentence)}</p>`
                : ""
            }
            <p class="meta">내 답안: ${escapeHtml(item.response || "미응답")}</p>
            <p><strong>정답:</strong> ${escapeHtml(item.expectedAnswer)}</p>
            <p class="meta">뜻: ${escapeHtml(item.meaningPrimary || "-")}</p>
          </article>
        `
      )
      .join("");

    studentView.innerHTML = `
      <section class="exam-screen reveal">
        <article class="exam-stage">
          <div class="exam-stage-head row row-between">
            <div>
              <p class="exam-eyebrow">Wrong Answer Note</p>
              <h2>오답노트</h2>
              <p class="meta">한 번에 3문제씩 묶어서 다시 봅니다.</p>
            </div>
            <div class="row">
              <span class="badge">묶음 ${safeBatchIndex + 1}/${batches.length}</span>
              <button id="reviewResultBtn" class="btn btn-quiet" type="button">결과로</button>
            </div>
          </div>
          <div class="review-card-grid">${cards}</div>
          <div class="row row-between exam-actions">
            <div class="row">
              <button id="reviewPrevBtn" class="btn btn-quiet" type="button" ${safeBatchIndex === 0 ? "disabled" : ""}>이전 묶음</button>
              <button id="reviewNextBtn" class="btn btn-quiet" type="button" ${safeBatchIndex === batches.length - 1 ? "disabled" : ""}>다음 묶음</button>
            </div>
            <button id="reviewDashboardBtn" class="btn btn-warm" type="button">대시보드로</button>
          </div>
        </article>
      </section>
    `;

    document.getElementById("reviewResultBtn").addEventListener("click", () => navigateToStudentResult());
    document.getElementById("reviewDashboardBtn").addEventListener("click", () => navigateToStudentDashboard({ replace: true }));
    document.getElementById("reviewPrevBtn").addEventListener("click", () => {
      state.studentReview.batchIndex -= 1;
      renderStudentReviewScreen();
    });
    document.getElementById("reviewNextBtn").addEventListener("click", () => {
      state.studentReview.batchIndex += 1;
      renderStudentReviewScreen();
    });
  }

  async function submitStudentSession(options = {}) {
    try {
      if (!state.studentExam) return;
      const { sessionId, questions, answers } = state.studentExam;
      const emptyCount = questions.filter((q) => !(answers[q.id] || "").trim()).length;

      if (!options.skipConfirm && emptyCount > 0) {
        const ok = window.confirm(`미응답 ${emptyCount}문항이 있습니다. 그대로 제출할까요?`);
        if (!ok) return;
      }

      const payload = {
        answers: questions.map((q) => ({
          questionId: q.id,
          response: answers[q.id] || "",
        })),
      };

      const result = await api(`/students/test-sessions/${sessionId}/submit`, {
        method: "POST",
        body: payload,
      });

      clearStudentExamTimer();
      localStorage.removeItem(examDraftKey(sessionId));
      state.studentResult = {
        sessionId,
        score: result.score,
        outOf: result.outOf,
        correctCount: result.correctCount,
        wrongCount: result.wrongCount,
        wrongItems: result.wrongItems || [],
        elapsedSeconds: result.elapsedSeconds,
        supplementalCreated: result.supplementalCreated,
        supplementalAssignmentId: result.supplementalAssignmentId,
        supplementalSessionId: result.supplementalSessionId,
        supplementalDueAt: result.supplementalDueAt,
      };
      state.studentReview = null;
      state.studentExam = null;
      const extraMsg = result.wrongCount > 0 ? ` / 오답 ${result.wrongCount}` : " / 만점";
      const autoMsg = options.autoSubmitted ? " / 시간 종료 자동 제출" : "";
      const supplementMsg = result.supplementalCreated ? " / 보충 과제 자동 배정" : "";
      toast(`제출 완료: ${result.score}/${result.outOf}${extraMsg}${autoMsg}${supplementMsg}`);
      navigateToStudentResult();
    } catch (err) {
      toast(err.message);
    }
  }

  function teacherStats(items) {
    return {
      total: items.length,
      scheduled: items.filter((x) => x.status === "SCHEDULED").length,
      inProgress: items.filter((x) => x.status === "IN_PROGRESS").length,
      completed: items.filter((x) => x.status === "COMPLETED").length,
      missed: items.filter((x) => x.status === "MISSED").length,
    };
  }

  function filteredAssignments() {
    const keyword = state.teacherFilters.keyword.trim().toLowerCase();
    return state.teacherAssignments.filter((a) => {
      const okStatus = state.teacherFilters.status === "ALL" ? true : a.status === state.teacherFilters.status;
      const okKeyword = keyword
        ? [a.student_name, a.source_name, a.id].join(" ").toLowerCase().includes(keyword)
        : true;
      return okStatus && okKeyword;
    });
  }

  function teacherCalendarMarkup(items) {
    const weekDates = getTeacherWeekDates();
    const byDay = new Map(weekDates.map((d) => [dateKeyLocal(d), []]));

    for (const item of items) {
      const key = dateKeyLocal(item.due_at);
      if (byDay.has(key)) byDay.get(key).push(item);
    }

    for (const arr of byDay.values()) {
      arr.sort((a, b) => new Date(a.due_at) - new Date(b.due_at));
    }

    const columns = weekDates
      .map((day) => {
        const key = dateKeyLocal(day);
        const dayItems = byDay.get(key) || [];

        const chips = dayItems.length
          ? dayItems
              .map((a) => {
                const actionButtons = [];
                if (!a.test_session_id) {
                  actionButtons.push(`<button class="mini-btn" data-act="generate" data-assignment-id="${a.id}">생성</button>`);
                }
                if (a.status === "SCHEDULED") {
                  actionButtons.push(`<button class="mini-btn" data-act="publish" data-assignment-id="${a.id}">게시</button>`);
                }
                if (a.test_session_id) {
                  actionButtons.push(`<button class="mini-btn" data-act="edit" data-session-id="${a.test_session_id}">편집</button>`);
                  if (a.test_session_status === "COMPLETED") {
                    actionButtons.push(`<button class="mini-btn" data-act="supplement" data-session-id="${a.test_session_id}">보충</button>`);
                  }
                }

                return `
                  <article class="calendar-item">
                    <div class="row row-between">
                      <strong>${a.student_name}</strong>
                      ${statusBadge(a.status)}
                    </div>
                    <p class="meta">${a.source_name}</p>
                    <p class="meta">마감 ${new Date(a.due_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })}</p>
                    <p class="meta">L${a.range_start_lesson}-${a.range_end_lesson} / ${a.question_count}문항</p>
                    <div class="row">${actionButtons.join("")}</div>
                  </article>
                `;
              })
              .join("")
          : `<p class="calendar-empty">일정 없음</p>`;

        return `
          <section class="calendar-col">
            <header class="calendar-col-head">${fmtDay(day)}</header>
            <div class="calendar-col-body">${chips}</div>
          </section>
        `;
      })
      .join("");

    return {
      range: weekRangeText(weekDates),
      html: `<div class="calendar-grid">${columns}</div>`,
    };
  }

  async function renderTeacher(forceFetch = true) {
    if (forceFetch || !state.teacherMeta) {
      state.teacherMeta = await api("/teacher/meta");
    }

    const ownerTeacherId = getBoardTeacherId(state.teacherMeta);
    state.teacherSettingsOwnerId = ownerTeacherId;

    const assignmentsPath =
      state.role === "ADMIN" && ownerTeacherId ? `/teacher/assignments?teacherId=${encodeURIComponent(ownerTeacherId)}` : "/teacher/assignments";
    const settingsPath =
      ownerTeacherId && state.role === "ADMIN"
        ? `/teacher/settings?teacherId=${encodeURIComponent(ownerTeacherId)}`
        : "/teacher/settings";

    if (forceFetch || !state.teacherSettings || state.teacherSettings.ownerTeacherId !== ownerTeacherId) {
      const [assignmentsRes, settingsRes] = await Promise.all([
        api(assignmentsPath),
        ownerTeacherId ? api(settingsPath) : Promise.resolve(null),
      ]);
      state.teacherAssignments = assignmentsRes.items || [];
      state.teacherSettings = settingsRes;
    }

    drawTeacherView();
  }

  function drawTeacherView() {
    const meta = state.teacherMeta;
    const activeTeacherId = getBoardTeacherId(meta);
    const activeTeacher = meta?.teachers?.find((teacher) => teacher.id === activeTeacherId) || null;
    const items = filteredAssignments();
    const stats = teacherStats(state.teacherAssignments);
    const calendar = teacherCalendarMarkup(items);
    const showCalendar = state.teacherViewMode === "BOTH" || state.teacherViewMode === "CALENDAR";
    const showList = state.teacherViewMode === "BOTH" || state.teacherViewMode === "LIST";
    const settingsDefinitions = state.teacherSettings?.definitions || {};
    const settingsValues = state.teacherSettings?.values || {};
    const defaultDueHours = getDefaultDueHours();
    const defaultPublishAt = toInputDateTime(new Date().toISOString());
    const defaultDueAt = buildDueAtInputValue(defaultPublishAt, defaultDueHours);
    const settingsFields = teacherSettingsFieldOrder()
      .map((key) => {
        const definition = settingsDefinitions[key];
        if (!definition) return "";

        if (definition.type === "boolean") {
          return `
            <label class="setting-card setting-toggle">
              <span class="setting-copy">
                <strong>${escapeHtml(definition.label)}</strong>
                <small>${escapeHtml(definition.description || "")}</small>
              </span>
              <input type="checkbox" name="${key}" ${settingsValues[key] ? "checked" : ""} />
            </label>
          `;
        }

        return `
          <label class="setting-card">
            <span class="setting-label">${escapeHtml(definition.label)}</span>
            <input type="number" name="${key}" min="${definition.min ?? 0}" value="${escapeHtml(settingsValues[key] ?? "")}" required />
            <small class="setting-desc">${escapeHtml(definition.description || "")}</small>
          </label>
        `;
      })
      .join("");
    const accessLinkResult = state.teacherAccessLink
      ? `
        <div class="access-link-result">
          <p class="meta">대상 학생</p>
          <p><strong>${escapeHtml(state.teacherAccessLink.target?.name || "선택한 학생")}</strong></p>
          <p class="meta">만료 시각: ${fmtDate(state.teacherAccessLink.expiresAt)}</p>
          <label>
            접속 링크
            <input type="text" id="generatedAccessLinkInput" value="${escapeHtml(state.teacherAccessLink.loginUrl)}" readonly />
          </label>
          <div class="row">
            <button class="btn btn-quiet" type="button" id="copyAccessLinkBtn">링크 복사</button>
            <button class="btn btn-quiet" type="button" id="openAccessLinkBtn">새 창 열기</button>
          </div>
          <div class="qr-card">${state.teacherAccessLink.qrSvg}</div>
          <p class="meta">학생은 링크 클릭 또는 QR 스캔만으로 바로 로그인합니다.</p>
        </div>
      `
      : "학생을 선택하고 링크를 생성하면 QR과 URL이 여기에 표시됩니다.";

    teacherView.innerHTML = `
      <section class="paper">
        <div class="paper-head">
          <h2>${state.role === "ADMIN" ? "관리자 운영 보드" : "교사용 자동화 보드"}</h2>
          <p>과제 운영, 자동화 설정, 링크 로그인, 오프라인 대리 입력을 한 화면에서 처리합니다.</p>
        </div>

        <div class="kpi-grid">
          <article class="kpi"><p class="kpi-label">전체</p><p class="kpi-value">${stats.total}</p></article>
          <article class="kpi"><p class="kpi-label">배정대기</p><p class="kpi-value">${stats.scheduled}</p></article>
          <article class="kpi"><p class="kpi-label">진행중</p><p class="kpi-value">${stats.inProgress}</p></article>
          <article class="kpi"><p class="kpi-label">완료</p><p class="kpi-value">${stats.completed}</p></article>
          <article class="kpi danger"><p class="kpi-label">미완료</p><p class="kpi-value">${stats.missed}</p></article>
        </div>

        <form id="createAssignmentForm" class="assignment-form">
          ${
            meta.canChooseTeacher
              ? `
                <label>
                  담당 교사
                  <select id="assignmentTeacherSelect" name="teacherId" required>
                    ${meta.teachers
                      .map((teacher) => `<option value="${teacher.id}" ${teacher.id === activeTeacherId ? "selected" : ""}>${teacher.name}</option>`)
                      .join("")}
                  </select>
                </label>
              `
              : ""
          }
          <label>
            학생
            <select name="studentId" required>
              ${meta.students.map((s) => `<option value="${s.id}">${s.name} (${s.student_code})</option>`).join("")}
            </select>
          </label>
          <label>
            단어 소스
            <select name="sourceId" required>
              ${meta.sources
                .map(
                  (s) =>
                    `<option value="${s.id}">${s.name} (${s.source_type}) / lesson ${s.min_lesson ?? "-"}-${s.max_lesson ?? "-"} / ${s.word_count} words</option>`
                )
                .join("")}
            </select>
          </label>
          <label>
            시작 Lesson
            <input type="number" name="rangeStartLesson" min="1" value="1" required />
          </label>
          <label>
            끝 Lesson
            <input type="number" name="rangeEndLesson" min="1" value="3" required />
          </label>
          <label>
            문제 수
            <input type="number" name="questionCount" min="1" value="8" required />
          </label>
          <label>
            배정 시각
            <input id="assignmentPublishAtInput" type="datetime-local" name="publishAt" value="${defaultPublishAt}" required />
          </label>
          <label>
            마감 시각
            <input id="assignmentDueAtInput" type="datetime-local" name="dueAt" value="${defaultDueAt}" />
          </label>
          <div class="row full">
            <span class="badge">기본 마감: 게시 후 ${defaultDueHours}시간</span>
            <button class="btn btn-quiet" type="button" id="applyDuePresetBtn">기본 마감 적용</button>
            <button class="btn" type="submit">과제 생성</button>
            <button class="btn btn-quiet" type="button" id="reloadTeacherBtn">동기화</button>
          </div>
        </form>

        <div class="settings-panel">
          <div class="paper-head">
            <h2>자동화 설정</h2>
            <p>보충 문제 기준, 기본 마감 시간, 학생/학부모 알림 정책을 화면에서 바로 조정합니다.</p>
          </div>

          <form id="teacherSettingsForm" class="settings-grid">
            ${
              meta.canChooseTeacher
                ? `
                  <label class="setting-card full">
                    <span class="setting-label">설정 대상 교사</span>
                    <select id="teacherSettingsTeacherSelect" name="teacherId" required>
                      ${meta.teachers
                        .map((teacher) => `<option value="${teacher.id}" ${teacher.id === activeTeacherId ? "selected" : ""}>${teacher.name}</option>`)
                        .join("")}
                    </select>
                    <small class="setting-desc">선택한 교사 기준으로 과제 목록과 자동화 정책을 함께 불러옵니다.</small>
                  </label>
                `
                : `
                  <div class="setting-card full setting-summary">
                    <strong>${escapeHtml(activeTeacher?.name || "현재 교사")}</strong>
                    <small>현재 교사 기준 자동화 정책입니다.</small>
                  </div>
                `
            }
            ${settingsFields}
            <div class="row full settings-actions">
              <button class="btn btn-warm" type="submit">설정 저장</button>
              <span class="meta">저장 후 이후 생성되는 과제와 자동화 사이클에 즉시 반영됩니다.</span>
            </div>
          </form>
        </div>
      </section>

      <section class="paper">
        <div class="paper-head">
          <h2>과제 목록</h2>
          <p>필터로 빠르게 찾고, 바로 조치하세요.</p>
        </div>

        <div class="table-tools">
          <label>
            상태 필터
            <select id="teacherStatusFilter">
              <option value="ALL" ${state.teacherFilters.status === "ALL" ? "selected" : ""}>전체</option>
              <option value="SCHEDULED" ${state.teacherFilters.status === "SCHEDULED" ? "selected" : ""}>SCHEDULED</option>
              <option value="PUBLISHED" ${state.teacherFilters.status === "PUBLISHED" ? "selected" : ""}>PUBLISHED</option>
              <option value="IN_PROGRESS" ${state.teacherFilters.status === "IN_PROGRESS" ? "selected" : ""}>IN_PROGRESS</option>
              <option value="COMPLETED" ${state.teacherFilters.status === "COMPLETED" ? "selected" : ""}>COMPLETED</option>
              <option value="MISSED" ${state.teacherFilters.status === "MISSED" ? "selected" : ""}>MISSED</option>
            </select>
          </label>
          <label>
            검색
            <input id="teacherKeywordFilter" type="text" value="${state.teacherFilters.keyword}" placeholder="학생명, 소스명, assignment id" />
          </label>
        </div>

        <div class="calendar-toolbar">
          <div class="row">
            <button class="btn btn-quiet" type="button" id="teacherWeekPrevBtn">이전 주</button>
            <button class="btn btn-quiet" type="button" id="teacherWeekTodayBtn">이번 주</button>
            <button class="btn btn-quiet" type="button" id="teacherWeekNextBtn">다음 주</button>
            <span class="mono">${calendar.range}</span>
          </div>
          <div class="row">
            <button class="btn btn-quiet ${state.teacherViewMode === "BOTH" ? "active-toggle" : ""}" type="button" data-view-mode="BOTH">통합</button>
            <button class="btn btn-quiet ${state.teacherViewMode === "CALENDAR" ? "active-toggle" : ""}" type="button" data-view-mode="CALENDAR">캘린더</button>
            <button class="btn btn-quiet ${state.teacherViewMode === "LIST" ? "active-toggle" : ""}" type="button" data-view-mode="LIST">목록</button>
          </div>
        </div>

        <div class="${showCalendar ? "" : "hidden"}">
          ${calendar.html}
        </div>

        <div class="table-wrap ${showList ? "" : "hidden"}">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>학생</th>
                <th>범위</th>
                <th>상태</th>
                <th>마감</th>
                <th>세션</th>
                <th>작업</th>
              </tr>
            </thead>
            <tbody>
              ${items
                .map(
                  (a) => `
                <tr>
                  <td><span class="mono short-id">${a.id.slice(0, 8)}</span></td>
                  <td>${a.student_name}</td>
                  <td>${a.range_start_lesson}-${a.range_end_lesson} (${a.question_count}문항)</td>
                  <td>${statusBadge(a.status)}</td>
                  <td>${fmtDate(a.due_at)}</td>
                  <td>${a.test_session_id ? `<span class="badge">${a.test_session_status}</span>` : `<span class="badge">없음</span>`}</td>
                  <td>
                    <div class="row">
                      <button class="btn btn-quiet" data-act="generate" data-assignment-id="${a.id}">생성</button>
                      <button class="btn btn-quiet" data-act="publish" data-assignment-id="${a.id}">즉시게시</button>
                      <button class="btn btn-quiet" data-act="export" data-assignment-id="${a.id}">엑셀</button>
                      <button class="btn btn-quiet" data-act="copy" data-assignment-id="${a.id}">ID복사</button>
                      ${a.test_session_id ? `<button class="btn btn-quiet" data-act="edit" data-session-id="${a.test_session_id}">문항편집</button>` : ""}
                      ${a.test_session_id && a.test_session_status !== "COMPLETED" ? `<button class="btn btn-quiet" data-act="offline" data-session-id="${a.test_session_id}">오프라인입력</button>` : ""}
                      ${a.test_session_id && a.test_session_status === "COMPLETED" ? `<button class="btn btn-quiet" data-act="supplement" data-session-id="${a.test_session_id}">보충문제</button>` : ""}
                    </div>
                  </td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </section>

      <section class="split">
        <article class="paper">
          <div class="paper-head">
            <h2>빠른 접속 링크 / QR</h2>
            <p>학생 기기에서 비밀번호 없이 접속할 수 있는 일회성 링크를 발급합니다.</p>
          </div>

          <form id="accessLinkForm" class="lined-form">
            <label>
              학생
              <select name="userId" required>
                ${meta.students
                  .filter((s) => s.user_id)
                  .map((s) => `<option value="${s.user_id}">${s.name} (${s.student_code})</option>`)
                  .join("")}
              </select>
            </label>
            <label>
              링크 라벨
              <input type="text" name="label" value="학생 빠른 로그인" />
            </label>
            <label>
              만료 시간(분)
              <input type="number" name="expiresInMinutes" min="1" max="1440" value="30" required />
            </label>
            <button class="btn" type="submit">링크/QR 생성</button>
          </form>

          <div id="teacherAccessLinkArea" class="${state.teacherAccessLink ? "" : "note-lines"}">${accessLinkResult}</div>

          <div class="paper-head">
            <h2>엑셀/CSV 처리</h2>
            <p>엑셀 수정 반영과 단어장 업로드를 수행합니다.</p>
          </div>

          <form id="xlsxImportForm" class="lined-form">
            <label>
              Assignment ID
              <input type="text" name="assignmentId" placeholder="assignment_demo_1" required />
            </label>
            <label>
              XLSX 파일
              <input type="file" name="file" accept=".xlsx" required />
            </label>
            <button class="btn btn-warm" type="submit">엑셀 반영</button>
          </form>

          <div class="paper-head" style="margin-top:16px;">
            <h2>CSV 단어장 Import</h2>
          </div>
          <form id="csvImportForm" class="lined-form">
            ${
              meta.canChooseTeacher
                ? `
                  <label>
                    소유 교사
                    <select name="teacherId" required>
                      ${meta.teachers
                        .map((teacher) => `<option value="${teacher.id}" ${teacher.id === activeTeacherId ? "selected" : ""}>${teacher.name}</option>`)
                        .join("")}
                    </select>
                  </label>
                `
                : ""
            }
            <label>
              소스 이름
              <input type="text" name="name" value="새 단어장" required />
            </label>
            <label>
              소스 타입
              <input type="text" name="sourceType" value="EBOOK_CSV" required />
            </label>
            <label>
              CSV 파일
              <input type="file" name="file" accept=".csv" required />
            </label>
            <button class="btn" type="submit">CSV 가져오기</button>
          </form>
        </article>

        <article class="paper">
          <div class="paper-head">
            <h2>문항 수동 오버라이드</h2>
            <p>세션 선택 후 문항을 즉시 수정할 수 있습니다.</p>
          </div>
          <div id="teacherOverrideArea" class="note-lines">문항편집 버튼을 눌러 시작하세요.</div>
        </article>
      </section>

      <section class="paper">
        <div class="paper-head">
          <h2>오프라인 대리 입력</h2>
          <p>종이 시험, 구두 시험, 전화 확인 결과를 교사 또는 관리자가 학생 계정으로 반영합니다.</p>
        </div>
        <div id="teacherOfflineEntryArea" class="note-lines">과제 목록에서 "오프라인입력"을 누르면 여기에 학생 답안을 입력할 수 있습니다.</div>
      </section>
    `;

    bindTeacherEvents();
    renderTeacherOverride();
    renderTeacherOfflineEntry();
  }

  async function bindTeacherEvents() {
    document.getElementById("reloadTeacherBtn").addEventListener("click", () => renderTeacher(true).catch((e) => toast(e.message)));
    const assignmentTeacherSelect = document.getElementById("assignmentTeacherSelect");
    const settingsTeacherSelect = document.getElementById("teacherSettingsTeacherSelect");
    const publishAtInput = document.getElementById("assignmentPublishAtInput");
    const dueAtInput = document.getElementById("assignmentDueAtInput");
    const applyDuePresetBtn = document.getElementById("applyDuePresetBtn");

    const applyDuePreset = () => {
      if (!publishAtInput || !dueAtInput) return;
      dueAtInput.value = buildDueAtInputValue(publishAtInput.value);
    };

    const switchTeacherContext = async (teacherId) => {
      if (!teacherId || teacherId === state.teacherSettingsOwnerId) return;
      state.teacherSettingsOwnerId = teacherId;
      state.teacherAccessLink = null;
      state.teacherEditingSessionId = null;
      state.teacherQuestions = [];
      state.teacherOfflineSessionId = null;
      state.teacherOfflineQuestions = [];
      state.teacherOfflineContext = null;
      await renderTeacher(true);
    };

    if (assignmentTeacherSelect) {
      assignmentTeacherSelect.addEventListener("change", (e) => {
        switchTeacherContext(String(e.target.value || "")).catch((err) => toast(err.message));
      });
    }

    if (settingsTeacherSelect) {
      settingsTeacherSelect.addEventListener("change", (e) => {
        switchTeacherContext(String(e.target.value || "")).catch((err) => toast(err.message));
      });
    }

    if (publishAtInput) {
      publishAtInput.addEventListener("change", applyDuePreset);
    }

    if (applyDuePresetBtn) {
      applyDuePresetBtn.addEventListener("click", applyDuePreset);
    }

    document.getElementById("teacherStatusFilter").addEventListener("change", (e) => {
      state.teacherFilters.status = e.target.value;
      drawTeacherView();
    });

    document.getElementById("teacherKeywordFilter").addEventListener("input", (e) => {
      state.teacherFilters.keyword = e.target.value;
      drawTeacherView();
    });

    document.getElementById("teacherWeekPrevBtn").addEventListener("click", () => {
      state.teacherWeekOffset -= 1;
      drawTeacherView();
    });

    document.getElementById("teacherWeekTodayBtn").addEventListener("click", () => {
      state.teacherWeekOffset = 0;
      drawTeacherView();
    });

    document.getElementById("teacherWeekNextBtn").addEventListener("click", () => {
      state.teacherWeekOffset += 1;
      drawTeacherView();
    });

    document.querySelectorAll("[data-view-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.teacherViewMode = btn.dataset.viewMode;
        drawTeacherView();
      });
    });

    document.getElementById("createAssignmentForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const dueAtValue = String(f.get("dueAt") || "").trim();
      const payload = {
        studentId: f.get("studentId"),
        sourceId: f.get("sourceId"),
        teacherId: f.get("teacherId") || null,
        rangeStartLesson: Number(f.get("rangeStartLesson")),
        rangeEndLesson: Number(f.get("rangeEndLesson")),
        questionCount: Number(f.get("questionCount")),
        publishAt: new Date(String(f.get("publishAt"))).toISOString(),
      };
      if (dueAtValue) {
        payload.dueAt = new Date(dueAtValue).toISOString();
      }

      try {
        await api("/teacher/assignments", { method: "POST", body: payload });
        toast("과제가 생성되었습니다.");
        await renderTeacher(true);
      } catch (err) {
        toast(err.message);
      }
    });

    const teacherSettingsForm = document.getElementById("teacherSettingsForm");
    if (teacherSettingsForm) {
      teacherSettingsForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const definitions = state.teacherSettings?.definitions || {};
        const settings = {};

        teacherSettingsFieldOrder().forEach((key) => {
          const definition = definitions[key];
          if (!definition) return;

          if (definition.type === "boolean") {
            settings[key] = f.get(key) === "on";
            return;
          }

          settings[key] = Number(f.get(key));
        });

        try {
          await api("/teacher/settings", {
            method: "PUT",
            body: {
              teacherId: f.get("teacherId") || state.teacherSettingsOwnerId || null,
              settings,
            },
          });
          toast("자동화 설정을 저장했습니다.");
          await renderTeacher(true);
        } catch (err) {
          toast(err.message);
        }
      });
    }

    const accessLinkForm = document.getElementById("accessLinkForm");
    if (accessLinkForm) {
      accessLinkForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);

        try {
          const result = await api("/auth/access-links", {
            method: "POST",
            body: {
              userId: String(f.get("userId") || ""),
              label: String(f.get("label") || ""),
              expiresInMinutes: Number(f.get("expiresInMinutes") || 30),
              channel: "QR",
            },
          });

          state.teacherAccessLink = result;
          drawTeacherView();
          toast("학생 접속 링크를 생성했습니다.");
        } catch (err) {
          toast(err.message);
        }
      });
    }

    const copyAccessLinkBtn = document.getElementById("copyAccessLinkBtn");
    if (copyAccessLinkBtn) {
      copyAccessLinkBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(state.teacherAccessLink?.loginUrl || "");
          toast("접속 링크를 복사했습니다.");
        } catch {
          toast("링크 복사에 실패했습니다.");
        }
      });
    }

    const openAccessLinkBtn = document.getElementById("openAccessLinkBtn");
    if (openAccessLinkBtn) {
      openAccessLinkBtn.addEventListener("click", () => {
        if (!state.teacherAccessLink?.loginUrl) return;
        window.open(state.teacherAccessLink.loginUrl, "_blank", "noopener,noreferrer");
      });
    }

    document.querySelectorAll("button[data-act='generate']").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await api(`/teacher/assignments/${btn.dataset.assignmentId}/generate`, { method: "POST", body: {} });
          toast("시험 생성 완료");
          await renderTeacher(true);
        } catch (err) {
          toast(err.message);
        }
      });
    });

    document.querySelectorAll("button[data-act='publish']").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await api(`/teacher/assignments/${btn.dataset.assignmentId}/publish-now`, { method: "POST", body: {} });
          toast("즉시 게시 완료");
          await renderTeacher(true);
        } catch (err) {
          toast(err.message);
        }
      });
    });

    document.querySelectorAll("button[data-act='export']").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          const res = await api(`/teacher/assignments/${btn.dataset.assignmentId}/export.xlsx`);
          const blob = await res.blob();
          const a = document.createElement("a");
          const url = URL.createObjectURL(blob);
          a.href = url;
          a.download = `assignment_${btn.dataset.assignmentId}.xlsx`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        } catch (err) {
          toast(err.message);
        }
      });
    });

    document.querySelectorAll("button[data-act='copy']").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(btn.dataset.assignmentId);
          toast("Assignment ID 복사 완료");
        } catch {
          toast("클립보드 복사 실패");
        }
      });
    });

    document.querySelectorAll("button[data-act='edit']").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          const data = await api(`/teacher/test-sessions/${btn.dataset.sessionId}/questions`);
          state.teacherEditingSessionId = btn.dataset.sessionId;
          state.teacherQuestions = data.questions;
          renderTeacherOverride();
        } catch (err) {
          toast(err.message);
        }
      });
    });

    document.querySelectorAll("button[data-act='offline']").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          const data = await api(`/teacher/test-sessions/${btn.dataset.sessionId}/questions`);
          state.teacherOfflineSessionId = btn.dataset.sessionId;
          state.teacherOfflineQuestions = data.questions;
          state.teacherOfflineContext =
            state.teacherAssignments.find((assignment) => assignment.test_session_id === btn.dataset.sessionId) || null;
          renderTeacherOfflineEntry();
        } catch (err) {
          toast(err.message);
        }
      });
    });

    document.querySelectorAll("button[data-act='supplement']").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          const questionCountInput = window.prompt("보충 문제 수(기본: 오답 개수)", "");
          const dueHoursInput = window.prompt("보충 과제 마감 시간(시간 단위, 기본 24)", "24");

          const payload = {};
          if (questionCountInput && Number(questionCountInput) > 0) payload.questionCount = Number(questionCountInput);
          if (dueHoursInput && Number(dueHoursInput) > 0) payload.dueHours = Number(dueHoursInput);

          const result = await api(`/teacher/test-sessions/${btn.dataset.sessionId}/supplement`, {
            method: "POST",
            body: payload,
          });

          toast(`보충 과제 생성 완료 (${result.questionCount}문항)`);
          await renderTeacher(true);
        } catch (err) {
          toast(err.message);
        }
      });
    });

    document.getElementById("xlsxImportForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const assignmentId = String(f.get("assignmentId") || "").trim();
      const file = f.get("file");
      if (!assignmentId || !file || !(file instanceof File)) {
        toast("assignmentId와 파일을 확인하세요.");
        return;
      }

      const body = new FormData();
      body.set("file", file);

      try {
        await api(`/teacher/assignments/${assignmentId}/import.xlsx`, { method: "POST", body });
        toast("엑셀 반영 완료");
        await renderTeacher(true);
      } catch (err) {
        toast(err.message);
      }
    });

    document.getElementById("csvImportForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const body = new FormData();
      body.set("name", String(f.get("name") || ""));
      body.set("sourceType", String(f.get("sourceType") || "EBOOK_CSV"));
      if (f.get("teacherId")) {
        body.set("teacherId", String(f.get("teacherId")));
      }
      body.set("file", f.get("file"));

      try {
        const result = await api("/teacher/vocab/import/csv", { method: "POST", body });
        toast(`CSV import 완료: ${result.imported}개`);
        await renderTeacher(true);
      } catch (err) {
        toast(err.message);
      }
    });
  }

  function renderTeacherOverride() {
    const area = document.getElementById("teacherOverrideArea");
    if (!area) return;

    if (!state.teacherEditingSessionId || state.teacherQuestions.length === 0) {
      area.innerHTML = "문항편집 버튼을 눌러 시작하세요.";
      area.className = "note-lines";
      return;
    }

    area.className = "";
    area.innerHTML = `
      <div class="exam-sheet">
        <p class="meta">Session: <span class="mono">${state.teacherEditingSessionId}</span></p>
        ${state.teacherQuestions
          .map(
            (q, idx) => `
          <div class="question-item" data-qid="${q.id}">
            <p class="question-title"><strong>${idx + 1}.</strong></p>
            <label>유형
              <select data-field="type">
                <option value="DIRECT_TRANSLATION" ${q.type === "DIRECT_TRANSLATION" ? "selected" : ""}>DIRECT_TRANSLATION</option>
                <option value="FILL_IN_BLANK" ${q.type === "FILL_IN_BLANK" ? "selected" : ""}>FILL_IN_BLANK</option>
              </select>
            </label>
            <label>문항
              <textarea data-field="prompt">${q.prompt || ""}</textarea>
            </label>
            <label>정답
              <input type="text" data-field="expectedAnswer" value="${q.expected_answer || ""}" />
            </label>
            <label>빈칸 문장
              <textarea data-field="blankSentence">${q.blank_sentence || ""}</textarea>
            </label>
          </div>
        `
          )
          .join("")}
        <div class="row">
          <button id="saveOverrideBtn" class="btn btn-warm">오버라이드 저장</button>
        </div>
      </div>
    `;

    document.getElementById("saveOverrideBtn").addEventListener("click", async () => {
      try {
        const questions = Array.from(area.querySelectorAll(".question-item")).map((box) => ({
          id: box.dataset.qid,
          type: box.querySelector("[data-field='type']").value,
          prompt: box.querySelector("[data-field='prompt']").value,
          expectedAnswer: box.querySelector("[data-field='expectedAnswer']").value,
          blankSentence: box.querySelector("[data-field='blankSentence']").value,
        }));

        await api(`/teacher/test-sessions/${state.teacherEditingSessionId}/override`, {
          method: "POST",
          body: { questions },
        });
        toast("오버라이드 저장 완료");
        await renderTeacher(true);
      } catch (err) {
        toast(err.message);
      }
    });
  }

  function renderTeacherOfflineEntry() {
    const area = document.getElementById("teacherOfflineEntryArea");
    if (!area) return;

    if (!state.teacherOfflineSessionId || state.teacherOfflineQuestions.length === 0) {
      area.innerHTML = '과제 목록에서 "오프라인입력"을 누르면 여기에 학생 답안을 입력할 수 있습니다.';
      area.className = "note-lines";
      return;
    }

    const context = state.teacherOfflineContext;
    area.className = "";
    area.innerHTML = `
      <div class="exam-sheet">
        <div class="row row-between">
          <div>
            <p class="meta">Session</p>
            <p class="mono">${escapeHtml(state.teacherOfflineSessionId)}</p>
          </div>
          <div>
            <p class="meta">학생</p>
            <p><strong>${escapeHtml(context?.student_name || "-")}</strong></p>
          </div>
          <div>
            <p class="meta">상태</p>
            <p>${statusBadge(context?.status || "PUBLISHED")}</p>
          </div>
        </div>

        <div class="stack">
          ${state.teacherOfflineQuestions
            .map(
              (q, idx) => `
                <div class="question-item teacher-offline-question" data-qid="${q.id}">
                  <p class="question-title"><strong>${idx + 1}.</strong> ${escapeHtml(q.prompt)}</p>
                  <p class="meta">정답: ${escapeHtml(q.expected_answer || "-")}</p>
                  <label>
                    학생 답안
                    <input type="text" data-field="response" placeholder="오프라인 답안을 입력하세요" />
                  </label>
                </div>
              `
            )
            .join("")}
        </div>

        <label>
          입력 메모
          <textarea id="teacherOfflineNote" placeholder="예: 종이 시험지 점수를 반영함"></textarea>
        </label>

        <div class="row">
          <button id="submitOfflineEntryBtn" class="btn btn-warm" type="button">학생 답안 반영</button>
          <button id="clearOfflineEntryBtn" class="btn btn-quiet" type="button">닫기</button>
        </div>
      </div>
    `;

    document.getElementById("submitOfflineEntryBtn").addEventListener("click", async () => {
      try {
        const answers = Array.from(area.querySelectorAll(".teacher-offline-question")).map((box) => ({
          questionId: box.dataset.qid,
          response: box.querySelector("[data-field='response']").value,
        }));
        const note = document.getElementById("teacherOfflineNote").value;
        const result = await api(`/teacher/test-sessions/${state.teacherOfflineSessionId}/offline-submit`, {
          method: "POST",
          body: {
            answers,
            note,
          },
        });

        toast(`오프라인 입력 완료: ${result.score}/${result.outOf}`);
        state.teacherOfflineSessionId = null;
        state.teacherOfflineQuestions = [];
        state.teacherOfflineContext = null;
        await renderTeacher(true);
      } catch (err) {
        toast(err.message);
      }
    });

    document.getElementById("clearOfflineEntryBtn").addEventListener("click", () => {
      state.teacherOfflineSessionId = null;
      state.teacherOfflineQuestions = [];
      state.teacherOfflineContext = null;
      renderTeacherOfflineEntry();
    });
  }

  async function renderParent() {
    const data = await api("/parents/me/reports");
    const reports = data.reports || [];

    const completed = reports.filter((r) => r.payload?.result === "COMPLETED").length;
    const missed = reports.filter((r) => r.payload?.result === "MISSED").length;

    const cards = reports
      .map(
        (r) => `
        <article class="card">
          <div class="row row-between">
            <span class="badge ${r.payload?.result === "MISSED" ? "missed" : "done"}">${r.payload?.result || "REPORT"}</span>
            <span class="meta">${fmtDate(r.created_at)}</span>
          </div>
          <p>${r.payload?.message || "보고 내용 없음"}</p>
          <p class="meta">전송상태: ${r.status} / 채널: ${r.channel}</p>
        </article>
      `
      )
      .join("");

    parentView.innerHTML = `
      <section class="paper">
        <div class="paper-head">
          <h2>학부모 보고함</h2>
          <p>완료/미완료 자동 알림 내역을 확인합니다.</p>
        </div>

        <div class="kpi-grid">
          <article class="kpi"><p class="kpi-label">전체 보고</p><p class="kpi-value">${reports.length}</p></article>
          <article class="kpi"><p class="kpi-label">완료 보고</p><p class="kpi-value">${completed}</p></article>
          <article class="kpi danger"><p class="kpi-label">미완료 보고</p><p class="kpi-value">${missed}</p></article>
        </div>

        <div class="stack">${cards || "<p>아직 보고가 없습니다.</p>"}</div>
      </section>
    `;
  }

  async function renderRoleView() {
    renderShell();
    if (!state.role) return;

    if (state.role === "STUDENT") {
      if (isStudentResultRoute()) {
        if (!state.studentResult) {
          navigateToStudentDashboard({ replace: true });
          return;
        }
        renderStudentResultScreen();
        return;
      }

      if (isStudentReviewRoute()) {
        if (!state.studentReview?.batches?.length) {
          navigateToStudentResult();
          return;
        }
        renderStudentReviewScreen();
        return;
      }

      const sessionId = getStudentExamRouteSessionId();
      if (sessionId) {
        try {
          await ensureStudentExamLoaded(sessionId);
          renderStudentExamScreen();
        } catch (err) {
          state.studentExam = null;
          toast(err.message);
          navigateToStudentDashboard({ replace: true });
        }
        return;
      }

      await renderStudentDashboard();
      return;
    }
    if (["TEACHER", "ADMIN"].includes(state.role)) {
      await renderTeacher(true);
      return;
    }
    if (state.role === "PARENT") {
      await renderParent();
      return;
    }
  }

  document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const rememberLogin = f.get("rememberLogin") === "on";
    const payload = {
      email: String(f.get("email") || "").trim(),
      password: String(f.get("password") || ""),
      deviceFingerprint: String(f.get("deviceFingerprint") || "").trim(),
    };

    localStorage.setItem("deviceFingerprint", payload.deviceFingerprint);
    setRememberLogin(rememberLogin);

    try {
      const data = await api("/auth/login", { method: "POST", body: payload });
      setAuth(data, { rememberLogin });
      setLoginRouteHint("");
      toast("로그인 성공");
      await renderRoleView();
    } catch (err) {
      toast(err.message);
    }
  });

  rememberLoginInput.addEventListener("change", (e) => {
    setRememberLogin(e.target.checked);
  });

  logoutBtn.addEventListener("click", () => {
    clearAuth();
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    renderShell();
    toast("로그아웃되었습니다.");
  });

  window.addEventListener("hashchange", () => {
    renderRoleView().catch(handleRenderError);
  });

  function handleRenderError(err) {
    clearAuth();
    renderShell();
    toast(err.message);
  }

  async function bootstrap() {
    const loggedInByLink = await tryLoginWithAccessLink();
    if (loggedInByLink) {
      toast("링크 로그인 성공");
    }
    await renderRoleView();
  }

  bootstrap().catch(handleRenderError);
})();
