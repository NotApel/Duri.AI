CREATE TABLE DETECTION_IMAGE (
    image_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    detection_id BIGINT NOT NULL,
    image_path TEXT NOT NULL,
    sequence_number SMALLINT
        CHECK (sequence_number BETWEEN 1 AND 5)
        NOT NULL,
    is_selected BOOLEAN NOT NULL DEFAULT FALSE,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_detection_detection_image
        FOREIGN KEY (detection_id)
        REFERENCES DETECTION(detection_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);