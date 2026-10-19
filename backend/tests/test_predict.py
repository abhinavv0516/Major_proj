"""
Smoke tests for the inference layer and the request schema.
Run from the repo root:  python -m pytest backend/tests -q
"""
import math

import pytest
import xgboost as xgb
from pydantic import ValidationError

from backend.feature_spec import FEATURE_COLUMNS
from backend.ml_service import FraudModel, predict_fraud
from backend.schemas import TransactionFeatures

LEGIT_ROW = {
    "time": 64717.5362, "v1": -0.597, "v2": -2.3903, "v3": -0.4122, "v4": 0.9135,
    "v5": 0.5376, "v6": 0.4282, "v7": -0.28, "v8": -1.279, "v9": 0.5153,
    "v10": -0.8343, "v11": 2.1841, "v12": 0.5705, "v13": -0.5806, "v14": -0.6114,
    "v15": -0.0929, "v16": -0.2395, "v17": 1.1168, "v18": 0.1864, "v19": -0.7316,
    "v20": 1.8904, "v21": 0.0493, "v22": 0.7688, "v23": -0.6082, "v24": 0.3631,
    "v25": 0.3111, "v26": -1.8896, "v27": 2.0153, "v28": 1.2906, "amount": 221.135,
}


@pytest.fixture(scope="module")
def model() -> FraudModel:
    return FraudModel.from_disk()


def test_schema_accepts_lowercase_and_returns_canonical_names():
    tx = TransactionFeatures(**LEGIT_ROW)
    assert list(tx.model_dump().keys()) == FEATURE_COLUMNS


def test_schema_rejects_missing_feature():
    row = dict(LEGIT_ROW)
    row.pop("v14")
    with pytest.raises(ValidationError):
        TransactionFeatures(**row)


def test_schema_rejects_unknown_key_and_negative_amount():
    with pytest.raises(ValidationError):
        TransactionFeatures(**LEGIT_ROW, merchant="x")
    with pytest.raises(ValidationError):
        TransactionFeatures(**{**LEGIT_ROW, "amount": -5})


def test_predict_shape(model):
    r = model.predict(TransactionFeatures(**LEGIT_ROW).model_dump())
    assert 0.0 <= r.fraud_probability <= 1.0
    assert r.risk_level in {"low", "medium", "high"}
    assert set(r.shap_values) == set(FEATURE_COLUMNS)
    assert len(r.top_features) == 5


def test_predict_without_explanation(model):
    r = model.predict(TransactionFeatures(**LEGIT_ROW).model_dump(), explain=False)
    assert r.shap_values is None and r.top_features == {}


def test_shap_values_add_up_to_model_output(model):
    """SHAP contributions + bias, through a sigmoid, must reproduce the probability."""
    feats = TransactionFeatures(**LEGIT_ROW).model_dump()
    r = model.predict(feats)
    import pandas as pd
    scaled = pd.DataFrame(model.scaler.transform(pd.DataFrame([feats])[FEATURE_COLUMNS]),
                          columns=FEATURE_COLUMNS)
    bias = model.booster.predict(xgb.DMatrix(scaled), pred_contribs=True)[0][-1]
    margin = sum(r.shap_values.values()) + bias
    assert math.isclose(1 / (1 + math.exp(-margin)), r.fraud_probability, abs_tol=1e-4)


def test_legacy_wrapper_still_works():
    is_fraud, prob, risk, shap, top = predict_fraud(LEGIT_ROW)
    assert isinstance(is_fraud, bool) and 0.0 <= prob <= 1.0
