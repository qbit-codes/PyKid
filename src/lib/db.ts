import Database from 'better-sqlite3';
import { dev } from '$app/environment';

const db = new Database(dev ? 'dev.db' : 'prod.db');

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Create tables if they don't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS otp_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_number TEXT NOT NULL,
    name TEXT NOT NULL,
    otp_code TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    verified_at INTEGER,
    attempts INTEGER DEFAULT 0,
    is_used BOOLEAN DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_phone_otp ON otp_codes(phone_number, otp_code);
  CREATE INDEX IF NOT EXISTS idx_expires_at ON otp_codes(expires_at);
  CREATE INDEX IF NOT EXISTS idx_phone_created ON otp_codes(phone_number, created_at);

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_number TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_login_at INTEGER,
    is_active BOOLEAN DEFAULT 1
  );

  CREATE INDEX IF NOT EXISTS idx_phone_number ON users(phone_number);

  CREATE TABLE IF NOT EXISTS rate_limits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_number TEXT NOT NULL,
    request_type TEXT NOT NULL, -- 'send_otp', 'verify_otp'
    request_count INTEGER DEFAULT 1,
    window_start INTEGER NOT NULL,
    UNIQUE(phone_number, request_type, window_start)
  );

  CREATE INDEX IF NOT EXISTS idx_rate_limit_phone ON rate_limits(phone_number, request_type);
  CREATE INDEX IF NOT EXISTS idx_rate_limit_window ON rate_limits(window_start);
`);

// Prepared statements for better performance
export const statements = {
  // OTP operations
  insertOTP: db.prepare(`
    INSERT INTO otp_codes (phone_number, name, otp_code, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `),
  
  findValidOTP: db.prepare(`
    SELECT * FROM otp_codes 
    WHERE phone_number = ? AND otp_code = ? AND expires_at > ? AND is_used = 0
    ORDER BY created_at DESC
    LIMIT 1
  `),
  
  markOTPAsUsed: db.prepare(`
    UPDATE otp_codes 
    SET is_used = 1, verified_at = ?, attempts = attempts + 1
    WHERE id = ?
  `),
  
  incrementOTPAttempts: db.prepare(`
    UPDATE otp_codes 
    SET attempts = attempts + 1
    WHERE phone_number = ? AND otp_code = ? AND is_used = 0
  `),
  
  getRecentOTPs: db.prepare(`
    SELECT * FROM otp_codes 
    WHERE phone_number = ? AND created_at > ?
    ORDER BY created_at DESC
  `),
  
  // User operations
  createUser: db.prepare(`
    INSERT OR REPLACE INTO users (phone_number, name, created_at, last_login_at)
    VALUES (?, ?, ?, ?)
  `),
  
  findUser: db.prepare(`
    SELECT * FROM users WHERE phone_number = ?
  `),
  
  updateLastLogin: db.prepare(`
    UPDATE users SET last_login_at = ? WHERE phone_number = ?
  `),
  
  // Rate limiting
  upsertRateLimit: db.prepare(`
    INSERT INTO rate_limits (phone_number, request_type, request_count, window_start)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(phone_number, request_type, window_start) DO UPDATE SET
    request_count = request_count + 1
  `),
  
  getRateLimit: db.prepare(`
    SELECT * FROM rate_limits 
    WHERE phone_number = ? AND request_type = ? AND window_start = ?
  `),
  
  // Cleanup operations
  cleanupExpiredOTPs: db.prepare(`
    DELETE FROM otp_codes WHERE expires_at < ?
  `),
  
  cleanupOldRateLimits: db.prepare(`
    DELETE FROM rate_limits WHERE window_start < ?
  `)
};

// Cleanup function to run periodically
export function cleanupDatabase() {
  const now = Date.now();
  const oneDayAgo = now - (24 * 60 * 60 * 1000);
  
  statements.cleanupExpiredOTPs.run(now);
  statements.cleanupOldRateLimits.run(oneDayAgo);
}

// Run cleanup on startup
cleanupDatabase();

export default db;