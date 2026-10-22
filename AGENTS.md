# AGENTS.md — Duri.AI

Instructions for coding agents working on **Duri.AI: Self-Learning Durian Harvest System**. Read this file before making changes. Treat the existing repository and its established conventions as the source of truth; inspect the code before proposing or implementing a rewrite.

## 1. Project purpose

Duri.AI helps durian farmers identify fallen fruit and locate it in an orchard. It combines vibration sensing, camera-based verification, edge processing, orchard mapping, push notifications, and farmer feedback to reduce false alarms and time spent searching for fruit.

Prioritize useful, dependable field workflows over technology demos. The system should communicate what was detected, why an alert was raised, where the fruit may be, and what the farmer can do next.

## 2. Product and architecture context

Use these as the intended architecture, while verifying what is actually implemented in the repository before changing it:

- **Existing software stack:** the project has already started with Node.js. Extend the current Node.js application and its existing structure; do not migrate to Laravel or restart the project unless explicitly requested.
- **Web client:** build a responsive Progressive Web App (PWA) suitable for phones used in an orchard, with clear touch targets, useful offline/loading/error states, and push-notification support where the current platform permits it.
- **Edge vision:** Raspberry Pi 5 nodes are intended to run image verification with TensorFlow Lite.
- **Sensor hub:** ESP32 gathers or coordinates vibration-sensor readings and passes event data to the appropriate processing layer.
- **Connectivity:** the intended flow includes a 4G connection between the orchard system and the cloud. Expect intermittent connectivity; handle retries and stale data safely.
- **Alert decision:** treat vibration as a candidate event, not proof of a fallen durian. The intended detection flow requires vibration evidence and camera verification to agree before issuing a confirmed harvest alert. Keep uncertain results distinguishable from confirmed results.
- **Farmer alert:** an alert should provide the orchard/location information available to the system, a useful image preview when available, a timestamp, and a clear event status.
- **Learning loop:** farmers should be able to give feedback on detections, including likely false alarms such as animals, wind, or rain. Preserve that feedback as structured data so it can inform later model evaluation or retraining. Do not claim that a model has retrained or improved unless the workflow actually performed and verified that operation.
- **Updates:** design for maintainable model/software updates, including OTA updates where supported by the existing implementation. Do not introduce an unsafe or unverified remote-update path.

These notes describe product intent, not proof that every hardware or cloud component is already connected. Keep hardware, simulation, mock data, and production integrations clearly labelled.

## 3. Development workflow

1. Inspect the repository structure, `package.json`, existing routes/components, environment examples, tests, and project documentation before editing.
2. Follow the current framework, module system, naming, formatting, and folder conventions. Prefer small, reversible changes over broad rewrites.
3. Reuse existing dependencies and components where appropriate. Do not add a package for functionality the project can already handle simply.
4. Keep credentials, API tokens, private keys, and deployment secrets out of source control. Use environment variables and update the example environment file with names and safe placeholder values only.
5. Validate user input and external/device payloads at system boundaries. Handle missing fields, malformed data, timeouts, duplicate events, and unavailable connectivity explicitly.
6. When a change affects setup, configuration, data formats, or device communication, update the relevant documentation and examples.
7. Run the most relevant available tests, linter, type check, and/or build after making changes. Report commands that were run and any checks that could not be run; never claim a check passed if it was not executed.
8. Do not fabricate sensor readings, model metrics, GPS coordinates, device status, or successful notifications. Make mock/demo data visibly identifiable and keep it separate from real event data.

## 4. Product and data principles

- **Explainable states:** distinguish at least candidate, verifying, confirmed, rejected/false alarm, and failed/unknown states where those states exist in the workflow. Use the repository's existing status vocabulary if one is already established.
- **Traceable events:** retain event IDs, timestamps, source/device IDs, verification results, and feedback links where relevant. Avoid silently overwriting evidence needed to investigate a false alarm.
- **Structured vibration information:** preserve measured values such as amplitude, frequency, duration, and timestamps when the hardware can provide them. A boolean can represent a derived threshold result, but should not replace raw or useful measurements without a documented reason.
- **Safe decisions:** missing camera evidence, stale sensor data, or a network error must not silently become a confirmed durian detection.
- **Feedback quality:** record a farmer's label separately from the model's prediction. Do not treat every swipe or correction as verified ground truth without recording what the action means.
- **Location integrity:** display only locations actually supplied by configured devices or services. If coordinates are unavailable, show an honest unavailable state rather than invented map pins.
- **Privacy and security:** collect only data the feature needs; protect authentication/session flows and device credentials; validate uploads; and avoid exposing secrets or unnecessary user/device details in logs.
- **Accessible interaction:** support keyboard navigation, visible focus states, adequate contrast, readable text, and accessible names. Do not rely on colour, animation, or swipe gestures alone to communicate or operate a control.

## 5. Frontend aesthetics

The interface should feel designed specifically for **durian harvesting in Malaysian orchards**, not like a generic SaaS admin template. Use the content, hierarchy, and visual language to help a farmer make quick decisions in bright outdoor conditions and on a phone.

<frontend_aesthetics>
You tend to converge toward generic, "on distribution" outputs. In frontend design,this creates what users call the "AI slop" aesthetic. Avoid this: make creative,distinctive frontends that surprise and delight. 

