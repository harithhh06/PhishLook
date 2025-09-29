// detectors/SimpleSuspiciousnessDetector.js
const Sentiment = require("sentiment"); // localize the dependency so the module is self-contained
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

module.exports = { SimpleSuspiciousnessDetector };
