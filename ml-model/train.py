import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from imblearn.over_sampling import SMOTE
import xgboost as xgb
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score, confusion_matrix
import joblib
import json
import os
import mlflow
import mlflow.xgboost

# Paths
DATA_PATH = os.path.join(os.path.dirname(__file__), '..', 'dataset', 'sample_creditcard.csv')
MODEL_PATH = os.path.join(os.path.dirname(__file__), 'xgboost_model.pkl')
SCALER_PATH = os.path.join(os.path.dirname(__file__), 'scaler.pkl')
METRICS_PATH = os.path.join(os.path.dirname(__file__), 'metrics.json')

# Set MLflow tracking URI (assuming local for now since Docker is not available)
mlflow.set_tracking_uri("sqlite:///mlflow.db")
mlflow.set_experiment("Fraud_Detection_Baseline")

def load_data(path):
    print(f"Loading data from {path}...")
    df = pd.read_csv(path)
    X = df.drop(['Class'], axis=1)
    y = df['Class']
    return X, y

def preprocess_data(X, y):
    print("Scaling features...")
    scaler = StandardScaler()
    X_scaled = pd.DataFrame(scaler.fit_transform(X), columns=X.columns)
    return X_scaled, y, scaler

def train_and_evaluate(X_train, X_test, y_train, y_test, use_smote=False):
    if use_smote:
        print("Handling imbalance with SMOTE...")
        smote = SMOTE(random_state=42)
        X_train, y_train = smote.fit_resample(X_train, y_train)
        scale_pos_weight = 1
    else:
        print("Handling imbalance with Class Weighting...")
        # Calculate scale_pos_weight: sum(negative instances) / sum(positive instances)
        scale_pos_weight = (len(y_train) - y_train.sum()) / y_train.sum()
    
    model = xgb.XGBClassifier(
        n_estimators=100,
        scale_pos_weight=scale_pos_weight,
        random_state=42,
        eval_metric='auc',
        use_label_encoder=False
    )
    
    print(f"Training XGBoost (SMOTE={use_smote})...")
    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)[:, 1]
    
    acc = accuracy_score(y_test, y_pred)
    prec = precision_score(y_test, y_pred)
    rec = recall_score(y_test, y_pred)
    f1 = f1_score(y_test, y_pred)
    roc = roc_auc_score(y_test, y_prob)
    cm = confusion_matrix(y_test, y_pred).tolist()
    
    metrics = {
        "accuracy": acc,
        "precision": prec,
        "recall": rec,
        "f1_score": f1,
        "roc_auc": roc
    }
    
    print(f"Metrics (SMOTE={use_smote}): Acc: {acc:.4f}, Prec: {prec:.4f}, Rec: {rec:.4f}, F1: {f1:.4f}, ROC-AUC: {roc:.4f}")
    
    return model, metrics, cm

def main():
    X, y = load_data(DATA_PATH)
    
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
    
    X_train_scaled, y_train, scaler = preprocess_data(X_train, y_train)
    X_test_scaled = pd.DataFrame(scaler.transform(X_test), columns=X_test.columns)
    
    # Run Experiment 1: Class Weighting
    with mlflow.start_run(run_name="XGBoost_ClassWeighting"):
        model_cw, metrics_cw, cm_cw = train_and_evaluate(X_train_scaled, X_test_scaled, y_train, y_test, use_smote=False)
        mlflow.log_param("use_smote", False)
        mlflow.log_metrics(metrics_cw)
        mlflow.xgboost.log_model(model_cw, "model")
        joblib.dump(model_cw, MODEL_PATH)
        joblib.dump(scaler, SCALER_PATH)
        
        with open(METRICS_PATH, 'w') as f:
            json.dump({"metrics": metrics_cw, "confusion_matrix": cm_cw}, f, indent=4)
            
    # Run Experiment 2: SMOTE
    with mlflow.start_run(run_name="XGBoost_SMOTE"):
        model_smote, metrics_smote, _ = train_and_evaluate(X_train_scaled, X_test_scaled, y_train, y_test, use_smote=True)
        mlflow.log_param("use_smote", True)
        mlflow.log_metrics(metrics_smote)
        mlflow.xgboost.log_model(model_smote, "model")

    print("Training pipeline completed successfully.")

if __name__ == "__main__":
    main()
