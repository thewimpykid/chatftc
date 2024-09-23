import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import axios from 'axios';
import * as cheerio from 'cheerio';
import path from 'path';

// In-memory caches
let chatHistory = [];
let cachedPdfContent = null;
let cachedWebsiteContent1 = null;
let cachedWebsiteContent2 = null;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour
let lastCacheTime = Date.now();

// Helper function to check if cache has expired
const cacheExpired = () => Date.now() - lastCacheTime > CACHE_DURATION;

// Load PDF content with caching
async function loadPdfContent() {
    if (!cachedPdfContent) {
        const pdfPath = path.resolve(process.cwd(), 'public', 'GameManual.pdf');
        const loader = new PDFLoader(pdfPath);
        const pdfDocs = await loader.load();
        cachedPdfContent = pdfDocs.map(doc => doc.pageContent).join("\n");
    }
    return cachedPdfContent;
}

// Scrape website content with optional selector and caching
async function scrapeWebsite(url, selector = 'body') {
    try {
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);
        return $(selector).text().trim();
    } catch (error) {
        console.error(`Error scraping website ${url}:`, error.message);
        return "";
    }
}

// Update cache if expired
async function ensureCacheIsUpdated() {
    if (cacheExpired()) {
        [cachedWebsiteContent1, cachedWebsiteContent2] = await Promise.all([
            scrapeWebsite("https://www.firstinspires.org/resource-library/ftc/game-and-season-info"),
            scrapeWebsite("https://www.ctrlaltftc.com/homeostasis-by-thermal-equilibrium/what-is-homeostasis")
        ]);
        lastCacheTime = Date.now();
    }
}

// Get cached website content (parallel content fetching)
async function getCachedWebsiteContent() {
    await ensureCacheIsUpdated();
    return `${cachedWebsiteContent1}\n\n${cachedWebsiteContent2}`;
}

// API handler for POST request
export async function POST(req) {
    try {
        const reqBody = await req.json();
        const { userInput } = reqBody;

        // Fetch PDF and website content in parallel
        const [pdfContent, websiteContent] = await Promise.all([
            loadPdfContent(),
            getCachedWebsiteContent()
        ]);

        // Initialize the chatbot
        const api = new ChatGoogleGenerativeAI({
            model: "gemini-1.5-flash",
            temperature: 0,
            maxRetries: 0,
        });

        // Combine the context
        const context = `${pdfContent}\n\n${websiteContent}`;

        // Add user input to chat history
        chatHistory.push({ role: "human", content: userInput });

        // Limit chat history to the most recent entries (e.g., last 10 exchanges)
        const MAX_HISTORY_SIZE = 10;
        chatHistory = chatHistory.slice(-MAX_HISTORY_SIZE);

        // Prepare messages (only assistant responses from chat history)
        const messages = [
            {
                role: "system",
                content: "You are a helpful assistant trained on the content of a game manual, INTO THE DEEP. Use the following pieces of context to answer the user's question. If you don't know the answer or it is not related to the context (robotics), just say that you don't know, don't try to make up an answer.",
            },
            {
                role: "human",
                content: `${context}\n\nUser: ${userInput}`,
            }
        ];

        // Append assistant responses from chat history
        chatHistory.filter(entry => entry.role === 'assistant').forEach(entry => {
            messages.push({ role: entry.role, content: entry.content });
        });

        // Get response from the chatbot
        const response = await api.invoke(messages);

        // Add the assistant's response to chat history
        chatHistory.push({ role: "assistant", content: response.content });

        // Respond to the user
        return new Response(JSON.stringify({ response: response.content }), {
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error("Error in API handler:", error);
        return new Response(JSON.stringify({ error: "Internal Server Error" }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
