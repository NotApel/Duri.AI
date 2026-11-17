import os
import requests
import numpy as np
import tensorflow as tf
from PIL import Image
from io import BytesIO
from supabase import create_client, Client

# ============================================================
# 1. SETUP SUPABASE & TFLITE MODEL
# ============================================================
SUPABASE_URL = "https://hlbnjwcosgxpigecivxd.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhsYm5qd2Nvc2d4cGlnZWNpdnhkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MzAwMDY5MSwiZXhwIjoyMTA4NTc2NjkxfQ.KG7XmQdxlroMB4-fnoZlBwWPMeF9XXFwm0rQ29P2CqI"

MODEL_PATH = "model_updated.tflite"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

print("[AI PIPELINE] Loading TFLite Model...")
interpreter = tf.lite.Interpreter(model_path=MODEL_PATH)
interpreter.allocate_tensors()
input_details = interpreter.get_input_details()
output_details = interpreter.get_output_details()

# ============================================================
# 2. FUNGSI UNTUK RUN AI PADA GAMBAR
# ============================================================
def predict_image(image_url):
    try:
        response = requests.get(image_url)
        img = Image.open(BytesIO(response.content)).convert('RGB')
        img = img.resize((224, 224))
        img_array = np.array(img, dtype=np.float32)
        img_array = (img_array / 127.5) - 1.0 
        img_array = np.expand_dims(img_array, axis=0)

        interpreter.set_tensor(input_details[0]['index'], img_array)
        interpreter.invoke()
        output_data = interpreter.get_tensor(output_details[0]['index'])
        
        score = float(output_data[0][0])
        
        if score > 0.5:
            return "False Trigger", (score * 100)
        else:
            return "Durian Fall", ((1.0 - score) * 100)
            
    except Exception as e:
        print(f"Error processing image {image_url}: {e}")
        return "Error", 0.0

# ============================================================
# 3. MAIN PIPELINE
# ============================================================
def process_pending_detections():
    print("[AI PIPELINE] Checking for pending detections in Supabase...")
    
    response = supabase.table('detection').select('*').eq('prediction', 'Pending AI').execute()
    records = response.data

    if not records:
        print("[AI PIPELINE] No pending detections found.")
        return

    for record in records:
        # FIXED: Using 'id' instead of 'detection_id'
        event_id = record['id'] 
        image_urls = record.get('image_urls', []) 
        
        if not image_urls:
            print(f"[AI PIPELINE] Event #{event_id} has no images. Skipping.")
            continue
            
        print(f"[AI PIPELINE] Processing Event #{event_id} with {len(image_urls)} burst images...")

        results = []
        for url in image_urls:
            label, conf = predict_image(url)
            results.append((label, conf))
        
        durian_votes = sum(1 for r in results if r[0] == "Durian Fall")
        false_votes = sum(1 for r in results if r[0] == "False Trigger")
        
        if durian_votes > false_votes:
            final_prediction = "DURIAN"
            final_confidence = sum(r[1] for r in results if r[0] == "Durian Fall") / durian_votes
            final_status = "VERIFIED"
        else:
            final_prediction = "NOT_DURIAN"
            final_confidence = sum(r[1] for r in results if r[0] == "False Trigger") / false_votes
            final_status = "REJECTED"

        update_data = {
            "prediction": final_prediction,
            "confidence": round(final_confidence, 2),
            "detection_status": final_status,
            "verify_required": False
        }

        # FIXED: Using 'id' instead of 'detection_id'
        supabase.table('detection').update(update_data).eq('id', event_id).execute()
        print(f"[AI PIPELINE] Event #{event_id} -> {final_prediction} ({round(final_confidence, 2)}%)")

if __name__ == "__main__":
    process_pending_detections()