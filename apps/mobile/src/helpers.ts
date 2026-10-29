import type { ReviewItem, StudentAssignment } from "./types";

export const colors = {
  bg: "#f7f6ef",
  ink: "#17211b",
  muted: "#617069",
  card: "#fffdf8",
  line: "#d9dfd4",
  green: "#246a4d",
  greenDark: "#164833",
  coral: "#bd6249",
  danger: "#9c3b2f",
  mint: "#e4f2e9",
  gold: "#fff6df",
  warm: "#f7e4dc",
  blue: "#496a80",
  surfaceMuted: "#f3f0e6",
};

export function boolish(value: unknown) {
  return value === true || value === 1 || value === "1";
}

export function fmtDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatDuration(totalSeconds: number | null | undefined) {
  if (totalSeconds == null || Number.isNaN(totalSeconds)) return "-";
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function statusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    SCHEDULED: "예정",
    PUBLISHED: "열림",
    IN_PROGRESS: "진행중",
    COMPLETED: "완료",
    MISSED: "미완료",
  };
  return labels[status || ""] || status || "-";
}

export function assignmentPriority(item: StudentAssignment) {
  if (item.test_session_status === "IN_PROGRESS" || item.status === "IN_PROGRESS") return 0;
  if (item.status === "PUBLISHED") return 1;
  if (item.status === "SCHEDULED") return 2;
  if (item.status === "MISSED") return 3;
  if (item.test_session_status === "COMPLETED" || item.status === "COMPLETED") return 4;
  return 5;
}

export function sortAssignments(items: StudentAssignment[]) {
  return [...items].sort((left, right) => {
    const priority = assignmentPriority(left) - assignmentPriority(right);
    if (priority !== 0) return priority;
    return new Date(left.due_at).getTime() - new Date(right.due_at).getTime();
  });
}

export function getPendingAssignment(items: StudentAssignment[]) {
  return sortAssignments(items).find((item) => ["SCHEDULED", "PUBLISHED", "IN_PROGRESS"].includes(item.status));
}

export function getTimeLimitMs(questionCount: number) {
  const byQuestion = Math.max(1, questionCount) * 60 * 1000;
  return Math.max(5 * 60 * 1000, Math.min(byQuestion, 20 * 60 * 1000));
}

export function reviewBatches(items: ReviewItem[]) {
  const batches: ReviewItem[][] = [];
  for (let index = 0; index < items.length; index += 3) {
    batches.push(items.slice(index, index + 3));
  }
  return batches;
}

export function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : "처리 중 문제가 발생했습니다.";
}
