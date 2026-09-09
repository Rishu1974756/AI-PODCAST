# 🎙️ PodcastAI — AI Podcast Script & Episode Outline Generator

> **A Generative AI Hackathon Project for intelligent, context-aware podcast creation**

PodcastAI is a full-stack **Generative AI (GenAI)** application that transforms a simple podcast idea into a structured, editable, recording-ready episode.

Users provide a **topic, tone, duration, and optional guest**, and the application uses AI APIs to generate podcast titles, descriptions, timed segments, talking points, host notes, and guest questions.

The application also supports **RAG / context retrieval**, allowing the AI to use the current podcast data and previous conversation history when answering follow-up questions and updating the same podcast.

The complete application is deployed online, allowing judges to evaluate the working product directly.

---

## 🏆 Generative AI Hackathon Project

PodcastAI is designed as a practical **Generative AI application**, where AI is the core of the product rather than an optional feature.

### GenAI is used for

- 🎙️ Podcast episode generation
- 📝 Structured podcast outlines
- 💡 Talking points
- 🎤 Host notes
- 👥 Guest interview questions
- 🏷️ Episode title generation
- 📄 Episode description generation
- ✨ Segment expansion
- 🎭 Tone regeneration
- 📚 Podcast series planning
- 💬 Context-aware podcast conversations
- 🔄 Updating existing podcast content from user requests

---

# 🧠 RAG / Context Retrieval

PodcastAI uses a **RAG-style context retrieval approach** for its conversational podcast workflow.

Instead of sending only the latest user message to the AI, the application retrieves relevant information from the currently active podcast and its saved conversation history.

The retrieved context can include:

```text
Podcast Topic
      +
Tone
      +
Duration
      +
Guest Information
      +
Podcast Title
      +
Podcast Description
      +
Generated Segments
      +
Guest Questions
      +
Previous Conversation
      ↓
Generative AI
      ↓
Context-aware response / podcast update
```

This allows the AI to answer questions according to the podcast that the user is currently working on.

### Example

If the active podcast is about tourism:

```text
User:
How can we increase tourism?
```

The AI understands the existing tourism podcast context and provides a relevant answer.

Another example:

```text
User:
Add another question for the guest.
```

The AI uses the current guest and podcast topic to create a relevant question.

### Why context retrieval is important

Without context retrieval, every message could be treated as an independent prompt.

With the PodcastAI approach:

```text
Saved Podcast + Conversation Context
                ↓
          Context Retrieval
                ↓
          Generative AI
                ↓
     Context-aware Response
```

This makes the application more useful for long-running podcast creation.

> **Implementation note:** PodcastAI's current context/RAG approach retrieves application data and conversation history from MongoDB rather than relying on a separate vector database. This keeps the architecture simple and suitable for the hackathon while still providing retrieval-grounded GenAI responses.

---

# 🤖 AI APIs and Models

PodcastAI uses multiple Generative AI APIs.

## 1. Groq API — Primary AI

Groq is the primary AI provider.

The application uses:

```text
Model:
openai/gpt-oss-120b
```

Groq is used for the main podcast generation and conversational AI operations.

The application communicates with the Groq OpenAI-compatible API.

---

## 2. Google Gemini API — Fallback AI

Google Gemini is configured as a secondary AI provider.

The fallback model is:

```text
Gemini 2.5 Flash
```

If the Groq request fails or reaches a temporary rate limit, the application can use Gemini as a fallback.

### AI fallback architecture

```text
                 User Request
                      │
                      ▼
              ┌───────────────┐
              │   Groq API    │
              │ GPT-OSS-120B  │
              └───────┬───────┘
                      │
                 Success?
                  /       \
                YES        NO
                │           │
                ▼           ▼
             Response   ┌──────────────┐
                        │ Gemini API   │
                        │ 2.5 Flash    │
                        └──────┬───────┘
                               │
                               ▼
                            Response
```

This improves reliability when one AI provider is temporarily unavailable.

---

# 🌐 API Architecture

PodcastAI uses **Next.js API Routes** as its backend.

## Authentication APIs

### `POST /api/auth/signup`

Creates a new user account.

### `POST /api/auth/login`

Authenticates the user and creates a session.

### `GET /api/auth/me`

