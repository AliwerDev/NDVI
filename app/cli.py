"""Server commands for admin rights.

    python -m app.cli grant-admin <user>
    python -m app.cli revoke-admin <user>
    python -m app.cli list-admins

<user> is a login (aziz_f), a Telegram username (@aziz_farm) or a user id (#12).
"""

import argparse
import sys

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import User
from app.schemas.auth import display_name_of
from app.services.auth import normalize_username


class UserNotFound(Exception):
    pass


def find_user(db: Session, ref: str) -> User:
    """Find one user by login, @telegram_username or #id. Raise UserNotFound if there is not exactly one."""
    ref = ref.strip()
    if ref.startswith("#") and ref[1:].isdigit():
        user = db.get(User, int(ref[1:]))
        if user is None:
            raise UserNotFound(f"No user with id {ref[1:]}")
        return user
    if ref.startswith("@"):
        # telegram_username is not unique: an old account can keep a name that the person gave up.
        matches = list(db.scalars(select(User).where(func.lower(User.telegram_username) == ref[1:].lower())))
        if len(matches) != 1:
            raise UserNotFound(f"{len(matches)} users have Telegram username {ref}. Use #<id>.")
        return matches[0]
    user = db.scalar(select(User).where(User.username == normalize_username(ref)))
    if user is None:
        raise UserNotFound(f"No user with login {ref}")
    return user


def set_admin(db: Session, ref: str, value: bool) -> User:
    user = find_user(db, ref)
    user.is_admin = value
    db.commit()
    return user


def _describe(user: User) -> str:
    return f"#{user.id} {display_name_of(user)}"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli", description="Admin rights of NDVI monitoring users.")
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("grant-admin", "revoke-admin"):
        command = commands.add_parser(name)
        command.add_argument("user", help="login, @telegram_username or #id")
    commands.add_parser("list-admins")
    args = parser.parse_args(argv)

    with SessionLocal() as db:
        if args.command == "list-admins":
            admins = list(db.scalars(select(User).where(User.is_admin).order_by(User.id)))
            for user in admins:
                print(_describe(user))
            if not admins:
                print("No admins")
            return 0
        try:
            user = set_admin(db, args.user, args.command == "grant-admin")
        except UserNotFound as error:
            print(error, file=sys.stderr)
            return 1
        print(f"{_describe(user)}: admin = {user.is_admin}")
        return 0


if __name__ == "__main__":
    sys.exit(main())
