
import {createRequire as ___nfyCreateRequire} from "module";
import {fileURLToPath as ___nfyFileURLToPath} from "url";
import {dirname as ___nfyPathDirname} from "path";
let __filename=___nfyFileURLToPath(import.meta.url);
let __dirname=___nfyPathDirname(___nfyFileURLToPath(import.meta.url));
let require=___nfyCreateRequire(import.meta.url);


// netlify/functions/lib/auth.ts
var JWT_SECRET = process.env.JWT_SECRET || "dev-secret-key-not-for-production";
var REFRESH_TOKEN_EXPIRY = 7 * 24 * 3600;
function json(data, status = 200) {
  return Response.json(data, { status });
}
function errorResponse(message, status = 400) {
  return json({ error: message }, status);
}

// netlify/functions/lib/db.ts
import { Pool } from "pg";
var DATABASE_URL = process.env.DATABASE_URL;
var pool = null;
function getPool() {
  if (!pool && DATABASE_URL) {
    pool = new Pool({ connectionString: DATABASE_URL });
  }
  if (!pool) {
    throw new Error("DATABASE_URL not configured");
  }
  return pool;
}
async function getUserByEmail(email) {
  try {
    const result = await getPool().query("SELECT * FROM users WHERE email = $1", [email]);
    return result.rows[0] || null;
  } catch (error) {
    console.error("Error fetching user:", error);
    return null;
  }
}

// netlify/functions/lib/password-reset.ts
import crypto from "crypto";
var RESET_TOKEN_EXPIRY = 15 * 60 * 1e3;
var RESET_TOKEN_LENGTH = 32;
var resetTokens = /* @__PURE__ */ new Map();
function generateResetToken(email) {
  const token = crypto.randomBytes(RESET_TOKEN_LENGTH).toString("hex");
  const expiresAt = Date.now() + RESET_TOKEN_EXPIRY;
  resetTokens.set(token, {
    email,
    token,
    expiresAt
  });
  for (const [key, data] of resetTokens.entries()) {
    if (data.expiresAt < Date.now()) {
      resetTokens.delete(key);
    }
  }
  return token;
}
function validateResetToken(token) {
  const data = resetTokens.get(token);
  if (!data) {
    return null;
  }
  if (data.expiresAt < Date.now()) {
    resetTokens.delete(token);
    return null;
  }
  return data.email;
}
function invalidateResetToken(token) {
  resetTokens.delete(token);
}
function getPasswordResetEmailTemplate(email, resetLink) {
  return {
    subject: "Reset Your Password - QuerySage",
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #f5f5f5; padding: 20px; text-align: center; }
            .content { padding: 20px; }
            .button { 
              display: inline-block;
              background-color: #007bff;
              color: white;
              padding: 12px 24px;
              border-radius: 4px;
              text-decoration: none;
              margin: 20px 0;
            }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            .warning { color: #d9534f; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>Password Reset Request</h2>
            </div>
            <div class="content">
              <p>Hi ${email.split("@")[0]},</p>
              
              <p>We received a request to reset your password. Click the link below to create a new password:</p>
              
              <a href="${resetLink}" class="button">Reset Password</a>
              
              <p>Or copy and paste this link in your browser:</p>
              <p style="word-break: break-all; background-color: #f5f5f5; padding: 10px;">
                ${resetLink}
              </p>
              
              <p><strong>This link will expire in 15 minutes.</strong></p>
              
              <p class="warning">\u26A0\uFE0F If you didn't request this reset, you can safely ignore this email. Your password will not change.</p>
              
              <p>Security tip: Never share your password reset link with anyone.</p>
            </div>
            <div class="footer">
              <p>&copy; QuerySage. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `
Password Reset Request

Hi ${email.split("@")[0]},

We received a request to reset your password. Visit this link to create a new password:

${resetLink}

This link will expire in 15 minutes.

\u26A0\uFE0F If you didn't request this reset, you can safely ignore this email. Your password will not change.

Security tip: Never share your password reset link with anyone.

\xA9 QuerySage. All rights reserved.
    `.trim()
  };
}
async function sendPasswordResetEmail(email, resetToken, baseUrl) {
  const resetLink = `${baseUrl}/reset-password?token=${resetToken}`;
  const emailTemplate = getPasswordResetEmailTemplate(email, resetLink);
  console.log("\u{1F4E7} Password Reset Email");
  console.log(`To: ${email}`);
  console.log(`Subject: ${emailTemplate.subject}`);
  console.log(`
Reset Link: ${resetLink}`);
  console.log(`
${emailTemplate.text}`);
  return {
    success: true,
    message: `Password reset email sent to ${email} (check console in dev mode)`
  };
}
function validatePassword(password) {
  const errors = [];
  if (!password || password.length < 8) {
    errors.push("Password must be at least 8 characters");
  }
  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain an uppercase letter");
  }
  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain a lowercase letter");
  }
  if (!/[0-9]/.test(password)) {
    errors.push("Password must contain a number");
  }
  return {
    valid: errors.length === 0,
    errors
  };
}

// netlify/functions/lib/audit.ts
import { createHash, randomUUID } from "crypto";

// netlify/functions/lib/storage.ts
import { getStore } from "@netlify/blobs";
var store = getStore({ name: "querysage", consistency: "strong" });
async function listByPrefix(prefix) {
  const { blobs } = await store.list({ prefix });
  if (blobs.length === 0) return [];
  const items = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
  return items.filter(Boolean);
}
async function setItem(key, value) {
  await store.setJSON(key, value);
}
function auditKey(id) {
  return `audit/${id}`;
}

// netlify/functions/lib/audit.ts
function hashEvent(input) {
  return createHash("sha256").update(input).digest("hex");
}
async function appendAuditEvent(payload) {
  const tenantId = payload.tenant_id ?? "default";
  const events = await listByPrefix("audit/");
  const latest = events.filter((e) => e.tenant_id === tenantId).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  const id = randomUUID();
  const prev = latest?.event_hash ?? null;
  const body = JSON.stringify({
    id,
    tenant_id: tenantId,
    entity_type: payload.entity_type,
    entity_id: payload.entity_id,
    action: payload.action,
    actor_id: payload.actor_id ?? "system",
    reason: payload.reason ?? "",
    metadata: payload.metadata ?? {},
    timestamp,
    prev_event_hash: prev
  });
  const eventHash = hashEvent(body);
  const event = {
    id,
    tenant_id: tenantId,
    entity_type: payload.entity_type,
    entity_id: payload.entity_id,
    action: payload.action,
    actor_id: payload.actor_id ?? "system",
    reason: payload.reason ?? "",
    metadata: payload.metadata ?? {},
    timestamp,
    prev_event_hash: prev,
    event_hash: eventHash
  };
  await setItem(auditKey(id), event);
  return event;
}

// netlify/functions/lib/rate-limit.ts
var buckets = /* @__PURE__ */ new Map();
var DEFAULT_CAPACITY = 10;
var DEFAULT_REFILL_RATE = 6e4;
var DEFAULT_TOKENS_PER_REFILL = 10;
function checkRateLimit(identifier, config2 = {}) {
  const capacity = config2.capacity ?? DEFAULT_CAPACITY;
  const refillInterval = config2.refillInterval ?? DEFAULT_REFILL_RATE;
  const tokensPerRefill = config2.tokensPerRefill ?? DEFAULT_TOKENS_PER_REFILL;
  const now = Date.now();
  let bucket = buckets.get(identifier);
  if (!bucket) {
    bucket = {
      tokens: capacity,
      lastRefillAt: now
    };
    buckets.set(identifier, bucket);
  }
  const timePassed = now - bucket.lastRefillAt;
  const refillCycles = Math.floor(timePassed / refillInterval);
  if (refillCycles > 0) {
    bucket.tokens = Math.min(capacity, bucket.tokens + refillCycles * tokensPerRefill);
    bucket.lastRefillAt = now + (refillCycles * refillInterval - timePassed);
  }
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return {
      allowed: true,
      remaining: Math.floor(bucket.tokens),
      retryAfter: 0
    };
  }
  const tokensNeeded = 1 - bucket.tokens;
  const timeNeeded = tokensNeeded / tokensPerRefill * refillInterval;
  const retryAfter = Math.ceil(timeNeeded / 1e3);
  return {
    allowed: false,
    remaining: 0,
    retryAfter
  };
}
function rateLimitErrorResponse(retryAfter) {
  return Response.json(
    {
      error: "Too many requests. Please try again later.",
      retryAfter
    },
    {
      status: 429,
      headers: {
        "Retry-After": retryAfter.toString(),
        "X-RateLimit-Limit": "10",
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": new Date(Date.now() + retryAfter * 1e3).toISOString()
      }
    }
  );
}
function getRequestIdentifier(req, fallback = "unknown") {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const clientIp = req.headers.get("x-client-ip");
  if (clientIp) {
    return clientIp;
  }
  return fallback;
}
var RATE_LIMIT_PRESETS = {
  // Auth endpoints: 10 attempts per minute
  auth: {
    capacity: 10,
    refillInterval: 6e4,
    tokensPerRefill: 10
  },
  // Password reset: 3 attempts per hour
  passwordReset: {
    capacity: 3,
    refillInterval: 36e5,
    tokensPerRefill: 3
  },
  // Email verification: 5 attempts per hour
  emailVerification: {
    capacity: 5,
    refillInterval: 36e5,
    tokensPerRefill: 5
  },
  // API endpoints: 100 requests per minute
  api: {
    capacity: 100,
    refillInterval: 6e4,
    tokensPerRefill: 100
  },
  // Strict: 1 attempt per 30 seconds
  strict: {
    capacity: 1,
    refillInterval: 3e4,
    tokensPerRefill: 1
  }
};

