import numpy as np
from ai_edge_litert.interpreter import Interpreter
from PIL import Image
import os

# ==== LOAD MODEL ====
model_path = "model.tflite"
if not os.path.exists(model_path):
    print(f"Error: {model_path} not found.")
    exit()

interpreter = Interpreter(model_path=model_path)
interpreter.allocate_tensors()

input_details = interpreter.get_input_details()
output_details = interpreter.get_output_details()

# ==== LOAD LABELS ====
with open('labels.txt', 'r') as f:
    labels = [line.strip() for line in f.readlines()]

print(f"Labels: {labels}\n")

def predict(img_path):
    # 1. Open and resize
    img = Image.open(img_path).convert('RGB').resize((224, 224))
    
    # 2. Convert to numpy array (NO scaling! The model handles it)
    img_array = np.array(img, dtype=np.float32)
    
    # 3. Add batch dimension
    img_array = np.expand_dims(img_array, axis=0)

    # 4. Run inference
    interpreter.set_tensor(input_details[0]['index'], img_array)
    interpreter.invoke()
    output = interpreter.get_tensor(output_details[0]['index'])
    
    return output[0][0]  # raw sigmoid score

def find_images(folder, n=5):
    """Find first n images in folder (recursive)"""
    result = []
    for root, dirs, files in os.walk(folder):
        for f in files:
            if f.lower().endswith(('.jpg', '.jpeg', '.png')):
                result.append(os.path.join(root, f))
                if len(result) >= n:
                    return result
    return result

# ==== TEST DURIAN ====
print("=" * 60)
print("TESTING DURIAN IMAGES")
print("=" * 60)
for img_path in find_images("dataset/durian", 5):
    score = predict(img_path)
    # If score > 0.5, it's not_durian (class 1). If < 0.5, it's durian (class 0)
    label = labels[1] if score > 0.5 else labels[0]
    print(f"Score: {score:.4f} → {label:12s} | {os.path.basename(img_path)}")

print()

# ==== TEST NOT_DURIAN ====
print("=" * 60)
print("TESTING NOT_DURIAN IMAGES")
print("=" * 60)
for img_path in find_images("dataset/not_durian", 5):
    score = predict(img_path)
    label = labels[1] if score > 0.5 else labels[0]
    print(f"Score: {score:.4f} → {label:12s} | {os.path.basename(img_path)}")