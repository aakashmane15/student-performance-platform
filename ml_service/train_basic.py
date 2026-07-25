import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score, f1_score
import joblib

df = pd.read_csv("data/student-mat.csv", sep=";")
df["passed"] = (df["G3"] >= 10).astype(int)

FEATURES = ["studytime", "failures", "absences", "G1", "G2"]
X = df[FEATURES]
y = df["passed"]

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42);

model = RandomForestClassifier(n_estimators=100, random_state=42)
model.fit(X_train, y_train)

auc = roc_auc_score(y_test, model.predict_proba(X_test)[:,1])
f1  = f1_score(y_test, model.predict(X_test))
print(f"AUC: {auc:.3f} | F1: {f1:.3f}")

joblib.dump(model, "models/v1/pass_model_v1.pkl")
joblib.dump(FEATURES, "models/v1/feature_names.pkl")
print("Model saved to models/v1/pass_model_v1.pkl")