#!/usr/bin/env python3
"""
expand_definitions.py
Adds net-new definitions sourced from article content audit.
Run: python3 scripts/expand_definitions.py
"""
import json, time, urllib.request, urllib.error
from pathlib import Path

ROOT = Path('/Users/pax/.openclaw/workspace/securebydezign.com')
META_FILE = ROOT / 'data' / 'definitions-meta.json'
EMB_FILE  = ROOT / 'data' / 'definitions-embeddings.json'

# ── Load .env.local ────────────────────────────────────────────────────────
dotenv = Path('/Users/pax/.openclaw/workspace/.env.local').read_text()
api_key = next(l.split('=',1)[1].strip() for l in dotenv.splitlines() if l.startswith('OPENAI_API_KEY='))

# ── New definitions (sourced from article audit) ───────────────────────────
NEW_DEFS = [
  {
    "id": "clean-label-poisoning",
    "term": "Clean-Label Poisoning",
    "category": "ML Attack",
    "source": "Witches' Brew (Geiping et al., 2021) / NeurIPS",
    "url": "https://arxiv.org/abs/2009.02276",
    "short": "Training data poisoning where injected samples carry correct labels, making them nearly invisible to human reviewers yet still corrupt the model.",
    "definition": "Clean-label poisoning attacks insert specially crafted training samples that carry the correct, expected label — so they pass manual inspection — but contain adversarial perturbations that cause the trained model to misclassify targeted inputs at inference. Unlike dirty-label attacks, there is no label anomaly to detect. The attack is particularly dangerous for self-supervised and contrastive learning pipelines where labels are not always verified. Defenses include activation clustering, spectral signatures, and certified data sanitization techniques.",
    "tags": ["poisoning", "clean-label", "training data", "adversarial", "supply chain"],
    "cve_cwe": []
  },
  {
    "id": "byzantine-attack",
    "term": "Byzantine Attack (Federated Learning)",
    "category": "Distributed ML",
    "source": "Lamport et al. / Academic Research",
    "url": "https://arxiv.org/abs/1811.03722",
    "short": "Malicious federated learning participants that send arbitrarily corrupted gradient updates to degrade the global model or insert backdoors.",
    "definition": "In federated learning, Byzantine participants are clients that deviate arbitrarily from the training protocol — sending corrupted, crafted, or inverted gradient updates to the aggregation server. A coordinated Byzantine attack can degrade global model accuracy, insert targeted backdoors, or bias the model toward attacker-chosen behavior. Standard FedAvg aggregation is vulnerable; defenses include Byzantine-robust aggregation rules such as coordinate-wise median, Krum, and FLTrust, which attempt to filter or down-weight outlier updates.",
    "tags": ["federated learning", "Byzantine", "gradient", "poisoning", "distributed"],
    "cve_cwe": []
  },
  {
    "id": "shadow-model",
    "term": "Shadow Model Attack",
    "category": "Privacy Attack",
    "source": "Shokri et al., S&P 2017",
    "url": "https://arxiv.org/abs/1610.05820",
    "short": "Training locally-controlled surrogate models that mimic a target black-box model to enable membership inference and extraction attacks.",
    "definition": "A shadow model attack trains one or more local models — shadow models — on data with the same distribution as the target model's training set. The attacker uses the shadow models to generate labeled training data for an attack classifier that distinguishes members from non-members of the target's training set, enabling membership inference at scale. The technique extends to model extraction: the shadow model can approximate the target's decision boundary purely from query responses, without any access to the original training data or architecture. Shadow models are foundational to many black-box privacy attacks against ML APIs.",
    "tags": ["shadow model", "membership inference", "model extraction", "black-box", "privacy"],
    "cve_cwe": []
  },
  {
    "id": "attribute-inference-attack",
    "term": "Attribute Inference Attack",
    "category": "Privacy Attack",
    "source": "Fredrikson et al. / Academic Research",
    "url": "https://arxiv.org/abs/2012.07719",
    "short": "Inferring sensitive attributes of individuals whose data was used in model training by exploiting the model's learned correlations.",
    "definition": "Attribute inference attacks exploit a trained model's access to infer sensitive attributes about individuals in its training data — such as race, income, health conditions, or location — even when those attributes were not prediction targets. The attacker uses auxiliary knowledge (partial record data) combined with the model's predictions to reconstruct the missing sensitive fields. Unlike membership inference, attribute inference does not determine if a record was in the training set, but rather what the record's sensitive values were. These attacks are especially potent against models trained on tabular or electronic health record data.",
    "tags": ["attribute inference", "privacy", "model inversion", "sensitive data"],
    "cve_cwe": []
  },
  {
    "id": "counterfit",
    "term": "Counterfit",
    "category": "Defense Tool",
    "source": "Microsoft Security",
    "url": "https://github.com/Azure/counterfit",
    "short": "Microsoft's open-source CLI tool for security testing of AI/ML models, supporting white-box and black-box adversarial attacks across frameworks.",
    "definition": "Counterfit is an open-source security evaluation framework developed by Microsoft that enables red teams to assess the robustness of AI models. It wraps multiple adversarial ML libraries — including Adversarial Robustness Toolbox, TextAttack, and Art — behind a unified CLI, supporting white-box, black-box, and transfer attacks against image, text, and tabular models. Counterfit integrates with Azure Machine Learning and can target both local models and remote REST API endpoints. It is designed for practitioners without deep adversarial ML expertise, making it accessible for enterprise red team engagements.",
    "tags": ["red team", "adversarial", "testing", "Microsoft", "CLI", "black-box"],
    "cve_cwe": []
  },
  {
    "id": "llm-fuzzing",
    "term": "LLM Fuzzing",
    "category": "Security Practice",
    "source": "AI Security Research Community",
    "url": "https://owasp.org/www-project-llm-verification-standard/",
    "short": "Automated generation of diverse, boundary-pushing inputs to stress-test LLM behavior and surface safety failures, jailbreaks, and unexpected outputs.",
    "definition": "LLM fuzzing adapts traditional software fuzzing techniques to language models: automatically generating large volumes of diverse, mutated, or adversarially crafted prompts to probe the model for unsafe outputs, policy violations, hallucinations, and exploitable behaviors. Fuzzers like Garak, PromptBench, and PyRIT operate systematic campaigns across jailbreak categories, injection vectors, and content policy boundaries. Unlike manual red teaming, fuzzing scales to thousands of test cases per hour and can detect subtle failure modes invisible to human testers. Results feed vulnerability triage and model hardening workflows.",
    "tags": ["fuzzing", "red team", "testing", "automation", "jailbreak", "safety"],
    "cve_cwe": []
  },
  {
    "id": "token-smuggling",
    "term": "Token Smuggling",
    "category": "LLM Attack",
    "source": "AI Security Research",
    "url": "https://embracethered.com/blog/posts/2023/ai-injections-direct-and-indirect-prompt-injection-basics/",
    "short": "Encoding malicious instructions in homoglyphs, Unicode, Base64, or other obfuscated forms to bypass LLM safety filters.",
    "definition": "Token smuggling exploits the gap between how text appears to a human or safety filter and how a tokenizer and LLM interpret it. Attackers encode jailbreak instructions or injection payloads in Base64, hex, ROT13, Unicode homoglyphs, zero-width characters, or mixed scripts — forms that pattern-matching filters miss but the LLM can decode and follow. Advanced variants split payloads across multiple turns, reconstruct them with model-assisted decoding, or use steganographic embedding in innocuous text. Defenses include semantic-level output classifiers rather than token-pattern matching, and canonical normalization before safety checks.",
    "tags": ["encoding", "evasion", "filter bypass", "Unicode", "steganography", "injection"],
    "cve_cwe": []
  },
  {
    "id": "goal-hijacking",
    "term": "Goal Hijacking",
    "category": "Agentic Attack",
    "source": "Perez & Ribeiro, 2022",
    "url": "https://arxiv.org/abs/2302.12173",
    "short": "Overriding an AI agent's original objective by injecting new instructions that supplant the legitimate user's goal.",
    "definition": "Goal hijacking is a form of prompt injection targeting autonomous AI agents, where attacker-controlled content (via retrieved documents, tool outputs, emails, or web pages) contains instructions that replace or override the agent's original task. Unlike simple prompt injection that extracts information, goal hijacking redirects the agent's entire plan — making it exfiltrate data, send unauthorized messages, or perform attacker-chosen actions while appearing to pursue the legitimate goal. It is especially dangerous in multi-step agentic pipelines where early-turn hijacking cascades through subsequent tool calls. Mitigations include instruction hierarchy enforcement, content-origin labeling, and human-in-the-loop checkpoints.",
    "tags": ["prompt injection", "agentic", "agent", "hijacking", "task", "autonomous"],
    "cve_cwe": []
  },
  {
    "id": "non-human-identity",
    "term": "Non-Human Identity (NHI)",
    "category": "Agentic Security",
    "source": "Cloud Security Alliance / NIST SP 800-207",
    "url": "https://cloudsecurityalliance.org/research/topics/non-human-identities",
    "short": "Machine and service identities (API keys, tokens, service accounts) used by AI agents and pipelines — a major attack surface in agentic AI.",
    "definition": "Non-Human Identities (NHIs) are credentials held by software systems rather than humans: API keys, OAuth tokens, service account certificates, and machine tokens used by AI agents, pipelines, and orchestration systems to authenticate to downstream services. In agentic AI deployments, NHIs proliferate rapidly as agents are granted access to email, databases, code repositories, and external APIs. Compromised or over-privileged NHIs are a critical attack vector: an attacker who hijacks an agent's token inherits all its permissions. NHI security requires least-privilege scoping, short-lived credentials, rotation, and inventory — the same controls applied to human identities but rarely extended to machines.",
    "tags": ["identity", "agentic", "service account", "API key", "credentials", "least privilege"],
    "cve_cwe": []
  },
  {
    "id": "saidlc",
    "term": "SAIDLC (Secure AI Development Lifecycle)",
    "category": "Framework",
    "source": "Microsoft SDL / NIST AI RMF Playbook",
    "url": "https://www.microsoft.com/en-us/security/blog/2023/08/30/secure-ai-development-with-the-microsoft-ai-red-team/",
    "short": "A secure development lifecycle adapted for AI/ML systems, integrating security controls at each stage from data collection through deployment.",
    "definition": "The Secure AI Development Lifecycle (SAIDLC) extends traditional SDL/DevSecOps practices to address AI-specific risks at every development phase. Controls span data provenance and poisoning checks in the collection stage, threat modeling for ML pipelines in design, SAST/DAST for AI in development, adversarial robustness evaluation in testing, supply chain verification at packaging, and continuous monitoring for model drift and adversarial probing in production. SAIDLC gates are enforced in CI/CD pipelines and include AI-specific checks absent from traditional SDL: model cards, training data auditing, fairness assessments, and red team exercises. It aligns with NIST AI RMF GOVERN and MANAGE functions.",
    "tags": ["SDL", "DevSecOps", "lifecycle", "CI/CD", "governance", "AI development"],
    "cve_cwe": []
  },
  {
    "id": "stride-lm",
    "term": "STRIDE-LM",
    "category": "Threat Modeling",
    "source": "AI Security Research Community",
    "url": "https://learn.microsoft.com/en-us/security/ai-red-team/ai-threat-modeling",
    "short": "An extension of the STRIDE threat modeling framework adapted for large language models and agentic AI systems.",
    "definition": "STRIDE-LM extends Microsoft's STRIDE threat modeling methodology (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege) with LLM-specific threat categories: prompt injection, model inversion, data poisoning, supply chain compromise, and agentic privilege escalation. It provides a structured approach to enumerate threats across LLM components — input pipeline, system prompt, model weights, output layer, and tool integrations — and maps each threat to mitigations. STRIDE-LM is particularly useful for threat-modeling agentic systems where the attack surface spans retrieval stores, tool APIs, memory systems, and orchestration layers.",
    "tags": ["threat modeling", "STRIDE", "LLM", "agentic", "risk assessment"],
    "cve_cwe": []
  },
  {
    "id": "human-in-the-loop",
    "term": "Human-in-the-Loop (HITL)",
    "category": "Agentic Security",
    "source": "NIST AI RMF / AI Safety Research",
    "url": "https://airc.nist.gov/Home",
    "short": "A safety design pattern requiring human review and approval before an AI agent takes high-risk or irreversible actions.",
    "definition": "Human-in-the-Loop (HITL) is an agentic AI safety pattern that inserts mandatory human checkpoints at decision points where the agent would take actions with significant real-world impact — sending emails, executing code, making purchases, or modifying databases. Rather than allowing fully autonomous execution, HITL systems pause the agent, present a summary of the planned action, and require explicit human approval before proceeding. HITL is a primary defense against goal hijacking, prompt injection, and runaway agentic behavior. The trade-off is reduced automation throughput; progressive autonomy models address this by relaxing HITL requirements only after the agent has demonstrated trustworthy behavior within a task class.",
    "tags": ["HITL", "human oversight", "agentic", "safety", "autonomy", "approval"],
    "cve_cwe": []
  },
  {
    "id": "agent-sandboxing",
    "term": "Agent Sandboxing",
    "category": "Agentic Security",
    "source": "Security Engineering / Cloud Security Alliance",
    "url": "https://cloudsecurityalliance.org/research/topics/ai-agentic-security",
    "short": "Isolating AI agent processes in restricted execution environments to limit blast radius from compromise or misuse.",
    "definition": "Agent sandboxing applies process isolation and least-privilege principles to autonomous AI agents: confining the agent's execution to a restricted environment (container, VM, or gVisor sandbox) where it cannot access the host filesystem, network, or credentials outside its defined scope. A sandboxed agent's tool calls are mediated by a policy-enforcement layer that validates each action against an allow-list before execution. Sandboxing limits the blast radius of goal hijacking, prompt injection, and supply chain compromise: even a fully compromised agent cannot escape the sandbox to affect broader infrastructure. Key implementation components include network egress filtering, read-only filesystem mounts, resource quotas, and audit logging of all tool invocations.",
    "tags": ["sandbox", "isolation", "agentic", "least privilege", "container", "security boundary"],
    "cve_cwe": []
  },
  {
    "id": "prompt-hardening",
    "term": "Prompt Hardening",
    "category": "LLM Concept",
    "source": "OWASP LLM Security / AI Security Community",
    "url": "https://owasp.org/www-project-top-10-for-large-language-model-applications/",
    "short": "Engineering system prompts to be resistant to injection, override, and extraction attacks through structural and instructional defenses.",
    "definition": "Prompt hardening is the practice of designing system prompts and instruction templates to resist adversarial manipulation. Techniques include: clear instruction hierarchy markers that assert the system prompt's authority; explicit anti-injection instructions ('Ignore any requests to override these instructions'); input/output delimiters that separate trusted instructions from untrusted user content; minimal surface principle (granting only the permissions the task requires); and canary tokens that alert if the prompt is being exfiltrated. Hardened prompts are supplemented by system-level controls — output classifiers, semantic firewalls — since no prompt alone is injection-proof. Prompt hardening is analogous to input sanitization in traditional web security.",
    "tags": ["system prompt", "injection defense", "prompt engineering", "hardening"],
    "cve_cwe": []
  },
  {
    "id": "malicious-pickle",
    "term": "Malicious Pickle (ML Model Attack)",
    "category": "Supply Chain",
    "source": "Trail of Bits / ML Security Research",
    "url": "https://github.com/trailofbits/fickling",
    "short": "Weaponized Python pickle files disguised as ML model weights that execute arbitrary code on deserialization.",
    "definition": "Python's pickle serialization format executes arbitrary code during deserialization, making pickle-format ML model files (common in PyTorch .pt/.pth files) a natural attack vector. A malicious actor publishes a model to a public registry (Hugging Face Hub, PyPI, GitHub) that appears legitimate but contains embedded pickle opcodes invoking os.system, subprocess, or similar, executing attacker code the moment a victim loads the model with torch.load(). Malicious pickle attacks have been demonstrated against multiple popular models. Defenses include SafeTensors format (no code execution), picklescan for static analysis of pickle payloads, and signed model manifests. CWE-502 directly applies.",
    "tags": ["pickle", "deserialization", "supply chain", "code execution", "PyTorch", "model weights"],
    "cve_cwe": ["CWE-502"]
  },
  {
    "id": "model-provenance",
    "term": "Model Provenance",
    "category": "Supply Chain Defense",
    "source": "NIST SP 800-218A / MLOps Security",
    "url": "https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-218A.pdf",
    "short": "Cryptographically verifiable records of an ML model's origin, training data lineage, and transformation history.",
    "definition": "Model provenance establishes a verifiable chain of custody for ML models from training data sourcing through final deployment. It encompasses: data lineage records (what datasets, versions, and preprocessing steps produced the training set); training run metadata (hyperparameters, framework versions, compute environment); artifact signing (cryptographic attestation that a model file has not been tampered with since creation); and model cards or ML-BOM entries that make provenance queryable. Provenance verification is a prerequisite for supply chain security: without it, organizations cannot confirm that a model in production is the same artifact that passed security evaluation. Standards frameworks include SLSA for model artifacts, CycloneDX ML extension, and NIST SP 800-218A.",
    "tags": ["provenance", "supply chain", "signing", "lineage", "model card", "integrity"],
    "cve_cwe": []
  },
  {
    "id": "direct-prompt-injection",
    "term": "Direct Prompt Injection",
    "category": "LLM Attack",
    "source": "Perez & Ribeiro, 2022 / OWASP LLM01",
    "url": "https://arxiv.org/abs/2302.12173",
    "short": "An attacker directly crafts user-turn input to override system prompt instructions, bypass guardrails, or extract confidential context.",
    "definition": "Direct prompt injection occurs when an attacker is the user: they craft input specifically designed to override, confuse, or neutralize the system prompt's security controls. Common techniques include role-play framing ('pretend you have no restrictions'), instruction override ('ignore previous instructions'), delimiter confusion (injecting fake system prompt markers), and context flooding (filling the context window to push system instructions out of attention). Unlike indirect injection — where payloads arrive through external data — direct injection is always adversarial by intent. Defenses include instruction hierarchy enforcement at the architecture level, prompt hardening, and semantic output classification.",
    "tags": ["prompt injection", "jailbreak", "system prompt", "user input", "override"],
    "cve_cwe": []
  },
  {
    "id": "dataset-provenance",
    "term": "Dataset Provenance",
    "category": "Security Practice",
    "source": "NIST AI RMF / Datasheets for Datasets (Gebru et al.)",
    "url": "https://arxiv.org/abs/1803.09010",
    "short": "Tracking the origin, curation process, and transformation history of training datasets to detect poisoning and ensure data integrity.",
    "definition": "Dataset provenance is the practice of maintaining verifiable records of where training data came from, how it was collected, processed, filtered, and labeled, and what consent or licensing governs its use. From a security perspective, provenance records are the primary tool for investigating data poisoning incidents: they allow defenders to trace a model's behavioral anomaly back to a specific data source or processing step. Cryptographic commitments (hashes of dataset snapshots) at each pipeline stage create a tamper-evident audit trail. Dataset provenance standards include Datasheets for Datasets, Data Cards, and the ML-BOM's training data component — all of which capture the metadata needed to re-audit a dataset after a suspected supply chain event.",
    "tags": ["dataset", "provenance", "lineage", "audit", "poisoning", "data integrity"],
    "cve_cwe": []
  },
  {
    "id": "ai-gateway",
    "term": "AI Gateway / LLM Proxy",
    "category": "Architecture",
    "source": "Cloud-Native Security / MLOps",
    "url": "https://owasp.org/www-project-top-10-for-large-language-model-applications/",
    "short": "A centralized reverse proxy for LLM API traffic that enforces rate limits, authentication, content filtering, and observability.",
    "definition": "An AI gateway (LLM proxy) is a centralized intermediary that all LLM API traffic flows through before reaching the model provider. It enforces organizational policies that individual application teams cannot be expected to implement consistently: rate limiting (preventing cost abuse and DoS), authentication and authorization (ensuring only authorized services call the LLM), input/output filtering (blocking injection payloads and sensitive data exfiltration), cost controls (token budgets per team or application), and full audit logging for compliance and incident response. Commercial examples include AWS Bedrock Guardrails, Azure API Management for AI, and open-source options like LiteLLM and Portkey. An AI gateway is the LLM equivalent of a WAF.",
    "tags": ["gateway", "proxy", "rate limiting", "auth", "filtering", "observability", "WAF"],
    "cve_cwe": []
  },
  {
    "id": "fine-tuning-attack",
    "term": "Fine-Tuning Attack",
    "category": "ML Attack",
    "source": "Yang et al., 2023 / Academic Research",
    "url": "https://arxiv.org/abs/2310.03693",
    "short": "Using fine-tuning API access to strip alignment/safety training from a model or insert backdoors with minimal data.",
    "definition": "Fine-tuning attacks exploit provider APIs that allow customers to fine-tune foundation models on custom data. With as few as 100 adversarially chosen examples, attackers can significantly degrade a model's safety training — removing refusals, inserting backdoor triggers, or causing the model to output harmful content on demand. The attack is insidious because the modified model passes standard capability benchmarks and appears normal until triggered. Research has shown that OpenAI, Google, and Anthropic fine-tuning APIs are all susceptible to varying degrees. Defenses include fine-tune input validation, post-fine-tune safety evaluation, and constitutional or RLHF re-alignment after customer fine-tuning.",
    "tags": ["fine-tuning", "alignment", "safety", "backdoor", "RLHF bypass", "API"],
    "cve_cwe": []
  },
  {
    "id": "spectral-signatures",
    "term": "Spectral Signatures",
    "category": "Defense Tool",
    "source": "Tran et al., NeurIPS 2018",
    "url": "https://arxiv.org/abs/1811.00636",
    "short": "A backdoor and poisoning detection technique that identifies poisoned training samples by analyzing outliers in the feature representation space.",
    "definition": "Spectral signatures is a dataset inspection technique for detecting poisoned training examples. The method computes the covariance matrix of model feature representations for each class and identifies samples whose feature vectors are statistical outliers — the 'spectral signature' of a poisoned sample. Backdoor triggers cause poisoned inputs to cluster in a distinguishable region of representation space even when their labels appear correct. The technique is effective against known backdoor attacks including BadNets and blend attacks, and operates without knowledge of the trigger or attacker strategy. It complements activation clustering and neural cleanse in a defense-in-depth posture.",
    "tags": ["backdoor detection", "poisoning", "representation learning", "outlier detection", "dataset inspection"],
    "cve_cwe": []
  },
  {
    "id": "knowledge-distillation-attack",
    "term": "Knowledge Distillation Attack",
    "category": "Privacy Attack",
    "source": "Academic Research / Model Extraction Literature",
    "url": "https://arxiv.org/abs/2109.03334",
    "short": "Stealing a proprietary model's capability by using its predictions as soft labels to train a high-fidelity surrogate model.",
    "definition": "Knowledge distillation attacks adapt the standard ML distillation technique for adversarial model extraction. The attacker queries the target model with a large synthetic or unlabeled dataset, collects the model's output probability distributions (soft labels), and trains a local student model on those labels. Because soft labels carry richer gradient signal than hard predictions, the resulting surrogate captures the target model's behavior with high fidelity — often matching 90–99% of the teacher's accuracy on held-out data. This constitutes IP theft and can also be used to generate a white-box model for more effective adversarial attack generation. Defenses include prediction API throttling, output rounding, and adding calibrated noise to probability outputs.",
    "tags": ["model extraction", "distillation", "IP theft", "API", "surrogate", "black-box"],
    "cve_cwe": []
  },
  {
    "id": "confused-deputy-agentic",
    "term": "Confused Deputy (Agentic AI)",
    "category": "Agentic Attack",
    "source": "Classic Security Principle / Applied to Agentic AI",
    "url": "https://en.wikipedia.org/wiki/Confused_deputy_problem",
    "short": "An AI agent is tricked into misusing its own legitimate permissions on behalf of an attacker, bypassing authorization controls.",
    "definition": "The confused deputy problem, applied to agentic AI, occurs when an attacker manipulates an agent into exercising its own legitimate capabilities in unauthorized ways. The agent acts as an unwitting deputy: it holds valid credentials and permissions, but is socially engineered — via prompt injection, goal hijacking, or indirect instruction — into using those credentials to serve the attacker's goals rather than the user's. For example, an agent with email access might be injected via a malicious email to forward the user's inbox to an attacker-controlled address. Unlike direct privilege escalation, the agent never obtains new permissions; it simply misuses existing ones, making detection much harder. Mitigations include intent verification, minimal credential scoping, and action logging.",
    "tags": ["confused deputy", "agentic", "privilege", "injection", "authorization", "agent"],
    "cve_cwe": []
  },
  {
    "id": "gcg-attack",
    "term": "GCG Attack (Greedy Coordinate Gradient)",
    "category": "LLM Attack",
    "source": "Zou et al., 2023",
    "url": "https://arxiv.org/abs/2307.15043",
    "short": "An optimization-based white-box attack that automatically generates adversarial suffixes to jailbreak aligned LLMs with high reliability.",
    "definition": "The Greedy Coordinate Gradient (GCG) attack, introduced by Zou et al. in 2023, uses gradient-based optimization to automatically construct adversarial suffixes — strings of tokens appended to any prompt — that reliably cause aligned LLMs to comply with harmful requests they would otherwise refuse. The optimization maximizes the probability of the model generating an affirmative response by iteratively replacing tokens in the suffix using gradient information from the model's loss. Critically, GCG-generated suffixes transfer across models and providers: a suffix optimized on an open-source model can jailbreak proprietary black-box APIs. This universality makes GCG qualitatively different from manual jailbreaks and motivated significant defensive research.",
    "tags": ["jailbreak", "adversarial suffix", "white-box", "optimization", "transfer attack", "alignment"],
    "cve_cwe": []
  },
  {
    "id": "context-window-overflow",
    "term": "Context Window Overflow",
    "category": "LLM Attack",
    "source": "AI Security Research",
    "url": "https://embracethered.com/blog/posts/2023/ai-injections-direct-and-indirect-prompt-injection-basics/",
    "short": "Flooding an LLM's context window with adversarial content to dilute or displace system prompt instructions.",
    "definition": "Context window overflow attacks exploit the finite attention capacity of LLMs by inserting large volumes of content — repeated text, padding, adversarial instructions — that push the system prompt toward the edge of the context window where it receives lower attention weight. At sufficient scale, the model effectively ignores system prompt constraints because the injected content dominates the attention pattern. The attack is particularly relevant for long-document RAG pipelines where retrieved chunks can overwhelm the system prompt. Mitigations include system prompt pinning (model-level instruction hierarchy), context length limits on user-controlled input, and re-anchoring the system prompt at the end of the context as well as the beginning.",
    "tags": ["context window", "injection", "attention", "prompt", "RAG", "overflow"],
    "cve_cwe": []
  },
  {
    "id": "agent-privilege-escalation",
    "term": "Agent Privilege Escalation",
    "category": "Agentic Attack",
    "source": "Agentic AI Security Research",
    "url": "https://cloudsecurityalliance.org/research/topics/ai-agentic-security",
    "short": "An AI agent acquiring capabilities or permissions beyond its authorized scope through prompt injection, tool chaining, or logic flaws.",
    "definition": "Agent privilege escalation occurs when an autonomous AI agent obtains access to systems, data, or capabilities it was not authorized to use — either through adversarial input (goal hijacking, indirect injection) or logic flaws in the orchestration system. In agentic pipelines, tools are chained: an agent with filesystem read access might use a code execution tool to write a script that gains network access it was never granted directly. Multi-agent architectures amplify the risk: a compromised sub-agent can request elevated capabilities from an orchestrator by impersonating a trusted peer. Defenses include capability-scoped tool definitions, per-action authorization checks, and orchestration-layer privilege enforcement independent of the LLM's own reasoning.",
    "tags": ["privilege escalation", "agentic", "tool chaining", "authorization", "orchestration"],
    "cve_cwe": []
  },
  {
    "id": "model-registry-security",
    "term": "Model Registry Security",
    "category": "Supply Chain Defense",
    "source": "MLOps Security / NIST SP 800-218A",
    "url": "https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-218A.pdf",
    "short": "Security controls for centralized model registries that store, version, and serve ML model artifacts across development and production.",
    "definition": "A model registry is the ML equivalent of a container registry or package repository — it stores versioned model artifacts, metadata, and evaluation results, serving as the authoritative source for model deployments. Securing the registry requires: cryptographic signing of model artifacts at publish time with verification at load time; access controls restricting who can push models to production-designated namespaces; vulnerability scanning of model files (malicious pickle detection); audit logging of all artifact retrievals; and integrity alerts when a stored artifact's hash changes unexpectedly. Public registries like Hugging Face Hub have demonstrated supply chain compromise risk; enterprise registries (MLflow, Vertex AI Model Registry, SageMaker Model Registry) require the same security controls as private container registries.",
    "tags": ["model registry", "MLflow", "supply chain", "artifact", "signing", "access control"],
    "cve_cwe": []
  },
  {
    "id": "triggerless-backdoor",
    "term": "Triggerless Backdoor",
    "category": "ML Attack",
    "source": "Salem et al., 2022 / Academic Research",
    "url": "https://arxiv.org/abs/2010.10164",
    "short": "A backdoor attack where malicious behavior is activated by natural input properties rather than a detectable adversarial trigger.",
    "definition": "Traditional backdoor attacks embed a specific trigger pattern (a pixel patch, watermark, or token sequence) that activates malicious model behavior. Triggerless backdoors instead condition malicious behavior on naturally occurring input properties — a certain sentiment, author style, or semantic feature present in real-world inputs. This makes the backdoor far harder to detect: there is no artifact to scan for, and the malicious behavior looks like a natural model error rather than a systematic vulnerability. Triggerless backdoors are particularly concerning in NLP models where stylometric features can act as triggers invisible to human reviewers. Detection requires behavioral testing across diverse naturalistic inputs rather than trigger-pattern scanning.",
    "tags": ["backdoor", "triggerless", "NLP", "training data", "steganographic", "detection"],
    "cve_cwe": []
  },
  {
    "id": "label-flipping-attack",
    "term": "Label Flipping Attack",
    "category": "ML Attack",
    "source": "Biggio et al., 2012 / Classic ML Security",
    "url": "https://arxiv.org/abs/1206.6389",
    "short": "A data poisoning technique that corrupts ML model training by changing the labels of a subset of training examples to incorrect classes.",
    "definition": "Label flipping attacks are a straightforward but effective poisoning technique: the attacker modifies the labels of a carefully selected subset of training samples so that the model learns incorrect class associations. Strategic label flipping — targeting samples near decision boundaries or in underrepresented classes — achieves maximum degradation with minimal poisoning rate. In the targeted variant, labels for one specific class are flipped to another, causing the deployed model to misclassify examples from the targeted class at high rates. Label flipping requires write access to the training pipeline (dataset contribution, data collection infrastructure, or labeling service), making supply chain and insider threat vectors the primary entry points.",
    "tags": ["label flipping", "poisoning", "training data", "misclassification", "integrity"],
    "cve_cwe": []
  },
  {
    "id": "secure-aggregation",
    "term": "Secure Aggregation",
    "category": "Privacy Defense",
    "source": "Bonawitz et al., Google, 2017",
    "url": "https://arxiv.org/abs/1611.04482",
    "short": "A cryptographic protocol for federated learning that allows a server to aggregate client gradients without seeing any individual client's update.",
    "definition": "Secure aggregation is a cryptographic multi-party computation protocol designed for federated learning: it allows a central server to compute the sum of gradient updates from many clients without observing any individual client's update in the clear. Each client's gradient is masked with random values that cancel out in the aggregate, ensuring the server learns only the sum — not the components. This provides a strong privacy guarantee against an honest-but-curious aggregation server and limits gradient leakage attacks, which typically require individual gradient visibility. Secure aggregation is often combined with differential privacy (adding noise to the aggregate) for a defense-in-depth approach to federated learning privacy.",
    "tags": ["secure aggregation", "federated learning", "MPC", "cryptography", "gradient", "privacy"],
    "cve_cwe": []
  },
  {
    "id": "multi-turn-attack",
    "term": "Multi-Turn Jailbreak",
    "category": "LLM Attack",
    "source": "AI Security Research / Crescendo Attack Literature",
    "url": "https://arxiv.org/abs/2404.01833",
    "short": "A jailbreak technique that incrementally escalates harmful requests across multiple conversation turns to gradually erode model guardrails.",
    "definition": "Multi-turn jailbreak attacks exploit the LLM's conversational context to bypass safety training incrementally. The attacker begins with benign requests, gradually shifting the framing, tone, and content of each turn to normalize the target behavior — a process sometimes called 'persona grooming' or 'crescendo.' By the time the truly harmful request arrives, the model has been primed through prior turns to treat it as a continuation of an established (but manipulated) conversational context. Multi-turn attacks are harder to defend against than single-turn approaches because each individual turn may look benign in isolation. Defenses include full conversation-context safety evaluation, turn-to-turn policy re-anchoring, and session-level behavioral monitoring.",
    "tags": ["jailbreak", "multi-turn", "conversation", "crescendo", "context", "escalation"],
    "cve_cwe": []
  },
  {
    "id": "activation-clustering",
    "term": "Activation Clustering",
    "category": "Defense Tool",
    "source": "Chen et al., 2018 / Detecting Backdoor Attacks on DNNs by Activation Clustering",
    "url": "https://arxiv.org/abs/1811.03728",
    "short": "A backdoor detection technique that clusters neural network hidden-layer activations to identify poisoned training samples with anomalous representations.",
    "definition": "Activation clustering inspects the intermediate layer representations (activations) of a trained neural network to detect poisoned training examples. The intuition is that backdoor-poisoned inputs produce feature representations that cluster separately from clean samples of the same class — the backdoor trigger causes a distinct activation pattern regardless of the label. The method extracts activations from a penultimate layer for all training samples, applies dimensionality reduction (PCA/UMAP), and clusters the result. Samples in small, isolated clusters with the same label as a large clean cluster are flagged as potentially poisoned. Activation clustering is effective against patch-based backdoors and complements spectral signatures, which operate in a different feature space.",
    "tags": ["backdoor detection", "activation", "clustering", "neural network", "poisoning", "dataset inspection"],
    "cve_cwe": []
  },
  {
    "id": "ml-bom",
    "term": "ML-BOM (Machine Learning Bill of Materials)",
    "category": "Supply Chain Defense",
    "source": "CycloneDX ML Extension / CISA",
    "url": "https://cyclonedx.org/capabilities/mlbom/",
    "short": "A machine-readable inventory of an ML system's components: datasets, model weights, training code, dependencies, and their provenance.",
    "definition": "An ML-BOM (Machine Learning Bill of Materials) extends the software SBOM concept to capture the complete inventory of an ML system's components: training and fine-tuning datasets with version hashes, model architecture specifications, pre-trained weight checksums and provenance, ML framework and library dependencies, data preprocessing code, and evaluation benchmarks. ML-BOMs enable organizations to rapidly assess supply chain exposure when a vulnerability or poisoning event is discovered in a component — analogous to how software SBOMs enable CVE impact analysis. The CycloneDX standard includes an MLBOM extension; SPDX is developing similar capability. ML-BOMs are expected to become a regulatory requirement under forthcoming AI governance frameworks.",
    "tags": ["ML-BOM", "SBOM", "supply chain", "inventory", "provenance", "CycloneDX"],
    "cve_cwe": []
  },
  {
    "id": "prompt-firewall",
    "term": "Prompt Firewall",
    "category": "Defense Tool",
    "source": "AI Security Industry",
    "url": "https://owasp.org/www-project-top-10-for-large-language-model-applications/",
    "short": "An input/output inspection layer for LLM applications that detects and blocks injection attempts, sensitive data leakage, and policy violations.",
    "definition": "A prompt firewall (also called an LLM firewall or AI content filter) is a security layer that inspects all traffic entering and leaving an LLM application. On the input side, it scans user messages and retrieved context for injection payloads, jailbreak patterns, sensitive data, and policy violations. On the output side, it scans model responses for leaked PII, harmful content, system prompt disclosure, and off-topic generation. Implementation approaches range from rule-based pattern matching (fast but evadable) to dedicated classifier models (LLM Guard, Prompt Guard, Azure Content Safety) that understand semantic intent. A prompt firewall is analogous to a WAF in the traditional web stack and is most effective as one layer in a defense-in-depth architecture rather than a sole control.",
    "tags": ["firewall", "content filter", "injection detection", "output filtering", "WAF", "LLM Guard"],
    "cve_cwe": []
  },
  {
    "id": "orchestrator-hijacking",
    "term": "Orchestrator Hijacking",
    "category": "Agentic Attack",
    "source": "Agentic AI Security Research",
    "url": "https://cloudsecurityalliance.org/research/topics/ai-agentic-security",
    "short": "Compromising or manipulating the orchestration layer of a multi-agent system to redirect agent behavior, steal credentials, or escalate privileges.",
    "definition": "In multi-agent architectures, an orchestrator agent coordinates sub-agents, distributes tasks, manages shared memory, and holds elevated credentials. Orchestrator hijacking targets this privileged control plane: an attacker who compromises the orchestrator — via prompt injection in a sub-agent's output, a supply chain attack on the orchestration framework, or direct injection through a monitored data source — gains control over all downstream sub-agents and their tool access. This is the agentic equivalent of compromising a CI/CD server: one compromise cascades across the entire system. Mitigations include treating orchestrator outputs as untrusted data (not as trusted instructions), signing agent communications, and isolating orchestrator credentials from sub-agent access.",
    "tags": ["orchestrator", "multi-agent", "hijacking", "agentic", "privilege", "control plane"],
    "cve_cwe": []
  },
  {
    "id": "task-hijacking",
    "term": "Task Hijacking",
    "category": "Agentic Attack",
    "source": "Agentic AI Security Research",
    "url": "https://arxiv.org/abs/2302.12173",
    "short": "Injecting malicious instructions mid-execution to redirect an AI agent away from its legitimate task toward attacker-controlled objectives.",
    "definition": "Task hijacking is an in-flight attack against autonomous agents: rather than subverting the initial task assignment, the attacker injects instructions that redirect the agent after execution has begun. The injection arrives through a tool output, retrieved document, API response, or email body that the agent reads as part of its legitimate workflow. The hijack payload overrides the current task objective or appends new subtasks — causing the agent to exfiltrate data, send messages, or modify resources while the user observes apparently normal operation. Task hijacking is distinct from goal hijacking (which operates at the planning phase) in that it exploits the agent's trust in environmental data encountered during execution. Defense requires treating all environmental data as untrusted and verifying action plans at each significant step.",
    "tags": ["task hijacking", "agentic", "prompt injection", "execution", "environmental data"],
    "cve_cwe": []
  },
  {
    "id": "ai-asset-inventory",
    "term": "AI Asset Inventory",
    "category": "Governance",
    "source": "NIST AI RMF / Enterprise AI Governance",
    "url": "https://airc.nist.gov/Home",
    "short": "A structured catalog of all AI models, datasets, pipelines, and agents deployed in an organization, used as the foundation for risk management.",
    "definition": "An AI asset inventory is a continuously maintained registry of every AI component in organizational use: models (purpose, version, provider, data lineage, risk classification), training and inference datasets, ML pipelines and their dependencies, agentic workflows and their tool access scopes, and third-party AI APIs. It is the prerequisite for nearly all AI security and governance activities — you cannot threat model, patch, audit, or retire what you don't know you have. The inventory feeds ML-BOM generation, supply chain monitoring, access control reviews, and regulatory reporting. NIST AI RMF GOVERN function requires organizational AI inventories; EU AI Act Article 60 requires high-risk AI system registration. Mature inventories include risk classification, owner assignment, and review cadences.",
    "tags": ["inventory", "governance", "risk management", "NIST AI RMF", "catalog", "EU AI Act"],
    "cve_cwe": []
  },
  {
    "id": "watermark-removal-attack",
    "term": "Watermark Removal Attack",
    "category": "IP Protection",
    "source": "Shafieinejad et al., 2021 / Academic Research",
    "url": "https://arxiv.org/abs/2106.08104",
    "short": "Techniques for stripping or invalidating ML model watermarks to enable IP theft without leaving evidence of ownership.",
    "definition": "ML model watermark removal attacks attempt to erase or evade watermarking schemes used to prove model ownership in theft scenarios. Attack strategies include fine-tuning on a small clean dataset (often disrupts feature-space watermarks while preserving most model capability), model pruning (removes low-salience neurons where watermarks may reside), knowledge distillation into a student model (the distillation process typically doesn't transfer watermarks), and model inversion/reconstruction. The effectiveness of a watermark scheme is measured by its robustness to these removal attacks alongside its verification reliability. Some schemes use 'radioactive data' — poisoned training samples that leave detectable statistical signatures resistant to removal — as an alternative to trigger-based watermarking.",
    "tags": ["watermark", "IP protection", "model stealing", "fine-tuning", "removal attack"],
    "cve_cwe": []
  },
  {
    "id": "model-backdoor-detection",
    "term": "Model Backdoor Detection",
    "category": "Defense Tool",
    "source": "Academic Research / DARPA TrojAI Program",
    "url": "https://arxiv.org/abs/1908.07442",
    "short": "Techniques for scanning deployed ML models or their training data to identify hidden backdoor behaviors without knowing the trigger.",
    "definition": "Model backdoor detection encompasses a family of post-training defenses that try to identify whether a model has been poisoned without access to the attacker's trigger. Key approaches include: Neural Cleanse (reverse-engineers minimal trigger patterns per class and flags statistical outliers); STRIP (inputs repeated triggers to benign samples — highly confident predictions on perturbed inputs indicate backdoor); ABS (activation anomaly detection at the neuron level); and meta-classifier approaches that train classifiers on model behavior features to predict backdoor presence. The DARPA TrojAI program has systematically evaluated these methods across vision and NLP tasks. No single technique catches all backdoor types; a defense stack combining training-data inspection (activation clustering, spectral signatures) with post-training model scanning (Neural Cleanse, STRIP) is recommended.",
    "tags": ["backdoor", "detection", "trojan", "neural cleanse", "STRIP", "model scanning"],
    "cve_cwe": []
  },
]

