"""V1 knowledge stores, isolated current sessions, durable runs and SSE audit."""
from alembic import op

from clintraj.server.db import Base

revision = "0001_workspace"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    Base.metadata.create_all(op.get_bind())


def downgrade():
    Base.metadata.drop_all(op.get_bind())
