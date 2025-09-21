# PhishLook - Outlook Phishing Detection Extension

## 🎯 Project Overview

An AI-powered Outlook extension that automatically detects and flags potential phishing emails in real time. The extension will use machine learning models to analyze email content, links, sender authenticity, and attachments against known red flags such as mismatched URLs, urgent or threatening language, false rewards, and suspicious requests for confidential information.

By combining AI-driven link analysis with a continuously updated phishing database, the tool empowers Singaporeans to avoid falling prey to scams they might not otherwise recognise, ultimately enhancing digital safety and trust in online communication.

## 🚨 The Problem Statement

Many Singaporeans struggle to distinguish between real and fake emails, as phishing messages often mimic legitimate organisations like banks, government agencies, or e-commerce platforms, leading to rising cases of scams, identity theft, and financial fraud.

## 💡 Our Solution

A lightweight Outlook Web Add-in that:

- **Analyzes emails as they're opened** using local heuristics and AI-powered backend
- **Provides Smart Alerts** with traffic-light system and educational explanations
- **Blocks risky outbound emails** (replying to phish, forwarding malicious content)
- **Detects 6 key phishing signals** with explanations for user education

## 🔍 Six Phishing Signals We Detect

1. **Mismatched/Misleading Info** - Display name vs actual sender, punycode domains, deceptive URLs
2. **Urgent/Threatening Language** - AI classifier for pressure tactics and deadlines
3. **Attractive Rewards** - "Too good to be true" offers and prizes
4. **Requests for Confidential Info** - Password/credential requests, suspicious forms
5. **Unexpected Emails** - First-time senders, SPF/DKIM/DMARC failures
6. **Suspicious Attachments** - Executables, archives, unusual file types

**Next Steps**: Team sync to discuss role assignments and detailed implementation plan.
