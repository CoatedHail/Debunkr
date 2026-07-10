---
layout: default
title: Privacy Policy
---

# Sift Privacy Policy

**Last updated:** June 10, 2026
**Operator:** Four-Color AI LLC ("we", "us", "our")
**Contact:** oscarsmily@gmail.com

> **DRAFT.** This document is a starting point for legal review and not a substitute for professional legal advice. Before launching Sift publicly we are obtaining attorney review. Send questions to the contact above.

---

## 1. What Sift does

Sift is a mobile app that estimates the credibility of online news articles. You paste a URL; we fetch the article, score it 0-100, and explain why. Optionally you can run a "Deep Analysis" that adds a fact-check pipeline.

## 2. Who this policy applies to

Anyone who installs and uses Sift on iOS (and Android in the future).

## 3. Information we collect

We try to collect as little as possible. We do **not** require an account, do not ask for your name or email, and do not use third-party advertising trackers.

We collect:

- **Article URLs you submit.** Necessary to fetch and score the article.
- **A randomly generated device identifier ("device ID").** Created the first time you open the app and stored on your device. Used to enforce per-device rate limits (currently 20 single checks + 3 Deep Analyses per day) and to attribute your optional feedback to a consistent user without identifying you personally. The device ID is a UUID with no link to your Apple ID or any personal information.
- **Your IP address.** Captured automatically when you make a request to our backend. Used together with the device ID to enforce rate limits and detect abuse. We do not derive your physical address from it.
- **Optional feedback votes and comments.** When you tap "Helpful" or "Not helpful" on a result, we record that vote. If you leave an optional comment with a "Not helpful" vote, we store the comment text.
- **Aggregate cost and timing metrics.** Token counts and latencies of our backend's calls to third-party AI services, used to monitor cost and quality. These metrics are not linked to your device ID.

## 4. Information we do NOT collect

- Your name, email address, phone number, or any government ID
- Apple ID, Apple advertising identifier (IDFA), or persistent ID across apps
- Contacts, calendar, photos, microphone, camera, or other on-device data
- Your physical location (we don't request location permission)
- Browsing history outside of URLs you explicitly paste into Sift
- Health, financial, or biometric data

## 5. Article content

When you submit a URL, our backend retrieves the article text from that URL. The article text is sent to third-party AI services (see §6) and held in memory for the duration of your check (up to a few minutes) and optionally cached for up to 24 hours on our servers so that repeat checks of the same URL return faster. Article text is not stored beyond that cache window.

## 6. Third-party services we share data with

For each check, parts of your request are sent to the following third-party services solely to compute your result:

| Service | What we send | Why | Provider's policy |
|---|---|---|---|
| **Anthropic (Claude API)** | Article text + extracted claims | LLM-based scoring and fact-check synthesis | <https://www.anthropic.com/legal/privacy> |
| **Google Fact Check Tools API** | Extracted claim text (one short string per claim) | Look up matching fact-check articles | <https://policies.google.com/privacy> |
| **Wikipedia (REST API)** | Named-entity strings (e.g. "Joe Biden") | Check if entities exist | <https://meta.wikimedia.org/wiki/Privacy_policy> |
| **Railway** | Backend hosting | The cloud where our backend runs | <https://railway.com/legal/privacy> |
| **Expo / EAS** | Anonymous crash reports + build metadata | App distribution | <https://expo.dev/privacy> |
| **Apple TestFlight & App Store** | Standard Apple telemetry | App distribution | <https://www.apple.com/legal/privacy> |

We do not sell your data, and we do not share it with advertising networks.

## 7. How long we keep your data

- **Article URLs and article text**: up to 24 hours in cache, then deleted automatically.
- **Device ID**: persisted on your device until you uninstall the app. Backend retains the device ID for rate-limiting purposes for up to 30 days after your last request.
- **Feedback votes and comments**: retained indefinitely so we can improve scoring. Comments are not shared publicly.
- **IP addresses**: retained in rate-limit memory and logs for up to 30 days, then aggregated or deleted.
- **Aggregate cost / timing metrics**: retained indefinitely; not linked to your identity.

## 8. Your rights

Because we don't collect your name or email, we have no way to identify which records belong to you unless you send us your device ID.

If you do contact us with your device ID, you may request:

- A list of feedback comments associated with that device ID
- Deletion of those records
- Confirmation of what we hold

Send requests to **oscarsmily@gmail.com** with subject line "Privacy Request" and include your device ID. We respond within 30 days.

To find your device ID inside the app, tap Methodology → scroll to the bottom (this is a planned UI hook; until then, send an email and we can pull it from logs).

### California residents (CCPA)
You have the right to know what we collect, to delete it, and to opt out of any sale of personal information. We do not sell personal information.

### EU / UK residents (GDPR)
Our lawful basis is **legitimate interest** (operating and improving the service) and your **consent** (for the optional feedback features). You have the rights to access, rectification, erasure, restriction, portability, and objection. Use the contact above.

## 9. Children's privacy

Sift is rated **17+** in the App Store because we display rated news content and discuss politically sensitive topics. We do not knowingly collect data from children under 13. If you believe a child under 13 has used the service, contact us and we will delete associated records.

## 10. Security

Our backend uses HTTPS for all traffic. API keys are stored as encrypted environment variables on Railway's infrastructure and are never embedded in the mobile app binary. We hold backend data in memory plus append-only JSONL files on the backend container; we do not currently use a separate database.

We do not guarantee absolute security. No system is perfect. If you become aware of a vulnerability, please report it to oscarsmily@gmail.com.

## 11. Changes to this policy

If we change this policy, we will update the "Last updated" date above and post a brief summary in the app's About / Methodology screen. Material changes take effect 14 days after posting.

## 12. Contact

Four-Color AI LLC
Email: oscarsmily@gmail.com

For privacy questions, write "Privacy" in the subject line.
