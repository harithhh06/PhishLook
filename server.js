const express = require("express");
const cors = require("cors");
const natural = require("natural"); // Simple NLP library
const Sentiment = require("sentiment"); // Sentiment analysis
const nlp = require("compromise"); // Text processing
const https = require("https");
const querystring = require("querystring");
const devCerts = require("office-addin-dev-certs");

const app = express();
const PORT = 3001; // Different port from your Office dev server
const PHISHTANK_ENDPOINT = "https://checkurl.phishtank.com/checkurl/";
const PHISHTANK_USER_AGENT =
  process.env.PHISHTANK_USER_AGENT || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) PhishLook/1.0";
// URLHaus v1 API endpoint for URL lookups
const URLHAUS_API_BASE = "https://urlhaus-api.abuse.ch/v1/url/";

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
        console.log("\n🎉 AI Suspiciousness Detection Server Started (HTTPS)!");
        console.log(`📍 Server running at: https://localhost:${PORT}`);
        console.log(`🔍 Health check: https://localhost:${PORT}/health`);
        console.log(`🧪 Test endpoint: https://localhost:${PORT}/api/test`);
        console.log("\n📋 Available endpoints:");
        console.log("  POST /api/analyze-suspiciousness - Main analysis");
        console.log("  POST /phishlink - PhishTank checks + URLHaus fallback");
        console.log("  GET  /health - Health check");
        console.log("  GET  /api/test - Test with sample data");
        console.log("\n🚀 Ready to analyze emails!\n");
      });
  } catch (e) {
    console.warn("⚠️ HTTPS dev cert not available, falling back to HTTP:", e.message);
    app.listen(PORT, () => {
      console.log("\n🎉 AI Suspiciousness Detection Server Started (HTTP fallback)!");
      console.log(`📍 Server running at: http://localhost:${PORT}`);
      console.log(`🔍 Health check: http://localhost:${PORT}/health`);
      console.log(`🧪 Test endpoint: http://localhost:${PORT}/api/test`);
      console.log("\n📋 Available endpoints:");
      console.log("  POST /api/analyze-suspiciousness - Main analysis");
      console.log("  POST /phishlink - PhishTank checks + URLHaus fallback");
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

    // Deduplicate and sanitize
    const normalized = [
      ...new Set(links.map((l) => (typeof l === "string" ? l.trim() : "")).filter(Boolean)),
    ];

    // Log all links received
    console.log(`\n🧷 /phishlink received ${normalized.length} link(s):`);
    normalized.forEach((u, i) => console.log(`  [${i + 1}] ${u}`));

    const results = await Promise.allSettled(normalized.map(checkWithPhishTank));

    let parsed = results.map((r, idx) => {
      if (r.status === "fulfilled") {
        return r.value;
      }
      return {
        url: normalized[idx],
        inDatabase: false,
        isPhish: null,
        verified: false,
        error: r.reason?.message || "Unknown error",
        httpStatus: null,
      };
    });

    // URLHaus fallback checks for items not conclusively flagged by PhishTank
    const urlhausResults = await Promise.allSettled(
      parsed.map((r) => {
        const needsFallback = r.error || r.inDatabase === false || r.isPhish !== true;
        return needsFallback ? checkWithURLHaus(r.url) : Promise.resolve(null);
      })
    );

    // Attach URLHaus results per entry
    parsed = parsed.map((r, i) => {
      const uh = urlhausResults[i];
      if (!uh) return r;
      if (uh.status === "fulfilled" && uh.value) {
        r.urlhaus = uh.value;
      } else if (uh.status === "rejected") {
        r.urlhaus = { error: uh.reason?.message || "URLHaus check failed" };
      }
      return r;
    });

    const detected = parsed.filter((p) => p.isPhish === true || p.urlhaus?.listed === true);

    // Log per-link status summary
    console.log("\n🧪 PhishTank results:");
    parsed.forEach((r) => {
      if (r.error) {
        console.log(`  ✖ ${r.url} -> error: ${r.error}`);
      } else {
        console.log(
          `  ✔ ${r.url} -> status=${r.httpStatus} inDB=${r.inDatabase} isPhish=${r.isPhish} verified=${r.verified} phishId=${r.phishId || "n/a"}`
        );
      }
    });

    console.log("\n🧪 URLHaus results (fallback):");
    parsed.forEach((r) => {
      if (!r.urlhaus) return;
      if (r.urlhaus.error) {
        console.log(`  ✖ ${r.url} -> URLHaus error: ${r.urlhaus.error}`);
      } else {
        console.log(
          `  ✔ ${r.url} -> listed=${r.urlhaus.listed} status=${r.urlhaus.urlStatus || "n/a"} threat=${r.urlhaus.threat || "n/a"} ref=${r.urlhaus.reference || "n/a"}`
        );
      }
    });

    res.json({
      status: "success",
      total: normalized.length,
      detectedCount: detected.length,
      results: parsed,
    });
  } catch (err) {
    console.error("💥 /phishlink failed:", err);
    res.status(500).json({ status: "error", message: err.message || "Server error" });
  }
});

