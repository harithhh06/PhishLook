const express = require('express');
const cors = require('cors');
const natural = require('natural'); // Simple NLP library
const Sentiment = require('sentiment'); // Sentiment analysis
const nlp = require('compromise'); // Text processing

const app = express();
const PORT = 3001; // Different port from your Office dev server

// Enable CORS for your Outlook add-in
app.use(cors({
    origin: ['https://localhost:3000', 'https://outlook.office.com', 'https://outlook.office365.com']
}));

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
                'urgent', 'immediately', 'asap', 'right away', 'act now',
                'expires today', 'limited time', 'hurry', 'deadline',
                'don\'t wait', 'act fast', 'time sensitive'
            ],
            
            // Authority impersonation - pretending to be official
            authority: [
                'bank', 'government', 'tax office', 'irs', 'microsoft',
                'google', 'apple', 'paypal', 'amazon', 'security team',
                'official notice', 'department'
            ],
            
            // Threats - scary consequences
            threats: [
                'suspend', 'close', 'terminate', 'deactivate', 'freeze',
                'legal action', 'penalty', 'fine', 'court', 'lawsuit'
            ],
            
            // Credential requests - asking for passwords/info
            credentials: [
                'verify', 'confirm', 'update', 'password', 'username',
                'account details', 'personal information', 'ssn',
                'credit card', 'bank account'
            ],
            
            // Rewards - too good to be true
            rewards: [
                'congratulations', 'winner', 'prize', 'lottery', 'million',
                'selected', 'lucky', 'free money', 'inheritance'
            ]
        };
        
        // URL patterns for link analysis
        this.urlPatterns = {
            shorteners: ['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly'],
            suspiciousExts: ['.exe', '.scr', '.bat', '.cmd', '.zip'],
            legitimateDomains: ['google.com', 'microsoft.com', 'dbs.com.sg', 'ocbc.com.sg']
        };
    }

    // Main function to analyze an email
    analyzeEmail(emailData) {
        console.log('🔍 Starting email analysis...');
        
        // Combine subject and body for analysis
        const fullText = `${emailData.subject || ''} ${emailData.body || ''}`.toLowerCase();
        
        console.log('📝 Email text length:', fullText.length);
        
        // 1. Count suspicious patterns
        const patternScores = this.countSuspiciousPatterns(fullText);
        console.log('📊 Pattern scores:', patternScores);
        
        // 2. Analyze sentiment (negative sentiment can indicate threats/fear)
        const sentimentScore = this.analyzeSentiment(fullText);
        console.log('😊 Sentiment analysis:', sentimentScore);
        
        // 3. Analyze links for suspicious patterns
        const linkAnalysis = this.analyzeLinks(emailData.htmlBody || '');
        console.log('🔗 Link analysis:', linkAnalysis);
        
        // 4. Check for excessive punctuation (!!!, ???)
        const punctuationScore = this.checkPunctuation(fullText);
        console.log('❗ Punctuation score:', punctuationScore);
        
        // 5. Calculate overall suspiciousness (0 to 1 scale)
        const suspicionScore = this.calculateOverallScore(patternScores, sentimentScore, punctuationScore, linkAnalysis);
        console.log('🎯 Final suspicion score:', suspicionScore);
        
        // 5. Determine risk level
        const riskLevel = this.determineRiskLevel(suspicionScore);
        console.log('⚠️ Risk level:', riskLevel);
        
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
                linkAnalysis: linkAnalysis
            }
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
                const regex = new RegExp(`\\b${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
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
            suspiciousness: Math.min(normalizedScore, 1) // 0-1 scale
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
        const words = text.split(' ');
        const capsWords = words.filter(word => 
            word.length > 3 && word === word.toUpperCase() && /^[A-Z]+$/.test(word)
        ).length;
        
        if (capsWords > 2) score += 0.3;
        
        console.log(`  Exclamations: ${exclamations}, Questions: ${questions}, CAPS words: ${capsWords}`);
        
        return Math.min(score, 1); // Cap at 1
    }

    // Simple link analysis for Feature 1
    analyzeLinks(htmlBody) {
        if (!htmlBody) {
            return { totalLinks: 0, suspiciousLinks: 0, suspicionScore: 0, details: [] };
        }

        const linkRegex = /<a[^>]*href\s*=\s*["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
        const links = [];
        let match;
        
        while ((match = linkRegex.exec(htmlBody)) !== null) {
            const url = match[1];
            const text = match[2].replace(/<[^>]*>/g, '').trim();
            links.push({ url, text });
        }

        let suspiciousCount = 0;
        const linkDetails = [];

        for (const link of links) {
            const isSuspicious = this.isLinkSuspicious(link);
            if (isSuspicious.suspicious) {
                suspiciousCount++;
            }
            linkDetails.push({
                url: link.url,
                anchorText: link.text,
                isSuspicious: isSuspicious.suspicious,
                reasons: isSuspicious.reasons
            });
        }

        return {
            totalLinks: links.length,
            suspiciousLinks: suspiciousCount,
            mismatches: linkDetails.filter(l => l.reasons.includes('text_mismatch')).length,
            shorteners: linkDetails.filter(l => l.reasons.includes('url_shortener')).length,
            suspiciousExtensions: linkDetails.filter(l => l.reasons.includes('suspicious_extension')).length,
            suspicionScore: links.length > 0 ? suspiciousCount / links.length : 0,
            details: linkDetails
        };
    }

    isLinkSuspicious(link) {
        const reasons = [];
        
        // Check for text mismatch
        if (this.hasTextMismatch(link.text, link.url)) {
            reasons.push('text_mismatch');
        }
        
        // Check for URL shorteners
        if (this.urlPatterns.shorteners.some(s => link.url.includes(s))) {
            reasons.push('url_shortener');
        }
        
        // Check for suspicious extensions
        if (this.urlPatterns.suspiciousExts.some(ext => link.url.includes(ext))) {
            reasons.push('suspicious_extension');
        }

        return {
            suspicious: reasons.length > 0,
            reasons: reasons
        };
    }

    hasTextMismatch(text, url) {
        if (!text || !url) return false;
        
        // Skip generic text
        const generic = ['click here', 'read more', 'download', 'continue'];
        if (generic.some(g => text.toLowerCase().includes(g))) return false;
        
        try {
            const urlObj = new URL(url.startsWith('http') ? url : 'http://' + url);
            const domain = urlObj.hostname.toLowerCase();
            
            // Check if text mentions a different domain
            const domainRegex = /([a-zA-Z0-9-]+\.[a-zA-Z]{2,})/g;
            const textDomains = text.match(domainRegex);
            
            if (textDomains) {
                return textDomains.some(td => !domain.includes(td.toLowerCase()));
            }
        } catch (e) {
            return false;
        }
        
        return false;
    }

    // Combine all scores into final suspiciousness rating
    calculateOverallScore(patternScores, sentimentScore, punctuationScore, linkAnalysis) {
        // Weight different factors
        const weights = {
            patterns: 0.4,    // 40% - text patterns
            sentiment: 0.25,  // 25% - emotional manipulation
            punctuation: 0.15, // 15% - aggressive formatting
            links: 0.2       // 20% - suspicious links (NEW)
        };
        
        // Normalize pattern score
        const normalizedPatterns = Math.min(patternScores.total / 10, 1);
        
        // Get link score
        const linkScore = linkAnalysis ? linkAnalysis.suspicionScore : 0;
        
        // Calculate weighted average
        const totalScore = 
            (normalizedPatterns * weights.patterns) +
            (sentimentScore.suspiciousness * weights.sentiment) +
            (punctuationScore * weights.punctuation) +
            (linkScore * weights.links);
        
        return Math.min(totalScore, 1);
    }

    // Convert numeric score to risk level
    determineRiskLevel(score) {
        if (score >= 0.7) return 'high';
        if (score >= 0.4) return 'medium';
        return 'low';
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
            reasons.push('Uses negative/threatening language');
        }
        
        // Generate final explanation
        if (reasons.length === 0) {
            return 'No significant suspicious indicators detected.';
        } else {
            return `Suspicious because: ${reasons.join(', ')}.`;
        }
    }
}

// Create detector instance
const detector = new SimpleSuspiciousnessDetector();

// ====================
// API ENDPOINTS
// ====================

// Health check endpoint
app.get('/health', (req, res) => {
    console.log('💚 Health check requested');
    res.json({ 
        status: 'healthy', 
        message: 'AI Suspiciousness Detection API is running',
        timestamp: new Date().toISOString()
    });
});

// Main analysis endpoint
app.post('/api/analyze-suspiciousness', (req, res) => {
    try {
        console.log('\n🚀 New analysis request received');
        
        // Get email data from request
        const emailData = req.body;
        console.log('📧 Email data:', {
            subject: emailData.subject ? `"${emailData.subject.substring(0, 50)}..."` : 'No subject',
            bodyLength: emailData.body ? emailData.body.length : 0,
            sender: emailData.sender || 'Unknown sender'
        });
        
        // Validate input
        if (!emailData.subject && !emailData.body) {
            console.log('❌ No email content provided');
            return res.status(400).json({
                error: 'Email subject or body required',
                message: 'Please provide email content to analyze'
            });
        }
        
        // Run AI analysis
        const analysis = detector.analyzeEmail(emailData);
        
        // Send response
        const response = {
            status: 'success',
            timestamp: new Date().toISOString(),
            analysis: analysis,
            email_info: {
                subject: emailData.subject || 'No subject',
                sender: emailData.sender || 'Unknown',
                body_length: emailData.body ? emailData.body.length : 0
            }
        };
        
        console.log('✅ Analysis complete, sending response');
        res.json(response);
        
    } catch (error) {
        console.error('💥 Analysis failed:', error);
        res.status(500).json({
            status: 'error',
            message: 'Analysis failed',
            error: error.message
        });
    }
});

// Test endpoint with sample data
app.get('/api/test', (req, res) => {
    console.log('🧪 Test endpoint called');
    
    const testEmail = {
        subject: 'URGENT: Account Suspension Notice',
        body: 'Your bank account will be suspended immediately unless you verify your information right away. Click here to update your password and personal details. Act now or lose access forever!',
        sender: 'security@fake-bank.com'
    };
    
    const analysis = detector.analyzeEmail(testEmail);
    
    res.json({
        status: 'test',
        test_email: testEmail,
        analysis: analysis
    });
});

// ====================
// START SERVER
// ====================

app.listen(PORT, () => {
    console.log('\n🎉 AI Suspiciousness Detection Server Started!');
    console.log(`📍 Server running at: http://localhost:${PORT}`);
    console.log(`🔍 Health check: http://localhost:${PORT}/health`);
    console.log(`🧪 Test endpoint: http://localhost:${PORT}/api/test`);
    console.log('\n📋 Available endpoints:');
    console.log('  POST /api/analyze-suspiciousness - Main analysis');
    console.log('  GET  /health - Health check');
    console.log('  GET  /api/test - Test with sample data');
    console.log('\n🚀 Ready to analyze emails!\n');
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('👋 Server shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('\n👋 Server stopped by user');
    process.exit(0);
});