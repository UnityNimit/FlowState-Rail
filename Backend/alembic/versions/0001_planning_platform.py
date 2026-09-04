"""Initial workspace, integration, planning and audit schema."""
from alembic import op
from planning_models import Base

revision = "0001_planning_platform"
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)
    if bind.dialect.name == "postgresql":
        for table in Base.metadata.sorted_tables:
            op.execute(f'ALTER TABLE "{table.name}" ENABLE ROW LEVEL SECURITY')

def downgrade():
    Base.metadata.drop_all(bind=op.get_bind())
