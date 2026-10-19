from pydantic import AliasChoices, BaseModel, ConfigDict, EmailStr, Field, create_model
from typing import Optional, List, Any, Dict, Literal
from datetime import datetime

from backend.feature_spec import FEATURE_COLUMNS

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

# ── ML inference ──────────────────────────────────────────────────────────────

# A real legitimate row from dataset/sample_creditcard.csv, shown in Swagger /docs.
_EXAMPLE_TRANSACTION = {
    "time": 64717.5362, "v1": -0.597, "v2": -2.3903, "v3": -0.4122, "v4": 0.9135,
    "v5": 0.5376, "v6": 0.4282, "v7": -0.28, "v8": -1.279, "v9": 0.5153,
    "v10": -0.8343, "v11": 2.1841, "v12": 0.5705, "v13": -0.5806, "v14": -0.6114,
    "v15": -0.0929, "v16": -0.2395, "v17": 1.1168, "v18": 0.1864, "v19": -0.7316,
    "v20": 1.8904, "v21": 0.0493, "v22": 0.7688, "v23": -0.6082, "v24": 0.3631,
    "v25": 0.3111, "v26": -1.8896, "v27": 2.0153, "v28": 1.2906, "amount": 221.135,
}

# Input for /api/predict. Built from FEATURE_COLUMNS so it can't drift from the model.
# - Every feature is required (no silent 0.0 fill-in).
# - Accepts lowercase keys (what the React form sends) or the dataset's "Time"/"V1"/"Amount".
# - Unknown keys and NaN/Infinity are rejected with a 422.
# - model_dump() returns canonical names ("Time", "V1", ..., "Amount") for ml_service.
TransactionFeatures = create_model(
    "TransactionFeatures",
    __config__=ConfigDict(
        extra="forbid",
        allow_inf_nan=False,
        json_schema_extra={"examples": [_EXAMPLE_TRANSACTION]},
    ),
    **{
        col: (
            float,
            Field(
                ...,
                validation_alias=AliasChoices(col.lower(), col),
                **({"ge": 0} if col == "Amount" else {}),
            ),
        )
        for col in FEATURE_COLUMNS
    },
)


class PredictionResponse(BaseModel):
    is_fraud: bool
    fraud_probability: float = Field(ge=0, le=1)
    risk_level: Literal["low", "medium", "high"]
    threshold: float
    model_version: str
    top_features: Dict[str, float] = {}
    shap_values: Optional[Dict[str, float]] = None
    inference_ms: float


class ModelInfoResponse(BaseModel):
    loaded: bool
    model_version: Optional[str] = None
    threshold: Optional[float] = None
    high_risk_threshold: Optional[float] = None
    features: List[str]
    error: Optional[str] = None


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
