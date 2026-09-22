--
-- PostgreSQL database dump
--

\restrict lsC8RtAz0bMAdParfekJ4vnr4DkEeFR5UdQejBfl4wGvve3m5GwaSHlS1bIB7Bu

-- Dumped from database version 18.4
-- Dumped by pg_dump version 18.4

-- Started on 2026-09-22 16:23:50

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 228 (class 1259 OID 16478)
-- Name: detection; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.detection (
    detection_id bigint NOT NULL,
    reading_id bigint NOT NULL,
    prediction character varying(30) NOT NULL,
    confidence numeric(5,2) NOT NULL,
    verify_required boolean DEFAULT false NOT NULL,
    detection_status character varying(20) DEFAULT 'PENDING'::character varying NOT NULL,
    detection_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT detection_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (100)::numeric))),
    CONSTRAINT detection_detection_status_check CHECK (((detection_status)::text = ANY ((ARRAY['PENDING'::character varying, 'VERIFIED'::character varying, 'REJECTED'::character varying])::text[]))),
    CONSTRAINT detection_prediction_check CHECK (((prediction)::text = ANY ((ARRAY['DURIAN'::character varying, 'NOT_DURIAN'::character varying])::text[])))
);


ALTER TABLE public.detection OWNER TO postgres;

--
-- TOC entry 227 (class 1259 OID 16477)
-- Name: detection_detection_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.detection ALTER COLUMN detection_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.detection_detection_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 234 (class 1259 OID 16537)
-- Name: detection_feedback; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.detection_feedback (
    feedback_id bigint NOT NULL,
    detection_id bigint NOT NULL,
    farmer_id bigint NOT NULL,
    category_id bigint,
    correct_detection boolean NOT NULL,
    comment_farmer text,
    feedback_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.detection_feedback OWNER TO postgres;

--
-- TOC entry 233 (class 1259 OID 16536)
-- Name: detection_feedback_feedback_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.detection_feedback ALTER COLUMN feedback_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.detection_feedback_feedback_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 230 (class 1259 OID 16502)
-- Name: detection_image; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.detection_image (
    image_id bigint NOT NULL,
    detection_id bigint NOT NULL,
    image_path text NOT NULL,
    sequence_number smallint NOT NULL,
    is_selected boolean DEFAULT false NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT detection_image_sequence_number_check CHECK (((sequence_number >= 1) AND (sequence_number <= 5)))
);


ALTER TABLE public.detection_image OWNER TO postgres;

--
-- TOC entry 229 (class 1259 OID 16501)
-- Name: detection_image_image_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.detection_image ALTER COLUMN image_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.detection_image_image_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 222 (class 1259 OID 16420)
-- Name: farm_plot; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.farm_plot (
    plot_id bigint NOT NULL,
    farmer_id bigint NOT NULL,
    farm_name character varying(200) NOT NULL,
    plot_name character varying(200) NOT NULL,
    plot_size numeric(8,2),
    latitude numeric(9,6) NOT NULL,
    longitude numeric(9,6) NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.farm_plot OWNER TO postgres;

--
-- TOC entry 221 (class 1259 OID 16419)
-- Name: farm_plot_plot_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.farm_plot ALTER COLUMN plot_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.farm_plot_plot_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 220 (class 1259 OID 16401)
-- Name: farmer; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.farmer (
    farmer_id bigint NOT NULL,
    full_name character varying(200) NOT NULL,
    email character varying(200) NOT NULL,
    password_hash character varying(200) NOT NULL,
    phone_number character varying(20) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    username character varying(50) NOT NULL
);


ALTER TABLE public.farmer OWNER TO postgres;

--
-- TOC entry 219 (class 1259 OID 16400)
-- Name: farmer_farmer_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.farmer ALTER COLUMN farmer_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.farmer_farmer_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 232 (class 1259 OID 16524)
-- Name: feedback_category; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.feedback_category (
    category_id bigint NOT NULL,
    category_name character varying(100) NOT NULL,
    description text NOT NULL
);


ALTER TABLE public.feedback_category OWNER TO postgres;

--
-- TOC entry 231 (class 1259 OID 16523)
-- Name: feedback_category_category_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.feedback_category ALTER COLUMN category_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.feedback_category_category_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 238 (class 1259 OID 16583)
-- Name: notification; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notification (
    notification_id bigint NOT NULL,
    detection_id bigint NOT NULL,
    farmer_id bigint NOT NULL,
    title character varying(100) NOT NULL,
    message_noti text,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.notification OWNER TO postgres;

--
-- TOC entry 237 (class 1259 OID 16582)
-- Name: notification_notification_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.notification ALTER COLUMN notification_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.notification_notification_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 224 (class 1259 OID 16439)
-- Name: sensor_node; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sensor_node (
    node_id bigint NOT NULL,
    plot_id bigint NOT NULL,
    node_name character varying(50) NOT NULL,
    status character varying(20) DEFAULT 'OFFLINE'::character varying NOT NULL,
    battery_level smallint,
    firmware_version character varying(20),
    last_ping_at timestamp with time zone,
    installed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sensor_node_battery_level_check CHECK (((battery_level >= 0) AND (battery_level <= 100))),
    CONSTRAINT sensor_node_status_check CHECK (((status)::text = ANY ((ARRAY['ONLINE'::character varying, 'OFFLINE'::character varying])::text[])))
);


ALTER TABLE public.sensor_node OWNER TO postgres;

--
-- TOC entry 223 (class 1259 OID 16438)
-- Name: sensor_node_node_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.sensor_node ALTER COLUMN node_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.sensor_node_node_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 226 (class 1259 OID 16461)
-- Name: sensor_reading; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sensor_reading (
    reading_id bigint NOT NULL,
    node_id bigint NOT NULL,
    amplitude numeric(5,2) NOT NULL,
    frequency numeric(5,2) NOT NULL,
    duration numeric(5,2),
    recorded_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.sensor_reading OWNER TO postgres;

--
-- TOC entry 225 (class 1259 OID 16460)
-- Name: sensor_reading_reading_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.sensor_reading ALTER COLUMN reading_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.sensor_reading_reading_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 236 (class 1259 OID 16566)
-- Name: training_queue; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.training_queue (
    queue_id bigint NOT NULL,
    feedback_id bigint NOT NULL,
    queue_status character varying(30) NOT NULL,
    queue_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    CONSTRAINT training_queue_queue_status_check CHECK (((queue_status)::text = ANY ((ARRAY['PENDING'::character varying, 'PROCESSING'::character varying, 'COMPLETED'::character varying])::text[])))
);


ALTER TABLE public.training_queue OWNER TO postgres;

--
-- TOC entry 235 (class 1259 OID 16565)
-- Name: training_queue_queue_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.training_queue ALTER COLUMN queue_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.training_queue_queue_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 5118 (class 0 OID 16478)
-- Dependencies: 228
-- Data for Name: detection; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.detection (detection_id, reading_id, prediction, confidence, verify_required, detection_status, detection_at) FROM stdin;
1	1	DURIAN	98.50	f	VERIFIED	2026-08-18 22:46:37.373263+08
2	2	NOT_DURIAN	45.00	t	REJECTED	2026-08-18 22:46:37.373263+08
3	3	DURIAN	99.10	f	VERIFIED	2026-08-18 22:46:37.373263+08
4	4	DURIAN	95.20	t	PENDING	2026-08-18 22:46:37.373263+08
5	5	DURIAN	93.00	f	VERIFIED	2026-08-18 22:46:37.373263+08
\.


--
-- TOC entry 5124 (class 0 OID 16537)
-- Dependencies: 234
-- Data for Name: detection_feedback; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.detection_feedback (feedback_id, detection_id, farmer_id, category_id, correct_detection, comment_farmer, feedback_at) FROM stdin;
1	2	1	2	f	monkey, not durian	2026-08-18 22:46:37.373263+08
2	4	1	\N	t	indeed durian	2026-08-18 22:46:37.373263+08
\.


--
-- TOC entry 5120 (class 0 OID 16502)
-- Dependencies: 230
-- Data for Name: detection_image; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.detection_image (image_id, detection_id, image_path, sequence_number, is_selected, captured_at) FROM stdin;
1	1	/images/d1_img1.jpg	1	t	2026-08-18 22:46:37.373263+08
2	1	/images/d1_img2.jpg	2	f	2026-08-18 22:46:37.373263+08
3	2	/images/d2_img1.jpg	1	t	2026-08-18 22:46:37.373263+08
4	3	/images/d3_img1.jpg	1	t	2026-08-18 22:46:37.373263+08
5	4	/images/d4_img1.jpg	1	t	2026-08-18 22:46:37.373263+08
6	5	/images/d5_img1.jpg	1	t	2026-08-18 22:46:37.373263+08
\.


--
-- TOC entry 5112 (class 0 OID 16420)
-- Dependencies: 222
-- Data for Name: farm_plot; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.farm_plot (plot_id, farmer_id, farm_name, plot_name, plot_size, latitude, longitude, updated_at) FROM stdin;
1	1	Melaka Durian Farm	Area A	25.00	2.206500	102.250100	2026-08-18 22:46:37.373263+08
2	1	Melaka Durian Farm	Area B	18.50	2.207100	102.251800	2026-08-18 22:46:37.373263+08
\.


--
-- TOC entry 5110 (class 0 OID 16401)
-- Dependencies: 220
-- Data for Name: farmer; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.farmer (farmer_id, full_name, email, password_hash, phone_number, created_at, updated_at, username) FROM stdin;
1	Nur Syuhada Binti Rizal	leehyunsang3112@gmail.com	$2a$10$hashedpassword123	01157795010	2026-08-18 22:46:37.373263+08	2026-08-18 22:46:37.373263+08	syuhada19
\.


--
-- TOC entry 5122 (class 0 OID 16524)
-- Dependencies: 232
-- Data for Name: feedback_category; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.feedback_category (category_id, category_name, description) FROM stdin;
1	Wind	strong wind
2	Animal	monkey jump
3	Human Activity	people
4	Other	other causes
\.


--
-- TOC entry 5128 (class 0 OID 16583)
-- Dependencies: 238
-- Data for Name: notification; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.notification (notification_id, detection_id, farmer_id, title, message_noti, is_read, created_at) FROM stdin;
1	1	1	Durian Detected	A durian fall event has been detected at Area A.	t	2026-08-18 22:46:37.373263+08
2	2	1	False Detection	A non-durian event requires verification.	t	2026-08-18 22:46:37.373263+08
3	3	1	Durian Detected	A durian fall event has been detected at Area A.	f	2026-08-18 22:46:37.373263+08
4	4	1	Verification Required	Please verify the latest detection.	f	2026-08-18 22:46:37.373263+08
5	5	1	Durian Detected	A durian fall event has been detected at Area B.	f	2026-08-18 22:46:37.373263+08
\.


--
-- TOC entry 5114 (class 0 OID 16439)
-- Dependencies: 224
-- Data for Name: sensor_node; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.sensor_node (node_id, plot_id, node_name, status, battery_level, firmware_version, last_ping_at, installed_at) FROM stdin;
1	1	NODE-01	ONLINE	100	v1.0.0	2026-08-18 22:46:37.373263+08	2026-08-18 22:46:37.373263+08
2	1	NODE-02	ONLINE	96	v1.0.0	2026-08-18 22:46:37.373263+08	2026-08-18 22:46:37.373263+08
3	1	NODE-03	ONLINE	89	v1.0.0	2026-08-18 22:46:37.373263+08	2026-08-18 22:46:37.373263+08
4	2	NODE-04	OFFLINE	25	v1.0.0	\N	2026-08-18 22:46:37.373263+08
5	2	NODE-05	ONLINE	92	v1.0.0	2026-08-18 22:46:37.373263+08	2026-08-18 22:46:37.373263+08
\.


--
-- TOC entry 5116 (class 0 OID 16461)
-- Dependencies: 226
-- Data for Name: sensor_reading; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.sensor_reading (reading_id, node_id, amplitude, frequency, duration, recorded_at) FROM stdin;
1	1	0.81	18.00	0.72	2026-08-18 22:46:37.373263+08
2	2	0.82	14.00	1.00	2026-08-18 22:46:37.373263+08
3	3	0.85	14.00	2.00	2026-08-18 22:46:37.373263+08
4	4	1.00	15.00	0.52	2026-08-18 22:46:37.373263+08
5	5	0.50	17.00	1.20	2026-08-18 22:46:37.373263+08
\.


--
-- TOC entry 5126 (class 0 OID 16566)
-- Dependencies: 236
-- Data for Name: training_queue; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.training_queue (queue_id, feedback_id, queue_status, queue_at, processed_at) FROM stdin;
1	1	PENDING	2026-08-18 22:46:37.373263+08	\N
\.


--
-- TOC entry 5134 (class 0 OID 0)
-- Dependencies: 227
-- Name: detection_detection_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.detection_detection_id_seq', 5, true);


--
-- TOC entry 5135 (class 0 OID 0)
-- Dependencies: 233
-- Name: detection_feedback_feedback_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.detection_feedback_feedback_id_seq', 2, true);


--
-- TOC entry 5136 (class 0 OID 0)
-- Dependencies: 229
-- Name: detection_image_image_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.detection_image_image_id_seq', 6, true);


--
-- TOC entry 5137 (class 0 OID 0)
-- Dependencies: 221
-- Name: farm_plot_plot_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.farm_plot_plot_id_seq', 2, true);


--
-- TOC entry 5138 (class 0 OID 0)
-- Dependencies: 219
-- Name: farmer_farmer_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.farmer_farmer_id_seq', 1, true);


--
-- TOC entry 5139 (class 0 OID 0)
-- Dependencies: 231
-- Name: feedback_category_category_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.feedback_category_category_id_seq', 4, true);


--
-- TOC entry 5140 (class 0 OID 0)
-- Dependencies: 237
-- Name: notification_notification_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.notification_notification_id_seq', 5, true);


--
-- TOC entry 5141 (class 0 OID 0)
-- Dependencies: 223
-- Name: sensor_node_node_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.sensor_node_node_id_seq', 5, true);


--
-- TOC entry 5142 (class 0 OID 0)
-- Dependencies: 225
-- Name: sensor_reading_reading_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.sensor_reading_reading_id_seq', 5, true);


--
-- TOC entry 5143 (class 0 OID 0)
-- Dependencies: 235
-- Name: training_queue_queue_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.training_queue_queue_id_seq', 1, true);


--
-- TOC entry 4946 (class 2606 OID 16549)
-- Name: detection_feedback detection_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.detection_feedback
    ADD CONSTRAINT detection_feedback_pkey PRIMARY KEY (feedback_id);


--
-- TOC entry 4940 (class 2606 OID 16517)
-- Name: detection_image detection_image_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.detection_image
    ADD CONSTRAINT detection_image_pkey PRIMARY KEY (image_id);


--
-- TOC entry 4938 (class 2606 OID 16495)
-- Name: detection detection_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.detection
    ADD CONSTRAINT detection_pkey PRIMARY KEY (detection_id);


--
-- TOC entry 4930 (class 2606 OID 16432)
-- Name: farm_plot farm_plot_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.farm_plot
    ADD CONSTRAINT farm_plot_pkey PRIMARY KEY (plot_id);


--
-- TOC entry 4924 (class 2606 OID 16418)
-- Name: farmer farmer_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.farmer
    ADD CONSTRAINT farmer_email_key UNIQUE (email);


--
-- TOC entry 4926 (class 2606 OID 16416)
-- Name: farmer farmer_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.farmer
    ADD CONSTRAINT farmer_pkey PRIMARY KEY (farmer_id);


--
-- TOC entry 4942 (class 2606 OID 16535)
-- Name: feedback_category feedback_category_category_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.feedback_category
    ADD CONSTRAINT feedback_category_category_name_key UNIQUE (category_name);


--
-- TOC entry 4944 (class 2606 OID 16533)
-- Name: feedback_category feedback_category_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.feedback_category
    ADD CONSTRAINT feedback_category_pkey PRIMARY KEY (category_id);


--
-- TOC entry 4950 (class 2606 OID 16597)
-- Name: notification notification_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification
    ADD CONSTRAINT notification_pkey PRIMARY KEY (notification_id);


--
-- TOC entry 4932 (class 2606 OID 16454)
-- Name: sensor_node sensor_node_node_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sensor_node
    ADD CONSTRAINT sensor_node_node_name_key UNIQUE (node_name);


--
-- TOC entry 4934 (class 2606 OID 16452)
-- Name: sensor_node sensor_node_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sensor_node
    ADD CONSTRAINT sensor_node_pkey PRIMARY KEY (node_id);


--
-- TOC entry 4936 (class 2606 OID 16471)
-- Name: sensor_reading sensor_reading_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sensor_reading
    ADD CONSTRAINT sensor_reading_pkey PRIMARY KEY (reading_id);


--
-- TOC entry 4948 (class 2606 OID 16576)
-- Name: training_queue training_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.training_queue
    ADD CONSTRAINT training_queue_pkey PRIMARY KEY (queue_id);


--
-- TOC entry 4928 (class 2606 OID 16610)
-- Name: farmer uq_farmer_username; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.farmer
    ADD CONSTRAINT uq_farmer_username UNIQUE (username);


--
-- TOC entry 4955 (class 2606 OID 16518)
-- Name: detection_image fk_detection_detection_image; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.detection_image
    ADD CONSTRAINT fk_detection_detection_image FOREIGN KEY (detection_id) REFERENCES public.detection(detection_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- TOC entry 4959 (class 2606 OID 16577)
-- Name: training_queue fk_detection_feedback_training_queue; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.training_queue
    ADD CONSTRAINT fk_detection_feedback_training_queue FOREIGN KEY (feedback_id) REFERENCES public.detection_feedback(feedback_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- TOC entry 4951 (class 2606 OID 16433)
-- Name: farm_plot fk_farm_plot_farmer; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.farm_plot
    ADD CONSTRAINT fk_farm_plot_farmer FOREIGN KEY (farmer_id) REFERENCES public.farmer(farmer_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- TOC entry 4952 (class 2606 OID 16455)
-- Name: sensor_node fk_farm_plot_sensor_node; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sensor_node
    ADD CONSTRAINT fk_farm_plot_sensor_node FOREIGN KEY (plot_id) REFERENCES public.farm_plot(plot_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- TOC entry 4956 (class 2606 OID 16560)
-- Name: detection_feedback fk_feedback_category; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.detection_feedback
    ADD CONSTRAINT fk_feedback_category FOREIGN KEY (category_id) REFERENCES public.feedback_category(category_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- TOC entry 4957 (class 2606 OID 16550)
-- Name: detection_feedback fk_feedback_detection; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.detection_feedback
    ADD CONSTRAINT fk_feedback_detection FOREIGN KEY (detection_id) REFERENCES public.detection(detection_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- TOC entry 4958 (class 2606 OID 16555)
-- Name: detection_feedback fk_feedback_farmer; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.detection_feedback
    ADD CONSTRAINT fk_feedback_farmer FOREIGN KEY (farmer_id) REFERENCES public.farmer(farmer_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- TOC entry 4960 (class 2606 OID 16603)
-- Name: notification fk_notification_detection; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification
    ADD CONSTRAINT fk_notification_detection FOREIGN KEY (detection_id) REFERENCES public.detection(detection_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- TOC entry 4961 (class 2606 OID 16598)
-- Name: notification fk_notification_farmer; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification
    ADD CONSTRAINT fk_notification_farmer FOREIGN KEY (farmer_id) REFERENCES public.farmer(farmer_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- TOC entry 4953 (class 2606 OID 16472)
-- Name: sensor_reading fk_sensor_node_sensor_reading; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sensor_reading
    ADD CONSTRAINT fk_sensor_node_sensor_reading FOREIGN KEY (node_id) REFERENCES public.sensor_node(node_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- TOC entry 4954 (class 2606 OID 16496)
-- Name: detection fk_sensor_reading_detection; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.detection
    ADD CONSTRAINT fk_sensor_reading_detection FOREIGN KEY (reading_id) REFERENCES public.sensor_reading(reading_id) ON UPDATE CASCADE ON DELETE RESTRICT;


-- Completed on 2026-09-22 16:23:50

--
-- PostgreSQL database dump complete
--

\unrestrict lsC8RtAz0bMAdParfekJ4vnr4DkEeFR5UdQejBfl4wGvve3m5GwaSHlS1bIB7Bu

