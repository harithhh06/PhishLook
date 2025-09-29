// ====================
// FIXED TASKPANE.JS - NO NULL REFERENCE ERRORS
// ====================

// Global variables
let isAnalyzing = false;

// Wait for Office to be ready AND DOM to be loaded (with browser fallback)
if (typeof Office !== "undefined" && Office.onReady) {
  Office.onReady((info) => {
    console.log("📧 Office is ready, host:", info.host);
    // Wait a bit more for DOM to be fully ready
    setTimeout(() => {
      initializeEventHandlers();
    }, 100);
  });
} else {
  // Running outside Office (e.g., opened taskpane.html directly in a browser)
  console.warn("⚠️ Office.js not available — initializing handlers on DOMContentLoaded");
  window.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
      initializeEventHandlers();
    }, 100);
  });
}

// Initialize all event handlers after DOM is ready
function initializeEventHandlers() {
  console.log("🔧 Initializing event handlers...");

  // Check if elements exist before adding handlers
  const analyzeBtn = document.getElementById("analyze-btn");
  const testBtn = document.getElementById("test-btn");

  if (analyzeBtn) {
    analyzeBtn.onclick = analyzeEmailWithAI;
    console.log("✅ Analyze button handler attached");
  } else {
    console.error("❌ analyze-btn not found");
  }

  if (testBtn) {
    testBtn.onclick = testAIAnalysis;
    console.log("✅ Test button handler attached");
  } else {
    console.error("❌ test-btn not found");
  }

  console.log("🎉 Initialization complete");
}

// ====================
// MAIN ANALYSIS FUNCTION
// ====================

async function analyzeEmailWithAI() {
  console.log("🚀 Starting AI analysis...");

  if (isAnalyzing) {
    console.log("⏳ Analysis already in progress");
    return;
  }

  try {
    isAnalyzing = true;

    // 1. Show loading state
    showLoadingState();

    // 2. Get email data from Outlook
    console.log("📧 Getting email data...");
    const emailData = await getEmailDataFromOutlook();
    console.log("📧 Email data retrieved:", {
      subject: emailData.subject ? emailData.subject.substring(0, 50) + "..." : "No subject",
      bodyLength: emailData.body ? emailData.body.length : 0,
      sender: emailData.sender,
    });

    // 3. Extract links to check
    const item = Office.context.mailbox.item;
    let links = [];
    try {
      console.log("🔗 Extracting links from email...");
      links = await extractLinksFromEmail(item);
      console.log("🔗 Links found:", links);
    } catch (e) {
      console.warn("🔗 Failed to extract links:", e);
    }

    // 4. Show links found (if any)
    showLinksFound(links);

    // 5. Send to AI backend for analysis
    console.log("🤖 Sending to AI backend...");
    const aiResult = await callAIBackend(emailData);
    console.log("🤖 AI analysis result:", aiResult);

    // 6. Display AI results
    displayAIResults(aiResult);

    // 7. Check links with backend and display results
    try {
      if (links.length) {
        const phishResult = await callPhishLinkApi(links);
        displayPhishLinks(phishResult);
      } else {
        displayPhishLinks(null);
      }
    } catch (e) {
      console.error("🧷 Link check failed:", e);
      displayPhishLinks({ results: [] });
    }

    // 8. Update status
    showSuccess("✅ AI analysis complete!");
  } catch (error) {
    console.error("💥 Analysis failed:", error);
    showError(`❌ Analysis failed: ${error.message}`);
  } finally {
    isAnalyzing = false;
  }
}

// ====================
// GET EMAIL DATA FROM OUTLOOK
// ====================

