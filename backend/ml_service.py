import os
import joblib
import pandas as pd

MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "ml-model", "random_forest_model.pkl")
SCALER_PATH = os.path.join(os.path.dirname(__file__), "..", "ml-model", "scaler.pkl")

# We use global variables to hold the loaded models to avoid loading on every request
model = None
scaler = None

def load_models():
    global model, scaler
    if model is None or scaler is None:
        try:
            model = joblib.load(MODEL_PATH)
            scaler = joblib.load(SCALER_PATH)
        except Exception as e:
            print(f"Error loading models: {e}")
            raise e

def predict_fraud(transaction_data: dict) -> tuple[bool, float]:
    """
    Takes transaction data, scales it, and returns (is_fraud, probability).
    """
    load_models()
    
    # Extract features in the correct order: Time, V1..V28, Amount
    features = [
        transaction_data.get('time', 0.0),
        transaction_data.get('v1', 0.0), transaction_data.get('v2', 0.0), transaction_data.get('v3', 0.0),
        transaction_data.get('v4', 0.0), transaction_data.get('v5', 0.0), transaction_data.get('v6', 0.0),
        transaction_data.get('v7', 0.0), transaction_data.get('v8', 0.0), transaction_data.get('v9', 0.0),
        transaction_data.get('v10', 0.0), transaction_data.get('v11', 0.0), transaction_data.get('v12', 0.0),
        transaction_data.get('v13', 0.0), transaction_data.get('v14', 0.0), transaction_data.get('v15', 0.0),
        transaction_data.get('v16', 0.0), transaction_data.get('v17', 0.0), transaction_data.get('v18', 0.0),
        transaction_data.get('v19', 0.0), transaction_data.get('v20', 0.0), transaction_data.get('v21', 0.0),
        transaction_data.get('v22', 0.0), transaction_data.get('v23', 0.0), transaction_data.get('v24', 0.0),
        transaction_data.get('v25', 0.0), transaction_data.get('v26', 0.0), transaction_data.get('v27', 0.0),
        transaction_data.get('v28', 0.0), transaction_data.get('amount', 0.0)
    ]
    
    # Create DataFrame with correct column names as expected by scaler
    columns = ['Time'] + [f'V{i}' for i in range(1, 29)] + ['Amount']
    df = pd.DataFrame([features], columns=columns)
    
    # Scale features
    df_scaled = pd.DataFrame(scaler.transform(df), columns=columns)
    
    # Predict
    prob = model.predict_proba(df_scaled)[0][1]
    is_fraud = bool(prob > 0.5)
    
    return is_fraud, float(prob)
