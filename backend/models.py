import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from backend.database import Base


def utcnow() -> datetime:
    """Naive UTC timestamp. The columns are TIMESTAMP WITHOUT TIME ZONE, and asyncpg
    (PostgreSQL) rejects timezone-aware values for them. Responses re-attach UTC."""
    return datetime.now(timezone.utc).replace(tzinfo=None)

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    full_name = Column(String)
    role = Column(String, default="analyst")
    is_active = Column(Boolean, default=True)

class Transaction(Base):
    __tablename__ = "transactions"
    id = Column(Integer, primary_key=True, index=True)
    transaction_uuid = Column(String, unique=True, index=True, default=lambda: str(uuid.uuid4()))
    submitted_at = Column(DateTime, default=utcnow)
    status = Column(String, default="queued") # queued, scored, error
    raw_payload = Column(JSON)
    
    scores = relationship("Score", back_populates="transaction", cascade="all, delete-orphan")
    reviews = relationship("Review", back_populates="transaction", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="transaction", cascade="all, delete-orphan")

class Score(Base):
    __tablename__ = "scores"
    id = Column(Integer, primary_key=True, index=True)
    transaction_id = Column(Integer, ForeignKey("transactions.id"))
    model_version = Column(String)
    fraud_probability = Column(Float)
    risk_level = Column(String) # low, medium, high
    prediction = Column(Boolean)
    processing_time = Column(Float)
    created_at = Column(DateTime, default=utcnow)
    
    transaction = relationship("Transaction", back_populates="scores")
    explanation = relationship("Explanation", back_populates="score", uselist=False, cascade="all, delete-orphan")

class Explanation(Base):
    __tablename__ = "explanations"
    id = Column(Integer, primary_key=True, index=True)
    score_id = Column(Integer, ForeignKey("scores.id"))
    top_features = Column(JSON)
    shap_values = Column(JSON)
    created_at = Column(DateTime, default=utcnow)
    
    score = relationship("Score", back_populates="explanation")

class MLModel(Base):
    __tablename__ = "models"
    id = Column(Integer, primary_key=True, index=True)
    version = Column(String, unique=True, index=True)
    algorithm = Column(String)
    accuracy = Column(Float)
    precision = Column(Float)
    recall = Column(Float)
    f1_score = Column(Float)
    roc_auc = Column(Float)

class Review(Base):
    __tablename__ = "reviews"
    id = Column(Integer, primary_key=True, index=True)
    transaction_id = Column(Integer, ForeignKey("transactions.id"))
    review_status = Column(String)
    review_notes = Column(String)
    reviewed_by = Column(Integer, ForeignKey("users.id"))
    reviewed_at = Column(DateTime, default=utcnow)
    
    transaction = relationship("Transaction", back_populates="reviews")
    reviewer = relationship("User")

class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True, index=True)
    transaction_id = Column(Integer, ForeignKey("transactions.id"))
    action = Column(String)
    actor = Column(String)
    details = Column(JSON)
    created_at = Column(DateTime, default=utcnow)
    
    transaction = relationship("Transaction", back_populates="audit_logs")