function getEmailDataFromOutlook() {
  return new Promise((resolve, reject) => {
    try {
      // Get the current email item
      const item = Office.context.mailbox.item;

      if (!item) {
        reject(new Error("No email selected. Please open an email first."));
        return;
      }

      console.log("📧 Getting email subject and body...");

      // Get email body as text first
      item.body.getAsync("text", (textResult) => {
        if (textResult.status === Office.AsyncResultStatus.Succeeded) {
          // Also get HTML body for link analysis
          item.body.getAsync("html", (htmlResult) => {
            let htmlBody = "";
            if (htmlResult.status === Office.AsyncResultStatus.Succeeded) {
              htmlBody = htmlResult.value || "";
              console.log("📧 HTML body retrieved for link analysis");
            } else {
              console.warn("⚠️ Could not get HTML body, link analysis may be limited");
            }

            // Extract attachment information (NEW: for Feature 5)
            const attachments = [];
            if (item.attachments && item.attachments.length > 0) {
              console.log(`📎 Found ${item.attachments.length} attachments`);

              for (let i = 0; i < item.attachments.length; i++) {
                const attachment = item.attachments[i];
                attachments.push({
                  name: attachment.name || "unnamed",
                  size: attachment.size || 0,
                  contentType: attachment.contentType || "unknown",
                  isInline: attachment.isInline || false,
                });
                console.log(
                  `📎 Attachment ${i + 1}: ${attachment.name} (${attachment.size} bytes)`
                );
              }
            }

            // Collect all email data
            const emailData = {
              subject: item.subject || "No subject",
              body: textResult.value || "No body",
              htmlBody: htmlBody, // HTML body for link analysis
              attachments: attachments, // NEW: Attachment info for analysis
              sender: item.from ? item.from.displayName : "Unknown sender",
              senderEmail: item.from ? item.from.emailAddress : "unknown@example.com",
            };

            console.log("📧 Email data collected successfully (with HTML)");
            resolve(emailData);
          });
        } else {
          console.error("❌ Failed to get email body:", textResult.error);
          reject(new Error("Could not read email content. Please try again."));
        }
      });
    } catch (error) {
      console.error("❌ Error accessing Outlook item:", error);
      reject(new Error("Could not access email. Make sure you have an email open."));
    }
  });
}

// ====================
// CALL AI BACKEND
// ====================

async function callAIBackend(emailData) {
  console.log("🌐 Calling AI backend...");

  try {
    const response = await fetch("https://localhost:3001/api/analyze-suspiciousness", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailData),
    });

    console.log("📡 Backend response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Backend error (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    console.log("📊 Backend result received");

    return result;
  } catch (error) {
    console.error("🌐 Network error:", error);

    if (error.name === "TypeError" && error.message.includes("fetch")) {
      throw new Error(
        "Cannot connect to AI backend. Make sure your Node.js server is running on port 3001."
      );
    }

    throw error;
  }
}

// ====================
// DISPLAY AI RESULTS
// ====================

function displayAIResults(result) {
  console.log("🎨 Displaying AI results...");

  try {
    // Get the analysis data
    const analysis = result.analysis;

    if (!analysis) {
      throw new Error("No analysis data received from backend");
    }

    // Show results section
    const resultsSection = safeGetElement("ai-results");
    if (resultsSection) {
      resultsSection.style.display = "block";
      resultsSection.classList.add("show");
    }

    // Update suspicion score circle
    updateSuspicionScore(analysis.suspicionScore, analysis.riskLevel);

    // Update explanation text
    updateExplanation(analysis.explanation);

    // Update detailed breakdown
    updateDetailedBreakdown(analysis.details);

    // Update recommendations
    updateRecommendations(analysis.riskLevel);

    console.log("✅ Results displayed successfully");
  } catch (error) {
    console.error("🎨 Error displaying results:", error);
    showError(`Error displaying results: ${error.message}`);
  }
}

// ====================
// SAFE ELEMENT ACCESS FUNCTIONS
// ====================

function safeGetElement(id) {
  const element = document.getElementById(id);
  if (!element) {
    console.warn(`⚠️ Element with id '${id}' not found`);
  }
  return element;
}

function safeSetText(elementId, text) {
  const element = safeGetElement(elementId);
  if (element) {
    element.textContent = text;
  }
}

function safeSetHTML(elementId, html) {
  const element = safeGetElement(elementId);
  if (element) {
    element.innerHTML = html;
  }
}

// ====================
// UPDATE UI COMPONENTS
// ====================

function updateSuspicionScore(score, riskLevel) {
  console.log(`📊 Updating score: ${score}% (${riskLevel} risk)`);

  try {
    // Update score circle
    const scoreCircle = safeGetElement("suspicion-score");
    const scoreText = safeGetElement("score-text");
    const riskLevelText = safeGetElement("risk-level");

    // Set score number
    if (scoreText) {
      scoreText.textContent = `${score}%`;
    }

    // Set risk level text
    if (riskLevelText) {
      riskLevelText.textContent = `${riskLevel.toUpperCase()} RISK`;
      riskLevelText.className = `risk-level ${riskLevel}`;
    }

    // Change colors based on risk level
    if (scoreCircle) {
      scoreCircle.className = `score-circle ${riskLevel}`;
      // Add animation
      scoreCircle.style.animation = "scoreAppear 0.5s ease-out";
    }
  } catch (error) {
    console.error("📊 Error updating suspicion score:", error);
  }
}

function updateExplanation(explanation) {
  console.log("📝 Updating explanation");

  try {
    safeSetText("ai-explanation", explanation || "No explanation available");
  } catch (error) {
    console.error("📝 Error updating explanation:", error);
  }
}

