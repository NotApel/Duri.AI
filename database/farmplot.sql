CREATE TABLE FARM_PLOT (
    plot_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    farmer_id BIGINT NOT NULL,
    farm_name VARCHAR(200) NOT NULL,
    plot_name VARCHAR(200) NOT NULL,
    plot_size DECIMAL(8,2),
    latitude DECIMAL(9,6),
    longitude DECIMAL(9,6),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_farm_plot_farmer
        FOREIGN KEY (farmer_id)
        REFERENCES FARMER(farmer_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);