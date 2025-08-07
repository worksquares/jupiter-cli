#!/usr/bin/env ts-node
/**
 * Apply Domain Schema Updates to JupiterDB
 * Fixes issues and adds missing features
 */

import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function applyDomainUpdates() {
  console.log('\n🔧 Applying Domain Schema Updates to JupiterDB\n');
  console.log('═'.repeat(60));

  let connection;

  try {
    // Connect to database
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl: {
        rejectUnauthorized: false
      },
      multipleStatements: true
    });

    console.log('✅ Connected to JupiterDB');

    // Read update SQL
    const updatePath = path.join(__dirname, '../src/database/domain-schema-updates.sql');
    const updates = fs.readFileSync(updatePath, 'utf8');

    // Split by delimiter handling
    const statements = [];
    let currentStatement = '';
    let inDelimiter = false;
    
    updates.split('\n').forEach(line => {
      if (line.trim() === 'DELIMITER //') {
        inDelimiter = true;
        return;
      }
      if (line.trim() === 'DELIMITER ;') {
        inDelimiter = false;
        if (currentStatement.trim()) {
          statements.push(currentStatement.trim());
          currentStatement = '';
        }
        return;
      }
      
      if (inDelimiter) {
        currentStatement += line + '\n';
        if (line.trim() === 'END //') {
          statements.push(currentStatement.trim());
          currentStatement = '';
        }
      } else {
        if (line.trim() && !line.trim().startsWith('--')) {
          if (line.trim().endsWith(';')) {
            statements.push(currentStatement + ' ' + line);
            currentStatement = '';
          } else {
            currentStatement += ' ' + line;
          }
        }
      }
    });

    console.log(`\n📋 Applying ${statements.length} updates...\n`);

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    // Apply each statement
    for (const statement of statements) {
      if (!statement.trim()) continue;
      
      try {
        const cleanStatement = statement.trim();
        const preview = cleanStatement.substring(0, 60).replace(/\s+/g, ' ');
        
        console.log(`Executing: ${preview}...`);
        await connection.query(cleanStatement);
        
        successCount++;
        console.log('  ✅ Success');
        
      } catch (error: any) {
        if (error.code === 'ER_DUP_COLUMN' || 
            error.code === 'ER_DUP_KEYNAME' ||
            error.code === 'ER_TABLE_EXISTS_ERROR' ||
            error.code === 'ER_SP_ALREADY_EXISTS' ||
            error.message.includes('Duplicate')) {
          console.log('  ⏭️ Already exists, skipping');
          skipCount++;
        } else {
          console.error(`  ❌ Error: ${error.message}`);
          errorCount++;
        }
      }
    }

    // Check tables
    console.log('\n📊 Verifying updates...\n');
    
    // Check new tables
    const newTables = [
      'ssl_certificates',
      'domain_health_checks',
      'deployment_history',
      'dns_propagation_checks',
      'ssl_rate_limits'
    ];

    for (const table of newTables) {
      try {
        const [rows] = await connection.query(
          `SELECT COUNT(*) as count FROM ${table}`
        );
        console.log(`  ✅ ${table}: Ready (${rows[0].count} records)`);
      } catch (error) {
        console.log(`  ❌ ${table}: Not found`);
      }
    }

    // Check procedures
    console.log('\n📋 Checking stored procedures...');
    
    const procedures = ['CreateDomainConfiguration', 'UpdateHealthCheck', 'CheckDomainAvailability'];
    
    for (const proc of procedures) {
      try {
        const [rows] = await connection.query(
          'SELECT ROUTINE_NAME FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ? AND ROUTINE_NAME = ?',
          [process.env.DB_NAME, proc]
        );
        if (rows.length > 0) {
          console.log(`  ✅ ${proc}: Available`);
        } else {
          console.log(`  ❌ ${proc}: Not found`);
        }
      } catch (error) {
        console.log(`  ❌ ${proc}: Error checking`);
      }
    }

    // Summary
    console.log('\n' + '═'.repeat(60));
    console.log('✅ Update Summary:');
    console.log(`   Successful: ${successCount}`);
    console.log(`   Skipped: ${skipCount}`);
    console.log(`   Failed: ${errorCount}`);
    console.log('═'.repeat(60));

    if (errorCount > 0) {
      console.log('\n⚠️  Some updates failed. Check the errors above.');
    } else {
      console.log('\n✅ All updates applied successfully!');
    }

    // Test database service
    console.log('\n🧪 Testing database service...');
    
    const { DatabaseService } = require('../src/services/database-service');
    const dbService = new DatabaseService({
      host: process.env.DB_HOST!,
      user: process.env.DB_USER!,
      password: process.env.DB_PASSWORD!,
      database: process.env.DB_NAME!
    });

    await dbService.initialize();
    const health = await dbService.healthCheck();
    
    console.log(`  Database health: ${health.status}`);
    console.log(`  Latency: ${health.latency}ms`);
    
    await dbService.close();

  } catch (error: any) {
    console.error('\n❌ Update failed:', error.message);
    console.error('\nMake sure:');
    console.error('1. JupiterDB is accessible');
    console.error('2. User has ALTER/CREATE permissions');
    console.error('3. Base domain tables exist');
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run updates
if (require.main === module) {
  applyDomainUpdates().catch(console.error);
}