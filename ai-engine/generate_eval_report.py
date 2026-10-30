import torch
import json
import os
import numpy as np
from pathlib import Path
from torch_geometric.data import Data
from sklearn.metrics import f1_score, precision_score, recall_score, roc_auc_score, confusion_matrix
import sys

# Add ai-engine to path to import MuleHunterGNN
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from train_model import MuleHunterGNN, HIDDEN_CHANNELS

if os.path.exists("/app/shared-data"):
    SHARED_DATA = Path("/app/shared-data")
else:
    BASE_DIR    = Path(__file__).resolve().parent
    SHARED_DATA = BASE_DIR.parent / "shared-data"

MODEL_PATH  = SHARED_DATA / "mule_model.pth"
GRAPH_PATH  = SHARED_DATA / "processed_graph.pt"
EVAL_REPORT = SHARED_DATA / "eval_report.json"
MODEL_META  = SHARED_DATA / "model_meta.json"

def run_eval():
    print(f"🚀 Loading graph from {GRAPH_PATH}...")
    data = torch.load(GRAPH_PATH, map_location="cpu", weights_only=False)
    
    print(f"🚀 Loading model from {MODEL_PATH}...")
    in_channels = data.x.shape[1]
    model = MuleHunterGNN(in_channels=in_channels, hidden=HIDDEN_CHANNELS)
    model.load_state_dict(torch.load(MODEL_PATH, map_location="cpu", weights_only=True))
    model.eval()
    
    with torch.no_grad():
        out = model(data.x, data.edge_index)
        probs = out.exp()
        
    def evaluate_split(mask):
        labels = data.y[mask].numpy()
        scores = probs[mask][:, 1].numpy()
        predictions = (scores >= threshold).astype(int)
        return {
            "f1": float(f1_score(labels, predictions, zero_division=0)),
            "precision": float(precision_score(labels, predictions, zero_division=0)),
            "recall": float(recall_score(labels, predictions, zero_division=0)),
            "auc_roc": float(roc_auc_score(labels, scores)),
            "accuracy": float((predictions == labels).mean()),
            "confusion_matrix": confusion_matrix(labels, predictions).tolist(),
            "threshold_used": threshold,
        }

    # Use 0.5 as default threshold for this report
    threshold = 0.5
    test_metrics = evaluate_split(data.test_mask)
    val_metrics = evaluate_split(data.val_mask)
    
    metrics = {
        "test": test_metrics,
        "val": val_metrics,
        "best_val_auc": val_metrics["auc_roc"],
        "optimal_threshold": threshold,
        "model_config": {
            "in_channels": int(in_channels),
            "hidden_channels": HIDDEN_CHANNELS,
            "out_channels": 2,
            "architecture": "SAGE-GAT(4-head)-SAGE with residual projection",
        },
    }
    
    print(f"✅ Metrics generated: F1={metrics['test']['f1']:.4f}, AUC={metrics['test']['auc_roc']:.4f}")
    
    with open(EVAL_REPORT, "w") as f:
        json.dump(metrics, f, indent=2)
    print(f"✅ Report saved to {EVAL_REPORT}")

if __name__ == "__main__":
    run_eval()
