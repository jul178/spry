import { z } from "zod";

/** Browser code must reach the API through the published port; server components
 *  resolve the Compose service name instead. */
export function apiBaseUrl(): string {
  if (typeof window === "undefined") {
    return process.env.INTERNAL_API_URL ?? "http://backend:8000";
  }
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class AgendaParserError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AgendaParserError";
  }
}

function getStoredAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key && key.startsWith("oidc.user:")) {
      try {
        const item = sessionStorage.getItem(key);
        if (item) {
          const user = JSON.parse(item);
          if (user.access_token) return user.access_token;
        }
      } catch {
        // ignore parse error
      }
    }
  }
  if (sessionStorage.getItem("spry_dev_user") || localStorage.getItem("spry_dev_auth")) {
    return "dev-mock-token";
  }
  return null;
}

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const token = getStoredAccessToken();
  const authHeaders: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : {};

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError(0, "Could not reach the API");
  }

  if (!response.ok) {
    const detail = await response
      .json()
      .then((body) => (typeof body?.detail === "string" ? body.detail : null))
      .catch(() => null);
    throw new ApiError(
      response.status,
      detail ?? `Request failed (${response.status})`,
    );
  }

  if (response.status === 204) {
    return schema.parse(undefined);
  }
  return schema.parse(await response.json());
}

/* --- schemas mirroring the API contract in README section 5 --- */

export const itemStatuses = ["todo", "in_progress", "done"] as const;
export const itemStatusSchema = z.enum(itemStatuses);

export const itemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  status: itemStatusSchema,
  created_at: z.string(),
  updated_at: z.string(),
});

export const itemListSchema = z.object({
  items: z.array(itemSchema),
  total: z.number().int(),
});

export const healthSchema = z.object({
  status: z.string(),
  database: z.string(),
});

export const itemInputSchema = z.object({
  name: z.string().min(1, "Name is required").max(120, "Name is too long"),
  description: z.string().max(2000, "Description is too long").optional(),
  status: itemStatusSchema,
});

export const meetingCategories = [
  "standup",
  "sync",
  "one_on_one",
  "planning",
  "deep_work",
] as const;
export const meetingCategorySchema = z.enum(meetingCategories);

export const meetingSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.string(),
  start_time: z.string(),
  duration_minutes: z.number(),
  attendee_count: z.number(),
  hourly_rate_usd: z.number(),
  estimated_cost_usd: z.number(),
  agenda: z.record(z.string(), z.unknown()).nullable().optional(),
  ai_suggestion: z.record(z.string(), z.unknown()).nullable().optional(),
  created_at: z.string(),
});

export const meetingSummarySchema = z.object({
  total_meetings: z.number(),
  total_hours: z.number(),
  total_cost_usd: z.number(),
  deep_work_blocks: z.number(),
  overload_warning: z.boolean(),
});

export const meetingListSchema = z.object({
  items: z.array(meetingSchema),
  summary: meetingSummarySchema,
});

export const meetingInputSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  category: meetingCategorySchema,
  start_time: z.string(),
  duration_minutes: z.number().min(5).max(480),
  attendee_count: z.number().min(1).max(200),
  hourly_rate_usd: z.number().min(0).max(1000),
});

const parsedAgendaSchema = z.object({
  title: z.string().nullable(),
  starts_at: z.string().nullable(),
  duration_minutes: z.number().int().nullable(),
  items: z.array(
    z.object({
      topic: z.string(),
      owner: z.string().nullable(),
      minutes: z.number().int().nullable(),
    }),
  ),
  action_items: z.array(
    z.object({
      task: z.string(),
      owner: z.string().nullable(),
      due: z.string().nullable(),
    }),
  ),
  language: z.string(),
});

export type ParsedAgenda = z.infer<typeof parsedAgendaSchema>;

export type ItemStatus = z.infer<typeof itemStatusSchema>;
export type Item = z.infer<typeof itemSchema>;
export type ItemList = z.infer<typeof itemListSchema>;
export type Health = z.infer<typeof healthSchema>;
export type ItemInput = z.infer<typeof itemInputSchema>;
export type Meeting = z.infer<typeof meetingSchema>;
export type MeetingList = z.infer<typeof meetingListSchema>;
export type MeetingInput = z.infer<typeof meetingInputSchema>;

/* --- endpoints --- */

export const api = {
  readiness: () => request("/api/v1/health/ready", healthSchema),

  listItems: (params: { limit?: number; offset?: number } = {}) => {
    const query = new URLSearchParams();
    if (params.limit !== undefined) query.set("limit", String(params.limit));
    if (params.offset !== undefined) query.set("offset", String(params.offset));
    const suffix = query.size > 0 ? `?${query}` : "";
    return request(`/api/v1/items${suffix}`, itemListSchema);
  },

  createItem: (payload: ItemInput) =>
    request("/api/v1/items", itemSchema, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateItem: (id: string, payload: Partial<ItemInput>) =>
    request(`/api/v1/items/${id}`, itemSchema, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  deleteItem: (id: string) =>
    request(`/api/v1/items/${id}`, z.undefined(), { method: "DELETE" }),

  listMeetings: () => request("/api/v1/meetings", meetingListSchema),

  parseAgenda: async (text: string, signal: AbortSignal) => {
    const rawParserUrl = process.env.NEXT_PUBLIC_AGENDA_PARSER_URL;
    const baseApi = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const url =
      rawParserUrl && rawParserUrl.trim()
        ? rawParserUrl.trim()
        : `${baseApi.replace(/\/+$/, "")}/api/v1/meetings/parse-agenda`;

    let response: Response;
    try {
      const token = getStoredAccessToken();
      const now = new Date();
      const today = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
      ].join("-");
      response = await fetch(url, {
        method: "POST",
        signal,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          text,
          today,
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        }),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError")
        throw error;
      throw new AgendaParserError(
        0,
        "Could not reach the agenda parser. You can enter the agenda by hand.",
      );
    }

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message =
        typeof body?.error === "string" ? body.error : "Agenda parsing failed.";
      if (response.status === 413) {
        throw new AgendaParserError(
          413,
          "That text is too long. Shorten it to 10,000 characters or less.",
        );
      }
      if (response.status === 422) {
        throw new AgendaParserError(
          422,
          "I couldn't find a meeting agenda in that text. You can enter it by hand.",
        );
      }
      if (response.status === 429 || response.status >= 500) {
        throw new AgendaParserError(
          response.status,
          "The agenda service is busy. Please try again or enter it by hand.",
        );
      }
      throw new AgendaParserError(response.status, message);
    }

    try {
      return z
        .object({
          agenda: parsedAgendaSchema,
          model: z.string(),
          prompt_version: z.string(),
        })
        .parse(body);
    } catch {
      throw new AgendaParserError(
        502,
        "The parser returned an unreadable agenda. Please try again or enter it by hand.",
      );
    }
  },

  saveMeetingAgenda: (
    id: string,
    agenda: ParsedAgenda,
    aiSuggestion: Record<string, unknown> | null,
  ) =>
    request(`/api/v1/meetings/${id}/agenda`, meetingSchema, {
      method: "POST",
      body: JSON.stringify({ agenda, ai_suggestion: aiSuggestion }),
    }),

  createMeeting: (payload: MeetingInput) =>
    request("/api/v1/meetings", meetingSchema, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  deleteMeeting: (id: string) =>
    request(`/api/v1/meetings/${id}`, z.undefined(), { method: "DELETE" }),
};
