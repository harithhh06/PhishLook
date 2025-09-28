const express = require("express");
const cors = require("cors");
const natural = require("natural"); // Simple NLP library
const Sentiment = require("sentiment"); // Sentiment analysis
const nlp = require("compromise"); // Text processing
const https = require("https");
const querystring = require("querystring");
const devCerts = require("office-addin-dev-certs");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3001; // Different port from your Office dev server
const PHISHTANK_ENDPOINT = "https://checkurl.phishtank.com/checkurl/";
const PHISHTANK_USER_AGENT =
  process.env.PHISHTANK_USER_AGENT || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) PhishLook/1.0";
// URLHaus v1 API endpoint for URL lookups
const URLHAUS_API_BASE = "https://urlhaus-api.abuse.ch/v1/url/";

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

// Initialize sentiment analyzer
const sentiment = new Sentiment();

// ====================
// SIMPLE AI SUSPICIOUSNESS DETECTOR
// ====================

class SimpleSuspiciousnessDetector {
  constructor() {
    // Suspicious text patterns (CSA-inspired)
    this.suspiciousPatterns = {
      urgency: [
        "urgent",
        "immediately",
        "asap",
        "right away",
        "act now",
        "expires today",
        "limited time",
        "hurry",
        "deadline",
        "don't wait",
        "act fast",
        "time sensitive",
      ],
      authority: [
        "bank",
        "government",
        "tax office",
        "irs",
        "microsoft",
        "google",
        "apple",
        "paypal",
        "amazon",
        "security team",
        "official notice",
        "department",
      ],
      threats: [
        "suspend",
        "close",
        "terminate",
        "deactivate",
        "freeze",
        "legal action",
        "penalty",
        "fine",
        "court",
        "lawsuit",
      ],
      credentials: [
        "verify",
        "confirm",
        "update",
        "password",
        "username",
        "account details",
        "personal information",
        "ssn",
        "credit card",
        "bank account",
      ],
      rewards: [
        "congratulations",
        "winner",
        "prize",
        "lottery",
        "million",
        "selected",
        "lucky",
        "free money",
        "inheritance",
      ],
    };

    // Link and attachment patterns
    this.urlPatterns = {
      shorteners: ["bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly"],
      suspiciousExts: [".exe", ".scr", ".bat", ".cmd", ".zip"],
      legitimateDomains: ["google.com", "microsoft.com", "dbs.com.sg", "ocbc.com.sg"],
    };

    this.attachmentPatterns = {
      dangerousExtensions: [
        ".exe",
        ".scr",
        ".bat",
        ".cmd",
        ".com",
        ".pif",
        ".vbs",
        ".js",
        ".jar",
        ".app",
        ".deb",
        ".pkg",
        ".dmg",
        ".msi",
        ".run",
      ],
      archiveExtensions: [".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".cab", ".ace"],
      scriptExtensions: [".vbs", ".vbe", ".js", ".jse", ".wsf", ".wsh", ".ps1", ".ps2"],
      suspiciousNames: [
        "invoice",
        "receipt",
        "document",
        "payment",
        "statement",
        "order",
        "delivery",
        "confirmation",
        "urgent",
        "important",
        "banking",
        "security",
        "update",
        "patch",
        "install",
      ],
      documentExtensions: [
        ".pdf",
        ".doc",
        ".docx",
        ".xls",
        ".xlsx",
        ".ppt",
        ".pptx",
        ".txt",
        ".rtf",
        ".odt",
        ".ods",
        ".odp",
      ],
      mediaExtensions: [
        ".jpg",
        ".jpeg",
        ".png",
        ".gif",
        ".bmp",
        ".svg",
        ".webp",
        ".mp3",
        ".mp4",
        ".avi",
        ".mov",
        ".wav",
      ],
    };
  }

  analyzeEmail(emailData) {
    console.log("🔍 Starting email analysis...");
    const fullText = `${emailData.subject || ""} ${emailData.body || ""}`.toLowerCase();
    console.log("📝 Email text length:", fullText.length);

    const patternScores = this.countSuspiciousPatterns(fullText);
    console.log("📊 Pattern scores:", patternScores);

    const sentimentScore = this.analyzeSentiment(fullText);
    console.log("😊 Sentiment analysis:", sentimentScore);

    const linkAnalysis = this.analyzeLinks(emailData.htmlBody || "");
    console.log("🔗 Link analysis:", linkAnalysis);

    const attachmentAnalysis = this.analyzeAttachments(emailData.attachments || []);
    console.log("📎 Attachment analysis:", attachmentAnalysis);

    const punctuationScore = this.checkPunctuation(fullText);
    console.log("❗ Punctuation score:", punctuationScore);

    const suspicionScore = this.calculateOverallScore(
      patternScores,
      sentimentScore,
      punctuationScore,
      linkAnalysis,
      attachmentAnalysis
    );
    console.log("🎯 Final suspicion score:", suspicionScore);

    const riskLevel = this.determineRiskLevel(suspicionScore);
    console.log("⚠️ Risk level:", riskLevel);

    const explanation = this.generateExplanation(patternScores, sentimentScore, riskLevel);

    return {
      suspicionScore: Math.round(suspicionScore * 100),
      riskLevel,
      explanation,
      details: {
        patternMatches: patternScores,
        sentiment: sentimentScore,
        punctuation: punctuationScore,
        linkAnalysis: linkAnalysis,
        attachmentAnalysis: attachmentAnalysis,
      },
    };
  }

  countSuspiciousPatterns(text) {
    const scores = {};
    let totalMatches = 0;
    for (const [category, patterns] of Object.entries(this.suspiciousPatterns)) {
      let matches = 0;
      for (const pattern of patterns) {
        const regex = new RegExp(`\\b${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
        matches += (text.match(regex) || []).length;
      }
      scores[category] = matches;
      totalMatches += matches;
      console.log(`  ${category}: ${matches} matches`);
    }
    scores.total = totalMatches;
    return scores;
  }

  analyzeSentiment(text) {
    const result = sentiment.analyze(text);
    const normalizedScore = Math.max(0, -result.score / 10);
    return {
      score: result.score,
      comparative: result.comparative,
      negative: result.negative,
      positive: result.positive,
      suspiciousness: Math.min(normalizedScore, 1),
    };
  }

  checkPunctuation(text) {
    let score = 0;
    const exclamations = (text.match(/!/g) || []).length;
    if (exclamations > 3) score += 0.2;
    const questions = (text.match(/\?/g) || []).length;
    if (questions > 3) score += 0.1;
    const words = text.split(" ");
    const capsWords = words.filter(
      (w) => w.length > 3 && w === w.toUpperCase() && /^[A-Z]+$/.test(w)
    ).length;
    if (capsWords > 2) score += 0.3;
    console.log(
      `  Exclamations: ${exclamations}, Questions: ${questions}, CAPS words: ${capsWords}`
    );
    return Math.min(score, 1);
  }

  analyzeLinks(htmlBody) {
    if (!htmlBody) {
      return { totalLinks: 0, suspiciousLinks: 0, suspicionScore: 0, details: [] };
    }
    const linkRegex = /<a[^>]*href\s*=\s*["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
    const links = [];
    let m;
    while ((m = linkRegex.exec(htmlBody)) !== null) {
      const url = m[1];
      const text = m[2].replace(/<[^>]*>/g, "").trim();
      links.push({ url, text });
    }
    let suspiciousCount = 0;
    const linkDetails = links.map((link) => {
      const res = this.isLinkSuspicious(link);
      if (res.suspicious) suspiciousCount++;
      return {
        url: link.url,
        anchorText: link.text,
        isSuspicious: res.suspicious,
        reasons: res.reasons,
      };
    });
    return {
      totalLinks: links.length,
      suspiciousLinks: suspiciousCount,
      mismatches: linkDetails.filter((l) => l.reasons.includes("text_mismatch")).length,
      shorteners: linkDetails.filter((l) => l.reasons.includes("url_shortener")).length,
      suspiciousExtensions: linkDetails.filter((l) => l.reasons.includes("suspicious_extension"))
        .length,
      suspicionScore: links.length > 0 ? suspiciousCount / links.length : 0,
      details: linkDetails,
    };
  }

  isLinkSuspicious(link) {
    const reasons = [];
    if (this.hasTextMismatch(link.text, link.url)) reasons.push("text_mismatch");
    if (this.urlPatterns.shorteners.some((s) => link.url.includes(s)))
      reasons.push("url_shortener");
    if (this.urlPatterns.suspiciousExts.some((ext) => link.url.includes(ext)))
      reasons.push("suspicious_extension");
    return { suspicious: reasons.length > 0, reasons };
  }

  hasTextMismatch(text, url) {
    if (!text || !url) return false;
    const generic = ["click here", "read more", "download", "continue"];
    if (generic.some((g) => text.toLowerCase().includes(g))) return false;
    try {
      const urlObj = new URL(url.startsWith("http") ? url : "http://" + url);
      const domain = urlObj.hostname.toLowerCase();
      const domainRegex = /([a-zA-Z0-9-]+\.[a-zA-Z]{2,})/g;
      const textDomains = text.match(domainRegex);
      if (textDomains) {
        return textDomains.some((td) => !domain.includes(td.toLowerCase()));
      }
    } catch (_) {
      return false;
    }
    return false;
  }

  analyzeAttachments(attachments) {
    if (!attachments || !Array.isArray(attachments) || attachments.length === 0) {
      return {
        totalAttachments: 0,
        suspiciousAttachments: 0,
        dangerousFiles: 0,
        archiveFiles: 0,
        scriptFiles: 0,
        suspiciousNames: 0,
        suspicionScore: 0,
        details: [],
      };
    }
    console.log(`📎 Analyzing ${attachments.length} attachments...`);
    let suspiciousCount = 0;
    let dangerousCount = 0;
    let archiveCount = 0;
    let scriptCount = 0;
    let suspiciousNameCount = 0;
    const attachmentDetails = [];

    for (const attachment of attachments) {
      const analysis = this.analyzeSingleAttachment(attachment);
      attachmentDetails.push(analysis);

      if (analysis.isSuspicious) {
        suspiciousCount++;
        if (analysis.reasons.includes("dangerous_extension")) dangerousCount++;
        if (analysis.reasons.includes("archive_file")) archiveCount++;
        if (analysis.reasons.includes("script_file")) scriptCount++;
        if (analysis.reasons.includes("suspicious_name")) suspiciousNameCount++;
      }
    }
    const attachmentSuspicionScore =
      attachments.length > 0 ? Math.min(suspiciousCount / attachments.length, 1) : 0;
    return {
      totalAttachments: attachments.length,
      suspiciousAttachments: suspiciousCount,
      dangerousFiles: dangerousCount,
      archiveFiles: archiveCount,
      scriptFiles: scriptCount,
      suspiciousNames: suspiciousNameCount,
      suspicionScore: attachmentSuspicionScore,
      details: attachmentDetails,
    };
  }

  analyzeSingleAttachment(attachment) {
    const reasons = [];
    let isSuspicious = false;
    let riskLevel = "low";
    const filename = attachment.name || attachment.filename || "unknown";
    const size = attachment.size || 0;
    const contentType = attachment.contentType || "";
    console.log(`🔍 Analyzing attachment: ${filename} (${size} bytes)`);
    try {
      if (this.hasDangerousExtension(filename)) {
        reasons.push("dangerous_extension");
        isSuspicious = true;
        riskLevel = "high";
      }
      if (this.isArchiveFile(filename)) {
        reasons.push("archive_file");
        if (!isSuspicious) {
          isSuspicious = true;
          riskLevel = "medium";
        }
      }
      if (this.isScriptFile(filename)) {
        reasons.push("script_file");
        isSuspicious = true;
        riskLevel = "high";
      }
      if (this.hasSuspiciousName(filename)) {
        reasons.push("suspicious_name");
        if (!isSuspicious) {
          isSuspicious = true;
          riskLevel = "medium";
        }
      }
      if (this.hasDoubleExtension(filename)) {
        reasons.push("double_extension");
        isSuspicious = true;
        riskLevel = "high";
      }
      if (this.hasSuspiciousSize(filename, size)) {
        reasons.push("suspicious_size");
        if (!isSuspicious) {
          isSuspicious = true;
          riskLevel = "medium";
        }
      }
    } catch (e) {
      console.error("Error analyzing attachment:", e);
    }
    return {
      filename: filename,
      size: size,
      contentType: contentType,
      isSuspicious: isSuspicious,
      reasons: reasons,
      riskLevel: riskLevel,
    };
  }

  hasDangerousExtension(filename) {
    const lower = filename.toLowerCase();
    return this.attachmentPatterns.dangerousExtensions.some((ext) => lower.endsWith(ext));
  }
  isArchiveFile(filename) {
    const lower = filename.toLowerCase();
    return this.attachmentPatterns.archiveExtensions.some((ext) => lower.endsWith(ext));
  }
  isScriptFile(filename) {
    const lower = filename.toLowerCase();
    return this.attachmentPatterns.scriptExtensions.some((ext) => lower.endsWith(ext));
  }
  hasSuspiciousName(filename) {
    const lower = filename.toLowerCase();
    return this.attachmentPatterns.suspiciousNames.some((name) => lower.includes(name));
  }
  hasDoubleExtension(filename) {
    // common malware trick
    const parts = filename.split(".");
    if (parts.length < 3) return false;
    const secondExt = parts[parts.length - 2].toLowerCase();
    const finalExt = parts[parts.length - 1].toLowerCase();
    const docExts = ["pdf", "doc", "xls", "ppt", "txt", "jpg", "png"];
    const execExts = ["exe", "scr", "bat", "com", "pif"];
    return docExts.includes(secondExt) && execExts.includes(finalExt);
  }
  hasSuspiciousSize(filename, size) {
    if (!size || size === 0) return false;
    const lower = filename.toLowerCase();
    if (this.hasDangerousExtension(filename) && size < 10000) return true;
    const isDocument = this.attachmentPatterns.documentExtensions.some((ext) =>
      lower.endsWith(ext)
    );
    if (isDocument && size > 50 * 1024 * 1024) {
      return true;
    }
    return false;
  }

  calculateOverallScore(
    patternScores,
    sentimentScore,
    punctuationScore,
    linkAnalysis,
    attachmentAnalysis
  ) {
    const weights = {
      patterns: 0.3,
      sentiment: 0.2,
      punctuation: 0.1,
      links: 0.2,
      attachments: 0.2,
    };
    const normalizedPatterns = Math.min(patternScores.total / 10, 1);
    const linkScore = linkAnalysis ? linkAnalysis.suspicionScore : 0;
    const attachmentScore = attachmentAnalysis ? attachmentAnalysis.suspicionScore : 0;
    const totalScore =
      normalizedPatterns * weights.patterns +
      sentimentScore.suspiciousness * weights.sentiment +
      punctuationScore * weights.punctuation +
      linkScore * weights.links +
      attachmentScore * weights.attachments;
    return Math.min(totalScore, 1);
  }

  determineRiskLevel(score) {
    if (score >= 0.7) return "high";
    if (score >= 0.4) return "medium";
    return "low";
  }

  generateExplanation(patternScores, sentimentScore) {
    const reasons = [];
    if (patternScores.urgency > 0)
      reasons.push(`Found ${patternScores.urgency} urgency indicators`);
    if (patternScores.threats > 0)
      reasons.push(`Contains ${patternScores.threats} threatening language`);
    if (patternScores.authority > 0)
      reasons.push(`Claims authority/official status ${patternScores.authority} times`);
    if (patternScores.credentials > 0)
      reasons.push(`Requests personal information ${patternScores.credentials} times`);
    if (patternScores.rewards > 0)
      reasons.push(`Makes ${patternScores.rewards} reward/prize claims`);
    if (sentimentScore.suspiciousness > 0.3) reasons.push("Uses negative/threatening language");
    return reasons.length
      ? `Suspicious because: ${reasons.join(", ")}.`
      : "No significant suspicious indicators detected.";
  }
}

// Create detector instance
const detector = new SimpleSuspiciousnessDetector();

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
  });
});

// Main analysis endpoint
app.post("/api/analyze-suspiciousness", (req, res) => {
  try {
    console.log("\n🚀 New analysis request received");

    // Get email data from request
    const emailData = req.body;
    console.log("📧 Email data:", {
      subject: emailData.subject ? `"${emailData.subject.substring(0, 50)}..."` : "No subject",
      bodyLength: emailData.body ? emailData.body.length : 0,
      sender: emailData.sender || "Unknown sender",
    });

    // Validate input
    if (!emailData.subject && !emailData.body) {
      console.log("❌ No email content provided");
      return res.status(400).json({
        error: "Email subject or body required",
        message: "Please provide email content to analyze",
      });
    }

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
      .listen(PORT, () => {
        // Load local phishing DB on startup
        loadLocalPhishDb();
        console.log("\n🎉 AI Suspiciousness Detection Server Started (HTTPS)!");
        console.log(`📍 Server running at: https://localhost:${PORT}`);
        console.log(`🔍 Health check: https://localhost:${PORT}/health`);
        console.log(`🧪 Test endpoint: https://localhost:${PORT}/api/test`);
        console.log("\n📋 Available endpoints:");
        console.log("  POST /api/analyze-suspiciousness - Main analysis");
        console.log("  POST /phishlink - Local phishing_database.json lookup");
        console.log("  GET  /health - Health check");
        console.log("  GET  /api/test - Test with sample data");
        console.log("\n🚀 Ready to analyze emails!\n");
      });
  } catch (e) {
    console.warn("⚠️ HTTPS dev cert not available, falling back to HTTP:", e.message);
    app.listen(PORT, () => {
      // Load local phishing DB on startup
      loadLocalPhishDb();
      console.log("\n🎉 AI Suspiciousness Detection Server Started (HTTP fallback)!");
      console.log(`📍 Server running at: http://localhost:${PORT}`);
      console.log(`🔍 Health check: http://localhost:${PORT}/health`);
      console.log(`🧪 Test endpoint: http://localhost:${PORT}/api/test`);
      console.log("\n📋 Available endpoints:");
      console.log("  POST /api/analyze-suspiciousness - Main analysis");
      console.log("  POST /phishlink - Local phishing_database.json lookup");
      console.log("  GET  /health - Health check");
      console.log("  GET  /api/test - Test with sample data");
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

// ====================
// PHISHTANK LINK CHECK ENDPOINT
// ====================

/**
 * POST /phishlink
 * Body: { links: string[] }
 * For each link, checks against PhishTank and returns an array of results.
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

// (Removed) External URL checks and HTTP helpers now replaced by local DB lookup