function updateDetailedBreakdown(details) {
  console.log("🔍 Updating detailed breakdown");

  try {
    if (!details) {
      safeSetHTML(
        "detailed-breakdown",
        "<h4>🔍 Detailed Analysis</h4><div>No detailed analysis available</div>"
      );
      return;
    }

    // Create breakdown HTML
    let breakdownHTML = "<h4>🔍 Detailed Analysis</h4>";

    // Pattern matches
    const patterns = details.patternMatches;
    if (patterns && patterns.total > 0) {
      breakdownHTML += '<div class="breakdown-section">';
      breakdownHTML += "<strong>Suspicious Patterns Found:</strong>";
      breakdownHTML += "<ul>";

      if (patterns.urgency > 0) breakdownHTML += `<li>Urgency indicators: ${patterns.urgency}</li>`;
      if (patterns.threats > 0) breakdownHTML += `<li>Threats/warnings: ${patterns.threats}</li>`;
      if (patterns.authority > 0)
        breakdownHTML += `<li>Authority claims: ${patterns.authority}</li>`;
      if (patterns.credentials > 0)
        breakdownHTML += `<li>Info requests: ${patterns.credentials}</li>`;
      if (patterns.rewards > 0) breakdownHTML += `<li>Reward promises: ${patterns.rewards}</li>`;

      breakdownHTML += "</ul></div>";
    } else {
      breakdownHTML += "<div>✅ No suspicious patterns detected</div>";
    }

    // Sentiment analysis
    if (details.sentiment && details.sentiment.suspiciousness > 0.2) {
      breakdownHTML +=
        "<div><strong>Language Analysis:</strong> Negative/threatening tone detected</div>";
    }

    // Link analysis (NEW)
    if (details.linkAnalysis && details.linkAnalysis.totalLinks > 0) {
      breakdownHTML += '<div class="breakdown-section">';
      breakdownHTML += `<strong>Link Analysis (${details.linkAnalysis.totalLinks} links found):</strong>`;

      if (details.linkAnalysis.suspiciousLinks > 0) {
        breakdownHTML += "<ul>";
        if (details.linkAnalysis.mismatches > 0) {
          breakdownHTML += `<li>🔗 ${details.linkAnalysis.mismatches} link text mismatches detected</li>`;
        }
        if (details.linkAnalysis.shorteners > 0) {
          breakdownHTML += `<li>🔗 ${details.linkAnalysis.shorteners} URL shorteners found</li>`;
        }
        if (details.linkAnalysis.spoofedDomains > 0) {
          breakdownHTML += `<li>🔗 ${details.linkAnalysis.spoofedDomains} suspicious domain spoofing attempts</li>`;
        }
        if (details.linkAnalysis.suspiciousExtensions > 0) {
          breakdownHTML += `<li>🔗 ${details.linkAnalysis.suspiciousExtensions} dangerous file downloads</li>`;
        }
        breakdownHTML += "</ul>";

        // Show most suspicious links
        const highRiskLinks = details.linkAnalysis.details.filter(
          (link) => link.riskLevel === "high"
        );
        if (highRiskLinks.length > 0) {
          breakdownHTML +=
            '<div style="margin-top: 10px;"><strong>⚠️ Most Dangerous Links:</strong>';
          breakdownHTML += "<ul>";
          highRiskLinks.slice(0, 3).forEach((link) => {
            // Show max 3
            const reasons = link.reasons.join(", ");
            breakdownHTML += `<li style="font-size: 11px; color: #d13438;"><strong>"${link.anchorText}"</strong> → ${reasons}</li>`;
          });
          breakdownHTML += "</ul></div>";
        }
      } else {
        breakdownHTML += "<div>✅ All links appear legitimate</div>";
      }
      breakdownHTML += "</div>";
    }

    // Attachment analysis (NEW - Feature 5)
    if (details.attachmentAnalysis && details.attachmentAnalysis.totalAttachments > 0) {
      breakdownHTML += '<div class="breakdown-section">';
      breakdownHTML += `<strong>Attachment Analysis (${details.attachmentAnalysis.totalAttachments} files found):</strong>`;

      if (details.attachmentAnalysis.suspiciousAttachments > 0) {
        breakdownHTML += "<ul>";
        if (details.attachmentAnalysis.dangerousFiles > 0) {
          breakdownHTML += `<li>📎 ${details.attachmentAnalysis.dangerousFiles} dangerous executable files</li>`;
        }
        if (details.attachmentAnalysis.scriptFiles > 0) {
          breakdownHTML += `<li>📎 ${details.attachmentAnalysis.scriptFiles} suspicious script files</li>`;
        }
        if (details.attachmentAnalysis.archiveFiles > 0) {
          breakdownHTML += `<li>📎 ${details.attachmentAnalysis.archiveFiles} archive files (can hide malware)</li>`;
        }
        if (details.attachmentAnalysis.suspiciousNames > 0) {
          breakdownHTML += `<li>📎 ${details.attachmentAnalysis.suspiciousNames} files with suspicious names</li>`;
        }
        breakdownHTML += "</ul>";

        // Show most dangerous attachments
        const highRiskAttachments = details.attachmentAnalysis.details.filter(
          (att) => att.riskLevel === "high"
        );
        if (highRiskAttachments.length > 0) {
          breakdownHTML +=
            '<div style="margin-top: 10px;"><strong>🚨 Most Dangerous Files:</strong>';
          breakdownHTML += "<ul>";
          highRiskAttachments.slice(0, 3).forEach((att) => {
            // Show max 3
            const reasons = att.reasons.join(", ");
            const sizeStr = att.size > 0 ? ` (${Math.round(att.size / 1024)}KB)` : "";
            breakdownHTML += `<li style="font-size: 11px; color: #d13438;"><strong>${att.filename}${sizeStr}</strong> → ${reasons}</li>`;
          });
          breakdownHTML += "</ul></div>";
        }
      } else {
        breakdownHTML += "<div>✅ All attachments appear safe</div>";
      }
      breakdownHTML += "</div>";
    }

    safeSetHTML("detailed-breakdown", breakdownHTML);
  } catch (error) {
    console.error("🔍 Error updating detailed breakdown:", error);
    safeSetHTML(
      "detailed-breakdown",
      "<h4>🔍 Detailed Analysis</h4><div>Error loading analysis details</div>"
    );
  }
}

