from fastapi import FastAPI
from pydantic import BaseModel
import joblib, numpy as np
from contextlib import asynccontextmanager

ml = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    ml["model"] = joblib.load("models/v1/pass_model_v1.pkl")
    ml["features"] = joblib.load("models/v1/feature_names.pkl")
    print("Model Loaded Succesfully")
    yield()
    ml.clear()

app = FastAPI(title="Student Performance System ML Service v1", lifespan=lifespan)

class StudentFeatures(BaseModel): 
    studytime: int
    failures: int
    absences: int
    G1: float 
    G2: float 

@app.post("/predict")
def predict(payload: StudentFeatures):
    X = np.array([[
        payload.studytime, payload.failures, payload.absences, payload.G1, payload.G2
    ]])

    prob = float(ml["model"].predict_proba(X)[0][1])

    return {
        "pass_probability": round(prob, 3),
        "risk_category":    "HIGH" if prob < 0.4 else "MEDIUM" if prob < 0.7 else "LOW",
        "model_version":    "v1-random-forest"
    }

@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": bool(ml)}