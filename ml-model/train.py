import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from imblearn.over_sampling import SMOTE
from sklearn.linear_model import LogisticRegression
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score, confusion_matrix
import joblib
import json
import os

# Paths
DATA_PATH = os.path.join(os.path.dirname(__file__), '..', 'dataset', 'sample_creditcard.csv')
MODEL_PATH = os.path.join(os.path.dirname(__file__), 'random_forest_model.pkl')
SCALER_PATH = os.path.join(os.path.dirname(__file__), 'scaler.pkl')
METRICS_PATH = os.path.join(os.path.dirname(__file__), 'metrics.json')

def load_data(path):
    print(f"Loading data from {path}...")
    df = pd.read_csv(path)
    X = df.drop(['Class'], axis=1)
    y = df['Class']
    return X, y

def preprocess_data(X, y):
    print("Scaling features...")
    scaler = StandardScaler()
    # Fit scaler on 'Amount' and 'Time' if they exist, or all features
    X_scaled = pd.DataFrame(scaler.fit_transform(X), columns=X.columns)
    
    print("Handling imbalance with SMOTE...")
    smote = SMOTE(random_state=42)
    X_resampled, y_resampled = smote.fit_resample(X_scaled, y)
    
    return X_resampled, y_resampled, scaler

def train_and_evaluate(X_train, X_test, y_train, y_test):
    models = {
        "Logistic Regression": LogisticRegression(max_iter=1000, random_state=42),
        "Decision Tree": DecisionTreeClassifier(random_state=42),
        "Random Forest": RandomForestClassifier(n_estimators=50, random_state=42) # 50 trees for faster execution locally
    }
    
    best_model = None
    best_score = 0
    results = {}
    
    for name, model in models.items():
        print(f"Training {name}...")
        model.fit(X_train, y_train)
        y_pred = model.predict(X_test)
        y_prob = model.predict_proba(X_test)[:, 1] if hasattr(model, "predict_proba") else y_pred
        
        acc = accuracy_score(y_test, y_pred)
        prec = precision_score(y_test, y_pred)
        rec = recall_score(y_test, y_pred)
        f1 = f1_score(y_test, y_pred)
        roc = roc_auc_score(y_test, y_prob)
        cm = confusion_matrix(y_test, y_pred).tolist()
        
        print(f"{name} Metrics: Acc: {acc:.4f}, Prec: {prec:.4f}, Rec: {rec:.4f}, F1: {f1:.4f}, ROC-AUC: {roc:.4f}")
        
        results[name] = {
            "accuracy": acc,
            "precision": prec,
            "recall": rec,
            "f1_score": f1,
            "roc_auc": roc,
            "confusion_matrix": cm
        }
        
        if name == "Random Forest":
            best_model = model
            best_score = f1
            
    return best_model, results

def main():
    # 1. Load Data
    X, y = load_data(DATA_PATH)
    
    # 2. Train-Test Split (before SMOTE to avoid data leakage)
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
    
    # 3. Preprocess and SMOTE on training data
    X_train_resampled, y_train_resampled, scaler = preprocess_data(X_train, y_train)
    
    # 4. Scale test data
    X_test_scaled = pd.DataFrame(scaler.transform(X_test), columns=X_test.columns)
    
    # 5. Train and Evaluate
    best_model, results = train_and_evaluate(X_train_resampled, X_test_scaled, y_train_resampled, y_test)
    
    # 6. Save models and metrics
    print("Saving Random Forest model and scaler...")
    joblib.dump(best_model, MODEL_PATH)
    joblib.dump(scaler, SCALER_PATH)
    
    with open(METRICS_PATH, 'w') as f:
        json.dump(results, f, indent=4)
        
    print("Training pipeline completed successfully.")

if __name__ == "__main__":
    main()
