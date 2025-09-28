// ====================
// FIXED TASKPANE.JS - NO NULL REFERENCE ERRORS
// ====================

// Global variables
let isAnalyzing = false;

// Wait for Office to be ready AND DOM to be loaded
Office.onReady((info) => {
    console.log('📧 Office is ready, host:', info.host);
    
    // Wait a bit more for DOM to be fully ready
    setTimeout(() => {
        initializeEventHandlers();
    }, 100);
});

// Initialize all event handlers after DOM is ready
function initializeEventHandlers() {
    console.log('🔧 Initializing event handlers...');
    
    // Check if elements exist before adding handlers
    const analyzeBtn = document.getElementById("analyze-btn");
    const testBtn = document.getElementById("test-btn");
    
    if (analyzeBtn) {
        analyzeBtn.onclick = analyzeEmailWithAI;
        console.log('✅ Analyze button handler attached');
    } else {
        console.error('❌ analyze-btn not found');
    }
    
    if (testBtn) {
        testBtn.onclick = testAIAnalysis;
        console.log('✅ Test button handler attached');
    } else {
        console.error('❌ test-btn not found');
    }
    
    console.log('🎉 Initialization complete');
}

// ====================
// MAIN ANALYSIS FUNCTION
// ====================

async function analyzeEmailWithAI() {
    console.log('🚀 Starting AI analysis...');
    
    if (isAnalyzing) {
        console.log('⏳ Analysis already in progress');
        return;
    }
    
    try {
        isAnalyzing = true;
        
        // 1. Show loading state
        showLoadingState();
        
        // 2. Get email data from Outlook
        console.log('📧 Getting email data...');
        const emailData = await getEmailDataFromOutlook();
        console.log('📧 Email data retrieved:', {
            subject: emailData.subject ? emailData.subject.substring(0, 50) + '...' : 'No subject',
            bodyLength: emailData.body ? emailData.body.length : 0,
            sender: emailData.sender
        });
        
        // 3. Send to AI backend for analysis
        console.log('🤖 Sending to AI backend...');
        const aiResult = await callAIBackend(emailData);
        console.log('🤖 AI analysis result:', aiResult);
        
        // 4. Display results to user
        displayAIResults(aiResult);
        
        // 5. Update status
        showSuccess('✅ AI analysis complete!');
        
    } catch (error) {
        console.error('💥 Analysis failed:', error);
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
                reject(new Error('No email selected. Please open an email first.'));
                return;
            }
            
            console.log('📧 Getting email subject and body...');
            
            // Get email body as text first
            item.body.getAsync("text", (textResult) => {
                if (textResult.status === Office.AsyncResultStatus.Succeeded) {
                    
                    // Also get HTML body for link analysis
                    item.body.getAsync("html", (htmlResult) => {
                        let htmlBody = '';
                        if (htmlResult.status === Office.AsyncResultStatus.Succeeded) {
                            htmlBody = htmlResult.value || '';
                            console.log('📧 HTML body retrieved for link analysis');
                        } else {
                            console.warn('⚠️ Could not get HTML body, link analysis may be limited');
                        }
                        
                        // Collect all email data
                        const emailData = {
                            subject: item.subject || 'No subject',
                            body: textResult.value || 'No body',
                            htmlBody: htmlBody, // NEW: HTML body for link analysis
                            sender: item.from ? item.from.displayName : 'Unknown sender',
                            senderEmail: item.from ? item.from.emailAddress : 'unknown@example.com'
                        };
                        
                        console.log('📧 Email data collected successfully (with HTML)');
                        resolve(emailData);
                    });
                    
                } else {
                    console.error('❌ Failed to get email body:', textResult.error);
                    reject(new Error('Could not read email content. Please try again.'));
                }
            });
            
        } catch (error) {
            console.error('❌ Error accessing Outlook item:', error);
            reject(new Error('Could not access email. Make sure you have an email open.'));
        }
    });
}

// ====================
// CALL AI BACKEND
// ====================

