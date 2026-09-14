import { StatusBar } from "expo-status-bar";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Linking from "expo-linking";
import * as Speech from "expo-speech";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  ApiError,
  completePreview,
  completeReviewSet,
  exchangeAccessLink,
  fetchParentReports,
  fetchPreview,
  fetchQuestions,
  fetchReviewSet,
  fetchStudentDashboard,
  login,
  startPreview,
  startSession,
  submitSession,
} from "./src/api";
import { ActionButton, Badge, Card, Header, Metric, ResultBrief, SectionTitle, Stat, TabButton } from "./src/components";
import { DEFAULT_API_BASE_URL, normalizeApiBaseUrl } from "./src/config";
import {
  boolish,
  colors,
  errorMessage,
  fmtDate,
  formatDuration,
  getPendingAssignment,
  getTimeLimitMs,
  reviewBatches,
  sortAssignments,
  statusLabel,
} from "./src/helpers";
import { extractLoginToken, inferApiBaseUrlFromLink } from "./src/linking";
import { getPushTokenOrNull } from "./src/notifications";
import { styles } from "./src/styles";
import {
  clearAuthSession,
  clearExamDraft,
  loadApiBaseUrl,
  loadAuthSession,
  loadDeviceFingerprint,
  loadExamDraft,
  saveApiBaseUrl,
  saveAuthSession,
  saveExamDraft,
} from "./src/storage";
import type {
  AuthSession,
  DashboardResponse,
  ParentReport,
  PreviewResponse,
  ReviewSet,
  StudentAssignment,
  SubmitResult,
  TestQuestion,
  TestSessionSummary,
} from "./src/types";

type StudentScreen = "dashboard" | "preview" | "exam" | "result" | "review";
type DashboardTab = "study" | "review" | "growth" | "tasks";
type PreviewState = PreviewResponse & { index: number };
type ExamState = {
  sessionId: string;
  session: TestSessionSummary;
  questions: TestQuestion[];
  index: number;
  answers: Record<string, string>;
};

