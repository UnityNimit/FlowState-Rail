import React, { useState, useEffect, useRef } from 'react';
import './Chatbot.css';
import { FiSend } from 'react-icons/fi';
import socketService from '../services/socketService';

const Chatbot = ({ networkState }) => {
    const [messages, setMessages] = useState([
        { sender: 'ai', text: 'Welcome, Controller. Ask me anything about the current network state.' }
    ]);
    const [currentMessage, setCurrentMessage] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const messagesEndRef = useRef(null); // Ref to auto-scroll

    // Effect to auto-scroll to the bottom of the chat on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); // Adjusted block for better scroll behavior
    }, [messages]);

    useEffect(() => {
        socketService.on('chatbot:thinking', () => setIsThinking(true));
        socketService.on('chatbot:response', (response) => {
            setMessages(prev => [...prev, response]);
            setIsThinking(false);
        });

        return () => {
            socketService.off('chatbot:thinking');
            socketService.off('chatbot:response');
        };
    }, []);

    const handleSendMessage = (e) => {
        e.preventDefault();
        const question = currentMessage.trim();
        if (!question) return;

        // Add user's message to the history immediately
        setMessages(prev => [...prev, { sender: 'user', text: question }]);
        setCurrentMessage('');

        // Send the question and the CURRENT network state to the backend
        socketService.emit('chatbot:query', { question, networkState });
    };

    return (
        <div className="chatbot-container">
            <div className="chatbot-messages">
                {messages.map((msg, index) => (
                    <div key={index} className={`message-bubble ${msg.sender}`}>
                        {msg.text}
                    </div>
                ))}
                {isThinking && (
                    <div className="message-bubble ai thinking"> {/* Added 'thinking' class */}
                        <div className="typing-indicator">
                            <span></span><span></span><span></span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>
            <form className="chatbot-input-form" onSubmit={handleSendMessage}>
                <input
                    type="text"
                    className="chatbot-input"
                    placeholder="Ask about trains, tracks, or signals..."
                    value={currentMessage}
                    onChange={(e) => setCurrentMessage(e.target.value)}
                    disabled={isThinking}
                />
                <button type="submit" className="chatbot-send-btn" disabled={isThinking || !currentMessage.trim()}>
                    <FiSend />
                </button>
            </form>
        </div>
    );
};

export default Chatbot;