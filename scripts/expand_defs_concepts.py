#!/usr/bin/env python3
"""
expand_defs_concepts.py
Adds foundational ML/AI concepts so users searching basic terms get results.
"""
import json, time, urllib.request
from pathlib import Path

ROOT     = Path('/Users/pax/.openclaw/workspace/securebydezign.com')
META_FILE = ROOT / 'data' / 'definitions-meta.json'
EMB_FILE  = ROOT / 'data' / 'definitions-embeddings.json'

dotenv = Path('/Users/pax/.openclaw/workspace/.env.local').read_text()
api_key = next(l.split('=',1)[1].strip() for l in dotenv.splitlines() if l.startswith('OPENAI_API_KEY='))

NEW_DEFS = [
  # ── Foundational ML Concepts ────────────────────────────────────────────
  {
    "id": "model-weights",
    "term": "Model Weights",
    "category": "LLM Concept",
    "source": "Machine Learning Fundamentals",
    "url": "https://en.wikipedia.org/wiki/Artificial_neural_network",
    "short": "The billions of numerical parameters stored inside a trained neural network that encode its learned knowledge and determine its outputs.",
    "definition": "Model weights (also called parameters) are the numerical values that define a trained neural network's behavior. During training, the optimization process adjusts these values — typically billions of floating-point numbers arranged in matrices — to minimize prediction error on the training set. At inference time, inputs are mathematically transformed through layers of weights to produce outputs. When you 'download a model,' you are downloading its weights. From a security perspective, weights are a high-value target: whoever controls the weights controls the model's behavior. Weight files are also an attack vector — malicious weights can execute code (pickle format) or contain embedded backdoors that activate on specific trigger inputs.",
    "tags": ["weights", "parameters", "neural network", "model", "inference", "training"],
    "cve_cwe": []
  },
  {
    "id": "model-weight-trojan",
    "term": "Model Weight Trojan",
    "category": "ML Attack",
    "source": "Dumford & Scheirer, 2020 / Academic Research",
    "url": "https://arxiv.org/abs/1912.02973",
    "short": "A backdoor embedded directly into a model's weight values by an attacker with write access, without requiring a poisoned training run.",
    "definition": "A model weight trojan (or weight-space backdoor) is a backdoor inserted by directly modifying a model's weight values after training — no poisoned data, no training run required. An attacker with write access to the weight file (via supply chain compromise, model registry manipulation, or post-training API access) surgically modifies specific neurons or layers to create trigger-activated malicious behavior. The modification is designed to be functionally invisible: the model performs normally on all inputs except those containing the attacker's trigger. Weight trojans are particularly insidious because data pipeline audits and training-time defenses are completely blind to them. Detection requires behavioral red-teaming and model scanning tools rather than data inspection.",
    "tags": ["trojan", "backdoor", "weights", "supply chain", "post-training", "neural network"],
    "cve_cwe": []
  },
  {
    "id": "neural-network",
    "term": "Neural Network",
    "category": "LLM Concept",
    "source": "Machine Learning Fundamentals",
    "url": "https://en.wikipedia.org/wiki/Artificial_neural_network",
    "short": "A computational model composed of layered nodes that process inputs through learned weight connections to produce outputs.",
    "definition": "An artificial neural network (ANN) is a mathematical model inspired by biological neural architecture, composed of layers of interconnected nodes (neurons). Each connection has an associated weight; inputs are transformed through successive layers of weighted sums and nonlinear activation functions to produce an output. Neural networks learn by adjusting weights to minimize prediction error on training data via gradient descent. Deep neural networks — those with many layers — are the foundation of modern AI: convolutional networks for vision, recurrent networks for sequences, and transformer architectures for language. Understanding neural network structure is essential for security practitioners because the architecture determines the attack surface: which attacks are possible, how backdoors are embedded, and what defenses apply.",
    "tags": ["neural network", "deep learning", "layers", "activation", "architecture"],
    "cve_cwe": []
  },
  {
    "id": "transformer-architecture",
    "term": "Transformer Architecture",
    "category": "LLM Concept",
    "source": "Vaswani et al., 'Attention Is All You Need', NeurIPS 2017",
    "url": "https://arxiv.org/abs/1706.03762",
    "short": "The neural network architecture underpinning virtually all large language models, built on self-attention mechanisms rather than recurrence.",
    "definition": "The transformer is the neural network architecture that powers nearly all modern large language models, introduced by Vaswani et al. in 2017. It processes input tokens in parallel using self-attention — a mechanism that allows each token to attend to all other tokens in the sequence, capturing long-range dependencies efficiently. Transformers consist of stacked encoder and/or decoder blocks, each containing multi-head attention layers and feed-forward networks with layer normalization. From a security perspective, transformer properties matter: the attention mechanism enables indirect prompt injection (distant malicious tokens influence model behavior), the fixed context window creates overflow attack surfaces, and the scale of transformer weights (billions of parameters) makes weight-space trojan insertion and extraction attacks more feasible than on smaller models.",
    "tags": ["transformer", "attention", "LLM", "architecture", "self-attention", "GPT"],
    "cve_cwe": []
  },
  {
    "id": "tokenization",
    "term": "Tokenization",
    "category": "LLM Concept",
    "source": "NLP Fundamentals / Byte-Pair Encoding (Sennrich et al., 2016)",
    "url": "https://arxiv.org/abs/1508.07909",
    "short": "The process of splitting text into subword units (tokens) that an LLM can process — a layer where encoding attacks and filter evasion occur.",
    "definition": "Tokenization converts raw text into sequences of tokens — discrete units (subwords, characters, or words) that an LLM processes. Modern LLMs use algorithms like Byte-Pair Encoding (BPE) or WordPiece to build vocabularies of 32,000–100,000 tokens, splitting rare words into multiple subword pieces. Tokenization is a security-relevant layer: different tokenizers split the same string differently, creating opportunities for token smuggling attacks where adversarial strings look benign to human reviewers or pattern-matching filters but are interpreted maliciously by the model. Tokenizer inconsistencies between a safety classifier and the production LLM — particularly when they use different vocabularies — can allow injections that the classifier misses but the model follows.",
    "tags": ["tokenization", "BPE", "tokens", "subword", "evasion", "filter bypass"],
    "cve_cwe": []
  },
  {
    "id": "inference",
    "term": "Model Inference",
    "category": "LLM Concept",
    "source": "Machine Learning Fundamentals",
    "url": "https://en.wikipedia.org/wiki/Statistical_inference",
    "short": "The process of running a trained model on new inputs to generate predictions or text — the production phase where most attacks are executed.",
    "definition": "Model inference is the process of using a trained ML model to generate outputs on new inputs. Unlike training (which adjusts weights), inference is a forward pass only: the input is transformed through the model's fixed weights to produce a prediction, classification, or generated text. Inference is the primary attack surface for deployed AI systems: prompt injection, jailbreaking, model extraction, membership inference, and denial-of-service attacks all occur at inference time. Inference APIs — endpoints that expose model capabilities over HTTP — must be secured with authentication, rate limiting, input validation, and output filtering. Inference cost also creates a financial attack vector: excessive API calls (sponge attacks, unbounded consumption) can exhaust compute budgets.",
    "tags": ["inference", "API", "forward pass", "prediction", "deployment", "production"],
    "cve_cwe": []
  },
  {
    "id": "gradient",
    "term": "Gradient",
    "category": "LLM Concept",
    "source": "Calculus / Machine Learning Fundamentals",
    "url": "https://en.wikipedia.org/wiki/Gradient_descent",
    "short": "The partial derivatives of a model's loss with respect to its weights, used during training to update parameters — and exploited in several privacy attacks.",
    "definition": "In machine learning, a gradient is the vector of partial derivatives of the loss function with respect to model parameters, computed via backpropagation. Gradients point in the direction of steepest loss increase; gradient descent moves weights in the opposite direction to minimize loss. Gradients are central to several security attacks: gradient inversion attacks reconstruct training data from gradient updates shared in federated learning; gradient-based optimization (GCG attack) generates adversarial suffixes that reliably jailbreak aligned models; and gradient leakage in federated learning allows inference servers to partially reconstruct private client data. Defenses like differential privacy and secure aggregation operate by adding noise to or cryptographically protecting gradients.",
    "tags": ["gradient", "backpropagation", "training", "federated learning", "privacy", "GCG"],
    "cve_cwe": []
  },
  {
    "id": "foundation-model",
    "term": "Foundation Model",
    "category": "LLM Concept",
    "source": "Stanford CRFM / Bommasani et al., 2021",
    "url": "https://arxiv.org/abs/2108.07258",
    "short": "A large model trained on broad data at scale that can be adapted to a wide range of downstream tasks through fine-tuning or prompting.",
    "definition": "A foundation model is a large neural network trained on massive, diverse datasets (web text, code, images, etc.) using self-supervised learning, producing a general-purpose representation that can be adapted to many tasks. GPT-4, Claude, Gemini, Llama, and DALL-E are all foundation models. The foundation model paradigm has significant security implications: a vulnerability or backdoor in a widely-used foundation model propagates to all downstream applications built on it, creating massive supply chain blast radius. The concentration of AI capability in a small number of foundation models from a handful of providers also creates systemic risk — a compromise of a major foundation model could simultaneously affect millions of deployed applications.",
    "tags": ["foundation model", "base model", "pre-training", "transfer learning", "LLM", "supply chain"],
    "cve_cwe": []
  },
  {
    "id": "embedding",
    "term": "Embedding (Vector Representation)",
    "category": "LLM Concept",
    "source": "NLP / Machine Learning Fundamentals",
    "url": "https://en.wikipedia.org/wiki/Word_embedding",
    "short": "A dense numeric vector that represents text, images, or other data in a continuous space where semantic similarity corresponds to geometric proximity.",
    "definition": "An embedding is a fixed-length numeric vector that represents an input (word, sentence, document, image) in a high-dimensional continuous space. Models learn to place semantically similar inputs near each other in this space — enabling similarity search, clustering, and retrieval. In RAG systems, documents are embedded and stored in a vector database; queries are embedded at runtime and matched to the nearest stored vectors. Embeddings are a security surface: an attacker who can inject documents into a vector store can craft embeddings that are retrieved for adversary-chosen queries (RAG poisoning). Embedding models themselves can be inverted to partially reconstruct the text they were trained on, creating a privacy risk when proprietary data is embedded using third-party APIs.",
    "tags": ["embedding", "vector", "semantic search", "RAG", "vector database", "representation"],
    "cve_cwe": []
  },
  {
    "id": "retrieval-augmented-generation",
    "term": "Retrieval-Augmented Generation (RAG)",
    "category": "LLM Concept",
    "source": "Lewis et al., Meta AI, NeurIPS 2020",
    "url": "https://arxiv.org/abs/2005.11401",
    "short": "An architecture that augments LLM responses by retrieving relevant documents from a knowledge store and injecting them into the prompt context.",
    "definition": "Retrieval-Augmented Generation (RAG) is an architecture that reduces LLM hallucination and grounds responses in current, private, or domain-specific knowledge by retrieving relevant documents at query time and including them in the prompt context. A typical RAG pipeline: user query → embed query → similarity search in vector store → retrieve top-K documents → inject documents into system/user prompt → LLM generates grounded response. RAG introduces distinct security risks: the retrieval pipeline is an injection surface (malicious documents in the vector store can inject instructions into the LLM's context), the vector store itself can be poisoned to manipulate retrieval results, and retrieved content may contain sensitive data that the LLM leaks in its response.",
    "tags": ["RAG", "retrieval", "vector database", "grounding", "context", "injection"],
    "cve_cwe": []
  },
  {
    "id": "system-prompt",
    "term": "System Prompt",
    "category": "LLM Concept",
    "source": "LLM Application Architecture",
    "url": "https://platform.openai.com/docs/guides/text?api-mode=chat",
    "short": "A hidden instruction block prepended to an LLM conversation that configures the model's persona, capabilities, and constraints — a primary attack target.",
    "definition": "The system prompt is a privileged instruction block inserted at the beginning of an LLM conversation by the application developer, not visible to end users in most interfaces. It establishes the model's persona, defines allowed and forbidden behaviors, provides context about the application, and may contain sensitive information like API keys, internal instructions, or business logic. System prompts are a primary target for two distinct attacks: system prompt extraction (convincing the model to reveal its contents, exposing proprietary instructions and potential credentials) and system prompt injection (crafting user input that overrides or neutralizes the system prompt's instructions). Effective system prompt security combines prompt hardening techniques with system-level controls, since no prompt alone is injection-proof.",
    "tags": ["system prompt", "instruction", "persona", "injection", "extraction", "LLM security"],
    "cve_cwe": []
  },
  {
    "id": "context-window",
    "term": "Context Window",
    "category": "LLM Concept",
    "source": "LLM Architecture / OpenAI Documentation",
    "url": "https://platform.openai.com/docs/guides/text",
    "short": "The maximum number of tokens an LLM can process in a single pass, encompassing system prompt, conversation history, retrieved documents, and output.",
    "definition": "The context window is the fixed upper bound on the number of tokens an LLM can process in one inference call — including the system prompt, full conversation history, injected documents (RAG), tool outputs, and generated response. Modern LLMs have context windows ranging from 4K to 2M tokens. The context window has direct security implications: it bounds how much information can be injected (limiting some injection payloads but also limiting how much system prompt instruction the model can 'attend to' at once). Context window overflow attacks deliberately flood the window with attacker-controlled content to dilute system prompt attention. Long context also increases the risk of indirect injection — the more external content the model processes, the more opportunities for malicious instructions to arrive.",
    "tags": ["context window", "tokens", "attention", "injection", "RAG", "overflow"],
    "cve_cwe": []
  },
  {
    "id": "fine-tuning",
    "term": "Fine-Tuning",
    "category": "LLM Concept",
    "source": "Transfer Learning / Machine Learning Fundamentals",
    "url": "https://platform.openai.com/docs/guides/fine-tuning",
    "short": "Continuing training of a pre-trained model on a smaller task-specific dataset to specialize its behavior — also an attack vector for removing safety training.",
    "definition": "Fine-tuning is the process of continuing to train a pre-trained foundation model on a smaller, domain-specific dataset to adapt its behavior for a particular task or style. Legitimate fine-tuning adapts general models to medical, legal, or code-generation tasks. From a security perspective, fine-tuning is a significant attack vector: fine-tuning APIs that allow customer customization can be abused to strip a model's safety alignment, insert backdoors, or cause harmful outputs with as few as 100 adversarial examples. Fine-tuning also introduces supply chain risk — models fine-tuned on poisoned or biased datasets inherit those properties. Post-fine-tune safety evaluation is therefore mandatory before deploying any customer-fine-tuned model in production.",
    "tags": ["fine-tuning", "transfer learning", "alignment", "safety", "customization", "training"],
    "cve_cwe": []
  },
  {
    "id": "vector-database",
    "term": "Vector Database",
    "category": "LLM Concept",
    "source": "MLOps / RAG Architecture",
    "url": "https://www.pinecone.io/learn/vector-database/",
    "short": "A database optimized for storing and querying high-dimensional embedding vectors, used as the knowledge store in RAG architectures.",
    "definition": "A vector database stores high-dimensional numerical vectors (embeddings) and enables efficient approximate nearest-neighbor search — finding the vectors most similar to a query vector by geometric distance. Common vector databases include Pinecone, Weaviate, Chroma, pgvector (Postgres extension), and Qdrant. In RAG architectures, the vector database is the knowledge store: documents are embedded and stored, then retrieved at query time by embedding the user's question and finding the most similar document vectors. Vector databases are a security-critical component: unauthorized write access enables RAG poisoning (injecting malicious documents that are retrieved for targeted queries); unauthorized read access enables data exfiltration of the entire knowledge base; and the database itself is a target for availability attacks that deny retrieval service.",
    "tags": ["vector database", "embedding", "RAG", "nearest neighbor", "knowledge store", "Pinecone"],
    "cve_cwe": []
  },
  {
    "id": "adversarial-example",
    "term": "Adversarial Example",
    "category": "ML Attack",
    "source": "Szegedy et al., 2013 / Goodfellow et al., 2014",
    "url": "https://arxiv.org/abs/1412.6572",
    "short": "An input crafted with small, often imperceptible perturbations that causes an ML model to produce a confidently wrong output.",
    "definition": "An adversarial example is an input — image, text, audio, or structured data — that has been deliberately modified with carefully computed perturbations to cause a trained ML model to produce an incorrect output with high confidence. In the image domain, pixel-level noise invisible to humans changes a 'panda' to a 'gibbon' with 99% model confidence. In NLP, character substitutions or synonym replacements that preserve human readability fool text classifiers. Adversarial examples expose the brittleness of neural networks: they rely on statistical patterns rather than true semantic understanding. They are the foundation of multiple attack classes including evasion attacks (bypassing classifiers at deployment), physical-world attacks (adversarial patches on stop signs), and prompt manipulation (injecting adversarial tokens to influence LLM behavior).",
    "tags": ["adversarial", "perturbation", "evasion", "misclassification", "robustness"],
    "cve_cwe": []
  },
  {
    "id": "latent-space",
    "term": "Latent Space",
    "category": "LLM Concept",
    "source": "Representation Learning / ML Fundamentals",
    "url": "https://en.wikipedia.org/wiki/Latent_space",
    "short": "The high-dimensional internal representation space where a neural network encodes learned features — the target of inversion and extraction attacks.",
    "definition": "The latent space (or representation space) is the high-dimensional geometric space in which a neural network encodes its learned internal representations of inputs. Each layer of a deep network maps inputs to progressively more abstract latent representations; the final hidden layer's representation is often used for downstream tasks. Latent spaces are the target of several attack classes: model inversion attacks attempt to reconstruct training inputs from their latent representations; membership inference exploits the fact that training samples occupy denser, more 'in-distribution' regions of latent space; and feature-space backdoors embed trigger-activated clusters in latent space that detection algorithms (activation clustering, spectral signatures) attempt to identify. Understanding latent space geometry is also key to interpretability and AI alignment research.",
    "tags": ["latent space", "representation", "embedding", "inversion", "membership inference", "backdoor"],
    "cve_cwe": []
  },
  {
    "id": "tool-calling",
    "term": "Tool Calling / Function Calling",
    "category": "LLM Concept",
    "source": "OpenAI Function Calling API / Agentic AI",
    "url": "https://platform.openai.com/docs/guides/function-calling",
    "short": "An LLM capability that allows the model to invoke external functions or APIs as part of generating a response, enabling agentic behavior.",
    "definition": "Tool calling (also called function calling) is a capability that allows LLMs to request execution of external functions — web search, database queries, code execution, API calls — as part of generating a response. The model outputs a structured tool call request; the application executes it and returns results to the model, which incorporates them into the final response. Tool calling is the mechanism that enables agentic AI systems. It dramatically expands the attack surface: each tool is a potential injection point (malicious tool output can hijack the agent's next action), the set of available tools defines the agent's blast radius, and tool call parameters may be injectable by adversarial prompts. Securing tool calling requires allow-listing available tools, validating all tool outputs as untrusted data, logging all tool invocations, and enforcing HITL checkpoints for high-impact tools.",
    "tags": ["tool calling", "function calling", "agentic", "API", "plugin", "injection"],
    "cve_cwe": []
  },
  {
    "id": "overfitting",
    "term": "Overfitting",
    "category": "LLM Concept",
    "source": "Machine Learning Fundamentals",
    "url": "https://en.wikipedia.org/wiki/Overfitting",
    "short": "When a model memorizes training data rather than learning generalizable patterns — a root cause of privacy attacks that extract training information.",
    "definition": "Overfitting occurs when a machine learning model learns the specific details and noise of its training data so thoroughly that it performs poorly on new, unseen data. An overfit model has essentially 'memorized' training examples rather than learned underlying patterns. From a security and privacy perspective, overfitting is dangerous: an overfit model retains training data in its weights in a recoverable form. Membership inference attacks exploit overfitting by detecting whether a specific record was in the training set based on the model's confidence differential between members and non-members. Model inversion attacks more readily reconstruct training data from severely overfit models. Differential privacy and regularization techniques reduce overfitting and simultaneously improve privacy guarantees.",
    "tags": ["overfitting", "memorization", "privacy", "membership inference", "generalization"],
    "cve_cwe": []
  },
  {
    "id": "llm-hallucination-security",
    "term": "Hallucination (Security Implications)",
    "category": "LLM Concept",
    "source": "AI Safety / OWASP LLM Top 10 — LLM09",
    "url": "https://owasp.org/www-project-top-10-for-large-language-model-applications/",
    "short": "LLM outputs that are confidently stated but factually wrong or fabricated — a security concern when models generate false security advisories, malware, or legal content.",
    "definition": "Hallucination occurs when an LLM generates outputs that are plausible-sounding but factually incorrect, fabricated, or contradicted by its context. Hallucinations are not random errors — the model produces them with high confidence, making them difficult for non-expert users to detect. Security implications are significant: an LLM-generated security advisory or CVE analysis may be completely fabricated; a hallucinated code snippet may introduce vulnerabilities; an AI-assisted legal or compliance document may cite non-existent regulations. Adversaries can deliberately induce targeted hallucinations through prompt manipulation. Mitigations include RAG grounding (forcing the model to cite retrieved sources), output confidence scoring, human expert review for high-stakes outputs, and monitoring for known hallucination patterns.",
    "tags": ["hallucination", "misinformation", "reliability", "RAG", "grounding", "security"],
    "cve_cwe": []
  },
  {
    "id": "agentic-ai",
    "term": "Agentic AI",
    "category": "LLM Concept",
    "source": "AI Research / Industry",
    "url": "https://www.anthropic.com/research/building-effective-agents",
    "short": "AI systems that autonomously plan, reason, and execute multi-step tasks by calling tools, retaining memory, and interacting with external systems.",
    "definition": "Agentic AI refers to AI systems that go beyond single-turn question-answering to autonomously pursue goals across multiple steps: planning a course of action, calling external tools (web search, APIs, code execution, file systems), retaining memory across steps, and adapting their plan based on intermediate results. An agentic system might be given 'book me a flight' and autonomously search travel sites, compare options, fill forms, and complete a purchase. This autonomy dramatically expands the attack surface compared to conversational LLMs: agentic systems interact with real-world systems with real consequences, making prompt injection, goal hijacking, and privilege escalation attacks potentially catastrophic. Agentic security requires controls that do not exist in traditional LLM deployments: capability scoping, HITL checkpoints, action logging, and sandboxing.",
    "tags": ["agentic", "autonomous", "agent", "multi-step", "tool use", "planning"],
    "cve_cwe": []
  },
  {
    "id": "weight-poisoning",
    "term": "Weight Poisoning",
    "category": "ML Attack",
    "source": "Kurita et al., 2020 / Academic Research",
    "url": "https://arxiv.org/abs/2004.06660",
    "short": "An attack that injects malicious behavior into a model by manipulating its weights during or after fine-tuning, bypassing training-data defenses.",
    "definition": "Weight poisoning attacks target the model parameter space directly rather than the training data. In the fine-tuning variant, an attacker who publishes a pre-trained model (e.g., on Hugging Face Hub) embeds a backdoor in the weights such that when a victim fine-tunes on clean task data, the backdoor survives and activates on a trigger sequence at inference time — even though the victim's fine-tuning data is completely clean. In the post-training variant, an attacker with write access to a deployed model's weights modifies parameters directly (model weight trojan). Weight poisoning is a supply chain attack on the model artifact itself, making it invisible to training-data audits and requiring model-level behavioral testing and weight integrity verification for detection.",
    "tags": ["weight poisoning", "backdoor", "fine-tuning", "supply chain", "pre-trained model"],
    "cve_cwe": []
  },
  {
    "id": "multimodal-attack",
    "term": "Multimodal Attack",
    "category": "ML Attack",
    "source": "AI Security Research",
    "url": "https://arxiv.org/abs/2302.04237",
    "short": "Adversarial attacks that exploit multimodal models (vision-language, audio-language) by injecting malicious content through non-text modalities.",
    "definition": "Multimodal attacks target AI systems that process multiple input types — text, images, audio, video — by embedding adversarial payloads in non-text modalities. A vision-language model (e.g., GPT-4V, Claude with vision) can be attacked by embedding invisible prompt injection text within an image using steganography or adversarial perturbations: the injected text is invisible to humans but OCR-visible or attention-visible to the model. Audio models can be attacked with imperceptible ultrasonic commands. Multimodal injection is particularly dangerous because text-based content filters do not inspect image or audio content, creating a blind spot in most content safety architectures. Defenses require modality-aware input inspection and cross-modal consistency checking.",
    "tags": ["multimodal", "vision", "image injection", "audio attack", "cross-modal", "steganography"],
    "cve_cwe": []
  },
  {
    "id": "ai-red-team",
    "term": "AI Red Team",
    "category": "Security Practice",
    "source": "Microsoft AI Red Team / NIST AI RMF",
    "url": "https://learn.microsoft.com/en-us/security/ai-red-team/",
    "short": "A dedicated team that adversarially probes AI systems for safety, security, and fairness failures before and during deployment.",
    "definition": "An AI red team applies adversarial mindset and structured testing methodologies to AI/ML systems, attempting to find safety failures, security vulnerabilities, and alignment gaps before attackers do. Unlike traditional security red teams, AI red teams must address AI-specific failure modes: jailbreaks, harmful content generation, prompt injection, model extraction, bias and fairness failures, and emergent behaviors not anticipated during development. Microsoft's AI Red Team, Google's Deepmind safety team, and Anthropic's safety evaluations are examples. The NIST AI RMF MANAGE function explicitly calls for red team exercises. AI red teaming combines manual creative adversarial prompting with automated fuzzing tools (Garak, PyRIT, Counterfit) and structured evaluation frameworks (OWASP LLM Top 10, MITRE ATLAS).",
    "tags": ["red team", "adversarial testing", "safety", "security evaluation", "jailbreak", "AI safety"],
    "cve_cwe": []
  },
  {
    "id": "supply-chain-attack-ai",
    "term": "AI Supply Chain Attack",
    "category": "Supply Chain",
    "source": "MITRE ATLAS / NIST SP 800-218A",
    "url": "https://atlas.mitre.org/techniques/AML.T0010",
    "short": "Compromising an AI system by injecting malicious components into its upstream dependencies: datasets, pre-trained models, ML frameworks, or build pipelines.",
    "definition": "An AI supply chain attack targets the components that an AI system depends on rather than the system itself: public datasets (poisoning the training data before it's ingested), pre-trained model repositories (publishing malicious model weights that embed backdoors or execute code on load), ML framework packages (typosquatting or dependency confusion to inject malicious code into torch, tensorflow, or transformers), and ML CI/CD pipelines (compromising build systems that train, evaluate, and deploy models). AI supply chains have unique risks absent from traditional software: model weight files contain executable code (pickle format) without obvious indicators; poisoned training data can compromise a model without compromising any code; and the opacity of foundation models makes detecting injected behavior extremely difficult without dedicated behavioral testing.",
    "tags": ["supply chain", "poisoning", "dependency", "ML framework", "pre-trained model", "pipeline"],
    "cve_cwe": []
  },
  {
    "id": "data-exfiltration-llm",
    "term": "Data Exfiltration via LLM",
    "category": "LLM Attack",
    "source": "OWASP LLM06 / AI Security Research",
    "url": "https://owasp.org/www-project-top-10-for-large-language-model-applications/",
    "short": "Using a compromised LLM or injected prompt to extract sensitive data from the application context, memory, or connected systems.",
    "definition": "Data exfiltration via LLM occurs when an attacker uses prompt injection or goal hijacking to make an LLM output sensitive data from its context window, system prompt, retrieved documents, or connected data sources. In agentic deployments, the LLM can be instructed to actively query databases or APIs and include results in its response or in a covert side channel (embedding data in a URL, image request, or tool call). Indirect prompt injection from external sources (emails, web pages, documents) is particularly effective: the attacker delivers the exfiltration instruction through content the LLM ingests during normal operation, requiring no direct access to the user. Mitigations include output filtering for PII and sensitive data patterns, restricting what data enters the LLM's context, and monitoring for anomalous data patterns in outputs.",
    "tags": ["exfiltration", "data leakage", "injection", "LLM", "PII", "side channel"],
    "cve_cwe": []
  },
]

# ── Embed ──────────────────────────────────────────────────────────────────
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

# ── Merge ──────────────────────────────────────────────────────────────────
existing_meta = json.loads(META_FILE.read_text())
existing_emb  = json.loads(EMB_FILE.read_text())
existing_ids  = {d['id'] for d in existing_meta}

added = 0
for d in NEW_DEFS:
    if d['id'] not in existing_ids:
        existing_meta.append(d)
        existing_emb[d['id']] = embeddings[d['id']]
        added += 1
        print(f"  + {d['term']}")
    else:
        print(f"  ~ SKIP (exists): {d['term']}")

existing_meta.sort(key=lambda x: x['term'].lower())
META_FILE.write_text(json.dumps(existing_meta, indent=2, ensure_ascii=False))
EMB_FILE.write_text(json.dumps(existing_emb, ensure_ascii=False))

print(f"\nDone. Before: {len(existing_meta)-added} | After: {len(existing_meta)} | Added: {added}")
