CREATE TABLE NOTIFICATION (
    notification_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    detection_id BIGINT NOT NULL,
    farmer_id BIGINT NOT NULL,
    title VARCHAR(100) NOT NULL,
    message_noti TEXT,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_notification_farmer
        FOREIGN KEY (farmer_id)
        REFERENCES FARMER(farmer_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_notification_detection
        FOREIGN KEY (detection_id)
        REFERENCES DETECTION(detection_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);