import React, { useState, useEffect, useRef } from 'react';
import './Chatbot.css';
import { FiSend } from 'react-icons/fi';
import socketService from '../services/socketService';

const Chatbot = ({ networkState }) => {
    const [messages, setMessages] = useState([
        { sender: 'ai', text: 'Welcome, Controller. Start a simulation and then ask me anything about the network state.' }
    ]);
    const [currentMessage, setCurrentMessage] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const messagesEndRef = useRef(null); 

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, [messages]);

    useEffect(() => {
        const handleThinking = () => setIsThinking(true);
        const handleResponse = (response) => {
            setMessages(prev => [...prev, response]);
            setIsThinking(false);
        };

        socketService.on('chatbot:thinking', handleThinking);
        socketService.on('chatbot:response', handleResponse);

        return () => {
            socketService.off('chatbot:thinking');
            socketService.off('chatbot:response');
        };
    }, []);
    
    // Reset welcome message if simulation stops
    useEffect(() => {
        if (!networkState) {
             setMessages([
                { sender: 'ai', text: 'Welcome, Controller. Start a simulation and then ask me anything about the network state.' }
            ]);
        }
    }, [networkState]);


    const handleSendMessage = (e) => {
        e.preventDefault();
        const question = currentMessage.trim();
        if (!question || !networkState) return; // Prevent sending if sim is stopped

        setMessages(prev => [...prev, { sender: 'user', text: question }]);
        setCurrentMessage('');

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
                    <div className="message-bubble ai thinking">
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
                    disabled={isThinking || !networkState} // Disable if sim is stopped
                />
                <button type="submit" className="chatbot-send-btn" disabled={isThinking || !currentMessage.trim() || !networkState}>
                    <FiSend />
                </button>
            </form>
        </div>
    );
};

export default Chatbot;