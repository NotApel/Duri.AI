import os
import shutil
import datetime
import tensorflow as tf
from supabase import create_client, Client

print("🚀 Memulakan retrain AI di GitHub Actions...")

# ============================================================
# 1. SETUP SUPABASE & UPDATE FUNCTIONS
# ============================================================
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
ROW_ID = 1

LOCAL_DATASET_DIR = "/tmp/dataset"
LOCAL_DURIAN_DIR = os.path.join(LOCAL_DATASET_DIR, "durian")
LOCAL_NOT_DURIAN_DIR = os.path.join(LOCAL_DATASET_DIR, "not_durian")

# Fungsi untuk update progress kat website React
def update_db(status, message, progress=0, model_url=None, accuracy=None):
    data = {
        "status": status, 
        "message": message, 
        "progress": progress,
        "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }
    if model_url: data["model_url"] = model_url
    if accuracy is not None: 
        data["accuracy"] = float(accuracy)
        data["last_retrained"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    
    supabase.table("ai_status").update(data).eq("id", ROW_ID).execute()

def download_folder_from_supabase(bucket_name, remote_folder, local_folder):
    os.makedirs(local_folder, exist_ok=True)
    print(f"Downloading {remote_folder}...")
    try:
        files = supabase.storage.from_(bucket_name).list(remote_folder)
        for file in files:
            file_name = file['name']
            if file_name.endswith(('.jpg', '.jpeg', '.png')):
                file_path = f"{remote_folder}/{file_name}"
                res = supabase.storage.from_(bucket_name).download(file_path)
                with open(os.path.join(local_folder, file_name), 'wb') as f:
                    f.write(res)
        print(f"Successfully downloaded {remote_folder}.")
    except Exception as e:
        print(f"Error downloading: {e}")

# ============================================================
# 2. MULA PROSES
# ============================================================
try:
    update_db("training", "Memuat turun dataset...", 5)
    
    if os.path.exists(LOCAL_DATASET_DIR): shutil.rmtree(LOCAL_DATASET_DIR)
    download_folder_from_supabase("durian-dataset", "durian", LOCAL_DURIAN_DIR)
    download_folder_from_supabase("durian-dataset", "not-durian", LOCAL_NOT_DURIAN_DIR)
    
    update_db("training", "Mula training AI...", 20)
    
    IMG_SIZE = (128, 128) 
    BATCH_SIZE = 8 
    EPOCHS = 1

    train_ds = tf.keras.utils.image_dataset_from_directory(
        LOCAL_DATASET_DIR, validation_split=0.2, subset="training",
        seed=123, image_size=IMG_SIZE, batch_size=BATCH_SIZE
    )
    val_ds = tf.keras.utils.image_dataset_from_directory(
        LOCAL_DATASET_DIR, validation_split=0.2, subset="validation",
        seed=123, image_size=IMG_SIZE, batch_size=BATCH_SIZE
    )

    AUTOTUNE = tf.data.AUTOTUNE
    train_ds = train_ds.cache().prefetch(buffer_size=AUTOTUNE)
    val_ds = val_ds.cache().prefetch(buffer_size=AUTOTUNE)

    base_model = tf.keras.applications.MobileNetV2(
        input_shape=(128, 128, 3), include_top=False, weights='imagenet'
    )
    base_model.trainable = False

    model = tf.keras.Sequential([
        tf.keras.layers.Rescaling(1./127.5, offset=-1),
        base_model,
        tf.keras.layers.GlobalAveragePooling2D(),
        tf.keras.layers.Dropout(0.2),
        tf.keras.layers.Dense(1, activation='sigmoid')
    ])

    model.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=0.0001),
                  loss='binary_crossentropy', metrics=['accuracy'])

    update_db("training", "Tengah train model...", 50)
    history = model.fit(train_ds, validation_data=val_ds, epochs=EPOCHS)
    
    final_accuracy = history.history['val_accuracy'][-1] * 100
    print(f"Final Accuracy: {final_accuracy:.2f}%")
    update_db("training", f"Siap train ({final_accuracy:.2f}%). Export TFLite...", 80)

    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    converter.optimizations = [tf.lite.Optimize.DEFAULT]
    tflite_model = converter.convert()

    local_model_path = "/tmp/model_updated.tflite"
    with open(local_model_path, 'wb') as f:
        f.write(tflite_model)

    with open(local_model_path, 'rb') as f:
        supabase.storage.from_("durian-dataset").upload(
            path="model_updated.tflite", file=f, file_options={"upsert": "true"}
        )
    
    model_url = supabase.storage.from_("durian-dataset").get_public_url("model_updated.tflite")
    update_db("completed", "Model baru berjaya diupdate!", 100, model_url, final_accuracy)
    print("✅ Selesai!")

except Exception as e:
    print(f"❌ Error: {e}")
    update_db("failed", f"Error: {str(e)}", 0)
    exit(1) # Bagi tahu GitHub Actions yang proses ni gagal