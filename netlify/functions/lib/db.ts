/**
 * Database Migration Utilities
 * Handles schema initialization and updates
 */

import { Pool } from 'pg'

const DATABASE_URL = process.env.DATABASE_URL
let pool: Pool | null = null

function getPool(): Pool {
  if (!pool && DATABASE_URL) {
    pool = new Pool({ connectionString: DATABASE_URL })
  }
  if (!pool) {
    throw new Error('DATABASE_URL not configured')
  }
  return pool
}

/**
 * Run all pending migrations
 */
export async function runMigrations(): Promise<{ success: boolean; message: string }> {
  try {
    const client = await getPool().connect()

    // Migration 001: Auth schema (users, sessions, audit_logs)
    const migration001 = `
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(255),
        tenant_id VARCHAR(255) NOT NULL,
        roles VARCHAR(50)[] DEFAULT ARRAY['viewer']::VARCHAR(50)[],
        is_active BOOLEAN DEFAULT TRUE,
        last_login_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE (id, tenant_id)
      );

      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active) WHERE is_active = TRUE;
      CREATE UNIQUE INDEX IF NOT EXISTS uq_users_tenant_email_lower ON users(tenant_id, LOWER(email));
      CREATE UNIQUE INDEX IF NOT EXISTS uq_users_id_tenant ON users(id, tenant_id);

      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        tenant_id VARCHAR(255) NOT NULL,
        refresh_token_hash VARCHAR(255) NOT NULL,
        access_token_hash VARCHAR(255),
        ip_address VARCHAR(45),
        user_agent TEXT,
        expires_at TIMESTAMP NOT NULL,
        last_activity_at TIMESTAMP DEFAULT NOW(),
        revoked_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_sessions_user_tenant
          FOREIGN KEY (user_id, tenant_id)
          REFERENCES users(id, tenant_id)
          ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at) WHERE revoked_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_sessions_refresh_token_hash ON sessions(refresh_token_hash);
      CREATE INDEX IF NOT EXISTS idx_sessions_tenant_user ON sessions(tenant_id, user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_tenant_revoked_expires ON sessions(tenant_id, revoked_at, expires_at DESC);

      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        tenant_id VARCHAR(255) NOT NULL,
        action VARCHAR(50) NOT NULL,
        resource_type VARCHAR(50) NOT NULL,
        resource_id VARCHAR(255) NOT NULL,
        old_value JSONB,
        new_value JSONB,
        status VARCHAR(20) DEFAULT 'success',
        error_message TEXT,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON audit_logs(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created ON audit_logs(tenant_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_action_created ON audit_logs(tenant_id, action, created_at DESC);

      -- Harden legacy schemas in-place for tenant isolation and constraints
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
      ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_user_id_fkey;
      ALTER TABLE sessions ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(255);
      UPDATE sessions s
      SET tenant_id = u.tenant_id
      FROM users u
      WHERE s.user_id = u.id AND s.tenant_id IS NULL;
      ALTER TABLE sessions ALTER COLUMN tenant_id SET NOT NULL;

      DO \$\$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_sessions_user_tenant'
        ) THEN
          ALTER TABLE sessions
          ADD CONSTRAINT fk_sessions_user_tenant
          FOREIGN KEY (user_id, tenant_id)
          REFERENCES users(id, tenant_id)
          ON DELETE CASCADE;
        END IF;
      END;
      \$\$;

      DO \$\$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_tenant_nonempty'
        ) THEN
          ALTER TABLE users
          ADD CONSTRAINT chk_users_tenant_nonempty
          CHECK (length(trim(tenant_id)) > 0);
        END IF;
      END;
      \$\$;

      DO \$\$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'chk_sessions_expires_after_created'
        ) THEN
          ALTER TABLE sessions
          ADD CONSTRAINT chk_sessions_expires_after_created
          CHECK (expires_at > created_at);
        END IF;
      END;
      \$\$;

      DO \$\$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'chk_audit_logs_status'
        ) THEN
          ALTER TABLE audit_logs
          ADD CONSTRAINT chk_audit_logs_status
          CHECK (status IN ('success', 'failure'));
        END IF;
      END;
      \$\$;

      CREATE OR REPLACE FUNCTION update_users_updated_at()
      RETURNS TRIGGER AS \$\$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      \$\$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trigger_users_updated_at ON users;
      CREATE TRIGGER trigger_users_updated_at
      BEFORE UPDATE ON users
      FOR EACH ROW
      EXECUTE FUNCTION update_users_updated_at();

      INSERT INTO users (email, password_hash, full_name, tenant_id, roles)
      VALUES ('user@example.com', '\$2b\$10\$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3XeKeUxWdeS86E36P4/KFm', 'Demo User', 'default', ARRAY['admin'])
      ON CONFLICT (email) DO NOTHING;
    `

    await client.query(migration001)
    await client.release()

    return {
      success: true,
      message: 'Migrations completed successfully',
    }
  } catch (error) {
    console.error('Migration error:', error)
    return {
      success: false,
      message: `Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

/**
 * Get user by email from database
 */
export async function getUserByEmail(email: string): Promise<any | null> {
  try {
    const result = await getPool().query('SELECT * FROM users WHERE email = $1', [email])
    return result.rows[0] || null
  } catch (error) {
    console.error('Error fetching user:', error)
    return null
  }
}

/**
 * Get user by ID from database
 */
export async function getUserById(userId: string): Promise<any | null> {
  try {
    const result = await getPool().query('SELECT * FROM users WHERE id = $1', [userId])
    return result.rows[0] || null
  } catch (error) {
    console.error('Error fetching user by ID:', error)
    return null
  }
}

/**
 * Create new user in database
 */
export async function createUser(email: string, passwordHash: string, fullName?: string): Promise<any> {
  try {
    const result = await getPool().query(
      'INSERT INTO users (email, password_hash, full_name, tenant_id, roles) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, tenant_id, roles, created_at, updated_at',
      [email, passwordHash, fullName || email.split('@')[0], 'default', ['viewer']]
    )
    return result.rows[0]
  } catch (error) {
    console.error('Error creating user:', error)
    throw error
  }
}

/**
 * Create session for user
 */
export async function createSession(userId: string, tenantId: string, refreshTokenHash: string, expiresAt: Date): Promise<any> {
  try {
    const result = await getPool().query(
      'INSERT INTO sessions (user_id, tenant_id, refresh_token_hash, expires_at) VALUES ($1, $2, $3, $4) RETURNING id, user_id, tenant_id, expires_at',
      [userId, tenantId, refreshTokenHash, expiresAt]
    )
    return result.rows[0]
  } catch (error) {
    console.error('Error creating session:', error)
    throw error
  }
}

/**
 * Log audit event
 */
export async function logAuditEvent(
  userId: string | null,
  tenantId: string,
  action: string,
  resourceType: string,
  resourceId: string,
  oldValue?: any,
  newValue?: any
): Promise<void> {
  try {
    await getPool().query(
      'INSERT INTO audit_logs (user_id, tenant_id, action, resource_type, resource_id, old_value, new_value) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [userId, tenantId, action, resourceType, resourceId, oldValue ? JSON.stringify(oldValue) : null, newValue ? JSON.stringify(newValue) : null]
    )
  } catch (error) {
    console.error('Error logging audit event:', error)
  }
}
