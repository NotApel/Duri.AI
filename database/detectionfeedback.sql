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
        REFERENCES DETECTION(detection_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_feedback_farmer
        FOREIGN KEY (farmer_id)
        REFERENCES FARMER(farmer_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_feedback_category
        FOREIGN KEY (category_id)
        REFERENCES FEEDBACK_CATEGORY(category_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);