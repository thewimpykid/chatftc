import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import path from 'path';

// In-memory storage for embeddings and chat history
let chatHistory = [];
let pdfEmbeddings = [];

// Function to split content using RecursiveCharacterTextSplitter
async function splitContent(text) {
    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
    });
    return await splitter.splitText(text);
}

// Function to create embeddings for each chunk of the PDF content
async function createEmbeddings(textChunks, embedModel) {
    const embeddings = await embedModel.embedDocuments(textChunks);
    return embeddings;
}

// Function to find the most relevant chunk based on the user query
function findRelevantChunk(userEmbedding, embeddings) {
    let mostRelevantIndex = 0;
    let highestSimilarity = -Infinity;

    embeddings.forEach((embedding, index) => {
        const similarity = cosineSimilarity(userEmbedding, embedding); // Calculate cosine similarity
        if (similarity > highestSimilarity) {
            highestSimilarity = similarity;
            mostRelevantIndex = index;
        }
    });

    return mostRelevantIndex;
}

// Cosine similarity function (helper)
function cosineSimilarity(vecA, vecB) {
    const dotProduct = vecA.reduce((acc, val, idx) => acc + val * vecB[idx], 0);
    const magnitudeA = Math.sqrt(vecA.reduce((acc, val) => acc + val * val, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((acc, val) => acc + val * val, 0));
    return dotProduct / (magnitudeA * magnitudeB);
}

export async function POST(req) {
    const reqBody = await req.json();
    const { userInput } = reqBody;

    // Load the PDF document and create embeddings if not already done
    if (pdfEmbeddings.length === 0) {
        try {
            const pdfPath = path.resolve(process.cwd(), 'public', 'GameManual.pdf');
            const loader = new PDFLoader(pdfPath);
            const pdfDocs = await loader.load();

            const combinedContent = pdfDocs.map(doc => doc.pageContent).join("\n");
            const chunks = await splitContent(combinedContent);

            // Create embeddings for the document chunks
            const embedModel = new GoogleGenerativeAIEmbeddings({
                apiKey: process.env.GOOGLE_API_KEY, // Ensure you have your API key
                modelName: "embedding-001",
            });
            pdfEmbeddings = await createEmbeddings(chunks, embedModel);
        } catch (error) {
            console.error("Error loading or embedding PDF:", error.message);
            return new Response(JSON.stringify({ error: "Error loading or embedding PDF" }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }
    }

    // Generate embedding for the user query
    const embedModel = new GoogleGenerativeAIEmbeddings({
        apiKey: process.env.GOOGLE_API_KEY,
        modelName: "embedding-001",
    });
    const userEmbedding = await embedModel.embedQuery(userInput);

    // Find the most relevant chunk based on the user query
    const relevantChunkIndex = findRelevantChunk(userEmbedding, pdfEmbeddings);
    const relevantContext = pdfEmbeddings[relevantChunkIndex];

    // Initialize the Google Generative AI chatbot
    const api = new ChatGoogleGenerativeAI({
        model: "gemini-1.5-flash",
        temperature: 0,
        maxRetries: 2,
    });

    // Add user input to chat history
    chatHistory.push({ role: "human", content: userInput });

    // Prepare the messages for the API call
    const messages = [
        {
            role: "system",
            content: "You are a helpful assistant trained on the content of the game manual for Into the Deep. Please use the provided context to answer the user's questions. If you do not know the answer or if the question is unrelated to the context (specifically about Into the Deep or the FTC Game Manual), don't make up an answer. If the question is not specific, assume it is about the Theme Into the Deep",
        },
        {
            role: "human",
            content: `${relevantContext}\n\nUser: ${userInput}`,
        },
        ...chatHistory.map(entry => ({ role: entry.role, content: entry.content })),
    ];

    try {
        const stream = await api.stream(messages);
        const chunks = [];

        for await (const chunk of stream) {
            chunks.push(chunk.content);
            console.log(chunk.content);
        }

        const finalResponse = chunks.join("");
        chatHistory.push({ role: "assistant", content: finalResponse });

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