function updateRecommendations(riskLevel) {
  console.log("💡 Updating recommendations for risk level:", riskLevel);

  try {
    let recommendations = [];

    switch (riskLevel) {
      case "high":
        recommendations = [
          "🚨 DO NOT click any links in this email",
          "🚨 DO NOT provide any personal information",
          "📞 Verify sender through alternative contact method",
          "🗑️ Consider deleting this email",
          "🛡️ Report to your IT security team",
        ];
        break;

      case "medium":
        recommendations = [
          "⚠️ Exercise caution with this email",
          "🔍 Verify sender identity before taking action",
          "🔗 Check URLs carefully before clicking",
          "📞 Contact sender directly if urgent action claimed",
        ];
        break;

      default: // low risk
        recommendations = [
          "✅ Email appears relatively safe",
          "🛡️ Continue following standard security practices",
          "🤔 When in doubt, verify with sender",
        ];
    }

    // Create HTML list
    const recommendationsList = recommendations.map((rec) => `<li>${rec}</li>`).join("");
    safeSetHTML("recommendations", `<ul>${recommendationsList}</ul>`);
  } catch (error) {
    console.error("💡 Error updating recommendations:", error);
    safeSetHTML("recommendations", "<ul><li>Error loading recommendations</li></ul>");
  }
}

// ====================
// UI STATE MANAGEMENT
// ====================

function showLoadingState() {
  console.log("⏳ Showing loading state...");

  try {
    // Disable analyze button
    const analyzeBtn = safeGetElement("analyze-btn");
    if (analyzeBtn) {
      analyzeBtn.disabled = true;
      analyzeBtn.textContent = "🤖 Analyzing with AI...";
    }

    // Show status
    showStatus("🔍 AI is analyzing email content...", "analyzing");

    // Hide previous results
    const resultsSection = safeGetElement("ai-results");
    if (resultsSection) {
      resultsSection.style.display = "none";
      resultsSection.classList.remove("show");
    }
    const phishSection = safeGetElement("phish-results");
    if (phishSection) {
      phishSection.style.display = "none";
      const list = safeGetElement("phish-links-list");
      if (list) list.textContent = "No phishing link detected.";
    }
    const linksFound = safeGetElement("links-found");
    if (linksFound) {
      linksFound.style.display = "none";
      const list = safeGetElement("links-list");
      if (list) list.textContent = "No links found.";
    }
  } catch (error) {
    console.error("⏳ Error showing loading state:", error);
  }
}

function showSuccess(message) {
  console.log("✅ Showing success:", message);

  try {
    // Re-enable analyze button
    const analyzeBtn = safeGetElement("analyze-btn");
    if (analyzeBtn) {
      analyzeBtn.disabled = false;
      analyzeBtn.textContent = "🤖 Analyze Current Email with AI";
    }

    // Show success status
    showStatus(message, "success");
  } catch (error) {
    console.error("✅ Error showing success state:", error);
  }
}

