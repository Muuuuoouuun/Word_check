export type AuthRole = "STUDENT" | "TEACHER" | "ADMIN" | "PARENT";

export type AuthSession = {
  accessToken: string;
  role: AuthRole;
  studentId: string | null;
  teacherId: string | null;
  parentId: string | null;
};

export type StudentAssignment = {
  id: string;
  student_id: string;
  teacher_id: string;
  source_id: string;
  range_start_lesson: number;
  range_end_lesson: number;
  question_count: number;
  assignment_kind?: string;
  preview_enabled?: number | boolean;
  preview_duration_sec?: number;
  preview_scope?: string;
  gamification_enabled?: number | boolean;
  publish_at: string;
  due_at: string;
  status: "SCHEDULED" | "PUBLISHED" | "IN_PROGRESS" | "COMPLETED" | "MISSED" | string;
  source_name: string;
  preview_word?: string | null;
  preview_meaning?: string | null;
  test_session_id: string | null;
  test_session_status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | string | null;
  score: number | null;
  started_at?: string | null;
  completed_at?: string | null;
  preview_started_at?: string | null;
  preview_completed_at?: string | null;
};

export type BadgeGrant = {
  badge_code: string;
  badge_title: string;
  badge_description?: string;
  granted_at?: string;
};

export type GameProfile = {
  currentStreak: number;
  longestStreak: number;
  totalXp: number;
  level: number;
  lastActivityDate: string | null;
  recentBadges: BadgeGrant[];
};

export type RecentGrowth = {
  message: string;
  delta: number | null;
  trend: "up" | "down" | "steady" | "neutral" | string;
  openReviewCount: number;
};

export type ReviewItem = {
  id?: string;
  questionId?: string;
  vocabItemId?: string;
  prompt: string;
  blankSentence?: string | null;
  meaningPrimary?: string | null;
  expectedAnswer: string;
  response?: string;
  orderNo?: number;
  isRecovered?: boolean;
  recoveredAt?: string | null;
};

export type ReviewSet = {
  id: string | null;
  assignmentId?: string;
  sourceSessionId?: string;
  status: "OPEN" | "COMPLETED" | string;
  itemCount: number;
  recoveredCount: number;
  createdAt?: string;
  completedAt?: string | null;
  gamificationEnabled?: boolean;
  assignmentKind?: string;
  sourceName?: string | null;
  items: ReviewItem[];
};

export type DashboardResponse = {
  learningSummary?: {
    trackedCount: number;
    avgMastery: number;
    dueNow: number;
    weakCount: number;
    message: string;
    weakWords: { lemma: string; meaning: string; masteryScore: number; nextReviewAt: string | null }[];
  };
  items: StudentAssignment[];
  reviewTask: ReviewSet | null;
  gameProfile: GameProfile | null;
  recentGrowth: RecentGrowth | null;
};

export type TestQuestion = {
  id: string;
  order_no: number;
  type: string;
  prompt: string;
  blank_sentence?: string | null;
};

export type TestSessionSummary = {
  id: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  score: number | null;
  outOf: number | null;
  sourceName: string;
  assignmentKind?: string;
  previewEnabled: boolean;
  previewDurationSec: number;
  previewScope: string;
  previewStartedAt: string | null;
  previewCompletedAt: string | null;
  gamificationEnabled: boolean;
};

export type QuestionsResponse = {
  session: TestSessionSummary;
  questions: TestQuestion[];
};

export type PreviewCard = {
  questionId: string;
  orderNo: number;
  vocabItemId: string;
  word: string;
  meaning: string;
  exampleSentence?: string | null;
  hint?: string | null;
};

export type PreviewResponse = {
  sessionId: string;
  previewEnabled: boolean;
  previewDurationSec: number;
  previewScope: string;
  previewStartedAt: string | null;
  previewCompletedAt: string | null;
  sourceName: string;
  cards: PreviewCard[];
};

export type SubmitResult = {
  ok: boolean;
  score: number;
  outOf: number;
  correctCount: number;
  wrongCount: number;
  wrongItems: ReviewItem[];
  reviewSet: ReviewSet | null;
  elapsedSeconds: number | null;
  supplementalCreated: boolean;
  supplementalAssignmentId: string | null;
  supplementalSessionId: string | null;
  supplementalDueAt: string | null;
  gameProfile: GameProfile | null;
  earnedXp: number;
  newBadges: BadgeGrant[];
};

export type Rewards = {
  profile: GameProfile | null;
  earnedXp: number;
  newlyGrantedBadges: BadgeGrant[];
};

export type CompleteReviewResponse = {
  ok: boolean;
  reviewSet: ReviewSet;
  checks?: { itemId: string; correct: boolean }[];
  rewards: Rewards | null;
};

export type ParentReport = {
  id: string;
  status: string;
  channel: string;
  created_at: string;
  payload?: {
    result?: string;
    message?: string;
    [key: string]: unknown;
  } | null;
};
