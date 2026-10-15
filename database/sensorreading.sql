CREATE TABLE SENSOR_READING (
    reading_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    node_id BIGINT NOT NULL,
    amplitude DECIMAL(5,2) NOT NULL,
    frequency DECIMAL(5,2) NOT NULL,
    duration DECIMAL(5,2),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_sensor_node_sensor_reading
        FOREIGN KEY (node_id)
        REFERENCES SENSOR_NODE(node_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);