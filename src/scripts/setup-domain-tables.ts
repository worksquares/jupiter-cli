#!/usr/bin/env ts-node
/**
 * Setup Domain Configuration Tables in JupiterDB
 * Run this script to create the necessary tables for domain management
 */

import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function setupDomainTables() {
  console.log('\n🗄️ Setting up Domain Configuration Tables in JupiterDB\n');
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
      }
    });

    console.log('✅ Connected to JupiterDB');

    // Read SQL schema file
    const schemaPath = path.join(__dirname, '../../src/database/domain-schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Split into individual statements
    const statements = schema
      .split('DELIMITER')
      .map(section => {
        if (section.includes('//')) {
          // Handle stored procedures/functions
          const parts = section.split('//').filter(p => p.trim());
          return parts.map(p => p.trim()).filter(p => p && !p.startsWith('--'));
        }
        return section.split(';').map(s => s.trim()).filter(s => s && !s.startsWith('--'));
      })
      .flat()
      .filter(stmt => stmt.length > 0);

    console.log(`\n📋 Executing ${statements.length} SQL statements...\n`);

    let successCount = 0;
    let skipCount = 0;

    for (const statement of statements) {
      try {
        // Skip empty statements and comments
        if (!statement || statement.startsWith('--')) {
          continue;
        }

        // Clean up statement
        const cleanStatement = statement
          .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
          .trim();

        if (!cleanStatement) continue;

        console.log(`Executing: ${cleanStatement.substring(0, 50)}...`);
        
        await connection.execute(cleanStatement);
        successCount++;
        console.log('  ✅ Success');
      } catch (error: any) {
        if (error.code === 'ER_TABLE_EXISTS_ERROR' || 
            error.code === 'ER_DUP_KEYNAME' ||
            error.code === 'ER_SP_ALREADY_EXISTS') {
          console.log('  ⏭️ Already exists, skipping');
          skipCount++;
        } else {
          console.error(`  ❌ Error: ${error.message}`);
        }
      }
    }

    console.log('\n' + '═'.repeat(60));
    console.log(`✅ Setup Complete!`);
    console.log(`   Successful: ${successCount}`);
    console.log(`   Skipped: ${skipCount}`);
    console.log('═'.repeat(60));

    // Verify tables
    console.log('\n📊 Verifying tables...\n');
    
    const tables = [
      'domain_configurations',
      'domain_history',
      'ai_domain_generations',
      'custom_domain_verifications',
      'domain_analytics',
      'reserved_domains'
    ];

    for (const table of tables) {
      try {
        const [rows] = await connection.execute(
          `SELECT COUNT(*) as count FROM ${table}`
        );
        console.log(`  ✅ ${table}: ${(rows as any)[0].count} records`);
      } catch (error) {
        console.log(`  ❌ ${table}: Not found`);
      }
    }

    // Add sample data
    console.log('\n📝 Adding sample reserved domains...');
    
    const sampleDomains = [
      ['api-docs', 'Documentation'],
      ['api-gateway', 'API Gateway'],
      ['cdn', 'Content Delivery'],
      ['auth', 'Authentication Service'],
      ['webhook', 'Webhook Service']
    ];

    for (const [subdomain, reason] of sampleDomains) {
      try {
        await connection.execute(
          'INSERT IGNORE INTO reserved_domains (subdomain, reason) VALUES (?, ?)',
          [subdomain, reason]
        );
      } catch (error) {
        // Ignore duplicates
      }
    }

    console.log('\n✅ Domain configuration tables are ready!');
    console.log('\n💡 Next steps:');
    console.log('   1. Run the domain configuration example');
    console.log('   2. Test AI domain generation');
    console.log('   3. Deploy a project with automatic domain');

  } catch (error: any) {
    console.error('\n❌ Setup failed:', error.message);
    console.error('\nMake sure:');
    console.error('1. JupiterDB credentials are correct in .env');
    console.error('2. Database server is accessible');
    console.error('3. User has CREATE TABLE permissions');
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run setup
if (require.main === module) {
  setupDomainTables().catch(console.error);
}