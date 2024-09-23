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

async function loadPdfContent() {
    if (!cachedPdfContent) {
        const pdfPath = path.resolve(process.cwd(), 'public', 'GameManual.pdf');
        const loader = new PDFLoader(pdfPath);
        const pdfDocs = await loader.load();
        cachedPdfContent = pdfDocs.map(doc => doc.pageContent).join("\n");
    }
    return cachedPdfContent;
}

async function scrapeWebsite(url) {
    try {
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);
        return $("body").text().trim();
    } catch (error) {
        console.error(`Error scraping website ${url}:`, error.message);
        return "";
    }
}

async function getCachedWebsiteContent() {
    const now = Date.now();
    if (now - lastCacheTime > CACHE_DURATION) {
        cachedWebsiteContent1 = await scrapeWebsite("https://www.firstinspires.org/resource-library/ftc/game-and-season-info");
        cachedWebsiteContent2 = await scrapeWebsite("https://www.ctrlaltftc.com/homeostasis-by-thermal-equilibrium/what-is-homeostasis");
        lastCacheTime = now;
    }
    return `${cachedWebsiteContent1}\n\n${cachedWebsiteContent2}`;
}

export async function POST(req) {
    try {
        const reqBody = await req.json();
        const { userInput } = reqBody;

        // Load PDF content
        const pdfContent = await loadPdfContent();

        // Get cached website content
        const websiteContent = await getCachedWebsiteContent();

        // Initialize the chatbot
        const api = new ChatGoogleGenerativeAI({
            model: "gemini-1.5-flash",
            temperature: 0,
            maxRetries: 0,
        });

        // Combine context
        const context = `${pdfContent}\n\n${websiteContent}`;

        // Update chat history
        chatHistory.push({ role: "human", content: userInput });

        // Prepare messages
        const messages = [
            {
                role: "system",
                content: "You are a helpful assistant trained on the content of a game manual, INTO THE DEEP. Use the following pieces of context to answer the user's question. If you don't know the answer or it is not related to the context (robotics), just say that you don't know, don't try to make up an answer.",
            },
            {
                role: "human",
                content: `${context}\n\nUser: ${userInput}`,
            },
            ...chatHistory.map(entry => ({ role: entry.role, content: entry.content })),
        ];

        // Get response without streaming
        const response = await api.invoke(messages);

        // Update chat history
        chatHistory.push({ role: "assistant", content: response.content });

        // Respond
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
