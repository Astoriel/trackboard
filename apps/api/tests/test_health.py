import pytest


@pytest.mark.asyncio
async def test_health_endpoints(app_client):
    live = await app_client.get("/api/v1/health/live")
    ready = await app_client.get("/api/v1/health/ready")
    version = await app_client.get("/api/v1/health/version")

    assert live.status_code == 200
    assert ready.status_code == 200
    assert version.status_code == 200
    assert live.json() == {"status": "ok"}
    assert ready.json() == {"status": "ok"}
    assert version.json()["release_marker"] == "serious-v1-preview-global-detail-2026-04-13"
