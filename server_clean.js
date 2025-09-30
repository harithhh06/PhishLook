const express = require("express");
const cors = require("cors");
const https = require("https");
const querystring = require("querystring");
const devCerts = require("office-addin-dev-certs");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3001; // Different port from your Office dev server

// ====================
// DETECTOR IMPORTS
// ====================
const { SimpleSuspiciousnessDetector } = require("./detectors/SimpleSuspiciousnessDetector");
const { OllamaDetector } = require("./detectors/OllamaDetector");

const detector = new SimpleSuspiciousnessDetector();
const ollamaDetector = new OllamaDetector();

// ====================
// LOCAL PHISHING DB (phishing_database.json)
// ====================
const LOCAL_DB_PATH = path.join(__dirname, "phishing_database.json");
let localDbStats = { loaded: false, records: 0, indexSize: 0, lastLoaded: null };
// Map of multiple normalized url keys -> record
const phishUrlIndex = new Map();

function decodeEntities(str) {
  if (!str || typeof str !== "string") return str;
  return str
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function buildIndexKeys(rawUrl) {
  const keys = new Set();
  if (!rawUrl || typeof rawUrl !== "string") return Array.from(keys);
  const trimmed = rawUrl.trim();
  const decoded = decodeEntities(trimmed);

  const candidates = new Set([trimmed, decoded]);

  for (const c of candidates) {
    if (!c) continue;
    keys.add(c);
    try {
      const hasScheme = /^(https?:)?\/\//i.test(c);
      const toParse = hasScheme ? c : `http://${c}`;
      const u = new URL(toParse);
      const hostLower = u.hostname.toLowerCase();
      const protoLower = (u.protocol || "").toLowerCase();
      const pathname = u.pathname || "/";
      const search = u.search || "";
      const canonical = `${protoLower}//${hostLower}${pathname}${search}`;
      // protocol-neutral form (helps http vs https mismatches)
      const schemeAgnostic = `//${hostLower}${pathname}${search}`;
      keys.add(canonical);
      keys.add(schemeAgnostic);

      // toggle trailing slash variant (if not just root)
      if (pathname !== "/") {
        if (pathname.endsWith("/")) {
          const noSlash = pathname.replace(/\/+$/, "");
          keys.add(`${protoLower}//${hostLower}${noSlash}${search}`);
          keys.add(`//${hostLower}${noSlash}${search}`);
        } else {
          keys.add(`${protoLower}//${hostLower}${pathname}/${search}`.replace(/\?\//, "/?"));
          keys.add(`//${hostLower}${pathname}/${search}`.replace(/\?\//, "/?"));
        }
      }
    } catch (_) {
      // ignore parse errors
    }
  }
  return Array.from(keys);
}

function addRecordToIndex(record) {
  const url = record && record.url;
  if (!url) return;
  const keys = buildIndexKeys(url);
  for (const k of keys) {
    if (!phishUrlIndex.has(k)) {
      phishUrlIndex.set(k, record);
    }
  }
}

function loadLocalPhishDb() {
  try {
    const raw = fs.readFileSync(LOCAL_DB_PATH, "utf8");
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) throw new Error("phishing_database.json is not an array");
    phishUrlIndex.clear();
    for (const rec of arr) addRecordToIndex(rec);
    localDbStats.loaded = true;
    localDbStats.records = arr.length;
    localDbStats.indexSize = phishUrlIndex.size;
    localDbStats.lastLoaded = new Date().toISOString();
    console.log(
      `📚 Local phishing DB loaded: ${localDbStats.records} records, ${localDbStats.indexSize} indexed keys.`
    );
  } catch (e) {
    localDbStats.loaded = false;
    localDbStats.records = 0;
    localDbStats.indexSize = 0;
    localDbStats.lastLoaded = null;
    console.warn(`⚠️ Failed to load local phishing DB at ${LOCAL_DB_PATH}: ${e.message}`);
  }
}

// Enable CORS for your Outlook add-in
app.use(
  cors({
    origin: [
      "https://localhost:3000",
      "https://outlook.office.com",
      "https://outlook.office365.com",
    ],
  })
);

// Parse JSON requests
app.use(express.json());

// ====================
// API ENDPOINTS
// ====================

// Health check endpoint
app.get("/health", (req, res) => {
  console.log("💚 Health check requested");
  res.json({
    status: "healthy",
    message: "AI Suspiciousness Detection API is running",
    timestamp: new Date().toISOString(),
    localDb: localDbStats,
    ollama: ollamaDetector.getStats(),
  });
});

// Main analysis endpoint
app.post("/api/analyze-suspiciousness", (req, res) => {
  try {
    console.log("\n🚀 New analysis request received");

    // Get email data from request
    const emailData = req.body;

    // Validate input
    if (!emailData.subject && !emailData.body) {
      console.log("❌ No email content provided");
      return res.status(400).json({
        error: "Email subject or body required",
        message: "Please provide email content to analyze",
      });
    }

    console.log("Email data: ", emailData);

    // Run AI analysis
    const analysis = detector.analyzeEmail(emailData);

    // Send response
    const response = {
      status: "success",
      timestamp: new Date().toISOString(),
      analysis: analysis,
      email_info: {
        subject: emailData.subject || "No subject",
        sender: emailData.sender || "Unknown",
        body_length: emailData.body ? emailData.body.length : 0,
      },
    };

    console.log("✅ Analysis complete, sending response");
    res.json(response);
  } catch (error) {
    console.error("💥 Analysis failed:", error);
    res.status(500).json({
      status: "error",
      message: "Analysis failed",
      error: error.message,
    });
  }
});

// AI-powered analysis endpoint using Ollama
app.post("/api/analyze-with-ai", async (req, res) => {
  try {
    console.log("\n🤖 New Ollama analysis request received");

    const emailData = req.body;

    // Validate input
    if (!emailData.subject && !emailData.body) {
      console.log("❌ No email content provided");
      return res.status(400).json({
        error: "Email subject or body required",
        message: "Please provide email content to analyze",
      });
    }

    const stats = ollamaDetector.getStats();
    if (!stats.available) {
      return res.status(503).json({
        status: "error",
        message: "Ollama AI is not available",
        error: stats.error,
        fallback: "Use /api/analyze-suspiciousness for heuristic analysis",
      });
    }

    console.log("🤖 Analyzing with Ollama AI...");
    const aiAnalysis = await ollamaDetector.analyzeEmail(emailData);

    // Also run traditional analysis for comparison
    const traditionalAnalysis = detector.analyzeEmail(emailData);

    const response = {
      status: "success",
      timestamp: new Date().toISOString(),
      ai_analysis: aiAnalysis,
      traditional_analysis: traditionalAnalysis,
      email_info: {
        subject: emailData.subject || "No subject",
        sender: emailData.sender || "Unknown",
        body_length: emailData.body ? emailData.body.length : 0,
      },
    };

    console.log("✅ AI analysis complete");
    res.json(response);
  } catch (error) {
    console.error("💥 AI analysis failed:", error);
    res.status(500).json({
      status: "error",
      message: "AI analysis failed",
      error: error.message,
    });
  }
});

// Test endpoint with sample data
app.get("/api/test", (req, res) => {
  console.log("🧪 Test endpoint called");

  const testEmail = {
    subject: "URGENT: Account Suspension Notice",
    body: "Your bank account will be suspended immediately unless you verify your information right away. Click here to update your password and personal details. Act now or lose access forever!",
    sender: "security@fake-bank.com",
  };

  const analysis = detector.analyzeEmail(testEmail);

  res.json({
    status: "test",
    test_email: testEmail,
    analysis: analysis,
  });
});

// Test Ollama endpoint
app.get("/api/test-ai", async (req, res) => {
  console.log("🧪 AI Test endpoint called");

  const stats = ollamaDetector.getStats();
  if (!stats.available) {
    return res.status(503).json({
      status: "error",
      message: "Ollama AI is not available",
      error: stats.error,
    });
  }

  try {
    const testResult = await ollamaDetector.runTest();
    const traditionalAnalysis = detector.analyzeEmail(testResult.testEmail);

    res.json({
      status: "test",
      test_email: testResult.testEmail,
      ai_analysis: testResult.analysis,
      traditional_analysis: traditionalAnalysis,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "AI test failed",
      error: error.message,
    });
  }
});

// ====================
// PHISHLINK ENDPOINT - LOCAL DB LOOKUP
// ====================

/**
 * POST /phishlink
 * Body: { links: string[] }
 * For each link, checks against local phishing_database.json
 */
app.post("/phishlink", async (req, res) => {
  try {
    const links = Array.isArray(req.body?.links) ? req.body.links : [];

    if (!links.length) {
      return res.status(400).json({
        status: "error",
        message: "No links provided. Send { links: string[] }",
      });
    }

    if (!localDbStats.loaded) {
      console.warn("⚠️ /phishlink called but local DB is not loaded.");
      // We still process and return not-found results to keep client flow working
    }

    // Deduplicate and sanitize
    const normalized = [
      ...new Set(links.map((l) => (typeof l === "string" ? l.trim() : "")).filter(Boolean)),
    ];

    console.log(`\n🧷 /phishlink received ${normalized.length} link(s):`);
    normalized.forEach((u, i) => console.log(`  [${i + 1}] ${u}`));

    const results = normalized.map((link) => {
      const keys = buildIndexKeys(link);
      let matchedRecord = null;
      let matchedKey = null;
      for (const k of keys) {
        if (phishUrlIndex.has(k)) {
          matchedRecord = phishUrlIndex.get(k);
          matchedKey = k;
          break;
        }
      }

      if (!matchedRecord) {
        return {
          url: link,
          inDatabase: false,
          isPhish: null,
          verified: false,
          online: null,
          phishId: null,
          detailPage: null,
          target: null,
          source: "local-db",
        };
      }

      const verified = String(matchedRecord.verified || "").toLowerCase() === "yes";
      const online = String(matchedRecord.online || "").toLowerCase() === "yes";
      return {
        url: link,
        inDatabase: true,
        isPhish: verified || online || true, // being in DB implies malicious intent
        verified,
        online,
        phishId: matchedRecord.phish_id || null,
        detailPage: matchedRecord.phish_detail_url || null,
        target: matchedRecord.target || null,
        matchedKey,
        source: "local-db",
      };
    });

    const detected = results.filter((r) => r.inDatabase === true);

    // Log summary
    console.log("\n🧪 Local DB results:");
    results.forEach((r) => {
      if (!r.inDatabase) {
        console.log(`  • ${r.url} -> not found`);
      } else {
        console.log(
          `  ✔ ${r.url} -> FOUND id=${r.phishId || "n/a"} verified=${r.verified} online=${r.online} target=${r.target || "n/a"}`
        );
      }
    });

    res.json({
      status: "success",
      dbLoaded: localDbStats.loaded,
      total: normalized.length,
      detectedCount: detected.length,
      results,
    });
  } catch (err) {
    console.error("💥 /phishlink failed:", err);
    res.status(500).json({ status: "error", message: err.message || "Server error" });
  }
});

// ====================
// START SERVER
// ====================

startServer();

async function startServer() {
  try {
    const httpsOptions = await devCerts.getHttpsServerOptions();
    https
      .createServer(
        {
          key: httpsOptions.key,
          cert: httpsOptions.cert,
          ca: httpsOptions.ca,
        },
        app
      )
      .listen(PORT, async () => {
        // Load local phishing DB on startup
        loadLocalPhishDb();
        // Check Ollama availability
        await ollamaDetector.checkHealth();

        console.log("\n🎉 AI Suspiciousness Detection Server Started (HTTPS)!");
        console.log(`📍 Server running at: https://localhost:${PORT}`);
        console.log(`🔍 Health check: https://localhost:${PORT}/health`);
        console.log(`🧪 Test endpoint: https://localhost:${PORT}/api/test`);
        console.log("\n📋 Available endpoints:");
        console.log("  POST /api/analyze-suspiciousness - Heuristic analysis");
        console.log("  POST /api/analyze-with-ai - AI-powered analysis (Ollama)");
        console.log("  POST /phishlink - Local phishing_database.json lookup");
        console.log("  GET  /health - Health check + Ollama status");
        console.log("  GET  /api/test - Test heuristic analysis");
        console.log("  GET  /api/test-ai - Test AI analysis");
        console.log("\n🚀 Ready to analyze emails!\n");
      });
  } catch (e) {
    console.warn("⚠️ HTTPS dev cert not available, falling back to HTTP:", e.message);
    app.listen(PORT, async () => {
      // Load local phishing DB on startup
      loadLocalPhishDb();
      // Check Ollama availability
      await ollamaDetector.checkHealth();

      console.log("\n🎉 AI Suspiciousness Detection Server Started (HTTP fallback)!");
      console.log(`📍 Server running at: http://localhost:${PORT}`);
      console.log(`🔍 Health check: http://localhost:${PORT}/health`);
      console.log(`🧪 Test endpoint: http://localhost:${PORT}/api/test`);
      console.log("\n📋 Available endpoints:");
      console.log("  POST /api/analyze-suspiciousness - Heuristic analysis");
      console.log("  POST /api/analyze-with-ai - AI-powered analysis (Ollama)");
      console.log("  POST /phishlink - Local phishing_database.json lookup");
      console.log("  GET  /health - Health check + Ollama status");
      console.log("  GET  /api/test - Test heuristic analysis");
      console.log("  GET  /api/test-ai - Test AI analysis");
      console.log("\n🚀 Ready to analyze emails!\n");
    });
  }
}

// Handle graceful shutdown
process.on("SIGTERM", () => {
  console.log("👋 Server shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("\n👋 Server stopped by user");
  process.exit(0);
});
