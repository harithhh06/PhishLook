// ====================
// FIXED TASKPANE.JS - NO NULL REFERENCE ERRORS
// ====================

// Global variables
let isAnalyzing = false;

// Wait for Office to be ready AND DOM to be loaded
Office.onReady((info) => {
  console.log("📧 Office is ready, host:", info.host);

  // Wait a bit more for DOM to be fully ready
  setTimeout(() => {
    initializeEventHandlers();
  }, 100);
});

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

      // Get email body (this is async)
      item.body.getAsync("text", (bodyResult) => {
        if (bodyResult.status === Office.AsyncResultStatus.Succeeded) {
          // Collect all email data
          const emailData = {
            subject: item.subject || "No subject",
            body: bodyResult.value || "No body",
            sender: item.from ? item.from.displayName : "Unknown sender",
            senderEmail: item.from ? item.from.emailAddress : "unknown@example.com",
          };

          console.log("📧 Email data collected successfully");
          resolve(emailData);
        } else {
          console.error("❌ Failed to get email body:", bodyResult.error);
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

async function testAIAnalysis() {
  console.log("🧪 Running test analysis...");

  if (isAnalyzing) {
    console.log("⏳ Analysis already in progress");
    return;
  }

  try {
    isAnalyzing = true;
    showLoadingState();

    // Test with sample phishing email
    const testEmail = {
      subject: "URGENT: Account Suspension Notice",
      body: "Your bank account will be suspended immediately unless you verify your information right away. Click here to update your password and personal details. Act now or lose access forever!",
      sender: "Fake Bank Security",
      senderEmail: "security@fake-bank.com",
    };

    const result = await callAIBackend(testEmail);
    displayAIResults(result);
    showSuccess("✅ Test analysis complete!");
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
