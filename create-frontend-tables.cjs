const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function createTables() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'digiserver.mysql.database.azure.com',
    user: process.env.DB_USER || 'digisquares',
    password: process.env.DB_PASSWORD || '9f931606-3330',
    database: process.env.DB_NAME || 'jupiterdb',
    port: parseInt(process.env.DB_PORT || '3306'),
    multipleStatements: true
  });

  try {
    console.log('Connected to Jupiter DB');
    
    const sqlFile = path.join(__dirname, 'src/database/create-frontend-tables-v2.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');
    
    console.log('Executing SQL statements...');
    const statements = sql.split(';').filter(stmt => stmt.trim());
    
    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await connection.query(statement + ';');
          console.log('✓ Executed:', statement.trim().split('\n')[0].substring(0, 50) + '...');
        } catch (error) {
          console.error('✗ Failed:', statement.trim().split('\n')[0].substring(0, 50) + '...');
          console.error('  Error:', error.message);
        }
      }
    }
    
    console.log('\nFrontend tables creation completed!');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await connection.end();
    console.log('Connection closed');
  }
}

createTables();