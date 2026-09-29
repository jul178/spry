import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, api } from "@/lib/api";

function mockFetch(body: unknown, init: { status?: number } = {}) {
  const status = init.status ?? 200;
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("api", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses a valid item list", async () => {
    mockFetch({
      items: [
        {
          id: "1",
          name: "First",
          description: null,
          status: "todo",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
      ],
      total: 1,
    });
    const res = await api.listItems();
    expect(res.total).toBe(1);
    expect(res.items[0].name).toBe("First");
  });

  it("raises ApiError with server detail on non-2xx", async () => {
    mockFetch({ detail: "Item not found" }, { status: 404 });
    await expect(api.deleteItem("missing")).rejects.toEqual(
      new ApiError(404, "Item not found"),
    );
  });

  it("raises ApiError when the network is unreachable", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      throw new TypeError("failed");
    });
    await expect(api.readiness()).rejects.toEqual(
      new ApiError(0, "Could not reach the API"),
    );
  });
});
