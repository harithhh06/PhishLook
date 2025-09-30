/**
 * OllamaDetector.js
 * AI-powered phishing detection using local Ollama models
 */

class OllamaDetector {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || process.env.OLLAMA_BASE_URL || "http://localhost:11434";
    this.model = options.model || process.env.OLLAMA_MODEL || "llama3.1:8b";
    this.timeout = options.timeout || parseInt(process.env.OLLAMA_TIMEOUT) || 30000; // 30 seconds default

    this.stats = {
      available: false,
      model: this.model,
      lastChecked: null,
      error: null,
      totalRequests: 0,
      successfulRequests: 0,
      averageResponseTime: 0,
    };
  }

  /**
   * Check if Ollama is available and the model exists
   */
  async checkHealth() {
    try {
      console.log(`🔍 Checking Ollama health at ${this.baseUrl}...`);

      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const models = data.models || [];
      const hasModel = models.some(
        (m) => m.name === this.model || m.name.startsWith(this.model.split(":")[0])
      );

      this.stats.available = true;
      this.stats.lastChecked = new Date().toISOString();
      this.stats.error = null;

      if (!hasModel) {
        const availableModels = models.map((m) => m.name).join(", ") || "none";
        this.stats.error = `Model '${this.model}' not found. Available: ${availableModels}`;
        console.warn(`⚠️ Ollama model '${this.model}' not found. Available: ${availableModels}`);
      } else {
        console.log(`🤖 Ollama connected: ${this.model} available at ${this.baseUrl}`);
      }

      return true;
    } catch (error) {
      this.stats.available = false;
      this.stats.lastChecked = new Date().toISOString();
      this.stats.error = error.message;
      console.warn(`⚠️ Ollama not available at ${this.baseUrl}: ${error.message}`);
      return false;
    }
  }

  /**
   * Make a raw call to Ollama API
   */
  async callOllama(prompt, systemPrompt = null, options = {}) {
    // Try to check health first if we haven't recently
    if (!this.stats.available || !this.stats.lastChecked) {
      console.log("🔄 Attempting to reconnect to Ollama...");
      await this.checkHealth();
    }
    
    if (!this.stats.available) {
      throw new Error(`Ollama is not available: ${this.stats.error || "Connection failed"}`);
    }

    const payload = {
      model: this.model,
      prompt: prompt,
      stream: false,
      options: {
        temperature: options.temperature || 0.3,
        num_predict: options.maxTokens || 500,
        top_p: options.topP || 0.9,
        ...options.ollamaOptions,
      },
    };

    if (systemPrompt) {
      payload.system = systemPrompt;
    }

    const startTime = Date.now();
    this.stats.totalRequests++;

    try {
      console.log(`🤖 Calling Ollama with model: ${this.model}`);

      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const responseTime = Date.now() - startTime;

      // Update stats
      this.stats.successfulRequests++;
      this.stats.averageResponseTime =
        (this.stats.averageResponseTime * (this.stats.successfulRequests - 1) + responseTime) /
        this.stats.successfulRequests;

      console.log(`The response is: `, data);
      console.log(`✅ Ollama response received in ${responseTime}ms`);

      return {
        response: data.response || "",
        model: data.model,
        total_duration: data.total_duration,
        load_duration: data.load_duration,
        prompt_eval_count: data.prompt_eval_count,
        eval_count: data.eval_count,
        responseTime: responseTime,
      };
    } catch (error) {
      console.error("🤖 Ollama call failed:", error);
      throw error;
    }
  }

  /**
   * Analyze an email for phishing indicators using AI
   */
  async analyzeEmail(emailData, options = {}) {
    const systemPrompt = `You are a cybersecurity expert specializing in phishing email detection. Analyze emails for suspicious patterns and provide a comprehensive risk assessment.

Focus on these key phishing indicators:
1. URGENCY TACTICS - Time pressure, deadlines, "immediate action required"
2. AUTHORITY IMPERSONATION - Fake banks, government, tech companies
3. CREDENTIAL HARVESTING - Requests for passwords, personal info, financial details
4. SUSPICIOUS LINKS - Mismatched URLs, shorteners, suspicious domains
5. EMOTIONAL MANIPULATION - Fear, greed, urgency, threats
6. GRAMMAR/SPELLING - Poor language quality indicating non-native speakers
7. GENERIC GREETINGS - "Dear Customer" instead of actual names
8. REWARD SCAMS - Too-good-to-be-true offers, lottery wins, prizes

Respond ONLY with a valid JSON object containing:
- riskLevel: "low", "medium", or "high"
- confidence: integer from 0-100 (percentage confidence in assessment)
- suspiciousPatterns: array of strings describing detected patterns
- explanation: brief 1-2 sentence explanation of the overall assessment
- recommendation: specific action the user should take
- detectedIndicators: object with boolean flags for each indicator type
- severity: object with counts of low/medium/high severity findings

Be thorough but concise. Focus on actionable insights.`;

    const emailContent = this.formatEmailForAnalysis(emailData);

    const prompt = `Analyze this email for phishing indicators and respond with JSON only:

${emailContent}

Remember: Respond with valid JSON only, no additional text or formatting.`;

    try {
      const result = await this.callOllama(prompt, systemPrompt, options);
      return this.parseAnalysisResult(result, emailData);
    } catch (error) {
      throw new Error(`Email analysis failed: ${error.message}`);
    }
  }

  /**
   * Format email data for analysis
   */
  formatEmailForAnalysis(emailData) {
    const parts = [];

    if (emailData.subject) {
      parts.push(`Subject: ${emailData.subject}`);
    }

    if (emailData.sender || emailData.senderEmail) {
      const fromLine = `From: ${emailData.sender || "Unknown"} <${emailData.senderEmail || "unknown@example.com"}>`;
      parts.push(fromLine);
    }

    if (emailData.body) {
      parts.push(`\nBody:\n${emailData.body}`);
    }

    if (emailData.htmlBody && emailData.htmlBody !== emailData.body) {
      // Extract links from HTML if different from text body
      const links = this.extractLinksFromHtml(emailData.htmlBody);
      if (links.length > 0) {
        parts.push(`\nLinks found: ${links.join(", ")}`);
      }
    }

    if (emailData.attachments && emailData.attachments.length > 0) {
      const attachmentInfo = emailData.attachments
        .map(
          (att) =>
            `${att.name || "unnamed"} (${att.size || 0} bytes, ${att.contentType || "unknown type"})`
        )
        .join(", ");
      parts.push(`\nAttachments: ${attachmentInfo}`);
    }

    return parts.join("\n");
  }

  /**
   * Extract links from HTML content
   */
  extractLinksFromHtml(htmlContent) {
    const linkRegex = /href\s*=\s*["']([^"']+)["']/gi;
    const links = [];
    let match;

    while ((match = linkRegex.exec(htmlContent)) !== null) {
      const url = match[1];
      if (url && !url.startsWith("mailto:") && !url.startsWith("#")) {
        links.push(url);
      }
    }

    return [...new Set(links)]; // Remove duplicates
  }

  /**
   * Parse and validate the AI analysis result
   */
  parseAnalysisResult(result, originalEmailData) {
    try {
      let jsonString = result.response;
      
      // Extract JSON from markdown code blocks if present
      if (jsonString.includes('```json')) {
        const jsonMatch = jsonString.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch && jsonMatch[1]) {
          jsonString = jsonMatch[1].trim();
        }
      } else if (jsonString.includes('```')) {
        // Handle generic code blocks that might contain JSON
        const codeMatch = jsonString.match(/```\s*([\s\S]*?)\s*```/);
        if (codeMatch && codeMatch[1]) {
          jsonString = codeMatch[1].trim();
        }
      }
      
      // Clean up any remaining markdown or extra text
      jsonString = jsonString.trim();
      
      console.log("🔍 Parsing AI response:", jsonString.substring(0, 200) + "...");
      
      const analysis = JSON.parse(jsonString);

      // Validate required fields and provide defaults
      const validatedAnalysis = {
        riskLevel: ["low", "medium", "high"].includes(analysis.riskLevel)
          ? analysis.riskLevel
          : "medium",
        confidence:
          typeof analysis.confidence === "number"
            ? Math.max(0, Math.min(100, analysis.confidence))
            : 50,
        suspiciousPatterns: Array.isArray(analysis.suspiciousPatterns)
          ? analysis.suspiciousPatterns
          : [],
        explanation:
          typeof analysis.explanation === "string" ? analysis.explanation : "Analysis completed",
        recommendation:
          typeof analysis.recommendation === "string"
            ? analysis.recommendation
            : "Exercise caution",
        detectedIndicators: analysis.detectedIndicators || {},
        severity: analysis.severity || { low: 0, medium: 0, high: 0 },

        // Add metadata
        processingTime: result.total_duration,
        responseTime: result.responseTime,
        model: result.model,
        tokensUsed: result.eval_count,
        timestamp: new Date().toISOString(),
        emailLength: originalEmailData.body ? originalEmailData.body.length : 0,
      };

      return validatedAnalysis;
    } catch (parseError) {
      console.warn("🤖 Failed to parse AI response as JSON:", parseError.message);
      console.warn("🤖 Raw response was:", result.response);

      // Return a fallback analysis
      return {
        riskLevel: "medium",
        confidence: 30,
        suspiciousPatterns: ["AI response parsing failed"],
        explanation: "Could not parse AI analysis response. Manual review recommended.",
        recommendation: "Exercise caution and verify sender through alternative means",
        detectedIndicators: { parsing_error: true },
        severity: { low: 0, medium: 1, high: 0 },
        error: parseError.message,
        rawResponse: result.response,
        processingTime: result.total_duration,
        responseTime: result.responseTime,
        model: result.model,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get current statistics and status
   */
  getStats() {
    return {
      ...this.stats,
      successRate:
        this.stats.totalRequests > 0
          ? Math.round((this.stats.successfulRequests / this.stats.totalRequests) * 100)
          : 0,
    };
  }

  /**
   * Quick test analysis with a sample phishing email
   */
  async runTest() {
    const testEmail = {
      subject: "URGENT: Your account has been compromised!",
      body: "Dear Valued Customer,\n\nWe detected suspicious activity on your account. Your account will be suspended in 24 hours unless you verify your identity immediately.\n\nClick here to secure your account: http://fake-bank-security.com/verify\n\nProvide your username, password, and SSN for verification.\n\nAct now before it's too late!\n\nBank Security Team",
      sender: "Security Team",
      senderEmail: "security@fake-bank.com",
    };

    try {
      console.log("🧪 Running Ollama test analysis...");
      const result = await this.analyzeEmail(testEmail);
      console.log("✅ Test analysis completed successfully");
      return {
        status: "success",
        testEmail,
        analysis: result,
      };
    } catch (error) {
      console.error("❌ Test analysis failed:", error);
      return {
        status: "error",
        error: error.message,
        testEmail,
      };
    }
  }
}

module.exports = { OllamaDetector };
