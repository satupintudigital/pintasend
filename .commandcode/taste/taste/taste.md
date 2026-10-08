# Taste
- Writes and prefers communication in Indonesian (uses Indonesian for instructions; expects replies/summaries in Indonesian). Confidence: 0.7
- Wants feasibility/capacity analysis with concrete calculations before committing to a design — explicitly asks whether an approach is possible and to compute limits (e.g. how long a code space lasts / when collisions appear) before implementing. Confidence: 0.7
- Prefers short, clean user-facing URLs (e.g. 6–8 char alphanumeric shortcodes) over long UUID/identifier-based links. Confidence: 0.6
- Once the agent has presented an analysis with a recommended option, tends to approve that recommendation and ask to implement it right away — wants decisive execution after the deliberation rather than more back-and-forth. Confidence: 0.55
- Chooses infrastructure/accounts based on quota and plan limits — will move workloads to a paid account for higher limits rather than optimize for staying on free tier. Confidence: 0.6
- Names service hosts with terse initials/acronyms derived from the service name (e.g. `rvi` = "result viewer imagestro" → `rvi.satupintudigital.co.id`) instead of long descriptive subdomains. Confidence: 0.5
- Expects customer-facing multi-tenant features to be white-label: each tenant should be able to use its own custom domain (e.g. via Cloudflare for SaaS custom hostnames) instead of only the platform's built-in domain. Confidence: 0.6
- Prefers capabilities/feasibility be verified empirically with live end-to-end API calls — will hand over real credentials (e.g. API tokens pasted in chat) and ask the agent to test them rather than accept assumptions about whether something will work. Confidence: 0.5
- Treats deployment + live end-to-end verification as part of "done", not just code/commits — expects the agent to carry a feature through to actually deploying it (and confirming it works in the real environment) when asked to "continue/deploy". Confidence: 0.55
