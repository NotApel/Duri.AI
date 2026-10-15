BEGIN;

-- =========================================
-- 1. FARMER
-- =========================================

INSERT INTO farmer
(full_name, username, email, password_hash, phone_number)
VALUES
(
    'Nur Syuhada Binti Rizal',
    'syuhada',
    'leehyunsang3112@gmail.com',
    '$2a$10$hashedpassword123',
    '01157795010'
);


-- =========================================
-- 2. FARM_PLOT
-- =========================================

INSERT INTO farm_plot
(farmer_id, farm_name, plot_name, plot_size, latitude, longitude)
SELECT
    farmer_id,
    'Melaka Durian Farm',
    'Area A',
    25.00,
    2.206500,
    102.250100
FROM farmer
WHERE username = 'syuhada';

INSERT INTO farm_plot
(farmer_id, farm_name, plot_name, plot_size, latitude, longitude)
SELECT
    farmer_id,
    'Melaka Durian Farm',
    'Area B',
    18.50,
    2.207100,
    102.251800
FROM farmer
WHERE username = 'syuhada';


-- =========================================
-- 3. SENSOR_NODE
-- =========================================

INSERT INTO sensor_node
(plot_id, node_name, status, battery_level, firmware_version, last_ping_at)
SELECT
    plot_id,
    'NODE-01',
    'ONLINE',
    100,
    'v1.0.0',
    NOW()
FROM farm_plot
WHERE plot_name = 'Area A';

INSERT INTO sensor_node
(plot_id, node_name, status, battery_level, firmware_version, last_ping_at)
SELECT
    plot_id,
    'NODE-02',
    'ONLINE',
    96,
    'v1.0.0',
    NOW()
FROM farm_plot
WHERE plot_name = 'Area A';

INSERT INTO sensor_node
(plot_id, node_name, status, battery_level, firmware_version, last_ping_at)
SELECT
    plot_id,
    'NODE-03',
    'ONLINE',
    89,
    'v1.0.0',
    NOW()
FROM farm_plot
WHERE plot_name = 'Area A';

INSERT INTO sensor_node
(plot_id, node_name, status, battery_level, firmware_version, last_ping_at)
SELECT
    plot_id,
    'NODE-04',
    'OFFLINE',
    25,
    'v1.0.0',
    NULL
FROM farm_plot
WHERE plot_name = 'Area B';

INSERT INTO sensor_node
(plot_id, node_name, status, battery_level, firmware_version, last_ping_at)
SELECT
    plot_id,
    'NODE-05',
    'ONLINE',
    92,
    'v1.0.0',
    NOW()
FROM farm_plot
WHERE plot_name = 'Area B';


-- =========================================
-- 4. SENSOR_READING
-- =========================================

INSERT INTO sensor_reading
(node_id, amplitude, frequency, duration)
SELECT node_id, 0.81, 18.00, 0.72
FROM sensor_node
WHERE node_name = 'NODE-01';

INSERT INTO sensor_reading
(node_id, amplitude, frequency, duration)
SELECT node_id, 0.82, 14.00, 1.00
FROM sensor_node
WHERE node_name = 'NODE-02';

INSERT INTO sensor_reading
(node_id, amplitude, frequency, duration)
SELECT node_id, 0.85, 14.00, 2.00
FROM sensor_node
WHERE node_name = 'NODE-03';

INSERT INTO sensor_reading
(node_id, amplitude, frequency, duration)
SELECT node_id, 1.00, 15.00, 0.52
FROM sensor_node
WHERE node_name = 'NODE-04';

INSERT INTO sensor_reading
(node_id, amplitude, frequency, duration)
SELECT node_id, 0.50, 17.00, 1.20
FROM sensor_node
WHERE node_name = 'NODE-05';


-- =========================================
-- 5. DETECTION
-- =========================================

INSERT INTO detection
(reading_id, prediction, confidence, verify_required, detection_status)
SELECT
    reading_id,
    'DURIAN',
    98.50,
    FALSE,
    'VERIFIED'
