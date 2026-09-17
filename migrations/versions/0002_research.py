"""Additive research simulation and BGE-M3 indexes; retain original embeddings."""
from alembic import op

revision = "0002_research"
down_revision = "0001_workspace"
branch_labels = None
depends_on = None


def upgrade():
    # 0001 uses current metadata, so IF NOT EXISTS supports both new and existing stores.
    op.execute("ALTER TABLE current_patient_sessions ADD COLUMN IF NOT EXISTS simulate_evidence boolean NOT NULL DEFAULT false")
    op.execute("ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS embedding_m3 vector(1024)")
    op.execute("ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS sparse_m3 jsonb")
    op.execute("ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS retrieval_model text")
    op.execute("CREATE INDEX IF NOT EXISTS ix_chunks_m3_hnsw ON knowledge_chunks USING hnsw (embedding_m3 vector_cosine_ops)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_chunks_m3_sparse ON knowledge_chunks USING gin (sparse_m3)")


def downgrade():
    op.execute("DROP INDEX IF EXISTS ix_chunks_m3_hnsw")
    op.execute("DROP INDEX IF EXISTS ix_chunks_m3_sparse")
    op.execute("ALTER TABLE knowledge_chunks DROP COLUMN IF EXISTS retrieval_model, DROP COLUMN IF EXISTS sparse_m3, DROP COLUMN IF EXISTS embedding_m3")
    op.execute("ALTER TABLE current_patient_sessions DROP COLUMN IF EXISTS simulate_evidence")
