# ml_service/main.py
# Student Performance ML Service - FastAPI
# Loads 3 trained models + SHAP explainer and exposes a /predict endpoint.
# Start: uvicorn main:app --reload
# Docs:  http://localhost:8000/docs

from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import joblib
import numpy as np

# ── Global model registry ────────────────────────────────────────────────────
# Populated at startup via the lifespan function, empty after shutdown.
ml: dict = {}


# ── Startup / shutdown ───────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Load all model artifacts when the server starts.
    Release them when it shuts down.
    This runs ONCE, not on every request - so predictions are fast.
    """
    print("Loading ML models...")
    try:
        ml["grade"] = joblib.load("models/v1/grade_model.pkl")
        ml["pass_fail"] = joblib.load("models/v1/pass_model.pkl")
        ml["dropout"] = joblib.load("models/v1/dropout_model.pkl")
        ml["explainer"] = joblib.load("models/v1/explainer.pkl")
        ml["features"] = joblib.load("models/v1/feature_names.pkl")
        print("All 5 artifacts loaded:")
        print(f"Features : {ml['features']}")
        print(f"Models   : grade, pass_fail, dropout")
        print(f"Explainer: SHAP TreeExplainer (fitted on pass_fail model)")
    except FileNotFoundError as e:
        print(f"\nMissing model file: {e}")
        print("→ Run `python train_v2.py` first, then restart this service.\n")
    except Exception as e:
        print(f"\nUnexpected error loading models: {e}\n")

    yield  # Server runs here

    ml.clear()
    print("ML service shutting down - model registry cleared.")


# ── App instance ─────────────────────────────────────────────────────────────

app = FastAPI(
    title="Student Performance ML Service",
    description=(
        "Predicts student academic outcomes (grade, pass/fail, dropout risk) "
        "and explains every prediction using SHAP feature attribution."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# Allow the Next.js frontend to call this service.
# In production, replace "*" with your actual Vercel URL.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / Response schemas ───────────────────────────────────────────────


class PredictRequest(BaseModel):
    """
    The 5 features this model was trained on (UCI Student Performance Dataset).
    Optional student_id / course_id are passed through for tracing - the models
    don't use them, but the Next.js API route needs them in the response to know
    which Prediction row to save to the database.
    """

    student_id: Optional[str] = Field(
        default=None, description="Student DB id - passed through, not used by model"
    )
    course_id: Optional[str] = Field(
        default=None, description="Course DB id - passed through, not used by model"
    )
    studytime: int = Field(
        ..., ge=1, le=4, description="Weekly study time. 1=<2h, 2=2–5h, 3=5–10h, 4=>10h"
    )
    failures: int = Field(
        ..., ge=0, le=4, description="Number of past class failures (capped at 4)"
    )
    absences: int = Field(
        ..., ge=0, le=93, description="Number of school absences this term"
    )
    G1: float = Field(..., ge=0, le=20, description="First-period grade (0–20 scale)")
    G2: float = Field(..., ge=0, le=20, description="Second-period grade (0–20 scale)")

    model_config = {
        "json_schema_extra": {
            "example": {
                "student_id": "clx4abc123",
                "course_id": "clx4def456",
                "studytime": 1,
                "failures": 2,
                "absences": 15,
                "G1": 8.0,
                "G2": 9.0,
            }
        }
    }


# ── Helper: risk categorisation ──────────────────────────────────────────────


def categorize_risk(dropout_prob: float) -> str:
    """
    Bucket a continuous dropout probability into four named categories.
    These thresholds are opinionated - adjust based on your institution's needs.

        CRITICAL  ≥ 0.75   Immediate intervention required
        HIGH      ≥ 0.50   At-risk - teacher should reach out
        MEDIUM    ≥ 0.25   Early warning - worth monitoring
        LOW       < 0.25   No immediate concern
    """
    if dropout_prob >= 0.75:
        return "CRITICAL"
    if dropout_prob >= 0.50:
        return "HIGH"
    if dropout_prob >= 0.25:
        return "MEDIUM"
    return "LOW"


# ── Helper: SHAP explanation ──────────────────────────────────────────────────

# Human-readable labels for the 5 feature names.
FEATURE_LABELS: dict[str, str] = {
    "studytime": "Weekly Study Time",
    "failures": "Past Class Failures",
    "absences": "Absences This Term",
    "G1": "First-Period Grade",
    "G2": "Second-Period Grade",
}


def build_shap_output(X_row: np.ndarray) -> dict:
    """
    Run SHAP on a single student row (shape: (1, 5)) and return a
    JSON-serialisable dictionary the frontend can render directly.

    The explainer was fitted on the XGBoost pass_fail model, so SHAP
    values represent "how much did this feature push the model toward
    predicting a FAIL outcome?":
        Positive impact → increases fail/at-risk probability
        Negative impact → decreases fail/at-risk probability (protective)

    Returns:
        {
            "base_value":    <float>  - model's average prediction before seeing features
            "total_shift":   <float>  - sum of all SHAP values (base + shift = final log-odds)
            "top_feature":   <str>    - key of the feature with highest |impact|
            "top_label":     <str>    - human-readable version of top_feature
            "top_direction": <str>    - "increases_risk" | "reduces_risk"
            "features": {
                "<feature_key>": {
                    "label":     <str>   - human-readable name
                    "value":     <float> - raw value the student had
                    "impact":    <float> - SHAP value (positive = more risk)
                    "direction": <str>   - "increases_risk" | "reduces_risk"
                },
                ...  sorted by |impact| descending
            }
        }
    """
    explainer = ml["explainer"]
    feature_names: list = ml["features"]

    # shap_values() returns either:
    #   - a 2D array of shape (1, n_features) for single-output models
    #   - a list of two arrays for binary classifiers (one per class)
    # We always want the "positive class" (fail/at-risk), which is index 1.
    raw = explainer.shap_values(X_row)

    if isinstance(raw, list):
        # Older shap versions - raw is [class_0_vals, class_1_vals]
        impacts: np.ndarray = raw[1][0]
        base_value = float(
            explainer.expected_value[1]
            if hasattr(explainer.expected_value, "__len__")
            else explainer.expected_value
        )
    else:
        # Newer shap versions - raw is already a single (1, n_features) array
        impacts = raw[0]
        base_value = float(
            explainer.expected_value[1]
            if hasattr(explainer.expected_value, "__len__")
            else explainer.expected_value
        )

    # Build per-feature dictionary
    features_breakdown: dict = {}
    for i, name in enumerate(feature_names):
        impact = float(impacts[i])
        features_breakdown[name] = {
            "label": FEATURE_LABELS.get(name, name),
            "value": float(X_row[0][i]),
            "impact": round(impact, 6),
            "direction": "increases_risk" if impact > 0 else "reduces_risk",
        }

    # Sort by absolute impact - biggest driver first (important for the frontend bar chart)
    sorted_features = dict(
        sorted(
            features_breakdown.items(),
            key=lambda item: abs(item[1]["impact"]),
            reverse=True,
        )
    )

    top_key = list(sorted_features.keys())[0]
    top_entry = sorted_features[top_key]

    return {
        "base_value": round(base_value, 6),
        "total_shift": round(float(impacts.sum()), 6),
        "top_feature": top_key,
        "top_label": top_entry["label"],
        "top_direction": top_entry["direction"],
        "features": sorted_features,
    }


def generate_insight(shap_output: dict, risk_category: str) -> str:
    """
    Produce a one-sentence plain-English explanation of the top driver.
    This is shown below the SHAP chart on the Prediction Results page.
    """
    label = shap_output["top_label"]
    direction = shap_output["top_direction"]
    value = shap_output["features"][shap_output["top_feature"]]["value"]

    if direction == "increases_risk":
        return (
            f"Your {label.lower()} ({value:.0f}) is your highest risk factor "
            f": it is the single biggest contributor pushing your predicted outcome down. "
            f"Improving this would have the largest positive impact on your final grade."
        )
    else:
        return (
            f"Your {label.lower()} ({value:.0f}) is your strongest protective factor "
            f": it is actively reducing your risk score. "
            f"Keep it up while focusing on the factors listed above it."
        )


# ── Routes ───────────────────────────────────────────────────────────────────


@app.get("/health", tags=["System"], summary="Health check")
def health_check():
    """
    Returns 200 OK if the service is running and all models are loaded.
    Returns 503 if models failed to load (e.g. .pkl files missing).

    Call this from your Next.js /api/health route to confirm the ML service
    is reachable before attempting predictions.
    """
    if not ml:
        raise HTTPException(
            status_code=503,
            detail=(
                "Models not loaded. "
                "Run train_v2.py to generate .pkl files, then restart the service."
            ),
        )
    return {
        "status": "ok",
        "models_loaded": [k for k in ml if k != "features"],
        "features": ml.get("features", []),
        "feature_count": len(ml.get("features", [])),
    }


@app.get("/model-info", tags=["System"], summary="Model metadata")
def model_info():
    """
    Returns metadata about the currently loaded models - useful for the
    Admin Control Panel's 'Model Performance' section.
    """
    if not ml:
        raise HTTPException(status_code=503, detail="Models not loaded")
    return {
        "version": "v1",
        "trained_on": "UCI Student Performance Dataset - student-mat.csv",
        "n_training": 395,
        "features": ml.get("features", []),
        "models": {
            "grade_predictor": {
                "algorithm": "GradientBoostingRegressor",
                "task": "Regression - predicts final numeric grade (0–20)",
                "target": "G3 (final period grade)",
            },
            "pass_fail": {
                "algorithm": "XGBClassifier",
                "task": "Binary classification - probability of passing",
                "target": "G3 >= 10",
            },
            "dropout_risk": {
                "algorithm": "XGBClassifier",
                "task": "Binary classification - probability of severe failure",
                "target": "G3 < 7",
            },
        },
        "explainer": "shap.TreeExplainer - fitted on pass_fail XGBClassifier",
    }


@app.post("/predict", tags=["Prediction"], summary="Run all predictions for a student")
def predict(payload: PredictRequest):
    """
    **The core endpoint.** Accepts a student's feature values and returns:

    - `predicted_grade`  - estimated final score on a 0–20 scale
    - `pass_probability` - probability the student passes (G3 ≥ 10), 0.0–1.0
    - `dropout_risk`     - probability of severe failure (G3 < 7), 0.0–1.0
    - `risk_category`    - LOW | MEDIUM | HIGH | CRITICAL (from dropout_risk)
    - `shap_values`      - per-feature breakdown: what drove this prediction
    - `insight`          - one auto-generated sentence for the UI

    Called by the Next.js `POST /api/predictions/trigger` route after it
    fetches the student's data from PostgreSQL.
    """
    if not ml:
        raise HTTPException(
            status_code=503,
            detail="ML models are not loaded - the service may still be starting up.",
        )

    # Build the feature matrix. Order MUST match the order used in train_v2.py:
    # ["studytime", "failures", "absences", "G1", "G2"]
    X = np.array(
        [
            [
                payload.studytime,
                payload.failures,
                payload.absences,
                payload.G1,
                payload.G2,
            ]
        ],
        dtype=float,
    )

    # ── 1. Grade Prediction (Regression) ────────────────────────────────────
    predicted_grade = float(ml["grade"].predict(X)[0])

    # ── 2. Pass/Fail Probability (Classification) ────────────────────────────
    # predict_proba returns [[prob_fail, prob_pass]] - we want index 1
    pass_probability = float(ml["pass_fail"].predict_proba(X)[0][1])

    # ── 3. Dropout Risk Score (Classification) ───────────────────────────────
    # Same shape - we want the probability of the positive class (dropout)
    dropout_risk = float(ml["dropout"].predict_proba(X)[0][1])

    # ── 4. Risk Category ─────────────────────────────────────────────────────
    risk_category = categorize_risk(dropout_risk)

    # ── 5. SHAP Explanation ──────────────────────────────────────────────────
    shap_output = build_shap_output(X)

    # ── 6. Auto-generated insight ────────────────────────────────────────────
    insight = generate_insight(shap_output, risk_category)

    return {
        # Pass-through identifiers (for the Next.js route to use when saving to DB)
        "student_id": payload.student_id,
        "course_id": payload.course_id,
        # Predictions
        "predicted_grade": round(predicted_grade, 2),
        "pass_probability": round(pass_probability, 4),
        "dropout_risk": round(dropout_risk, 4),
        "risk_category": risk_category,
        # Explanation (used directly by the frontend SHAP chart)
        "shap_values": shap_output,
        "insight": insight,
    }
