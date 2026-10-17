require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function seed() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    console.log('🌱 Seeding database...\n');

    console.log('🧹 Clearing existing data...');
    await client.query(`
      TRUNCATE 
        training_queue, 
        detection_feedback, 
        notification, 
        detection_image, 
        detection, 
        sensor_reading, 
        sensor_node, 
        farm_plot, 
        feedback_category 
      RESTART IDENTITY CASCADE
    `);
    console.log('   ✅ Cleared\n');

    console.log('🏞️  Creating farm plots...');
    const farmers = await client.query('SELECT farmer_id FROM farmer ORDER BY farmer_id LIMIT 2');
    if (farmers.rows.length === 0) {
      throw new Error('No farmers found. Please register a farmer first.');
    }
    const farmerId1 = farmers.rows[0].farmer_id;
    const farmerId2 = farmers.rows[1] ? farmers.rows[1].farmer_id : farmerId1;

    const plot1 = await client.query(
      `INSERT INTO farm_plot (farmer_id, farm_name, plot_name, plot_size, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING plot_id`,
      [farmerId1, 'Ladang Utama', 'Plot A', 2.5, 5.1234, 100.5678]
    );
    const plot2 = await client.query(
      `INSERT INTO farm_plot (farmer_id, farm_name, plot_name, plot_size, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING plot_id`,
      [farmerId1, 'Ladang Utama', 'Plot B', 1.8, 5.1245, 100.5690]
    );
    const plot3 = await client.query(
      `INSERT INTO farm_plot (farmer_id, farm_name, plot_name, plot_size, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING plot_id`,
      [farmerId2, 'Ladang Kedua', 'Plot C', 3.0, 5.1300, 100.5700]
    );
    const plotIds = [plot1.rows[0].plot_id, plot2.rows[0].plot_id, plot3.rows[0].plot_id];
    console.log(`   ✅ ${plotIds.length} plots created\n`);

    console.log('📡 Creating sensor nodes...');
    const nodeData = [
      [plotIds[0], 'NODE-01', 'ONLINE',  95, 'v1.2.0'],
      [plotIds[0], 'NODE-02', 'ONLINE',  78, 'v1.2.0'],
      [plotIds[0], 'NODE-03', 'ONLINE',  62, 'v1.2.0'],
      [plotIds[1], 'NODE-04', 'OFFLINE', 15, 'v1.1.8'],
      [plotIds[2], 'NODE-05', 'ONLINE',  88, 'v1.2.0'],
    ];
    const nodeIds = [];
    for (const [plotId, name, status, battery, fw] of nodeData) {
      const r = await client.query(
        `INSERT INTO sensor_node (plot_id, node_name, status, battery_level, firmware_version, last_ping_at)
         VALUES ($1, $2, $3, $4, $5, NOW() - INTERVAL '${Math.floor(Math.random() * 10)} minutes')
         RETURNING node_id`,
        [plotId, name, status, battery, fw]
      );
      nodeIds.push(r.rows[0].node_id);
    }
    console.log(`   ✅ ${nodeIds.length} nodes created\n`);

    console.log('📊 Creating sensor readings...');
    const readingData = [
      [nodeIds[0], 22.5, 42.3, 0.85],
      [nodeIds[0], 35.8, 55.1, 1.20],
      [nodeIds[1], 18.3, 38.7, 0.62],
      [nodeIds[1], 28.9, 48.5, 0.95],
      [nodeIds[2], 45.2, 62.8, 1.45],
      [nodeIds[2], 15.7, 35.2, 0.55],
      [nodeIds[0], 52.4, 68.3, 1.60],
      [nodeIds[0], 31.6, 51.0, 1.05],
      [nodeIds[1], 41.8, 59.7, 1.35],
      [nodeIds[4], 26.3, 46.5, 0.88],
    ];
    const readingIds = [];
    for (let i = 0; i < readingData.length; i++) {
      const [nodeId, amp, freq, dur] = readingData[i];
      const hoursAgo = (10 - i) * 0.5;
      const r = await client.query(
        `INSERT INTO sensor_reading (node_id, amplitude, frequency, duration, recorded_at)
         VALUES ($1, $2, $3, $4, NOW() - INTERVAL '${hoursAgo} hours')
         RETURNING reading_id`,
        [nodeId, amp, freq, dur]
      );
      readingIds.push(r.rows[0].reading_id);
    }
    console.log(`   ✅ ${readingIds.length} readings created\n`);

    console.log('🔍 Creating detections...');
    const detectionData = [
      [readingIds[0], 'DURIAN',     95.5, false, 'VERIFIED'],
      [readingIds[1], 'DURIAN',     88.2, true,  'PENDING'],
      [readingIds[2], 'NOT_DURIAN', 42.0, false, 'REJECTED'],
      [readingIds[3], 'DURIAN',     92.7, false, 'VERIFIED'],
      [readingIds[4], 'DURIAN',     96.1, false, 'VERIFIED'],
      [readingIds[5], 'NOT_DURIAN', 38.5, false, 'VERIFIED'],
      [readingIds[6], 'DURIAN',     94.3, false, 'VERIFIED'],
      [readingIds[7], 'DURIAN',     89.8, true,  'PENDING'],
      [readingIds[8], 'DURIAN',     93.2, false, 'VERIFIED'],
      [readingIds[9], 'DURIAN',     91.5, false, 'VERIFIED'],
    ];
    const detectionIds = [];
    for (let i = 0; i < detectionData.length; i++) {
      const [readingId, pred, conf, verify, status] = detectionData[i];
      const hoursAgo = (10 - i) * 0.5;
      const r = await client.query(
        `INSERT INTO detection (reading_id, prediction, confidence, verify_required, detection_status, detection_at)
         VALUES ($1, $2, $3, $4, $5, NOW() - INTERVAL '${hoursAgo} hours')
         RETURNING detection_id`,
        [readingId, pred, conf, verify, status]
      );
      detectionIds.push(r.rows[0].detection_id);
    }
    console.log(`   ✅ ${detectionIds.length} detections created\n`);

    console.log('🔔 Creating notifications...');
    const notifData = [
      [detectionIds[0], farmerId1, 'Durian Detected!',    'High confidence detection at NODE-01', false],
      [detectionIds[1], farmerId1, 'Verification Needed', 'Please verify the detection at NODE-01', false],
      [detectionIds[3], farmerId1, 'Durian Detected!',    'Detected at NODE-02',                   true],
      [detectionIds[4], farmerId2, 'Durian Detected!',    'Detected at NODE-03',                   false],
      [detectionIds[6], farmerId1, 'Durian Detected!',    'High confidence detection at NODE-01', false],
      [detectionIds[7], farmerId1, 'Verification Needed', 'Please verify the detection',          true],
    ];
    for (const [detId, farmerId, title, msg, isRead] of notifData) {
      await client.query(
        `INSERT INTO notification (detection_id, farmer_id, title, message_noti, is_read)
         VALUES ($1, $2, $3, $4, $5)`,
        [detId, farmerId, title, msg, isRead]
      );
    }
    console.log(`   ✅ ${notifData.length} notifications created\n`);

    console.log('🏷️  Creating feedback categories...');
    const catData = [
      ['FALSE_POSITIVE', 'Detected durian but no durian present'],
      ['MISSED_DETECTION', 'Durian present but not detected'],
      ['WRONG_TIMING', 'Detection at wrong time of day'],
      ['LOW_CONFIDENCE', 'Detection confidence too low'],
      ['OTHER', 'Other issue'],
    ];
    for (const [name, desc] of catData) {
      await client.query(
        `INSERT INTO feedback_category (category_name, description) VALUES ($1, $2)`,
        [name, desc]
      );
    }
    console.log(`   ✅ ${catData.length} categories created\n`);

    await client.query('COMMIT');

    console.log('🎉 ====================================');
    console.log('🎉 SEED COMPLETE!');
    console.log('🎉 ====================================\n');
    console.log('📋 Summary:');
    console.log(`   Farm plots: ${plotIds.length}`);
    console.log(`   Sensor nodes: ${nodeIds.length}`);
    console.log(`   Readings: ${readingIds.length}`);
    console.log(`   Detections: ${detectionIds.length}`);
    console.log(`   Notifications: ${notifData.length}`);
    console.log(`   Feedback categories: ${catData.length}\n`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', err.message);
    console.error(err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();