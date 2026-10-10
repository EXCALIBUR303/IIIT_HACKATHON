"""Operator commands for creating organisations and educator invitations.

    uv run python -m app.admin create-org "Asha Foundation" --kind ngo
    uv run python -m app.admin create-invite --org "Asha Foundation" --days 7 --uses 1
    uv run python -m app.admin list-invites --org "Asha Foundation"
    uv run python -m app.admin revoke-invite --id 12

Organisations exist only because an operator ran this. No HTTP route creates one, so a
registration request can never name, match or impersonate an organisation. The invitation
token is printed once and is not recoverable (only its hash is stored).
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime

from sqlalchemy import select

from app.core.db import SessionLocal
from app.models import EducatorInvite, Organization
from app.services import invites


def _org(db, name: str | None, org_id: int | None) -> Organization:
    org = db.get(Organization, org_id) if org_id else None
    if org is None and name:
        org = db.scalar(select(Organization).where(Organization.name == name.strip()))
    if org is None:
        sys.exit("Organisation not found. Create it first with create-org.")
    return org


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(prog="python -m app.admin", description=__doc__)
    sub = p.add_subparsers(dest="cmd", required=True)
    co = sub.add_parser("create-org", help="create an organisation")
    co.add_argument("name")
    co.add_argument("--kind", choices=["ngo", "school", "other"], default="ngo")
    ci = sub.add_parser("create-invite", help="create an educator invitation for one organisation")
    ci.add_argument("--org", help="organisation name")
    ci.add_argument("--org-id", type=int)
    ci.add_argument("--days", type=int, default=7)
    ci.add_argument("--uses", type=int, default=1)
    ci.add_argument("--json", action="store_true", help="machine-readable output")
    li = sub.add_parser("list-invites", help="list invitations (never shows tokens)")
    li.add_argument("--org")
    li.add_argument("--org-id", type=int)
    ri = sub.add_parser("revoke-invite", help="revoke an invitation")
    ri.add_argument("--id", type=int, required=True)
    args = p.parse_args(argv)

    with SessionLocal() as db:
        if args.cmd == "create-org":
            try:
                org = invites.create_organization(db, args.name, args.kind)
            except ValueError as exc:
                sys.exit(str(exc))
            db.commit()
            print(f"Created organisation #{org.id}: {org.name}")
        elif args.cmd == "create-invite":
            org = _org(db, args.org, args.org_id)
            if not (1 <= args.days <= 90 and 1 <= args.uses <= 100):
                sys.exit("--days must be 1-90 and --uses 1-100")
            invite, token = invites.create(db, org.id, days_valid=args.days, max_uses=args.uses)
            db.commit()
            if args.json:
                print(json.dumps({"id": invite.id, "organization": org.name, "token": token}))
            else:
                print(
                    f"Invitation #{invite.id} for {org.name} (expires {invite.expires_at:%Y-%m-%d})"
                )
                print(f"Token (shown once): {token}")
        elif args.cmd == "list-invites":
            q = select(EducatorInvite).order_by(EducatorInvite.id)
            if args.org or args.org_id:
                q = q.where(EducatorInvite.organization_id == _org(db, args.org, args.org_id).id)
            for i in db.scalars(q):
                print(
                    f"#{i.id} org={i.organization_id} {invites.status_of(i)} "
                    f"uses={i.used_count}/{i.max_uses} expires={i.expires_at:%Y-%m-%d}"
                )
        elif args.cmd == "revoke-invite":
            invite = db.get(EducatorInvite, args.id)
            if invite is None:
                sys.exit("Invitation not found")
            invite.revoked_at = datetime.now(UTC)
            db.commit()
            print(f"Revoked invitation #{invite.id}")


if __name__ == "__main__":
    main()
