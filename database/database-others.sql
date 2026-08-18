CREATE TABLE SENSOR_NODE (
node_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
plot_id BIGINT NOT NULL,
node_name VARCHAR(50) UNIQUE NOT NULL,
status VARCHAR(20) CHECK(status IN ('ONLINE','OFFLINE')) NOT NULL DEFAULT 'OFFLINE',
battery_level SMALLINT CHECK (battery_level BETWEEN 0 AND 100),
firmware_version VARCHAR(20),
last_ping_at TIMESTAMPTZ,
installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

CONSTRAINT fk_farm_plot_sensor_node
        FOREIGN KEY (plot_id)
        REFERENCES farm_plot(plot_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE TABLE SENSOR_READING (
reading_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
node_id BIGINT NOT NULL,
amplitude DECIMAL(5,2) NOT NULL,
frequency DECIMAL(5,2) NOT NULL,
duration DECIMAL(5,2),
recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

CONSTRAINT fk_sensor_node_sensor_reading
        FOREIGN KEY (node_id)
        REFERENCES sensor_node(node_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE TABLE DETECTION (
detection_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
reading_id BIGINT NOT NULL,
prediction VARCHAR(30) CHECK (prediction IN ('DURIAN','NOT_DURIAN')) NOT NULL,
confidence DECIMAL(5,2) CHECK (confidence BETWEEN 0 AND 100) NOT NULL,
verify_required BOOLEAN NOT NULL DEFAULT FALSE,
detection_status VARCHAR(20) CHECK (detection_status IN ('PENDING','VERIFIED','REJECTED'))
NOT NULL DEFAULT 'PENDING',
detection_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

CONSTRAINT fk_sensor_reading_detection
        FOREIGN KEY (reading_id)
        REFERENCES sensor_reading(reading_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE TABLE DETECTION_IMAGE (
image_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
detection_id BIGINT NOT NULL,
image_path TEXT NOT NULL,
sequence_number SMALLINT CHECK (sequence_number BETWEEN 1 AND 5) NOT NULL,
is_selected BOOLEAN NOT NULL DEFAULT FALSE ,
captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

CONSTRAINT fk_detection_detection_image
        FOREIGN KEY (detection_id)
        REFERENCES detection(detection_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE TABLE FEEDBACK_CATEGORY (
category_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
category_name VARCHAR(100) UNIQUE NOT NULL,
description TEXT NOT NULL

);

CREATE TABLE DETECTION_FEEDBACK (
feedback_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
detection_id BIGINT NOT NULL,
farmer_id BIGINT NOT NULL,
category_id BIGINT,
correct_detection BOOLEAN NOT NULL,
comment_farmer TEXT,
feedback_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

CONSTRAINT fk_feedback_detection
		FOREIGN KEY (detection_id)
		REFERENCES detection(detection_id)
		ON UPDATE CASCADE
		ON DELETE RESTRICT,

CONSTRAINT fk_feedback_farmer
		FOREIGN KEY (farmer_id)
		REFERENCES farmer(farmer_id)
		ON UPDATE CASCADE
		ON DELETE RESTRICT,

CONSTRAINT fk_feedback_category
		FOREIGN KEY (category_id)
		REFERENCES feedback_category(category_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE TABLE TRAINING_QUEUE (
queue_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
feedback_id BIGINT NOT NULL,
queue_status VARCHAR(30) CHECK (queue_status IN ('PENDING','PROCESSING','COMPLETED')) NOT NULL,
queue_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
processed_at TIMESTAMPTZ,

CONSTRAINT fk_detection_feedback_training_queue
        FOREIGN KEY (feedback_id)
        REFERENCES detection_feedback(feedback_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE TABLE NOTIFICATION (
notification_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
detection_id BIGINT NOT NULL,
farmer_id BIGINT NOT NULL,
title VARCHAR(100) NOT NULL,
message_noti TEXT,
is_read BOOLEAN NOT NULL DEFAULT FALSE ,
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

CONSTRAINT fk_notification_farmer
		FOREIGN KEY (farmer_id)
		REFERENCES farmer(farmer_id)
		ON UPDATE CASCADE
		ON DELETE RESTRICT,

CONSTRAINT fk_notification_detection
		FOREIGN KEY (detection_id)
		REFERENCES detection(detection_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);