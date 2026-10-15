CREATE TABLE SENSOR_NODE (
    node_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    plot_id BIGINT NOT NULL,
    node_name VARCHAR(50) UNIQUE NOT NULL,
    status VARCHAR(20)
        CHECK (status IN ('ONLINE', 'OFFLINE'))
        NOT NULL DEFAULT 'OFFLINE',
    battery_level SMALLINT
        CHECK (battery_level BETWEEN 0 AND 100),
    firmware_version VARCHAR(20),
    last_ping_at TIMESTAMPTZ,
    installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_farm_plot_sensor_node
        FOREIGN KEY (plot_id)
        REFERENCES FARM_PLOT(plot_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);