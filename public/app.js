(() => {
  const AUTH_STORAGE_KEYS = ["accessToken", "role", "studentId", "teacherId", "parentId"];
  const TEACHER_COMPACT_LAYOUT_QUERY = "(max-width: 780px)";
  const EXAM_AUTOFOCUS_VIEWPORT_QUERY = "(max-width: 820px)";
  const COARSE_POINTER_QUERY = "(pointer: coarse)";
  const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
  const teacherCompactLayoutMedia = window.matchMedia(TEACHER_COMPACT_LAYOUT_QUERY);
  const reducedMotionMedia = window.matchMedia(REDUCED_MOTION_QUERY);
  const LOADING_WORDS = [
    { word: "apple", meaning: "사과" },
    { word: "orbit", meaning: "궤도" },
    { word: "whisper", meaning: "속삭임" },
    { word: "lantern", meaning: "등불" },
    { word: "memory", meaning: "기억" },
    { word: "notebook", meaning: "공책" },
  ];
  const FONT_STYLESHEET_URL =
    "https://fonts.googleapis.com/css2?family=Gaegu:wght@400;700&family=Gowun+Batang:wght@400;700&family=Noto+Sans+KR:wght@400;500;700;800;900&display=swap";

  function loadDeferredFonts() {
    if (document.querySelector(`link[href="${FONT_STYLESHEET_URL}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONT_STYLESHEET_URL;
    document.head.appendChild(link);
  }

  function scheduleDeferredFonts() {
    const load = () => {
      if ("requestIdleCallback" in window) {
        window.requestIdleCallback(loadDeferredFonts, { timeout: 2000 });
      } else {
        window.setTimeout(loadDeferredFonts, 700);
      }
    };

    if (document.readyState === "complete") {
      load();
      return;
    }

    window.addEventListener("load", load, { once: true });
  }

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

  function defaultTeacherViewMode() {
    return teacherCompactLayoutMedia.matches ? "LIST" : "BOTH";
  }

  const state = {
    token: readStoredAuth("accessToken"),
    role: readStoredAuth("role"),
    studentId: readStoredAuth("studentId"),
    teacherId: readStoredAuth("teacherId"),
    parentId: readStoredAuth("parentId"),
    rememberLogin: localStorage.getItem("rememberLogin") !== "0",
    studentDashboard: null,
    studentPreview: null,
    studentPreviewTimerId: null,
    studentExam: null,
    studentExamTimerId: null,
    studentResult: null,
    studentReview: null,
    studentDashboardScreen: "study",
    teacherMeta: null,
    teacherAssignments: [],
    teacherLearningOverview: null,
    teacherSettings: null,
    teacherSettingsOwnerId: null,
    teacherAccessLink: null,
    teacherFilters: {
      status: "ALL",
      keyword: "",
    },
    teacherViewMode: defaultTeacherViewMode(),
    teacherViewModeAuto: true,
    teacherWeekOffset: 0,
    teacherEditingSessionId: null,
    teacherQuestions: [],
    teacherOfflineSessionId: null,
    teacherOfflineQuestions: [],
    teacherOfflineContext: null,
    teacherSupplementSessionId: null,
    teacherSupplementContext: null,
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
  const loadingOverlay = document.getElementById("loadingOverlay");
  const loadingLabel = document.getElementById("loadingLabel");
  const loadingWord = document.getElementById("loadingWord");
  const loadingMeaning = document.getElementById("loadingMeaning");
  const loadingWordStack = loadingOverlay.querySelector(".loading-word-stack");

  const fpInput = document.getElementById("deviceFingerprintInput");
  const rememberLoginInput = document.getElementById("rememberLoginInput");
  const savedFingerprint = localStorage.getItem("deviceFingerprint") || `device-${Math.random().toString(16).slice(2)}`;
  fpInput.value = savedFingerprint;
  rememberLoginInput.checked = state.rememberLogin;
  const loadingState = {
    depth: 0,
    showTimerId: null,
    hideTimerId: null,
    rotationTimerId: null,
    switchTimerId: null,
    wordIndex: 0,
  };

  function syncTeacherViewModeForViewport(force = false) {
    if (!force && !state.teacherViewModeAuto) return false;

    const nextMode = defaultTeacherViewMode();
    const changed = state.teacherViewMode !== nextMode;
    state.teacherViewMode = nextMode;
    state.teacherViewModeAuto = true;
    return changed;
  }

  function setLoadingWord(index) {
    const item = LOADING_WORDS[index % LOADING_WORDS.length];
    window.clearTimeout(loadingState.switchTimerId);
    loadingWordStack.classList.add("is-switching");
    loadingState.switchTimerId = window.setTimeout(() => {
      loadingWord.textContent = item.word;
      loadingMeaning.textContent = item.meaning;
      loadingWordStack.classList.remove("is-switching");
    }, 110);
  }

  function startLoadingRotation() {
    if (loadingState.rotationTimerId) return;
    setLoadingWord(loadingState.wordIndex);
    if (reducedMotionMedia.matches) return;
    loadingState.rotationTimerId = window.setInterval(() => {
      loadingState.wordIndex = (loadingState.wordIndex + 1) % LOADING_WORDS.length;
      setLoadingWord(loadingState.wordIndex);
    }, 950);
  }

  function stopLoadingRotation() {
    window.clearTimeout(loadingState.switchTimerId);
    if (!loadingState.rotationTimerId) return;
    window.clearInterval(loadingState.rotationTimerId);
    loadingState.rotationTimerId = null;
  }

  function beginLoading(label = "단어장을 준비하는 중") {
    loadingState.depth += 1;
    loadingLabel.textContent = label;

    if (loadingState.depth > 1) return;

    window.clearTimeout(loadingState.hideTimerId);
    loadingState.showTimerId = window.setTimeout(() => {
      loadingOverlay.classList.remove("hidden");
      loadingOverlay.setAttribute("aria-hidden", "false");
      startLoadingRotation();
    }, 120);
  }

  function endLoading() {
    if (loadingState.depth === 0) return;
    loadingState.depth -= 1;

    if (loadingState.depth > 0) return;

    window.clearTimeout(loadingState.showTimerId);
    loadingState.hideTimerId = window.setTimeout(() => {
      loadingOverlay.classList.add("hidden");
      loadingOverlay.setAttribute("aria-hidden", "true");
      stopLoadingRotation();
    }, 120);
  }

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
    clearStudentPreviewTimer();
    state.token = null;
    state.role = null;
    state.studentId = null;
    state.teacherId = null;
    state.parentId = null;
    state.studentDashboard = null;
    state.studentPreview = null;
    state.studentExam = null;
    state.studentResult = null;
    state.studentReview = null;
    state.studentDashboardScreen = "study";
    state.teacherMeta = null;
    state.teacherAssignments = [];
    state.teacherLearningOverview = null;
    state.teacherSettings = null;
    state.teacherSettingsOwnerId = null;
    state.teacherAccessLink = null;
    state.teacherViewMode = defaultTeacherViewMode();
    state.teacherViewModeAuto = true;
    state.teacherWeekOffset = 0;
    state.teacherEditingSessionId = null;
    state.teacherQuestions = [];
    state.teacherOfflineSessionId = null;
    state.teacherOfflineQuestions = [];
    state.teacherOfflineContext = null;
    state.teacherSupplementSessionId = null;
    state.teacherSupplementContext = null;

    clearStoredAuth();
    setLoginRouteHint("");
  }

  async function api(path, options = {}) {
    const { loadingLabel: loadingText, showLoading = true, ...requestOptions } = options;
    const headers = { ...(requestOptions.headers || {}) };
    const isFormData = requestOptions.body instanceof FormData;

    if (!isFormData && requestOptions.body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    if (state.token) {
      headers.Authorization = `Bearer ${state.token}`;
    }

    if (showLoading) {
      beginLoading(loadingText);
    }

    try {
      const res = await fetch(path, {
        ...requestOptions,
        headers,
        body:
          !isFormData && requestOptions.body && typeof requestOptions.body !== "string"
            ? JSON.stringify(requestOptions.body)
            : requestOptions.body,
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
    } finally {
      if (showLoading) {
        endLoading();
      }
    }
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
    document.body.classList.toggle("student-home-mode", state.role === "STUDENT" && !examMode);
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

  function renderViewSkeleton(target, variant = "student") {
    const skeletonCards = {
      student: 4,
      teacher: 5,
      parent: 3,
    };
    const cardCount = skeletonCards[variant] || 3;
    const cards = Array.from({ length: cardCount }, (_, index) => {
      const isWide = index === 0 && variant !== "parent";
      return `
        <article class="skeleton-block${isWide ? " wide" : ""}">
          <div class="skeleton-line title"></div>
          <div class="skeleton-line body"></div>
          <div class="skeleton-line body short"></div>
        </article>
      `;
    }).join("");

    target.innerHTML = `
      <section class="paper skeleton-paper reveal" aria-hidden="true">
        <div class="paper-head">
          <div class="skeleton-line heading"></div>
          <div class="skeleton-line body"></div>
        </div>
        <div class="kpi-grid skeleton-kpi-grid">
          <article class="kpi skeleton-kpi"><div class="skeleton-line label"></div><div class="skeleton-line value"></div></article>
          <article class="kpi skeleton-kpi"><div class="skeleton-line label"></div><div class="skeleton-line value"></div></article>
          <article class="kpi skeleton-kpi"><div class="skeleton-line label"></div><div class="skeleton-line value"></div></article>
          <article class="kpi skeleton-kpi"><div class="skeleton-line label"></div><div class="skeleton-line value"></div></article>
        </div>
        <div class="skeleton-stack ${variant === "teacher" ? "teacher" : ""}">
          ${cards}
        </div>
      </section>
    `;
  }

  function scheduleViewSkeleton(target, variant = "student", delay = 140) {
    const timerId = window.setTimeout(() => {
      renderViewSkeleton(target, variant);
    }, delay);

    return () => window.clearTimeout(timerId);
  }

  function statusLabel(status) {
    const labels = {
      SCHEDULED: "배정 예정",
      PUBLISHED: "배부됨",
      IN_PROGRESS: "응시 중",
      COMPLETED: "완료",
      MISSED: "놓침",
    };
    return labels[status] || status || "-";
  }

  function statusBadge(status) {
    const label = statusLabel(status);
    if (status === "MISSED") return `<span class="badge missed">${label}</span>`;
    if (status === "COMPLETED") return `<span class="badge done">${label}</span>`;
    return `<span class="badge">${label}</span>`;
  }

  function isTodayLocal(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return false;
    const now = new Date();
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  }

  function teacherPublishReady(assignment) {
    if (assignment.status !== "SCHEDULED") return false;
    const publishAtMs = new Date(assignment.publish_at).getTime();
    return Number.isFinite(publishAtMs) && publishAtMs <= Date.now();
  }

  function teacherDueSoon(assignment, hours = 24) {
    if (assignment.test_session_status === "COMPLETED" || assignment.status === "COMPLETED") return false;
    const dueAtMs = new Date(assignment.due_at).getTime();
    if (!Number.isFinite(dueAtMs)) return false;
    const diff = dueAtMs - Date.now();
    return diff >= 0 && diff <= hours * 60 * 60 * 1000;
  }

  function teacherNeedsAttention(assignment) {
    return !assignment.test_session_id || teacherPublishReady(assignment) || assignment.status === "MISSED" || teacherDueSoon(assignment);
  }

  function teacherPriorityScore(assignment) {
    if (assignment.status === "MISSED") return 0;
    if (!assignment.test_session_id) return 1;
    if (teacherPublishReady(assignment)) return 2;
    if (teacherDueSoon(assignment, 6)) return 3;
    if (teacherDueSoon(assignment, 24)) return 4;
    if (assignment.status === "IN_PROGRESS" || assignment.test_session_status === "IN_PROGRESS") return 5;
    if (assignment.status === "PUBLISHED") return 6;
    if (assignment.status === "SCHEDULED") return 7;
    if (assignment.test_session_status === "COMPLETED" || assignment.status === "COMPLETED") return 8;
    return 9;
  }

  function teacherAssignmentSituation(assignment) {
    if (assignment.status === "MISSED") return "학생이 과제를 놓쳤습니다.";
    if (!assignment.test_session_id) return "시험지를 먼저 만들어야 합니다.";
    if (teacherPublishReady(assignment)) return "배부 시각이 되었지만 아직 열리지 않았습니다.";
    if (assignment.status === "SCHEDULED") return `자동 배부 예정: ${fmtDate(assignment.publish_at)}`;
    if (assignment.status === "IN_PROGRESS" || assignment.test_session_status === "IN_PROGRESS") return "학생이 현재 시험을 진행 중입니다.";
    if (teacherDueSoon(assignment, 24)) return "오늘 안에 확인이 필요한 과제입니다.";
    if (assignment.status === "PUBLISHED") return "학생 응시를 기다리는 상태입니다.";
    if (assignment.test_session_status === "COMPLETED" || assignment.status === "COMPLETED") return "제출이 완료되어 후속 복습만 남았습니다.";
    return "현재 과제 상태를 확인할 수 있습니다.";
  }

  function teacherPrimaryAction(assignment) {
    if (!assignment.test_session_id) {
      return {
        type: "generate",
        label: "시험지 만들기",
        style: "btn btn-warm assignment-primary-btn",
        note: "시험지가 아직 없습니다. 먼저 문제를 생성하세요.",
      };
    }

    if (teacherPublishReady(assignment)) {
      return {
        type: "publish",
        label: "지금 배부",
        style: "btn btn-warm assignment-primary-btn",
        note: "자동 배부 시각이 지났습니다. 지금 바로 학생에게 열어줄 수 있습니다.",
      };
    }

    if (assignment.status === "MISSED") {
      return {
        type: "offline",
        label: "오프라인 반영",
        style: "btn btn-warm assignment-primary-btn",
        note: "종이 시험이나 구두 확인 결과가 있으면 바로 점수를 반영하세요.",
      };
    }

    if (assignment.status === "IN_PROGRESS" || assignment.test_session_status === "IN_PROGRESS") {
      return {
        type: "offline",
        label: "오프라인 마감",
        style: "btn btn-quiet assignment-primary-btn",
        note: "현장 응시로 마감해야 한다면 여기서 바로 처리할 수 있습니다.",
      };
    }

    if (assignment.test_session_status === "COMPLETED" || assignment.status === "COMPLETED") {
      return {
        type: "supplement",
        label: "보충 과제 만들기",
        style: "btn btn-quiet assignment-primary-btn",
        note: "틀린 문제 위주 보충 과제를 다시 배정할 수 있습니다.",
      };
    }

    if (assignment.status === "PUBLISHED") {
      return {
        type: "edit",
        label: "문항 확인",
        style: "btn btn-quiet assignment-primary-btn",
        note: "학생이 시작하기 전 문항과 정답을 다시 확인할 수 있습니다.",
      };
    }

    return {
      type: null,
      label: "자동 진행 중",
      style: "assignment-inline-note",
      note: teacherAssignmentSituation(assignment),
    };
  }

  function teacherActionButtonMarkup(actionType, assignment, label, className = "btn btn-quiet") {
    if (!actionType) return "";

    if (actionType === "generate") {
      return `<button class="${className}" type="button" data-act="generate" data-assignment-id="${assignment.id}">${label}</button>`;
    }
    if (actionType === "publish") {
      return `<button class="${className}" type="button" data-act="publish" data-assignment-id="${assignment.id}">${label}</button>`;
    }
    if (actionType === "edit" && assignment.test_session_id) {
      return `<button class="${className}" type="button" data-act="edit" data-session-id="${assignment.test_session_id}">${label}</button>`;
    }
    if (actionType === "offline" && assignment.test_session_id) {
      return `<button class="${className}" type="button" data-act="offline" data-session-id="${assignment.test_session_id}">${label}</button>`;
    }
    if (actionType === "supplement" && assignment.test_session_id) {
      return `<button class="${className}" type="button" data-act="supplement" data-session-id="${assignment.test_session_id}">${label}</button>`;
    }
    if (actionType === "copy") {
      return `<button class="${className}" type="button" data-act="copy" data-assignment-id="${assignment.id}">${label}</button>`;
    }
    if (actionType === "export") {
      return `<button class="${className}" type="button" data-act="export" data-assignment-id="${assignment.id}">${label}</button>`;
    }
    return "";
  }

  function teacherSecondaryActions(assignment, primaryActionType) {
    const actions = [];

    if (!assignment.test_session_id) {
      actions.push({ type: "generate", label: "시험지 만들기" });
    }
    if (assignment.status === "SCHEDULED") {
      actions.push({ type: "publish", label: "지금 배부" });
    }
    if (assignment.test_session_id) {
      actions.push({ type: "edit", label: "문항 편집" });
      if (assignment.test_session_status !== "COMPLETED") {
        actions.push({ type: "offline", label: "오프라인 입력" });
      }
      if (assignment.test_session_status === "COMPLETED") {
        actions.push({ type: "supplement", label: "보충 과제" });
      }
    }

    actions.push({ type: "export", label: "엑셀 내보내기" });
    actions.push({ type: "copy", label: "ID 복사" });

    return actions.filter((action, index, arr) => {
      if (action.type === primaryActionType) return false;
      return arr.findIndex((candidate) => candidate.type === action.type) === index;
    });
  }

  function teacherAssignmentStatusMarkup(assignment) {
    const sessionBadge = assignment.test_session_id ? statusBadge(assignment.test_session_status) : '<span class="badge">시험지 없음</span>';
    const previewBadge = assignment.preview_enabled
      ? `<span class="badge">미리보기 ${escapeHtml(Math.max(0, Number(assignment.preview_duration_sec || 0)))}초</span>`
      : "";
    const gameBadge = assignment.gamification_enabled ? '<span class="badge done">XP/배지</span>' : "";
    const kindBadge = assignment.assignment_kind === "SUPPLEMENT" ? '<span class="badge">보충</span>' : "";
    return `
      <div class="assignment-status-stack">
        <div class="row assignment-status-row">
          ${statusBadge(assignment.status)}
          ${sessionBadge}
          ${kindBadge}
          ${previewBadge}
          ${gameBadge}
        </div>
        <p class="meta assignment-status-copy">${escapeHtml(teacherAssignmentSituation(assignment))}</p>
      </div>
    `;
  }

  function teacherDueCopy(assignment) {
    if (assignment.status === "MISSED") return "마감 지남";
    if (isTodayLocal(assignment.due_at)) return "오늘 마감";
    if (teacherDueSoon(assignment, 24)) return "24시간 이내";
    return "일정 확인";
  }

  function teacherAssignmentActionsMarkup(assignment) {
    const primary = teacherPrimaryAction(assignment);
    const primaryButton = teacherActionButtonMarkup(primary.type, assignment, primary.label, primary.style);
    const secondaryActions = teacherSecondaryActions(assignment, primary.type)
      .map((action) => teacherActionButtonMarkup(action.type, assignment, action.label, "btn btn-quiet action-chip"))
      .join("");

    return `
      <div class="assignment-action-stack">
        <div class="assignment-primary-action">
          ${
            primaryButton
              ? primaryButton
              : `<div class="assignment-inline-note"><strong>${escapeHtml(primary.label)}</strong><span>${escapeHtml(primary.note)}</span></div>`
          }
          <p class="meta assignment-action-copy">${escapeHtml(primary.note)}</p>
        </div>
        ${
          secondaryActions
            ? `
              <details class="assignment-more">
                <summary class="mini-btn">추가 작업</summary>
                <div class="assignment-secondary-actions">
                  ${secondaryActions}
                </div>
              </details>
            `
            : ""
        }
      </div>
    `;
  }

  function teacherAssignmentMobileCardsMarkup(items) {
    if (items.length === 0) {
      return '<div class="note-lines">조건에 맞는 과제가 없습니다.</div>';
    }

    return items
      .map(
        (assignment) => `
          <article class="assignment-mobile-card ${teacherNeedsAttention(assignment) ? "attention" : ""}">
            <div class="row row-between assignment-mobile-head">
              <div>
                <p class="assignment-mobile-title">${escapeHtml(assignment.student_name)}</p>
                <p class="assignment-mobile-subtitle">${escapeHtml(assignment.source_name)}</p>
              </div>
              <span class="assignment-due-flag ${teacherNeedsAttention(assignment) ? "attention" : ""}">${escapeHtml(teacherDueCopy(assignment))}</span>
            </div>
            <div class="assignment-mobile-meta">
              <p>
                <strong>범위</strong>
                <span>${escapeHtml(`${assignment.range_start_lesson}-${assignment.range_end_lesson} (${assignment.question_count}문항)`)}</span>
              </p>
              <p>
                <strong>마감</strong>
                <span>${escapeHtml(fmtDate(assignment.due_at))}</span>
              </p>
              <p>
                <strong>ID</strong>
                <span class="mono short-id">${escapeHtml(assignment.id.slice(0, 8))}</span>
              </p>
              <p>
                <strong>상태</strong>
                <span>${statusLabel(assignment.status)}</span>
              </p>
            </div>
            ${teacherAssignmentStatusMarkup(assignment)}
            ${teacherAssignmentActionsMarkup(assignment)}
          </article>
        `
      )
      .join("");
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

  function getDefaultPreviewEnabled() {
    return Boolean(getTeacherSettingsValue("default_preview_enabled", false));
  }

  function getDefaultPreviewDurationSec() {
    const seconds = Number(getTeacherSettingsValue("default_preview_duration_sec", 60));
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : 60;
  }

  function getDefaultPreviewScope() {
    const scope = String(getTeacherSettingsValue("default_preview_scope", "ALL") || "ALL").toUpperCase();
    return ["ALL", "KEYWORDS", "WRONG_ONLY"].includes(scope) ? scope : "ALL";
  }

  function getDefaultGamificationEnabled() {
    return Boolean(getTeacherSettingsValue("default_gamification_enabled", true));
  }

  function previewScopeOptions() {
    return [
      { value: "ALL", label: "전체 단어" },
      { value: "KEYWORDS", label: "핵심 단어 5개" },
      { value: "WRONG_ONLY", label: "지난 오답 우선" },
    ];
  }

  function previewScopeLabel(value) {
    const option = previewScopeOptions().find((item) => item.value === String(value || "ALL").toUpperCase());
    return option?.label || "전체 단어";
  }

  function buildDueAtInputValue(publishInputValue, dueHours = getDefaultDueHours()) {
    const baseDate = publishInputValue ? new Date(String(publishInputValue)) : new Date();
    const nextDate = new Date(baseDate.getTime() + dueHours * 60 * 60 * 1000);
    return toInputDateTime(nextDate.toISOString());
  }

  function teacherSettingsFieldOrder() {
    return [
      "default_assignment_due_hours",
      "adaptive_learning_enabled",
      "supplement_min_wrong",
      "supplement_max_questions",
      "supplement_due_hours",
      "default_preview_enabled",
      "default_preview_duration_sec",
      "default_preview_scope",
      "default_gamification_enabled",
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

  function getStudentPreviewRouteSessionId() {
    const match = window.location.hash.match(/^#student-preview\/(.+)$/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  function isStudentResultRoute() {
    return window.location.hash === "#student-result";
  }

  function isStudentReviewRoute() {
    return window.location.hash === "#student-review";
  }

  function isStudentPreviewRoute() {
    return Boolean(getStudentPreviewRouteSessionId());
  }

  function isStudentFocusRoute() {
    return Boolean(getStudentExamRouteSessionId()) || isStudentPreviewRoute() || isStudentResultRoute() || isStudentReviewRoute();
  }

  function navigateToStudentPreview(sessionId) {
    const nextHash = `#student-preview/${encodeURIComponent(sessionId)}`;
    if (window.location.hash === nextHash) {
      renderRoleView().catch(handleRenderError);
      return;
    }
    window.location.hash = nextHash;
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
    return String(value == null ? "" : value).replace(/[&<>"']/g, (char) => {
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

  function shouldAutoFocusStudentExamInput() {
    return !window.matchMedia(EXAM_AUTOFOCUS_VIEWPORT_QUERY).matches && !window.matchMedia(COARSE_POINTER_QUERY).matches;
  }

  function focusStudentExamInput(input) {
    if (!input || !shouldAutoFocusStudentExamInput()) return;

    window.requestAnimationFrame(() => {
      try {
        input.focus({ preventScroll: true });
      } catch {
        input.focus();
      }
      input.select();
    });
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

  function clearStudentPreviewTimer() {
    if (state.studentPreviewTimerId) {
      window.clearInterval(state.studentPreviewTimerId);
      state.studentPreviewTimerId = null;
    }
  }

  function clearStudentExamTimer() {
    if (state.studentExamTimerId) {
      window.clearInterval(state.studentExamTimerId);
      state.studentExamTimerId = null;
    }
  }

  function getStudentPreviewRemainingSeconds(preview = state.studentPreview) {
    if (!preview) return 0;
    const durationSec = Math.max(0, Number(preview.previewDurationSec || 0));
    if (durationSec === 0) return 0;
    const startedAtMs = new Date(preview.previewStartedAt || Date.now()).getTime();
    if (Number.isNaN(startedAtMs)) return durationSec;
    const unlockAtMs = startedAtMs + durationSec * 1000;
    return Math.max(0, Math.ceil((unlockAtMs - Date.now()) / 1000));
  }

  function buildStudentReviewState(reviewSet) {
    return {
      id: reviewSet?.id || null,
      status: reviewSet?.status || "OPEN",
      sourceName: reviewSet?.sourceName || null,
      recoveredCount: reviewSet?.recoveredCount || 0,
      itemCount: reviewSet?.itemCount || 0,
      gamificationEnabled: Boolean(reviewSet?.gamificationEnabled),
      batches: getReviewBatches(reviewSet?.items || []),
      batchIndex: 0,
      rewards: null,
    };
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
    const badgeList = (result.newBadges || [])
      .map((badge) => `<span class="badge done">${escapeHtml(badge.badge_title || badge.badge_code)}</span>`)
      .join("");
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
          result.earnedXp || badgeList
            ? `
              <div class="student-game-inline">
                ${result.earnedXp ? `<span class="badge done">XP +${escapeHtml(result.earnedXp)}</span>` : ""}
                ${badgeList}
              </div>
            `
            : ""
        }
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
    return sortStudentAssignments(
      items.filter((i) => ["SCHEDULED", "PUBLISHED", "IN_PROGRESS", "MISSED"].includes(i.status))
    )[0];
  }

  function countByStatus(items, status) {
    return items.filter((x) => x.status === status).length;
  }

  function studentBadgePillMarkup(badges = []) {
    return badges
      .slice(0, 4)
      .map((badge) => `<span class="badge done">${escapeHtml(badge.badge_title || badge.badge_code || "Badge")}</span>`)
      .join("");
  }

  function studentGameProfileMarkup(gameProfile) {
    if (!gameProfile) return "";

    return `
      <section class="paper student-game-panel">
        <div class="paper-head">
          <h2>오늘의 성장</h2>
          <p>점수만 보지 않고 꾸준함과 회복까지 함께 보여줍니다.</p>
        </div>
        <div class="student-game-grid">
          <article class="card student-game-card">
            <p class="student-game-label">Level</p>
            <p class="student-game-value">Lv.${escapeHtml(gameProfile.level || 1)}</p>
            <p class="meta">누적 XP ${escapeHtml(gameProfile.totalXp || 0)}</p>
          </article>
          <article class="card student-game-card">
            <p class="student-game-label">연속 학습</p>
            <p class="student-game-value">${escapeHtml(gameProfile.currentStreak || 0)}일</p>
            <p class="meta">최고 기록 ${escapeHtml(gameProfile.longestStreak || 0)}일</p>
          </article>
        </div>
        ${
          gameProfile.recentBadges?.length
            ? `<div class="student-game-inline">${studentBadgePillMarkup(gameProfile.recentBadges)}</div>`
            : `<p class="meta">배지는 시험 완료와 오답 회복을 쌓아가며 열립니다.</p>`
        }
      </section>
    `;
  }

  function studentLearningCoachMarkup(summary) {
    if (!summary) return "";
    const weakWords = Array.isArray(summary.weakWords) ? summary.weakWords : [];
    const wordRows = weakWords.length
      ? weakWords
          .map(
            (word) => `
              <li class="learning-word-item">
                <span>
                  <strong>${escapeHtml(word.lemma)}</strong>
                  <small>${escapeHtml(word.meaning || "")}</small>
                </span>
                <em>${escapeHtml(word.masteryScore || 0)}%</em>
              </li>
            `
          )
          .join("")
      : `<li class="learning-word-item empty"><span><strong>아직 약점 단어가 없습니다.</strong><small>시험을 마치면 자동으로 분석합니다.</small></span></li>`;

    return `
      <section class="paper learning-coach-card">
        <div class="paper-head">
          <h2>단어 알고리즘 코치</h2>
          <p>${escapeHtml(summary.message || "시험 결과를 바탕으로 다음 단어를 고릅니다.")}</p>
        </div>
        <div class="learning-coach-grid">
          <article class="learning-metric">
            <span>평균 숙련도</span>
            <strong>${escapeHtml(summary.avgMastery || 0)}%</strong>
          </article>
          <article class="learning-metric">
            <span>복습 예정</span>
            <strong>${escapeHtml(summary.dueNow || 0)}</strong>
          </article>
          <article class="learning-metric">
            <span>약한 단어</span>
            <strong>${escapeHtml(summary.weakCount || 0)}</strong>
          </article>
        </div>
        <ul class="learning-word-list">${wordRows}</ul>
      </section>
    `;
  }

  function studentReviewTaskMarkup(reviewTask) {
    if (!reviewTask) return "";

    return `
      <article class="card student-review-card">
        <div class="row row-between">
          <div>
            <p class="student-queue-label">Recovery Loop</p>
            <p class="student-queue-title">${escapeHtml(reviewTask.sourceName || "오답 복습")}</p>
          </div>
          <span class="badge">${escapeHtml(`${reviewTask.itemCount || reviewTask.items?.length || 0}개`)}</span>
        </div>
        <p class="meta">가장 최근에 틀린 단어를 3개씩 묶어서 다시 확인합니다.</p>
        <div class="row">
          <button class="btn btn-quiet" data-action="open-review-set" data-review-set-id="${reviewTask.id}">틀린 단어 다시 보기</button>
        </div>
      </article>
    `;
  }

  function studentGrowthCardMarkup(growth) {
    if (!growth?.message) return "";
    return `
      <article class="card student-growth-card">
        <p class="student-queue-label">이번 주 흐름</p>
        <p class="student-queue-title">${escapeHtml(growth.message)}</p>
        <p class="meta">열린 오답 복습 ${escapeHtml(growth.openReviewCount || 0)}개</p>
      </article>
    `;
  }

  function studentDashboardPanelButton(screen, label, activeScreen) {
    const isActive = screen === activeScreen;
    return `<button class="student-screen-tab${isActive ? " active" : ""}" id="student-tab-${screen}" type="button" role="tab" aria-selected="${isActive}" aria-controls="student-panel-${screen}" data-student-screen="${screen}">${label}</button>`;
  }

  function studentDashboardPanel(screen, activeScreen, content) {
    const isActive = screen === activeScreen;
    return `<section class="student-dashboard-panel${isActive ? " active" : ""}" id="student-panel-${screen}" role="tabpanel" aria-labelledby="student-tab-${screen}" aria-hidden="${!isActive}" data-student-panel="${screen}">${content}</section>`;
  }

  function activateStudentDashboardPanel(screen) {
    state.studentDashboardScreen = screen;
    studentView.querySelectorAll("[data-student-screen]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.studentScreen === screen);
      btn.setAttribute("aria-selected", String(btn.dataset.studentScreen === screen));
    });
    studentView.querySelectorAll("[data-student-panel]").forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.studentPanel === screen);
      panel.setAttribute("aria-hidden", String(panel.dataset.studentPanel !== screen));
    });
    studentView.querySelector(".student-screen-shell")?.scrollIntoView({ block: "start" });
  }

  function studentAssignmentPriority(item) {
    if (item.test_session_status === "IN_PROGRESS") return 0;
    if (item.status === "PUBLISHED") return 1;
    if (item.status === "SCHEDULED") return 2;
    if (item.status === "MISSED") return 3;
    if (item.test_session_status === "COMPLETED" || item.status === "COMPLETED") return 4;
    return 5;
  }

  function sortStudentAssignments(items) {
    return [...items]
      .filter(Boolean)
      .sort((a, b) => {
        const priorityDiff = studentAssignmentPriority(a) - studentAssignmentPriority(b);
        if (priorityDiff !== 0) return priorityDiff;
        return new Date(a.due_at) - new Date(b.due_at);
      });
  }

  function studentPrimaryActionLabel(item) {
    if (item.test_session_status === "IN_PROGRESS") return "이어서 테스트";
    if (item.test_session_id) return "빠른 암기 시작";
    if (item.status === "SCHEDULED") return "열릴 때까지 기다리는 중";
    return "시험 준비중";
  }

  function studentAssignmentSupportCopy(item) {
    if (item.test_session_status === "IN_PROGRESS") {
      return "저장된 답안 그대로 이어집니다. 지금 한 문제씩 차분하게 마무리하면 됩니다.";
    }

    if (item.preview_enabled && !item.preview_completed_at && item.test_session_id) {
      return "단어 뜻과 예문을 한 장씩 넘기며 빠르게 외운 뒤 테스트로 이어집니다.";
    }

    if (item.test_session_id && item.status === "PUBLISHED") {
      return "암기 카드를 먼저 보고 바로 테스트합니다. 긴 설명 없이 한 화면씩 넘어갑니다.";
    }

    if (item.status === "SCHEDULED") {
      return "정해진 시각이 되면 바로 열립니다. 지금은 범위만 가볍게 확인해 두면 충분합니다.";
    }

    if (item.status === "MISSED") {
      return "놓친 과제입니다. 다시 시작해도 늦지 않으니 가장 짧은 범위부터 회복해 봅시다.";
    }

    return "다음 학습 흐름이 자연스럽게 이어지도록 필요한 과제를 먼저 보여줍니다.";
  }

  function studentQueueLabel(item) {
    if (item.test_session_status === "IN_PROGRESS") return "이어 풀기";
    if (item.preview_enabled && !item.preview_completed_at) return "미리보기 대기";
    if (item.status === "PUBLISHED") return "다음 우선순위";
    if (item.status === "SCHEDULED") return "곧 열릴 과제";
    if (item.status === "MISSED") return "다시 챙기기";
    if (item.test_session_status === "COMPLETED") return "최근 완료";
    return "과제";
  }

  async function renderStudentDashboard() {
    clearStudentPreviewTimer();
    clearStudentExamTimer();
    const cancelSkeleton = scheduleViewSkeleton(studentView, "student");
    let data;
    try {
      data = await api("/students/me/dashboard", { showLoading: false });
    } finally {
      cancelSkeleton();
    }
    state.studentDashboard = data;
    const items = data.items || [];
    const reviewTask = data.reviewTask || null;
    const gameProfile = data.gameProfile || null;
    const learningSummary = data.learningSummary || null;
    const growth = data.recentGrowth || null;
    const pending = getPendingAssignment(items);
    const sortedItems = sortStudentAssignments(items);
    const remainingItems = sortedItems.filter((item) => item.id !== pending?.id);

    const kpis = {
      total: items.length,
      active: items.filter((i) => ["SCHEDULED", "PUBLISHED", "IN_PROGRESS"].includes(i.status)).length,
      missed: countByStatus(items, "MISSED"),
      completed: items.filter((i) => i.test_session_status === "COMPLETED").length,
    };
    const activeScreen = state.studentDashboardScreen || "study";
    const primaryAction = pending?.test_session_status === "IN_PROGRESS" ? "open-session" : "open-memorize";
    const activeFlowStep = pending?.test_session_status === "IN_PROGRESS" ? "test" : "memorize";

    const primaryCard = pending
      ? `
        <section class="paper student-focus-card">
          <div class="row row-between student-focus-head">
            <div>
              <p class="student-focus-kicker">${pending.test_session_status === "IN_PROGRESS" ? "이어 하기" : "오늘 학습"}</p>
              <h2 class="student-focus-title">${escapeHtml(pending.source_name)}</h2>
            </div>
            ${statusBadge(pending.status)}
          </div>
          <p class="student-focus-copy">${studentAssignmentSupportCopy(pending)}</p>
          <div class="student-focus-stats">
            <article class="student-focus-stat">
              <p class="meta">배정</p>
              <strong>${escapeHtml(fmtDate(pending.publish_at))}</strong>
            </article>
            <article class="student-focus-stat">
              <p class="meta">마감</p>
              <strong>${escapeHtml(fmtDate(pending.due_at))}</strong>
            </article>
            <article class="student-focus-stat">
              <p class="meta">범위</p>
              <strong>Lesson ${escapeHtml(`${pending.range_start_lesson}-${pending.range_end_lesson}`)}</strong>
            </article>
            <article class="student-focus-stat">
              <p class="meta">문항</p>
              <strong>${escapeHtml(`${pending.question_count}문항`)}</strong>
            </article>
          </div>
          <div class="student-flow-steps" aria-label="학습 순서">
            <div class="student-flow-step ${activeFlowStep === "memorize" ? "active" : ""}"><span>1</span><strong>빠른 암기</strong><small>단어 카드를 넘기며 확인</small></div>
            <div class="student-flow-step ${activeFlowStep === "test" ? "active" : ""}"><span>2</span><strong>테스트</strong><small>한 문제씩 바로 입력</small></div>
            <div class="student-flow-step"><span>3</span><strong>오답 회복</strong><small>틀린 단어만 다시 보기</small></div>
          </div>
          <div class="student-game-inline">
            ${
              pending.preview_enabled
                ? `<span class="badge">미리보기 ${escapeHtml(Math.max(0, Number(pending.preview_duration_sec || 0)))}초</span>`
                : ""
            }
            ${pending.gamification_enabled ? `<span class="badge done">XP / 배지 표시</span>` : ""}
          </div>
          <div class="row student-focus-actions">
            ${
              pending.test_session_id
                ? `<button class="btn btn-warm" data-action="${primaryAction}" data-session-id="${pending.test_session_id}">${studentPrimaryActionLabel(pending)}</button>`
                : `<button class="btn btn-quiet" type="button" disabled>${studentPrimaryActionLabel(pending)}</button>`
            }
            ${
              pending.test_session_id
                ? `<button class="btn btn-quiet" data-action="open-session" data-session-id="${pending.test_session_id}">${
                    pending.test_session_status === "IN_PROGRESS" ? "테스트 이어가기" : "바로 테스트"
                  }</button>`
                : ""
            }
            ${
              pending.test_session_status === "COMPLETED"
                ? `<span class="badge done">점수 ${pending.score ?? 0}/100</span>`
                : `<span class="badge">${escapeHtml(studentQueueLabel(pending))}</span>`
            }
          </div>
        </section>
      `
      : `
        <section class="paper student-focus-card student-focus-card-empty">
          <p class="student-focus-kicker">오늘 학습</p>
          <h2 class="student-focus-title">지금 바로 시작할 과제가 없습니다.</h2>
          <p class="student-focus-copy">오늘 해야 할 과제를 모두 정리했습니다. 최근 결과를 복습하거나 다음 배정을 기다리면 됩니다.</p>
        </section>
      `;

    const visibleTaskItems = remainingItems.slice(0, 2);
    const hiddenTaskCount = Math.max(0, remainingItems.length - visibleTaskItems.length);
    const secondaryCards = visibleTaskItems
      .map((item) => {
        const hasSession = Boolean(item.test_session_id);
        const actionLabel =
          item.test_session_status === "IN_PROGRESS"
            ? "이어서 풀기"
            : item.preview_enabled && !item.preview_completed_at
              ? "미리보기 후 시작"
              : "집중 시험 시작";

        return `
          <article class="student-task-row ${item.status === "MISSED" ? "priority" : ""}">
            <div class="student-task-main">
              <p class="student-queue-label">${studentQueueLabel(item)}</p>
              <p class="student-queue-title">${escapeHtml(item.source_name)}</p>
              <p class="meta">Lesson ${item.range_start_lesson}-${item.range_end_lesson} / ${item.question_count}문항</p>
            </div>
            <div class="student-task-side">
              ${statusBadge(item.status)}
              <p class="meta">마감 ${fmtDate(item.due_at)}</p>
            </div>
            <div class="student-task-actions">
              ${hasSession ? `<button class="btn btn-quiet" data-action="open-session" data-session-id="${item.test_session_id}">${actionLabel}</button>` : `<button class="btn btn-quiet" type="button" disabled>시험 준비중</button>`}
              ${item.test_session_status === "COMPLETED" ? `<span class="badge done">점수 ${item.score ?? 0}/100</span>` : ""}
            </div>
          </article>
        `;
      })
      .join("");
    const archivedTaskHint = hiddenTaskCount
      ? `<p class="meta student-task-more">나머지 ${hiddenTaskCount}개는 우선순위가 낮아 접어 두었습니다.</p>`
      : "";
    const reviewPanel = `
      <section class="paper student-panel-card">
        <div class="paper-head">
          <h2>오답 복습</h2>
          <p>틀린 단어만 한 묶음씩 넘기며 확인합니다.</p>
        </div>
        <div class="student-queue-grid">
          ${studentReviewTaskMarkup(reviewTask) || `<article class="card"><p class="student-queue-title">열린 오답 복습이 없습니다.</p><p class="meta">테스트를 마치면 틀린 단어가 이곳에 모입니다.</p></article>`}
          ${studentGrowthCardMarkup(growth)}
        </div>
      </section>
    `;
    const progressPanel = `
      ${studentGameProfileMarkup(gameProfile) || `<section class="paper student-game-panel"><p class="student-focus-kicker">성장</p><h2>아직 성장 기록이 없습니다.</h2><p class="meta">테스트를 완료하면 XP와 연속 학습이 기록됩니다.</p></section>`}
      ${studentLearningCoachMarkup(learningSummary)}
      <section class="paper student-panel-card student-progress-summary">
        <div class="kpi-grid student-kpi-screen">
          <article class="kpi"><p class="kpi-label">전체 과제</p><p class="kpi-value">${kpis.total}</p></article>
          <article class="kpi"><p class="kpi-label">진행 필요</p><p class="kpi-value">${kpis.active}</p></article>
          <article class="kpi"><p class="kpi-label">완료</p><p class="kpi-value">${kpis.completed}</p></article>
          <article class="kpi danger"><p class="kpi-label">미완료</p><p class="kpi-value">${kpis.missed}</p></article>
        </div>
      </section>
    `;
    const tasksPanel = `
      <section class="paper student-panel-card">
        <div class="paper-head">
          <h2>과제 선택</h2>
          <p>다른 과제로 이동할 때만 열어 보면 됩니다.</p>
        </div>
        <div class="student-task-list">${secondaryCards || `<div class="note-lines">현재 추가로 확인할 과제가 없습니다.</div>`}</div>
        ${archivedTaskHint}
      </section>
    `;

    studentView.innerHTML = `
      ${studentResultSummaryMarkup()}
      <section class="student-screen-shell">
        <nav class="student-screen-tabs" role="tablist" aria-label="학생 화면 이동">
          ${studentDashboardPanelButton("study", "학습", activeScreen)}
          ${studentDashboardPanelButton("review", "복습", activeScreen)}
          ${studentDashboardPanelButton("progress", "성장", activeScreen)}
          ${studentDashboardPanelButton("tasks", "과제", activeScreen)}
        </nav>
        ${studentDashboardPanel("study", activeScreen, primaryCard)}
        ${studentDashboardPanel("review", activeScreen, reviewPanel)}
        ${studentDashboardPanel("progress", activeScreen, progressPanel)}
        ${studentDashboardPanel("tasks", activeScreen, tasksPanel)}
      </section>
    `;

    const tabButtons = Array.from(studentView.querySelectorAll("[data-student-screen]"));
    tabButtons.forEach((btn, index) => {
      btn.addEventListener("click", () => activateStudentDashboardPanel(btn.dataset.studentScreen));
      btn.addEventListener("keydown", (event) => {
        const keyMap = {
          ArrowRight: Math.min(index + 1, tabButtons.length - 1),
          ArrowLeft: Math.max(index - 1, 0),
          Home: 0,
          End: tabButtons.length - 1,
        };
        if (!(event.key in keyMap)) return;
        event.preventDefault();
        const nextButton = tabButtons[keyMap[event.key]];
        nextButton.focus();
        activateStudentDashboardPanel(nextButton.dataset.studentScreen);
      });
    });

    studentView.querySelectorAll("[data-action='open-memorize']").forEach((btn) => {
      btn.addEventListener("click", () => openStudentMemorizeSession(btn.dataset.sessionId));
    });

    studentView.querySelectorAll("[data-action='open-session']").forEach((btn) => {
      btn.addEventListener("click", () => openStudentSession(btn.dataset.sessionId));
    });

    studentView.querySelectorAll("[data-action='open-review-set']").forEach((btn) => {
      btn.addEventListener("click", () => openStudentReviewSet(btn.dataset.reviewSetId));
    });

    const resultBtn = document.getElementById("openStudentResultBtn");
    if (resultBtn) {
      resultBtn.addEventListener("click", () => navigateToStudentResult());
    }

    const reviewBtn = document.getElementById("openStudentReviewBtn");
    if (reviewBtn) {
      reviewBtn.addEventListener("click", () => {
        if (state.studentResult?.reviewSet?.id) {
          openStudentReviewSet(state.studentResult.reviewSet.id);
          return;
        }

        state.studentReview = buildStudentReviewState({
          items: state.studentResult?.wrongItems || [],
        });
        navigateToStudentReview();
      });
    }
  }

  async function ensureStudentPreviewLoaded(sessionId) {
    if (state.studentPreview?.sessionId === sessionId && Array.isArray(state.studentPreview.cards)) {
      return;
    }

    const data = await api(`/students/test-sessions/${sessionId}/preview`);
    let previewStartedAt = data.previewStartedAt;
    if (data.previewEnabled && !previewStartedAt) {
      const started = await api(`/students/test-sessions/${sessionId}/preview/start`, {
        method: "POST",
        body: {},
      });
      previewStartedAt = started.previewStartedAt;
    }

    state.studentPreview = {
      sessionId,
      sourceName: data.sourceName,
      previewEnabled: Boolean(data.previewEnabled),
      previewDurationSec: Number(data.previewDurationSec || 0),
      previewScope: data.previewScope || "ALL",
      previewStartedAt: previewStartedAt || new Date().toISOString(),
      previewCompletedAt: data.previewCompletedAt || null,
      cards: data.cards || [],
      index: 0,
    };
  }

  async function ensureStudentExamLoaded(sessionId) {
    if (state.studentExam?.sessionId === sessionId && Array.isArray(state.studentExam.questions)) {
      return true;
    }

    const data = await api(`/students/test-sessions/${sessionId}/questions`);
    if (data.session?.previewEnabled && !data.session?.previewCompletedAt) {
      await ensureStudentPreviewLoaded(sessionId);
      return false;
    }

    await api(`/students/test-sessions/${sessionId}/start`, { method: "POST", body: {} });
    const latestData = data.session?.startedAt ? data : await api(`/students/test-sessions/${sessionId}/questions`);

    let answers = {};
    const saved = localStorage.getItem(examDraftKey(sessionId));
    if (saved) {
      try {
        answers = JSON.parse(saved);
      } catch {
        answers = {};
      }
    }

    const firstUnanswered = latestData.questions.findIndex((q) => !answers[q.id]);
    state.studentExam = {
      sessionId,
      session: latestData.session,
      questions: latestData.questions,
      index: firstUnanswered >= 0 ? firstUnanswered : 0,
      answers,
      autoSubmitting: false,
    };
    return true;
  }

  async function openStudentReviewSet(reviewSetId) {
    try {
      const data = await api(`/students/review-sets/${reviewSetId}`);
      state.studentReview = buildStudentReviewState(data.reviewSet);
      navigateToStudentReview();
    } catch (err) {
      toast(err.message);
    }
  }

  async function openStudentMemorizeSession(sessionId) {
    try {
      await ensureStudentPreviewLoaded(sessionId);
      navigateToStudentPreview(sessionId);
    } catch (err) {
      toast(err.message);
    }
  }

  async function openStudentSession(sessionId) {
    try {
      const items = state.studentDashboard?.items || [];
      const currentAssignment = items.find((item) => item.test_session_id === sessionId);
      if (currentAssignment?.preview_enabled && !currentAssignment?.preview_completed_at) {
        await ensureStudentPreviewLoaded(sessionId);
        navigateToStudentPreview(sessionId);
        return;
      }

      const readyForExam = await ensureStudentExamLoaded(sessionId);
      if (!readyForExam) {
        navigateToStudentPreview(sessionId);
        return;
      }
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

  function syncStudentPreviewTimer() {
    const preview = state.studentPreview;
    if (!preview) return;
    const countdownEl = document.getElementById("previewCountdown");
    const startBtn = document.getElementById("startPreviewExamBtn");
    const remainingSeconds = getStudentPreviewRemainingSeconds(preview);

    if (countdownEl) {
      countdownEl.textContent = remainingSeconds > 0 ? formatDuration(remainingSeconds) : "준비 완료";
      countdownEl.classList.toggle("danger-text", remainingSeconds > 0 && remainingSeconds <= 10);
    }

    if (startBtn) {
      startBtn.disabled = false;
      startBtn.textContent = remainingSeconds > 0 ? `바로 테스트 (${formatDuration(remainingSeconds)})` : "테스트 시작";
    }
  }

  function mountStudentPreviewTimer() {
    clearStudentPreviewTimer();
    syncStudentPreviewTimer();
    if (getStudentPreviewRemainingSeconds() <= 0) return;
    state.studentPreviewTimerId = window.setInterval(syncStudentPreviewTimer, 1000);
  }

  async function completeStudentPreview() {
    if (!state.studentPreview) return;

    try {
      const result = await api(`/students/test-sessions/${state.studentPreview.sessionId}/preview/complete`, {
        method: "POST",
        body: {},
      });
      const sessionId = state.studentPreview.sessionId;
      clearStudentPreviewTimer();
      state.studentPreview.previewCompletedAt = result.previewCompletedAt;
      state.studentPreview = null;
      const readyForExam = await ensureStudentExamLoaded(sessionId);
      if (readyForExam) {
        navigateToStudentExam(sessionId);
      }
    } catch (err) {
      toast(err.message);
    }
  }

  function renderStudentPreviewScreen() {
    clearStudentExamTimer();
    if (!state.studentPreview) {
      navigateToStudentDashboard({ replace: true });
      return;
    }

    const cards = state.studentPreview.cards || [];
    const safeIndex = Math.max(0, Math.min(state.studentPreview.index || 0, Math.max(cards.length - 1, 0)));
    state.studentPreview.index = safeIndex;
    const current = cards[safeIndex];
    const remainingSeconds = getStudentPreviewRemainingSeconds(state.studentPreview);

    studentView.innerHTML = `
      <section class="exam-screen reveal">
        <article class="exam-stage preview-stage">
          <div class="exam-stage-head row row-between">
            <div>
              <p class="exam-eyebrow">빠른 암기</p>
              <h2>카드 넘기며 외우기</h2>
              <p class="meta">한 화면에 한 단어만 보고, 뜻을 확인한 뒤 바로 테스트로 넘어갑니다.</p>
            </div>
            <div class="row">
              <span class="badge">${escapeHtml(state.studentPreview.sourceName || "단어장")}</span>
              <button id="previewDashboardBtn" class="btn btn-quiet" type="button">대시보드로</button>
            </div>
          </div>

          <div class="exam-summary">
            <div>
              <p class="meta">현재 카드</p>
              <p><strong>${cards.length ? `${safeIndex + 1} / ${cards.length}` : "-"}</strong></p>
            </div>
            <div>
              <p class="meta">미리보기 범위</p>
              <p><strong>${escapeHtml(previewScopeLabel(state.studentPreview.previewScope || "ALL"))}</strong></p>
            </div>
            <div>
              <p class="meta">권장 시간</p>
              <p><strong>${escapeHtml(Math.max(0, Number(state.studentPreview.previewDurationSec || 0)))}초</strong></p>
            </div>
            <div>
              <p class="meta">시작 가능</p>
              <p><strong id="previewCountdown">${remainingSeconds > 0 ? formatDuration(remainingSeconds) : "준비 완료"}</strong></p>
            </div>
          </div>

          ${
            current
              ? `
                <div class="preview-card">
                  <p class="preview-word">${escapeHtml(current.word)}</p>
                  <p class="preview-meaning">${escapeHtml(current.meaning || "-")}</p>
                  ${current.exampleSentence ? `<p class="preview-example">${escapeHtml(current.exampleSentence)}</p>` : ""}
                  ${current.hint ? `<p class="question-hint">힌트: ${escapeHtml(current.hint)}</p>` : ""}
                </div>
              `
              : `<div class="note-lines">미리보기 카드가 없습니다. 바로 시험으로 넘어갈 수 있습니다.</div>`
          }

          <div class="row row-between exam-actions exam-actions-primary">
            <div class="row">
              <button id="previewPrevBtn" class="btn btn-quiet" type="button" ${safeIndex === 0 ? "disabled" : ""}>이전</button>
              <button id="previewNextBtn" class="btn btn-quiet" type="button" ${safeIndex >= cards.length - 1 ? "disabled" : ""}>다음</button>
            </div>
            <button id="startPreviewExamBtn" class="btn btn-warm" type="button">테스트 시작</button>
          </div>
        </article>
      </section>
    `;

    mountStudentPreviewTimer();

    document.getElementById("previewDashboardBtn").addEventListener("click", () => navigateToStudentDashboard());
    document.getElementById("previewPrevBtn").addEventListener("click", () => {
      state.studentPreview.index -= 1;
      renderStudentPreviewScreen();
    });
    document.getElementById("previewNextBtn").addEventListener("click", () => {
      state.studentPreview.index += 1;
      renderStudentPreviewScreen();
    });
    document.getElementById("startPreviewExamBtn").addEventListener("click", completeStudentPreview);
  }

  function renderStudentExamScreen() {
    if (!state.studentExam) return;
    clearStudentPreviewTimer();

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
              <p class="exam-eyebrow">테스트</p>
              <h2>한 문제씩 풀기</h2>
              <p class="meta">스크롤 없이 답을 입력하고 다음 문제로 넘어갑니다.</p>
            </div>
            <div class="row">
              <span class="badge">답변 ${answeredCount}/${questions.length}</span>
              <button id="exitExamBtn" class="btn btn-quiet" type="button">대시보드로</button>
            </div>
          </div>

          <div class="exam-summary exam-summary-compact">
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

          <div class="row row-between exam-actions exam-actions-primary">
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
    focusStudentExamInput(answerInput);
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
    clearStudentPreviewTimer();
    clearStudentExamTimer();
    if (!state.studentResult) {
      navigateToStudentDashboard({ replace: true });
      return;
    }

    const result = state.studentResult;
    const wrongItems = result.wrongItems || [];
    const wrongPreviewList = wrongItems
      .slice(0, 3)
      .map(
        (item, idx) => `
          <li>
            <strong>${idx + 1}. ${escapeHtml(item.expectedAnswer)}</strong>
            <span>내 답: ${escapeHtml(item.response || "미응답")} / 뜻: ${escapeHtml(item.meaningPrimary || "-")}</span>
          </li>
        `
      )
      .join("");

    studentView.innerHTML = `
      <section class="exam-screen reveal">
        <article class="exam-stage">
          <div class="exam-stage-head row row-between">
            <div>
              <p class="exam-eyebrow">결과</p>
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

          ${
            result.earnedXp || (result.newBadges || []).length
              ? `
                <div class="student-game-inline">
                  ${result.earnedXp ? `<span class="badge done">XP +${escapeHtml(result.earnedXp)}</span>` : ""}
                  ${studentBadgePillMarkup(result.newBadges || [])}
                </div>
              `
              : ""
          }

          <div class="result-message ${result.wrongCount > 0 ? "warn" : "success"}">
            ${
              result.wrongCount > 0
                ? `오답 ${result.wrongCount}개를 바탕으로 복습을 이어갈 수 있습니다.`
                : "전 문항 정답입니다. 그대로 대시보드로 돌아가면 됩니다."
            }
          </div>

          ${
            wrongPreviewList
              ? `<ul class="result-mini-list result-screen-list">${wrongPreviewList}</ul>`
              : `<div class="note-lines">이번 시험의 오답이 없습니다.</div>`
          }
          ${
            wrongItems.length > 3
              ? `<p class="meta">나머지 ${escapeHtml(wrongItems.length - 3)}개는 오답 복습 화면에서 한 묶음씩 확인합니다.</p>`
              : ""
          }

          <div class="row row-between exam-actions">
            <div class="row">
              ${
                result.wrongCount > 0
                  ? `<button id="openReviewModeBtn" class="btn" type="button">오답 복습 시작</button>`
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
        if (result.reviewSet?.id) {
          openStudentReviewSet(result.reviewSet.id);
          return;
        }

        state.studentReview = buildStudentReviewState({
          items: result.wrongItems || [],
        });
        navigateToStudentReview();
      });
    }
  }

  function renderStudentReviewScreen() {
    clearStudentPreviewTimer();
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
              <p class="exam-eyebrow">오답 노트</p>
              <h2>오답노트</h2>
              <p class="meta">한 번에 3문제씩 묶어서 다시 봅니다.</p>
            </div>
            <div class="row">
              <span class="badge">묶음 ${safeBatchIndex + 1}/${batches.length}</span>
              <button id="reviewResultBtn" class="btn btn-quiet" type="button">결과로</button>
            </div>
          </div>
          ${
            state.studentReview.rewards
              ? `
                <div class="student-game-inline">
                  ${state.studentReview.rewards.earnedXp ? `<span class="badge done">XP +${escapeHtml(state.studentReview.rewards.earnedXp)}</span>` : ""}
                  ${studentBadgePillMarkup(state.studentReview.rewards.newlyGrantedBadges || [])}
                </div>
              `
              : ""
          }
          <div class="review-card-grid">${cards}</div>
          <div class="row row-between exam-actions">
            <div class="row">
              <button id="reviewPrevBtn" class="btn btn-quiet" type="button" ${safeBatchIndex === 0 ? "disabled" : ""}>이전 묶음</button>
              <button id="reviewNextBtn" class="btn btn-quiet" type="button" ${safeBatchIndex === batches.length - 1 ? "disabled" : ""}>다음 묶음</button>
            </div>
            <div class="row">
              ${
                state.studentReview.id && state.studentReview.status !== "COMPLETED" && safeBatchIndex === batches.length - 1
                  ? `<button id="reviewCompleteBtn" class="btn btn-warm" type="button">회복 완료하기</button>`
                  : ""
              }
              <button id="reviewDashboardBtn" class="btn ${state.studentReview.id && state.studentReview.status !== "COMPLETED" && safeBatchIndex === batches.length - 1 ? "btn-quiet" : "btn-warm"}" type="button">대시보드로</button>
            </div>
          </div>
        </article>
      </section>
    `;

    document.getElementById("reviewResultBtn").addEventListener("click", () => {
      if (state.studentResult) {
        navigateToStudentResult();
        return;
      }
      navigateToStudentDashboard();
    });
    document.getElementById("reviewDashboardBtn").addEventListener("click", () => navigateToStudentDashboard({ replace: true }));
    document.getElementById("reviewPrevBtn").addEventListener("click", () => {
      state.studentReview.batchIndex -= 1;
      renderStudentReviewScreen();
    });
    document.getElementById("reviewNextBtn").addEventListener("click", () => {
      state.studentReview.batchIndex += 1;
      renderStudentReviewScreen();
    });

    const completeBtn = document.getElementById("reviewCompleteBtn");
    if (completeBtn) {
      completeBtn.addEventListener("click", async () => {
        try {
          const result = await api(`/students/review-sets/${state.studentReview.id}/complete`, {
            method: "POST",
            body: {},
          });
          state.studentReview = {
            ...buildStudentReviewState(result.reviewSet),
            batchIndex: safeBatchIndex,
            rewards: result.rewards,
            status: result.reviewSet.status,
          };
          toast(`오답 복습 완료${result.rewards?.earnedXp ? ` / XP +${result.rewards.earnedXp}` : ""}`);
          renderStudentReviewScreen();
        } catch (err) {
          toast(err.message);
        }
      });
    }
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
      clearStudentPreviewTimer();
      localStorage.removeItem(examDraftKey(sessionId));
      state.studentResult = {
        sessionId,
        score: result.score,
        outOf: result.outOf,
        correctCount: result.correctCount,
        wrongCount: result.wrongCount,
        wrongItems: result.wrongItems || [],
        reviewSet: result.reviewSet || null,
        elapsedSeconds: result.elapsedSeconds,
        supplementalCreated: result.supplementalCreated,
        supplementalAssignmentId: result.supplementalAssignmentId,
        supplementalSessionId: result.supplementalSessionId,
        supplementalDueAt: result.supplementalDueAt,
        earnedXp: result.earnedXp || 0,
        newBadges: result.newBadges || [],
        gameProfile: result.gameProfile || null,
      };
      state.studentReview = null;
      state.studentPreview = null;
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
                  actionButtons.push(`<button class="mini-btn" type="button" data-act="generate" data-assignment-id="${a.id}">생성</button>`);
                }
                if (a.status === "SCHEDULED") {
                  actionButtons.push(`<button class="mini-btn" type="button" data-act="publish" data-assignment-id="${a.id}">게시</button>`);
                }
                if (a.test_session_id) {
                  actionButtons.push(`<button class="mini-btn" type="button" data-act="edit" data-session-id="${a.test_session_id}">편집</button>`);
                  if (a.test_session_status === "COMPLETED") {
                    actionButtons.push(`<button class="mini-btn" type="button" data-act="supplement" data-session-id="${a.test_session_id}">보충</button>`);
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
                    <div class="calendar-item-actions">${actionButtons.join("")}</div>
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
    syncTeacherViewModeForViewport();
    const shouldFetchMeta = forceFetch || !state.teacherMeta;
    const cancelSkeleton = shouldFetchMeta || forceFetch || !state.teacherSettings ? scheduleViewSkeleton(teacherView, "teacher") : null;

    try {
      if (shouldFetchMeta) {
        state.teacherMeta = await api("/teacher/meta", { showLoading: false });
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
          api(assignmentsPath, { showLoading: false }),
          ownerTeacherId ? api(settingsPath, { showLoading: false }) : Promise.resolve(null),
        ]);
        state.teacherAssignments = assignmentsRes.items || [];
        state.teacherLearningOverview = assignmentsRes.learningOverview || null;
        state.teacherSettings = settingsRes;
      }
    } finally {
      if (cancelSkeleton) cancelSkeleton();
    }

    renderTeacherBoard();
  }

  function legacyDrawTeacherView() {
    const meta = state.teacherMeta;
    const activeTeacherId = getBoardTeacherId(meta);
    const activeTeacher = meta?.teachers?.find((teacher) => teacher.id === activeTeacherId) || null;
    const items = filteredAssignments();
    const stats = teacherStats(state.teacherAssignments);
    const calendar = teacherCalendarMarkup(items);
    const showCalendar = state.teacherViewMode === "BOTH" || state.teacherViewMode === "CALENDAR";
    const showList = state.teacherViewMode === "BOTH" || state.teacherViewMode === "LIST";
    const assignmentRows =
      items.length > 0
        ? items
            .map(
              (a) => `
                <tr>
                  <td><span class="mono short-id">${a.id.slice(0, 8)}</span></td>
                  <td>${a.student_name}</td>
                  <td>${a.range_start_lesson}-${a.range_end_lesson} (${a.question_count}문항)</td>
                  <td>${statusBadge(a.status)}</td>
                  <td>${fmtDate(a.due_at)}</td>
                  <td>${a.test_session_id ? `<span class="badge">${a.test_session_status}</span>` : `<span class="badge">없음</span>`}</td>
                  <td>${teacherAssignmentActionsMarkup(a)}</td>
                </tr>
              `
            )
            .join("")
        : `
            <tr>
              <td colspan="7">
                <div class="note-lines">조건에 맞는 과제가 없습니다.</div>
              </td>
            </tr>
          `;
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
    const teacherQuickNav = `
      <nav class="teacher-mobile-nav" aria-label="교사 화면 빠른 이동">
        <a class="mini-btn" href="#teacher-create-section">생성</a>
        <a class="mini-btn" href="#teacher-assignments-section">목록</a>
        <a class="mini-btn" href="#teacher-links-section">링크</a>
        <a class="mini-btn" href="#teacher-override-section">편집</a>
        <a class="mini-btn" href="#teacher-offline-section">오프라인</a>
      </nav>
    `;

    teacherView.innerHTML = `
      <section class="paper anchor-target" id="teacher-create-section">
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
        ${teacherQuickNav}

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

      <section class="paper anchor-target" id="teacher-assignments-section">
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
            <span class="mono calendar-range">${calendar.range}</span>
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

        <div class="assignment-mobile-list ${showList ? "" : "hidden"}">
          ${teacherAssignmentMobileCardsMarkup(items)}
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
            <tbody>${assignmentRows}</tbody>
          </table>
        </div>
      </section>

      <section class="split">
        <article class="paper anchor-target" id="teacher-links-section">
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

        <article class="paper anchor-target" id="teacher-override-section">
          <div class="paper-head">
            <h2>문항 수동 오버라이드</h2>
            <p>세션 선택 후 문항을 즉시 수정할 수 있습니다.</p>
          </div>
          <div id="teacherOverrideArea" class="note-lines">문항편집 버튼을 눌러 시작하세요.</div>
        </article>
      </section>

      <section class="paper anchor-target" id="teacher-offline-section">
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

  function buildTeacherStats(items) {
    return {
      total: items.length,
      needsAttention: items.filter(teacherNeedsAttention).length,
      ungenerated: items.filter((item) => !item.test_session_id).length,
      dueToday: items.filter((item) => isTodayLocal(item.due_at) && item.test_session_status !== "COMPLETED").length,
      inProgress: items.filter((item) => item.status === "IN_PROGRESS" || item.test_session_status === "IN_PROGRESS").length,
      completed: items.filter((item) => item.status === "COMPLETED" || item.test_session_status === "COMPLETED").length,
      missed: items.filter((item) => item.status === "MISSED").length,
      readyToPublish: items.filter(teacherPublishReady).length,
    };
  }

  function teacherFilterLabel(filter) {
    const labels = {
      ALL: "전체",
      NEEDS_ACTION: "먼저 처리할 과제",
      UNGENERATED: "시험지 미생성",
      DUE_TODAY: "오늘 마감",
      SCHEDULED: "배정 예정",
      PUBLISHED: "배부됨",
      IN_PROGRESS: "응시 중",
      COMPLETED: "완료",
      MISSED: "놓침",
    };
    return labels[filter] || filter;
  }

  function matchesTeacherFilter(assignment, filter) {
    if (filter === "ALL") return true;
    if (filter === "NEEDS_ACTION") return teacherNeedsAttention(assignment);
    if (filter === "UNGENERATED") return !assignment.test_session_id;
    if (filter === "DUE_TODAY") return isTodayLocal(assignment.due_at) && assignment.test_session_status !== "COMPLETED";
    return assignment.status === filter;
  }

  function getFilteredTeacherAssignments() {
    const keyword = state.teacherFilters.keyword.trim().toLowerCase();
    return [...state.teacherAssignments]
      .filter((assignment) => {
        const okStatus = matchesTeacherFilter(assignment, state.teacherFilters.status);
        const okKeyword = keyword
          ? [assignment.student_name, assignment.source_name, assignment.id].join(" ").toLowerCase().includes(keyword)
          : true;
        return okStatus && okKeyword;
      })
      .sort((left, right) => {
        const priorityDiff = teacherPriorityScore(left) - teacherPriorityScore(right);
        if (priorityDiff !== 0) return priorityDiff;
        return new Date(left.due_at) - new Date(right.due_at);
      });
  }

  function getTeacherPriorityAssignments(items) {
    return [...items]
      .filter((assignment) => {
        if (teacherNeedsAttention(assignment)) return true;
        return assignment.status === "PUBLISHED" || assignment.status === "IN_PROGRESS" || assignment.test_session_status === "COMPLETED";
      })
      .sort((left, right) => {
        const priorityDiff = teacherPriorityScore(left) - teacherPriorityScore(right);
        if (priorityDiff !== 0) return priorityDiff;
        return new Date(left.due_at) - new Date(right.due_at);
      })
      .slice(0, 6);
  }

  function teacherOverviewCardsMarkup(stats) {
    return `
      <button class="teacher-overview-card warm" type="button" data-filter-preset="NEEDS_ACTION">
        <span class="teacher-overview-label">즉시 조치</span>
        <strong>${stats.needsAttention}</strong>
        <small>생성, 배부, 놓친 과제를 먼저 봅니다.</small>
      </button>
      <button class="teacher-overview-card" type="button" data-filter-preset="UNGENERATED">
        <span class="teacher-overview-label">시험지 미생성</span>
        <strong>${stats.ungenerated}</strong>
        <small>문제를 아직 만들지 않은 과제입니다.</small>
      </button>
      <button class="teacher-overview-card" type="button" data-filter-preset="DUE_TODAY">
        <span class="teacher-overview-label">오늘 마감</span>
        <strong>${stats.dueToday}</strong>
        <small>오늘 안에 확인이 끝나야 하는 과제입니다.</small>
      </button>
      <button class="teacher-overview-card" type="button" data-filter-preset="IN_PROGRESS">
        <span class="teacher-overview-label">응시 중</span>
        <strong>${stats.inProgress}</strong>
        <small>현재 학생이 풀고 있는 시험입니다.</small>
      </button>
      <button class="teacher-overview-card danger" type="button" data-filter-preset="MISSED">
        <span class="teacher-overview-label">놓친 과제</span>
        <strong>${stats.missed}</strong>
        <small>보충 또는 오프라인 반영이 필요한 과제입니다.</small>
      </button>
    `;
  }

  function teacherLearningOverviewMarkup(overview) {
    if (!overview) return "";
    const riskRows = Array.isArray(overview.riskStudents) && overview.riskStudents.length
      ? overview.riskStudents
          .map(
            (student) => `
              <li>
                <strong>${escapeHtml(student.name)}</strong>
                <span>숙련도 ${escapeHtml(student.avgMastery || 0)}% · 복습 ${escapeHtml(student.dueCount || 0)} · 약점 ${escapeHtml(student.weakCount || 0)}</span>
              </li>
            `
          )
          .join("")
      : `<li><strong>안정</strong><span>지금 바로 개입할 학생은 없습니다.</span></li>`;
    const weakWords = Array.isArray(overview.weakWords) && overview.weakWords.length
      ? overview.weakWords
          .map(
            (word) => `
              <li class="teacher-weak-word">
                <span><strong>${escapeHtml(word.lemma)}</strong><small>${escapeHtml(word.studentName || "")} · ${escapeHtml(word.meaning || "")}</small></span>
                <em>${escapeHtml(word.masteryScore || 0)}%</em>
              </li>
            `
          )
          .join("")
      : `<li class="teacher-weak-word"><span><strong>분석 대기</strong><small>제출이 쌓이면 약점 단어가 표시됩니다.</small></span></li>`;

    return `
      <div class="teacher-learning-board">
        <div class="teacher-learning-copy">
          <p class="teacher-overview-label">Adaptive Vocabulary</p>
          <h3>출제 알고리즘 상태</h3>
          <p>${escapeHtml(overview.message || "학생별 단어 숙련도를 추적합니다.")}</p>
        </div>
        <div class="teacher-learning-metrics">
          <article><span>추적 학생</span><strong>${escapeHtml(overview.trackedStudentCount || 0)}</strong></article>
          <article><span>평균 숙련도</span><strong>${escapeHtml(overview.avgMastery || 0)}%</strong></article>
          <article><span>복습 대기</span><strong>${escapeHtml(overview.dueCount || 0)}</strong></article>
          <article><span>약점 단어</span><strong>${escapeHtml(overview.weakCount || 0)}</strong></article>
        </div>
        <div class="teacher-learning-lists">
          <section>
            <h4>개입 우선 학생</h4>
            <ul>${riskRows}</ul>
          </section>
          <section>
            <h4>반복 출제 후보</h4>
            <ul>${weakWords}</ul>
          </section>
        </div>
      </div>
    `;
  }

  function teacherPriorityCardsMarkup(items) {
    if (items.length === 0) {
      return '<div class="note-lines">지금 바로 조치할 과제가 없습니다. 오늘 운영은 안정적인 상태입니다.</div>';
    }

    return items
      .map((assignment) => {
        const primary = teacherPrimaryAction(assignment);
        const primaryButton = teacherActionButtonMarkup(primary.type, assignment, primary.label, primary.style);
        return `
          <article class="card teacher-priority-card ${teacherNeedsAttention(assignment) ? "priority" : ""}">
            <div class="row row-between">
              <div>
                <p class="teacher-priority-kicker">${escapeHtml(teacherDueCopy(assignment))}</p>
                <h3 class="teacher-priority-title">${escapeHtml(assignment.student_name)}</h3>
              </div>
              <span class="assignment-due-flag ${teacherNeedsAttention(assignment) ? "attention" : ""}">${escapeHtml(statusLabel(assignment.status))}</span>
            </div>
            <p class="teacher-priority-source">${escapeHtml(assignment.source_name)}</p>
            <p class="meta">범위 ${escapeHtml(`${assignment.range_start_lesson}-${assignment.range_end_lesson}`)} / ${escapeHtml(`${assignment.question_count}문항`)}</p>
            <p class="meta">마감 ${escapeHtml(fmtDate(assignment.due_at))}</p>
            <p class="teacher-priority-copy">${escapeHtml(primary.note)}</p>
            <div class="teacher-priority-footer">
              ${primaryButton || `<div class="assignment-inline-note compact"><strong>${escapeHtml(primary.label)}</strong><span>${escapeHtml(primary.note)}</span></div>`}
              <a class="mini-btn" href="#teacher-assignments-section">목록에서 보기</a>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function teacherCalendarBoardMarkup(items) {
    const weekDates = getTeacherWeekDates();
    const byDay = new Map(weekDates.map((day) => [dateKeyLocal(day), []]));

    for (const item of items) {
      const key = dateKeyLocal(item.due_at);
      if (byDay.has(key)) byDay.get(key).push(item);
    }

    for (const dayItems of byDay.values()) {
      dayItems.sort((left, right) => new Date(left.due_at) - new Date(right.due_at));
    }

    const columns = weekDates
      .map((day) => {
        const key = dateKeyLocal(day);
        const dayItems = byDay.get(key) || [];
        const cards = dayItems.length
          ? dayItems
              .map((assignment) => {
                const primary = teacherPrimaryAction(assignment);
                const primaryButton = teacherActionButtonMarkup(primary.type, assignment, primary.label, "mini-btn");
                return `
                  <article class="calendar-item ${teacherNeedsAttention(assignment) ? "priority" : ""}">
                    <div class="row row-between">
                      <strong>${escapeHtml(assignment.student_name)}</strong>
                      ${statusBadge(assignment.status)}
                    </div>
                    <p class="meta">${escapeHtml(assignment.source_name)}</p>
                    <p class="meta">마감 ${new Date(assignment.due_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })}</p>
                    <p class="meta">${escapeHtml(teacherAssignmentSituation(assignment))}</p>
                    <div class="calendar-item-actions">
                      ${primaryButton || `<span class="mini-btn static">${escapeHtml(primary.label)}</span>`}
                    </div>
                  </article>
                `;
              })
              .join("")
          : '<p class="calendar-empty">일정 없음</p>';

        return `
          <section class="calendar-col">
            <header class="calendar-col-head">${fmtDay(day)}</header>
            <div class="calendar-col-body">${cards}</div>
          </section>
        `;
      })
      .join("");

    return {
      range: weekRangeText(weekDates),
      html: `<div class="calendar-grid">${columns}</div>`,
    };
  }

  function openTeacherToolPanel(panelId) {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    panel.open = true;
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderTeacherBoard() {
    const meta = state.teacherMeta;
    const activeTeacherId = getBoardTeacherId(meta);
    const activeTeacher = meta?.teachers?.find((teacher) => teacher.id === activeTeacherId) || null;
    const allItems = [...state.teacherAssignments];
    const learningOverview = state.teacherLearningOverview;
    const items = getFilteredTeacherAssignments();
    const stats = buildTeacherStats(allItems);
    const priorityItems = getTeacherPriorityAssignments(allItems);
    const calendar = teacherCalendarBoardMarkup(items);
    const showCalendar = state.teacherViewMode === "BOTH" || state.teacherViewMode === "CALENDAR";
    const showList = state.teacherViewMode === "BOTH" || state.teacherViewMode === "LIST";
    const settingsDefinitions = state.teacherSettings?.definitions || {};
    const settingsValues = state.teacherSettings?.values || {};
    const defaultDueHours = getDefaultDueHours();
    const defaultPublishAt = toInputDateTime(new Date().toISOString());
    const defaultDueAt = buildDueAtInputValue(defaultPublishAt, defaultDueHours);
    const defaultPreviewEnabled = getDefaultPreviewEnabled();
    const defaultPreviewDurationSec = getDefaultPreviewDurationSec();
    const defaultPreviewScope = getDefaultPreviewScope();
    const defaultGamificationEnabled = getDefaultGamificationEnabled();
    const defaultSupplementQuestions = Number(getTeacherSettingsValue("supplement_max_questions", 10));
    const defaultSupplementDueHours = Number(getTeacherSettingsValue("supplement_due_hours", 24));

    const assignmentRows =
      items.length > 0
        ? items
            .map(
              (assignment) => `
                <tr>
                  <td>
                    <strong>${escapeHtml(assignment.student_name)}</strong>
                    <p class="meta">${escapeHtml(assignment.source_name)}</p>
                    <p class="meta mono short-id">${escapeHtml(assignment.id.slice(0, 8))}</p>
                  </td>
                  <td>
                    <strong>Lesson ${escapeHtml(`${assignment.range_start_lesson}-${assignment.range_end_lesson}`)}</strong>
                    <p class="meta">${escapeHtml(`${assignment.question_count}문항`)}</p>
                  </td>
                  <td>${teacherAssignmentStatusMarkup(assignment)}</td>
                  <td>
                    <strong>${escapeHtml(fmtDate(assignment.due_at))}</strong>
                    <p class="meta">${escapeHtml(teacherDueCopy(assignment))}</p>
                  </td>
                  <td>${teacherAssignmentActionsMarkup(assignment)}</td>
                </tr>
              `
            )
            .join("")
        : `
            <tr>
              <td colspan="5">
                <div class="note-lines">조건에 맞는 과제가 없습니다.</div>
              </td>
            </tr>
          `;

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

        if (definition.type === "string" && Array.isArray(definition.options)) {
          return `
            <label class="setting-card">
              <span class="setting-label">${escapeHtml(definition.label)}</span>
              <select name="${key}">
                ${definition.options
                  .map(
                    (option) =>
                      `<option value="${escapeHtml(option.value)}" ${settingsValues[key] === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`
                  )
                  .join("")}
              </select>
              <small class="setting-desc">${escapeHtml(definition.description || "")}</small>
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
      : '<div class="note-lines">학생을 선택하고 링크를 만들면 QR과 URL이 여기 표시됩니다.</div>';

    const teacherQuickNav = `
      <nav class="teacher-mobile-nav" aria-label="교사 화면 빠른 이동">
        <a class="mini-btn" href="#teacher-priority-section">우선 조치</a>
        <a class="mini-btn" href="#teacher-assignments-section">과제 보기</a>
        <a class="mini-btn" href="#teacher-create-section">새 과제</a>
        <a class="mini-btn" href="#teacher-settings-section">자동화</a>
        <a class="mini-btn" href="#teacher-tools-section">도구함</a>
      </nav>
    `;

    teacherView.innerHTML = `
      <section class="paper teacher-priority-board anchor-target" id="teacher-priority-section">
        <div class="paper-head">
          <h2>${escapeHtml(activeTeacher?.name || "현재 교사")} 선생님의 오늘 운영</h2>
          <p>학생 운영에서 먼저 처리해야 할 일만 위로 끌어올렸습니다. 지금 바로 조치할 과제부터 보세요.</p>
        </div>
        <div class="teacher-overview-grid">
          ${teacherOverviewCardsMarkup(stats)}
        </div>
        ${teacherLearningOverviewMarkup(learningOverview)}
        ${teacherQuickNav}
        <div class="teacher-priority-grid">
          ${teacherPriorityCardsMarkup(priorityItems)}
        </div>
      </section>

      <section class="paper anchor-target" id="teacher-assignments-section">
        <div class="paper-head">
          <h2>예외 중심 과제 목록</h2>
          <p>필터를 바꾸면 학생별 상황과 다음 행동을 바로 볼 수 있습니다.</p>
        </div>
        <div class="table-tools">
          <label>
            보기 기준
            <select id="teacherStatusFilter">
              <option value="ALL" ${state.teacherFilters.status === "ALL" ? "selected" : ""}>${teacherFilterLabel("ALL")}</option>
              <option value="NEEDS_ACTION" ${state.teacherFilters.status === "NEEDS_ACTION" ? "selected" : ""}>${teacherFilterLabel("NEEDS_ACTION")}</option>
              <option value="UNGENERATED" ${state.teacherFilters.status === "UNGENERATED" ? "selected" : ""}>${teacherFilterLabel("UNGENERATED")}</option>
              <option value="DUE_TODAY" ${state.teacherFilters.status === "DUE_TODAY" ? "selected" : ""}>${teacherFilterLabel("DUE_TODAY")}</option>
              <option value="SCHEDULED" ${state.teacherFilters.status === "SCHEDULED" ? "selected" : ""}>${teacherFilterLabel("SCHEDULED")}</option>
              <option value="PUBLISHED" ${state.teacherFilters.status === "PUBLISHED" ? "selected" : ""}>${teacherFilterLabel("PUBLISHED")}</option>
              <option value="IN_PROGRESS" ${state.teacherFilters.status === "IN_PROGRESS" ? "selected" : ""}>${teacherFilterLabel("IN_PROGRESS")}</option>
              <option value="COMPLETED" ${state.teacherFilters.status === "COMPLETED" ? "selected" : ""}>${teacherFilterLabel("COMPLETED")}</option>
              <option value="MISSED" ${state.teacherFilters.status === "MISSED" ? "selected" : ""}>${teacherFilterLabel("MISSED")}</option>
            </select>
          </label>
          <label>
            검색
            <input id="teacherKeywordFilter" type="text" value="${escapeHtml(state.teacherFilters.keyword)}" placeholder="학생명, 소스명, assignment id" />
          </label>
        </div>
        <div class="calendar-toolbar">
          <div class="row">
            <button class="btn btn-quiet" type="button" id="teacherWeekPrevBtn">이전 주</button>
            <button class="btn btn-quiet" type="button" id="teacherWeekTodayBtn">이번 주</button>
            <button class="btn btn-quiet" type="button" id="teacherWeekNextBtn">다음 주</button>
            <span class="mono calendar-range">${calendar.range}</span>
          </div>
          <div class="row">
            <button class="btn btn-quiet ${state.teacherViewMode === "BOTH" ? "active-toggle" : ""}" type="button" data-view-mode="BOTH">통합</button>
            <button class="btn btn-quiet ${state.teacherViewMode === "CALENDAR" ? "active-toggle" : ""}" type="button" data-view-mode="CALENDAR">캘린더</button>
            <button class="btn btn-quiet ${state.teacherViewMode === "LIST" ? "active-toggle" : ""}" type="button" data-view-mode="LIST">목록</button>
          </div>
        </div>
        <div class="${showCalendar ? "" : "hidden"}">${calendar.html}</div>
        <div class="assignment-mobile-list ${showList ? "" : "hidden"}">${teacherAssignmentMobileCardsMarkup(items)}</div>
        <div class="table-wrap ${showList ? "" : "hidden"}">
          <table>
            <thead>
              <tr>
                <th>학생 / 과제</th>
                <th>범위</th>
                <th>현재 상황</th>
                <th>마감</th>
                <th>다음 행동</th>
              </tr>
            </thead>
            <tbody>${assignmentRows}</tbody>
          </table>
        </div>
      </section>

      <section class="split teacher-management-split">
        <article class="paper anchor-target" id="teacher-create-section">
          <div class="paper-head">
            <h2>새 과제 만들기</h2>
            <p>새 배정을 만들 때 필요한 정보만 먼저 모았습니다.</p>
          </div>
          <form id="createAssignmentForm" class="assignment-form">
            ${meta.canChooseTeacher ? `<label>담당 교사<select id="assignmentTeacherSelect" name="teacherId" required>${meta.teachers.map((teacher) => `<option value="${teacher.id}" ${teacher.id === activeTeacherId ? "selected" : ""}>${teacher.name}</option>`).join("")}</select></label>` : ""}
            <label>학생<select name="studentId" required>${meta.students.map((student) => `<option value="${student.id}">${student.name} (${student.student_code})</option>`).join("")}</select></label>
            <label>단어 소스<select name="sourceId" required>${meta.sources.map((source) => `<option value="${source.id}">${source.name} (${source.source_type}) / lesson ${source.min_lesson ?? "-"}-${source.max_lesson ?? "-"} / ${source.word_count} words</option>`).join("")}</select></label>
            <label>시작 Lesson<input type="number" name="rangeStartLesson" min="1" value="1" required /></label>
            <label>끝 Lesson<input type="number" name="rangeEndLesson" min="1" value="3" required /></label>
            <label>문제 수<input type="number" name="questionCount" min="1" value="8" required /></label>
            <label>배정 시각<input id="assignmentPublishAtInput" type="datetime-local" name="publishAt" value="${defaultPublishAt}" required /></label>
            <label>마감 시각<input id="assignmentDueAtInput" type="datetime-local" name="dueAt" value="${defaultDueAt}" /></label>
            <details class="assignment-advanced full">
              <summary>고급설정</summary>
              <div class="settings-grid assignment-advanced-grid">
                <label class="setting-card setting-toggle">
                  <span class="setting-copy">
                    <strong>시험 전 미리보기 허용</strong>
                    <small>학생이 시험 전에 짧은 카드 미리보기를 거치도록 합니다.</small>
                  </span>
                  <input type="checkbox" name="previewEnabled" ${defaultPreviewEnabled ? "checked" : ""} />
                </label>
                <label class="setting-card">
                  <span class="setting-label">미리보기 시간(초)</span>
                  <input type="number" name="previewDurationSec" min="0" value="${escapeHtml(defaultPreviewDurationSec)}" />
                  <small class="setting-desc">0초로 두면 바로 시험 시작 버튼이 열립니다.</small>
                </label>
                <label class="setting-card">
                  <span class="setting-label">미리보기 범위</span>
                  <select name="previewScope">
                    ${previewScopeOptions()
                      .map((option) => `<option value="${option.value}" ${option.value === defaultPreviewScope ? "selected" : ""}>${option.label}</option>`)
                      .join("")}
                  </select>
                  <small class="setting-desc">전체 단어, 핵심 단어, 지난 오답 우선 중에서 선택합니다.</small>
                </label>
                <label class="setting-card setting-toggle">
                  <span class="setting-copy">
                    <strong>게이밍 요소 표시</strong>
                    <small>XP, 연속 학습, 배지 보상을 이 과제 결과에 반영합니다.</small>
                  </span>
                  <input type="checkbox" name="gamificationEnabled" ${defaultGamificationEnabled ? "checked" : ""} />
                </label>
              </div>
            </details>
            <div class="row full">
              <span class="badge">기본 마감: 게시 후 ${defaultDueHours}시간</span>
              <button class="btn btn-quiet" type="button" id="applyDuePresetBtn">기본 마감 적용</button>
              <button class="btn" type="submit">과제 생성</button>
              <button class="btn btn-quiet" type="button" id="reloadTeacherBtn">동기화</button>
            </div>
          </form>
        </article>

        <article class="paper anchor-target" id="teacher-settings-section">
          <div class="paper-head">
            <h2>자동화 설정</h2>
            <p>보충 기준, 기본 마감 시간, 알림 정책을 교사 운영 언어로 바로 조정합니다.</p>
          </div>
          <form id="teacherSettingsForm" class="settings-grid">
            ${meta.canChooseTeacher ? `<label class="setting-card full"><span class="setting-label">설정 대상 교사</span><select id="teacherSettingsTeacherSelect" name="teacherId" required>${meta.teachers.map((teacher) => `<option value="${teacher.id}" ${teacher.id === activeTeacherId ? "selected" : ""}>${teacher.name}</option>`).join("")}</select><small class="setting-desc">선택한 교사 기준으로 과제 목록과 정책이 함께 바뀝니다.</small></label>` : `<div class="setting-card full setting-summary"><strong>${escapeHtml(activeTeacher?.name || "현재 교사")}</strong><small>현재 교사 기준 자동화 정책입니다.</small></div>`}
            ${settingsFields}
            <div class="row full settings-actions">
              <button class="btn btn-warm" type="submit">설정 저장</button>
              <span class="meta">이후 생성되는 과제와 자동화 흐름에 즉시 반영됩니다.</span>
            </div>
          </form>
        </article>
      </section>

      <section class="paper anchor-target" id="teacher-tools-section">
        <div class="paper-head">
          <h2>운영 도구함</h2>
          <p>링크 발급, 자료 반영, 문항 편집, 오프라인 입력, 보충 과제를 필요할 때만 펼쳐 사용합니다.</p>
        </div>
        <div class="tool-panel-stack">
          <details id="teacherToolAccessLink" class="tool-panel" ${state.teacherAccessLink ? "open" : ""}>
            <summary>빠른 접속 링크</summary>
            <div class="tool-panel-body">
              <form id="accessLinkForm" class="lined-form">
                <label>학생<select name="userId" required>${meta.students.filter((student) => student.user_id).map((student) => `<option value="${student.user_id}">${student.name} (${student.student_code})</option>`).join("")}</select></label>
                <label>링크 라벨<input type="text" name="label" value="학생 빠른 로그인" /></label>
                <label>만료 시간(분)<input type="number" name="expiresInMinutes" min="1" max="1440" value="30" required /></label>
                <button class="btn" type="submit">링크 / QR 생성</button>
              </form>
              <div id="teacherAccessLinkArea">${accessLinkResult}</div>
            </div>
          </details>

          <details id="teacherToolImport" class="tool-panel">
            <summary>자료 가져오기</summary>
            <div class="tool-panel-body tool-panel-body-split">
              <form id="xlsxImportForm" class="lined-form">
                <label>Assignment ID<input type="text" name="assignmentId" placeholder="assignment_demo_1" required /></label>
                <label>XLSX 파일<input type="file" name="file" accept=".xlsx" required /></label>
                <button class="btn btn-warm" type="submit">엑셀 반영</button>
              </form>
              <form id="csvImportForm" class="lined-form">
                ${meta.canChooseTeacher ? `<label>소유 교사<select name="teacherId" required>${meta.teachers.map((teacher) => `<option value="${teacher.id}" ${teacher.id === activeTeacherId ? "selected" : ""}>${teacher.name}</option>`).join("")}</select></label>` : ""}
                <label>소스 이름<input type="text" name="name" value="새 단어장" required /></label>
                <label>소스 타입<input type="text" name="sourceType" value="EBOOK_CSV" required /></label>
                <label>CSV 파일<input type="file" name="file" accept=".csv" required /></label>
                <button class="btn" type="submit">CSV 가져오기</button>
              </form>
            </div>
          </details>

          <details id="teacherToolOverride" class="tool-panel" ${state.teacherEditingSessionId ? "open" : ""}>
            <summary>${state.teacherEditingSessionId ? `문항 편집 (${escapeHtml(state.teacherEditingSessionId.slice(0, 8))})` : "문항 편집"}</summary>
            <div class="tool-panel-body"><div id="teacherOverrideArea" class="note-lines">과제 목록에서 문항 확인을 누르면 여기서 바로 수정할 수 있습니다.</div></div>
          </details>

          <details id="teacherToolSupplement" class="tool-panel" ${state.teacherSupplementSessionId ? "open" : ""}>
            <summary>${state.teacherSupplementSessionId ? `보충 과제 (${escapeHtml(state.teacherSupplementSessionId.slice(0, 8))})` : "보충 과제"}</summary>
            <div class="tool-panel-body">
              <div id="teacherSupplementArea" class="note-lines">완료된 시험에서 보충 과제 만들기를 누르면 여기서 문항 수와 마감을 조정할 수 있습니다.</div>
              <p class="meta tool-inline-hint">기본값: ${escapeHtml(`${defaultSupplementQuestions}문항 / ${defaultSupplementDueHours}시간`)}</p>
            </div>
          </details>

          <details id="teacherToolOffline" class="tool-panel" ${state.teacherOfflineSessionId ? "open" : ""}>
            <summary>${state.teacherOfflineSessionId ? `오프라인 입력 (${escapeHtml(state.teacherOfflineSessionId.slice(0, 8))})` : "오프라인 입력"}</summary>
            <div class="tool-panel-body"><div id="teacherOfflineEntryArea" class="note-lines">과제 목록에서 오프라인 입력을 누르면 여기서 학생 답안을 반영할 수 있습니다.</div></div>
          </details>
        </div>
      </section>
    `;

    bindTeacherEvents();
    renderTeacherOverride();
    renderTeacherSupplementEntry();
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
      state.teacherSupplementSessionId = null;
      state.teacherSupplementContext = null;
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
      renderTeacherBoard();
    });

    document.getElementById("teacherKeywordFilter").addEventListener("input", (e) => {
      state.teacherFilters.keyword = e.target.value;
      renderTeacherBoard();
    });

    document.getElementById("teacherWeekPrevBtn").addEventListener("click", () => {
      state.teacherWeekOffset -= 1;
      renderTeacherBoard();
    });

    document.getElementById("teacherWeekTodayBtn").addEventListener("click", () => {
      state.teacherWeekOffset = 0;
      renderTeacherBoard();
    });

    document.getElementById("teacherWeekNextBtn").addEventListener("click", () => {
      state.teacherWeekOffset += 1;
      renderTeacherBoard();
    });

    document.querySelectorAll("[data-view-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.teacherViewMode = btn.dataset.viewMode;
        state.teacherViewModeAuto = false;
        renderTeacherBoard();
      });
    });

    document.querySelectorAll("[data-filter-preset]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.teacherFilters.status = btn.dataset.filterPreset || "ALL";
        renderTeacherBoard();
        document.getElementById("teacher-assignments-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
        previewEnabled: f.get("previewEnabled") === "on",
        previewDurationSec: Number(f.get("previewDurationSec") || 0),
        previewScope: String(f.get("previewScope") || "ALL"),
        gamificationEnabled: f.get("gamificationEnabled") === "on",
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

          if (definition.type === "string") {
            settings[key] = String(f.get(key) || "");
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
          renderTeacherBoard();
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
          openTeacherToolPanel("teacherToolOverride");
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
          openTeacherToolPanel("teacherToolOffline");
        } catch (err) {
          toast(err.message);
        }
      });
    });

    document.querySelectorAll("button[data-act='supplement']").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.teacherSupplementSessionId = btn.dataset.sessionId;
        state.teacherSupplementContext =
          state.teacherAssignments.find((assignment) => assignment.test_session_id === btn.dataset.sessionId) || null;
        renderTeacherSupplementEntry();
        openTeacherToolPanel("teacherToolSupplement");
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
      area.innerHTML = "과제 목록에서 문항 확인을 누르면 여기서 바로 수정할 수 있습니다.";
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
          <button id="clearOverrideBtn" class="btn btn-quiet" type="button">닫기</button>
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

    document.getElementById("clearOverrideBtn").addEventListener("click", () => {
      state.teacherEditingSessionId = null;
      state.teacherQuestions = [];
      renderTeacherOverride();
      const panel = document.getElementById("teacherToolOverride");
      if (panel) panel.open = false;
    });
  }

  function renderTeacherSupplementEntry() {
    const area = document.getElementById("teacherSupplementArea");
    if (!area) return;

    if (!state.teacherSupplementSessionId) {
      area.innerHTML = "완료된 시험에서 보충 과제 만들기를 누르면 여기서 문항 수와 마감을 조정할 수 있습니다.";
      area.className = "note-lines";
      return;
    }

    const context = state.teacherSupplementContext;
    const defaultQuestionCount = Number(getTeacherSettingsValue("supplement_max_questions", 10));
    const defaultDueHours = Number(getTeacherSettingsValue("supplement_due_hours", 24));
    area.className = "";
    area.innerHTML = `
      <div class="exam-sheet">
        <div class="row row-between">
          <div>
            <p class="meta">Session</p>
            <p class="mono">${escapeHtml(state.teacherSupplementSessionId)}</p>
          </div>
          <div>
            <p class="meta">학생</p>
            <p><strong>${escapeHtml(context?.student_name || "-")}</strong></p>
          </div>
          <div>
            <p class="meta">상태</p>
            <p>${statusBadge(context?.status || "COMPLETED")}</p>
          </div>
        </div>

        <div class="settings-grid teacher-inline-form">
          <label class="setting-card">
            <span class="setting-label">보충 문제 수</span>
            <input id="teacherSupplementQuestionCount" type="number" min="1" value="${escapeHtml(defaultQuestionCount)}" />
            <small class="setting-desc">비우면 기본값으로 생성합니다.</small>
          </label>
          <label class="setting-card">
            <span class="setting-label">마감 시간(시간)</span>
            <input id="teacherSupplementDueHours" type="number" min="1" value="${escapeHtml(defaultDueHours)}" />
            <small class="setting-desc">생성 후 몇 시간 뒤에 마감할지 정합니다.</small>
          </label>
        </div>

        <div class="row">
          <button id="submitSupplementBtn" class="btn btn-warm" type="button">보충 과제 생성</button>
          <button id="clearSupplementBtn" class="btn btn-quiet" type="button">닫기</button>
        </div>
      </div>
    `;

    document.getElementById("submitSupplementBtn").addEventListener("click", async () => {
      try {
        const payload = {};
        const questionCount = Number(document.getElementById("teacherSupplementQuestionCount").value);
        const dueHours = Number(document.getElementById("teacherSupplementDueHours").value);
        if (questionCount > 0) payload.questionCount = questionCount;
        if (dueHours > 0) payload.dueHours = dueHours;

        const result = await api(`/teacher/test-sessions/${state.teacherSupplementSessionId}/supplement`, {
          method: "POST",
          body: payload,
        });

        toast(`보충 과제 생성 완료 (${result.questionCount}문항)`);
        state.teacherSupplementSessionId = null;
        state.teacherSupplementContext = null;
        await renderTeacher(true);
      } catch (err) {
        toast(err.message);
      }
    });

    document.getElementById("clearSupplementBtn").addEventListener("click", () => {
      state.teacherSupplementSessionId = null;
      state.teacherSupplementContext = null;
      renderTeacherSupplementEntry();
      const panel = document.getElementById("teacherToolSupplement");
      if (panel) panel.open = false;
    });
  }

  function renderTeacherOfflineEntry() {
    const area = document.getElementById("teacherOfflineEntryArea");
    if (!area) return;

    if (!state.teacherOfflineSessionId || state.teacherOfflineQuestions.length === 0) {
      area.innerHTML = '과제 목록에서 오프라인 입력을 누르면 여기서 학생 답안을 반영할 수 있습니다.';
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
      const panel = document.getElementById("teacherToolOffline");
      if (panel) panel.open = false;
    });
  }

  async function renderParent() {
    const cancelSkeleton = scheduleViewSkeleton(parentView, "parent");
    let data;
    try {
      data = await api("/parents/me/reports", { showLoading: false });
    } finally {
      cancelSkeleton();
    }
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
      const previewSessionId = getStudentPreviewRouteSessionId();
      if (previewSessionId) {
        try {
          await ensureStudentPreviewLoaded(previewSessionId);
          renderStudentPreviewScreen();
        } catch (err) {
          state.studentPreview = null;
          toast(err.message);
          navigateToStudentDashboard({ replace: true });
        }
        return;
      }

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
          const readyForExam = await ensureStudentExamLoaded(sessionId);
          if (!readyForExam) {
            navigateToStudentPreview(sessionId);
            return;
          }
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
      await renderTeacher(!state.teacherMeta);
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

  const handleTeacherCompactLayoutChange = () => {
    if (!["TEACHER", "ADMIN"].includes(state.role)) return;
    if (!syncTeacherViewModeForViewport()) return;
    renderTeacherBoard();
  };

  if (typeof teacherCompactLayoutMedia.addEventListener === "function") {
    teacherCompactLayoutMedia.addEventListener("change", handleTeacherCompactLayoutChange);
  } else if (typeof teacherCompactLayoutMedia.addListener === "function") {
    teacherCompactLayoutMedia.addListener(handleTeacherCompactLayoutChange);
  }

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

  scheduleDeferredFonts();
  bootstrap().catch(handleRenderError);
})();
