"use client";
import { useState, useRef, useEffect } from 'react';

export default function Home() {
    const [userInput, setUserInput] = useState('');
    const [chatOutput, setChatOutput] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showExamples, setShowExamples] = useState(true);
    const [loadingMessage, setLoadingMessage] = useState(''); // State for loading message

    // Reference for the chat container to auto-scroll
    const chatContainerRef = useRef(null);

    const exampleQuestions = [
        "What is the FTC Game Manual?",
        "How do I register my team?",
        "What are the rules for this year's competition?",
        "Can you explain the different roles in a robotics team?"
    ];

    // Function to auto-scroll to the bottom of the chat
    const scrollToBottom = () => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    };

    // Scroll to the bottom whenever chatOutput changes
    useEffect(() => {
        scrollToBottom();
    }, [chatOutput]);

    const handleChat = async (input) => {
        if (loading || !input.trim()) return; // Prevent sending if loading or input is empty

        setLoading(true);
        setLoadingMessage(''); // Reset loading message
        const loadingTimeout = setTimeout(() => {
            setLoadingMessage('It’s taking a bit more than usual...');
        }, 10000); // Set timeout for 5 seconds

        const res = await fetch('/api/llm-response', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ userInput: input }),
        });

        clearTimeout(loadingTimeout); // Clear timeout if response is received
        const data = await res.json();
        setLoading(false);
        setLoadingMessage(''); // Clear loading message after response

        if (res.ok) {
            const formattedResponse = data.response
                .replace(/(?<!\*)\*\*(.+?)\*\*(?!:)/g, '<strong>$1</strong>')
                .replace(/\* (.+?)(?=\n|\r)/g, '<li>$1</li>')
                .replace(/<li>/g, '<li class="list-disc ml-5">')
                .replace(/\n/g, '<br />');

            setChatOutput(prev => [
                ...prev,
                { role: 'user', content: input },
                { role: 'bot', content: formattedResponse },
            ]);
            setUserInput('');
            setShowExamples(false);

            // Scroll to bottom after the question is asked
            scrollToBottom();
        } else {
            console.error(data.error);
        }
    };

    const handleExampleQuestion = (question) => {
        setUserInput(question);
        handleChat(question);
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter') {
            handleChat(userInput);
        }
    };

    return (
        <div className="flex flex-col items-center justify-between min-h-screen bg-gray-900 text-gray-100 p-4">
            {/* Full-Width Title */}
            <div className="w-full bg-gray-800 p-4 fixed top-0 left-0 shadow-lg flex justify-center items-center">
                <h1 className="text-3xl font-bold text-center mr-6">ChatFTC</h1>
            </div>

            {/* Watermark */}
            <h1 className="text-l text-gray-400 mt-16 text-center">Created by Meer Patel from MakEMinds #23786</h1>

            {/* Chat Area */}
            <div className="border border-gray-700 rounded-lg w-full max-w-4xl h-128 overflow-hidden bg-gray-800 shadow-md mt-4 mb-16 flex-grow">
                <div className="h-full flex flex-col">
                    <div ref={chatContainerRef} className="flex-grow overflow-y-auto p-4">
                        <div className="flex flex-col space-y-4">
                            {chatOutput.map((message, index) => (
                                <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`p-3 rounded-lg ${message.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-200'}`}>
                                        <span dangerouslySetInnerHTML={{ __html: message.content }} />
                                    </div>
                                </div>
                            ))}
                            {loading && (
                                <div className="flex justify-start">
                                    <div className="flex items-center">
                                        <div className="animate-spin h-5 w-5 border-4 border-blue-600 border-t-transparent rounded-full"></div>
                                        <span className="ml-2">Loading...</span>
                                    </div>
                                    {loadingMessage && <p className="text-gray-400 text-sm ml-2">{loadingMessage}</p>} {/* Loading message */}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {showExamples && (
                <div className="flex w-full max-w-4xl mt-4 mb-16 flex-wrap justify-center">
                    {exampleQuestions.map((question, index) => (
                        <button
                            key={index}
                            onClick={() => handleExampleQuestion(question)}
                            className="bg-gray-700 text-gray-100 p-2 rounded-lg mx-1 my-1 hover:bg-gray-600 transition"
                        >
                            {question}
                        </button>
                    ))}
                </div>
            )}

            {/* Full-Width Input Area */}
            <div className="w-full bg-gray-800 p-4 fixed bottom-0 left-0 shadow-lg flex items-center justify-center">
                <div className="flex max-w-4xl w-full">
                    <input
                        type="text"
                        value={userInput}
                        onChange={(e) => setUserInput(e.target.value)}
                        onKeyDown={handleKeyPress}
                        placeholder="Ask something..."
                        className="flex-grow bg-gray-700 text-gray-100 p-3 rounded-l-lg focus:outline-none focus:ring focus:ring-blue-500 shadow-md" // Set padding for height
                        style={{ minHeight: '48px' }} // Set minimum height
                        disabled={loading} // Disable input when loading
                    />
                    <button
                        onClick={() => handleChat(userInput)}
                        className={`bg-blue-600 text-white px-4 rounded-r-lg transition shadow-md ${loading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-500'}`}
                        style={{ minHeight: '48px' }} // Set minimum height
                        disabled={loading} // Disable button when loading
                    >
                        Send
                    </button>
                </div>
            </div>
        </div>
    );
}