Focus on:
- Typography: Use Montserrat as the standard font for headings, interface text, and numeric telemetry. Reuse the existing `--font-sans` token in `src/index.css`; use weight, size, spacing, and hierarchy to create distinction rather than introducing another font.
- Color & Theme: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes. Use IDE themes and cultural aesthetics for inspiration.
- Motion: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions.
- Backgrounds: Create atmosphere and depth rather than defaulting to solid colors. Layer CSS gradients, use geometric patterns, or add contextual effects that match the overall aesthetic.

Avoid generic AI-generated aesthetics:
- Overused font families (Inter, Roboto, Arial, system fonts)
- Clichéd color schemes (particularly purple gradients on white backgrounds)
- Predictable layouts and component patterns
- Cookie-cutter design that lacks context-specific character

Interpret creatively and make unexpected choices that feel genuinely designed for the context. Vary between light and dark themes, different fonts, different aesthetics. You still tend to converge on common choices (Space Grotesk, for example) across generations. Avoid this: it is critical that you think outside the box!
</frontend_aesthetics>

### Apply the aesthetic with judgement

- Choose a clear visual concept before building a screen. Orchard canopy, durian rind and flesh, soil, field equipment, topographic orchard maps, and field-note markings can inspire the system without becoming literal decoration everywhere.
- Use a coherent palette expressed through CSS custom properties/design tokens. A possible starting point is canopy green, deep soil/charcoal, durian-flesh cream, and a restrained rind-lime accent; adapt it to the screen's purpose and verify contrast. Do not apply every colour to every component.
- Keep Montserrat consistent across existing and new screens, including detection headings and measurements. Ensure font weights load reliably and text remains legible at small sizes. Keep the existing fallback stack for when Montserrat is unavailable.
- Create depth through considered layering, subtle grain or contour-line motifs, orchard-map details, or gradients that support the content. Do not reduce readability or battery/performance on mobile for decoration.
- Use intentional composition and hierarchy rather than automatically placing every metric inside an identical card. Reserve prominent emphasis for genuinely important alerts and decisions.
- Motion should explain state or add delight: use a restrained page-entry sequence, clear verification transitions, and meaningful feedback states. Respect `prefers-reduced-motion`; avoid animation that delays urgent information or causes repeated movement near alerts.
- Make swipe-to-classify feedback optional alongside explicit buttons. Farmers must be able to understand each action, undo where practical, and use the workflow without gestures.
- Design for outdoor use: readable type, strong contrast, large tap targets, clear status text, and concise information. Test narrow phone layouts as well as desktop.
- Use CSS-only animation for straightforward HTML/CSS interfaces. If the project uses React and already has a suitable Motion library, use it selectively rather than adding one automatically.
- Avoid placeholder-looking screens. Empty, loading, offline, permission-denied, error, and no-detection states should be deliberately designed and explain what is happening.

## 6. Responsive PWA and interaction expectations

- Treat the phone experience as a first-class workflow, not simply a compressed desktop dashboard.
- Make core tasks reachable with a thumb: inspect a detection, view its image/location, confirm or reject it, and review prior events.
- Make permission states for notifications and location explicit. Explain when a browser/device setting prevents a feature from working.
- Provide fallbacks when push notifications, camera previews, GPS, or network access are unavailable.
- Keep important event details available in the app even if a push notification is delayed or dismissed.
- Avoid indicating that the PWA is offline-capable unless service-worker caching and the needed offline behaviour are implemented and tested.

## 7. Code quality and API boundaries

- Keep UI, business rules, device communication, and persistence separated according to the existing project structure.
- Define and validate the shape of sensor events, camera verification results, alert records, and farmer feedback. Document changes to payloads so device and server code remain compatible.
- Make network operations observable and resilient. Handle retries with sensible limits/backoff, and make processing idempotent where duplicate delivery is possible.
- Do not expose internal device endpoints or privileged operations directly to untrusted clients.
- Keep model inference, thresholds, and confidence interpretation explicit and configurable where appropriate; do not bury unexplained magic numbers in presentation components.
- Keep logs useful for debugging without logging secrets. Surface actionable errors to the user and retain diagnostic detail in appropriate server logs.
- Never hard-code deployment URLs, credentials, personal contact information, or orchard coordinates into application logic.

## 8. Verification checklist

Before marking a task complete, check the applicable items:

- [ ] The change fits the existing Node.js project and established conventions.
- [ ] The UI has a deliberate, context-specific visual direction and is responsive.
- [ ] Text contrast, tap targets, keyboard operation, focus states, and reduced-motion preferences are considered.
- [ ] Candidate detections cannot be mistaken for verified detections.
- [ ] Missing/invalid sensor data, camera failures, duplicate events, and offline states are handled where relevant.
- [ ] Mock data is clearly marked and no successful hardware/cloud integration is implied without evidence.
- [ ] Sensitive configuration remains outside source control.
- [ ] Relevant tests/build checks were run, and limitations are reported honestly.
- [ ] Documentation or payload examples were updated if behaviour or configuration changed.

## 9. How agents should report changes

When finishing a coding task, summarize the key files changed, explain the user-visible or system behaviour, list checks actually run and their results, and call out unresolved assumptions or limitations. Keep the report concise and factual.
