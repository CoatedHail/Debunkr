# Sift — App Store Connect copy

All strings ready to paste into App Store Connect. Counts in brackets.

---

## App Information

- **Bundle ID:** com.oscarli.credibilitycheck
- **SKU:** cred-001
- **Primary Category:** News
- **Secondary Category:** Reference
- **Content Rights:** Does this app contain, show, or access third-party content? → **Yes** (we display news article content)
- **Age Rating:** 17+ (see Age Rating section below)
- **Pricing:** Free
- **Availability:** All territories

---

## URLs

| Field | Value |
|---|---|
| **Privacy Policy URL** | `https://coatedhail.github.io/Fake_News_Detector/legal/privacy` |
| **Marketing URL** | `https://coatedhail.github.io/Fake_News_Detector/` |
| **Support URL** | `https://coatedhail.github.io/Fake_News_Detector/legal/` |

---

## Subtitle (30 char max)

```
Rate any article in seconds
```
[27 / 30]

Alternatives:
- `Check before you share` [22]
- `AI credibility for any URL` [26]
- `News credibility, on tap` [24]
- `Article credibility checker` [27]

---

## Promotional Text (170 char max — editable without resubmission)

```
Paste any article URL. Get a 0-100 credibility score with publisher reputation, article quality, and fact-check evidence. Built to make media literacy easier.
```
[157 / 170]

---

## Description (4000 char max)

```
Sift rates the credibility of online news articles in seconds.

Paste any article URL, tap Check, and Sift returns:

• A 0-100 OVERALL CREDIBILITY score
• A clear bucket: Highly credible / Mostly credible / Mixed / Questionable / Low
• A RATING STRENGTH indicator so you know when to trust the result less
• A BREAKDOWN by publisher reputation, article quality, and tone & balance
• The DEVIL'S ADVOCATE — the strongest reason the rating could be wrong

Tap Deep Analysis for a deeper pass:

• A SKEPTIC and an ADVOCATE LLM debate the article point by point
• A JUDGE synthesizes both into a final verdict
• A FACT-CHECK pipeline extracts up to 3 verifiable claims, checks them against the Google Fact Check Tools API (PolitiFact, Snopes, AFP Fact Check, Reuters Fact Check, and more), and verifies named people, places, and organizations against Wikipedia
• Verdicts and citations come from real sources — we cap citation count at 5 and require URLs to come from actual search results

HOW THE SCORE WORKS

We combine three signals:

• PUBLISHER REPUTATION (45%) — pulled from a hand-curated list of ~30 publishers based on Wikipedia's Perennial Sources editor consensus, plus the IFCN signatory list of certified fact-checkers. Unknown publishers fall back to article-level signals.

• ARTICLE QUALITY (45%) — a Claude AI model reads the article and scores writing quality, sourcing, and hedging.

• TONE & BALANCE (10%) — a small penalty for extreme political lean in either direction.

A RATING STRENGTH indicator tells you when our data is thin so you can weigh the result accordingly.

HONEST LIMITATIONS

Sift is informational, not advice:

• We rate writing quality and publisher reputation, not absolute truth.
• A well-written fabrication from an unknown site can still score Mixed.
• The fact-check pipeline is English-only and US/UK-skewed in its Tier-1 publisher list.
• Breaking news (under 24 hours) often has no fact-checks yet — we'll say "no fact-checks found" rather than guess.
• AI models can hallucinate. We have safeguards, but errors are possible.

The Methodology and Limitations screens spell out exactly how everything works and where we still have gaps.

NO ACCOUNT REQUIRED

Sift doesn't ask for your name, email, or login. We use a random device ID to enforce daily rate limits and to attribute optional feedback to a consistent user without identifying you personally.

FEEDBACK IS THE PRODUCT

Every result has Helpful / Not helpful buttons. Your feedback shapes future improvements to the scoring and explanations.

LIMITS

To keep costs sustainable and prevent abuse, Sift currently enforces 20 standard checks and 3 Deep Analyses per device per day.

For more on how the score works, what we collect, and our limitations, see the in-app Methodology, Limitations, and Privacy Policy.

— Sift is in alpha. Ratings are estimates, not verified facts. Always check important claims independently.
```
[~3,000 chars / 4,000]

---

## Keywords (100 char max, comma-separated, no spaces after commas)

```
news,fact check,credibility,fake news,bias,journalism,media literacy,misinformation,verify,source
```
[97 / 100]

Notes:
- Avoid repeating words that already appear in your **title** or **subtitle** — Apple already indexes those.
- "fact check" without quotes is two indexed tokens.
- Don't use competitor app names (Apple flags this).

---

## App Privacy (Nutrition Labels)

Apple asks: "Does your app collect any data from this app?" → **Yes**

Data types collected:

| Apple Category | Specific Type | Linked to user? | Used for tracking? | Purpose |
|---|---|---|---|---|
| Identifiers | Device ID | **No** (anonymous UUID) | No | App functionality (rate limiting), Analytics |
| Usage Data | Product Interaction | **No** | No | Analytics, App functionality |
| User Content | Other User Content (article URLs you submit, optional feedback comments) | **No** | No | App functionality |
| Diagnostics | Crash data | **No** | No | App functionality |

