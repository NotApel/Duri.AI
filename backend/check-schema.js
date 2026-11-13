require('dotenv').config();
const pool = require('./db');

async function checkSchema() {
  const tables = [
    'farmer', 'farm_plot', 'sensor_node', 'sensor_reading',
    'detection', 'detection_image', 'notification', 'feedback_category',
    'detection_feedback', 'training_queue'
  ];

  for (const table of tables) {
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `, [table]);

    console.log(`\n=== ${table} ===`);
    if (result.rows.length === 0) {
      console.log('  (does not exist)');
    } else {
      result.rows.forEach(col => {
        const nullable = col.is_nullable === 'NO' ? 'NOT NULL' : '';
        const def = col.column_default ? `DEFAULT ${col.column_default}` : '';
        console.log(`  ${col.column_name.padEnd(25)} ${col.data_type.padEnd(22)} ${nullable} ${def}`);
      });
    }
  }
  await pool.end();
}

checkSchema().catch(async err => { console.error('Schema check failed:', err.code || 'DATABASE_ERROR'); await pool.end(); process.exitCode = 1; });
