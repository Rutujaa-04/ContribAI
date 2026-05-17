import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, Text, Float, Boolean
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy import ForeignKey
from app.database import Base
try:
    from pgvector.sqlalchemy import Vector
except ImportError:
    from sqlalchemy import Text as Vector  # fallback during setup


class Repository(Base):
    __tablename__ = "repositories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    github_repo_id = Column(Integer, unique=True, nullable=False, index=True)
    owner = Column(String, nullable=False, index=True)
    name = Column(String, nullable=False, index=True)
    full_name = Column(String, nullable=False)        # "facebook/react"
    description = Column(Text, nullable=True)
    stars = Column(Integer, default=0)
    primary_language = Column(String, nullable=True)
    tech_stack = Column(JSONB, default=list)          # ["React", "TypeScript", ...]
    arch_summary = Column(Text, nullable=True)        # LLM-generated plain English overview
    health_score = Column(Float, nullable=True)       # 0-100
    has_contributing_md = Column(Boolean, default=False)
    contributing_md_summary = Column(Text, nullable=True)
    last_ingested_at = Column(DateTime, nullable=True)
    html_url = Column(String, nullable=False, default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    chunks = relationship("CodeChunk", back_populates="repo", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Repository {self.full_name}>"


class CodeChunk(Base):
    __tablename__ = "code_chunks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    repo_id = Column(UUID(as_uuid=True), ForeignKey("repositories.id", ondelete="CASCADE"),
                     nullable=False, index=True)

    file_path = Column(String, nullable=False)           # "src/components/Button.tsx"
    chunk_text = Column(Text, nullable=False)            # the actual code snippet
    function_name = Column(String, nullable=True)        # "handleClick" if extractable
    language = Column(String, nullable=True)             # "typescript"
    chunk_index = Column(Integer, default=0)             # order within the file
    embedding = Column(Vector(768), nullable=True)       # Google text-embedding-004 = 768 dims
    created_at = Column(DateTime, default=datetime.utcnow)

    repo = relationship("Repository", back_populates="chunks")

    def __repr__(self):
        return f"<CodeChunk {self.file_path}[{self.chunk_index}]>"