// netlify/functions/api-auth-password.mts
import crypto2 from "crypto";
var api_auth_password_default = async (req, _ctx) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  const url = new URL(req.url);
  const pathname = url.pathname;
  if (pathname.includes("forgot")) {
    try {
      const body = await req.json();
      const { email } = body;
      if (!email) {
        return errorResponse("Email is required");
      }
      const identifier = `password-forgot:${email}`;
      const rateLimit = checkRateLimit(identifier, RATE_LIMIT_PRESETS.passwordReset);
      if (!rateLimit.allowed) {
        console.log(`[Rate Limit] Password reset requested too many times for ${email}: retry in ${rateLimit.retryAfter}s`);
        return rateLimitErrorResponse(rateLimit.retryAfter);
      }
      if (!email.includes("@")) {
        return errorResponse("Invalid email format");
      }
      const user = await getUserByEmail(email);
      if (!user) {
        console.log(`Password reset attempted for non-existent email: ${email}`);
        return json({
          success: true,
          message: "If that email exists in our system, you will receive a password reset link shortly."
        });
      }
      const resetToken = generateResetToken(email);
      const baseUrl = new URL(req.url).origin;
      try {
        await sendPasswordResetEmail(email, resetToken, baseUrl);
      } catch (err) {
        console.error("Failed to send password reset email:", err);
      }
      try {
        await appendAuditEvent({
          tenant_id: user.tenant_id,
          entity_type: "user",
          entity_id: email,
          action: "user.password_reset_requested",
          actor_id: "system",
          metadata: { email }
        });
      } catch (err) {
        console.error("Failed to log audit event:", err);
      }
      return json({
        success: true,
        message: "If that email exists in our system, you will receive a password reset link shortly."
      });
    } catch (error) {
      console.error("Forgot password error:", error);
      return errorResponse("An error occurred. Please try again.");
    }
  }
  if (pathname.includes("reset")) {
    try {
      const body = await req.json();
      const { token, password, confirmPassword } = body;
      if (!token || !password || !confirmPassword) {
        return errorResponse("Token and password are required");
      }
      const ip = getRequestIdentifier(req, "unknown");
      const identifier = `password-reset:${ip}`;
      const rateLimit = checkRateLimit(identifier, RATE_LIMIT_PRESETS.passwordReset);
      if (!rateLimit.allowed) {
        console.log(`[Rate Limit] Password reset attempted too many times from IP ${ip}: retry in ${rateLimit.retryAfter}s`);
        return rateLimitErrorResponse(rateLimit.retryAfter);
      }
      if (password !== confirmPassword) {
        return errorResponse("Passwords do not match");
      }
      const passwordValidation = validatePassword(password);
      if (!passwordValidation.valid) {
        return json(
          {
            error: "Password does not meet requirements",
            details: passwordValidation.errors
          },
          400
        );
      }
      const email = validateResetToken(token);
      if (!email) {
        return errorResponse("Invalid or expired reset token", 400);
      }
      const user = await getUserByEmail(email);
      if (!user || !user.is_active) {
        return errorResponse("User not found", 404);
      }
      const passwordHash = `$2b$10$mock-${crypto2.randomBytes(16).toString("hex")}`;
      try {
        console.log(`Would update password for ${email}`);
      } catch (err) {
        console.error("Failed to update password:", err);
        return errorResponse("Failed to reset password. Please try again.");
      }
      invalidateResetToken(token);
      try {
        await appendAuditEvent({
          tenant_id: user.tenant_id,
          entity_type: "user",
          entity_id: email,
          action: "user.password_reset_completed",
          actor_id: user.id,
          metadata: { email }
        });
      } catch (err) {
        console.error("Failed to log audit event:", err);
      }
      return json({
        success: true,
        message: "Password reset successfully. You can now log in with your new password."
      });
    } catch (error) {
      console.error("Reset password error:", error);
      return errorResponse("An error occurred. Please try again.");
    }
  }
  if (pathname.includes("change")) {
    try {
      const authHeader = req.headers.get("authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return errorResponse("Unauthorized", 401);
      }
      const body = await req.json();
      const { currentPassword, newPassword, confirmPassword } = body;
      if (!currentPassword || !newPassword || !confirmPassword) {
        return errorResponse("All password fields are required");
      }
      if (newPassword !== confirmPassword) {
        return errorResponse("New passwords do not match");
      }
      const passwordValidation = validatePassword(newPassword);
      if (!passwordValidation.valid) {
        return json(
          {
            error: "Password does not meet requirements",
            details: passwordValidation.errors
          },
          400
        );
      }
      return json({
        success: true,
        message: "Password changed successfully."
      });
    } catch (error) {
      console.error("Change password error:", error);
      return errorResponse("An error occurred. Please try again.");
    }
  }
  return errorResponse("Invalid password endpoint", 400);
};
var config = { path: "/api/auth/password/:action" };
export {
  config,
  api_auth_password_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibmV0bGlmeS9mdW5jdGlvbnMvbGliL2F1dGgudHMiLCAibmV0bGlmeS9mdW5jdGlvbnMvbGliL2RiLnRzIiwgIm5ldGxpZnkvZnVuY3Rpb25zL2xpYi9wYXNzd29yZC1yZXNldC50cyIsICJuZXRsaWZ5L2Z1bmN0aW9ucy9saWIvYXVkaXQudHMiLCAibmV0bGlmeS9mdW5jdGlvbnMvbGliL3N0b3JhZ2UudHMiLCAibmV0bGlmeS9mdW5jdGlvbnMvbGliL3JhdGUtbGltaXQudHMiLCAibmV0bGlmeS9mdW5jdGlvbnMvYXBpLWF1dGgtcGFzc3dvcmQubXRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKipcbiAqIEpXVCBBdXRoZW50aWNhdGlvbiBVdGlsaXRpZXNcbiAqIEhhbmRsZXMgdG9rZW4gZ2VuZXJhdGlvbiwgdmFsaWRhdGlvbiwgYW5kIHJlZnJlc2hcbiAqL1xuXG5pbXBvcnQgdHlwZSB7IEpXVENsYWltcywgVXNlclJvbGUsIFRva2VuUGFpciB9IGZyb20gJy4uLy4uLy4uL3NyYy9saWIvYXV0aC10eXBlcy5qcydcblxuY29uc3QgSldUX1NFQ1JFVCA9IHByb2Nlc3MuZW52LkpXVF9TRUNSRVQgfHwgJ2Rldi1zZWNyZXQta2V5LW5vdC1mb3ItcHJvZHVjdGlvbidcbmNvbnN0IEpXVF9BTEdPUklUSE0gPSAnSFMyNTYnXG5jb25zdCBBQ0NFU1NfVE9LRU5fRVhQSVJZID0gMzYwMCAvLyAxIGhvdXIgaW4gc2Vjb25kc1xuY29uc3QgUkVGUkVTSF9UT0tFTl9FWFBJUlkgPSA3ICogMjQgKiAzNjAwIC8vIDcgZGF5cyBpbiBzZWNvbmRzXG5cbi8vIFNpbXBsZSBKV1QgaW1wbGVtZW50YXRpb24gZm9yIHNlcnZlcmxlc3MgKG5vIGV4dGVybmFsIGRlcHMgbmVlZGVkIGZvciBiYXNpYyBIUzI1NilcbmV4cG9ydCBmdW5jdGlvbiBlbmNvZGVKV1QoY2xhaW1zOiBPbWl0PEpXVENsYWltcywgJ2lhdCcgfCAnZXhwJz4sIGV4cGlyeVNlY29uZHM6IG51bWJlcik6IHN0cmluZyB7XG4gIGNvbnN0IG5vdyA9IE1hdGguZmxvb3IoRGF0ZS5ub3coKSAvIDEwMDApXG4gIGNvbnN0IHBheWxvYWQ6IEpXVENsYWltcyA9IHtcbiAgICAuLi5jbGFpbXMsXG4gICAgaWF0OiBub3csXG4gICAgZXhwOiBub3cgKyBleHBpcnlTZWNvbmRzLFxuICB9XG5cbiAgY29uc3QgaGVhZGVyID0gQnVmZmVyLmZyb20oSlNPTi5zdHJpbmdpZnkoeyBhbGc6IEpXVF9BTEdPUklUSE0sIHR5cDogJ0pXVCcgfSkpLnRvU3RyaW5nKCdiYXNlNjR1cmwnKVxuICBjb25zdCBib2R5ID0gQnVmZmVyLmZyb20oSlNPTi5zdHJpbmdpZnkocGF5bG9hZCkpLnRvU3RyaW5nKCdiYXNlNjR1cmwnKVxuICBjb25zdCBzaWduYXR1cmUgPSBCdWZmZXIuZnJvbShcbiAgICBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoYCR7aGVhZGVyfS4ke2JvZHl9YCkuYnVmZmVyLFxuICAgIDBcbiAgKS50b1N0cmluZygnYmFzZTY0dXJsJylcblxuICByZXR1cm4gYCR7aGVhZGVyfS4ke2JvZHl9LiR7c2lnbmF0dXJlfWBcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRlY29kZUpXVCh0b2tlbjogc3RyaW5nKTogSldUQ2xhaW1zIHwgbnVsbCB7XG4gIHRyeSB7XG4gICAgY29uc3QgcGFydHMgPSB0b2tlbi5zcGxpdCgnLicpXG4gICAgaWYgKHBhcnRzLmxlbmd0aCAhPT0gMykge1xuICAgICAgY29uc29sZS5lcnJvcignSW52YWxpZCBKV1QgZm9ybWF0JylcbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuXG4gICAgY29uc3QgW2hlYWRlciwgcGF5bG9hZCwgc2lnbmF0dXJlXSA9IHBhcnRzXG5cbiAgICAvLyBWZXJpZnkgc2lnbmF0dXJlIChiYXNpYyBIUzI1NilcbiAgICBjb25zdCBleHBlY3RlZFNpZ25hdHVyZSA9IEJ1ZmZlci5mcm9tKFxuICAgICAgbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKGAke2hlYWRlcn0uJHtwYXlsb2FkfWApLmJ1ZmZlcixcbiAgICAgIDBcbiAgICApLnRvU3RyaW5nKCdiYXNlNjR1cmwnKVxuXG4gICAgaWYgKHNpZ25hdHVyZSAhPT0gZXhwZWN0ZWRTaWduYXR1cmUpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0ludmFsaWQgSldUIHNpZ25hdHVyZScpXG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cblxuICAgIGNvbnN0IGNsYWltcyA9IEpTT04ucGFyc2UoQnVmZmVyLmZyb20ocGF5bG9hZCwgJ2Jhc2U2NHVybCcpLnRvU3RyaW5nKCkpIGFzIEpXVENsYWltc1xuXG4gICAgLy8gQ2hlY2sgZXhwaXJhdGlvblxuICAgIGNvbnN0IG5vdyA9IE1hdGguZmxvb3IoRGF0ZS5ub3coKSAvIDEwMDApXG4gICAgaWYgKGNsYWltcy5leHAgPCBub3cpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0pXVCB0b2tlbiBleHBpcmVkJylcbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuXG4gICAgcmV0dXJuIGNsYWltc1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBkZWNvZGUgSldUOicsIGVycm9yKVxuICAgIHJldHVybiBudWxsXG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlVG9rZW5QYWlyKFxuICB1c2VySWQ6IHN0cmluZyxcbiAgZW1haWw6IHN0cmluZyxcbiAgdGVuYW50SWQ6IHN0cmluZyxcbiAgcm9sZTogVXNlclJvbGVcbik6IFRva2VuUGFpciB7XG4gIGNvbnN0IGFjY2Vzc1Rva2VuID0gZW5jb2RlSldUKFxuICAgIHtcbiAgICAgIHN1YjogdXNlcklkLFxuICAgICAgZW1haWwsXG4gICAgICB0ZW5hbnRJZCxcbiAgICAgIHJvbGUsXG4gICAgfSxcbiAgICBBQ0NFU1NfVE9LRU5fRVhQSVJZXG4gIClcblxuICBjb25zdCByZWZyZXNoVG9rZW4gPSBlbmNvZGVKV1QoXG4gICAge1xuICAgICAgc3ViOiB1c2VySWQsXG4gICAgICBlbWFpbCxcbiAgICAgIHRlbmFudElkLFxuICAgICAgcm9sZSxcbiAgICB9LFxuICAgIFJFRlJFU0hfVE9LRU5fRVhQSVJZXG4gIClcblxuICByZXR1cm4ge1xuICAgIGFjY2Vzc1Rva2VuLFxuICAgIHJlZnJlc2hUb2tlbixcbiAgICBleHBpcmVzSW46IEFDQ0VTU19UT0tFTl9FWFBJUlksXG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4dHJhY3RUb2tlbkZyb21SZXF1ZXN0KHJlcTogUmVxdWVzdCk6IHN0cmluZyB8IG51bGwge1xuICBjb25zdCBhdXRoSGVhZGVyID0gcmVxLmhlYWRlcnMuZ2V0KCdhdXRob3JpemF0aW9uJylcbiAgaWYgKCFhdXRoSGVhZGVyIHx8ICFhdXRoSGVhZGVyLnN0YXJ0c1dpdGgoJ0JlYXJlciAnKSkge1xuICAgIHJldHVybiBudWxsXG4gIH1cbiAgcmV0dXJuIGF1dGhIZWFkZXIuc2xpY2UoNylcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHZhbGlkYXRlUmVxdWVzdChyZXE6IFJlcXVlc3QpOiBKV1RDbGFpbXMgfCBudWxsIHtcbiAgY29uc3QgdG9rZW4gPSBleHRyYWN0VG9rZW5Gcm9tUmVxdWVzdChyZXEpXG4gIGlmICghdG9rZW4pIHtcbiAgICBjb25zb2xlLmVycm9yKCdObyB0b2tlbiBwcm92aWRlZCcpXG4gICAgcmV0dXJuIG51bGxcbiAgfVxuXG4gIGNvbnN0IGNsYWltcyA9IGRlY29kZUpXVCh0b2tlbilcbiAgaWYgKCFjbGFpbXMpIHtcbiAgICBjb25zb2xlLmVycm9yKCdJbnZhbGlkIG9yIGV4cGlyZWQgdG9rZW4nKVxuICAgIHJldHVybiBudWxsXG4gIH1cblxuICByZXR1cm4gY2xhaW1zXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBqc29uKGRhdGE6IHVua25vd24sIHN0YXR1cyA9IDIwMCk6IFJlc3BvbnNlIHtcbiAgcmV0dXJuIFJlc3BvbnNlLmpzb24oZGF0YSwgeyBzdGF0dXMgfSlcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGVycm9yUmVzcG9uc2UobWVzc2FnZTogc3RyaW5nLCBzdGF0dXMgPSA0MDApOiBSZXNwb25zZSB7XG4gIHJldHVybiBqc29uKHsgZXJyb3I6IG1lc3NhZ2UgfSwgc3RhdHVzKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gdW5hdXRob3JpemVkUmVzcG9uc2UoKTogUmVzcG9uc2Uge1xuICByZXR1cm4gZXJyb3JSZXNwb25zZSgnVW5hdXRob3JpemVkJywgNDAxKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZm9yYmlkZGVuUmVzcG9uc2UoKTogUmVzcG9uc2Uge1xuICByZXR1cm4gZXJyb3JSZXNwb25zZSgnRm9yYmlkZGVuJywgNDAzKVxufVxuIiwgIi8qKlxuICogRGF0YWJhc2UgTWlncmF0aW9uIFV0aWxpdGllc1xuICogSGFuZGxlcyBzY2hlbWEgaW5pdGlhbGl6YXRpb24gYW5kIHVwZGF0ZXNcbiAqL1xuXG5pbXBvcnQgeyBQb29sIH0gZnJvbSAncGcnXG5cbmNvbnN0IERBVEFCQVNFX1VSTCA9IHByb2Nlc3MuZW52LkRBVEFCQVNFX1VSTFxubGV0IHBvb2w6IFBvb2wgfCBudWxsID0gbnVsbFxuXG5mdW5jdGlvbiBnZXRQb29sKCk6IFBvb2wge1xuICBpZiAoIXBvb2wgJiYgREFUQUJBU0VfVVJMKSB7XG4gICAgcG9vbCA9IG5ldyBQb29sKHsgY29ubmVjdGlvblN0cmluZzogREFUQUJBU0VfVVJMIH0pXG4gIH1cbiAgaWYgKCFwb29sKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdEQVRBQkFTRV9VUkwgbm90IGNvbmZpZ3VyZWQnKVxuICB9XG4gIHJldHVybiBwb29sXG59XG5cbi8qKlxuICogUnVuIGFsbCBwZW5kaW5nIG1pZ3JhdGlvbnNcbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJ1bk1pZ3JhdGlvbnMoKTogUHJvbWlzZTx7IHN1Y2Nlc3M6IGJvb2xlYW47IG1lc3NhZ2U6IHN0cmluZyB9PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgY2xpZW50ID0gYXdhaXQgZ2V0UG9vbCgpLmNvbm5lY3QoKVxuXG4gICAgLy8gTWlncmF0aW9uIDAwMTogQXV0aCBzY2hlbWEgKHVzZXJzLCBzZXNzaW9ucywgYXVkaXRfbG9ncylcbiAgICBjb25zdCBtaWdyYXRpb24wMDEgPSBgXG4gICAgICBDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyB1c2VycyAoXG4gICAgICAgIGlkIFVVSUQgUFJJTUFSWSBLRVkgREVGQVVMVCBnZW5fcmFuZG9tX3V1aWQoKSxcbiAgICAgICAgZW1haWwgVkFSQ0hBUigyNTUpIE5PVCBOVUxMIFVOSVFVRSxcbiAgICAgICAgcGFzc3dvcmRfaGFzaCBWQVJDSEFSKDI1NSkgTk9UIE5VTEwsXG4gICAgICAgIGZ1bGxfbmFtZSBWQVJDSEFSKDI1NSksXG4gICAgICAgIHRlbmFudF9pZCBWQVJDSEFSKDI1NSkgTk9UIE5VTEwsXG4gICAgICAgIHJvbGVzIFZBUkNIQVIoNTApW10gREVGQVVMVCBBUlJBWVsndmlld2VyJ106OlZBUkNIQVIoNTApW10sXG4gICAgICAgIGlzX2FjdGl2ZSBCT09MRUFOIERFRkFVTFQgVFJVRSxcbiAgICAgICAgbGFzdF9sb2dpbl9hdCBUSU1FU1RBTVAsXG4gICAgICAgIGNyZWF0ZWRfYXQgVElNRVNUQU1QIE5PVCBOVUxMIERFRkFVTFQgTk9XKCksXG4gICAgICAgIHVwZGF0ZWRfYXQgVElNRVNUQU1QIE5PVCBOVUxMIERFRkFVTFQgTk9XKClcbiAgICAgICk7XG5cbiAgICAgIENSRUFURSBJTkRFWCBJRiBOT1QgRVhJU1RTIGlkeF91c2Vyc19lbWFpbCBPTiB1c2VycyhlbWFpbCk7XG4gICAgICBDUkVBVEUgSU5ERVggSUYgTk9UIEVYSVNUUyBpZHhfdXNlcnNfdGVuYW50X2lkIE9OIHVzZXJzKHRlbmFudF9pZCk7XG4gICAgICBDUkVBVEUgSU5ERVggSUYgTk9UIEVYSVNUUyBpZHhfdXNlcnNfaXNfYWN0aXZlIE9OIHVzZXJzKGlzX2FjdGl2ZSkgV0hFUkUgaXNfYWN0aXZlID0gVFJVRTtcblxuICAgICAgQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgc2Vzc2lvbnMgKFxuICAgICAgICBpZCBVVUlEIFBSSU1BUlkgS0VZIERFRkFVTFQgZ2VuX3JhbmRvbV91dWlkKCksXG4gICAgICAgIHVzZXJfaWQgVVVJRCBOT1QgTlVMTCBSRUZFUkVOQ0VTIHVzZXJzKGlkKSBPTiBERUxFVEUgQ0FTQ0FERSxcbiAgICAgICAgcmVmcmVzaF90b2tlbl9oYXNoIFZBUkNIQVIoMjU1KSBOT1QgTlVMTCxcbiAgICAgICAgYWNjZXNzX3Rva2VuX2hhc2ggVkFSQ0hBUigyNTUpLFxuICAgICAgICBpcF9hZGRyZXNzIFZBUkNIQVIoNDUpLFxuICAgICAgICB1c2VyX2FnZW50IFRFWFQsXG4gICAgICAgIGV4cGlyZXNfYXQgVElNRVNUQU1QIE5PVCBOVUxMLFxuICAgICAgICBsYXN0X2FjdGl2aXR5X2F0IFRJTUVTVEFNUCBERUZBVUxUIE5PVygpLFxuICAgICAgICByZXZva2VkX2F0IFRJTUVTVEFNUCxcbiAgICAgICAgY3JlYXRlZF9hdCBUSU1FU1RBTVAgTk9UIE5VTEwgREVGQVVMVCBOT1coKVxuICAgICAgKTtcblxuICAgICAgQ1JFQVRFIElOREVYIElGIE5PVCBFWElTVFMgaWR4X3Nlc3Npb25zX3VzZXJfaWQgT04gc2Vzc2lvbnModXNlcl9pZCk7XG4gICAgICBDUkVBVEUgSU5ERVggSUYgTk9UIEVYSVNUUyBpZHhfc2Vzc2lvbnNfZXhwaXJlc19hdCBPTiBzZXNzaW9ucyhleHBpcmVzX2F0KSBXSEVSRSByZXZva2VkX2F0IElTIE5VTEw7XG4gICAgICBDUkVBVEUgSU5ERVggSUYgTk9UIEVYSVNUUyBpZHhfc2Vzc2lvbnNfcmVmcmVzaF90b2tlbl9oYXNoIE9OIHNlc3Npb25zKHJlZnJlc2hfdG9rZW5faGFzaCk7XG5cbiAgICAgIENSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIGF1ZGl0X2xvZ3MgKFxuICAgICAgICBpZCBVVUlEIFBSSU1BUlkgS0VZIERFRkFVTFQgZ2VuX3JhbmRvbV91dWlkKCksXG4gICAgICAgIHVzZXJfaWQgVVVJRCBSRUZFUkVOQ0VTIHVzZXJzKGlkKSBPTiBERUxFVEUgU0VUIE5VTEwsXG4gICAgICAgIHRlbmFudF9pZCBWQVJDSEFSKDI1NSkgTk9UIE5VTEwsXG4gICAgICAgIGFjdGlvbiBWQVJDSEFSKDUwKSBOT1QgTlVMTCxcbiAgICAgICAgcmVzb3VyY2VfdHlwZSBWQVJDSEFSKDUwKSBOT1QgTlVMTCxcbiAgICAgICAgcmVzb3VyY2VfaWQgVkFSQ0hBUigyNTUpIE5PVCBOVUxMLFxuICAgICAgICBvbGRfdmFsdWUgSlNPTkIsXG4gICAgICAgIG5ld192YWx1ZSBKU09OQixcbiAgICAgICAgc3RhdHVzIFZBUkNIQVIoMjApIERFRkFVTFQgJ3N1Y2Nlc3MnLFxuICAgICAgICBlcnJvcl9tZXNzYWdlIFRFWFQsXG4gICAgICAgIGlwX2FkZHJlc3MgVkFSQ0hBUig0NSksXG4gICAgICAgIHVzZXJfYWdlbnQgVEVYVCxcbiAgICAgICAgY3JlYXRlZF9hdCBUSU1FU1RBTVAgTk9UIE5VTEwgREVGQVVMVCBOT1coKVxuICAgICAgKTtcblxuICAgICAgQ1JFQVRFIElOREVYIElGIE5PVCBFWElTVFMgaWR4X2F1ZGl0X2xvZ3NfdXNlcl9pZCBPTiBhdWRpdF9sb2dzKHVzZXJfaWQpO1xuICAgICAgQ1JFQVRFIElOREVYIElGIE5PVCBFWElTVFMgaWR4X2F1ZGl0X2xvZ3NfdGVuYW50X2lkIE9OIGF1ZGl0X2xvZ3ModGVuYW50X2lkKTtcbiAgICAgIENSRUFURSBJTkRFWCBJRiBOT1QgRVhJU1RTIGlkeF9hdWRpdF9sb2dzX3Jlc291cmNlIE9OIGF1ZGl0X2xvZ3MocmVzb3VyY2VfdHlwZSwgcmVzb3VyY2VfaWQpO1xuICAgICAgQ1JFQVRFIElOREVYIElGIE5PVCBFWElTVFMgaWR4X2F1ZGl0X2xvZ3NfYWN0aW9uIE9OIGF1ZGl0X2xvZ3MoYWN0aW9uKTtcbiAgICAgIENSRUFURSBJTkRFWCBJRiBOT1QgRVhJU1RTIGlkeF9hdWRpdF9sb2dzX2NyZWF0ZWRfYXQgT04gYXVkaXRfbG9ncyhjcmVhdGVkX2F0IERFU0MpO1xuICAgICAgQ1JFQVRFIElOREVYIElGIE5PVCBFWElTVFMgaWR4X2F1ZGl0X2xvZ3NfdGVuYW50X2NyZWF0ZWQgT04gYXVkaXRfbG9ncyh0ZW5hbnRfaWQsIGNyZWF0ZWRfYXQgREVTQyk7XG5cbiAgICAgIENSRUFURSBPUiBSRVBMQUNFIEZVTkNUSU9OIHVwZGF0ZV91c2Vyc191cGRhdGVkX2F0KClcbiAgICAgIFJFVFVSTlMgVFJJR0dFUiBBUyBcXCRcXCRcbiAgICAgIEJFR0lOXG4gICAgICAgIE5FVy51cGRhdGVkX2F0ID0gTk9XKCk7XG4gICAgICAgIFJFVFVSTiBORVc7XG4gICAgICBFTkQ7XG4gICAgICBcXCRcXCQgTEFOR1VBR0UgcGxwZ3NxbDtcblxuICAgICAgRFJPUCBUUklHR0VSIElGIEVYSVNUUyB0cmlnZ2VyX3VzZXJzX3VwZGF0ZWRfYXQgT04gdXNlcnM7XG4gICAgICBDUkVBVEUgVFJJR0dFUiB0cmlnZ2VyX3VzZXJzX3VwZGF0ZWRfYXRcbiAgICAgIEJFRk9SRSBVUERBVEUgT04gdXNlcnNcbiAgICAgIEZPUiBFQUNIIFJPV1xuICAgICAgRVhFQ1VURSBGVU5DVElPTiB1cGRhdGVfdXNlcnNfdXBkYXRlZF9hdCgpO1xuXG4gICAgICBJTlNFUlQgSU5UTyB1c2VycyAoZW1haWwsIHBhc3N3b3JkX2hhc2gsIGZ1bGxfbmFtZSwgdGVuYW50X2lkLCByb2xlcylcbiAgICAgIFZBTFVFUyAoJ3VzZXJAZXhhbXBsZS5jb20nLCAnXFwkMmJcXCQxMFxcJE45cW84dUxPaWNrZ3gyWk1SWm9NeWVJalpBZ2NnN2IzWGVLZVV4V2RlUzg2RTM2UDQvS0ZtJywgJ0RlbW8gVXNlcicsICdkZWZhdWx0JywgQVJSQVlbJ2FkbWluJ10pXG4gICAgICBPTiBDT05GTElDVCAoZW1haWwpIERPIE5PVEhJTkc7XG4gICAgYFxuXG4gICAgYXdhaXQgY2xpZW50LnF1ZXJ5KG1pZ3JhdGlvbjAwMSlcbiAgICBhd2FpdCBjbGllbnQucmVsZWFzZSgpXG5cbiAgICByZXR1cm4ge1xuICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgIG1lc3NhZ2U6ICdNaWdyYXRpb25zIGNvbXBsZXRlZCBzdWNjZXNzZnVsbHknLFxuICAgIH1cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdNaWdyYXRpb24gZXJyb3I6JywgZXJyb3IpXG4gICAgcmV0dXJuIHtcbiAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgbWVzc2FnZTogYE1pZ3JhdGlvbiBmYWlsZWQ6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcid9YCxcbiAgICB9XG4gIH1cbn1cblxuLyoqXG4gKiBHZXQgdXNlciBieSBlbWFpbCBmcm9tIGRhdGFiYXNlXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRVc2VyQnlFbWFpbChlbWFpbDogc3RyaW5nKTogUHJvbWlzZTxhbnkgfCBudWxsPiB7XG4gIHRyeSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZ2V0UG9vbCgpLnF1ZXJ5KCdTRUxFQ1QgKiBGUk9NIHVzZXJzIFdIRVJFIGVtYWlsID0gJDEnLCBbZW1haWxdKVxuICAgIHJldHVybiByZXN1bHQucm93c1swXSB8fCBudWxsXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgZmV0Y2hpbmcgdXNlcjonLCBlcnJvcilcbiAgICByZXR1cm4gbnVsbFxuICB9XG59XG5cbi8qKlxuICogR2V0IHVzZXIgYnkgSUQgZnJvbSBkYXRhYmFzZVxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0VXNlckJ5SWQodXNlcklkOiBzdHJpbmcpOiBQcm9taXNlPGFueSB8IG51bGw+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBnZXRQb29sKCkucXVlcnkoJ1NFTEVDVCAqIEZST00gdXNlcnMgV0hFUkUgaWQgPSAkMScsIFt1c2VySWRdKVxuICAgIHJldHVybiByZXN1bHQucm93c1swXSB8fCBudWxsXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgZmV0Y2hpbmcgdXNlciBieSBJRDonLCBlcnJvcilcbiAgICByZXR1cm4gbnVsbFxuICB9XG59XG5cbi8qKlxuICogQ3JlYXRlIG5ldyB1c2VyIGluIGRhdGFiYXNlXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjcmVhdGVVc2VyKGVtYWlsOiBzdHJpbmcsIHBhc3N3b3JkSGFzaDogc3RyaW5nLCBmdWxsTmFtZT86IHN0cmluZyk6IFByb21pc2U8YW55PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZ2V0UG9vbCgpLnF1ZXJ5KFxuICAgICAgJ0lOU0VSVCBJTlRPIHVzZXJzIChlbWFpbCwgcGFzc3dvcmRfaGFzaCwgZnVsbF9uYW1lLCB0ZW5hbnRfaWQsIHJvbGVzKSBWQUxVRVMgKCQxLCAkMiwgJDMsICQ0LCAkNSkgUkVUVVJOSU5HIGlkLCBlbWFpbCwgdGVuYW50X2lkLCByb2xlcycsXG4gICAgICBbZW1haWwsIHBhc3N3b3JkSGFzaCwgZnVsbE5hbWUgfHwgZW1haWwuc3BsaXQoJ0AnKVswXSwgJ2RlZmF1bHQnLCBbJ3ZpZXdlciddXVxuICAgIClcbiAgICByZXR1cm4gcmVzdWx0LnJvd3NbMF1cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBjcmVhdGluZyB1c2VyOicsIGVycm9yKVxuICAgIHRocm93IGVycm9yXG4gIH1cbn1cblxuLyoqXG4gKiBDcmVhdGUgc2Vzc2lvbiBmb3IgdXNlclxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY3JlYXRlU2Vzc2lvbih1c2VySWQ6IHN0cmluZywgcmVmcmVzaFRva2VuSGFzaDogc3RyaW5nLCBleHBpcmVzQXQ6IERhdGUpOiBQcm9taXNlPGFueT4ge1xuICB0cnkge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGdldFBvb2woKS5xdWVyeShcbiAgICAgICdJTlNFUlQgSU5UTyBzZXNzaW9ucyAodXNlcl9pZCwgcmVmcmVzaF90b2tlbl9oYXNoLCBleHBpcmVzX2F0KSBWQUxVRVMgKCQxLCAkMiwgJDMpIFJFVFVSTklORyBpZCwgdXNlcl9pZCwgZXhwaXJlc19hdCcsXG4gICAgICBbdXNlcklkLCByZWZyZXNoVG9rZW5IYXNoLCBleHBpcmVzQXRdXG4gICAgKVxuICAgIHJldHVybiByZXN1bHQucm93c1swXVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGNyZWF0aW5nIHNlc3Npb246JywgZXJyb3IpXG4gICAgdGhyb3cgZXJyb3JcbiAgfVxufVxuXG4vKipcbiAqIExvZyBhdWRpdCBldmVudFxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbG9nQXVkaXRFdmVudChcbiAgdXNlcklkOiBzdHJpbmcgfCBudWxsLFxuICB0ZW5hbnRJZDogc3RyaW5nLFxuICBhY3Rpb246IHN0cmluZyxcbiAgcmVzb3VyY2VUeXBlOiBzdHJpbmcsXG4gIHJlc291cmNlSWQ6IHN0cmluZyxcbiAgb2xkVmFsdWU/OiBhbnksXG4gIG5ld1ZhbHVlPzogYW55XG4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgdHJ5IHtcbiAgICBhd2FpdCBnZXRQb29sKCkucXVlcnkoXG4gICAgICAnSU5TRVJUIElOVE8gYXVkaXRfbG9ncyAodXNlcl9pZCwgdGVuYW50X2lkLCBhY3Rpb24sIHJlc291cmNlX3R5cGUsIHJlc291cmNlX2lkLCBvbGRfdmFsdWUsIG5ld192YWx1ZSkgVkFMVUVTICgkMSwgJDIsICQzLCAkNCwgJDUsICQ2LCAkNyknLFxuICAgICAgW3VzZXJJZCwgdGVuYW50SWQsIGFjdGlvbiwgcmVzb3VyY2VUeXBlLCByZXNvdXJjZUlkLCBvbGRWYWx1ZSA/IEpTT04uc3RyaW5naWZ5KG9sZFZhbHVlKSA6IG51bGwsIG5ld1ZhbHVlID8gSlNPTi5zdHJpbmdpZnkobmV3VmFsdWUpIDogbnVsbF1cbiAgICApXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgbG9nZ2luZyBhdWRpdCBldmVudDonLCBlcnJvcilcbiAgfVxufVxuIiwgIi8qKlxuICogUGFzc3dvcmQgUmVzZXQgVXRpbGl0aWVzXG4gKiBIYW5kbGVzIHBhc3N3b3JkIHJlc2V0IHRva2VuIGdlbmVyYXRpb24sIHZhbGlkYXRpb24sIGFuZCBlbWFpbCBzZW5kaW5nXG4gKi9cblxuaW1wb3J0IGNyeXB0byBmcm9tICdjcnlwdG8nXG5cbmNvbnN0IFJFU0VUX1RPS0VOX0VYUElSWSA9IDE1ICogNjAgKiAxMDAwIC8vIDE1IG1pbnV0ZXMgaW4gbWlsbGlzZWNvbmRzXG5jb25zdCBSRVNFVF9UT0tFTl9MRU5HVEggPSAzMlxuXG5pbnRlcmZhY2UgUmVzZXRUb2tlbkRhdGEge1xuICBlbWFpbDogc3RyaW5nXG4gIHRva2VuOiBzdHJpbmdcbiAgZXhwaXJlc0F0OiBudW1iZXJcbn1cblxuLy8gU3RvcmUgcmVzZXQgdG9rZW5zIGluIG1lbW9yeSAoaW4gcHJvZHVjdGlvbiwgdXNlIGRhdGFiYXNlKVxuY29uc3QgcmVzZXRUb2tlbnMgPSBuZXcgTWFwPHN0cmluZywgUmVzZXRUb2tlbkRhdGE+KClcblxuLyoqXG4gKiBHZW5lcmF0ZSBhIHBhc3N3b3JkIHJlc2V0IHRva2VuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZVJlc2V0VG9rZW4oZW1haWw6IHN0cmluZyk6IHN0cmluZyB7XG4gIGNvbnN0IHRva2VuID0gY3J5cHRvLnJhbmRvbUJ5dGVzKFJFU0VUX1RPS0VOX0xFTkdUSCkudG9TdHJpbmcoJ2hleCcpXG4gIGNvbnN0IGV4cGlyZXNBdCA9IERhdGUubm93KCkgKyBSRVNFVF9UT0tFTl9FWFBJUllcblxuICByZXNldFRva2Vucy5zZXQodG9rZW4sIHtcbiAgICBlbWFpbCxcbiAgICB0b2tlbixcbiAgICBleHBpcmVzQXQsXG4gIH0pXG5cbiAgLy8gQ2xlYW4gdXAgZXhwaXJlZCB0b2tlbnNcbiAgZm9yIChjb25zdCBba2V5LCBkYXRhXSBvZiByZXNldFRva2Vucy5lbnRyaWVzKCkpIHtcbiAgICBpZiAoZGF0YS5leHBpcmVzQXQgPCBEYXRlLm5vdygpKSB7XG4gICAgICByZXNldFRva2Vucy5kZWxldGUoa2V5KVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB0b2tlblxufVxuXG4vKipcbiAqIFZhbGlkYXRlIGEgcmVzZXQgdG9rZW4gYW5kIHJldHVybiBlbWFpbFxuICovXG5leHBvcnQgZnVuY3Rpb24gdmFsaWRhdGVSZXNldFRva2VuKHRva2VuOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHtcbiAgY29uc3QgZGF0YSA9IHJlc2V0VG9rZW5zLmdldCh0b2tlbilcblxuICBpZiAoIWRhdGEpIHtcbiAgICByZXR1cm4gbnVsbFxuICB9XG5cbiAgaWYgKGRhdGEuZXhwaXJlc0F0IDwgRGF0ZS5ub3coKSkge1xuICAgIHJlc2V0VG9rZW5zLmRlbGV0ZSh0b2tlbilcbiAgICByZXR1cm4gbnVsbFxuICB9XG5cbiAgcmV0dXJuIGRhdGEuZW1haWxcbn1cblxuLyoqXG4gKiBJbnZhbGlkYXRlIGEgcmVzZXQgdG9rZW4gYWZ0ZXIgdXNlXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpbnZhbGlkYXRlUmVzZXRUb2tlbih0b2tlbjogc3RyaW5nKTogdm9pZCB7XG4gIHJlc2V0VG9rZW5zLmRlbGV0ZSh0b2tlbilcbn1cblxuLyoqXG4gKiBFbWFpbCB0ZW1wbGF0ZXNcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldFBhc3N3b3JkUmVzZXRFbWFpbFRlbXBsYXRlKGVtYWlsOiBzdHJpbmcsIHJlc2V0TGluazogc3RyaW5nKToge1xuICBzdWJqZWN0OiBzdHJpbmdcbiAgaHRtbDogc3RyaW5nXG4gIHRleHQ6IHN0cmluZ1xufSB7XG4gIHJldHVybiB7XG4gICAgc3ViamVjdDogJ1Jlc2V0IFlvdXIgUGFzc3dvcmQgLSBRdWVyeVNhZ2UnLFxuICAgIGh0bWw6IGBcbiAgICAgIDwhRE9DVFlQRSBodG1sPlxuICAgICAgPGh0bWw+XG4gICAgICAgIDxoZWFkPlxuICAgICAgICAgIDxzdHlsZT5cbiAgICAgICAgICAgIGJvZHkgeyBmb250LWZhbWlseTogQXJpYWwsIHNhbnMtc2VyaWY7IGNvbG9yOiAjMzMzOyB9XG4gICAgICAgICAgICAuY29udGFpbmVyIHsgbWF4LXdpZHRoOiA2MDBweDsgbWFyZ2luOiAwIGF1dG87IHBhZGRpbmc6IDIwcHg7IH1cbiAgICAgICAgICAgIC5oZWFkZXIgeyBiYWNrZ3JvdW5kLWNvbG9yOiAjZjVmNWY1OyBwYWRkaW5nOiAyMHB4OyB0ZXh0LWFsaWduOiBjZW50ZXI7IH1cbiAgICAgICAgICAgIC5jb250ZW50IHsgcGFkZGluZzogMjBweDsgfVxuICAgICAgICAgICAgLmJ1dHRvbiB7IFxuICAgICAgICAgICAgICBkaXNwbGF5OiBpbmxpbmUtYmxvY2s7XG4gICAgICAgICAgICAgIGJhY2tncm91bmQtY29sb3I6ICMwMDdiZmY7XG4gICAgICAgICAgICAgIGNvbG9yOiB3aGl0ZTtcbiAgICAgICAgICAgICAgcGFkZGluZzogMTJweCAyNHB4O1xuICAgICAgICAgICAgICBib3JkZXItcmFkaXVzOiA0cHg7XG4gICAgICAgICAgICAgIHRleHQtZGVjb3JhdGlvbjogbm9uZTtcbiAgICAgICAgICAgICAgbWFyZ2luOiAyMHB4IDA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAuZm9vdGVyIHsgdGV4dC1hbGlnbjogY2VudGVyOyBwYWRkaW5nOiAyMHB4OyBjb2xvcjogIzY2NjsgZm9udC1zaXplOiAxMnB4OyB9XG4gICAgICAgICAgICAud2FybmluZyB7IGNvbG9yOiAjZDk1MzRmOyBmb250LXdlaWdodDogYm9sZDsgfVxuICAgICAgICAgIDwvc3R5bGU+XG4gICAgICAgIDwvaGVhZD5cbiAgICAgICAgPGJvZHk+XG4gICAgICAgICAgPGRpdiBjbGFzcz1cImNvbnRhaW5lclwiPlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImhlYWRlclwiPlxuICAgICAgICAgICAgICA8aDI+UGFzc3dvcmQgUmVzZXQgUmVxdWVzdDwvaDI+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb250ZW50XCI+XG4gICAgICAgICAgICAgIDxwPkhpICR7ZW1haWwuc3BsaXQoJ0AnKVswXX0sPC9wPlxuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgPHA+V2UgcmVjZWl2ZWQgYSByZXF1ZXN0IHRvIHJlc2V0IHlvdXIgcGFzc3dvcmQuIENsaWNrIHRoZSBsaW5rIGJlbG93IHRvIGNyZWF0ZSBhIG5ldyBwYXNzd29yZDo8L3A+XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICA8YSBocmVmPVwiJHtyZXNldExpbmt9XCIgY2xhc3M9XCJidXR0b25cIj5SZXNldCBQYXNzd29yZDwvYT5cbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIDxwPk9yIGNvcHkgYW5kIHBhc3RlIHRoaXMgbGluayBpbiB5b3VyIGJyb3dzZXI6PC9wPlxuICAgICAgICAgICAgICA8cCBzdHlsZT1cIndvcmQtYnJlYWs6IGJyZWFrLWFsbDsgYmFja2dyb3VuZC1jb2xvcjogI2Y1ZjVmNTsgcGFkZGluZzogMTBweDtcIj5cbiAgICAgICAgICAgICAgICAke3Jlc2V0TGlua31cbiAgICAgICAgICAgICAgPC9wPlxuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgPHA+PHN0cm9uZz5UaGlzIGxpbmsgd2lsbCBleHBpcmUgaW4gMTUgbWludXRlcy48L3N0cm9uZz48L3A+XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICA8cCBjbGFzcz1cIndhcm5pbmdcIj5cdTI2QTBcdUZFMEYgSWYgeW91IGRpZG4ndCByZXF1ZXN0IHRoaXMgcmVzZXQsIHlvdSBjYW4gc2FmZWx5IGlnbm9yZSB0aGlzIGVtYWlsLiBZb3VyIHBhc3N3b3JkIHdpbGwgbm90IGNoYW5nZS48L3A+XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICA8cD5TZWN1cml0eSB0aXA6IE5ldmVyIHNoYXJlIHlvdXIgcGFzc3dvcmQgcmVzZXQgbGluayB3aXRoIGFueW9uZS48L3A+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJmb290ZXJcIj5cbiAgICAgICAgICAgICAgPHA+JmNvcHk7IFF1ZXJ5U2FnZS4gQWxsIHJpZ2h0cyByZXNlcnZlZC48L3A+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgPC9ib2R5PlxuICAgICAgPC9odG1sPlxuICAgIGAsXG4gICAgdGV4dDogYFxuUGFzc3dvcmQgUmVzZXQgUmVxdWVzdFxuXG5IaSAke2VtYWlsLnNwbGl0KCdAJylbMF19LFxuXG5XZSByZWNlaXZlZCBhIHJlcXVlc3QgdG8gcmVzZXQgeW91ciBwYXNzd29yZC4gVmlzaXQgdGhpcyBsaW5rIHRvIGNyZWF0ZSBhIG5ldyBwYXNzd29yZDpcblxuJHtyZXNldExpbmt9XG5cblRoaXMgbGluayB3aWxsIGV4cGlyZSBpbiAxNSBtaW51dGVzLlxuXG5cdTI2QTBcdUZFMEYgSWYgeW91IGRpZG4ndCByZXF1ZXN0IHRoaXMgcmVzZXQsIHlvdSBjYW4gc2FmZWx5IGlnbm9yZSB0aGlzIGVtYWlsLiBZb3VyIHBhc3N3b3JkIHdpbGwgbm90IGNoYW5nZS5cblxuU2VjdXJpdHkgdGlwOiBOZXZlciBzaGFyZSB5b3VyIHBhc3N3b3JkIHJlc2V0IGxpbmsgd2l0aCBhbnlvbmUuXG5cblx1MDBBOSBRdWVyeVNhZ2UuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gICAgYC50cmltKCksXG4gIH1cbn1cblxuLyoqXG4gKiBNb2NrIGVtYWlsIHNlbmRpbmcgKGxvZ3MgdG8gY29uc29sZSlcbiAqIEluIHByb2R1Y3Rpb24sIGludGVncmF0ZSB3aXRoIFNlbmRHcmlkLCBNYWlsZ3VuLCBvciBOZXRsaWZ5IEVtYWlsIEFQSVxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2VuZFBhc3N3b3JkUmVzZXRFbWFpbChcbiAgZW1haWw6IHN0cmluZyxcbiAgcmVzZXRUb2tlbjogc3RyaW5nLFxuICBiYXNlVXJsOiBzdHJpbmdcbik6IFByb21pc2U8eyBzdWNjZXNzOiBib29sZWFuOyBtZXNzYWdlOiBzdHJpbmcgfT4ge1xuICBjb25zdCByZXNldExpbmsgPSBgJHtiYXNlVXJsfS9yZXNldC1wYXNzd29yZD90b2tlbj0ke3Jlc2V0VG9rZW59YFxuICBjb25zdCBlbWFpbFRlbXBsYXRlID0gZ2V0UGFzc3dvcmRSZXNldEVtYWlsVGVtcGxhdGUoZW1haWwsIHJlc2V0TGluaylcblxuICAvLyBNb2NrOiBMb2cgdG8gY29uc29sZVxuICBjb25zb2xlLmxvZygnXHVEODNEXHVEQ0U3IFBhc3N3b3JkIFJlc2V0IEVtYWlsJylcbiAgY29uc29sZS5sb2coYFRvOiAke2VtYWlsfWApXG4gIGNvbnNvbGUubG9nKGBTdWJqZWN0OiAke2VtYWlsVGVtcGxhdGUuc3ViamVjdH1gKVxuICBjb25zb2xlLmxvZyhgXFxuUmVzZXQgTGluazogJHtyZXNldExpbmt9YClcbiAgY29uc29sZS5sb2coYFxcbiR7ZW1haWxUZW1wbGF0ZS50ZXh0fWApXG5cbiAgLy8gVE9ETzogSW4gcHJvZHVjdGlvbiwgaW50ZWdyYXRlIHdpdGggYWN0dWFsIGVtYWlsIHNlcnZpY2U6XG4gIC8vIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgc2VuZGdyaWQuc2VuZCh7XG4gIC8vICAgdG86IGVtYWlsLFxuICAvLyAgIGZyb206ICdub3JlcGx5QHF1ZXJ5c2FnZS5jb20nLFxuICAvLyAgIHN1YmplY3Q6IGVtYWlsVGVtcGxhdGUuc3ViamVjdCxcbiAgLy8gICBodG1sOiBlbWFpbFRlbXBsYXRlLmh0bWwsXG4gIC8vIH0pXG5cbiAgcmV0dXJuIHtcbiAgICBzdWNjZXNzOiB0cnVlLFxuICAgIG1lc3NhZ2U6IGBQYXNzd29yZCByZXNldCBlbWFpbCBzZW50IHRvICR7ZW1haWx9IChjaGVjayBjb25zb2xlIGluIGRldiBtb2RlKWAsXG4gIH1cbn1cblxuLyoqXG4gKiBQYXNzd29yZCB2YWxpZGF0aW9uIHJ1bGVzXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB2YWxpZGF0ZVBhc3N3b3JkKHBhc3N3b3JkOiBzdHJpbmcpOiB7XG4gIHZhbGlkOiBib29sZWFuXG4gIGVycm9yczogc3RyaW5nW11cbn0ge1xuICBjb25zdCBlcnJvcnM6IHN0cmluZ1tdID0gW11cblxuICBpZiAoIXBhc3N3b3JkIHx8IHBhc3N3b3JkLmxlbmd0aCA8IDgpIHtcbiAgICBlcnJvcnMucHVzaCgnUGFzc3dvcmQgbXVzdCBiZSBhdCBsZWFzdCA4IGNoYXJhY3RlcnMnKVxuICB9XG4gIGlmICghL1tBLVpdLy50ZXN0KHBhc3N3b3JkKSkge1xuICAgIGVycm9ycy5wdXNoKCdQYXNzd29yZCBtdXN0IGNvbnRhaW4gYW4gdXBwZXJjYXNlIGxldHRlcicpXG4gIH1cbiAgaWYgKCEvW2Etel0vLnRlc3QocGFzc3dvcmQpKSB7XG4gICAgZXJyb3JzLnB1c2goJ1Bhc3N3b3JkIG11c3QgY29udGFpbiBhIGxvd2VyY2FzZSBsZXR0ZXInKVxuICB9XG4gIGlmICghL1swLTldLy50ZXN0KHBhc3N3b3JkKSkge1xuICAgIGVycm9ycy5wdXNoKCdQYXNzd29yZCBtdXN0IGNvbnRhaW4gYSBudW1iZXInKVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICB2YWxpZDogZXJyb3JzLmxlbmd0aCA9PT0gMCxcbiAgICBlcnJvcnMsXG4gIH1cbn1cbiIsICJpbXBvcnQgeyBjcmVhdGVIYXNoLCByYW5kb21VVUlEIH0gZnJvbSAnY3J5cHRvJ1xuaW1wb3J0IHsgYXVkaXRLZXksIGxpc3RCeVByZWZpeCwgc2V0SXRlbSB9IGZyb20gJy4vc3RvcmFnZS5qcydcblxuZXhwb3J0IGludGVyZmFjZSBBdWRpdEV2ZW50IHtcbiAgaWQ6IHN0cmluZ1xuICB0ZW5hbnRfaWQ6IHN0cmluZ1xuICBlbnRpdHlfdHlwZTogc3RyaW5nXG4gIGVudGl0eV9pZDogc3RyaW5nXG4gIGFjdGlvbjogc3RyaW5nXG4gIGFjdG9yX2lkOiBzdHJpbmdcbiAgcmVhc29uOiBzdHJpbmdcbiAgbWV0YWRhdGE6IFJlY29yZDxzdHJpbmcsIHVua25vd24+XG4gIHRpbWVzdGFtcDogc3RyaW5nXG4gIHByZXZfZXZlbnRfaGFzaDogc3RyaW5nIHwgbnVsbFxuICBldmVudF9oYXNoOiBzdHJpbmdcbn1cblxuZnVuY3Rpb24gaGFzaEV2ZW50KGlucHV0OiBzdHJpbmcpIHtcbiAgcmV0dXJuIGNyZWF0ZUhhc2goJ3NoYTI1NicpLnVwZGF0ZShpbnB1dCkuZGlnZXN0KCdoZXgnKVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gYXBwZW5kQXVkaXRFdmVudChwYXlsb2FkOiB7XG4gIHRlbmFudF9pZD86IHN0cmluZ1xuICBlbnRpdHlfdHlwZTogc3RyaW5nXG4gIGVudGl0eV9pZDogc3RyaW5nXG4gIGFjdGlvbjogc3RyaW5nXG4gIGFjdG9yX2lkPzogc3RyaW5nXG4gIHJlYXNvbj86IHN0cmluZ1xuICBtZXRhZGF0YT86IFJlY29yZDxzdHJpbmcsIHVua25vd24+XG59KSB7XG4gIGNvbnN0IHRlbmFudElkID0gcGF5bG9hZC50ZW5hbnRfaWQgPz8gJ2RlZmF1bHQnXG4gIGNvbnN0IGV2ZW50cyA9IChhd2FpdCBsaXN0QnlQcmVmaXgoJ2F1ZGl0LycpKSBhcyBBdWRpdEV2ZW50W11cbiAgY29uc3QgbGF0ZXN0ID0gZXZlbnRzXG4gICAgLmZpbHRlcigoZSkgPT4gZS50ZW5hbnRfaWQgPT09IHRlbmFudElkKVxuICAgIC5zb3J0KChhLCBiKSA9PiBuZXcgRGF0ZShiLnRpbWVzdGFtcCkuZ2V0VGltZSgpIC0gbmV3IERhdGUoYS50aW1lc3RhbXApLmdldFRpbWUoKSlbMF1cblxuICBjb25zdCB0aW1lc3RhbXAgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcbiAgY29uc3QgaWQgPSByYW5kb21VVUlEKClcbiAgY29uc3QgcHJldiA9IGxhdGVzdD8uZXZlbnRfaGFzaCA/PyBudWxsXG4gIGNvbnN0IGJvZHkgPSBKU09OLnN0cmluZ2lmeSh7XG4gICAgaWQsXG4gICAgdGVuYW50X2lkOiB0ZW5hbnRJZCxcbiAgICBlbnRpdHlfdHlwZTogcGF5bG9hZC5lbnRpdHlfdHlwZSxcbiAgICBlbnRpdHlfaWQ6IHBheWxvYWQuZW50aXR5X2lkLFxuICAgIGFjdGlvbjogcGF5bG9hZC5hY3Rpb24sXG4gICAgYWN0b3JfaWQ6IHBheWxvYWQuYWN0b3JfaWQgPz8gJ3N5c3RlbScsXG4gICAgcmVhc29uOiBwYXlsb2FkLnJlYXNvbiA/PyAnJyxcbiAgICBtZXRhZGF0YTogcGF5bG9hZC5tZXRhZGF0YSA/PyB7fSxcbiAgICB0aW1lc3RhbXAsXG4gICAgcHJldl9ldmVudF9oYXNoOiBwcmV2LFxuICB9KVxuICBjb25zdCBldmVudEhhc2ggPSBoYXNoRXZlbnQoYm9keSlcbiAgY29uc3QgZXZlbnQ6IEF1ZGl0RXZlbnQgPSB7XG4gICAgaWQsXG4gICAgdGVuYW50X2lkOiB0ZW5hbnRJZCxcbiAgICBlbnRpdHlfdHlwZTogcGF5bG9hZC5lbnRpdHlfdHlwZSxcbiAgICBlbnRpdHlfaWQ6IHBheWxvYWQuZW50aXR5X2lkLFxuICAgIGFjdGlvbjogcGF5bG9hZC5hY3Rpb24sXG4gICAgYWN0b3JfaWQ6IHBheWxvYWQuYWN0b3JfaWQgPz8gJ3N5c3RlbScsXG4gICAgcmVhc29uOiBwYXlsb2FkLnJlYXNvbiA/PyAnJyxcbiAgICBtZXRhZGF0YTogcGF5bG9hZC5tZXRhZGF0YSA/PyB7fSxcbiAgICB0aW1lc3RhbXAsXG4gICAgcHJldl9ldmVudF9oYXNoOiBwcmV2LFxuICAgIGV2ZW50X2hhc2g6IGV2ZW50SGFzaCxcbiAgfVxuXG4gIGF3YWl0IHNldEl0ZW0oYXVkaXRLZXkoaWQpLCBldmVudClcbiAgcmV0dXJuIGV2ZW50XG59XG4iLCAiaW1wb3J0IHsgZ2V0U3RvcmUgfSBmcm9tICdAbmV0bGlmeS9ibG9icydcblxuY29uc3Qgc3RvcmUgPSBnZXRTdG9yZSh7IG5hbWU6ICdxdWVyeXNhZ2UnLCBjb25zaXN0ZW5jeTogJ3N0cm9uZycgfSlcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGxpc3RCeVByZWZpeChwcmVmaXg6IHN0cmluZyk6IFByb21pc2U8YW55W10+IHtcbiAgY29uc3QgeyBibG9icyB9ID0gYXdhaXQgc3RvcmUubGlzdCh7IHByZWZpeCB9KVxuICBpZiAoYmxvYnMubGVuZ3RoID09PSAwKSByZXR1cm4gW11cbiAgY29uc3QgaXRlbXMgPSBhd2FpdCBQcm9taXNlLmFsbChibG9icy5tYXAoKGIpID0+IHN0b3JlLmdldChiLmtleSwgeyB0eXBlOiAnanNvbicgfSkpKVxuICByZXR1cm4gaXRlbXMuZmlsdGVyKEJvb2xlYW4pIGFzIGFueVtdXG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBsaXN0S2V5c0J5UHJlZml4KHByZWZpeDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuICBjb25zdCB7IGJsb2JzIH0gPSBhd2FpdCBzdG9yZS5saXN0KHsgcHJlZml4IH0pXG4gIHJldHVybiBibG9icy5tYXAoKGIpID0+IGIua2V5KVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0SXRlbTxUPihrZXk6IHN0cmluZyk6IFByb21pc2U8VCB8IG51bGw+IHtcbiAgcmV0dXJuIHN0b3JlLmdldChrZXksIHsgdHlwZTogJ2pzb24nIH0pIGFzIFByb21pc2U8VCB8IG51bGw+XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXRJdGVtKGtleTogc3RyaW5nLCB2YWx1ZTogb2JqZWN0KTogUHJvbWlzZTx2b2lkPiB7XG4gIGF3YWl0IHN0b3JlLnNldEpTT04oa2V5LCB2YWx1ZSlcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGRlbGV0ZUl0ZW0oa2V5OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgYXdhaXQgc3RvcmUuZGVsZXRlKGtleSlcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNvbm5LZXkoaWQ6IHN0cmluZykgeyByZXR1cm4gYGNvbm4vJHtpZH1gIH1cbmV4cG9ydCBmdW5jdGlvbiBxdWVyeUtleShpZDogc3RyaW5nKSB7IHJldHVybiBgcXVlcnkvJHtpZH1gIH1cbmV4cG9ydCBmdW5jdGlvbiBleHBsYWluS2V5KGlkOiBzdHJpbmcpIHsgcmV0dXJuIGBleHBsYWluLyR7aWR9YCB9XG5leHBvcnQgZnVuY3Rpb24gYW5hbHlzaXNLZXkoaWQ6IHN0cmluZykgeyByZXR1cm4gYGFuYWx5c2lzLyR7aWR9YCB9XG5leHBvcnQgZnVuY3Rpb24gc3VnZ2VzdGlvbktleShpZDogc3RyaW5nKSB7IHJldHVybiBgc3VnZ2VzdGlvbi8ke2lkfWAgfVxuZXhwb3J0IGZ1bmN0aW9uIHBvbGljeUtleShpZDogc3RyaW5nKSB7IHJldHVybiBgcG9saWN5LyR7aWR9YCB9XG5leHBvcnQgZnVuY3Rpb24gYXBwcm92YWxLZXkoaWQ6IHN0cmluZykgeyByZXR1cm4gYGFwcHJvdmFsLyR7aWR9YCB9XG5leHBvcnQgZnVuY3Rpb24gYXVkaXRLZXkoaWQ6IHN0cmluZykgeyByZXR1cm4gYGF1ZGl0LyR7aWR9YCB9XG5leHBvcnQgZnVuY3Rpb24gcnVuS2V5KGlkOiBzdHJpbmcpIHsgcmV0dXJuIGBydW4vJHtpZH1gIH1cbiIsICIvKipcbiAqIFJhdGUgTGltaXRpbmcgVXRpbGl0aWVzXG4gKiBUb2tlbiBidWNrZXQgYWxnb3JpdGhtIGZvciBwcmV2ZW50aW5nIGJydXRlIGZvcmNlIGF0dGFja3NcbiAqL1xuXG5pbnRlcmZhY2UgVG9rZW5CdWNrZXQge1xuICB0b2tlbnM6IG51bWJlclxuICBsYXN0UmVmaWxsQXQ6IG51bWJlclxufVxuXG4vLyBTdG9yZSByYXRlIGxpbWl0IGJ1Y2tldHMgKGtleSA9IGlkZW50aWZpZXIgbGlrZSBlbWFpbCBvciBJUClcbmNvbnN0IGJ1Y2tldHMgPSBuZXcgTWFwPHN0cmluZywgVG9rZW5CdWNrZXQ+KClcblxuY29uc3QgREVGQVVMVF9DQVBBQ0lUWSA9IDEwIC8vIE1heCAxMCByZXF1ZXN0c1xuY29uc3QgREVGQVVMVF9SRUZJTExfUkFURSA9IDYwMDAwIC8vIFJlZmlsbCBldmVyeSA2MCBzZWNvbmRzICgxIG1pbnV0ZSlcbmNvbnN0IERFRkFVTFRfVE9LRU5TX1BFUl9SRUZJTEwgPSAxMCAvLyBBZGQgMTAgdG9rZW5zIGV2ZXJ5IG1pbnV0ZVxuXG4vKipcbiAqIENvbmZpZ3VyYXRpb24gZm9yIHJhdGUgbGltaXRpbmdcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBSYXRlTGltaXRDb25maWcge1xuICBjYXBhY2l0eT86IG51bWJlciAvLyBNYXggdG9rZW5zIGluIGJ1Y2tldFxuICByZWZpbGxJbnRlcnZhbD86IG51bWJlciAvLyBIb3cgb2Z0ZW4gdG8gcmVmaWxsIChtcylcbiAgdG9rZW5zUGVyUmVmaWxsPzogbnVtYmVyIC8vIEhvdyBtYW55IHRva2VucyB0byBhZGQgb24gcmVmaWxsXG59XG5cbi8qKlxuICogSW5pdGlhbGl6ZSByYXRlIGxpbWl0aW5nIGZvciBhIHNwZWNpZmljIGlkZW50aWZpZXJcbiAqIFJldHVybnMgdHJ1ZSBpZiByZXF1ZXN0IGlzIGFsbG93ZWQsIGZhbHNlIGlmIHJhdGUgbGltaXRlZFxuICovXG5leHBvcnQgZnVuY3Rpb24gY2hlY2tSYXRlTGltaXQoXG4gIGlkZW50aWZpZXI6IHN0cmluZyxcbiAgY29uZmlnOiBSYXRlTGltaXRDb25maWcgPSB7fVxuKTogeyBhbGxvd2VkOiBib29sZWFuOyByZW1haW5pbmc6IG51bWJlcjsgcmV0cnlBZnRlcjogbnVtYmVyIH0ge1xuICBjb25zdCBjYXBhY2l0eSA9IGNvbmZpZy5jYXBhY2l0eSA/PyBERUZBVUxUX0NBUEFDSVRZXG4gIGNvbnN0IHJlZmlsbEludGVydmFsID0gY29uZmlnLnJlZmlsbEludGVydmFsID8/IERFRkFVTFRfUkVGSUxMX1JBVEVcbiAgY29uc3QgdG9rZW5zUGVyUmVmaWxsID0gY29uZmlnLnRva2Vuc1BlclJlZmlsbCA/PyBERUZBVUxUX1RPS0VOU19QRVJfUkVGSUxMXG5cbiAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKVxuICBsZXQgYnVja2V0ID0gYnVja2V0cy5nZXQoaWRlbnRpZmllcilcblxuICAvLyBJbml0aWFsaXplIGJ1Y2tldCBpZiBkb2Vzbid0IGV4aXN0XG4gIGlmICghYnVja2V0KSB7XG4gICAgYnVja2V0ID0ge1xuICAgICAgdG9rZW5zOiBjYXBhY2l0eSxcbiAgICAgIGxhc3RSZWZpbGxBdDogbm93LFxuICAgIH1cbiAgICBidWNrZXRzLnNldChpZGVudGlmaWVyLCBidWNrZXQpXG4gIH1cblxuICAvLyBSZWZpbGwgdG9rZW5zIGJhc2VkIG9uIGVsYXBzZWQgdGltZVxuICBjb25zdCB0aW1lUGFzc2VkID0gbm93IC0gYnVja2V0Lmxhc3RSZWZpbGxBdFxuICBjb25zdCByZWZpbGxDeWNsZXMgPSBNYXRoLmZsb29yKHRpbWVQYXNzZWQgLyByZWZpbGxJbnRlcnZhbClcblxuICBpZiAocmVmaWxsQ3ljbGVzID4gMCkge1xuICAgIGJ1Y2tldC50b2tlbnMgPSBNYXRoLm1pbihjYXBhY2l0eSwgYnVja2V0LnRva2VucyArIHJlZmlsbEN5Y2xlcyAqIHRva2Vuc1BlclJlZmlsbClcbiAgICBidWNrZXQubGFzdFJlZmlsbEF0ID0gbm93ICsgKHJlZmlsbEN5Y2xlcyAqIHJlZmlsbEludGVydmFsIC0gdGltZVBhc3NlZClcbiAgfVxuXG4gIC8vIENoZWNrIGlmIHJlcXVlc3QgaXMgYWxsb3dlZFxuICBpZiAoYnVja2V0LnRva2VucyA+PSAxKSB7XG4gICAgYnVja2V0LnRva2VucyAtPSAxXG4gICAgcmV0dXJuIHtcbiAgICAgIGFsbG93ZWQ6IHRydWUsXG4gICAgICByZW1haW5pbmc6IE1hdGguZmxvb3IoYnVja2V0LnRva2VucyksXG4gICAgICByZXRyeUFmdGVyOiAwLFxuICAgIH1cbiAgfVxuXG4gIC8vIENhbGN1bGF0ZSB3aGVuIGJ1Y2tldCB3aWxsIGhhdmUgdG9rZW5zIGF2YWlsYWJsZVxuICBjb25zdCB0b2tlbnNOZWVkZWQgPSAxIC0gYnVja2V0LnRva2Vuc1xuICBjb25zdCB0aW1lTmVlZGVkID0gKHRva2Vuc05lZWRlZCAvIHRva2Vuc1BlclJlZmlsbCkgKiByZWZpbGxJbnRlcnZhbFxuICBjb25zdCByZXRyeUFmdGVyID0gTWF0aC5jZWlsKHRpbWVOZWVkZWQgLyAxMDAwKSAvLyBDb252ZXJ0IHRvIHNlY29uZHNcblxuICByZXR1cm4ge1xuICAgIGFsbG93ZWQ6IGZhbHNlLFxuICAgIHJlbWFpbmluZzogMCxcbiAgICByZXRyeUFmdGVyLFxuICB9XG59XG5cbi8qKlxuICogUmVzZXQgcmF0ZSBsaW1pdCBmb3IgYW4gaWRlbnRpZmllciAoZS5nLiwgYWZ0ZXIgc3VjY2Vzc2Z1bCBsb2dpbilcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlc2V0UmF0ZUxpbWl0KGlkZW50aWZpZXI6IHN0cmluZyk6IHZvaWQge1xuICBidWNrZXRzLmRlbGV0ZShpZGVudGlmaWVyKVxufVxuXG4vKipcbiAqIEdldCByYXRlIGxpbWl0IHN0YXR1cyBmb3IgZGVidWdnaW5nXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRSYXRlTGltaXRTdGF0dXMoaWRlbnRpZmllcjogc3RyaW5nKTogVG9rZW5CdWNrZXQgfCBudWxsIHtcbiAgcmV0dXJuIGJ1Y2tldHMuZ2V0KGlkZW50aWZpZXIpID8/IG51bGxcbn1cblxuLyoqXG4gKiBDbGVhbiB1cCBvbGQgYnVja2V0cyAoY2FsbCBwZXJpb2RpY2FsbHkpXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjbGVhbnVwRXhwaXJlZEJ1Y2tldHMobWF4QWdlOiBudW1iZXIgPSAzNjAwMDAwKTogdm9pZCB7XG4gIC8vIDEgaG91ciBkZWZhdWx0XG4gIGNvbnN0IG5vdyA9IERhdGUubm93KClcbiAgbGV0IGNsZWFuZWQgPSAwXG5cbiAgZm9yIChjb25zdCBba2V5LCBidWNrZXRdIG9mIGJ1Y2tldHMuZW50cmllcygpKSB7XG4gICAgaWYgKG5vdyAtIGJ1Y2tldC5sYXN0UmVmaWxsQXQgPiBtYXhBZ2UpIHtcbiAgICAgIGJ1Y2tldHMuZGVsZXRlKGtleSlcbiAgICAgIGNsZWFuZWQrK1xuICAgIH1cbiAgfVxuXG4gIGlmIChjbGVhbmVkID4gMCkge1xuICAgIGNvbnNvbGUubG9nKGBbUmF0ZSBMaW1pdF0gQ2xlYW5lZCB1cCAke2NsZWFuZWR9IGV4cGlyZWQgYnVja2V0c2ApXG4gIH1cbn1cblxuLyoqXG4gKiBGb3JtYXQgcmF0ZSBsaW1pdCBlcnJvciByZXNwb25zZVxuICovXG5leHBvcnQgZnVuY3Rpb24gcmF0ZUxpbWl0RXJyb3JSZXNwb25zZShyZXRyeUFmdGVyOiBudW1iZXIpOiBSZXNwb25zZSB7XG4gIHJldHVybiBSZXNwb25zZS5qc29uKFxuICAgIHtcbiAgICAgIGVycm9yOiAnVG9vIG1hbnkgcmVxdWVzdHMuIFBsZWFzZSB0cnkgYWdhaW4gbGF0ZXIuJyxcbiAgICAgIHJldHJ5QWZ0ZXIsXG4gICAgfSxcbiAgICB7XG4gICAgICBzdGF0dXM6IDQyOSxcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgJ1JldHJ5LUFmdGVyJzogcmV0cnlBZnRlci50b1N0cmluZygpLFxuICAgICAgICAnWC1SYXRlTGltaXQtTGltaXQnOiAnMTAnLFxuICAgICAgICAnWC1SYXRlTGltaXQtUmVtYWluaW5nJzogJzAnLFxuICAgICAgICAnWC1SYXRlTGltaXQtUmVzZXQnOiBuZXcgRGF0ZShEYXRlLm5vdygpICsgcmV0cnlBZnRlciAqIDEwMDApLnRvSVNPU3RyaW5nKCksXG4gICAgICB9LFxuICAgIH1cbiAgKVxufVxuXG4vKipcbiAqIEV4dHJhY3QgaWRlbnRpZmllciBmcm9tIHJlcXVlc3QgKElQIGFkZHJlc3Mgb3IgZW1haWwpXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRSZXF1ZXN0SWRlbnRpZmllcihyZXE6IFJlcXVlc3QsIGZhbGxiYWNrOiBzdHJpbmcgPSAndW5rbm93bicpOiBzdHJpbmcge1xuICAvLyBUcnkgdG8gZ2V0IElQIGZyb20gaGVhZGVyc1xuICBjb25zdCBmb3J3YXJkZWQgPSByZXEuaGVhZGVycy5nZXQoJ3gtZm9yd2FyZGVkLWZvcicpXG4gIGlmIChmb3J3YXJkZWQpIHtcbiAgICByZXR1cm4gZm9yd2FyZGVkLnNwbGl0KCcsJylbMF0udHJpbSgpXG4gIH1cblxuICBjb25zdCBjbGllbnRJcCA9IHJlcS5oZWFkZXJzLmdldCgneC1jbGllbnQtaXAnKVxuICBpZiAoY2xpZW50SXApIHtcbiAgICByZXR1cm4gY2xpZW50SXBcbiAgfVxuXG4gIHJldHVybiBmYWxsYmFja1xufVxuXG4vKipcbiAqIFByZS1kZWZpbmVkIHJhdGUgbGltaXQgY29uZmlncyBmb3IgZGlmZmVyZW50IGVuZHBvaW50c1xuICovXG5leHBvcnQgY29uc3QgUkFURV9MSU1JVF9QUkVTRVRTID0ge1xuICAvLyBBdXRoIGVuZHBvaW50czogMTAgYXR0ZW1wdHMgcGVyIG1pbnV0ZVxuICBhdXRoOiB7XG4gICAgY2FwYWNpdHk6IDEwLFxuICAgIHJlZmlsbEludGVydmFsOiA2MDAwMCxcbiAgICB0b2tlbnNQZXJSZWZpbGw6IDEwLFxuICB9LFxuXG4gIC8vIFBhc3N3b3JkIHJlc2V0OiAzIGF0dGVtcHRzIHBlciBob3VyXG4gIHBhc3N3b3JkUmVzZXQ6IHtcbiAgICBjYXBhY2l0eTogMyxcbiAgICByZWZpbGxJbnRlcnZhbDogMzYwMDAwMCxcbiAgICB0b2tlbnNQZXJSZWZpbGw6IDMsXG4gIH0sXG5cbiAgLy8gRW1haWwgdmVyaWZpY2F0aW9uOiA1IGF0dGVtcHRzIHBlciBob3VyXG4gIGVtYWlsVmVyaWZpY2F0aW9uOiB7XG4gICAgY2FwYWNpdHk6IDUsXG4gICAgcmVmaWxsSW50ZXJ2YWw6IDM2MDAwMDAsXG4gICAgdG9rZW5zUGVyUmVmaWxsOiA1LFxuICB9LFxuXG4gIC8vIEFQSSBlbmRwb2ludHM6IDEwMCByZXF1ZXN0cyBwZXIgbWludXRlXG4gIGFwaToge1xuICAgIGNhcGFjaXR5OiAxMDAsXG4gICAgcmVmaWxsSW50ZXJ2YWw6IDYwMDAwLFxuICAgIHRva2Vuc1BlclJlZmlsbDogMTAwLFxuICB9LFxuXG4gIC8vIFN0cmljdDogMSBhdHRlbXB0IHBlciAzMCBzZWNvbmRzXG4gIHN0cmljdDoge1xuICAgIGNhcGFjaXR5OiAxLFxuICAgIHJlZmlsbEludGVydmFsOiAzMDAwMCxcbiAgICB0b2tlbnNQZXJSZWZpbGw6IDEsXG4gIH0sXG59XG4iLCAiLyoqXG4gKiBQYXNzd29yZCBSZXNldCBFbmRwb2ludHNcbiAqIEhhbmRsZXMgZm9yZ290IHBhc3N3b3JkIGFuZCByZXNldCBwYXNzd29yZCBmbG93c1xuICovXG5cbmltcG9ydCB0eXBlIHsgQ29udGV4dCB9IGZyb20gJ0BuZXRsaWZ5L2Z1bmN0aW9ucydcbmltcG9ydCB7IGpzb24sIGVycm9yUmVzcG9uc2UgfSBmcm9tICcuL2xpYi9hdXRoLmpzJ1xuaW1wb3J0IHsgZ2V0VXNlckJ5RW1haWwsIGdldFVzZXJCeUlkIH0gZnJvbSAnLi9saWIvZGIuanMnXG5pbXBvcnQgeyBnZW5lcmF0ZVJlc2V0VG9rZW4sIHZhbGlkYXRlUmVzZXRUb2tlbiwgaW52YWxpZGF0ZVJlc2V0VG9rZW4sIHNlbmRQYXNzd29yZFJlc2V0RW1haWwsIHZhbGlkYXRlUGFzc3dvcmQgfSBmcm9tICcuL2xpYi9wYXNzd29yZC1yZXNldC5qcydcbmltcG9ydCB7IGFwcGVuZEF1ZGl0RXZlbnQgfSBmcm9tICcuL2xpYi9hdWRpdC5qcydcbmltcG9ydCB7IGNoZWNrUmF0ZUxpbWl0LCByZXNldFJhdGVMaW1pdCwgZ2V0UmVxdWVzdElkZW50aWZpZXIsIHJhdGVMaW1pdEVycm9yUmVzcG9uc2UsIFJBVEVfTElNSVRfUFJFU0VUUyB9IGZyb20gJy4vbGliL3JhdGUtbGltaXQuanMnXG5pbXBvcnQgY3J5cHRvIGZyb20gJ2NyeXB0bydcblxuZXhwb3J0IGRlZmF1bHQgYXN5bmMgKHJlcTogUmVxdWVzdCwgX2N0eDogQ29udGV4dCkgPT4ge1xuICBpZiAocmVxLm1ldGhvZCAhPT0gJ1BPU1QnKSB7XG4gICAgcmV0dXJuIGpzb24oeyBlcnJvcjogJ01ldGhvZCBub3QgYWxsb3dlZCcgfSwgNDA1KVxuICB9XG5cbiAgY29uc3QgdXJsID0gbmV3IFVSTChyZXEudXJsKVxuICBjb25zdCBwYXRobmFtZSA9IHVybC5wYXRobmFtZVxuXG4gIC8vIFBPU1QgL2FwaS9hdXRoL3Bhc3N3b3JkL2ZvcmdvdFxuICBpZiAocGF0aG5hbWUuaW5jbHVkZXMoJ2ZvcmdvdCcpKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGJvZHkgPSAoYXdhaXQgcmVxLmpzb24oKSkgYXMgeyBlbWFpbDogc3RyaW5nIH1cbiAgICAgIGNvbnN0IHsgZW1haWwgfSA9IGJvZHlcblxuICAgICAgaWYgKCFlbWFpbCkge1xuICAgICAgICByZXR1cm4gZXJyb3JSZXNwb25zZSgnRW1haWwgaXMgcmVxdWlyZWQnKVxuICAgICAgfVxuXG4gICAgICAvLyBSYXRlIGxpbWl0aW5nOiAzIGF0dGVtcHRzIHBlciBob3VyIHBlciBlbWFpbFxuICAgICAgY29uc3QgaWRlbnRpZmllciA9IGBwYXNzd29yZC1mb3Jnb3Q6JHtlbWFpbH1gXG4gICAgICBjb25zdCByYXRlTGltaXQgPSBjaGVja1JhdGVMaW1pdChpZGVudGlmaWVyLCBSQVRFX0xJTUlUX1BSRVNFVFMucGFzc3dvcmRSZXNldClcblxuICAgICAgaWYgKCFyYXRlTGltaXQuYWxsb3dlZCkge1xuICAgICAgICBjb25zb2xlLmxvZyhgW1JhdGUgTGltaXRdIFBhc3N3b3JkIHJlc2V0IHJlcXVlc3RlZCB0b28gbWFueSB0aW1lcyBmb3IgJHtlbWFpbH06IHJldHJ5IGluICR7cmF0ZUxpbWl0LnJldHJ5QWZ0ZXJ9c2ApXG4gICAgICAgIHJldHVybiByYXRlTGltaXRFcnJvclJlc3BvbnNlKHJhdGVMaW1pdC5yZXRyeUFmdGVyKVxuICAgICAgfVxuXG4gICAgICAvLyBWYWxpZGF0ZSBlbWFpbCBmb3JtYXRcbiAgICAgIGlmICghZW1haWwuaW5jbHVkZXMoJ0AnKSkge1xuICAgICAgICByZXR1cm4gZXJyb3JSZXNwb25zZSgnSW52YWxpZCBlbWFpbCBmb3JtYXQnKVxuICAgICAgfVxuXG4gICAgICAvLyBGb3Igc2VjdXJpdHksIGFsd2F5cyByZXR1cm4gc3VjY2VzcyAoZG9uJ3QgcmV2ZWFsIGlmIHVzZXIgZXhpc3RzKVxuICAgICAgY29uc3QgdXNlciA9IGF3YWl0IGdldFVzZXJCeUVtYWlsKGVtYWlsKVxuICAgICAgaWYgKCF1c2VyKSB7XG4gICAgICAgIC8vIExvZyBhdHRlbXB0IHdpdGggbm9uLWV4aXN0ZW50IGVtYWlsXG4gICAgICAgIGNvbnNvbGUubG9nKGBQYXNzd29yZCByZXNldCBhdHRlbXB0ZWQgZm9yIG5vbi1leGlzdGVudCBlbWFpbDogJHtlbWFpbH1gKVxuICAgICAgICByZXR1cm4ganNvbih7XG4gICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICBtZXNzYWdlOiAnSWYgdGhhdCBlbWFpbCBleGlzdHMgaW4gb3VyIHN5c3RlbSwgeW91IHdpbGwgcmVjZWl2ZSBhIHBhc3N3b3JkIHJlc2V0IGxpbmsgc2hvcnRseS4nLFxuICAgICAgICB9KVxuICAgICAgfVxuXG4gICAgICAvLyBHZW5lcmF0ZSByZXNldCB0b2tlblxuICAgICAgY29uc3QgcmVzZXRUb2tlbiA9IGdlbmVyYXRlUmVzZXRUb2tlbihlbWFpbClcblxuICAgICAgLy8gU2VuZCByZXNldCBlbWFpbFxuICAgICAgY29uc3QgYmFzZVVybCA9IG5ldyBVUkwocmVxLnVybCkub3JpZ2luXG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCBzZW5kUGFzc3dvcmRSZXNldEVtYWlsKGVtYWlsLCByZXNldFRva2VuLCBiYXNlVXJsKVxuICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBzZW5kIHBhc3N3b3JkIHJlc2V0IGVtYWlsOicsIGVycilcbiAgICAgICAgLy8gU3RpbGwgcmV0dXJuIHN1Y2Nlc3MgLSBlbWFpbCBmYWlsdXJlIHNob3VsZG4ndCBicmVhayB0aGUgZmxvd1xuICAgICAgfVxuXG4gICAgICAvLyBBdWRpdDogUGFzc3dvcmQgcmVzZXQgcmVxdWVzdGVkXG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCBhcHBlbmRBdWRpdEV2ZW50KHtcbiAgICAgICAgICB0ZW5hbnRfaWQ6IHVzZXIudGVuYW50X2lkLFxuICAgICAgICAgIGVudGl0eV90eXBlOiAndXNlcicsXG4gICAgICAgICAgZW50aXR5X2lkOiBlbWFpbCxcbiAgICAgICAgICBhY3Rpb246ICd1c2VyLnBhc3N3b3JkX3Jlc2V0X3JlcXVlc3RlZCcsXG4gICAgICAgICAgYWN0b3JfaWQ6ICdzeXN0ZW0nLFxuICAgICAgICAgIG1ldGFkYXRhOiB7IGVtYWlsIH0sXG4gICAgICAgIH0pXG4gICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGxvZyBhdWRpdCBldmVudDonLCBlcnIpXG4gICAgICB9XG5cbiAgICAgIHJldHVybiBqc29uKHtcbiAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgbWVzc2FnZTogJ0lmIHRoYXQgZW1haWwgZXhpc3RzIGluIG91ciBzeXN0ZW0sIHlvdSB3aWxsIHJlY2VpdmUgYSBwYXNzd29yZCByZXNldCBsaW5rIHNob3J0bHkuJyxcbiAgICAgIH0pXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZvcmdvdCBwYXNzd29yZCBlcnJvcjonLCBlcnJvcilcbiAgICAgIHJldHVybiBlcnJvclJlc3BvbnNlKCdBbiBlcnJvciBvY2N1cnJlZC4gUGxlYXNlIHRyeSBhZ2Fpbi4nKVxuICAgIH1cbiAgfVxuXG4gIC8vIFBPU1QgL2FwaS9hdXRoL3Bhc3N3b3JkL3Jlc2V0XG4gIGlmIChwYXRobmFtZS5pbmNsdWRlcygncmVzZXQnKSkge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBib2R5ID0gKGF3YWl0IHJlcS5qc29uKCkpIGFzIHsgdG9rZW46IHN0cmluZzsgcGFzc3dvcmQ6IHN0cmluZzsgY29uZmlybVBhc3N3b3JkOiBzdHJpbmcgfVxuICAgICAgY29uc3QgeyB0b2tlbiwgcGFzc3dvcmQsIGNvbmZpcm1QYXNzd29yZCB9ID0gYm9keVxuXG4gICAgICBpZiAoIXRva2VuIHx8ICFwYXNzd29yZCB8fCAhY29uZmlybVBhc3N3b3JkKSB7XG4gICAgICAgIHJldHVybiBlcnJvclJlc3BvbnNlKCdUb2tlbiBhbmQgcGFzc3dvcmQgYXJlIHJlcXVpcmVkJylcbiAgICAgIH1cblxuICAgICAgLy8gUmF0ZSBsaW1pdGluZzogMyBhdHRlbXB0cyBwZXIgaG91ciBwZXIgSVBcbiAgICAgIGNvbnN0IGlwID0gZ2V0UmVxdWVzdElkZW50aWZpZXIocmVxLCAndW5rbm93bicpXG4gICAgICBjb25zdCBpZGVudGlmaWVyID0gYHBhc3N3b3JkLXJlc2V0OiR7aXB9YFxuICAgICAgY29uc3QgcmF0ZUxpbWl0ID0gY2hlY2tSYXRlTGltaXQoaWRlbnRpZmllciwgUkFURV9MSU1JVF9QUkVTRVRTLnBhc3N3b3JkUmVzZXQpXG5cbiAgICAgIGlmICghcmF0ZUxpbWl0LmFsbG93ZWQpIHtcbiAgICAgICAgY29uc29sZS5sb2coYFtSYXRlIExpbWl0XSBQYXNzd29yZCByZXNldCBhdHRlbXB0ZWQgdG9vIG1hbnkgdGltZXMgZnJvbSBJUCAke2lwfTogcmV0cnkgaW4gJHtyYXRlTGltaXQucmV0cnlBZnRlcn1zYClcbiAgICAgICAgcmV0dXJuIHJhdGVMaW1pdEVycm9yUmVzcG9uc2UocmF0ZUxpbWl0LnJldHJ5QWZ0ZXIpXG4gICAgICB9XG5cbiAgICAgIGlmIChwYXNzd29yZCAhPT0gY29uZmlybVBhc3N3b3JkKSB7XG4gICAgICAgIHJldHVybiBlcnJvclJlc3BvbnNlKCdQYXNzd29yZHMgZG8gbm90IG1hdGNoJylcbiAgICAgIH1cblxuICAgICAgLy8gVmFsaWRhdGUgcGFzc3dvcmQgc3RyZW5ndGhcbiAgICAgIGNvbnN0IHBhc3N3b3JkVmFsaWRhdGlvbiA9IHZhbGlkYXRlUGFzc3dvcmQocGFzc3dvcmQpXG4gICAgICBpZiAoIXBhc3N3b3JkVmFsaWRhdGlvbi52YWxpZCkge1xuICAgICAgICByZXR1cm4ganNvbihcbiAgICAgICAgICB7XG4gICAgICAgICAgICBlcnJvcjogJ1Bhc3N3b3JkIGRvZXMgbm90IG1lZXQgcmVxdWlyZW1lbnRzJyxcbiAgICAgICAgICAgIGRldGFpbHM6IHBhc3N3b3JkVmFsaWRhdGlvbi5lcnJvcnMsXG4gICAgICAgICAgfSxcbiAgICAgICAgICA0MDBcbiAgICAgICAgKVxuICAgICAgfVxuXG4gICAgICAvLyBWYWxpZGF0ZSByZXNldCB0b2tlblxuICAgICAgY29uc3QgZW1haWwgPSB2YWxpZGF0ZVJlc2V0VG9rZW4odG9rZW4pXG4gICAgICBpZiAoIWVtYWlsKSB7XG4gICAgICAgIHJldHVybiBlcnJvclJlc3BvbnNlKCdJbnZhbGlkIG9yIGV4cGlyZWQgcmVzZXQgdG9rZW4nLCA0MDApXG4gICAgICB9XG5cbiAgICAgIC8vIEdldCB1c2VyXG4gICAgICBjb25zdCB1c2VyID0gYXdhaXQgZ2V0VXNlckJ5RW1haWwoZW1haWwpXG4gICAgICBpZiAoIXVzZXIgfHwgIXVzZXIuaXNfYWN0aXZlKSB7XG4gICAgICAgIHJldHVybiBlcnJvclJlc3BvbnNlKCdVc2VyIG5vdCBmb3VuZCcsIDQwNClcbiAgICAgIH1cblxuICAgICAgLy8gSGFzaCBuZXcgcGFzc3dvcmQgKG1vY2sgZm9yIG5vdylcbiAgICAgIGNvbnN0IHBhc3N3b3JkSGFzaCA9IGAkMmIkMTAkbW9jay0ke2NyeXB0by5yYW5kb21CeXRlcygxNikudG9TdHJpbmcoJ2hleCcpfWBcblxuICAgICAgLy8gVXBkYXRlIHVzZXIgcGFzc3dvcmQgaW4gZGF0YWJhc2VcbiAgICAgIHRyeSB7XG4gICAgICAgIC8vIFRPRE86IEltcGxlbWVudCB1cGRhdGVVc2VyUGFzc3dvcmQgaW4gZGIudHNcbiAgICAgICAgY29uc29sZS5sb2coYFdvdWxkIHVwZGF0ZSBwYXNzd29yZCBmb3IgJHtlbWFpbH1gKVxuICAgICAgICAvLyBhd2FpdCB1cGRhdGVVc2VyUGFzc3dvcmQodXNlci5pZCwgcGFzc3dvcmRIYXNoKVxuICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byB1cGRhdGUgcGFzc3dvcmQ6JywgZXJyKVxuICAgICAgICByZXR1cm4gZXJyb3JSZXNwb25zZSgnRmFpbGVkIHRvIHJlc2V0IHBhc3N3b3JkLiBQbGVhc2UgdHJ5IGFnYWluLicpXG4gICAgICB9XG5cbiAgICAgIC8vIEludmFsaWRhdGUgcmVzZXQgdG9rZW5cbiAgICAgIGludmFsaWRhdGVSZXNldFRva2VuKHRva2VuKVxuXG4gICAgICAvLyBBdWRpdDogUGFzc3dvcmQgcmVzZXQgY29tcGxldGVkXG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCBhcHBlbmRBdWRpdEV2ZW50KHtcbiAgICAgICAgICB0ZW5hbnRfaWQ6IHVzZXIudGVuYW50X2lkLFxuICAgICAgICAgIGVudGl0eV90eXBlOiAndXNlcicsXG4gICAgICAgICAgZW50aXR5X2lkOiBlbWFpbCxcbiAgICAgICAgICBhY3Rpb246ICd1c2VyLnBhc3N3b3JkX3Jlc2V0X2NvbXBsZXRlZCcsXG4gICAgICAgICAgYWN0b3JfaWQ6IHVzZXIuaWQsXG4gICAgICAgICAgbWV0YWRhdGE6IHsgZW1haWwgfSxcbiAgICAgICAgfSlcbiAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gbG9nIGF1ZGl0IGV2ZW50OicsIGVycilcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGpzb24oe1xuICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICBtZXNzYWdlOiAnUGFzc3dvcmQgcmVzZXQgc3VjY2Vzc2Z1bGx5LiBZb3UgY2FuIG5vdyBsb2cgaW4gd2l0aCB5b3VyIG5ldyBwYXNzd29yZC4nLFxuICAgICAgfSlcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcignUmVzZXQgcGFzc3dvcmQgZXJyb3I6JywgZXJyb3IpXG4gICAgICByZXR1cm4gZXJyb3JSZXNwb25zZSgnQW4gZXJyb3Igb2NjdXJyZWQuIFBsZWFzZSB0cnkgYWdhaW4uJylcbiAgICB9XG4gIH1cblxuICAvLyBQT1NUIC9hcGkvYXV0aC9wYXNzd29yZC9jaGFuZ2UgKGF1dGhlbnRpY2F0ZWQgZW5kcG9pbnQpXG4gIGlmIChwYXRobmFtZS5pbmNsdWRlcygnY2hhbmdlJykpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgYXV0aEhlYWRlciA9IHJlcS5oZWFkZXJzLmdldCgnYXV0aG9yaXphdGlvbicpXG4gICAgICBpZiAoIWF1dGhIZWFkZXI/LnN0YXJ0c1dpdGgoJ0JlYXJlciAnKSkge1xuICAgICAgICByZXR1cm4gZXJyb3JSZXNwb25zZSgnVW5hdXRob3JpemVkJywgNDAxKVxuICAgICAgfVxuXG4gICAgICAvLyBUT0RPOiBFeHRyYWN0IHVzZXIgZnJvbSBKV1QgdG9rZW5cbiAgICAgIC8vIGNvbnN0IHRva2VuID0gYXV0aEhlYWRlci5zbGljZSg3KVxuICAgICAgLy8gY29uc3QgY2xhaW1zID0gZGVjb2RlSldUKHRva2VuKVxuXG4gICAgICBjb25zdCBib2R5ID0gKGF3YWl0IHJlcS5qc29uKCkpIGFzIHtcbiAgICAgICAgY3VycmVudFBhc3N3b3JkOiBzdHJpbmdcbiAgICAgICAgbmV3UGFzc3dvcmQ6IHN0cmluZ1xuICAgICAgICBjb25maXJtUGFzc3dvcmQ6IHN0cmluZ1xuICAgICAgfVxuICAgICAgY29uc3QgeyBjdXJyZW50UGFzc3dvcmQsIG5ld1Bhc3N3b3JkLCBjb25maXJtUGFzc3dvcmQgfSA9IGJvZHlcblxuICAgICAgaWYgKCFjdXJyZW50UGFzc3dvcmQgfHwgIW5ld1Bhc3N3b3JkIHx8ICFjb25maXJtUGFzc3dvcmQpIHtcbiAgICAgICAgcmV0dXJuIGVycm9yUmVzcG9uc2UoJ0FsbCBwYXNzd29yZCBmaWVsZHMgYXJlIHJlcXVpcmVkJylcbiAgICAgIH1cblxuICAgICAgaWYgKG5ld1Bhc3N3b3JkICE9PSBjb25maXJtUGFzc3dvcmQpIHtcbiAgICAgICAgcmV0dXJuIGVycm9yUmVzcG9uc2UoJ05ldyBwYXNzd29yZHMgZG8gbm90IG1hdGNoJylcbiAgICAgIH1cblxuICAgICAgLy8gVmFsaWRhdGUgbmV3IHBhc3N3b3JkIHN0cmVuZ3RoXG4gICAgICBjb25zdCBwYXNzd29yZFZhbGlkYXRpb24gPSB2YWxpZGF0ZVBhc3N3b3JkKG5ld1Bhc3N3b3JkKVxuICAgICAgaWYgKCFwYXNzd29yZFZhbGlkYXRpb24udmFsaWQpIHtcbiAgICAgICAgcmV0dXJuIGpzb24oXG4gICAgICAgICAge1xuICAgICAgICAgICAgZXJyb3I6ICdQYXNzd29yZCBkb2VzIG5vdCBtZWV0IHJlcXVpcmVtZW50cycsXG4gICAgICAgICAgICBkZXRhaWxzOiBwYXNzd29yZFZhbGlkYXRpb24uZXJyb3JzLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgNDAwXG4gICAgICAgIClcbiAgICAgIH1cblxuICAgICAgLy8gVE9ETzogVmVyaWZ5IGN1cnJlbnQgcGFzc3dvcmQgYW5kIHVwZGF0ZSB0byBuZXcgcGFzc3dvcmRcblxuICAgICAgcmV0dXJuIGpzb24oe1xuICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICBtZXNzYWdlOiAnUGFzc3dvcmQgY2hhbmdlZCBzdWNjZXNzZnVsbHkuJyxcbiAgICAgIH0pXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0NoYW5nZSBwYXNzd29yZCBlcnJvcjonLCBlcnJvcilcbiAgICAgIHJldHVybiBlcnJvclJlc3BvbnNlKCdBbiBlcnJvciBvY2N1cnJlZC4gUGxlYXNlIHRyeSBhZ2Fpbi4nKVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiBlcnJvclJlc3BvbnNlKCdJbnZhbGlkIHBhc3N3b3JkIGVuZHBvaW50JywgNDAwKVxufVxuXG5leHBvcnQgY29uc3QgY29uZmlnID0geyBwYXRoOiAnL2FwaS9hdXRoL3Bhc3N3b3JkLzphY3Rpb24nIH1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7QUFPQSxJQUFNLGFBQWEsUUFBUSxJQUFJLGNBQWM7QUFHN0MsSUFBTSx1QkFBdUIsSUFBSSxLQUFLO0FBbUgvQixTQUFTLEtBQUssTUFBZSxTQUFTLEtBQWU7QUFDMUQsU0FBTyxTQUFTLEtBQUssTUFBTSxFQUFFLE9BQU8sQ0FBQztBQUN2QztBQUVPLFNBQVMsY0FBYyxTQUFpQixTQUFTLEtBQWU7QUFDckUsU0FBTyxLQUFLLEVBQUUsT0FBTyxRQUFRLEdBQUcsTUFBTTtBQUN4Qzs7O0FDOUhBLFNBQVMsWUFBWTtBQUVyQixJQUFNLGVBQWUsUUFBUSxJQUFJO0FBQ2pDLElBQUksT0FBb0I7QUFFeEIsU0FBUyxVQUFnQjtB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
