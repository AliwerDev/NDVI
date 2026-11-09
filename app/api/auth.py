"""Account endpoints: register and sign in with a password or with Telegram, sign out, current user."""

from fastapi import APIRouter, HTTPException, Response, status

from app.api.deps import BearerToken, CurrentUser, DbSession
from app.api.telegram import require_bot_username
from app.schemas.auth import (
    AuthResult,
    LoginRequest,
    RegisterRequest,
    TelegramLoginStartResponse,
    TelegramPollRequest,
    TelegramPollResponse,
    UserRead,
)
from app.services.auth import (
    authenticate,
    create_password_user,
    create_session,
    delete_session,
    poll_telegram_login,
    start_telegram_login,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, db: DbSession) -> AuthResult:
    """Create an account with a username and password, and sign in."""
    user = create_password_user(db, body.username, body.password)
    if user is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username is taken")
    return AuthResult(token=create_session(db, user), user=UserRead.from_user(user))


@router.post("/login")
def login(body: LoginRequest, db: DbSession) -> AuthResult:
    user = authenticate(db, body.username, body.password)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")
    return AuthResult(token=create_session(db, user), user=UserRead.from_user(user))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(_user: CurrentUser, credentials: BearerToken, db: DbSession) -> Response:
    """End this session. Other browsers of the same user stay signed in."""
    if credentials is not None:
        delete_session(db, credentials.credentials)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me")
def me(user: CurrentUser) -> UserRead:
    return UserRead.from_user(user)


@router.post("/telegram/start")
async def telegram_login_start(db: DbSession) -> TelegramLoginStartResponse:
    """Start a Telegram login. Open the url, then poll with poll_token until the bot confirms."""
    bot = await require_bot_username()
    started = start_telegram_login(db)
    return TelegramLoginStartResponse(
        url=f"https://t.me/{bot}?start=login_{started.code}",
        poll_token=started.poll_token,
        expires_at=started.expires_at,
    )


@router.post("/telegram/poll")
def telegram_login_poll(body: TelegramPollRequest, db: DbSession) -> TelegramPollResponse:
    """Return "pending" until the bot confirms, then a session once. 410 when the code expired."""
    result = poll_telegram_login(db, body.poll_token)
    if result.status == "expired":
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Telegram login expired")
    if result.status == "pending":
        return TelegramPollResponse(status="pending")
    assert result.user is not None
    return TelegramPollResponse(status="confirmed", token=result.session_token, user=UserRead.from_user(result.user))