Checks the currently authenticated user.

### `POST /api/auth/logout`

Logs the user out and invalidates the session.

---

## AI Generation API

### `POST /api/generate`

This is the main Generative AI endpoint.

It handles:

- Topic validation
- New podcast generation
- Existing podcast continuation
- Context-aware conversation
- AI-generated podcast updates
- Saving conversation messages
- Updating podcast information

The endpoint communicates with the configured AI providers and returns structured AI output to the frontend.

---

## History API

### `GET /api/history`

Retrieves the authenticated user's saved podcast episodes.

History is stored in MongoDB and remains available after logout and login.

---

## Podcast Tools API

### `POST /api/podcast-tools`

Provides additional AI and podcast operations:

- Expand a segment
- Regenerate a segment's tone
- Generate titles
- Generate series ideas
- Save an episode
- Delete an episode

---

# 🔐 Authentication and Security

PodcastAI uses **email and password authentication**.

There is no Google login dependency.

### Password security

Passwords are hashed using:

```text
bcryptjs
```

Plain-text passwords are not stored.

### Session management

The application uses session tokens stored in MongoDB.

The `sessions` collection stores information such as:

```text
userId
token
createdAt
expiresAt
```

Protected API routes verify the session before allowing access to user-specific data.

### User data isolation

Episodes are associated with the authenticated user's ID.

This ensures that users access their own podcast history.

---

# 🗄️ MongoDB Database

MongoDB provides persistent storage for the application.

The MongoDB connection is managed through:

```text
lib/mongodb.ts
```

## Main collections

### `users`

Stores user account information.

```text
email
password hash
createdAt
```

### `sessions`

Stores authentication sessions.

```text
userId
token
createdAt
expiresAt
```

### `episodes`

Stores podcast information and conversation history.

Example structure:

```text
userId
topic
tone
duration
title
description
guest
segments
guestQuestions
messages
createdAt
updatedAt
```

---

# 🎯 New Podcast Workflow

A user starts by clicking **New Episode**.

The user provides:

### Topic

Example:

```text
The future of artificial intelligence in education
```

### Tone

Supported tones include:

- Casual
- Professional
- Comedic
- Investigative

### Duration

The application supports:

- 5 minutes
- 10 minutes
- 15 minutes
- 30 minutes
- 1 hour
- 1.5 hours
- 2 hours

### Optional Guest

Users can provide:

```text
Guest Name
Guest Role
```

The AI then uses this information when generating the episode and guest questions.

---

# 📝 Structured AI Output

PodcastAI does not simply return one large paragraph.

The AI generates a structured podcast.

```text
Podcast
│
├── Title
├── Description
├── Topic
├── Tone
├── Duration
├── Guest
│
├── Segment 1
│   ├── Title
│   ├── Timing
│   ├── Talking Points
│   └── Host Notes
│
├── Segment 2
│   ├── Title
│   ├── Timing
│   ├── Talking Points
│   └── Host Notes
│
├── ...
│
└── Guest Questions
```

This makes the generated result practical for actual podcast preparation.

---

# 💬 Context-Aware Podcast Conversation

Once a podcast is generated, users can continue working on that same podcast.

For example:

```text
User:
Make the introduction more engaging.
```

```text
User:
Expand the second segment.
```

```text
User:
Add two more guest questions.
```

```text
User:
How can we increase tourism?
```

The application provides the AI with the relevant current podcast context and conversation history.

Therefore, the AI can understand what the user means within the active podcast.

---

# 🚫 Keeping the Conversation Focused

PodcastAI is designed to keep an active conversation related to the current podcast.

Relevant questions are accepted.

Examples:

```text
How can we increase tourism?
```

```text
What food ideas can this chef discuss?
```

```text
Add another question for the guest.
```

Unrelated requests such as:

```text
Write Python code.
```

```text
What is 123 × 456?
```

```text
What is today's weather?
```

can be rejected because they do not belong to the active podcast workflow.

---

# ✨ AI Podcast Tools

## Expand Segment

Users can expand an individual segment to get additional content and talking points.

## Tone Regeneration

A segment can be regenerated using another tone.

Examples:

```text
Professional → Casual
Professional → Comedic
Casual → Investigative
```

## Title Generation