FROM sensor_reading sr
JOIN sensor_node sn ON sr.node_id = sn.node_id
WHERE sn.node_name = 'NODE-01';

INSERT INTO detection
(reading_id, prediction, confidence, verify_required, detection_status)
SELECT
    reading_id,
    'NOT_DURIAN',
    45.00,
    TRUE,
    'REJECTED'
FROM sensor_reading sr
JOIN sensor_node sn ON sr.node_id = sn.node_id
WHERE sn.node_name = 'NODE-02';

INSERT INTO detection
(reading_id, prediction, confidence, verify_required, detection_status)
SELECT
    reading_id,
    'DURIAN',
    99.10,
    FALSE,
    'VERIFIED'
FROM sensor_reading sr
JOIN sensor_node sn ON sr.node_id = sn.node_id
WHERE sn.node_name = 'NODE-03';

INSERT INTO detection
(reading_id, prediction, confidence, verify_required, detection_status)
SELECT
    reading_id,
    'DURIAN',
    95.20,
    TRUE,
    'PENDING'
FROM sensor_reading sr
JOIN sensor_node sn ON sr.node_id = sn.node_id
WHERE sn.node_name = 'NODE-04';

INSERT INTO detection
(reading_id, prediction, confidence, verify_required, detection_status)
SELECT
    reading_id,
    'DURIAN',
    93.00,
    FALSE,
    'VERIFIED'
FROM sensor_reading sr
JOIN sensor_node sn ON sr.node_id = sn.node_id
WHERE sn.node_name = 'NODE-05';


-- =========================================
-- 6. DETECTION_IMAGE
-- =========================================

INSERT INTO detection_image
(detection_id, image_path, sequence_number, is_selected)
SELECT
    detection_id,
    '/images/d1_img1.jpg',
    1,
    TRUE
FROM detection d
JOIN sensor_reading sr ON d.reading_id = sr.reading_id
JOIN sensor_node sn ON sr.node_id = sn.node_id
WHERE sn.node_name = 'NODE-01';

INSERT INTO detection_image
(detection_id, image_path, sequence_number, is_selected)
SELECT
    detection_id,
    '/images/d1_img2.jpg',
    2,
    FALSE
FROM detection d
JOIN sensor_reading sr ON d.reading_id = sr.reading_id
JOIN sensor_node sn ON sr.node_id = sn.node_id
WHERE sn.node_name = 'NODE-01';

INSERT INTO detection_image
(detection_id, image_path, sequence_number, is_selected)
SELECT
    detection_id,
    '/images/d2_img1.jpg',
    1,
    TRUE
FROM detection d
JOIN sensor_reading sr ON d.reading_id = sr.reading_id
JOIN sensor_node sn ON sr.node_id = sn.node_id
WHERE sn.node_name = 'NODE-02';

INSERT INTO detection_image
(detection_id, image_path, sequence_number, is_selected)
SELECT
    detection_id,
    '/images/d3_img1.jpg',
    1,
    TRUE
FROM detection d
JOIN sensor_reading sr ON d.reading_id = sr.reading_id
JOIN sensor_node sn ON sr.node_id = sn.node_id
WHERE sn.node_name = 'NODE-03';

INSERT INTO detection_image
(detection_id, image_path, sequence_number, is_selected)
SELECT
    detection_id,
    '/images/d4_img1.jpg',
    1,
    TRUE
FROM detection d
JOIN sensor_reading sr ON d.reading_id = sr.reading_id
JOIN sensor_node sn ON sr.node_id = sn.node_id
WHERE sn.node_name = 'NODE-04';

INSERT INTO detection_image
(detection_id, image_path, sequence_number, is_selected)
SELECT
    detection_id,
    '/images/d5_img1.jpg',
    1,
    TRUE
FROM detection d
JOIN sensor_reading sr ON d.reading_id = sr.reading_id
JOIN sensor_node sn ON sr.node_id = sn.node_id
WHERE sn.node_name = 'NODE-05';


-- =========================================
-- 7. FEEDBACK_CATEGORY
-- =========================================

