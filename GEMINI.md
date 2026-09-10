# AdditiveAlert: Project Rules & Guidelines

## 1. Multimodal Vision AI vs. Client Offline Matcher Hierarchy
- **Authoritative Vision Verdict:** When Multimodal AI (Gemini Vision / Vision API) processes an ingredient label and concludes that no additives are present (`additives: []`), accept this result as authoritative.
- **No Overwriting AI with Fallbacks:** NEVER run client-side regex or stemming offline matchers over an authoritative AI response to "double check" or override it. Offline matching is STRICTLY reserved for network failures, offline PWA mode, or pure text input without an API connection.
- **Entity Matching Invariants (Chemistry & Additives):**
  - **Color & Food Stop-words:** Generic color terms (e.g., *rot, gelb, grün, blau, red, yellow, green, červená, žlutá, zelená*) and culinary ingredients (e.g., *paprika, tea, milk, salt*) must NEVER match as standalone additive names.
  - **Preserve Short Alphanumeric Tokens:** Never prune tokens with length < 3 in chemical contexts. Designations like `2G`, `4R`, `FCF`, `S`, `HT` are critical qualifiers. For additives containing a color name (e.g., *Rot 2G*, *Grün S*), matching requires BOTH the color and the exact alphanumeric code.
  - **Acid Qualifiers:** Do NOT treat "kyselina" / "acid" / "Säure" as generic stop words, otherwise natural foods (e.g., *citrón* in tea) falsely trigger synthetic additive alerts (e.g., *E330 kyselina citronová*).

## 2. Mobile Web Media Capture & Gallery Guidelines
- **Dual Action Pattern (Camera vs. Gallery):**
  - Mobile browsers (iOS Safari, Android Chrome) treat `<input type="file" capture="environment">` as a directive to bypass the system picker and launch the hardware camera viewfinder directly.
  - NEVER use a single input with `capture="environment"` if the user might want to select an existing photo.
  - ALWAYS provide two distinct inputs / CTAs:
    1. **Camera CTA:** `<input type="file" accept="image/*" capture="environment">`
    2. **Gallery CTA:** `<input type="file" accept="image/*">` (without `capture`)
- **Device Photo Persistence:**
  - Photos captured directly from the camera in a browser exist only in volatile blob/memory.
  - When the user captures a label photo, automatically offer or trigger local saving to device downloads/gallery using the download attribute and/or native Web Share API (`navigator.share({ files: [file] })`).

## 3. Anonymous First, Zero-Friction Storage
- Features like scan history, risky additive tallies, and personal statistics must function out of the box using client-side persistent storage (`localStorage` + anonymous `deviceId`), without forcing user registration or login upfront.
