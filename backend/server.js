// ============================================================
// server.js — Alex Moser's AI chatbot backend
// ============================================================
//
// WHAT IS THIS FILE?
//   This is a Node.js web server. Node.js lets you run JavaScript
//   outside the browser — on a real server instead of just a webpage.
//
// WHY IS IT ON A SEPARATE SERVER?
//   Your Gemini API key is a secret (like a password). If it were in
//   your index.html, anyone could open browser DevTools and steal it.
//   This server holds the key and acts as the secure "middleman":
//
//   Browser  →  [POST /chat]  →  This server  →  Gemini API
//                                                       ↓
//   Browser  ←  AI response  ←  This server  ←  Gemini API
//
// HOW TO RUN LOCALLY (FOR TESTING):
//   1. Create a file called `.env` in this folder with:
//        GEMINI_API_KEY=your_key_here
//   2. Run:  npm install
//   3. Run:  node server.js
//   4. Server starts at http://localhost:3000
// ============================================================

// dotenv loads your .env file so process.env.GEMINI_API_KEY works locally.
// On Render.com the variable is set in the dashboard — dotenv does nothing there (that's fine).
require('dotenv').config();

// 'require' is Node's way of importing a library (like Python's import).
// Express is a framework that makes building web servers much simpler.
const express = require('express');

// CORS = Cross-Origin Resource Sharing.
// Browsers block HTTP requests between different websites by default (a security feature).
// We need to tell the server to explicitly allow requests from your GitHub Pages domain.
const cors = require('cors');

// The official Google AI client library for Node.js.
const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- App setup ---
const app = express();

// Render.com automatically sets the PORT environment variable.
// The || 3000 is a fallback so it works on your local machine too.
const PORT = process.env.PORT || 3000;

// ============================================================
// CORS CONFIGURATION
//
// Only allow requests from these specific origins (websites).
// If someone tries to use your backend from a different domain,
// the browser will block it automatically.
// ============================================================
const corsOptions = {
  origin: [
    'https://ajmoser1.github.io', // Your live GitHub Pages site
    'http://localhost:5500',        // VS Code Live Server (common local dev tool)
    'http://127.0.0.1:5500',        // Same as above but with IP address
    'null',                         // Needed when opening index.html directly as a file
  ],
  methods: ['POST', 'GET'],
};
app.use(cors(corsOptions));

// This middleware automatically parses incoming JSON request bodies.
// When your site sends { "message": "hi" }, Express converts that string
// into a real JavaScript object you can access via req.body.message.
app.use(express.json());

// Initialize the Gemini client.
// process.env.GEMINI_API_KEY reads the secret key from the environment —
// never hardcode the actual key string here!
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ============================================================
// SYSTEM PROMPT
//
// This is the "persona" instruction sent to Gemini before every
// conversation. It defines who the AI is and how it should behave.
// Think of it like a job briefing you give an employee before their shift.
//
// A good system prompt is specific: it gives facts (not vague descriptions)
// and clear behavioral rules.
// ============================================================
const SYSTEM_PROMPT = `You are Alex Moser, chatting with visitors on your portfolio site (ajmoser1.github.io). You're the real Alex — not a formal bio, just you having a real conversation.

WHO YOU ARE:
- ECE (Electrical & Computer Engineering) student-athlete at Carnegie Mellon University (CMU) in Pittsburgh
- From Chicago, Illinois
- NCAA Track & Field athlete: long jump, triple jump, and sprints
- Member of Sigma Alpha Epsilon (SAE) fraternity at CMU
- Involved with CMU's Swartz Center for Entrepreneurship
- Graduate of the John O. Mosely Leadership School

BUSINESSES YOU STARTED:
- "Achieve More Academics": STEM tutoring business you built from scratch — 5+ tutors, serves middle and high school students. You run everything: client management, scheduling, marketing, payment processing.
- "A+ Washing": Residential power-washing service. You handled marketing, client relationships, and operations end-to-end.

SKILLS & INTERESTS:
- Technical: Python, circuit design, AI tools
- Strengths: relentless work ethic, bias for action, leadership, communication, teaching
- Music: Baby Keem | Movie: The Shining | Sports team: Chicago Bears
- Into entrepreneurship, building things, and spending real time with people you care about

TONE & STYLE:
- Talk like yourself — confident but not arrogant, casual, real
- Use humor and natural slang when it fits, don't force it
- Keep it conversational and to the point — 2-4 sentences is usually enough
- You're well-rounded: engineering, business, athletics, all of it matters to you equally
- Speak in first person as Alex, don't sound like a LinkedIn post

RULES:
- Go deep on any topic about yourself — nothing is off limits from the facts above
- Never make up facts beyond what's listed
- If you're genuinely unsure about something, say so — don't guess
- If someone asks something totally unrelated to you (like solve a math problem), redirect: you're here to talk about yourself
- Don't mention you're an AI unless someone directly asks`;

// ============================================================
// HEALTH CHECK ENDPOINT
//
// Render.com periodically pings this URL to verify your server is running.
// It expects any successful response (status 200). A simple "OK" is enough.
// This is standard practice for any hosted server.
// ============================================================
app.get('/health', (req, res) => {
  res.send('OK');
});

// ============================================================
// CHAT ENDPOINT
//
// An "endpoint" is a URL path your server listens for.
// "POST /chat" means: when someone sends a POST request to /chat, run this function.
//
// HTTP Methods quick reference:
//   GET  — fetch/read data (like loading a webpage)
//   POST — send data to the server (like submitting a form or, here, sending a message)
//
// The function is "async" because calling the Gemini API takes time (network request).
// We use "await" to pause and wait for the result before continuing.
// ============================================================
app.post('/chat', async (req, res) => {
  try {
    // req.body is the parsed JSON your website sends.
    // We expect: { message: "the user's text", history: [...past messages] }
    // The "= []" means "use an empty array if history wasn't sent"
    const { message, history = [] } = req.body;

    // Basic validation — never trust data from the outside world without checking it
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      // HTTP 400 = "Bad Request" — the client sent invalid data
      return res.status(400).json({ error: 'Message is required.' });
    }

    // Get the Gemini model.
    // gemini-2.0-flash is the current fast, cheap model for conversational use cases.
    // The systemInstruction is sent to Gemini BEFORE the conversation starts —
    // it's like giving the AI its role before it talks to the user.
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      systemInstruction: SYSTEM_PROMPT,
    });

    // Gemini's chat history format uses roles 'user' and 'model'.
    // We store history in our format ('user'/'assistant'), so convert it here.
    const chatHistory = history.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    // Start a chat session. Passing the history means Gemini remembers
    // what was said earlier in the conversation.
    const chat = model.startChat({ history: chatHistory });

    // Send the user's new message and wait for Gemini's response.
    // This is the actual API call — it goes out to Google's servers.
    const result = await chat.sendMessage(message.trim());
    const responseText = result.response.text();

    // Send the response back to the browser as JSON.
    // Default HTTP status is 200 (OK), so we don't need to specify it.
    res.json({ response: responseText });

  } catch (error) {
    // If anything goes wrong (API error, network issue, etc.), log it on the server
    // and send a clean error message back — never expose raw error details to the browser.
    console.error('Error calling Gemini:', error.message);

    // HTTP 500 = "Internal Server Error"
    res.status(500).json({ error: 'Something went wrong. Please try again in a moment.' });
  }
});

// Start the server — it begins listening for incoming requests on the specified port.
// Nothing happens until this line runs.
app.listen(PORT, () => {
  console.log(`Alex's chatbot server is running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
