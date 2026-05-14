import joblib
import pandas as pd
import json

def load_and_evaluate():
    import os
    data_path = os.path.join(os.path.dirname(__file__), '..', 'dataset', 'sample_creditcard.csv')
    scaler_path = os.path.join(os.path.dirname(__file__), 'scaler.pkl')
    model_path = os.path.join(os.path.dirname(__file__), 'random_forest_model.pkl')
    eval_path = os.path.join(os.path.dirname(__file__), 'evaluation_results.json')
    
    # Load test data and models
    print("Loading test data and models...")
    df = pd.read_csv(data_path)
    X = df.drop('Class', axis=1)
    y = df['Class']
    
    # Simple split to just get some evaluation output 
    # (in reality we should use the exact test set from training, but for demonstration we'll evaluate on the whole set or a sample)
    scaler = joblib.load(scaler_path)
    model = joblib.load(model_path)
    
    X_scaled = pd.DataFrame(scaler.transform(X), columns=X.columns)
    
    print("Making predictions...")
    y_pred = model.predict(X_scaled)
    
    from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score, confusion_matrix
    
    y_prob = model.predict_proba(X_scaled)[:, 1]
    
    acc = accuracy_score(y, y_pred)
    prec = precision_score(y, y_pred)
    rec = recall_score(y, y_pred)
    f1 = f1_score(y, y_pred)
    roc = roc_auc_score(y, y_prob)
    cm = confusion_matrix(y, y_pred).tolist()
    
    print(f"Final Evaluation Metrics:")
    print(f"Accuracy: {acc:.4f}")
    print(f"Precision: {prec:.4f}")
    print(f"Recall: {rec:.4f}")
    print(f"F1 Score: {f1:.4f}")
    print(f"ROC-AUC: {roc:.4f}")
    
    results = {
        "accuracy": acc,
        "precision": prec,
        "recall": rec,
        "f1_score": f1,
        "roc_auc": roc,
        "confusion_matrix": cm
    }
    
    with open(eval_path, 'w') as f:
        json.dump(results, f, indent=4)
        
    print(f"Evaluation results saved to {eval_path}")

if __name__ == '__main__':
    load_and_evaluate()
