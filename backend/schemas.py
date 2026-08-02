from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Any, Dict
from datetime import datetime

class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    role: Optional[str] = "analyst"

class UserCreate(UserBase):
    password: str

class UserResponse(UserBase):
    id: int
    is_active: bool

    model_config = {"from_attributes": True}

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None

class PredictionResponse(BaseModel):
    is_fraud: bool
    fraud_probability: float
    risk_level: Optional[str] = None
    shap_values: Optional[Dict[str, float]] = None
    top_features: Optional[Dict[str, float]] = None


# We use Dict[str, Any] for raw payload
class TransactionCreate(BaseModel):
    payload: Dict[str, float]

class TransactionResponse(BaseModel):
    id: int
    transaction_uuid: str
    submitted_at: datetime
    status: str
    raw_payload: Dict[str, Any]

    model_config = {"from_attributes": True}

class ExplanationResponse(BaseModel):
    top_features: Dict[str, float]
    shap_values: Dict[str, float]

    model_config = {"from_attributes": True}

class ScoreResponse(BaseModel):
    id: int
    transaction_id: int
    model_version: str
    fraud_probability: float
    risk_level: str
    prediction: bool
    processing_time: float
    created_at: datetime
    explanation: Optional[ExplanationResponse] = None

    model_config = {"from_attributes": True}

class TransactionDetailResponse(TransactionResponse):
    scores: List[ScoreResponse] = []

    model_config = {"from_attributes": True}

class AnalyticsResponse(BaseModel):
    total_transactions: int
    fraud_transactions: int
    legitimate_transactions: int
    fraud_percentage: float