INSERT INTO feedback_category
(category_name, description)
VALUES
('Wind', 'strong wind'),
('Animal', 'monkey jump'),
('Human Activity', 'people'),
('Other', 'other causes');


-- =========================================
-- 8. DETECTION_FEEDBACK
-- =========================================

INSERT INTO detection_feedback
(detection_id, farmer_id, category_id, correct_detection, comment_farmer)
SELECT
    d.detection_id,
    f.farmer_id,
    fc.category_id,
    FALSE,
    'monkey, not durian'
FROM detection d
JOIN sensor_reading sr ON d.reading_id = sr.reading_id
JOIN sensor_node sn ON sr.node_id = sn.node_id
JOIN farmer f ON f.username = 'syuhada'
JOIN feedback_category fc ON fc.category_name = 'Animal'
WHERE sn.node_name = 'NODE-02';

INSERT INTO detection_feedback
(detection_id, farmer_id, category_id, correct_detection, comment_farmer)
SELECT
    d.detection_id,
    f.farmer_id,
    NULL,
    TRUE,
    'indeed durian'
FROM detection d
JOIN sensor_reading sr ON d.reading_id = sr.reading_id
JOIN sensor_node sn ON sr.node_id = sn.node_id
JOIN farmer f ON f.username = 'syuhada'
WHERE sn.node_name = 'NODE-04';


-- =========================================
-- 9. TRAINING_QUEUE
-- =========================================

INSERT INTO training_queue
(feedback_id, queue_status)
SELECT
    feedback_id,
    'PENDING'
FROM detection_feedback
WHERE comment_farmer = 'monkey, not durian';


-- =========================================
-- 10. NOTIFICATION
-- =========================================

INSERT INTO notification
(detection_id, farmer_id, title, message_noti, is_read)
SELECT
    d.detection_id,
    f.farmer_id,
    'Durian Detected',
    'A durian fall event has been detected at Area A.',
    TRUE
FROM detection d
JOIN sensor_reading sr ON d.reading_id = sr.reading_id
JOIN sensor_node sn ON sr.node_id = sn.node_id
JOIN farmer f ON f.username = 'syuhada'
WHERE sn.node_name = 'NODE-01';

INSERT INTO notification
(detection_id, farmer_id, title, message_noti, is_read)
SELECT
    d.detection_id,
    f.farmer_id,
    'False Detection',
    'A non-durian event requires verification.',
    TRUE
FROM detection d
JOIN sensor_reading sr ON d.reading_id = sr.reading_id
JOIN sensor_node sn ON sr.node_id = sn.node_id
JOIN farmer f ON f.username = 'syuhada'
WHERE sn.node_name = 'NODE-02';

INSERT INTO notification
(detection_id, farmer_id, title, message_noti, is_read)
SELECT
    d.detection_id,
    f.farmer_id,
    'Durian Detected',
    'A durian fall event has been detected at Area A.',
    FALSE
FROM detection d
JOIN sensor_reading sr ON d.reading_id = sr.reading_id
JOIN sensor_node sn ON sr.node_id = sn.node_id
JOIN farmer f ON f.username = 'syuhada'
WHERE sn.node_name = 'NODE-03';

INSERT INTO notification
(detection_id, farmer_id, title, message_noti, is_read)
SELECT
    d.detection_id,
    f.farmer_id,
    'Verification Required',
    'Please verify the latest detection.',
    FALSE
FROM detection d
JOIN sensor_reading sr ON d.reading_id = sr.reading_id
JOIN sensor_node sn ON sr.node_id = sn.node_id
JOIN farmer f ON f.username = 'syuhada'
WHERE sn.node_name = 'NODE-04';

INSERT INTO notification
(detection_id, farmer_id, title, message_noti, is_read)
SELECT
    d.detection_id,
    f.farmer_id,
    'Durian Detected',
    'A durian fall event has been detected at Area B.',
    FALSE
FROM detection d
JOIN sensor_reading sr ON d.reading_id = sr.reading_id
JOIN sensor_node sn ON sr.node_id = sn.node_id
JOIN farmer f ON f.username = 'syuhada'
WHERE sn.node_name = 'NODE-05';


COMMIT;