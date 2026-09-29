import uuid

from httpx import AsyncClient


async def test_list_is_empty_initially(client: AsyncClient) -> None:
    response = await client.get("/api/v1/items")
    assert response.status_code == 200
    assert response.json() == {"items": [], "total": 0}


async def test_create_and_get_item(client: AsyncClient) -> None:
    created = await client.post(
        "/api/v1/items",
        json={"name": "Write spec", "description": "Lock down the API contract"},
    )
    assert created.status_code == 201
    body = created.json()
    assert body["name"] == "Write spec"
    assert body["description"] == "Lock down the API contract"
    assert body["status"] == "todo"
    assert "id" in body

    fetched = await client.get(f"/api/v1/items/{body['id']}")
    assert fetched.status_code == 200
    assert fetched.json() == body


async def test_create_rejects_empty_name(client: AsyncClient) -> None:
    response = await client.post("/api/v1/items", json={"name": ""})
    assert response.status_code == 422


async def test_create_rejects_invalid_status(client: AsyncClient) -> None:
    response = await client.post("/api/v1/items", json={"name": "Task", "status": "archived"})
    assert response.status_code == 422


async def test_update_item_partial(client: AsyncClient) -> None:
    created = (await client.post("/api/v1/items", json={"name": "Draft"})).json()

    patched = await client.patch(
        f"/api/v1/items/{created['id']}",
        json={"status": "in_progress"},
    )
    assert patched.status_code == 200
    assert patched.json()["name"] == "Draft"
    assert patched.json()["status"] == "in_progress"


async def test_delete_item(client: AsyncClient) -> None:
    created = (await client.post("/api/v1/items", json={"name": "Temp"})).json()
    item_id = created["id"]

    deleted = await client.delete(f"/api/v1/items/{item_id}")
    assert deleted.status_code == 204

    missing = await client.get(f"/api/v1/items/{item_id}")
    assert missing.status_code == 404


async def test_missing_item_returns_404(client: AsyncClient) -> None:
    unknown = uuid.uuid4()
    assert (await client.get(f"/api/v1/items/{unknown}")).status_code == 404
    assert (
        await client.patch(f"/api/v1/items/{unknown}", json={"status": "done"})
    ).status_code == 404
    assert (await client.delete(f"/api/v1/items/{unknown}")).status_code == 404


async def test_pagination(client: AsyncClient) -> None:
    for i in range(5):
        await client.post("/api/v1/items", json={"name": f"Item {i}"})

    page = (await client.get("/api/v1/items", params={"limit": 2, "offset": 1})).json()
    assert page["total"] == 5
    assert len(page["items"]) == 2


async def test_pagination_rejects_bad_limit(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/items", params={"limit": 0})).status_code == 422
    assert (await client.get("/api/v1/items", params={"limit": 101})).status_code == 422
