import pandas as pd
import numpy as np
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score, mean_absolute_error, r2_score
from xgboost import XGBClassifier
import shap, joblib

df = pd.read_csv("data/student-mat.csv", sep=";")

FEATURES = ["studytime", "failures", "absences", "G1", "G2"]
X = df[FEATURES].values

# Model 1: Grade Prediction Model using Regression
y_grade = df["G3"].values
X_tr, X_te, y_tr, y_te = train_test_split(X, y_grade, test_size=0.2, random_state=42)
grade_model = GradientBoostingRegressor(n_estimators=200, random_state=42)
grade_model.fit(X_tr, y_tr)
r2 = r2_score(y_te, grade_model.predict(X_te))
mae = mean_absolute_error(y_te, grade_model.predict(X_te))
print(f"Grade Prediction - R²: {r2:.3f} | MAE: {mae:.2f}")

# Model 2: Pass/Fail Prediction Model using Classification
y_pass = (df["G3"] >= 10).astype(int)
neg, pos = (y_pass == 0).sum(), (y_pass == 1).sum()
X_tr2, X_te2, y_tr2, y_te2 = train_test_split(
    X, y_pass, test_size=0.2, random_state=42, stratify=y_pass
)
pass_model = XGBClassifier(
    n_estimators=200, scale_pos_weight=neg / pos, eval_metric="auc", random_state=42
)
pass_model.fit(X_tr2, y_tr2)
auc = roc_auc_score(y_te2, pass_model.predict_proba(X_te2)[:, 1])
print(f"Pass/Fail - AUC: {auc:.3f}")

# Model 3: Dropout Risk Prediction Model using Classification
y_dropout = (df["G3"] < 7).astype(int)
neg3, pos3 = (y_dropout == 0).sum(), (y_dropout == 1).sum()
X_tr3, X_te3, y_tr3, y_te3 = train_test_split(
    X, y_dropout, test_size=0.2, random_state=42, stratify=y_dropout
)
dropout_model = XGBClassifier(
    n_estimators=150, scale_pos_weight=neg3 / pos3, eval_metric="auc", random_state=42
)
dropout_model.fit(X_tr3, y_tr3)
auc3 = roc_auc_score(y_te3, dropout_model.predict_proba(X_te3)[:, 1])
print(f"Dropout Risk - AUC: {auc3:.3f}")

# SHAP Explainer
explainer = shap.TreeExplainer(pass_model)
shap_vals = explainer.shap_values(X_te2[:1])
print(f"\nSHAP for first test student:")
for name, val in zip(FEATURES, shap_vals[0]):
    direction = "helps pass" if val > 0 else "reduces chance of passing"
    print(f"  {name:15s}: {val:+.4f}  ({direction})")

# Save Models and Feature Names
joblib.dump(grade_model, "models/v1/grade_model.pkl")
joblib.dump(pass_model, "models/v1/pass_model.pkl")
joblib.dump(dropout_model, "models/v1/dropout_model.pkl")
joblib.dump(explainer, "models/v1/explainer.pkl")
joblib.dump(FEATURES, "models/v1/feature_names.pkl")
print("\n3 models + SHAP explainer saved to models/v1/")