async function callAIBackend(emailData) {
    console.log('🌐 Calling AI backend...');
    
    try {
        const response = await fetch('http://localhost:3001/api/analyze-suspiciousness', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(emailData)
        });
        
        console.log('📡 Backend response status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Backend error (${response.status}): ${errorText}`);
        }
        
        const result = await response.json();
        console.log('📊 Backend result received');
        
        return result;
        
    } catch (error) {
        console.error('🌐 Network error:', error);
        
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            throw new Error('Cannot connect to AI backend. Make sure your Node.js server is running on port 3001.');
        }
        
        throw error;
    }
}

// ====================
// DISPLAY AI RESULTS
// ====================

function displayAIResults(result) {
    console.log('🎨 Displaying AI results...');
    
    try {
        // Get the analysis data
        const analysis = result.analysis;
        
        if (!analysis) {
            throw new Error('No analysis data received from backend');
        }
        
        // Show results section
        const resultsSection = safeGetElement('ai-results');
        if (resultsSection) {
            resultsSection.style.display = 'block';
            resultsSection.classList.add('show');
        }
        
        // Update suspicion score circle
        updateSuspicionScore(analysis.suspicionScore, analysis.riskLevel);
        
        // Update explanation text
        updateExplanation(analysis.explanation);
        
        // Update detailed breakdown
        updateDetailedBreakdown(analysis.details);
        
        // Update recommendations
        updateRecommendations(analysis.riskLevel);
        
        console.log('✅ Results displayed successfully');
        
    } catch (error) {
        console.error('🎨 Error displaying results:', error);
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
        const scoreCircle = safeGetElement('suspicion-score');
        const scoreText = safeGetElement('score-text');
        const riskLevelText = safeGetElement('risk-level');
        
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
            scoreCircle.style.animation = 'scoreAppear 0.5s ease-out';
        }
        
    } catch (error) {
        console.error('📊 Error updating suspicion score:', error);
    }
}

function updateExplanation(explanation) {
    console.log('📝 Updating explanation');
    
    try {
        safeSetText('ai-explanation', explanation || 'No explanation available');
    } catch (error) {
        console.error('📝 Error updating explanation:', error);
    }
}

function updateDetailedBreakdown(details) {
    console.log('🔍 Updating detailed breakdown');
    
    try {
        if (!details) {
            safeSetHTML('detailed-breakdown', '<h4>🔍 Detailed Analysis</h4><div>No detailed analysis available</div>');
            return;
        }
        
        // Create breakdown HTML
        let breakdownHTML = '<h4>🔍 Detailed Analysis</h4>';
        
        // Pattern matches
        const patterns = details.patternMatches;
        if (patterns && patterns.total > 0) {
            breakdownHTML += '<div class="breakdown-section">';
            breakdownHTML += '<strong>Suspicious Patterns Found:</strong>';
            breakdownHTML += '<ul>';
            
            if (patterns.urgency > 0) breakdownHTML += `<li>Urgency indicators: ${patterns.urgency}</li>`;
            if (patterns.threats > 0) breakdownHTML += `<li>Threats/warnings: ${patterns.threats}</li>`;
            if (patterns.authority > 0) breakdownHTML += `<li>Authority claims: ${patterns.authority}</li>`;
            if (patterns.credentials > 0) breakdownHTML += `<li>Info requests: ${patterns.credentials}</li>`;
            if (patterns.rewards > 0) breakdownHTML += `<li>Reward promises: ${patterns.rewards}</li>`;
            
            breakdownHTML += '</ul></div>';
        } else {
            breakdownHTML += '<div>✅ No suspicious patterns detected</div>';
        }
        
        // Sentiment analysis
        if (details.sentiment && details.sentiment.suspiciousness > 0.2) {
            breakdownHTML += '<div><strong>Language Analysis:</strong> Negative/threatening tone detected</div>';
        }
        
        // Link analysis (NEW)
        if (details.linkAnalysis && details.linkAnalysis.totalLinks > 0) {
            breakdownHTML += '<div class="breakdown-section">';
            breakdownHTML += `<strong>Link Analysis (${details.linkAnalysis.totalLinks} links found):</strong>`;
            
            if (details.linkAnalysis.suspiciousLinks > 0) {
                breakdownHTML += '<ul>';
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
                breakdownHTML += '</ul>';
                
                // Show most suspicious links
                const highRiskLinks = details.linkAnalysis.details.filter(link => link.riskLevel === 'high');
                if (highRiskLinks.length > 0) {
                    breakdownHTML += '<div style="margin-top: 10px;"><strong>⚠️ Most Dangerous Links:</strong>';
                    breakdownHTML += '<ul>';
                    highRiskLinks.slice(0, 3).forEach(link => { // Show max 3
                        const reasons = link.reasons.join(', ');
                        breakdownHTML += `<li style="font-size: 11px; color: #d13438;"><strong>"${link.anchorText}"</strong> → ${reasons}</li>`;
                    });
                    breakdownHTML += '</ul></div>';
                }
            } else {
                breakdownHTML += '<div>✅ All links appear legitimate</div>';
            }
            breakdownHTML += '</div>';
        }
        
        safeSetHTML('detailed-breakdown', breakdownHTML);
        
    } catch (error) {
        console.error('🔍 Error updating detailed breakdown:', error);
        safeSetHTML('detailed-breakdown', '<h4>🔍 Detailed Analysis</h4><div>Error loading analysis details</div>');
    }
}

