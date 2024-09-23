"use client";
import { useState } from 'react';

export default function Home() {
    const [userInput, setUserInput] = useState('');
    const [chatOutput, setChatOutput] = useState([]);
    const [loading, setLoading] = useState(false); // Loading state
    const [showExamples, setShowExamples] = useState(true); // State to track example visibility

    const exampleQuestions = [
        "What is the FTC Game Manual?",
        "How do I register my team?",
        "What are the rules for this year's competition?",
        "Can you explain the different roles in a robotics team?"
    ];

    const handleChat = async (input) => {
        setLoading(true); // Set loading to true
        const res = await fetch('/api/llm-response', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ userInput: input }),
        });

        const data = await res.json();
        setLoading(false); // Set loading to false

        if (res.ok) {
            const formattedResponse = data.response
                .replace(/(?<!\*)\*\*(.+?)\*\*(?!:)/g, '<strong>$1</strong>') // Make bold text unless followed by a colon
                .replace(/\* (.+?)(?=\n|\r)/g, '<li>$1</li>') // Format bullets
                .replace(/<li>/g, '<li class="list-disc ml-5">') // Add Tailwind styles for bullet points
                .replace(/\n/g, '<br />');

            setChatOutput(prev => [
                ...prev,
                { role: 'user', content: input },
                { role: 'bot', content: formattedResponse },
            ]);
            setUserInput(''); // Clear input
            setShowExamples(false); // Hide example questions after first input
        } else {
            console.error(data.error);
        }
    };

    const handleExampleQuestion = (question) => {
        setUserInput(question);
        handleChat(question); // Send the question directly to the API
    };

    return (
        <div className="flex flex-col items-center justify-between min-h-screen bg-gray-100 text-gray-900 p-4">
            <h1 className="text-3xl font-bold mb-6 fixed top-4 left-1/2 transform -translate-x-1/2">ChatFTC</h1>
            <div className="border border-gray-300 rounded-lg w-full max-w-4xl h-128 overflow-hidden bg-white shadow-md mt-20 mb-16"> {/* Added margin to offset the fixed title */}
                <div className="h-full flex flex-col">
                    <div className="flex-grow overflow-y-auto p-4 "> {/* Chat output area */}
                        <div className="flex flex-col space-y-4">
                            {chatOutput.map((message, index) => (
                                <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`p-3 rounded-lg ${message.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800'}`}>
                                        <span dangerouslySetInnerHTML={{ __html: message.content }} />
                                    </div>
                                </div>
                            ))}
                            {loading && ( // Show loading indicator
                                <div className="flex justify-start">
                                    <div className="p-3 bg-gray-200 text-gray-800 rounded-lg">
                                        Loading...
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            {showExamples && ( // Conditional rendering of example buttons
                <div className="flex w-full max-w-4xl mt-4 mb-16"> {/* Added margin for spacing */}
                    {exampleQuestions.map((question, index) => (
                        <button
                            key={index}
                            onClick={() => handleExampleQuestion(question)} // Call the function with the question
                            className="bg-gray-200 text-gray-900 p-2 rounded-lg mx-1 hover:bg-gray-300 transition"
                        >
                            {question}
                        </button>
                    ))}
                </div>
            )}
            <div className="flex w-full max-w-4xl fixed bottom-4"> {/* Fixed input area */}
                <input
                    type="text"
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    placeholder="Ask something..."
                    className="flex-grow bg-gray-200 text-gray-900 p-2 rounded-l-lg focus:outline-none focus:ring focus:ring-blue-500 w-full" // Input takes full width
                />
                <button
                    onClick={() => handleChat(userInput)} // Pass user input to handleChat
                    className="bg-blue-600 text-white px-4 rounded-r-lg hover:bg-blue-500 transition"
                >
                    Send
                </button>
            </div>
        </div>
    );
}