function showError(message) {
  console.log("❌ Showing error:", message);

  try {
    // Re-enable analyze button
    const analyzeBtn = safeGetElement("analyze-btn");
    if (analyzeBtn) {
      analyzeBtn.disabled = false;
      analyzeBtn.textContent = "🤖 Try Again";
    }

    // Show error status
    showStatus(message, "error");
  } catch (error) {
    console.error("❌ Error showing error state:", error);
  }
}

function showStatus(message, type) {
  try {
    const statusElement = safeGetElement("status");
    if (statusElement) {
      statusElement.textContent = message;
      statusElement.className = `status ${type}`;
      statusElement.style.display = "block";
    }
  } catch (error) {
    console.error("📋 Error showing status:", error);
  }
}

// ====================
// TEST FUNCTION (for development)
// ====================

// Test email counter to cycle through different examples
let testEmailIndex = 0;

async function testAIAnalysis() {
  console.log("🧪 Running test analysis...");

  if (isAnalyzing) {
    console.log("⏳ Analysis already in progress");
    return;
  }

  try {
    isAnalyzing = true;
    showLoadingState();

    // Different test emails to cycle through
    const testEmails = [
      // Test 1: Banking phish with domain spoofing + suspicious attachments
      {
        subject: "URGENT: DBS Account Suspension Notice",
        body: "Your DBS bank account will be suspended immediately unless you verify your information right away.",
        htmlBody: `
                    <div>
                        <p>Dear Customer,</p>
                        <p>Your <strong>DBS Bank</strong> account will be suspended immediately unless you verify your information.</p>
                        <p><a href="http://dbs-security-verification.malicious-site.com/verify">Click here to verify your DBS account</a> immediately.</p>
                        <p>You can also <a href="http://bit.ly/fake-dbs-urgent">download our security app</a> for protection.</p>
                        <p><a href="http://evil-site.com/banking-malware.exe">Download security patch</a> now!</p>
                    </div>
                `,
        attachments: [
          {
            name: "urgent_banking_update.exe",
            size: 2048576,
            contentType: "application/octet-stream",
          },
          { name: "invoice.pdf.scr", size: 1024, contentType: "application/octet-stream" },
        ],
        sender: "DBS Bank Security",
        senderEmail: "security@dbs-fake.com",
      },

      // Test 2: Government phish with archive attachment
      {
        subject: "IRAS Tax Refund - Action Required",
        body: "You have a pending tax refund. Click the link to claim your refund immediately.",
        htmlBody: `
                    <div>
                        <p>Singapore Government - IRAS</p>
                        <p>You have a <strong>$2,850 tax refund</strong> pending approval.</p>
                        <p><a href="http://iras-refund-portal.scam-site.org/claim">Visit official IRAS portal</a> to claim now.</p>
                        <p><a href="http://tinyurl.com/fake-iras-claim">Alternative link</a> if above doesn't work.</p>
                        <p><a href="https://google.com">Visit Google</a> for more information.</p>
                    </div>
                `,
        attachments: [
          { name: "tax_refund_documents.zip", size: 5120000, contentType: "application/zip" },
          { name: "IRAS_form.pdf", size: 245760, contentType: "application/pdf" },
        ],
        sender: "IRAS Singapore",
        senderEmail: "noreply@iras-gov.fake",
      },

      // Test 3: Tech support scam with dangerous scripts
      {
        subject: "Microsoft Security Alert - Immediate Action Required",
        body: "Your computer is infected with viruses. Download our security tool immediately.",
        htmlBody: `
                    <div>
                        <h2>Microsoft Security Center</h2>
                        <p><strong>ALERT:</strong> Your computer is infected with 17 viruses!</p>
                        <p><a href="http://microsoft-security-fix.malware-site.net/repair">Download Microsoft Security Tool</a> immediately!</p>
                        <p><a href="http://short.link/ms-fix">Quick fix download</a> available here.</p>
                        <p><a href="http://fake-microsoft.com/virus-removal.scr">Emergency removal tool</a></p>
                        <p>Contact our <a href="https://microsoft.com">official support</a> team.</p>
                    </div>
                `,
        attachments: [
          { name: "security_scanner.bat", size: 8192, contentType: "text/plain" },
          { name: "microsoft_patch.vbs", size: 4096, contentType: "text/vbscript" },
          { name: "important_document.doc", size: 98304, contentType: "application/msword" },
        ],
        sender: "Microsoft Security Team",
        senderEmail: "security@microsoft-alerts.fake",
      },

      // Test 4: Cryptocurrency scam with multiple red flags
      {
        subject: "CONGRATULATIONS! You Won $50,000 Bitcoin Prize!",
        body: "You have been selected as our lucky winner! Claim your Bitcoin prize immediately before it expires!",
        htmlBody: `
                    <div>
                        <h1>🎉 BITCOIN LOTTERY WINNER! 🎉</h1>
                        <p><strong>CONGRATULATIONS!</strong> You won <strong>$50,000 worth of Bitcoin!</strong></p>
                        <p><a href="http://bitcoin-winners.scam-crypto.net/claim">Click here to claim your Bitcoin prize</a> before midnight!</p>
                        <p><a href="http://t.co/fake-crypto-win">Share on Twitter</a> to get bonus coins!</p>
                        <p><a href="http://malicious-crypto.com/wallet-stealer.exe">Download secure wallet</a> to receive your coins.</p>
                        <p>Winners must <a href="http://verify-identity.crypto-scam.org/kyc">verify identity</a> within 24 hours!</p>
                    </div>
                `,
        attachments: [
          {
            name: "bitcoin_wallet_setup.exe",
            size: 15728640,
            contentType: "application/octet-stream",
          },
          { name: "winner_certificate.pdf", size: 512000, contentType: "application/pdf" },
        ],
        sender: "Bitcoin Lottery International",
        senderEmail: "winner@bitcoin-lottery.fake",
      },

      // Test 5: PayPal phishing with sophisticated spoofing
      {
        subject: "Your PayPal Account Has Been Limited",
        body: "We detected unusual activity on your PayPal account. Verify your information to restore full access.",
        htmlBody: `
                    <div style="font-family: Arial; max-width: 600px;">
                        <img src="https://www.paypal.com/logo.png" alt="PayPal" style="width: 100px;">
                        <h2>Account Security Alert</h2>
                        <p>Dear PayPal Customer,</p>
                        <p>We've detected <strong>suspicious activity</strong> on your account and have temporarily limited access.</p>
                        <p><a href="http://paypal-security-verify.phishing-site.com/login">Verify your PayPal account</a> to restore access immediately.</p>
                        <p>You can also <a href="http://ow.ly/paypal-restore">restore access via mobile</a> using our app.</p>
                        <p>If you don't verify within 48 hours, your account will be <strong>permanently suspended</strong>.</p>
                        <p>Best regards,<br>PayPal Security Team</p>
                    </div>
                `,
        attachments: [
          {
            name: "paypal_verification_form.pdf.exe",
            size: 2048,
            contentType: "application/octet-stream",
          },
          { name: "account_statement.zip", size: 1024000, contentType: "application/zip" },
        ],
        sender: "PayPal Security",
        senderEmail: "security@paypal.com.fake-domain.org",
      },

      // Test 6: COVID-19 themed scam (social engineering)
      {
        subject: "URGENT: COVID-19 Vaccine Certificate Required",
        body: "New government mandate requires immediate vaccine certificate verification or face penalties.",
        htmlBody: `
                    <div>
                        <h3>🏥 Ministry of Health Singapore</h3>
                        <p><strong>URGENT NOTICE:</strong> New regulations require all citizens to verify their COVID-19 vaccination status.</p>
                        <p><a href="http://moh-vaccine-verify.fake-gov.sg/check">Verify your vaccination status</a> on our official portal.</p>
                        <p>Failure to comply within 7 days will result in <strong>$1,000 fine</strong>.</p>
                        <p><a href="http://goo.gl/moh-fake-download">Download TraceTogether update</a> for automatic verification.</p>
                        <p>Questions? Contact our <a href="mailto:help@fake-moh.sg">support team</a>.</p>
                    </div>
                `,
        attachments: [
          {
            name: "TraceTogether_Update.apk",
            size: 8388608,
            contentType: "application/vnd.android.package-archive",
          },
          { name: "vaccination_form.doc", size: 204800, contentType: "application/msword" },
          { name: "install_certificate.bat", size: 512, contentType: "text/plain" },
        ],
        sender: "Ministry of Health",
        senderEmail: "noreply@moh.gov.sg.fake",
      },

      // Test 7: Amazon fake order with malicious attachments
      {
        subject: "Your Amazon Order #AMZ-7429851 Has Shipped",
        body: "Your recent Amazon purchase has been shipped. Track your package and download the receipt.",
        htmlBody: `
                    <div>
                        <h2>📦 Amazon Order Confirmation</h2>
                        <p>Dear Customer,</p>
                        <p>Your order for <strong>iPhone 15 Pro Max (256GB)</strong> has been shipped!</p>
                        <p><a href="http://amazon-tracking.delivery-scam.net/track">Track your package</a> here.</p>
                        <p><a href="http://bit.ly/amazon-receipt-fake">Download invoice</a> for your records.</p>
                        <p>If you didn't place this order, <a href="http://amazon-security.fake-site.org/cancel">cancel immediately</a>!</p>
                        <p>Delivery expected: Tomorrow</p>
                    </div>
                `,
        attachments: [
          { name: "amazon_invoice.pdf.exe", size: 4096, contentType: "application/octet-stream" },
          { name: "tracking_info.js", size: 2048, contentType: "application/javascript" },
          {
            name: "delivery_confirmation.rar",
            size: 1536000,
            contentType: "application/x-rar-compressed",
          },
        ],
        sender: "Amazon Shipping",
        senderEmail: "shipment@amazon.com.delivery.fake",
      },

      // Test 8: Legitimate-looking email (should score LOW)
      {
        subject: "Monthly Newsletter - September 2025",
        body: "Here are the latest updates from our team. Thanks for being a valued subscriber.",
        htmlBody: `
                    <div>
                        <h2>Company Newsletter - September 2025</h2>
                        <p>Dear Subscriber,</p>
                        <p>Thank you for being part of our community. Here are this month's highlights:</p>
                        <p>• New product features released</p>
                        <p>• Upcoming webinar series</p>
                        <p>• Customer success stories</p>
                        <p><a href="https://company.com/newsletter">Read full newsletter</a> on our website.</p>
                        <p><a href="https://company.com/unsubscribe">Unsubscribe</a> if you no longer wish to receive updates.</p>
                        <p>Best regards,<br>The Company Team</p>
                    </div>
                `,
        attachments: [
          { name: "newsletter_september_2025.pdf", size: 2048000, contentType: "application/pdf" },
          { name: "company_brochure.jpg", size: 512000, contentType: "image/jpeg" },
        ],
        sender: "Company Newsletter",
        senderEmail: "newsletter@company.com",
      },

      // Test 9: Romance scam with emotional manipulation
      {
        subject: "My Dearest Love, I Need Your Help Urgently",
        body: "My darling, I am in trouble and need your immediate assistance. Please help me transfer some money.",
        htmlBody: `
                    <div>
                        <p>My Dearest Love,</p>
                        <p>I hope this email finds you well. I am writing to you with tears in my eyes because I am in <strong>desperate need</strong> of your help.</p>
                        <p>I am currently stranded in Nigeria due to a medical emergency and need <strong>$5,000</strong> to get home.</p>
                        <p><a href="http://moneytransfer-help.scam-romance.org/send">Click here to send money</a> through our secure portal.</p>
                        <p>I promise to pay you back <strong>$50,000</strong> when I return home as I recently inherited a large fortune.</p>
                        <p><a href="http://inheritance-documents.fake-legal.net/view">View inheritance documents</a> as proof.</p>
                        <p>Please hurry, time is running out!</p>
                        <p>All my love,<br>Sarah Johnson</p>
                    </div>
                `,
        attachments: [
          {
            name: "inheritance_certificate.pdf.exe",
            size: 1024,
            contentType: "application/octet-stream",
          },
          { name: "medical_documents.zip", size: 3072000, contentType: "application/zip" },
          { name: "bank_transfer_form.vbs", size: 8192, contentType: "text/vbscript" },
        ],
        sender: "Sarah Johnson",
        senderEmail: "sarah.johnson.love@romance-scam.fake",
      },

      // Test 10: Fake job offer with credential harvesting
      {
        subject: "Job Offer: Senior Developer Position - $150,000/year",
        body: "Congratulations! You have been selected for a high-paying remote developer position. Complete the application immediately.",
        htmlBody: `
                    <div>
                        <h2>🎯 Dream Job Opportunity!</h2>
                        <p>Dear Future Employee,</p>
                        <p><strong>Congratulations!</strong> You have been selected for our <strong>Senior Developer position</strong> with a salary of <strong>$150,000/year</strong>!</p>
                        <p>This is a <strong>100% remote position</strong> with amazing benefits!</p>
                        <p><a href="http://fake-jobs.career-scam.net/apply">Complete your application</a> within 24 hours to secure this position.</p>
                        <p><a href="http://tinyurl.com/fake-job-contract">Download employment contract</a> and sign immediately.</p>
                        <p>We need your personal information including SSN and bank details for payroll setup.</p>
                        <p>Act fast - this opportunity won't last!</p>
                    </div>
                `,
        attachments: [
          {
            name: "employment_contract.pdf.scr",
            size: 2048,
            contentType: "application/octet-stream",
          },
          {
            name: "job_application_form.exe",
            size: 16384,
            contentType: "application/octet-stream",
          },
          { name: "company_handbook.zip", size: 10485760, contentType: "application/zip" },
        ],
        sender: "HR Department - TechCorp",
        senderEmail: "hr@techcorp-fake-jobs.scam",
      },
    ];

    // Get current test email (cycle through)
    const testEmail = testEmails[testEmailIndex % testEmails.length];
    testEmailIndex++; // Move to next test for future clicks

    console.log(
      `🧪 Testing with scenario ${((testEmailIndex - 1) % testEmails.length) + 1}: ${testEmail.subject}`
    );

    const result = await callAIBackend(testEmail);
    displayAIResults(result);
    showSuccess(
      `✅ Test ${((testEmailIndex - 1) % testEmails.length) + 1} complete! Click again for next scenario.`
    );
  } catch (error) {
    console.error("💥 Test failed:", error);
    showError(`❌ Test failed: ${error.message}`);
  } finally {
    isAnalyzing = false;
  }
}

