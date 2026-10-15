CREATE TABLE TRAINING_QUEUE (
    queue_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    feedback_id BIGINT NOT NULL,
    queue_status VARCHAR(30)
        CHECK (queue_status IN ('PENDING', 'PROCESSING', 'COMPLETED'))
        NOT NULL,
    queue_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,

    CONSTRAINT fk_detection_feedback_training_queue
        FOREIGN KEY (feedback_id)
        REFERENCES DETECTION_FEEDBACK(feedback_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);