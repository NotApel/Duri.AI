import os
import shutil
import tensorflow as tf
from supabase import create_client, Client

print("Starting Cloud-Based Self-Learning Retraining Pipeline on Render...")

# ============================================================
# 1. SUPABASE CONFIGURATION & DATASET DOWNLOAD
# ============================================================
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# Direktori sementara di server Render untuk proses training
LOCAL_DATASET_DIR = "/tmp/dataset"
LOCAL_DURIAN_DIR = os.path.join(LOCAL_DATASET_DIR, "durian")
LOCAL_NOT_DURIAN_DIR = os.path.join(LOCAL_DATASET_DIR, "not_durian")

os.makedirs(LOCAL_DURIAN_DIR, exist_ok=True)
os.makedirs(LOCAL_NOT_DURIAN_DIR, exist_ok=True)

def download_folder_from_supabase(bucket_name, remote_folder, local_folder):
    print(f"Downloading {remote_folder} from Supabase Storage...")
    try:
        files = supabase.storage.from_(bucket_name).list(remote_folder)
        for file in files:
            file_name = file['name']
            if file_name.endswith(('.jpg', '.jpeg', '.png')):
                file_path = f"{remote_folder}/{file_name}"
                res = supabase.storage.from_(bucket_name).download(file_path)
                
                local_file_path = os.path.join(local_folder, file_name)
                with open(local_file_path, 'wb') as f:
                    f.write(res)
        print(f"Successfully downloaded {remote_folder}.")
    except Exception as e:
        print(f"Error downloading {remote_folder}: {e}")

# Muat turun dataset dari Supabase Storage ke Render
download_folder_from_supabase("durian-dataset", "durian", LOCAL_DURIAN_DIR)
download_folder_from_supabase("durian-dataset", "not-durian", LOCAL_NOT_DURIAN_DIR)

# ============================================================
# 2. RETRAIN THE MODEL (OPTIMIZED FOR RENDER FREE TIER)
# ============================================================
print("\nRetraining the Model with cloud dataset...")
IMG_SIZE = (128, 128)  # Diturunkan ke 128x128 untuk jimat RAM
BATCH_SIZE = 8 
EPOCHS = 1

train_ds = tf.keras.utils.image_dataset_from_directory(
    LOCAL_DATASET_DIR, 
    validation_split=0.2,
    subset="training",
    seed=123,
    image_size=IMG_SIZE,
    batch_size=BATCH_SIZE
)

val_ds = tf.keras.utils.image_dataset_from_directory(
    LOCAL_DATASET_DIR,
    validation_split=0.2,
    subset="validation",
    seed=123,
    image_size=IMG_SIZE,
    batch_size=BATCH_SIZE
)

# Pengoptimuman memori: Prefetch & Cache supaya RAM tidak cepat penuh
AUTOTUNE = tf.data.AUTOTUNE
train_ds = train_ds.cache().prefetch(buffer_size=AUTOTUNE)
val_ds = val_ds.cache().prefetch(buffer_size=AUTOTUNE)

print("Building model...")
base_model = tf.keras.applications.MobileNetV2(
    input_shape=(128, 128, 3), # Selaraskan saiz input dengan IMG_SIZE
    include_top=False,
    weights='imagenet'
)
base_model.trainable = False

model = tf.keras.Sequential([
    tf.keras.layers.Rescaling(1./127.5, offset=-1),
    base_model,
    tf.keras.layers.GlobalAveragePooling2D(),
    tf.keras.layers.Dropout(0.2),
    tf.keras.layers.Dense(1, activation='sigmoid')
])

model.compile(
    optimizer=tf.keras.optimizers.Adam(learning_rate=0.0001),
    loss='binary_crossentropy',
    metrics=['accuracy']
)

print("Training...")
history = model.fit(train_ds, validation_data=val_ds, epochs=EPOCHS)

final_accuracy = history.history['val_accuracy'][-1] * 100
print(f"Final Real Validation Accuracy: {final_accuracy:.2f}%")

with open("/tmp/accuracy.txt", "w") as f:
    f.write(str(round(final_accuracy, 2)))

# ============================================================
# 3. EXPORT & UPLOAD THE NEW TFLITE MODEL TO SUPABASE
# ============================================================
print("\nExporting new TFLite model...")
converter = tf.lite.TFLiteConverter.from_keras_model(model)
converter.optimizations = [tf.lite.Optimize.DEFAULT]
tflite_model = converter.convert()

local_model_path = "/tmp/model_updated.tflite"
with open(local_model_path, 'wb') as f:
    f.write(tflite_model)

try:
    with open(local_model_path, 'rb') as f:
        supabase.storage.from_("durian-dataset").upload(
            path="model_updated.tflite",
            file=f,
            file_options={"upsert": "true"}
        )
    print("New model successfully uploaded to Supabase Storage!")
except Exception as e:
    print(f"Failed to upload model to Supabase: {e}")

print("Cloud self-learning complete!")