/**
 * Query URLHaus v1 for a URL.
 * Returns normalized result: { listed: boolean, urlStatus, threat, reference, raw, error? }
 */
async function checkWithURLHaus(urlToCheck) {
  // URLHaus v1 expects form-encoded POST to /v1/url/ with field 'url'
  const payload = querystring.stringify({
    url: urlToCheck,
  });

  const urlObj = new URL(URLHAUS_API_BASE);
  const resp = await httpRequestGeneric(
    {
      hostname: urlObj.hostname,
      path: `${urlObj.pathname}`,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(payload),
        Accept: "application/json, */*;q=0.1",
        "User-Agent": PHISHTANK_USER_AGENT,
        Referer: "https://localhost:3001/phishlink",
        Origin: "https://localhost:3001",
      },
    },
    payload
  );

  let json;
  try {
    json = JSON.parse(resp.bodyText);
  } catch (e) {
    const ct = resp.headers?.["content-type"] || "";
    const preview = (resp.bodyText || "").slice(0, 160).replace(/\s+/g, " ");
    return {
      listed: false,
      error: `Invalid JSON from URLHaus (status ${resp.statusCode}, content-type ${ct || "n/a"}, body: ${preview || "<empty>"})`,
    };
  }

  // URLHaus v1: { query_status: 'ok' | 'no_results' | 'invalid_url', ... }
  const listed = json?.query_status === "ok";
  return {
    listed: !!listed,
    urlStatus: json?.url_status || null,
    threat: json?.threat || null,
    reference: json?.urlhaus_reference || null,
    raw: json,
  };
}

function httpRequestGeneric(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (resp) => {
      let data = "";
      resp.on("data", (chunk) => (data += chunk));
      resp.on("end", () => {
        resolve({
          statusCode: resp.statusCode,
          headers: resp.headers,
          bodyText: data,
        });
      });
    });
    req.on("error", (e) => reject(e));
    if (body) req.write(body);
    req.end();
  });
}

/**
 * Calls PhishTank checkurl API for a single URL.
 * Returns a normalized result object.
 */
async function checkWithPhishTank(urlToCheck) {
  const urlObj = new URL(PHISHTANK_ENDPOINT);

  // Attempt 1: POST (official documented way)
  const postData = querystring.stringify({
    url: urlToCheck,
    format: "json",
  });

  const postRes = await httpRequestPhishTank(
    {
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(postData),
        Accept: "application/json, */*;q=0.1",
        "User-Agent": PHISHTANK_USER_AGENT,
      },
    },
    postData
  );

  let parsed = tryParsePhishTankJson(postRes.bodyText);
  if (postRes.statusCode === 200 && parsed) {
    return normalizePhishTankResult(urlToCheck, parsed, postRes.statusCode);
  }

  // Attempt 2: GET fallback (some WAFs reject non-browser POSTs)
  const qs = querystring.stringify({
    url: urlToCheck,
    format: "json",
  });
  const getRes = await httpRequestPhishTank({
    hostname: urlObj.hostname,
    path: `${urlObj.pathname}?${qs}`,
    method: "GET",
    headers: {
      Accept: "application/json, */*;q=0.1",
      "User-Agent": PHISHTANK_USER_AGENT,
    },
  });

  parsed = tryParsePhishTankJson(getRes.bodyText);
  if (getRes.statusCode === 200 && parsed) {
    return normalizePhishTankResult(urlToCheck, parsed, getRes.statusCode);
  }

  const status = getRes.statusCode ?? postRes.statusCode ?? null;
  const ct = getRes.headers?.["content-type"] || postRes.headers?.["content-type"] || "";
  const errMsg = parsed ? "Unknown error" : "Invalid JSON from PhishTank";
  console.log(`  ↪ ${urlToCheck} -> status=${status} content-type=${ct || "n/a"} error=${errMsg}`);
  return {
    url: urlToCheck,
    inDatabase: false,
    isPhish: null,
    verified: false,
    error: errMsg,
    httpStatus: status,
  };
}

function tryParsePhishTankJson(text) {
  try {
    const json = JSON.parse(text);
    return json && (json.results || json);
  } catch (_) {
    return null;
  }
}

function normalizePhishTankResult(urlToCheck, r, httpStatus) {
  const out = {
    url: urlToCheck,
    inDatabase: !!r?.in_database,
    isPhish: r?.in_database ? r?.valid === true || r?.verified === true : false,
    verified: !!r?.verified,
    phishId: r?.phish_id || null,
    detailPage: r?.phish_detail_page || null,
    httpStatus: httpStatus || null,
    raw: r,
  };
  console.log(
    `  ↪ ${urlToCheck} -> status=${out.httpStatus} inDB=${out.inDatabase} isPhish=${out.isPhish} verified=${out.verified}`
  );
  return out;
}

function httpRequestPhishTank(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (resp) => {
      let data = "";
      resp.on("data", (chunk) => (data += chunk));
      resp.on("end", () => {
        resolve({
          statusCode: resp.statusCode,
          headers: resp.headers,
          bodyText: data,
        });
      });
    });
    req.on("error", (e) => reject(e));
    if (body) req.write(body);
    req.end();
  });
}
