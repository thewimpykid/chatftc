import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import axios from 'axios';
import * as cheerio from 'cheerio';
import path from 'path';
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

// In-memory chat history
let chatHistory = [];

// Function to get all URLs from the index page
async function getUrlsFromIndexPage(indexUrl) {
    try {
        const response = await axios.get(indexUrl);
        const $ = cheerio.load(response.data);
        const urls = [];

        $('a').each((index, element) => {
            const href = $(element).attr('href');
            if (href && href.endsWith('.html')) {
                const fullUrl = new URL(href, indexUrl).href;
                urls.push(fullUrl);
            }
        });

        return urls;
    } catch (error) {
        console.error(`Error fetching URLs from ${indexUrl}:`, error.message);
        return [];
    }
}

// Function to scrape content from each URL
async function scrapeWebsiteContent(url) {
    try {
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);
        const text = $("body").text().trim();
        return text;
    } catch (error) {
        console.error(`Error scraping website ${url}:`, error.message);
        return "";
    }
}

// Function to load and scrape PDFs
async function loadPdfDocument(pdfPath) {
    try {
        const loader = new PDFLoader(pdfPath);
        const pdfDocs = await loader.load();
        return pdfDocs.map(doc => doc.pageContent).join("\n");
    } catch (error) {
        console.error("Error loading PDF:", error.message);
        return "";
    }
}

// Function to load and scrape website content from multiple sources
async function loadWebsiteContent(urls) {
    let content = "";
    for (const url of urls) {
        const pageContent = await scrapeWebsiteContent(url);
        content += pageContent + "\n";
    }
    return content;
}

// Function to split content into chunks using RecursiveCharacterTextSplitter
async function splitContentIntoChunks(content) {
    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,  // Adjust chunk size as needed
        chunkOverlap: 200, // Overlap between chunks
    });
    const chunks = await splitter.splitText(content);
    return chunks;
}

export async function POST(req) {
    const reqBody = await req.json();
    const { userInput } = reqBody;
    const safe = {
        "HARM_CATEGORY_HARASSMENT": "BLOCK_NONE",
        "HARM_CATEGORY_HATE_SPEECH": "BLOCK_NONE",
        "HARM_CATEGORY_SEXUALLY_EXPLICIT": "BLOCK_NONE",
        "HARM_CATEGORY_DANGEROUS_CONTENT": "BLOCK_NONE",
        "HARM_CATEGORY_RECITATION": "BLOCK_NONE",  // Allow recitation
    };

    // Load the PDF document (adjust the path as needed)
    const pdfPath = path.resolve(process.cwd(), 'public', 'GameManual.pdf');
    const pdfContent = await loadPdfDocument(pdfPath);

    // Get all URLs from both the FTC Javadoc and the learnroadrunner websites
    const ftcUrls = await getUrlsFromIndexPage("https://ftctechnh.github.io/ftc_app/doc/javadoc/index.html");
    const roadrunnerUrls = await getUrlsFromIndexPage("https://learnroadrunner.com/");
    const homeostasisUrls = await getUrlsFromIndexPage("https://www.ctrlaltftc.com/");

    // Scrape content from both websites
    const ftcContent = await loadWebsiteContent(ftcUrls);
    const roadrunnerContent = await loadWebsiteContent(roadrunnerUrls);

    // Combine all content (PDF, FTC website, and Roadrunner website)
    const fullContext = pdfContent + "\n" + ftcContent + "\n" + roadrunnerContent + "\n" + homeostasisUrls;

    // Split the content into chunks
    const contentChunks = await splitContentIntoChunks(fullContext);

    // Limit the context size to avoid large input issues (optional step if needed)
    const truncatedContext = contentChunks.slice(0, 5).join("\n"); // Adjust limit as needed

    // Add user input to chat history
    chatHistory.push({ role: "human", content: userInput });

    // Initialize Google Generative AI chatbot
    const api = new ChatGoogleGenerativeAI({
        model: "gemini-1.5-flash",
        temperature: 0,
        maxRetries: 2,
        safe,
    });

    // Prepare the messages for the API call
    const messages = [
        {
            role: "system",
            content: "You are a helpful assistant trained on the content of the game manual, FTC documentation, and Roadrunner. Answer user questions using this knowledge. If you don't know the answer or if the question is unrelated, don't make up an answer."
        },
        {
            role: "human",
            content: `${truncatedContext}\n\nUser: ${userInput}`,
        },
        ...chatHistory.map(entry => ({ role: entry.role, content: entry.content })),
    ];

    try {
        // Stream the response from the chatbot
        const stream = await api.stream(messages);

        const chunks = [];
        for await (const chunk of stream) {
            chunks.push(chunk.content); // Assuming chunk.content contains the message
            console.log(chunk.content);
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