// Make functions available globally (for any inline onclick handlers)
window.analyzeEmailWithAI = analyzeEmailWithAI;
window.testAIAnalysis = testAIAnalysis;

console.log("🚀 taskpane.js loaded successfully");

// ====================
// EXTRACT LINKS FROM EMAIL
// ====================

async function extractLinksFromEmail(item) {
  const links = new Set();

  // 1) Get body as text and regex parse URLs
  const bodyText = await new Promise((resolve) => {
    item.body.getAsync("text", (res) => {
      if (res.status === Office.AsyncResultStatus.Succeeded) resolve(res.value || "");
      else resolve("");
    });
  });
  const urlRegex = /(https?:\/\/[^\s)\]">]+)|(www\.[^\s)\]">]+)/gi;
  (bodyText.match(urlRegex) || []).forEach((u) => {
    const normalized = u.startsWith("http") ? u : `http://${u}`;
    links.add(normalized);
  });

  // 2) Try to inspect internet headers for URLs (best-effort)
  await new Promise((resolve) => {
    try {
      item.getAllInternetHeadersAsync((res) => {
        if (res.status === Office.AsyncResultStatus.Succeeded && res.value) {
          (res.value.match(urlRegex) || []).forEach((u) => {
            const normalized = u.startsWith("http") ? u : `http://${u}`;
            links.add(normalized);
          });
        }
        resolve();
      });
    } catch (_) {
      resolve();
    }
  });

  // 3) Fallback: parse HTML (if available)
  const bodyHtml = await new Promise((resolve) => {
    item.body.getAsync(Office.CoercionType.Html, (res) => {
      if (res.status === Office.AsyncResultStatus.Succeeded) resolve(res.value || "");
      else resolve("");
    });
  });
  const hrefRegex = /href=\"([^\"]+)\"/gi;
  let m;
  while ((m = hrefRegex.exec(bodyHtml)) !== null) {
    const href = m[1];
    if (href && !href.startsWith("mailto:")) {
      const normalized = href.startsWith("http") ? href : `http://${href}`;
      links.add(normalized);
    }
  }

  return Array.from(links);
}

