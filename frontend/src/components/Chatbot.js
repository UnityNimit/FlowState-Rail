import React, { useState, useEffect, useRef, useCallback } from 'react';
import './Chatbot.css';
import {
  FiSend,
  FiTerminal,
  FiTrash2
} from 'react-icons/fi';
import socketService from '../services/socketService';

const QUICK_PROMPTS = [
  { label: 'Contention Analysis', query: 'Analyze current junction bottlenecks and track circuit contention.' },
  { label: 'Train Precedence', query: 'Explain which trains are held and the priority precedence applied.' },
  { label: 'Joint Possessions', query: 'List active maintenance blocks and their impact on timetable capacity.' },
  { label: 'Speed & OHE Status', query: 'Are there any track condition faults or isolated OHE groups active?' }
];

const Chatbot = ({ networkState }) => {
  const [messages, setMessages] = useState([
    {
      id: 'sys-init',
      sender: 'ai',
      text: 'RailOps AI Section Copilot initialized. Standing by for corridor telemetry queries, conflict analysis, and G&SR operational rule lookups.',
      timestamp: new Date().toLocaleTimeString('en-GB')
    }
  ]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, isThinking]);

  useEffect(() => {
    const handleThinking = () => setIsThinking(true);
    const handleResponse = (response) => {
      setIsThinking(false);
      setMessages((prev) => [
        ...prev,
        {
          id: `res-${Date.now()}`,
          sender: 'ai',
          text: response.text || 'Telemetry acknowledged.',
          timestamp: new Date().toLocaleTimeString('en-GB')
        }
      ]);
    };

    socketService.on('chatbot:thinking', handleThinking);
    socketService.on('chatbot:response', handleResponse);

    return () => {
      socketService.off('chatbot:thinking');
      socketService.off('chatbot:response');
    };
  }, []);

  const sendQuery = useCallback(
    (queryString) => {
      const query = (queryString || currentMessage).trim();
      if (!query || isThinking) return;

      const userMsg = {
        id: `user-${Date.now()}`,
        sender: 'user',
        text: query,
        timestamp: new Date().toLocaleTimeString('en-GB')
      };

      setMessages((prev) => [...prev, userMsg]);
      setCurrentMessage('');

      socketService.emit('chatbot:query', {
        question: query,
        networkState: networkState || {}
      });
    },
    [currentMessage, isThinking, networkState]
  );

  const handleFormSubmit = (e) => {
    e.preventDefault();
    sendQuery();
  };

  const handleClearHistory = () => {
    setMessages([
      {
        id: `sys-${Date.now()}`,
        sender: 'ai',
        text: 'Terminal session cleared. Telemetry listeners active.',
        timestamp: new Date().toLocaleTimeString('en-GB')
      }
    ]);
  };

  const trainCount = networkState?.trains?.length || 0;
  const runningCount = networkState?.trains?.filter((t) => t.state === 'RUNNING').length || 0;
  const faultCount =
    networkState?.network?.trackSegments?.filter((s) => s.status === 'FAULTY' || s.status === 'MAINTENANCE')
      .length || 0;

  return (
    <div className="chatbot-console-container">
      {/* Telemetry Status Strip */}
      <div className="console-status-strip">
        <div className="telemetry-indicators">
          <span className="live-dot" />
          <span className="telemetry-item">TRAFFIC: {runningCount}/{trainCount} ACTIVE</span>
          <span className="telemetry-separator">·</span>
          <span className="telemetry-item">ISOLATIONS: {faultCount}</span>
        </div>
        <button
          type="button"
          onClick={handleClearHistory}
          className="console-clear-btn"
          title="Clear Terminal Session"
        >
          <FiTrash2 />
        </button>
      </div>

      {/* Message Output Feed */}
      <div className="console-messages-feed">
        {messages.map((msg) => {
          const isAi = msg.sender === 'ai';
          return (
            <div key={msg.id} className={`terminal-msg-block ${isAi ? 'ai' : 'user'}`}>
              <div className="msg-header-line">
                <span className="msg-sender-tag">
                  {isAi ? <FiTerminal className="tag-icon" /> : null}
                  {isAi ? 'RAIL-OPS COPILOT' : 'CONTROLLER'}
                </span>
                <span className="msg-time">{msg.timestamp}</span>
              </div>
              <div className="msg-body-content">{msg.text}</div>
            </div>
          );
        })}

        {isThinking && (
          <div className="terminal-msg-block ai thinking">
            <div className="msg-header-line">
              <span className="msg-sender-tag">
                <FiTerminal className="tag-icon" />
                RAIL-OPS COPILOT
              </span>
              <span className="msg-time">QUERYING LLM...</span>
            </div>
            <div className="terminal-typing-indicator">
              <span className="pulse-bracket">[</span>
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="pulse-bracket">]</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Tactical Quick-Action Prompts */}
      <div className="quick-prompts-tray">
        {QUICK_PROMPTS.map((item, index) => (
          <button
            key={index}
            type="button"
            className="quick-prompt-chip"
            onClick={() => sendQuery(item.query)}
            disabled={isThinking}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Command Input Form */}
      <form className="console-input-bar" onSubmit={handleFormSubmit}>
        <div className="input-prompt-symbol">&gt;</div>
        <input
          type="text"
          className="console-text-input"
          placeholder="Enter command or query (e.g. why is train 12004 held)..."
          value={currentMessage}
          onChange={(e) => setCurrentMessage(e.target.value)}
          disabled={isThinking}
        />
        <button
          type="submit"
          className="console-send-trigger"
          disabled={isThinking || !currentMessage.trim()}
          title="Transmit Query (Enter)"
        >
          <FiSend />
        </button>
      </form>
    </div>
  );
};

export default Chatbot;