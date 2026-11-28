import base64
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
THRESHOLD = float(os.environ.get("CONFIDENCE_THRESHOLD", 90))


def main():
    paths = sys.argv[1:]
    if not paths:
        sys.exit("Usage: python test_infer.py image1.jpg [image2.jpg ...]")
    images = []
    for path in paths:
        with open(path, "rb") as handle:
            images.append(base64.b64encode(handle.read()).decode("ascii"))

    done = subprocess.run(
        [sys.executable, os.path.join(HERE, "infer.py")],
        input=json.dumps({"images": images}),
        capture_output=True,
        text=True,
    )
    lines = done.stdout.strip().splitlines()
    if not lines:
        sys.exit(f"infer.py printed nothing.\n{done.stderr[-800:]}")
    result = json.loads(lines[-1])
    if "error" in result:
        sys.exit(f"infer.py error: {result['error']}")

    prediction, confidence = result["prediction"], result["confidence"]
    if confidence < THRESHOLD:
        status = "PENDING (sent to the farmer for review)"
    elif prediction == "DURIAN":
        status = "VERIFIED (durian confirmed, farmer gets an alert)"
    else:
        status = "REJECTED (false trigger, no alert)"
    print(f"Images scored : {result['images']} of {len(paths)}")
    print(f"Prediction    : {prediction}")
    print(f"Confidence    : {confidence}%")
    print(f"Threshold     : {THRESHOLD}%")
    print(f"Backend status: {status}")


if __name__ == "__main__":
    main()