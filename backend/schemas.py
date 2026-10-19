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


MAX_BATCH = 5000


class BatchPredictRequest(BaseModel):
    transactions: List[TransactionFeatures] = Field(..., min_length=1, max_length=MAX_BATCH)
    explain: bool = False


class BatchPredictItem(BaseModel):
    index: int
    fraud_probability: float
    is_fraud: bool
    risk_level: Literal["low", "medium", "high"]
    top_features: Dict[str, float] = {}


class BatchPredictResponse(BaseModel):
    model_version: str
    threshold: float
    count: int
    flagged: int
    elapsed_ms: float
    throughput_per_second: float
    results: List[BatchPredictItem]


class ModelInfoResponse(BaseModel):
    loaded: bool
    model_version: Optional[str] = None
    threshold: Optional[float] = None
    high_risk_threshold: Optional[float] = None
    features: List[str]
    error: Optional[str] = None


# ── Transactions ──────────────────────────────────────────────────────────────

class TransactionResponse(BaseModel):
    """Bare stored transaction (returned by the async/queued endpoint)."""
    id: int
    transaction_uuid: str
    submitted_at: datetime
    status: str
    raw_payload: Dict[str, Any]

    model_config = {"from_attributes": True}


RiskLevel = Literal["low", "medium", "high"]
Outcome = Literal["TP", "FP", "FN", "TN"]


class TransactionSummary(BaseModel):
    """One row in tables, alerts and the live feed. Flattened for the frontend."""
    id: int
    transaction_uuid: str
    submitted_at: Optional[datetime] = None
    status: str
    amount: float
    time: float
    fraud_probability: Optional[float] = None
    risk_level: Optional[RiskLevel] = None
    is_fraud: Optional[bool] = None
    model_version: Optional[str] = None
    processing_ms: Optional[float] = None
    top_features: Dict[str, float] = {}
    review_status: Optional[Literal["fraud", "legit"]] = None
    source: str = "api"
    ground_truth: Optional[int] = None
    outcome: Optional[Outcome] = None


class ReviewEntry(BaseModel):
    id: int
    review_status: str
    review_notes: Optional[str] = None
    reviewer: Optional[str] = None
    reviewed_at: Optional[datetime] = None


class AuditEntry(BaseModel):
    action: str
    actor: Optional[str] = None
    details: Dict[str, Any] = {}
    created_at: Optional[datetime] = None


class TransactionDetail(TransactionSummary):
    features: Dict[str, float]
    shap_values: Dict[str, float] = {}
    reviews: List[ReviewEntry] = []
    audit_trail: List[AuditEntry] = []


class SimulationRequest(BaseModel):
    count: int = Field(10, ge=1, le=100, description="How many transactions to replay")
    fraud_ratio: float = Field(0.1, ge=0, le=1, description="Chance each one is a known fraud case")


class SimulationResponse(BaseModel):
    created: int
    flagged: int
    actual_fraud: int
    transactions: List[TransactionSummary]


class ReviewRequest(BaseModel):
    label: Literal["fraud", "legit"]
    notes: Optional[str] = Field(None, max_length=1000)


# ── Analytics ─────────────────────────────────────────────────────────────────

class ReviewStats(BaseModel):
    reviewed: int
    pending: int
    confirmed_fraud: int
    false_positives: int
    missed_fraud: int


class LivePerformance(BaseModel):
    labelled: int
    tp: int
    fp: int
    fn: int
    tn: int
    accuracy: Optional[float] = None
    precision: Optional[float] = None
    recall: Optional[float] = None


class AnalyticsResponse(BaseModel):
    total_transactions: int
    fraud_transactions: int
    legitimate_transactions: int
    fraud_percentage: float
    risk_counts: Dict[str, int]
    amount_total: float
    amount_flagged: float
    avg_fraud_probability: Optional[float] = None
    avg_latency_ms: Optional[float] = None
    errors: int
    review: ReviewStats
    live_performance: LivePerformance


class TimeseriesPoint(BaseModel):
    bucket: datetime
    total: int
    flagged: int
    legit: int
    amount: float
    amount_flagged: float


class FeatureDriver(BaseModel):
    feature: str
    mean_abs_shap: float
    mean_abs_shap_flagged: float
    mean_shap_flagged: float


class ThresholdPoint(BaseModel):
    threshold: float
    precision: Optional[float] = None
    recall: Optional[float] = None
    f1: Optional[float] = None
    flagged: int
    tp: int
    fp: int
    fn: int
    tn: int


class ThresholdCurveResponse(BaseModel):
    model_version: str
    source: str
    n_test: int
    n_fraud: int
    roc_auc: Optional[float] = None
    pr_auc: Optional[float] = None
    current_threshold: float
    current: ThresholdPoint
    best_f1_threshold: Optional[float] = None
    points: List[ThresholdPoint]


class ModelMetricsResponse(BaseModel):
    model_version: Optional[str] = None
    algorithm: str
    metrics: Dict[str, float]
    confusion_matrix: Optional[List[List[int]]] = None
