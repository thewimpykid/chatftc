import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import axios from 'axios';
import * as cheerio from 'cheerio';
import path from 'path';

// In-memory chat history
let chatHistory = [];

// Function to scrape website content
async function scrapeWebsite(url) {
    try {
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);
        const text = $("body").text().trim(); // Simplified text extraction
        return text;
    } catch (error) {
        console.error(`Error scraping website ${url}:`, error.message);
        return ""; // Return empty string if there's an error
    }
}

export async function POST(req) {
    const reqBody = await req.json();
    const { userInput } = reqBody;

    // Load the PDF document
    let pdfDocs;
    try {
        const pdfPath = path.resolve(process.cwd(), 'public', 'GameManual.pdf');
        const loader = new PDFLoader(pdfPath); // Adjust the path as needed
        pdfDocs = await loader.load();
    } catch (error) {
        console.error("Error loading PDF:", error.message);
        return new Response(JSON.stringify({ error: "Error loading PDF" }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // Scrape content from both websites
    // const websiteContent3 = await scrapeWebsite("https://ftcscout.org/teams");

    // Initialize the Google Generative AI chatbot
    const api = new ChatGoogleGenerativeAI({
        model: "gemini-1.5-flash",
        temperature: 0,
        maxRetries: 2,
    });

    // Combine all page contents into a single string
    const context = pdfDocs.map(doc => doc.pageContent).join("\n")

    // Add user input to chat history
    chatHistory.push({ role: "human", content: userInput });

    // Prepare the messages for the API call
    const messages = [
        {
            role: "system",
            content: "You are a helpful assistant trained on the content of the game manual for Into the Deep. Please use the provided context to answer the user's questions. If you do not know the answer or if the question is unrelated to the context (specifically about robotics), simply respond with 'I don’t know' without attempting to provide a fabricated answer.",
        },
        {
            role: "human",
            content: `${context}\n\nUser: ${userInput}`,
        },
        ...chatHistory.map(entry => ({ role: entry.role, content: entry.content })),
    ];

    try {
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
        console.error("Error communicating with the chatbot:", error.message);
        return new Response(JSON.stringify({ error: "Error communicating with the chatbot" }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}

// content: "You are a helpful assistant trained on the content of a game manual, INTO THE DEEP. Use the following pieces of context to answer the user's question. If you don't know the answer or it is not related to the context (robotics), just say that you don't know, don't try to make up an answer.",