The AI can generate suitable podcast episode titles.

## Description Generation

The AI can create an episode description based on the current podcast.

## Series Planner

The AI can generate related episode ideas for a podcast series.

---

# 👥 Guest Questions

When a guest is provided, the AI generates questions based on:

- Guest information
- Guest role
- Podcast topic
- Episode direction

Users can also ask the AI to generate additional questions while continuing the podcast.

---

# 💾 Persistent History

PodcastAI stores episodes in MongoDB.

This allows users to:

1. Create an episode.
2. Continue working on it.
3. Log out.
4. Log back in later.
5. Open the same episode from History.
6. Continue the conversation.

The application also supports:

- 🔍 History search
- 🗑️ Episode deletion
- 💬 Continuing saved podcasts

There is intentionally **no Rename feature** in the current application.

---

# 🔍 Search

The sidebar provides podcast history search.

Users can search saved podcasts using information such as:

- Episode title
- Topic
- Description
- Guest name
- Guest role

The search filters the saved history so users can quickly find an existing podcast.

---

# 🖥️ Frontend

The frontend is built using:

- **Next.js**
- **React**
- **TypeScript**
- **CSS / responsive UI**

The main dashboard is:

```text
app/page.tsx
```

The login page is:

```text
app/login/page.tsx
```

The interface includes:

- Sidebar
- New Episode
- Search
- Podcast History
- Podcast workspace
- Segments
- Guest Questions
- AI conversation
- Account menu
- Settings
- Light/dark mode

---

# 📱 Responsive Design

The application is designed to work across desktop and mobile devices.

The responsive interface provides:

- Mobile-friendly navigation
- Responsive podcast content
- Flexible segment cards
- Usable conversation interface
- Sidebar navigation
- Search and history access

---

# 📤 Export

Podcast content can be copied and exported.

The application supports text-based export and browser-based PDF printing.

Users can use the browser print workflow to save the generated podcast as a PDF.

---

# 🛠️ Technology Stack

| Technology | Purpose |
|---|---|
| **Next.js** | Full-stack web framework |
| **React** | Interactive frontend |
| **TypeScript** | Type-safe development |
| **MongoDB** | Persistent database |
| **bcryptjs** | Password hashing |
| **Groq API** | Primary GenAI API |
| **GPT-OSS-120B** | Primary AI model |
| **Google Gemini API** | Fallback GenAI API |
| **Gemini 2.5 Flash** | Fallback AI model |
| **Vercel** | Cloud deployment |
| **GitHub** | Source-code management |

---

# 📁 Project Structure

```text
podcast-ai/
│
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── login/
│   │   │   │   └── route.ts
│   │   │   ├── logout/
│   │   │   │   └── route.ts
│   │   │   ├── me/
│   │   │   │   └── route.ts
│   │   │   └── signup/
│   │   │       └── route.ts
│   │   │
│   │   ├── generate/
│   │   │   └── route.ts
│   │   │
│   │   ├── history/
│   │   │   └── route.ts
│   │   │
│   │   └── podcast-tools/
│   │       └── route.ts
│   │
│   ├── login/
│   │   └── page.tsx
│   │
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
│
├── lib/
│   └── mongodb.ts
│
├── public/
│
├── package.json
├── package-lock.json
├── next.config.ts
├── tsconfig.json
├── eslint.config.mjs
├── postcss.config.mjs
└── .gitignore
```

---

# 🔑 Environment Variables

Create a local `.env` file.

```env
MONGODB_URI=your_mongodb_connection_string
MONGODB_DB=podcast-ai

GROQ_API_KEY=your_groq_api_key
GEMINI_API_KEY=your_gemini_api_key
```

### ⚠️ Security

**Never upload `.env` to GitHub.**

The `.env` file can contain:

- MongoDB credentials
- Groq API key
- Gemini API key

For Vercel, add these values through the project's Environment Variables section.

---

# 🚀 Run the Project Locally

## 1. Clone

```bash
git clone https://github.com/YOUR_USERNAME/AI-PODCAST.git
```

## 2. Enter the project

```bash
cd AI-PODCAST
```

## 3. Install dependencies

```bash
npm install
```

## 4. Configure environment variables

Create `.env`:

```env
MONGODB_URI=...
MONGODB_DB=podcast-ai
GROQ_API_KEY=...
GEMINI_API_KEY=...
```

## 5. Start the development server

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

---

# ☁️ Online Deployment

PodcastAI is deployed using **Vercel** and the source code is maintained on **GitHub**.

Deployment flow:

```text
Local Development
       ↓
GitHub
       ↓
Vercel
       ↓
Live Web Application
       ↓
Online Evaluation
```

The production environment uses Vercel environment variables for the database and AI API credentials.

---

# 🧪 How Judges Can Evaluate the Project

The project is designed for **online evaluation**.

Judges do not need to set up the development environment to understand the main functionality.

### Recommended evaluation flow

```text
1. Open the deployed application
        ↓
2. Create an account
        ↓
3. Login
        ↓
4. Click New Episode
        ↓
5. Enter a topic
        ↓
6. Select tone
        ↓
7. Select duration
        ↓
8. Add an optional guest
        ↓
9. Generate the podcast
        ↓
10. Review structured segments
        ↓
11. Review guest questions
        ↓
12. Expand a segment
        ↓
13. Continue the podcast using chat
        ↓
14. Ask a context-related question
        ↓
15. Search History
        ↓
16. Reopen a previous podcast
        ↓
17. Continue the saved podcast
```

### Suggested test prompt

For a quick demonstration, judges can create a podcast such as:

```text
Topic:
The Future of AI in Education

Tone:
Professional

Duration:
30 minutes

Guest:
AI Education Researcher
```

Then try:

```text
Add two more guest questions.
```

or:

```text
Make the introduction more engaging.
```

or:

```text
How can AI improve personalized learning?
```

These demonstrate the application's **Generative AI + context retrieval + conversational workflow**.

---

# 🌟 What Makes PodcastAI Different?

PodcastAI is more than a simple AI text generator.

It combines:

```text
Generative AI
       +
RAG / Context Retrieval
       +
Conversational AI
       +
Structured AI Output
       +
Authentication
       +
MongoDB Persistence
       +
AI API Fallback
       +
Interactive Web UI
       +
Online Cloud Deployment
```

The application demonstrates how GenAI can be integrated into a complete real-world product.

---

# 🎯 Problem Solved

Aspiring podcasters often face:

- Blank-page paralysis
- Difficulty structuring an episode
- Difficulty creating guest questions
- Difficulty maintaining episode flow
- Difficulty improving individual sections
- Difficulty continuing work on previous episodes

PodcastAI addresses these problems by providing an AI-assisted podcast workspace that can generate, refine, store, and continue podcast episodes.

---

# 💡 Core Project Idea

```text
Simple Podcast Idea
        ↓
User Requirements
        ↓
Generative AI
        ↓
Structured Episode
        ↓
Edit / Expand / Regenerate
        ↓
Context Retrieval
        ↓
Conversational AI
        ↓
Persistent MongoDB Workspace
```

---

# 🔮 Future Scope

Possible future improvements include:

- 🎧 AI-generated podcast audio
- 🗣️ AI voice hosts
- 🎙️ Speaker-specific scripts
- 🌍 Multi-language podcast generation
- 🖼️ AI podcast cover generation
- 📊 Podcast analytics
- 📡 RSS publishing
- ▶️ YouTube publishing
- 🎵 Podcast platform integrations
- 🤝 Real-time collaborative editing
- 🧾 Advanced episode version history
- 🔊 Automatic transcription

---

# 👨‍💻 Development Philosophy

PodcastAI was developed as a complete full-stack **Generative AI application** rather than a standalone AI demo.

The project combines:

```text
Frontend
   +
Backend APIs
   +
Generative AI
   +
RAG / Context Retrieval
   +
Database
   +
Authentication
   +
Cloud Deployment
```

The primary objective is to demonstrate a practical use of Generative AI to solve a real content-creation problem.

---

# 📄 License

This project is intended for educational, hackathon, and development purposes.

If the project is distributed publicly as open source, an appropriate open-source license can be added.

---

## ⭐ One-Line Project Summary

> **PodcastAI is a Generative AI-powered, RAG/context-aware podcast creation platform that transforms ideas into structured, editable, conversational, and persistent podcast episodes.**