function updateRecommendations(riskLevel) {
    console.log('💡 Updating recommendations for risk level:', riskLevel);
    
    try {
        let recommendations = [];
        
        switch (riskLevel) {
            case 'high':
                recommendations = [
                    '🚨 DO NOT click any links in this email',
                    '🚨 DO NOT provide any personal information',
                    '📞 Verify sender through alternative contact method',
                    '🗑️ Consider deleting this email',
                    '🛡️ Report to your IT security team'
                ];
                break;
                
            case 'medium':
                recommendations = [
                    '⚠️ Exercise caution with this email',
                    '🔍 Verify sender identity before taking action',
                    '🔗 Check URLs carefully before clicking',
                    '📞 Contact sender directly if urgent action claimed'
                ];
                break;
                
            default: // low risk
                recommendations = [
                    '✅ Email appears relatively safe',
                    '🛡️ Continue following standard security practices',
                    '🤔 When in doubt, verify with sender'
                ];
        }
        
        // Create HTML list
        const recommendationsList = recommendations.map(rec => `<li>${rec}</li>`).join('');
        safeSetHTML('recommendations', `<ul>${recommendationsList}</ul>`);
        
    } catch (error) {
        console.error('💡 Error updating recommendations:', error);
        safeSetHTML('recommendations', '<ul><li>Error loading recommendations</li></ul>');
    }
}

// ====================
// UI STATE MANAGEMENT
// ====================

function showLoadingState() {
    console.log('⏳ Showing loading state...');
    
    try {
        // Disable analyze button
        const analyzeBtn = safeGetElement('analyze-btn');
        if (analyzeBtn) {
            analyzeBtn.disabled = true;
            analyzeBtn.textContent = '🤖 Analyzing with AI...';
        }
        
        // Show status
        showStatus('🔍 AI is analyzing email content...', 'analyzing');
        
        // Hide previous results
        const resultsSection = safeGetElement('ai-results');
        if (resultsSection) {
            resultsSection.style.display = 'none';
            resultsSection.classList.remove('show');
        }
        
    } catch (error) {
        console.error('⏳ Error showing loading state:', error);
    }
}

function showSuccess(message) {
    console.log('✅ Showing success:', message);
    
    try {
        // Re-enable analyze button
        const analyzeBtn = safeGetElement('analyze-btn');
        if (analyzeBtn) {
            analyzeBtn.disabled = false;
            analyzeBtn.textContent = '🤖 Analyze Current Email with AI';
        }
        
        // Show success status
        showStatus(message, 'success');
        
    } catch (error) {
        console.error('✅ Error showing success state:', error);
    }
}

