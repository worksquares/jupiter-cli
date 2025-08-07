#!/usr/bin/env ts-node
/**
 * JupiterDB Safe Updates - Handles existing columns gracefully
 */

import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function safeAddColumn(
  connection: any,
  table: string,
  column: string,
  definition: string
): Promise<boolean> {
  try {
    // Check if column exists
    const [cols] = await connection.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [process.env.DB_NAME, table, column]
    );
    
    if (cols.length > 0) {
      console.log(`  ⏭️  Column ${column} already exists`);
      return false;
    }
    
    // Add column
    await connection.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`  ✅ Added column ${column}`);
    return true;
  } catch (error: any) {
    console.log(`  ❌ Error adding ${column}: ${error.message}`);
    return false;
  }
}

async function applyJupiterDBSafeUpdates() {
  console.log('\n🚀 JupiterDB Safe Domain System Updates\n');
  console.log('═'.repeat(60));

  let connection;

  try {
    // Connect to JupiterDB
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl: { rejectUnauthorized: false },
      multipleStatements: true
    });

    console.log('✅ Connected to JupiterDB\n');

    // 1. Update domain_configurations table
    console.log('📋 Updating domain_configurations table...');
    
    const columnDefinitions = [
      ['deployment_id', 'VARCHAR(255)'],
      ['container_group_name', 'VARCHAR(255)'],
      ['ip_address', 'VARCHAR(45)'],
      ['deployment_type', "ENUM('container', 'staticwebapp', 'function', 'vm') DEFAULT 'container'"],
      ['ssl_certificate_id', 'VARCHAR(36)'],
      ['ssl_renewal_date', 'DATETIME'],
      ['dns_propagated', 'BOOLEAN DEFAULT FALSE'],
      ['dns_propagation_checked_at', 'DATETIME'],
      ['error_message', 'TEXT'],
      ['retry_count', 'INT DEFAULT 0'],
      ['last_retry_at', 'DATETIME'],
      ['health_check_endpoint', "VARCHAR(255) DEFAULT '/health'"],
      ['health_check_interval', 'INT DEFAULT 60000'],
      ['deployment_config', 'JSON']
    ];

    for (const [column, definition] of columnDefinitions) {
      await safeAddColumn(connection, 'domain_configurations', column, definition);
    }

    // 2. Create tables if they don't exist
    console.log('\n📋 Creating additional tables...');
    
    // SSL Certificates
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS ssl_certificates (
        id VARCHAR(36) PRIMARY KEY,
        domain_config_id VARCHAR(36) NOT NULL,
        domain VARCHAR(255) NOT NULL,
        common_name VARCHAR(255),
        issuer VARCHAR(255),
        serial_number VARCHAR(255),
        fingerprint VARCHAR(255),
        valid_from DATETIME NOT NULL,
        valid_to DATETIME NOT NULL,
        key_type ENUM('rsa', 'ec') DEFAULT 'ec',
        key_size INT,
        alt_names JSON,
        certificate_chain LONGTEXT,
        private_key_encrypted LONGTEXT,
        renewal_status ENUM('not_needed', 'pending', 'in_progress', 'completed', 'failed') DEFAULT 'not_needed',
        renewal_attempts INT DEFAULT 0,
        last_renewal_attempt DATETIME,
        auto_renew BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        INDEX idx_domain (domain),
        INDEX idx_valid_to (valid_to),
        INDEX idx_renewal_status (renewal_status)
      )
    `);
    console.log('  ✅ SSL certificates table ready');

    // Health Checks
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS domain_health_checks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        domain_config_id VARCHAR(36) NOT NULL,
        check_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        response_time_ms INT,
        status_code INT,
        ssl_valid BOOLEAN,
        ssl_days_remaining INT,
        health_status ENUM('healthy', 'unhealthy', 'degraded', 'unknown') NOT NULL,
        error_details TEXT,
        dns_resolves BOOLEAN DEFAULT TRUE,
        certificate_valid BOOLEAN DEFAULT TRUE,
        
        INDEX idx_domain_time (domain_config_id, check_time),
        INDEX idx_health_status (health_status),
        INDEX idx_check_time (check_time)
      )
    `);
    console.log('  ✅ Health monitoring table ready');

    // Deployment History
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS deployment_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        domain_config_id VARCHAR(36) NOT NULL,
        deployment_id VARCHAR(255),
        action ENUM('create', 'update', 'delete', 'rollback', 'scale', 'restart') NOT NULL,
        status ENUM('started', 'in_progress', 'completed', 'failed', 'rolled_back') NOT NULL,
        started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        duration_seconds INT,
        configuration JSON,
        error_details TEXT,
        initiated_by VARCHAR(255),
        resource_group VARCHAR(255),
        container_image VARCHAR(255),
        
        INDEX idx_domain_deployment (domain_config_id, started_at),
        INDEX idx_status (status),
        INDEX idx_action (action)
      )
    `);
    console.log('  ✅ Deployment history table ready');

    // DNS Propagation
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS dns_propagation_checks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        domain_config_id VARCHAR(36) NOT NULL,
        check_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        dns_server VARCHAR(255),
        dns_server_name VARCHAR(100),
        record_type ENUM('A', 'AAAA', 'CNAME', 'TXT', 'MX', 'NS') NOT NULL,
        expected_value VARCHAR(255),
        actual_value VARCHAR(255),
        is_propagated BOOLEAN,
        response_time_ms INT,
        
        INDEX idx_domain_check (domain_config_id, check_time),
        INDEX idx_propagation (is_propagated)
      )
    `);
    console.log('  ✅ DNS propagation tracking ready');

    // SSL Rate Limits
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS ssl_rate_limits (
        id INT AUTO_INCREMENT PRIMARY KEY,
        identifier VARCHAR(255) NOT NULL,
        limit_type ENUM('certificates_per_domain', 'duplicate_certificate', 'failed_validation', 'new_orders') NOT NULL,
        count INT DEFAULT 1,
        window_start DATETIME NOT NULL,
        window_end DATETIME NOT NULL,
        max_allowed INT NOT NULL,
        
        UNIQUE KEY unique_identifier_type_window (identifier, limit_type, window_start),
        INDEX idx_window_end (window_end),
        INDEX idx_identifier (identifier)
      )
    `);
    console.log('  ✅ SSL rate limit tracking ready');

    // 3. Create views safely
    console.log('\n📋 Creating database views...');
    
    // Drop and recreate views to ensure they have correct columns
    await connection.execute('DROP VIEW IF EXISTS active_domains_view');
    await connection.execute(`
      CREATE VIEW active_domains_view AS
      SELECT 
        dc.id,
        dc.project_id,
        p.name as project_name,
        dc.subdomain,
        dc.fqdn,
        dc.environment,
        dc.service,
        dc.ai_generated,
        dc.ssl_configured,
        dc.health_status,
        dc.dns_propagated,
        dc.ip_address,
        dc.deployment_id,
        dc.created_at,
        dc.updated_at,
        sc.valid_to as ssl_expiry,
        DATEDIFF(sc.valid_to, NOW()) as ssl_days_remaining,
        hc.response_time_ms as last_response_time,
        hc.health_status as last_health_status
      FROM domain_configurations dc
      LEFT JOIN projects p ON dc.project_id = p.id
      LEFT JOIN ssl_certificates sc ON dc.ssl_certificate_id = sc.id
      LEFT JOIN (
        SELECT domain_config_id, response_time_ms, health_status,
               ROW_NUMBER() OVER (PARTITION BY domain_config_id ORDER BY check_time DESC) as rn
        FROM domain_health_checks
      ) hc ON dc.id = hc.domain_config_id AND hc.rn = 1
      WHERE dc.status = 'active'
    `);
    console.log('  ✅ Active domains view created');

    await connection.execute('DROP VIEW IF EXISTS domain_statistics');
    await connection.execute(`
      CREATE VIEW domain_statistics AS
      SELECT 
        COUNT(DISTINCT dc.id) as total_domains,
        SUM(CASE WHEN dc.status = 'active' THEN 1 ELSE 0 END) as active_domains,
        SUM(CASE WHEN dc.status = 'pending' THEN 1 ELSE 0 END) as pending_domains,
        SUM(CASE WHEN dc.status = 'failed' THEN 1 ELSE 0 END) as failed_domains,
        SUM(CASE WHEN dc.ssl_configured = 1 THEN 1 ELSE 0 END) as ssl_enabled,
        SUM(CASE WHEN dc.health_status = 'healthy' THEN 1 ELSE 0 END) as healthy_domains,
        SUM(CASE WHEN dc.ai_generated = 1 THEN 1 ELSE 0 END) as ai_generated,
        SUM(CASE WHEN dc.dns_propagated = 1 THEN 1 ELSE 0 END) as dns_propagated,
        AVG(CASE WHEN hc.response_time_ms IS NOT NULL THEN hc.response_time_ms END) as avg_response_time,
        COUNT(DISTINCT dc.project_id) as unique_projects
      FROM domain_configurations dc
      LEFT JOIN (
        SELECT domain_config_id, response_time_ms,
               ROW_NUMBER() OVER (PARTITION BY domain_config_id ORDER BY check_time DESC) as rn
        FROM domain_health_checks
      ) hc ON dc.id = hc.domain_config_id AND hc.rn = 1
    `);
    console.log('  ✅ Domain statistics view created');

    // 4. Create indexes
    console.log('\n📋 Creating performance indexes...');
    
    const indexes = [
      ['domain_configurations', 'idx_dc_deployment_id', 'deployment_id'],
      ['domain_configurations', 'idx_dc_ssl_renewal', 'ssl_renewal_date'],
      ['domain_configurations', 'idx_dc_dns_propagated', 'dns_propagated'],
      ['domain_configurations', 'idx_dc_health_status', 'health_status'],
      ['domain_health_checks', 'idx_hc_domain_status', 'domain_config_id, health_status'],
      ['deployment_history', 'idx_dh_action_time', 'action, started_at'],
      ['ssl_certificates', 'idx_ssl_auto_renew', 'auto_renew, valid_to']
    ];

    for (const [table, indexName, columns] of indexes) {
      try {
        await connection.execute(`CREATE INDEX ${indexName} ON ${table} (${columns})`);
        console.log(`  ✅ Created index ${indexName}`);
      } catch (error: any) {
        if (error.code === 'ER_DUP_KEYNAME') {
          console.log(`  ⏭️  Index ${indexName} already exists`);
        } else {
          console.log(`  ❌ Error creating ${indexName}: ${error.message}`);
        }
      }
    }

    // 5. Add foreign key constraints safely
    console.log('\n📋 Adding foreign key constraints...');
    
    // Check if constraints exist before adding
    const addForeignKey = async (table: string, constraint: string, definition: string) => {
      try {
        const [existing] = await connection.query(
          `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE 
           WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?`,
          [process.env.DB_NAME, table, constraint]
        );
        
        if (existing.length === 0) {
          await connection.execute(`ALTER TABLE ${table} ADD CONSTRAINT ${constraint} ${definition}`);
          console.log(`  ✅ Added constraint ${constraint}`);
        } else {
          console.log(`  ⏭️  Constraint ${constraint} already exists`);
        }
      } catch (error: any) {
        console.log(`  ❌ Error adding ${constraint}: ${error.message}`);
      }
    };

    await addForeignKey(
      'ssl_certificates',
      'fk_ssl_domain_config',
      'FOREIGN KEY (domain_config_id) REFERENCES domain_configurations(id) ON DELETE CASCADE'
    );

    await addForeignKey(
      'domain_health_checks',
      'fk_health_domain_config',
      'FOREIGN KEY (domain_config_id) REFERENCES domain_configurations(id) ON DELETE CASCADE'
    );

    await addForeignKey(
      'deployment_history',
      'fk_deployment_domain_config',
      'FOREIGN KEY (domain_config_id) REFERENCES domain_configurations(id) ON DELETE CASCADE'
    );

    await addForeignKey(
      'dns_propagation_checks',
      'fk_dns_domain_config',
      'FOREIGN KEY (domain_config_id) REFERENCES domain_configurations(id) ON DELETE CASCADE'
    );

    // 6. Verify final state
    console.log('\n📊 Verifying final state...\n');
    
    const tables = [
      'domain_configurations',
      'ssl_certificates',
      'domain_health_checks',
      'deployment_history',
      'dns_propagation_checks',
      'ssl_rate_limits'
    ];

    for (const table of tables) {
      try {
        const [rows] = await connection.query(
          `SELECT COUNT(*) as count FROM ${table}`
        );
        console.log(`  ✅ ${table}: ${rows[0].count} records`);
      } catch (error) {
        console.log(`  ❌ ${table}: Error accessing table`);
      }
    }

    console.log('\n' + '═'.repeat(60));
    console.log('✅ JupiterDB Safe Updates Complete!');
    console.log('═'.repeat(60));

  } catch (error: any) {
    console.error('\n❌ Update failed:', error.message);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run updates
if (require.main === module) {
  applyJupiterDBSafeUpdates().catch(console.error);
}