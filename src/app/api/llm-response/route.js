import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import axios from 'axios';
import * as cheerio from 'cheerio';
import path from 'path';

// Cache variables
let cachedPDFContent = null;
let cachedWebsiteContent1 = null;
let cachedWebsiteContent2 = null;
let lastCacheTime = 0;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

// Function to scrape website content with caching
async function scrapeWebsite(url) {
    try {
        const currentTime = Date.now();
        if ((currentTime - lastCacheTime) > CACHE_DURATION) {
            const response = await axios.get(url, { timeout: 5000 });
            const $ = cheerio.load(response.data);
            const text = $("body").text().trim();
            if (url.includes("firstinspires")) {
                cachedWebsiteContent1 = text;
            } else if (url.includes("ctrlaltftc")) {
                cachedWebsiteContent2 = text;
            }
            lastCacheTime = currentTime;
        }

        if (url.includes("firstinspires")) return cachedWebsiteContent1;
        if (url.includes("ctrlaltftc")) return cachedWebsiteContent2;
        return "";
    } catch (error) {
        console.error(`Error scraping website ${url}:`, error.message);
        return "";
    }
}

// Function to get PDF content with caching
async function getPDFContent() {
    if (cachedPDFContent) return cachedPDFContent;
    try {
        const pdfPath = path.resolve(process.cwd(), 'public', 'GameManual.pdf');
        const loader = new PDFLoader(pdfPath);
        const pdfDocs = await loader.load();
        cachedPDFContent = pdfDocs.map(doc => doc.pageContent).join("\n");
        return cachedPDFContent;
    } catch (error) {
        console.error("Error loading PDF:", error.message);
        throw new Error("Error loading PDF");
    }
}

// In-memory chat history (consider moving to per-session storage)
let chatHistory = [];

export async function POST(req) {
    try {
        const reqBody = await req.json();
        const { userInput } = reqBody;

        // Parallelize fetching data
        const [pdfContent, websiteContent1, websiteContent2] = await Promise.all([
            getPDFContent(),
            scrapeWebsite("https://www.firstinspires.org/resource-library/ftc/game-and-season-info"),
            scrapeWebsite("https://www.ctrlaltftc.com/homeostasis-by-thermal-equilibrium/what-is-homeostasis")
        ]);

        // Initialize the Google Generative AI chatbot
        const api = new ChatGoogleGenerativeAI({
            model: "gemini-1.5-flash",
            temperature: 0,
            maxRetries: 2,
        });

        // Combine all page contents into a single string
        const context = `${pdfContent}\n\n${websiteContent1}\n\n${websiteContent2}`;

        // Add user input to chat history
        chatHistory.push({ role: "human", content: userInput });

        // Prepare the messages for the API call
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

        // Stream the response from the chatbot
        const stream = await api.stream(messages);

        const chunks = [];
        for await (const chunk of stream) {
            chunks.push(chunk.content); // Assuming chunk.content contains the message
            console.log(chunk.content); // Log each chunk as it arrives
        }

        // Combine the chunks into a final response
        const finalResponse = chunks.join("");

        // Add assistant's response to chat history
        chatHistory.push({ role: "assistant", content: finalResponse });

        // Return the final response
        return new Response(JSON.stringify({ response: finalResponse }), {
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error("Error in POST handler:", error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
