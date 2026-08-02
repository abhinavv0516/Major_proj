import os
import joblib
import pandas as pd
import xgboost as xgb
import shap

MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "ml-model", "xgboost_model.pkl")
SCALER_PATH = os.path.join(os.path.dirname(__file__), "..", "ml-model", "scaler.pkl")

model = None
scaler = None
explainer = None

def load_models():
    global model, scaler, explainer
    if model is None or scaler is None or explainer is None:
        try:
            model = joblib.load(MODEL_PATH)
            scaler = joblib.load(SCALER_PATH)
            explainer = shap.TreeExplainer(model)
        except Exception as e:
            print(f"Error loading models: {e}")
            raise e

def predict_fraud(transaction_data: dict) -> tuple[bool, float, str, dict, dict]:
    """
    Takes transaction data payload, scales it, and returns (is_fraud, probability, risk_level, shap_dict, top_features).
    """
    load_models()
    
    columns = ['Time'] + [f'V{i}' for i in range(1, 29)] + ['Amount']
    
    features = []
    for col in columns:
        val = transaction_data.get(col, transaction_data.get(col.lower(), 0.0))
        features.append(float(val))
    
    df = pd.DataFrame([features], columns=columns)
    df_scaled = pd.DataFrame(scaler.transform(df), columns=columns)
    
    prob = float(model.predict_proba(df_scaled)[0][1])
    is_fraud = bool(prob > 0.5)
    
    risk_level = "low"
    if prob > 0.8:
        risk_level = "high"
    elif prob > 0.5:
        risk_level = "medium"
        
    # SHAP values calculation
    shap_vals = explainer.shap_values(df_scaled)[0]
    
    shap_dict = {columns[i]: float(shap_vals[i]) for i in range(len(columns))}
    top_features = dict(sorted(shap_dict.items(), key=lambda item: abs(item[1]), reverse=True)[:5])
    
    return is_fraud, prob, risk_level, shap_dict, top_features
