import pytest


@pytest.mark.asyncio
async def test_register(client):
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "test@trackboard.dev",
            "password": "securepassword123",
            "name": "Test User",
            "org_name": "Test Org",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_register_duplicate_email(client):
    payload = {
        "email": "dup@trackboard.dev",
        "password": "securepassword123",
        "name": "User",
        "org_name": "Org",
    }
    await client.post("/api/v1/auth/register", json=payload)
    response = await client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_login(client):
    # Register first
    await client.post(
        "/api/v1/auth/register",
        json={
            "email": "login@trackboard.dev",
            "password": "securepassword123",
            "name": "Login User",
            "org_name": "Login Org",
        },
    )
    # Login
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "login@trackboard.dev", "password": "securepassword123"},
    )
    assert response.status_code == 200
    assert "access_token" in response.json()


@pytest.mark.asyncio
async def test_login_wrong_password(client):
    await client.post(
        "/api/v1/auth/register",
        json={
            "email": "wrong@trackboard.dev",
            "password": "securepassword123",
            "name": "User",
            "org_name": "Org",
        },
    )
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "wrong@trackboard.dev", "password": "wrongpassword"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_me(client):
    # Register
    reg = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "me@trackboard.dev",
            "password": "securepassword123",
            "name": "Me User",
            "org_name": "My Org",
        },
    )
    token = reg.json()["access_token"]

    # Get me
    response = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["user"]["email"] == "me@trackboard.dev"
    assert data["org_name"] == "My Org"
    assert data["role"] == "owner"
