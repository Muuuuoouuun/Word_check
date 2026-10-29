import type {
  AuthSession,
  CompleteReviewResponse,
  DashboardResponse,
  ParentReport,
  PreviewResponse,
  QuestionsResponse,
  ReviewSet,
  SubmitResult,
} from "./types";

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiRequest<T>(
  baseUrl: string,
  token: string | null,
  path: string,
  options: RequestOptions = {}
) {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : null;

  if (!response.ok) {
    throw new ApiError(payload?.message || `${response.status} 오류`, response.status);
  }

  return payload as T;
}

export function login(
  baseUrl: string,
  payload: { email: string; password: string; deviceFingerprint: string; pushToken?: string | null }
) {
  return apiRequest<AuthSession>(baseUrl, null, "/auth/login", {
    method: "POST",
    body: payload,
  });
}

export function exchangeAccessLink(
  baseUrl: string,
  payload: { loginToken: string; deviceFingerprint: string; pushToken?: string | null }
) {
  return apiRequest<AuthSession>(baseUrl, null, "/auth/access-links/exchange", {
    method: "POST",
    body: payload,
  });
}

export function fetchStudentDashboard(baseUrl: string, token: string) {
  return apiRequest<DashboardResponse>(baseUrl, token, "/students/me/dashboard");
}

export function fetchPreview(baseUrl: string, token: string, sessionId: string) {
  return apiRequest<PreviewResponse>(baseUrl, token, `/students/test-sessions/${sessionId}/preview`);
}

export function startPreview(baseUrl: string, token: string, sessionId: string) {
  return apiRequest<{ ok: boolean; previewStartedAt: string | null; previewCompletedAt: string | null }>(
    baseUrl,
    token,
    `/students/test-sessions/${sessionId}/preview/start`,
    { method: "POST", body: {} }
  );
}

export function completePreview(baseUrl: string, token: string, sessionId: string) {
  return apiRequest<{ ok: boolean; previewStartedAt: string | null; previewCompletedAt: string | null }>(
    baseUrl,
    token,
    `/students/test-sessions/${sessionId}/preview/complete`,
    { method: "POST", body: {} }
  );
}

export function fetchQuestions(baseUrl: string, token: string, sessionId: string) {
  return apiRequest<QuestionsResponse>(baseUrl, token, `/students/test-sessions/${sessionId}/questions`);
}

export function startSession(baseUrl: string, token: string, sessionId: string) {
  return apiRequest<{ ok: boolean }>(baseUrl, token, `/students/test-sessions/${sessionId}/start`, {
    method: "POST",
    body: {},
  });
}

export function submitSession(
  baseUrl: string,
  token: string,
  sessionId: string,
  answers: { questionId: string; response: string }[]
) {
  return apiRequest<SubmitResult>(baseUrl, token, `/students/test-sessions/${sessionId}/submit`, {
    method: "POST",
    body: { answers },
  });
}

export function fetchReviewSet(baseUrl: string, token: string, reviewSetId: string) {
  return apiRequest<{ reviewSet: ReviewSet }>(baseUrl, token, `/students/review-sets/${reviewSetId}`);
}

export function completeReviewSet(baseUrl: string, token: string, reviewSetId: string, answers: { itemId: string; response: string }[]) {
  return apiRequest<CompleteReviewResponse>(baseUrl, token, `/students/review-sets/${reviewSetId}/complete`, {
    method: "POST",
    body: { answers },
  });
}

export function fetchParentReports(baseUrl: string, token: string) {
  return apiRequest<{ reports: ParentReport[] }>(baseUrl, token, "/parents/me/reports");
}