export default function App() {
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [auth, setAuth] = useState<AuthSession | null>(null);
  const [apiBaseUrl, setApiBaseUrl] = useState(DEFAULT_API_BASE_URL);
  const [deviceFingerprint, setDeviceFingerprint] = useState("");
  const [loginEmail, setLoginEmail] = useState("student@example.com");
  const [loginPassword, setLoginPassword] = useState("pass1234");
  const [loginTokenInput, setLoginTokenInput] = useState("");
  const [showScanner, setShowScanner] = useState(false);
  const [scannerLocked, setScannerLocked] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [studentScreen, setStudentScreen] = useState<StudentScreen>("dashboard");
  const [dashboardTab, setDashboardTab] = useState<DashboardTab>("study");
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [exam, setExam] = useState<ExamState | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [reviewSet, setReviewSet] = useState<ReviewSet | null>(null);
  const [reviewBatchIndex, setReviewBatchIndex] = useState(0);
  const [reviewAnswers, setReviewAnswers] = useState<Record<string, string>>({});
  const [reviewChecks, setReviewChecks] = useState<{ itemId: string; correct: boolean }[]>([]);
  const [revealedReviewAnswers, setRevealedReviewAnswers] = useState<Record<string, boolean>>({});
  const [parentReports, setParentReports] = useState<ParentReport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const examRef = useRef<ExamState | null>(null);
  const autoSubmitRef = useRef(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  useEffect(() => () => { void Speech.stop(); }, [studentScreen, preview?.index]);

  async function speakWord(word: string) {
    try {
      await Speech.stop();
      Speech.speak(word, { language: "en-US", rate: 0.85,
        onError: () => Alert.alert("발음 듣기", "재생하지 못했습니다. 기기의 음성 설정을 확인해 주세요.") });
    } catch {
      Alert.alert("발음 듣기", "재생하지 못했습니다. 다시 시도해 주세요.");
    }
  }

  const token = auth?.accessToken || null;
  const sortedAssignments = useMemo(() => sortAssignments(dashboard?.items || []), [dashboard]);
  const pendingAssignment = useMemo(() => getPendingAssignment(dashboard?.items || []), [dashboard]);

  useEffect(() => {
    examRef.current = exam;
  }, [exam]);

  useEffect(() => {
    let mounted = true;

    async function boot() {
      try {
        const [storedUrl, storedAuth, fingerprint] = await Promise.all([loadApiBaseUrl(), loadAuthSession(), loadDeviceFingerprint()]);
        if (!mounted) return;
        setApiBaseUrl(storedUrl);
        setDeviceFingerprint(fingerprint);
        setAuth(storedAuth);
        if (storedAuth?.role === "STUDENT") await loadDashboard(storedAuth, storedUrl);
        if (storedAuth?.role === "PARENT") await loadReports(storedAuth, storedUrl);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        if (mounted) setBooting(false);
      }
    }

    boot();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (studentScreen !== "exam" || !exam?.session.startedAt) {
      setRemainingSeconds(null);
      autoSubmitRef.current = false;
      return;
    }

    function syncTimer() {
      const currentExam = examRef.current;
      if (!currentExam?.session.startedAt) return;
      const startedAt = new Date(currentExam.session.startedAt).getTime();
      if (Number.isNaN(startedAt)) return;
      const deadline = startedAt + getTimeLimitMs(currentExam.questions.length);
      const nextSeconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemainingSeconds(nextSeconds);
      if (nextSeconds === 0 && !autoSubmitRef.current) {
        autoSubmitRef.current = true;
        submitExam({ skipConfirm: true, autoSubmitted: true });
      }
    }

    syncTimer();
    const timer = setInterval(syncTimer, 1000);
    return () => clearInterval(timer);
  }, [studentScreen, exam?.session.startedAt, exam?.questions.length]);

  useEffect(() => {
    if (!deviceFingerprint) return;

    const handleUrl = ({ url }: { url: string }) => {
      consumeLoginLink(url);
    };

    Linking.getInitialURL().then((url) => {
      if (url) consumeLoginLink(url);
    });

    const subscription = Linking.addEventListener("url", handleUrl);
    return () => subscription.remove();
  }, [apiBaseUrl, deviceFingerprint]);

  async function handleApiFailure(err: unknown) {
    const message = errorMessage(err);
    setError(message);
    if (err instanceof ApiError && err.status === 401) {
      await clearAuthSession();
      setAuth(null);
      setDashboard(null);
      setStudentScreen("dashboard");
      Alert.alert("다시 로그인", "로그인 시간이 만료되었습니다.");
      return;
    }
    Alert.alert("확인 필요", message);
  }

  async function loadDashboard(session = auth, baseUrl = apiBaseUrl) {
    if (!session?.accessToken) return;
    setDashboard(await fetchStudentDashboard(baseUrl, session.accessToken));
  }

  async function loadReports(session = auth, baseUrl = apiBaseUrl) {
    if (!session?.accessToken) return;
    const data = await fetchParentReports(baseUrl, session.accessToken);
    setParentReports(data.reports || []);
  }

  async function completeAuthenticatedSession(session: AuthSession, baseUrl: string) {
    await saveAuthSession(session);
    setAuth(session);
    setResult(null);
    setReviewSet(null);
    setPreview(null);
    setExam(null);
    setStudentScreen("dashboard");
    if (session.role === "STUDENT") await loadDashboard(session, baseUrl);
    if (session.role === "PARENT") await loadReports(session, baseUrl);
  }

  async function consumeLoginLink(value: string) {
    const loginToken = extractLoginToken(value);
    if (!loginToken) {
      Alert.alert("링크 확인", "로그인 토큰을 찾을 수 없습니다.");
      return;
    }

    const inferredApiBaseUrl = inferApiBaseUrlFromLink(value);
    const nextApiBaseUrl = normalizeApiBaseUrl(inferredApiBaseUrl || apiBaseUrl);

    setBusy(true);
    setError(null);
    try {
      const pushToken = await getPushTokenOrNull();
      await saveApiBaseUrl(nextApiBaseUrl);
      setApiBaseUrl(nextApiBaseUrl);
      const session = await exchangeAccessLink(nextApiBaseUrl, {
        loginToken,
        deviceFingerprint,
        pushToken,
      });
      setLoginTokenInput("");
      setShowScanner(false);
      setScannerLocked(false);
      await completeAuthenticatedSession(session, nextApiBaseUrl);
    } catch (err) {
      setScannerLocked(false);
      await handleApiFailure(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleLogin() {
    const normalizedUrl = normalizeApiBaseUrl(apiBaseUrl);
    if (!loginEmail.trim() || !loginPassword.trim()) {
      Alert.alert("입력 확인", "이메일과 비밀번호를 입력해 주세요.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await saveApiBaseUrl(normalizedUrl);
      setApiBaseUrl(normalizedUrl);
      const pushToken = await getPushTokenOrNull();
      const session = await login(normalizedUrl, { email: loginEmail.trim(), password: loginPassword, deviceFingerprint, pushToken });
      await completeAuthenticatedSession(session, normalizedUrl);
    } catch (err) {
      await handleApiFailure(err);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await clearAuthSession();
    setAuth(null);
    setDashboard(null);
    setPreview(null);
    setExam(null);
    setResult(null);
    setReviewSet(null);
    setParentReports([]);
    setStudentScreen("dashboard");
  }

  async function refresh() {
    if (!auth) return;
    setRefreshing(true);
    setError(null);
    try {
      if (auth.role === "STUDENT") await loadDashboard();
      if (auth.role === "PARENT") await loadReports();
    } catch (err) {
      await handleApiFailure(err);
    } finally {
      setRefreshing(false);
    }
  }

  async function openPreview(sessionId: string) {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const data = await fetchPreview(apiBaseUrl, token, sessionId);
      let previewStartedAt = data.previewStartedAt;
      if (data.previewEnabled && !previewStartedAt) {
        previewStartedAt = (await startPreview(apiBaseUrl, token, sessionId)).previewStartedAt;
      }
      setPreview({ ...data, previewStartedAt: previewStartedAt || new Date().toISOString(), index: 0 });
      setStudentScreen("preview");
    } catch (err) {
      await handleApiFailure(err);
    } finally {
      setBusy(false);
    }
  }

  async function finishPreview() {
    if (!token || !preview) return;
    setBusy(true);
    setError(null);
    try {
      const sessionId = preview.sessionId;
      await completePreview(apiBaseUrl, token, sessionId);
      setPreview(null);
      await openExam(sessionId, { forceExam: true });
    } catch (err) {
      await handleApiFailure(err);
    } finally {
      setBusy(false);
    }
  }

  async function openExam(sessionId: string, options: { forceExam?: boolean } = {}) {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const initial = await fetchQuestions(apiBaseUrl, token, sessionId);
      if (initial.session.previewEnabled && !initial.session.previewCompletedAt && !options.forceExam) {
        await openPreview(sessionId);
        return;
      }
      await startSession(apiBaseUrl, token, sessionId);
      const latest = initial.session.startedAt ? initial : await fetchQuestions(apiBaseUrl, token, sessionId);
      const draft = await loadExamDraft(sessionId);
      const firstUnanswered = latest.questions.findIndex((question) => !draft[question.id]);
      setExam({
        sessionId,
        session: latest.session,
        questions: latest.questions,
        index: firstUnanswered >= 0 ? firstUnanswered : 0,
        answers: draft,
      });
      setStudentScreen("exam");
    } catch (err) {
      await handleApiFailure(err);
    } finally {
      setBusy(false);
    }
  }

  function updateAnswer(questionId: string, value: string) {
    setExam((current) => {
      if (!current) return current;
      const next = { ...current, answers: { ...current.answers, [questionId]: value } };
      saveExamDraft(current.sessionId, next.answers).catch(() => undefined);
      return next;
    });
  }

  async function submitExam(options: { skipConfirm?: boolean; autoSubmitted?: boolean } = {}) {
    const currentExam = examRef.current;
    if (!token || !currentExam) return;
    const emptyCount = currentExam.questions.filter((question) => !currentExam.answers[question.id]?.trim()).length;
    if (!options.skipConfirm && emptyCount > 0) {
      Alert.alert("미응답 확인", `미응답 ${emptyCount}문항이 있습니다. 그대로 제출할까요?`, [
        { text: "계속 풀기", style: "cancel" },
        { text: "제출", style: "destructive", onPress: () => submitExam({ skipConfirm: true }) },
      ]);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const payload = currentExam.questions.map((question) => ({
        questionId: question.id,
        response: currentExam.answers[question.id] || "",
      }));
      const submitted = await submitSession(apiBaseUrl, token, currentExam.sessionId, payload);
      await clearExamDraft(currentExam.sessionId);
      setResult(submitted);
      setExam(null);
      setReviewSet(null);
      setStudentScreen("result");
      await loadDashboard();
      if (options.autoSubmitted) Alert.alert("자동 제출", "제한 시간이 종료되어 현재 답안으로 제출했습니다.");
    } catch (err) {
      await handleApiFailure(err);
    } finally {
      setBusy(false);
    }
  }

  async function openReview(review: ReviewSet | null) {
    setReviewAnswers({});
    setReviewChecks([]);
    setRevealedReviewAnswers({});
    if (!review?.id || !token) {
      const localItems = result?.wrongItems || [];
      if (localItems.length === 0) return;
      setReviewSet({ id: null, status: "OPEN", itemCount: localItems.length, recoveredCount: 0, items: localItems });
      setReviewBatchIndex(0);
      setStudentScreen("review");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      setReviewSet((await fetchReviewSet(apiBaseUrl, token, review.id)).reviewSet);
      setReviewBatchIndex(0);
      setStudentScreen("review");
    } catch (err) {
      await handleApiFailure(err);
    } finally {
      setBusy(false);
    }
  }

  async function finishReview() {
    if (!reviewSet) return;
    if (!reviewSet.id || !token) {
      setStudentScreen(result ? "result" : "dashboard");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const batch = reviewBatches(reviewSet.items)[reviewBatchIndex] || [];
      const answers = batch.filter((item) => item.id && !item.isRecovered)
        .map((item) => ({ itemId: item.id!, response: reviewAnswers[item.id!] || "" }));
      const completed = await completeReviewSet(apiBaseUrl, token, reviewSet.id, answers);
      setReviewSet(completed.reviewSet);
      setReviewChecks(completed.checks || []);
      setRevealedReviewAnswers({});
      await loadDashboard();
      Alert.alert(completed.reviewSet.status === "COMPLETED" ? "복습 완료" : "답안 확인",
        completed.reviewSet.status === "COMPLETED" ? "모든 단어를 맞혔습니다." : `확인 완료 ${completed.reviewSet.recoveredCount}/${completed.reviewSet.itemCount}개. 남은 단어를 다시 입력해 주세요.`);
    } catch (err) {
      await handleApiFailure(err);
    } finally {
      setBusy(false);
    }
  }

  function openAssignment(item: StudentAssignment) {
    if (!item.test_session_id) return;
    if (boolish(item.preview_enabled) && !item.preview_completed_at) openPreview(item.test_session_id);
    else openExam(item.test_session_id);
  }

  function renderLogin() {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.loginScroll} keyboardShouldPersistTaps="handled">
          <View style={styles.brandBlock}>
            <Text style={styles.appMark}>Words Check</Text>
            <Text style={styles.appSubtitle}>오늘 단어를 바로 확인하고, 틀린 단어만 다시 회복합니다.</Text>
          </View>
          <Card>
            <SectionTitle eyebrow="Mobile App" title="로그인" meta="학생/학부모 계정으로 접속하세요." />
            <Text style={styles.label}>API 서버</Text>
            <TextInput autoCapitalize="none" autoCorrect={false} value={apiBaseUrl} onChangeText={setApiBaseUrl} style={styles.input} />
            <Text style={styles.label}>이메일</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={loginEmail}
              onChangeText={setLoginEmail}
              style={styles.input}
            />
            <Text style={styles.label}>비밀번호</Text>
            <TextInput secureTextEntry value={loginPassword} onChangeText={setLoginPassword} style={styles.input} />
            <ActionButton label={busy ? "접속 중" : "입장하기"} icon="log-in" onPress={handleLogin} disabled={busy} />
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </Card>

          <Card tone="mint">
            <SectionTitle eyebrow="Quick Access" title="QR / 링크 로그인" meta="교사용 웹에서 만든 학생 접속 링크나 QR 코드를 사용할 수 있습니다." />
            <Text style={styles.label}>로그인 링크 또는 토큰</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              value={loginTokenInput}
              onChangeText={setLoginTokenInput}
              placeholder="https://...loginToken=..."
              style={styles.input}
            />
            <View style={styles.twoCol}>
              <ActionButton label="링크 로그인" icon="link" variant="warm" onPress={() => consumeLoginLink(loginTokenInput)} disabled={busy || !loginTokenInput.trim()} />
              <ActionButton
                label={showScanner ? "스캐너 닫기" : "QR 스캔"}
                icon={showScanner ? "x" : "camera"}
                variant="quiet"
                onPress={async () => {
                  if (!cameraPermission?.granted) {
                    const permission = await requestCameraPermission();
                    if (!permission.granted) return;
                  }
                  setScannerLocked(false);
                  setShowScanner((value) => !value);
                }}
              />
            </View>
            {showScanner ? (
              <View style={styles.scannerBox}>
                <CameraView
                  style={styles.scanner}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  onBarcodeScanned={({ data }) => {
                    if (scannerLocked || !data) return;
                    setScannerLocked(true);
                    consumeLoginLink(data);
                  }}
                />
              </View>
            ) : null}
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  function renderAssignmentAction(item: StudentAssignment, primary = false) {
    const isCompleted = item.test_session_status === "COMPLETED" || item.status === "COMPLETED";
    const canOpen = Boolean(item.test_session_id) && item.status !== "SCHEDULED" && !isCompleted;
    const actionLabel =
      item.test_session_status === "IN_PROGRESS"
        ? "이어서 풀기"
        : boolish(item.preview_enabled) && !item.preview_completed_at
          ? "암기부터 시작"
          : "시험 시작";

    return <ActionButton
      label={canOpen ? actionLabel : isCompleted ? "완료한 과제" : item.status === "SCHEDULED" ? "아직 예정" : "시험 준비중"}
      icon={canOpen ? "play" : "clock"}
      variant={primary ? "warm" : "quiet"}
      onPress={() => openAssignment(item)}
      disabled={!canOpen || busy}
    />;
  }

  function renderAssignmentCard(item: StudentAssignment, primary = false) {

    return (
      <Card key={item.id} tone={primary ? "mint" : "default"}>
        <View style={styles.rowBetween}>
          <View style={styles.shrink}>
            <Text style={styles.eyebrow}>{primary ? "오늘 학습" : "과제"}</Text>
            <Text style={styles.cardTitle}>{item.source_name}</Text>
          </View>
          <Badge label={statusLabel(item.status)} tone={item.status === "MISSED" ? "danger" : item.status === "COMPLETED" ? "done" : "default"} />
        </View>
        <View style={styles.assignmentStats}>
          <Stat label="범위" value={`L${item.range_start_lesson}-${item.range_end_lesson}`} />
          <Stat label="문항" value={`${item.question_count}`} />
          <Stat label="마감" value={fmtDate(item.due_at)} wide />
        </View>
        {primary && item.preview_word ? <View style={styles.reviewItem}>
          <Text style={styles.meta}>오늘 만날 단어</Text>
          <Text style={styles.word}>{item.preview_word}</Text>
          <Text style={styles.meta}>{item.preview_meaning}</Text>
          <ActionButton label="발음 듣기" icon="volume-2" variant="quiet" onPress={() => speakWord(item.preview_word!)} />
        </View> : null}
        <View style={styles.inlineBadges}>
          {boolish(item.preview_enabled) ? <Badge label={`암기 ${Math.max(0, Number(item.preview_duration_sec || 0))}초`} /> : null}
          {boolish(item.gamification_enabled) ? <Badge label="XP" tone="done" /> : null}
          {item.score != null ? <Badge label={`${item.score}/100`} tone="warm" /> : null}
        </View>
        {!primary ? renderAssignmentAction(item) : null}
      </Card>
    );
  }

  function renderStudentDashboard() {
    const game = dashboard?.gameProfile;
    const reviewTask = dashboard?.reviewTask;
    const completed = (dashboard?.items || []).filter((item) => item.test_session_status === "COMPLETED").length;
    const active = (dashboard?.items || []).filter((item) => ["SCHEDULED", "PUBLISHED", "IN_PROGRESS"].includes(item.status)).length;
    const missed = (dashboard?.items || []).filter((item) => item.status === "MISSED").length;
    const learning = dashboard?.learningSummary;

    return (
      <View style={styles.flex}>
      <ScrollView key={dashboardTab} contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.green} />}>
        <Header title="Words Check" subtitle="학생 앱" onLogout={logout} />
        {dashboardTab === "study" && result ? <ResultBrief result={result} onOpen={() => setStudentScreen("result")} onReview={() => openReview(result.reviewSet)} /> : null}
        {dashboardTab === "study" ? (
          pendingAssignment ? (
            renderAssignmentCard(pendingAssignment, true)
          ) : (
            <Card tone="mint">
              <SectionTitle title="오늘 시작할 과제가 없습니다." meta="최근 결과나 열린 오답 복습을 확인해도 좋습니다." />
            </Card>
          )
        ) : null}
        {dashboardTab === "review" ? (
          <Card>
            <SectionTitle eyebrow="Review" title="오답 복습" meta={dashboard?.recentGrowth?.message || undefined} />
            {reviewTask ? (
              <>
                <Text style={styles.cardTitle}>{reviewTask.sourceName || "오답노트"}</Text>
                <Text style={styles.meta}>남은 단어 {Math.max(0, reviewTask.itemCount - reviewTask.recoveredCount)}개</Text>
                <ActionButton label="복습 열기" icon="rotate-ccw" variant="warm" onPress={() => openReview(reviewTask)} disabled={busy} />
              </>
            ) : (
              <Text style={styles.meta}>열린 오답 복습이 없습니다.</Text>
            )}
          </Card>
        ) : null}
        {dashboardTab === "growth" ? (
          <>
            {learning ? <Card>
              <SectionTitle title="단어 학습 현황" meta={learning.message} />
              <View style={styles.statGrid}>
                <Metric label="평균 숙련도" value={`${learning.avgMastery}%`} />
                <Metric label="복습 예정" value={learning.dueNow} />
                <Metric label="약점 단어" value={learning.weakCount} />
              </View>
              {learning.weakWords.map((word) => <View key={`${word.lemma}-${word.meaning}`} style={styles.reviewItem}>
                <Text style={styles.cardTitle}>{word.lemma}</Text>
                <Text style={styles.meta}>{word.meaning} · 숙련도 {word.masteryScore}%</Text>
              </View>)}
            </Card> : null}
            <View style={styles.statGrid}>
              <Metric label="진행 필요" value={active} />
              <Metric label="완료" value={completed} />
              <Metric label="미완료" value={missed} danger={missed > 0} />
            </View>
            <Card tone="gold">
              <SectionTitle eyebrow="Growth" title={`Level ${game?.level || 1}`} meta={`XP ${game?.totalXp || 0} / 연속 ${game?.currentStreak || 0}일`} />
              <View style={styles.inlineBadges}>
                {(game?.recentBadges || []).slice(0, 4).map((badge) => (
                  <Badge key={badge.badge_code} label={badge.badge_title || badge.badge_code} tone="done" />
                ))}
              </View>
            </Card>
          </>
        ) : null}
        {dashboardTab === "tasks" ? (
          sortedAssignments.length > 0 ? (
            sortedAssignments.map((item) => renderAssignmentCard(item))
          ) : (
            <Card>
              <Text style={styles.meta}>과제가 없습니다.</Text>
            </Card>
          )
        ) : null}
      </ScrollView>
      {dashboardTab === "study" && pendingAssignment ? <View style={styles.primaryActionDock}>
        {renderAssignmentAction(pendingAssignment, true)}
      </View> : null}
      <View style={[styles.tabs, styles.bottomTabs]}>
        <TabButton label="학습" icon="book-open" active={dashboardTab === "study"} onPress={() => setDashboardTab("study")} />
        <TabButton label="복습" icon="rotate-ccw" active={dashboardTab === "review"} onPress={() => setDashboardTab("review")} />
        <TabButton label="성장" icon="trending-up" active={dashboardTab === "growth"} onPress={() => setDashboardTab("growth")} />
        <TabButton label="과제" icon="list" active={dashboardTab === "tasks"} onPress={() => setDashboardTab("tasks")} />
      </View>
      </View>
    );
  }

  function renderPreview() {
    if (!preview) return null;
    const cards = preview.cards || [];
    const safeIndex = Math.max(0, Math.min(preview.index, Math.max(0, cards.length - 1)));
    const card = cards[safeIndex];
    return (
      <ScrollView contentContainerStyle={styles.scroll}>
        <Header title="빠른 암기" subtitle={preview.sourceName} onBack={() => setStudentScreen("dashboard")} />
        <Card tone="mint">
          <View style={styles.rowBetween}>
            <Badge label={`${safeIndex + 1}/${Math.max(cards.length, 1)}`} />
            <Badge label={preview.previewScope || "ALL"} tone="done" />
          </View>
          {card ? (
            <View style={styles.memoryCard}>
              <Text style={styles.word}>{card.word}</Text>
              <ActionButton label="발음 듣기" icon="volume-2" variant="quiet" onPress={() => speakWord(card.word)} />
              <Text style={styles.meaning}>{card.meaning}</Text>
              {card.exampleSentence ? <Text style={styles.hint}>{card.exampleSentence}</Text> : null}
              {card.hint ? <Text style={styles.meta}>{card.hint}</Text> : null}
            </View>
          ) : (
            <Text style={styles.meta}>미리보기 카드가 없습니다.</Text>
          )}
          <View style={styles.twoCol}>
            <ActionButton label="이전" icon="chevron-left" variant="quiet" disabled={safeIndex === 0} onPress={() => setPreview((current) => (current ? { ...current, index: safeIndex - 1 } : current))} />
            <ActionButton label="다음" icon="chevron-right" variant="quiet" disabled={safeIndex >= cards.length - 1} onPress={() => setPreview((current) => (current ? { ...current, index: safeIndex + 1 } : current))} />
          </View>
          <ActionButton label="테스트 시작" icon="play" variant="warm" onPress={finishPreview} disabled={busy} />
        </Card>
      </ScrollView>
    );
  }

  function renderExam() {
    if (!exam || exam.questions.length === 0) return null;
    const safeIndex = Math.max(0, Math.min(exam.index, exam.questions.length - 1));
    const question = exam.questions[safeIndex];
    const answeredCount = exam.questions.filter((item) => exam.answers[item.id]?.trim()).length;
    const progress = Math.round(((safeIndex + 1) / exam.questions.length) * 100);
    return (
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Header title="단어 시험" subtitle={exam.session.sourceName} onBack={() => setStudentScreen("dashboard")} />
          <Card>
            <View style={styles.rowBetween}>
              <Badge label={`${safeIndex + 1}/${exam.questions.length}`} />
              <Badge label={remainingSeconds == null ? `${progress}%` : formatDuration(remainingSeconds)} tone={remainingSeconds != null && remainingSeconds <= 60 ? "danger" : "default"} />
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress}%` }]} />
            </View>
            <Text style={styles.questionType}>{question.type}</Text>
            <Text style={styles.question}>{question.prompt}</Text>
            {question.blank_sentence ? <Text style={styles.hint}>{question.blank_sentence}</Text> : null}
            <Text style={styles.label}>내 답안</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              value={exam.answers[question.id] || ""}
              onChangeText={(value) => updateAnswer(question.id, value)}
              style={[styles.input, styles.answerInput]}
              returnKeyType={safeIndex < exam.questions.length - 1 ? "next" : "done"}
              onSubmitEditing={() => {
                if (safeIndex < exam.questions.length - 1) setExam((current) => (current ? { ...current, index: safeIndex + 1 } : current));
                else submitExam();
              }}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.jumpRow}>
              {exam.questions.map((item, index) => (
                <Pressable
                  key={item.id}
                  onPress={() => setExam((current) => (current ? { ...current, index } : current))}
                  style={[styles.jumpButton, index === safeIndex && styles.jumpButtonActive, Boolean(exam.answers[item.id]?.trim()) && styles.jumpButtonDone]}
                >
                  <Text style={[styles.jumpText, index === safeIndex && styles.jumpTextActive]}>{index + 1}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Text style={styles.meta}>답변 {answeredCount}/{exam.questions.length}</Text>
            <View style={styles.twoCol}>
              <ActionButton label="이전" icon="chevron-left" variant="quiet" disabled={safeIndex === 0} onPress={() => setExam((current) => (current ? { ...current, index: safeIndex - 1 } : current))} />
              <ActionButton label="다음" icon="chevron-right" variant="quiet" disabled={safeIndex >= exam.questions.length - 1} onPress={() => setExam((current) => (current ? { ...current, index: safeIndex + 1 } : current))} />
            </View>
            <ActionButton label={busy ? "제출 중" : "제출하기"} icon="check" variant="warm" onPress={() => submitExam()} disabled={busy} />
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  function renderResult() {
    if (!result) return null;
    return (
      <ScrollView contentContainerStyle={styles.scroll}>
        <Header title="시험 결과" subtitle="제출 완료" onBack={() => setStudentScreen("dashboard")} />
        <Card tone={result.wrongCount > 0 ? "default" : "mint"}>
          <Text style={styles.score}>{result.score}/{result.outOf}</Text>
          <View style={styles.statGrid}>
            <Metric label="정답" value={result.correctCount} />
            <Metric label="오답" value={result.wrongCount} danger={result.wrongCount > 0} />
            <Metric label="시간" value={formatDuration(result.elapsedSeconds)} />
          </View>
          <View style={styles.inlineBadges}>
            {result.earnedXp ? <Badge label={`XP +${result.earnedXp}`} tone="done" /> : null}
            {(result.newBadges || []).map((badge) => <Badge key={badge.badge_code} label={badge.badge_title || badge.badge_code} tone="done" />)}
          </View>
          {result.wrongCount > 0 ? <ActionButton label="오답 복습" icon="rotate-ccw" variant="warm" onPress={() => openReview(result.reviewSet)} disabled={busy} /> : null}
          <ActionButton label="대시보드" icon="home" variant="quiet" onPress={() => setStudentScreen("dashboard")} />
        </Card>
        {result.wrongItems?.map((item, index) => (
          <Card key={`${item.questionId || item.expectedAnswer}-${index}`}>
            <Text style={styles.eyebrow}>오답 {index + 1}</Text>
            <Text style={styles.questionSmall}>{item.prompt}</Text>
            <Text style={styles.meta}>내 답안: {item.response || "미응답"}</Text>
            <Text style={styles.answer}>정답: {item.expectedAnswer}</Text>
            <Text style={styles.meta}>뜻: {item.meaningPrimary || "-"}</Text>
          </Card>
        ))}
      </ScrollView>
    );
  }

  function renderReview() {
    if (!reviewSet) return null;
    const batches = reviewBatches(reviewSet.items || []);
    const safeIndex = Math.max(0, Math.min(reviewBatchIndex, Math.max(0, batches.length - 1)));
    const items = batches[safeIndex] || [];
    return (
      <ScrollView contentContainerStyle={styles.scroll}>
        <Header title="오답 복습" subtitle={reviewSet.sourceName || "Recovery"} onBack={() => setStudentScreen(result ? "result" : "dashboard")} />
        <Card tone="mint">
          <View style={styles.rowBetween}>
            <Badge label={`묶음 ${safeIndex + 1}/${Math.max(batches.length, 1)}`} />
            <Badge label={statusLabel(reviewSet.status)} tone={reviewSet.status === "COMPLETED" ? "done" : "default"} />
          </View>
          {items.map((item, index) => (
            <View key={`${item.expectedAnswer}-${index}`} style={styles.reviewItem}>
              <Text style={styles.questionSmall}>{item.prompt}</Text>
              {item.isRecovered || !item.id || revealedReviewAnswers[item.id] ? <Text style={styles.answer}>{item.expectedAnswer}</Text> : null}
              {item.isRecovered ? <Text style={styles.meta}>확인 완료</Text> : item.id && reviewSet.id ? <>
                <ActionButton label={revealedReviewAnswers[item.id] ? "정답 가리기" : "정답 다시 보기"} icon="eye" variant="quiet"
                  onPress={() => setRevealedReviewAnswers((current) => ({ ...current, [item.id!]: !current[item.id!] }))} />
                <TextInput style={styles.input} accessibilityLabel="복습 답안" placeholder="답을 다시 입력해 주세요" placeholderTextColor={colors.muted}
                  autoCapitalize="none" autoCorrect={false} value={reviewAnswers[item.id] || ""}
                  onChangeText={(value) => setReviewAnswers((current) => ({ ...current, [item.id!]: value }))} />
                {reviewChecks.some((check) => check.itemId === item.id && !check.correct) ? <Text style={styles.errorText}>아직 맞지 않았어요. 다시 입력해 주세요.</Text> : null}
              </> : null}
              {item.blankSentence ? <Text style={styles.meta}>{item.blankSentence}</Text> : null}
              {item.response ? <Text style={styles.meta}>내 답안: {item.response}</Text> : null}
            </View>
          ))}
          <View style={styles.twoCol}>
            <ActionButton label="이전" icon="chevron-left" variant="quiet" disabled={safeIndex === 0} onPress={() => setReviewBatchIndex(safeIndex - 1)} />
            <ActionButton label="다음" icon="chevron-right" variant="quiet" disabled={safeIndex >= batches.length - 1} onPress={() => setReviewBatchIndex(safeIndex + 1)} />
          </View>
          <Text style={styles.meta}>확인 완료 {reviewSet.recoveredCount}/{reviewSet.itemCount}개</Text>
          {reviewSet.id && items.some((item) => !item.isRecovered) && reviewSet.status !== "COMPLETED" ? <ActionButton label="답안 확인" icon="check-circle" variant="warm" onPress={finishReview} disabled={busy} /> : null}
          <ActionButton label="대시보드" icon="home" variant="ghost" onPress={() => setStudentScreen("dashboard")} />
        </Card>
      </ScrollView>
    );
  }

  function renderParent() {
    return (
      <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.green} />}>
        <Header title="학부모 보고함" subtitle="Words Check" onLogout={logout} />
        {parentReports.length > 0 ? (
          parentReports.map((report) => (
            <Card key={report.id}>
              <View style={styles.rowBetween}>
                <Badge label={report.payload?.result || "REPORT"} tone={report.payload?.result === "MISSED" ? "danger" : "done"} />
                <Text style={styles.meta}>{fmtDate(report.created_at)}</Text>
              </View>
              <Text style={styles.cardTitle}>{report.payload?.message || "보고 내용 없음"}</Text>
              <Text style={styles.meta}>{report.status} / {report.channel}</Text>
            </Card>
          ))
        ) : (
          <Card><SectionTitle title="아직 보고가 없습니다." meta="완료 또는 미완료 보고가 생기면 여기에 표시됩니다." /></Card>
        )}
      </ScrollView>
    );
  }

  function renderUnsupportedRole() {
    return (
      <ScrollView contentContainerStyle={styles.scroll}>
        <Header title="Words Check" subtitle={auth?.role || ""} onLogout={logout} />
        <Card>
          <SectionTitle title="교사용 화면은 웹 대시보드에서 사용합니다." meta="모바일 앱은 학생/학부모 흐름부터 연결되어 있습니다." />
          <ActionButton label="로그아웃" icon="log-out" variant="warm" onPress={logout} />
        </Card>
      </ScrollView>
    );
  }

  function renderContent() {
    if (booting) {
      return (
        <View style={styles.center}>
          <ActivityIndicator color={colors.green} size="large" />
          <Text style={styles.meta}>앱을 준비하는 중</Text>
        </View>
      );
    }
    if (!auth) return renderLogin();
    if (auth.role === "PARENT") return renderParent();
    if (auth.role !== "STUDENT") return renderUnsupportedRole();
    if (studentScreen === "preview") return renderPreview();
    if (studentScreen === "exam") return renderExam();
    if (studentScreen === "result") return renderResult();
    if (studentScreen === "review") return renderReview();
    return renderStudentDashboard();
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      {renderContent()}
      {busy ? (
        <View style={styles.busyOverlay} pointerEvents="none">
          <ActivityIndicator color="#fff" />
        </View>
      ) : null}
    </SafeAreaView>
  );
}
