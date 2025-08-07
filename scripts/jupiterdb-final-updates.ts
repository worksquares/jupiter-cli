#!/usr/bin/env ts-node
/**
 * JupiterDB Final Updates - Complete Domain System Enhancement
 * Ensures all tables, procedures, and features are properly implemented
 */

import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function applyJupiterDBFinalUpdates() {
  console.log('\n🚀 JupiterDB Final Domain System Updates\n');
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

    // 1. Add missing columns to domain_configurations
    console.log('📋 Updating domain_configurations table...');
    
    const domainConfigUpdates = [
      `ALTER TABLE domain_configurations 
       ADD COLUMN IF NOT EXISTS deployment_id VARCHAR(255)`,
      
      `ALTER TABLE domain_configurations 
       ADD COLUMN IF NOT EXISTS container_group_name VARCHAR(255)`,
      
      `ALTER TABLE domain_configurations 
       ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45)`,
      
      `ALTER TABLE domain_configurations 
       ADD COLUMN IF NOT EXISTS deployment_type ENUM('container', 'staticwebapp', 'function', 'vm') DEFAULT 'container'`,
      
      `ALTER TABLE domain_configurations 
       ADD COLUMN IF NOT EXISTS ssl_certificate_id VARCHAR(36)`,
      
      `ALTER TABLE domain_configurations 
       ADD COLUMN IF NOT EXISTS ssl_renewal_date DATETIME`,
      
      `ALTER TABLE domain_configurations 
       ADD COLUMN IF NOT EXISTS dns_propagated BOOLEAN DEFAULT FALSE`,
      
      `ALTER TABLE domain_configurations 
       ADD COLUMN IF NOT EXISTS dns_propagation_checked_at DATETIME`,
      
      `ALTER TABLE domain_configurations 
       ADD COLUMN IF NOT EXISTS error_message TEXT`,
      
      `ALTER TABLE domain_configurations 
       ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0`,
      
      `ALTER TABLE domain_configurations 
       ADD COLUMN IF NOT EXISTS last_retry_at DATETIME`,
      
      `ALTER TABLE domain_configurations 
       ADD COLUMN IF NOT EXISTS health_check_endpoint VARCHAR(255) DEFAULT '/health'`,
      
      `ALTER TABLE domain_configurations 
       ADD COLUMN IF NOT EXISTS health_check_interval INT DEFAULT 60000`,
      
      `ALTER TABLE domain_configurations 
       ADD COLUMN IF NOT EXISTS deployment_config JSON`
    ];

    for (const query of domainConfigUpdates) {
      try {
        await connection.execute(query);
        console.log('  ✅ ' + query.substring(0, 50) + '...');
      } catch (error: any) {
        if (error.code !== 'ER_DUP_COLUMN') {
          console.log('  ❌ ' + error.message);
        } else {
          console.log('  ⏭️  Column already exists');
        }
      }
    }

    // 2. Create SSL certificates table
    console.log('\n📋 Creating SSL certificates table...');
    
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
        INDEX idx_renewal_status (renewal_status),
        CONSTRAINT fk_ssl_domain_config FOREIGN KEY (domain_config_id) 
          REFERENCES domain_configurations(id) ON DELETE CASCADE
      )
    `);
    console.log('  ✅ SSL certificates table ready');

    // 3. Create health monitoring table
    console.log('\n📋 Creating health monitoring table...');
    
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
        INDEX idx_check_time (check_time),
        CONSTRAINT fk_health_domain_config FOREIGN KEY (domain_config_id) 
          REFERENCES domain_configurations(id) ON DELETE CASCADE
      )
    `);
    console.log('  ✅ Health monitoring table ready');

    // 4. Create deployment history table
    console.log('\n📋 Creating deployment history table...');
    
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
        INDEX idx_action (action),
        CONSTRAINT fk_deployment_domain_config FOREIGN KEY (domain_config_id) 
          REFERENCES domain_configurations(id) ON DELETE CASCADE
      )
    `);
    console.log('  ✅ Deployment history table ready');

    // 5. Create DNS propagation tracking
    console.log('\n📋 Creating DNS propagation tracking table...');
    
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
        INDEX idx_propagation (is_propagated),
        CONSTRAINT fk_dns_domain_config FOREIGN KEY (domain_config_id) 
          REFERENCES domain_configurations(id) ON DELETE CASCADE
      )
    `);
    console.log('  ✅ DNS propagation tracking ready');

    // 6. Create rate limit tracking
    console.log('\n📋 Creating SSL rate limit tracking...');
    
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

    // 7. Create comprehensive views
    console.log('\n📋 Creating database views...');
    
    // Active domains with full details
    await connection.execute(`
      CREATE OR REPLACE VIEW active_domains_view AS
      SELECT 
        dc.id,
        dc.project_id,
        p.name as project_name,
        dc.subdomain,
        dc.fqdn,
        dc.environment,
        dc.service,
        dc.deployment_type,
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

    // Domain statistics view
    await connection.execute(`
      CREATE OR REPLACE VIEW domain_statistics AS
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

    // 8. Create stored procedures
    console.log('\n📋 Creating stored procedures...');
    
    // Enhanced domain creation procedure
    await connection.execute(`
      CREATE PROCEDURE IF NOT EXISTS CreateDomainConfigurationEnhanced(
        IN p_project_id VARCHAR(36),
        IN p_subdomain VARCHAR(63),
        IN p_service ENUM('aci', 'staticwebapp'),
        IN p_environment ENUM('production', 'staging', 'development', 'preview'),
        IN p_ssl_enabled BOOLEAN,
        IN p_ai_generated BOOLEAN,
        IN p_ai_reasoning TEXT,
        IN p_deployment_config JSON,
        OUT p_success BOOLEAN,
        OUT p_message VARCHAR(255),
        OUT p_domain_id VARCHAR(36)
      )
      BEGIN
        DECLARE v_domain_available BOOLEAN;
        DECLARE v_error_message VARCHAR(255);
        DECLARE EXIT HANDLER FOR SQLEXCEPTION
        BEGIN
          ROLLBACK;
          SET p_success = FALSE;
          SET p_message = CONCAT('Database error: ', SUBSTRING(MESSAGE_TEXT, 1, 200));
          SET p_domain_id = NULL;
        END;
        
        START TRANSACTION;
        
        -- Check if project exists
        IF NOT EXISTS (SELECT 1 FROM projects WHERE id = p_project_id) THEN
          -- Create basic project entry
          INSERT INTO projects (id, name, description, type, status)
          VALUES (p_project_id, CONCAT('Project ', p_project_id), 'Auto-created project', 'webapp', 'active');
        END IF;
        
        -- Check domain availability
        CALL CheckDomainAvailability(p_subdomain, v_domain_available, v_error_message);
        
        IF NOT v_domain_available THEN
          SET p_success = FALSE;
          SET p_message = v_error_message;
          SET p_domain_id = NULL;
          ROLLBACK;
        ELSE
          -- Generate UUID
          SET p_domain_id = UUID();
          
          -- Insert domain configuration
          INSERT INTO domain_configurations (
            id, project_id, subdomain, domain, fqdn, type, environment,
            service, deployment_type, ai_generated, ai_reasoning, ssl_configured, 
            status, deployment_config, created_at
          ) VALUES (
            p_domain_id, p_project_id, p_subdomain, 'digisquares.in',
            CONCAT(p_subdomain, '.digisquares.in'), 
            IF(p_ai_generated, 'generated', 'custom'),
            p_environment, p_service,
            CASE p_service 
              WHEN 'aci' THEN 'container'
              WHEN 'staticwebapp' THEN 'staticwebapp'
              ELSE 'container'
            END,
            p_ai_generated, p_ai_reasoning, p_ssl_enabled, 'pending',
            p_deployment_config, NOW()
          );
          
          -- Log in history
          INSERT INTO domain_history (
            domain_config_id, project_id, action, new_state, timestamp
          ) VALUES (
            p_domain_id, p_project_id, 'created',
            JSON_OBJECT(
              'subdomain', p_subdomain, 
              'environment', p_environment,
              'service', p_service,
              'ssl_enabled', p_ssl_enabled
            ),
            NOW()
          );
          
          SET p_success = TRUE;
          SET p_message = 'Domain configuration created successfully';
          
          COMMIT;
        END IF;
      END
    `);
    console.log('  ✅ Enhanced domain creation procedure ready');

    // Health check update procedure
    await connection.execute(`
      CREATE PROCEDURE IF NOT EXISTS UpdateHealthCheckEnhanced(
        IN p_domain_config_id VARCHAR(36),
        IN p_response_time_ms INT,
        IN p_status_code INT,
        IN p_ssl_valid BOOLEAN,
        IN p_ssl_days_remaining INT,
        IN p_health_status ENUM('healthy', 'unhealthy', 'degraded', 'unknown'),
        IN p_error_details TEXT,
        IN p_dns_resolves BOOLEAN,
        IN p_certificate_valid BOOLEAN
      )
      BEGIN
        DECLARE EXIT HANDLER FOR SQLEXCEPTION
        BEGIN
          ROLLBACK;
        END;
        
        START TRANSACTION;
        
        -- Insert health check record
        INSERT INTO domain_health_checks (
          domain_config_id, check_time, response_time_ms, status_code,
          ssl_valid, ssl_days_remaining, health_status, error_details,
          dns_resolves, certificate_valid
        ) VALUES (
          p_domain_config_id, NOW(), p_response_time_ms, p_status_code,
          p_ssl_valid, p_ssl_days_remaining, p_health_status, p_error_details,
          p_dns_resolves, p_certificate_valid
        );
        
        -- Update domain configuration
        UPDATE domain_configurations
        SET 
          health_status = p_health_status,
          last_health_check = NOW(),
          updated_at = NOW()
        WHERE id = p_domain_config_id;
        
        -- Update SSL certificate status if needed
        IF p_ssl_valid = FALSE AND EXISTS (
          SELECT 1 FROM ssl_certificates WHERE domain_config_id = p_domain_config_id
        ) THEN
          UPDATE ssl_certificates
          SET renewal_status = 'pending'
          WHERE domain_config_id = p_domain_config_id
            AND renewal_status = 'not_needed';
        END IF;
        
        COMMIT;
      END
    `);
    console.log('  ✅ Enhanced health check procedure ready');

    // 9. Create indexes for performance
    console.log('\n📋 Creating performance indexes...');
    
    const indexes = [
      `CREATE INDEX IF NOT EXISTS idx_dc_deployment_id ON domain_configurations(deployment_id)`,
      `CREATE INDEX IF NOT EXISTS idx_dc_ssl_renewal ON domain_configurations(ssl_renewal_date)`,
      `CREATE INDEX IF NOT EXISTS idx_dc_dns_propagated ON domain_configurations(dns_propagated)`,
      `CREATE INDEX IF NOT EXISTS idx_dc_health_status ON domain_configurations(health_status)`,
      `CREATE INDEX IF NOT EXISTS idx_hc_domain_status ON domain_health_checks(domain_config_id, health_status)`,
      `CREATE INDEX IF NOT EXISTS idx_dh_action_time ON deployment_history(action, started_at)`,
      `CREATE INDEX IF NOT EXISTS idx_ssl_auto_renew ON ssl_certificates(auto_renew, valid_to)`
    ];

    for (const idx of indexes) {
      try {
        await connection.execute(idx);
        console.log('  ✅ ' + idx.substring(0, 40) + '...');
      } catch (error: any) {
        if (!error.message.includes('Duplicate key')) {
          console.log('  ❌ ' + error.message);
        }
      }
    }

    // 10. Add sample data for testing
    console.log('\n📋 Adding sample reserved domains...');
    
    const reservedDomains = [
      ['api-gateway', 'API Gateway endpoint'],
      ['auth-service', 'Authentication service'],
      ['cdn-origin', 'CDN origin server'],
      ['websocket', 'WebSocket endpoint'],
      ['graphql', 'GraphQL endpoint'],
      ['metrics', 'Metrics endpoint'],
      ['health', 'Health check endpoint']
    ];

    for (const [subdomain, reason] of reservedDomains) {
      try {
        await connection.execute(
          'INSERT IGNORE INTO reserved_domains (subdomain, reason) VALUES (?, ?)',
          [subdomain, reason]
        );
      } catch (error) {
        // Ignore duplicates
      }
    }

    // 11. Create triggers
    console.log('\n📋 Creating database triggers...');
    
    // Trigger for SSL renewal date
    await connection.execute(`
      CREATE TRIGGER IF NOT EXISTS update_ssl_renewal_date_enhanced
      AFTER INSERT ON ssl_certificates
      FOR EACH ROW
      BEGIN
        UPDATE domain_configurations
        SET 
          ssl_certificate_id = NEW.id,
          ssl_renewal_date = DATE_SUB(NEW.valid_to, INTERVAL 30 DAY),
          updated_at = NOW()
        WHERE id = NEW.domain_config_id;
      END
    `);
    console.log('  ✅ SSL renewal trigger ready');

    // 12. Final verification
    console.log('\n📊 Verifying all components...\n');
    
    const tables = [
      'domain_configurations',
      'ssl_certificates',
      'domain_health_checks',
      'deployment_history',
      'dns_propagation_checks',
      'ssl_rate_limits'
    ];

    for (const table of tables) {
      const [rows] = await connection.query(
        `SELECT COUNT(*) as count FROM ${table}`
      );
      console.log(`  ✅ ${table}: ${rows[0].count} records`);
    }

    // Check procedures
    const [procedures] = await connection.query(
      `SELECT ROUTINE_NAME FROM information_schema.ROUTINES 
       WHERE ROUTINE_SCHEMA = ? AND ROUTINE_TYPE = 'PROCEDURE'`,
      [process.env.DB_NAME]
    );
    console.log(`\n  ✅ Stored procedures: ${procedures.length}`);

    // Check views
    const [views] = await connection.query(
      `SELECT TABLE_NAME FROM information_schema.VIEWS 
       WHERE TABLE_SCHEMA = ?`,
      [process.env.DB_NAME]
    );
    console.log(`  ✅ Database views: ${views.length}`);

    console.log('\n' + '═'.repeat(60));
    console.log('✅ JupiterDB Domain System Update Complete!');
    console.log('═'.repeat(60));
    console.log('\nThe domain configuration system is now fully enhanced with:');
    console.log('  - SSL certificate management');
    console.log('  - Health monitoring');
    console.log('  - Deployment tracking');
    console.log('  - DNS propagation monitoring');
    console.log('  - Rate limit tracking');
    console.log('  - Performance optimizations');
    console.log('  - Comprehensive analytics');

  } catch (error: any) {
    console.error('\n❌ Update failed:', error.message);
    console.error('\nStack:', error.stack);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run updates
if (require.main === module) {
  applyJupiterDBFinalUpdates().catch(console.error);
}