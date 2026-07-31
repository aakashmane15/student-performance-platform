export type UserRole = "ADMIN" | "TEACHER" | "STUDENT";

export interface ShapFeature {
  label: string;
  value: number;
  impact: number;
  direction: "increases_risk" | "reduces_risk";
}

export interface ShapOutput {
  base_value: number;
  total_shift: number;
  top_feature: string;
  top_label: string;
  top_direction: "increases_risk" | "reduces_risk";
  features: Record<string, ShapFeature>;
}

export interface PredictionResult {
  student_id: string | null;
  course_id: string | null;
  predicted_grade: number;
  pass_probability: number;
  dropout_risk: number;
  risk_category: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  shap_values: ShapOutput;
  insight: string;
}
