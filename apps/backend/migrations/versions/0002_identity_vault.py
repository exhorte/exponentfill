"""Identity, privacy, vault, documents and audit tables (ADR-019 to 021).

Revision ID: 0002
Revises: 0001

The tables are created from the model definitions as they are TODAY (a frozen list). Later schema changes must be
explicit `op.*` migrations: never edit this one.
"""

from collections.abc import Sequence

from alembic import op

from app.database import Base
from app.domains import models  # noqa: F401  (registers the tables)

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLES = [
    "users",
    "sessions",
    "one_time_tokens",
    "email_outbox",
    "privacy_preferences",
    "ai_disclosures",
    "documents",
    "document_extractions",
    "profile_facts",
    "fact_versions",
    "fact_sources",
    "conflicts",
    "audit_events",
]


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind, tables=[Base.metadata.tables[t] for t in TABLES])
    if bind.dialect.name == "postgresql":
        # The audit trail is append-only: not even the application role can rewrite history.
        op.execute(
            """
            CREATE FUNCTION audit_events_immutable() RETURNS trigger AS $$
            BEGIN RAISE EXCEPTION 'audit_events is append-only'; END;
            $$ LANGUAGE plpgsql;
            """
        )
        op.execute("CREATE TRIGGER audit_events_no_update BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION audit_events_immutable();")


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("DROP TRIGGER IF EXISTS audit_events_no_update ON audit_events")
        op.execute("DROP FUNCTION IF EXISTS audit_events_immutable()")
    Base.metadata.drop_all(bind, tables=[Base.metadata.tables[t] for t in reversed(TABLES)])
