CREATE TABLE DETECTION (
    detection_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    reading_id BIGINT NOT NULL,
    prediction VARCHAR(30)
        CHECK (prediction IN ('DURIAN', 'NOT_DURIAN'))
        NOT NULL,
    confidence DECIMAL(5,2)
        CHECK (confidence BETWEEN 0 AND 100)
        NOT NULL,
    verify_required BOOLEAN NOT NULL DEFAULT FALSE,
    detection_status VARCHAR(20)
        CHECK (detection_status IN ('PENDING', 'VERIFIED', 'REJECTED'))
        NOT NULL DEFAULT 'PENDING',
    detection_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_sensor_reading_detection
        FOREIGN KEY (reading_id)
        REFERENCES SENSOR_READING(reading_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);