// ====================
// CALL /phishlink API
// ====================

async function callPhishLinkApi(links) {
  const resp = await fetch("https://localhost:3001/phishlink", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ links }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`phishlink error ${resp.status}: ${t}`);
  }
  return await resp.json();
}

function displayPhishLinks(result) {
  const container = safeGetElement("phish-results");
  const list = safeGetElement("phish-links-list");
  if (!container || !list) return;

  container.style.display = "block";

  if (!result || !Array.isArray(result.results) || result.results.length === 0) {
    list.textContent = "No phishing link detected.";
    return;
  }

  const bad = result.results.filter((r) => r.isPhish === true);
  if (bad.length === 0) {
    list.textContent = "No phishing link detected.";
    return;
  }

  const items = bad
    .map((r) => {
      const detail = r.detailPage ? ` — details: ${r.detailPage}` : "";
      return `<li><strong>⚠️ ${escapeHtml(r.url)}</strong>${detail}</li>`;
    })
    .join("");
  list.innerHTML = `<ul>${items}</ul>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ====================
// LINKS FOUND RENDERING
// ====================
function showLinksFound(links) {
  const container = safeGetElement("links-found");
  const list = safeGetElement("links-list");
  if (!container || !list) return;
  container.style.display = "block";

  if (!Array.isArray(links) || links.length === 0) {
    list.textContent = "No links found.";
    return;
  }

  const items = links.map((u) => `<li>${escapeHtml(u)}</li>`).join("");
  list.innerHTML = `<ul>${items}</ul>`;
}