function showError(message) {
    console.log('❌ Showing error:', message);
    
    try {
        // Re-enable analyze button
        const analyzeBtn = safeGetElement('analyze-btn');
        if (analyzeBtn) {
            analyzeBtn.disabled = false;
            analyzeBtn.textContent = '🤖 Try Again';
        }
        
        // Show error status
        showStatus(message, 'error');
        
    } catch (error) {
        console.error('❌ Error showing error state:', error);
    }
}

function showStatus(message, type) {
    try {
        const statusElement = safeGetElement('status');
        if (statusElement) {
            statusElement.textContent = message;
            statusElement.className = `status ${type}`;
            statusElement.style.display = 'block';
        }
    } catch (error) {
        console.error('📋 Error showing status:', error);
    }
}

// ====================
// TEST FUNCTION (for development)
// ====================

// Test email counter to cycle through different examples
let testEmailIndex = 0;

async function testAIAnalysis() {
    console.log('🧪 Running test analysis...');
    
    if (isAnalyzing) {
        console.log('⏳ Analysis already in progress');
        return;
    }
    
    try {
        isAnalyzing = true;
        showLoadingState();
        
        // Different test emails to cycle through
        const testEmails = [
            // Test 1: Banking phish with domain spoofing
            {
                subject: 'URGENT: DBS Account Suspension Notice',
                body: 'Your DBS bank account will be suspended immediately unless you verify your information right away.',
                htmlBody: `
                    <div>
                        <p>Dear Customer,</p>
                        <p>Your <strong>DBS Bank</strong> account will be suspended immediately unless you verify your information.</p>
                        <p><a href="http://dbs-security-verification.malicious-site.com/verify">Click here to verify your DBS account</a> immediately.</p>
                        <p>You can also <a href="http://bit.ly/fake-dbs-urgent">download our security app</a> for protection.</p>
                        <p><a href="http://evil-site.com/banking-malware.exe">Download security patch</a> now!</p>
                    </div>
                `,
                sender: 'DBS Bank Security',
                senderEmail: 'security@dbs-fake.com'
            },
            
            // Test 2: Government phish with multiple mismatches  
            {
                subject: 'IRAS Tax Refund - Action Required',
                body: 'You have a pending tax refund. Click the link to claim your refund immediately.',
                htmlBody: `
                    <div>
                        <p>Singapore Government - IRAS</p>
                        <p>You have a <strong>$2,850 tax refund</strong> pending approval.</p>
                        <p><a href="http://iras-refund-portal.scam-site.org/claim">Visit official IRAS portal</a> to claim now.</p>
                        <p><a href="http://tinyurl.com/fake-iras-claim">Alternative link</a> if above doesn't work.</p>
                        <p><a href="https://google.com">Visit Google</a> for more information.</p>
                    </div>
                `,
                sender: 'IRAS Singapore',
                senderEmail: 'noreply@iras-gov.fake'
            },
            
            // Test 3: Tech support scam
            {
                subject: 'Microsoft Security Alert - Immediate Action Required',
                body: 'Your computer is infected with viruses. Download our security tool immediately.',
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
                sender: 'Microsoft Security Team',
                senderEmail: 'security@microsoft-alerts.fake'
            }
        ];
        
        // Get current test email (cycle through)
        const testEmail = testEmails[testEmailIndex % testEmails.length];
        testEmailIndex++; // Move to next test for future clicks
        
        console.log(`🧪 Testing with scenario ${((testEmailIndex - 1) % testEmails.length) + 1}: ${testEmail.subject}`);
        
        const result = await callAIBackend(testEmail);
        displayAIResults(result);
        showSuccess(`✅ Test ${((testEmailIndex - 1) % testEmails.length) + 1} complete! Click again for next scenario.`);
        
    } catch (error) {
        console.error('💥 Test failed:', error);
        showError(`❌ Test failed: ${error.message}`);
    } finally {
        isAnalyzing = false;
    }
}

// Make functions available globally (for any inline onclick handlers)
window.analyzeEmailWithAI = analyzeEmailWithAI;
window.testAIAnalysis = testAIAnalysis;

console.log('🚀 taskpane.js loaded successfully');