Mark all four as:
- "Data linked to you" → **No**
- "Data used to track you" → **No**

Justification: We do not collect any identifier that could be tied to a real-world identity (no Apple ID, no IDFA, no email, no name). The device ID is a random UUID generated on first launch. We do not share data with third parties for advertising or tracking.

---

## Age Rating

Run through Apple's age rating questionnaire. Answer:

- Cartoon or Fantasy Violence → None
- Realistic Violence → None
- Sexual Content or Nudity → None
- Profanity or Crude Humor → None
- Alcohol, Tobacco, or Drug Use → None
- Mature/Suggestive Themes → None
- Horror/Fear Themes → None
- Medical/Treatment Information → None
- Simulated Gambling → None
- Unrestricted Web Access → **No** (we only fetch articles from URLs the user submits; no browsing UI)
- Gambling and Contests → None
- News, Current Events, or Editorial → **Yes** ⚠️ (this drives 17+)
- User-Generated Content → **No** (feedback comments are not shared publicly)

Expected rating: **17+** because we display news/current events content. This is normal for news apps.

---

## What to Test (TestFlight beta description) — already filled

```
Paste any article URL. Tap Check for a credibility score. Tap Deep Analysis for fact-check evidence and a Skeptic / Advocate debate. Use Helpful / Not helpful to leave feedback on each result.
```

---

## Notes for App Review (for App Store review only)

```
Sift is a credibility-rating app for news articles. There is no login required.

How to test:
1. Open the app.
2. Paste any article URL into the input field. Recommended test URLs:
   - https://www.reuters.com/world/europe/ (a Reuters article)
   - https://www.snopes.com/fact-check/pope-francis-donald-trump-endorsement/ (a Snopes debunking)
   - https://en.wikipedia.org/wiki/Pizzagate_conspiracy_theory (a Wikipedia entry)
3. Tap Check. A 0-100 credibility score appears in ~3-4 seconds.
4. Optionally tap "Run Deep Analysis" for a fuller breakdown with fact-check citations. Takes ~10-15 seconds.

Backend: hosted at https://fakenewsdetector-production-9cff.up.railway.app — verified live.

The app calls our backend, which in turn calls the Anthropic Claude API, the Google Fact Check Tools API, and the Wikipedia REST API. All third-party usage is disclosed in our Privacy Policy.

No demo account is needed — all functionality is available without login.

Rate limits: 20 standard checks + 3 Deep Analyses per device per 24 hours, to manage cost. If you hit the limit during review, please contact oscarsmily@gmail.com and we will reset.

Thank you for reviewing.
```

---

## "What's New in This Version" (release notes for v1.0.0)

```
First release. Rate any news article 0-100 in seconds. Optional Deep Analysis runs a Skeptic / Advocate / Judge debate plus a fact-check pipeline (Google Fact Check Tools, Wikipedia, hand-curated Tier-1 sources).
```
[~290 chars — App Store allows 4000]

---

## Localization

For v1, English (U.S.) only. Spanish + French + German recommended for v1.1.

---

## Screenshots required

Take 3-10 screenshots at each of these sizes (Apple requires at least the 6.7" set; the others auto-scale but submitting all three gives the best presentation):

| Display | Resolution | Devices |
|---|---|---|
| **6.9"** | 1320×2868 portrait (or 2868×1320 landscape) | iPhone 16 Pro Max, 15 Pro Max, 14 Pro Max |
| **6.5"** | 1284×2778 | iPhone 11 Pro Max, XS Max |
| **5.5"** | 1242×2208 | iPhone 8 Plus (Apple no longer strictly requires this but accepts) |

Recommended sequence:
1. Empty input + "How it works" card
2. Result screen with a high-credibility article (Reuters)
3. Result screen with a low-credibility article (debunked)
4. Deep Analysis expanded with Skeptic + Advocate
5. Evidence card with citations
6. Methodology screen

Tip: take screenshots inside iOS Simulator (Cmd+S in sim saves to Desktop). The 6.9" iPhone 16 Pro Max sim will give you 1320×2868 native.

---

## Quick-paste table for App Store Connect form

| App Store Connect field | Paste |
|---|---|
| App Name | Sift |
| Subtitle | Rate any article in seconds |
| Promotional Text | Paste any article URL. Get a 0-100 credibility score with publisher reputation, article quality, and fact-check evidence. Built to make media literacy easier. |
| Description | (paste the long Description block above) |
| Keywords | news,fact check,credibility,fake news,bias,journalism,media literacy,misinformation,verify,source |
| Primary Category | News |
| Secondary Category | Reference |
| Privacy Policy URL | https://coatedhail.github.io/Fake_News_Detector/legal/privacy |
| Marketing URL | https://coatedhail.github.io/Fake_News_Detector/ |
| Support URL | https://coatedhail.github.io/Fake_News_Detector/legal/ |
| Notes for App Review | (paste the Notes for App Review block above) |
| What to Test (TestFlight) | (paste the What to Test block above) |
| What's New in This Version | (paste the What's New block above) |
