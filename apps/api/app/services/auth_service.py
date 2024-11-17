import re
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthenticationError, ConflictError
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models import Organization, OrgMember, User, UserRole
from app.schemas.auth import LoginRequest, MeResponse, RegisterRequest, TokenResponse, UserResponse


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return f"{slug}-{uuid.uuid4().hex[:6]}"


class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def register(self, data: RegisterRequest) -> TokenResponse:
        # Check if email exists
        result = await self.db.execute(select(User).where(User.email == data.email))
        if result.scalar_one_or_none():
            raise ConflictError("Email already registered")

        # Create user
        user = User(
            email=data.email,
            password_hash=hash_password(data.password),
            name=data.name,
        )
        self.db.add(user)
        await self.db.flush()

        # Create organization
        org = Organization(name=data.org_name, slug=_slugify(data.org_name))
        self.db.add(org)
        await self.db.flush()

        # Create membership
        member = OrgMember(user_id=user.id, org_id=org.id, role=UserRole.OWNER)
        self.db.add(member)
        await self.db.flush()

        return self._create_tokens(user)

    async def login(self, data: LoginRequest) -> TokenResponse:
        result = await self.db.execute(select(User).where(User.email == data.email))
        user = result.scalar_one_or_none()
        if user is None or not verify_password(data.password, user.password_hash):
            raise AuthenticationError("Invalid email or password")
        return self._create_tokens(user)

    async def refresh(self, refresh_token: str) -> TokenResponse:
        payload = decode_token(refresh_token)
        if payload is None or payload.get("type") != "refresh":
            raise AuthenticationError("Invalid refresh token")

        user_id = payload.get("sub")
        result = await self.db.execute(select(User).where(User.id == uuid.UUID(user_id)))
        user = result.scalar_one_or_none()
        if user is None:
            raise AuthenticationError("User not found")
        return self._create_tokens(user)

    async def get_me(self, user: User) -> MeResponse:
        membership = None
        if user.memberships:
            membership = sorted(user.memberships, key=lambda item: item.joined_at)[0]
        return MeResponse(
            user=UserResponse.model_validate(user),
            org_id=membership.org_id if membership else uuid.UUID(int=0),
            org_name=membership.organization.name if membership else "No Organization",
            role=membership.role.value if membership else "viewer",
        )

    def _create_tokens(self, user: User) -> TokenResponse:
        access = create_access_token({"sub": str(user.id)})
        refresh = create_refresh_token({"sub": str(user.id)})
        return TokenResponse(access_token=access, refresh_token=refresh)
