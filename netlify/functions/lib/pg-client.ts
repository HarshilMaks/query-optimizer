import pg from 'pg'
import { decrypt } from './crypto.js'

const { Pool } = pg

export interface ConnectionRecord {
  id: string
  name: string
  host: string
  port: number
  database_name: string
  username: string
  password_encrypted: string
  ssl_mode: 'prefer' | 'require' | 'disable'
  status: string
  last_tested_at: string | null
  created_at: string
}

function buildPool(conn: ConnectionRecord, password: string): InstanceType<typeof Pool> {
  const sslConfig = conn.ssl_mode === 'disable' ? false : { rejectUnauthorized: false }
  return new Pool({
    host: conn.host,
    port: conn.port,
    database: conn.database_name,
    user: conn.username,
    password,
    ssl: sslConfig,
    connectionTimeoutMillis: 10000,
    max: 1,
  })
}

export async function testConnection(conn: ConnectionRecord): Promise<{ success: boolean; error?: string; pgStatEnabled?: boolean }> {
  let pool: InstanceType<typeof Pool> | null = null
  try {
    const password = decrypt(conn.password_encrypted)
    pool = buildPool(conn, password)
    const client = await pool.connect()
    try {
      await client.query('SELECT 1')
      const extRes = await client.query(`
        SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') as enabled
      `)
      return { success: true, pgStatEnabled: extRes.rows[0].enabled }
    } finally {
      client.release()
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Connection failed' }
  } finally {
    if (pool) await pool.end().catch(() => {})
  }
}

export async function getSlowQueries(conn: ConnectionRecord): Promise<{ queries: any[]; error: string | null; pgStatEnabled: boolean }> {
  let pool: InstanceType<typeof Pool> | null = null
  try {
    const password = decrypt(conn.password_encrypted)
    pool = buildPool(conn, password)
    const client = await pool.connect()
    try {
      const extRes = await client.query(`
        SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') as enabled
      `)
      if (!extRes.rows[0].enabled) {
        return { queries: [], error: null, pgStatEnabled: false }
      }
      const result = await client.query(`
        SELECT
          queryid::text AS query_hash,
          query AS query_text,
          mean_exec_time AS mean_exec_time_ms,
          calls AS total_calls,
          total_exec_time AS total_exec_time_ms,
          stddev_exec_time,
          min_exec_time,
          max_exec_time,
          NOW() AS last_seen_at
        FROM pg_stat_statements
        WHERE calls > 3
          AND mean_exec_time > 100
          AND query NOT ILIKE '%pg_stat_statements%'
          AND query NOT ILIKE '%EXPLAIN%'
          AND query NOT ILIKE '%pg_extension%'
        ORDER BY mean_exec_time DESC
        LIMIT 50
      `)
      return { queries: result.rows, error: null, pgStatEnabled: true }
    } finally {
      client.release()
    }
  } catch (err) {
    return { queries: [], error: err instanceof Error ? err.message : 'Query failed', pgStatEnabled: false }
  } finally {
    if (pool) await pool.end().catch(() => {})
  }
}

export async function runExplainAnalyze(conn: ConnectionRecord, queryText: string): Promise<{ plan: any; error: string | null }> {
  let pool: InstanceType<typeof Pool> | null = null
  try {
    const password = decrypt(conn.password_encrypted)
    pool = buildPool(conn, password)
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const result = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${queryText}`)
      await client.query('ROLLBACK')
      return { plan: result.rows[0]['QUERY PLAN'], error: null }
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      return { plan: null, error: err instanceof Error ? err.message : 'EXPLAIN ANALYZE failed' }
    } finally {
      client.release()
    }
  } finally {
    if (pool) await pool.end().catch(() => {})
  }
}
