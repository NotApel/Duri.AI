"""Scores a burst of images with the Duri.AI TFLite model.

Called by the backend (aiInference.js). Reads JSON on stdin:
    {"images": ["<base64>", ...]}
and prints one JSON line on stdout:
    {"prediction": "DURIAN" | "NOT_DURIAN", "confidence": 93.12, "images": 3}
On failure it prints {"error": "..."} and exits with code 1.

Environment variables (all optional):
    MODEL_PATH   default: model_updated.tflite next to this script
    MODEL_URL    public URL of the model, downloaded when MODEL_PATH is missing
"""
import base64
import json
import os
import sys
from io import BytesIO

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
_DEFAULT_MODELS = [
    os.path.join(HERE, "model_updated.tflite"),
    os.path.join(HERE, "ai", "model_updated.tflite"),
]
MODEL_PATH = os.environ.get("MODEL_PATH") or next(
    (path for path in _DEFAULT_MODELS if os.path.exists(path)), _DEFAULT_MODELS[0]
)
MODEL_URL = os.environ.get("MODEL_URL")
MAX_IMAGES = 5


def load_interpreter():
    if not os.path.exists(MODEL_PATH) and MODEL_URL:
        import urllib.request

        urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
    if not os.path.exists(MODEL_PATH):
        raise RuntimeError(f"Model file not found: {MODEL_PATH}")
    try:
        from tflite_runtime.interpreter import Interpreter
    except ImportError:
        import tensorflow as tf

        Interpreter = tf.lite.Interpreter
    interpreter = Interpreter(model_path=MODEL_PATH)
    interpreter.allocate_tensors()
    return interpreter


def p_durian(interpreter, data):
    """Probability (0-1) that one image shows a durian."""
    inp = interpreter.get_input_details()[0]
    out = interpreter.get_output_details()[0]
    _, height, width, _ = inp["shape"]
    image = Image.open(BytesIO(data)).convert("RGB")
    image = image.resize((int(width), int(height)), Image.BILINEAR)
    # Pixels stay 0-255 because the Rescaling layer is inside the model.
    batch = np.expand_dims(np.asarray(image, dtype=np.float32), axis=0)
    interpreter.set_tensor(inp["index"], batch)
    interpreter.invoke()
    # Keras orders classes alphabetically (durian=0, not_durian=1), so the
    # sigmoid output is the probability of NOT_DURIAN.
    not_durian = float(interpreter.get_tensor(out["index"])[0][0])
    return 1.0 - not_durian


def main():
    payload = json.load(sys.stdin)
    images = [base64.b64decode(item) for item in payload.get("images", [])][:MAX_IMAGES]
    if not images:
        raise RuntimeError("No images received.")
    interpreter = load_interpreter()
    scores = []
    for index, data in enumerate(images, 1):
        try:
            scores.append(p_durian(interpreter, data))
        except Exception as error:
            print(f"Skipping image {index}: {error}", file=sys.stderr)
    if not scores:
        raise RuntimeError("No image could be scored.")
    mean = sum(scores) / len(scores)
    prediction = "DURIAN" if mean >= 0.5 else "NOT_DURIAN"
    confidence = round(max(mean, 1.0 - mean) * 100, 2)
    print(json.dumps({"prediction": prediction, "confidence": confidence, "images": len(scores)}))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"error": str(error)}))
        sys.exit(1)