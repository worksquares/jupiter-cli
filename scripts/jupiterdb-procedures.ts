#!/usr/bin/env ts-node
/**
 * JupiterDB Stored Procedures - Create missing procedures
 */

import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function createStoredProcedures() {
  console.log('\n🚀 Creating JupiterDB Stored Procedures\n');
  console.log('═'.repeat(60));

  let connection;

  try {
    // Connect to JupiterDB without multipleStatements for security
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl: { rejectUnauthorized: false }
    });

    console.log('✅ Connected to JupiterDB\n');

    // 1. Drop existing procedures first
    console.log('📋 Dropping existing procedures...');
    
    const procedures = [
      'CheckDomainAvailability',
      'CreateDomainConfiguration',
      'CreateDomainConfigurationEnhanced',
      'UpdateHealthCheck',
      'UpdateHealthCheckEnhanced'
    ];

    for (const proc of procedures) {
      try {
        await connection.query(`DROP PROCEDURE IF EXISTS ${proc}`);
        console.log(`  ✅ Dropped ${proc} if exists`);
      } catch (error) {
        console.log(`  ⚠️  Could not drop ${proc}`);
      }
    }

    // 2. Create CheckDomainAvailability procedure
    console.log('\n📋 Creating CheckDomainAvailability procedure...');
    
    await connection.query(`
      CREATE PROCEDURE CheckDomainAvailability(
        IN p_subdomain VARCHAR(63),
        OUT p_available BOOLEAN,
        OUT p_reason VARCHAR(255)
      )
      BEGIN
        DECLARE v_count INT;
        
        -- Check reserved domains
        SELECT COUNT(*) INTO v_count
        FROM reserved_domains
        WHERE subdomain = p_subdomain;
        
        IF v_count > 0 THEN
          SET p_available = FALSE;
          SET p_reason = 'Domain is reserved by system';
        ELSE
          -- Check existing configurations
          SELECT COUNT(*) INTO v_count
          FROM domain_configurations
          WHERE subdomain = p_subdomain
            AND status IN ('active', 'pending');
          
          IF v_count > 0 THEN
            SET p_available = FALSE;
            SET p_reason = 'Domain already in use';
          ELSE
            SET p_available = TRUE;
            SET p_reason = 'Domain is available';
          END IF;
        END IF;
      END
    `);
    console.log('  ✅ CheckDomainAvailability created');

    // 3. Create CreateDomainConfiguration procedure
    console.log('\n📋 Creating CreateDomainConfiguration procedure...');
    
    await connection.query(`
      CREATE PROCEDURE CreateDomainConfiguration(
        IN p_project_id VARCHAR(36),
        IN p_subdomain VARCHAR(63),
        IN p_service ENUM('aci', 'staticwebapp'),
        IN p_environment ENUM('production', 'staging', 'development', 'preview'),
        IN p_ssl_enabled BOOLEAN,
        IN p_ai_generated BOOLEAN,
        IN p_ai_reasoning TEXT,
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
          SET p_message = 'Database error occurred';
          SET p_domain_id = NULL;
        END;
        
        START TRANSACTION;
        
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
            service, ai_generated, ai_reasoning, ssl_configured, status, created_at
          ) VALUES (
            p_domain_id, p_project_id, p_subdomain, 'digisquares.in',
            CONCAT(p_subdomain, '.digisquares.in'), 
            IF(p_ai_generated, 'generated', 'custom'),
            p_environment, p_service, p_ai_generated, p_ai_reasoning, 
            p_ssl_enabled, 'pending', NOW()
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
    console.log('  ✅ CreateDomainConfiguration created');

    // 4. Create enhanced version
    console.log('\n📋 Creating CreateDomainConfigurationEnhanced procedure...');
    
    await connection.query(`
      CREATE PROCEDURE CreateDomainConfigurationEnhanced(
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
          SET p_message = 'Database error occurred';
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
          
          -- Insert domain configuration with deployment type
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
              'ssl_enabled', p_ssl_enabled,
              'deployment_config', p_deployment_config
            ),
            NOW()
          );
          
          SET p_success = TRUE;
          SET p_message = 'Domain configuration created successfully';
          
          COMMIT;
        END IF;
      END
    `);
    console.log('  ✅ CreateDomainConfigurationEnhanced created');

    // 5. Create UpdateHealthCheck procedure
    console.log('\n📋 Creating UpdateHealthCheck procedure...');
    
    await connection.query(`
      CREATE PROCEDURE UpdateHealthCheck(
        IN p_domain_config_id VARCHAR(36),
        IN p_health_status ENUM('healthy', 'unhealthy', 'unknown')
      )
      BEGIN
        UPDATE domain_configurations
        SET 
          health_status = p_health_status,
          last_health_check = NOW(),
          updated_at = NOW()
        WHERE id = p_domain_config_id;
        
        -- Log in history
        INSERT INTO domain_history (
          domain_config_id, 
          project_id,
          action, 
          new_state, 
          timestamp
        )
        SELECT 
          p_domain_config_id,
          project_id,
          'health_check',
          JSON_OBJECT('status', p_health_status, 'checked_at', NOW()),
          NOW()
        FROM domain_configurations
        WHERE id = p_domain_config_id;
      END
    `);
    console.log('  ✅ UpdateHealthCheck created');

    // 6. Create UpdateHealthCheckEnhanced procedure
    console.log('\n📋 Creating UpdateHealthCheckEnhanced procedure...');
    
    await connection.query(`
      CREATE PROCEDURE UpdateHealthCheckEnhanced(
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
    console.log('  ✅ UpdateHealthCheckEnhanced created');

    // 7. Add triggers
    console.log('\n📋 Creating triggers...');
    
    // Drop existing trigger first
    try {
      await connection.query('DROP TRIGGER IF EXISTS update_ssl_renewal_date_enhanced');
    } catch (error) {
      // Ignore if doesn't exist
    }

    await connection.query(`
      CREATE TRIGGER update_ssl_renewal_date_enhanced
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
    console.log('  ✅ SSL renewal trigger created');

    // 8. Add sample reserved domains
    console.log('\n📋 Ensuring reserved domains exist...');
    
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
        await connection.query(
          'INSERT IGNORE INTO reserved_domains (subdomain, reason) VALUES (?, ?)',
          [subdomain, reason]
        );
      } catch (error) {
        // Ignore duplicates
      }
    }
    console.log('  ✅ Reserved domains verified');

    // 9. Verify procedures
    console.log('\n📊 Verifying procedures...\n');
    
    const [procs] = await connection.query(
      `SELECT ROUTINE_NAME FROM information_schema.ROUTINES 
       WHERE ROUTINE_SCHEMA = ? AND ROUTINE_TYPE = 'PROCEDURE'
       AND ROUTINE_NAME IN (?, ?, ?, ?, ?)`,
      [
        process.env.DB_NAME,
        'CheckDomainAvailability',
        'CreateDomainConfiguration',
        'CreateDomainConfigurationEnhanced',
        'UpdateHealthCheck',
        'UpdateHealthCheckEnhanced'
      ]
    );

    console.log(`  ✅ Created ${procs.length} stored procedures:`);
    procs.forEach((p: any) => {
      console.log(`     - ${p.ROUTINE_NAME}`);
    });

    console.log('\n' + '═'.repeat(60));
    console.log('✅ JupiterDB Stored Procedures Created Successfully!');
    console.log('═'.repeat(60));

  } catch (error: any) {
    console.error('\n❌ Failed to create procedures:', error.message);
    console.error('\nStack:', error.stack);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run the script
if (require.main === module) {
  createStoredProcedures().catch(console.error);
}