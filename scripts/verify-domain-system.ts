#!/usr/bin/env ts-node
/**
 * Verify Domain System Implementation
 * Comprehensive check of all domain system components
 */

import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { DatabaseService } from '../src/services/database-service';

dotenv.config({ path: path.join(__dirname, '../.env') });

interface VerificationResult {
  component: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: any;
}

async function verifyDomainSystem() {
  console.log('\n🔍 Domain System Verification\n');
  console.log('═'.repeat(60));

  const results: VerificationResult[] = [];
  let connection;

  try {
    // 1. Test database connection
    console.log('📋 Testing database connection...');
    
    const dbService = new DatabaseService({
      host: process.env.DB_HOST!,
      user: process.env.DB_USER!,
      password: process.env.DB_PASSWORD!,
      database: process.env.DB_NAME!
    });

    await dbService.initialize();
    const health = await dbService.healthCheck();
    
    results.push({
      component: 'Database Connection',
      status: health.status === 'healthy' ? 'pass' : 'fail',
      message: `Connection ${health.status} (${health.latency}ms)`,
      details: health.details
    });

    // Get direct connection for schema checks
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl: { rejectUnauthorized: false }
    });

    // 2. Check core tables
    console.log('\n📋 Checking core tables...');
    
    const coreTables = [
      { name: 'projects', required: true },
      { name: 'domain_configurations', required: true },
      { name: 'domain_history', required: true },
      { name: 'ai_domain_generations', required: true },
      { name: 'custom_domain_verifications', required: true },
      { name: 'domain_analytics', required: true },
      { name: 'reserved_domains', required: true }
    ];

    for (const table of coreTables) {
      const [rows] = await connection.query(
        `SELECT COUNT(*) as count FROM information_schema.TABLES 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
        [process.env.DB_NAME, table.name]
      );
      
      const exists = rows[0].count > 0;
      results.push({
        component: `Table: ${table.name}`,
        status: exists ? 'pass' : (table.required ? 'fail' : 'warning'),
        message: exists ? 'Table exists' : 'Table missing'
      });
    }

    // 3. Check enhanced tables
    console.log('\n📋 Checking enhanced tables...');
    
    const enhancedTables = [
      'ssl_certificates',
      'domain_health_checks',
      'deployment_history',
      'dns_propagation_checks',
      'ssl_rate_limits'
    ];

    for (const table of enhancedTables) {
      try {
        const [rows] = await connection.query(`SELECT COUNT(*) as count FROM ${table}`);
        results.push({
          component: `Enhanced Table: ${table}`,
          status: 'pass',
          message: `Table exists with ${rows[0].count} records`
        });
      } catch (error) {
        results.push({
          component: `Enhanced Table: ${table}`,
          status: 'warning',
          message: 'Table not found (run jupiterdb-final-updates)'
        });
      }
    }

    // 4. Check columns in domain_configurations
    console.log('\n📋 Checking domain_configurations columns...');
    
    const requiredColumns = [
      'deployment_id',
      'container_group_name',
      'ip_address',
      'deployment_type',
      'ssl_certificate_id',
      'ssl_renewal_date',
      'dns_propagated',
      'error_message',
      'retry_count'
    ];

    const [columns] = await connection.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'domain_configurations'`,
      [process.env.DB_NAME]
    );
    
    const existingColumns = columns.map((c: any) => c.COLUMN_NAME);
    
    for (const col of requiredColumns) {
      const exists = existingColumns.includes(col);
      results.push({
        component: `Column: domain_configurations.${col}`,
        status: exists ? 'pass' : 'warning',
        message: exists ? 'Column exists' : 'Column missing (run updates)'
      });
    }

    // 5. Check stored procedures
    console.log('\n📋 Checking stored procedures...');
    
    const procedures = [
      'CheckDomainAvailability',
      'CreateDomainConfiguration',
      'CreateDomainConfigurationEnhanced',
      'UpdateHealthCheck',
      'UpdateHealthCheckEnhanced'
    ];

    for (const proc of procedures) {
      const [rows] = await connection.query(
        `SELECT COUNT(*) as count FROM information_schema.ROUTINES 
         WHERE ROUTINE_SCHEMA = ? AND ROUTINE_NAME = ?`,
        [process.env.DB_NAME, proc]
      );
      
      const exists = rows[0].count > 0;
      results.push({
        component: `Procedure: ${proc}`,
        status: exists ? 'pass' : 'warning',
        message: exists ? 'Procedure exists' : 'Procedure missing'
      });
    }

    // 6. Check views
    console.log('\n📋 Checking database views...');
    
    const views = ['active_domains_view', 'domain_statistics'];
    
    for (const view of views) {
      const [rows] = await connection.query(
        `SELECT COUNT(*) as count FROM information_schema.VIEWS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
        [process.env.DB_NAME, view]
      );
      
      const exists = rows[0].count > 0;
      results.push({
        component: `View: ${view}`,
        status: exists ? 'pass' : 'warning',
        message: exists ? 'View exists' : 'View missing'
      });
    }

    // 7. Check foreign key constraints
    console.log('\n📋 Checking foreign key constraints...');
    
    const [constraints] = await connection.query(
      `SELECT 
        CONSTRAINT_NAME,
        TABLE_NAME,
        REFERENCED_TABLE_NAME
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = ?
         AND REFERENCED_TABLE_NAME IS NOT NULL
         AND TABLE_NAME LIKE '%domain%'`,
      [process.env.DB_NAME]
    );
    
    results.push({
      component: 'Foreign Key Constraints',
      status: constraints.length > 0 ? 'pass' : 'warning',
      message: `Found ${constraints.length} foreign key constraints`,
      details: constraints
    });

    // 8. Test domain availability check
    console.log('\n📋 Testing domain availability...');
    
    try {
      await connection.query(
        'CALL CheckDomainAvailability(?, @available, @reason)',
        ['test-domain']
      );
      
      const [availResult] = await connection.query(
        'SELECT @available as available, @reason as reason'
      );
      
      results.push({
        component: 'Domain Availability Check',
        status: 'pass',
        message: 'Procedure works correctly',
        details: availResult[0]
      });
    } catch (error) {
      results.push({
        component: 'Domain Availability Check',
        status: 'fail',
        message: 'Procedure not working'
      });
    }

    // 9. Check indexes
    console.log('\n📋 Checking performance indexes...');
    
    const [indexes] = await connection.query(
      `SELECT 
        INDEX_NAME,
        TABLE_NAME,
        COUNT(*) as column_count
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = ?
         AND TABLE_NAME IN ('domain_configurations', 'domain_health_checks', 'ssl_certificates')
         AND INDEX_NAME != 'PRIMARY'
       GROUP BY INDEX_NAME, TABLE_NAME`,
      [process.env.DB_NAME]
    );
    
    results.push({
      component: 'Performance Indexes',
      status: indexes.length >= 5 ? 'pass' : 'warning',
      message: `Found ${indexes.length} indexes`,
      details: indexes
    });

    // 10. Check reserved domains
    console.log('\n📋 Checking reserved domains...');
    
    try {
      const [reserved] = await connection.query(
        'SELECT COUNT(*) as count FROM reserved_domains'
      );
      
      results.push({
        component: 'Reserved Domains',
        status: reserved[0].count >= 20 ? 'pass' : 'warning',
        message: `${reserved[0].count} domains reserved`,
        details: { count: reserved[0].count }
      });
    } catch (error) {
      results.push({
        component: 'Reserved Domains',
        status: 'fail',
        message: 'Could not check reserved domains'
      });
    }

    // Close connections
    await dbService.close();
    await connection.end();

    // Display results
    console.log('\n' + '═'.repeat(60));
    console.log('📊 Verification Results\n');

    const passed = results.filter(r => r.status === 'pass').length;
    const failed = results.filter(r => r.status === 'fail').length;
    const warnings = results.filter(r => r.status === 'warning').length;

    // Group by status
    console.log('✅ PASSED (' + passed + ')');
    results.filter(r => r.status === 'pass').forEach(r => {
      console.log(`  ✓ ${r.component}: ${r.message}`);
    });

    if (warnings > 0) {
      console.log('\n⚠️  WARNINGS (' + warnings + ')');
      results.filter(r => r.status === 'warning').forEach(r => {
        console.log(`  ⚠ ${r.component}: ${r.message}`);
      });
    }

    if (failed > 0) {
      console.log('\n❌ FAILED (' + failed + ')');
      results.filter(r => r.status === 'fail').forEach(r => {
        console.log(`  ✗ ${r.component}: ${r.message}`);
      });
    }

    // Summary
    console.log('\n' + '═'.repeat(60));
    console.log(`Total: ${results.length} | ✅ Passed: ${passed} | ⚠️  Warnings: ${warnings} | ❌ Failed: ${failed}`);
    
    if (failed === 0 && warnings === 0) {
      console.log('\n🎉 Domain system is fully configured and ready!');
    } else if (failed === 0) {
      console.log('\n✅ Domain system is functional with minor warnings.');
      console.log('💡 Run: npm run db:jupiterdb-update to apply all enhancements');
    } else {
      console.log('\n❌ Domain system has critical issues.');
      console.log('💡 Run these commands:');
      console.log('  1. npm run setup:domain-tables');
      console.log('  2. npm run db:jupiterdb-update');
    }

  } catch (error: any) {
    console.error('\n❌ Verification failed:', error.message);
    results.push({
      component: 'System Check',
      status: 'fail',
      message: error.message
    });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run verification
if (require.main === module) {
  verifyDomainSystem().catch(console.error);
}