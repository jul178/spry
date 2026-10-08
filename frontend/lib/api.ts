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

  createMeeting: (payload: MeetingInput) =>
    request("/api/v1/meetings", meetingSchema, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  deleteMeeting: (id: string) =>
    request(`/api/v1/meetings/${id}`, z.undefined(), { method: "DELETE" }),
};
