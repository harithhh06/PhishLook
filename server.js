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
    // These are the patterns we'll look for (based on CSA guidelines)
    this.suspiciousPatterns = {
      // Urgency words - these make emails seem urgent
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

      // Authority impersonation - pretending to be official
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

      // Threats - scary consequences
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

      // Credential requests - asking for passwords/info
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

      // Rewards - too good to be true
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
  }

  // Main function to analyze an email
  analyzeEmail(emailData) {
    console.log("🔍 Starting email analysis...");

    // Combine subject and body for analysis
    const fullText = `${emailData.subject || ""} ${emailData.body || ""}`.toLowerCase();

    console.log("📝 Email text length:", fullText.length);

    // 1. Count suspicious patterns
    const patternScores = this.countSuspiciousPatterns(fullText);
    console.log("📊 Pattern scores:", patternScores);

    // 2. Analyze sentiment (negative sentiment can indicate threats/fear)
    const sentimentScore = this.analyzeSentiment(fullText);
    console.log("😊 Sentiment analysis:", sentimentScore);

    // 3. Check for excessive punctuation (!!!, ???)
    const punctuationScore = this.checkPunctuation(fullText);
    console.log("❗ Punctuation score:", punctuationScore);

    // 4. Calculate overall suspiciousness (0 to 1 scale)
    const suspicionScore = this.calculateOverallScore(
      patternScores,
      sentimentScore,
      punctuationScore
    );
    console.log("🎯 Final suspicion score:", suspicionScore);

    // 5. Determine risk level
    const riskLevel = this.determineRiskLevel(suspicionScore);
    console.log("⚠️ Risk level:", riskLevel);

    // 6. Generate explanation for user
    const explanation = this.generateExplanation(patternScores, sentimentScore, riskLevel);

    return {
      suspicionScore: Math.round(suspicionScore * 100), // Convert to percentage
      riskLevel: riskLevel,
      explanation: explanation,
      details: {
        patternMatches: patternScores,
        sentiment: sentimentScore,
        punctuation: punctuationScore,
      },
    };
  }

  // Count how many suspicious patterns we find
  countSuspiciousPatterns(text) {
    const scores = {};
    let totalMatches = 0;

    // Check each category of suspicious patterns
    for (const [category, patterns] of Object.entries(this.suspiciousPatterns)) {
      let matches = 0;

      // Count how many times each pattern appears
      for (const pattern of patterns) {
        const regex = new RegExp(`\\b${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
        const patternMatches = (text.match(regex) || []).length;
        matches += patternMatches;
      }

      scores[category] = matches;
      totalMatches += matches;

      console.log(`  ${category}: ${matches} matches`);
    }

    scores.total = totalMatches;
    return scores;
  }

  // Analyze if the email has negative/threatening sentiment
  analyzeSentiment(text) {
    const result = sentiment.analyze(text);

    // sentiment.analyze returns positive/negative score
    // We're interested in negative sentiment (threats, fear)
    const normalizedScore = Math.max(0, -result.score / 10); // Convert negative to positive scale

    return {
      score: result.score,
      comparative: result.comparative, // Score per word
      negative: result.negative, // Negative words found
      positive: result.positive, // Positive words found
      suspiciousness: Math.min(normalizedScore, 1), // 0-1 scale
    };
  }

  // Check for excessive punctuation (!!!, ???, ALL CAPS)
  checkPunctuation(text) {
    let score = 0;

    // Count exclamation marks
    const exclamations = (text.match(/!/g) || []).length;
    if (exclamations > 3) score += 0.2;

    // Count question marks
    const questions = (text.match(/\?/g) || []).length;
    if (questions > 3) score += 0.1;

    // Check for ALL CAPS words
    const words = text.split(" ");
    const capsWords = words.filter(
      (word) => word.length > 3 && word === word.toUpperCase() && /^[A-Z]+$/.test(word)
    ).length;

    if (capsWords > 2) score += 0.3;

    console.log(
      `  Exclamations: ${exclamations}, Questions: ${questions}, CAPS words: ${capsWords}`
    );

    return Math.min(score, 1); // Cap at 1
  }

  // Combine all scores into final suspiciousness rating
  calculateOverallScore(patternScores, sentimentScore, punctuationScore) {
    // Weight different factors
    const weights = {
      patterns: 0.5, // 50% - most important
      sentiment: 0.3, // 30% - emotional manipulation
      punctuation: 0.2, // 20% - aggressive formatting
    };

    // Normalize pattern score (more patterns = more suspicious)
    const normalizedPatterns = Math.min(patternScores.total / 10, 1);

    // Calculate weighted average
    const totalScore =
      normalizedPatterns * weights.patterns +
      sentimentScore.suspiciousness * weights.sentiment +
      punctuationScore * weights.punctuation;

    return Math.min(totalScore, 1); // Ensure it stays 0-1
  }

  // Convert numeric score to risk level
  determineRiskLevel(score) {
    if (score >= 0.7) return "high";
    if (score >= 0.4) return "medium";
    return "low";
  }

  // Generate human-readable explanation
  generateExplanation(patternScores, sentimentScore, riskLevel) {
    const reasons = [];

    // Explain pattern matches
    if (patternScores.urgency > 0) {
      reasons.push(`Found ${patternScores.urgency} urgency indicators`);
    }
    if (patternScores.threats > 0) {
      reasons.push(`Contains ${patternScores.threats} threatening language`);
    }
    if (patternScores.authority > 0) {
      reasons.push(`Claims authority/official status ${patternScores.authority} times`);
    }
    if (patternScores.credentials > 0) {
      reasons.push(`Requests personal information ${patternScores.credentials} times`);
    }
    if (patternScores.rewards > 0) {
      reasons.push(`Makes ${patternScores.rewards} reward/prize claims`);
    }

    // Explain sentiment
    if (sentimentScore.suspiciousness > 0.3) {
      reasons.push("Uses negative/threatening language");
    }

    // Generate final explanation
    if (reasons.length === 0) {
      return "No significant suspicious indicators detected.";
    } else {
      return `Suspicious because: ${reasons.join(", ")}.`;
    }
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