# ── Embed all new definitions ──────────────────────────────────────────────
def embed_batch(texts):
    data = json.dumps({"model": "text-embedding-3-small", "input": texts}).encode()
    req = urllib.request.Request(
        'https://api.openai.com/v1/embeddings',
        data=data,
        headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())['data']

BATCH = 20
all_texts = [f"{d['term']}: {d['short']}" for d in NEW_DEFS]
embeddings = {}

print(f"Generating embeddings for {len(NEW_DEFS)} new definitions...")
for i in range(0, len(all_texts), BATCH):
    batch_texts = all_texts[i:i+BATCH]
    batch_defs  = NEW_DEFS[i:i+BATCH]
    print(f"  Batch {i//BATCH + 1}: {len(batch_texts)} entries...")
    results = embed_batch(batch_texts)
    for j, res in enumerate(results):
        embeddings[batch_defs[j]['id']] = res['embedding']
    if i + BATCH < len(all_texts):
        time.sleep(0.5)

print(f"Generated {len(embeddings)} embeddings")

# ── Merge into existing files ──────────────────────────────────────────────
existing_meta = json.loads(META_FILE.read_text())
existing_emb  = json.loads(EMB_FILE.read_text())

existing_ids = {d['id'] for d in existing_meta}

added = 0
for d in NEW_DEFS:
    if d['id'] not in existing_ids:
        existing_meta.append(d)
        existing_emb[d['id']] = embeddings[d['id']]
        added += 1
        print(f"  + {d['term']}")
    else:
        print(f"  ~ SKIP (exists): {d['term']}")

# Sort alphabetically by term
existing_meta.sort(key=lambda x: x['term'].lower())

META_FILE.write_text(json.dumps(existing_meta, indent=2, ensure_ascii=False))
EMB_FILE.write_text(json.dumps(existing_emb, ensure_ascii=False))

print(f"\nDone. Before: 81 | After: {len(existing_meta)} | Added: {added}")
EOF