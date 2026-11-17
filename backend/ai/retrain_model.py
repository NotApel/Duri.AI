import os
import glob
import shutil
import tensorflow as tf

print("Starting Self-Learning Retraining Pipeline...")

# ============================================================
# 1. STORAGE MANAGEMENT (SLIDING WINDOW)
# ============================================================
def apply_sliding_window(folder_path, max_images):
    if not os.path.exists(folder_path):
        return
    images = [os.path.join(folder_path, f) for f in os.listdir(folder_path) 
              if f.endswith(('.jpg', '.jpeg', '.png'))]
    if len(images) > max_images:
        images.sort(key=os.path.getmtime)
        num_to_delete = len(images) - max_images
        print(f"⚠️ Storage limit reached in {os.path.basename(folder_path)}. Pruning {num_to_delete} oldest images...")
        for i in range(num_to_delete):
            os.remove(images[i])
            print(f"🗑️ Deleted old image: {os.path.basename(images[i])}")

# ============================================================
# 2. MOVE NEW FEEDBACK IMAGES
# ============================================================
# KITA TUKAR PATH NI IKUT LAPTOP KAU
feedback_dir = r"C:\durian proposal\Duri.AI-fresh\backend\feedback_images" 
dataset_dir = r"C:\durian proposal\DuriAI_TFLite\dataset\not_durian"

if os.path.exists(feedback_dir):
    new_images = [f for f in os.listdir(feedback_dir) if f.endswith('.jpg') or f.endswith('.png')]
    if len(new_images) > 0:
        for img in new_images:
            shutil.move(os.path.join(feedback_dir, img), os.path.join(dataset_dir, img))
            print(f"Moved {img} to training dataset.")
    else:
        print("No new feedback images to process.")
else:
    print("Feedback folder not found.")

# ============================================================
# 3. APPLY STORAGE LIMITS
# ============================================================
print("\nChecking dataset storage limits...")
apply_sliding_window(r"C:\durian proposal\DuriAI_TFLite\dataset\not_durian", max_images=5000)
apply_sliding_window(r"C:\durian proposal\DuriAI_TFLite\dataset\durian", max_images=3000)
print("Storage check complete. Proceeding to training.")

# ============================================================
# 4. RETRAIN THE MODEL
# ============================================================
print("\nRetraining the Model with the new data...")
IMG_SIZE = (224, 224)
BATCH_SIZE = 64 
EPOCHS = 2

# PERHATIKAN: Ada koma (,) selepas dataset
train_ds = tf.keras.utils.image_dataset_from_directory(
    r"C:\durian proposal\DuriAI_TFLite\dataset", 
    validation_split=0.2,
    subset="training",
    seed=123,
    image_size=IMG_SIZE,
    batch_size=BATCH_SIZE
)

val_ds = tf.keras.utils.image_dataset_from_directory(
    r"C:\durian proposal\DuriAI_TFLite\dataset",
    validation_split=0.2,
    subset="validation",
    seed=123,
    image_size=IMG_SIZE,
    batch_size=BATCH_SIZE
)

print("Building model...")
base_model = tf.keras.applications.MobileNetV2(
    input_shape=(224, 224, 3),
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

# ============================================================
# NEW: EXTRACT REAL ACCURACY AND SAVE TO FILE
# ============================================================
final_accuracy = history.history['val_accuracy'][-1] * 100

# TUKAR PATH ACCURACY KE LAPTOP KAU
with open(r"C:\durian proposal\DuriAI_TFLite\accuracy.txt", "w") as f:
    f.write(str(round(final_accuracy, 2)))

print(f"Final Real Validation Accuracy: {final_accuracy:.2f}%")

# ============================================================
# 5. EXPORT THE NEW TFLITE MODEL
# ============================================================
print("\nExporting new TFLite model...")
converter = tf.lite.TFLiteConverter.from_keras_model(model)
converter.optimizations = [tf.lite.Optimize.DEFAULT]
tflite_model = converter.convert()

# Simpan model dalam folder projek kau
with open(r"C:\durian proposal\DuriAI_TFLite\model_updated.tflite", 'wb') as f:
    f.write(tflite_model)

print("Self-learning complete! New model saved as 'model_updated.tflite'")