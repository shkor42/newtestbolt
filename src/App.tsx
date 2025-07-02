import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Bot, User, Settings } from 'lucide-react';

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  isStreaming?: boolean;
  thinking?: string;
}

function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      content: "Hello! I'm your AI assistant. How can I help you today?",
      role: 'assistant'
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('qwen/qwen3-235b-a22b');
  const [showThinking, setShowThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  
  const availableModels = [
    { id: 'qwen/qwen3-235b-a22b', name: 'Qwen3 (235B)', thinking: true },
    { id: 'anthropic/claude-3-5-sonnet-20240620', name: 'Claude 3.5', thinking: true },
    { id: 'openai/gpt-4o', name: 'GPT-4o', thinking: false },
    { id: 'meta-llama/llama-3-70b', name: 'Llama 3 70B', thinking: false }
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = {
      id: Date.now().toString(),
      content: input,
      role: 'user' as const
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    controllerRef.current = new AbortController();

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer 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',
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [...messages, userMessage].map(msg => ({
            role: msg.role,
            content: msg.content
          })),
          stream: true
        }),
        signal: controllerRef.current.signal
      });

      if (!response.ok) throw new Error('Network response was not ok');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessageId = Date.now().toString();
      let assistantMessageContent = '';
      let assistantThinkingContent = '';
      
      // Add empty assistant message to start streaming into
      setMessages(prev => [...prev, {
        id: assistantMessageId,
        content: '',
        role: 'assistant',
        isStreaming: true,
        thinking: ''
      }]);

      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim() !== '');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            
            try {
              const json = JSON.parse(data);
              const content = json.choices[0]?.delta?.content || '';
              
              // Basic parsing for thinking/output format
              if (showThinking && content.includes('Thinking:')) {
                const parts = content.split('Output:');
                assistantThinkingContent += parts[0].replace('Thinking:', '').trim();
                assistantMessageContent = parts[1]?.trim() || '';
              } else {
                assistantMessageContent += content;
              }
              
              setMessages(prev => 
                prev.map(msg => 
                  msg.id === assistantMessageId 
                    ? { 
                        ...msg, 
                        content: assistantMessageContent, 
                        thinking: assistantThinkingContent 
                      } 
                    : msg
                )
              );
            } catch (error) {
              console.error('Error parsing JSON:', error);
            }
          }
        }
      }

      // Update the final message
      setMessages(prev => 
        prev.map(msg => 
          msg.id === assistantMessageId 
            ? { ...msg, isStreaming: false } 
            : msg
        )
      );
      
    } catch (error) {
      if (error.name !== 'AbortError') {
        setMessages(prev => [
          ...prev,
          {
            id: Date.now().toString(),
            content: "I'm having trouble connecting to the AI service. Please try again.",
            role: 'assistant'
          }
        ]);
      }
    } finally {
      setIsLoading(false);
      controllerRef.current = null;
    }
  };

  const stopStream = () => {
    if (controllerRef.current) {
      controllerRef.current.abort();
      controllerRef.current = null;
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col p-4 md:p-8">
      <div className="max-w-4xl w-full mx-auto bg-white rounded-xl shadow-lg overflow-hidden flex flex-col h-[80vh]">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 text-white">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-bold flex items-center">
              <Bot className="w-6 h-6 mr-2" />
              AI Chat Assistant
            </h1>
            <div className="flex items-center gap-3">
              <div className="relative">
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="bg-blue-700 text-white text-sm rounded-lg px-3 py-1.5 appearance-none pr-8"
                >
                  {availableModels.map(model => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
                <Settings className="w-4 h-4 absolute right-2 top-1.5 text-blue-200" />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={showThinking}
                  onChange={(e) => setShowThinking(e.target.checked)}
                  className="rounded text-blue-500 focus:ring-blue-500"
                  disabled={!availableModels.find(m => m.id === selectedModel)?.thinking}
                />
                <span>Thinking</span>
              </label>
            </div>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((message) => (
            <div 
              key={message.id} 
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[80%] rounded-lg px-4 py-2 ${
                message.role === 'user' 
                  ? 'bg-blue-600 text-white rounded-br-none' 
                  : 'bg-gray-100 text-gray-800 rounded-bl-none'
              }`}>
                <div className="flex items-start gap-2">
                  {message.role === 'assistant' && (
                    <Bot className="w-5 h-5 mt-0.5 flex-shrink-0 text-indigo-500" />
                  )}
                  <div className="flex-1 prose prose-sm">
                    {message.role === 'assistant' && showThinking && message.thinking && (
                      <div className="text-gray-500 text-xs italic mb-2">
                        {message.thinking} {message.isStreaming && '...'}
                      </div>
                    )}
                    {message.content || (
                      <span className="animate-pulse">▍</span>
                    )}
                  </div>
                  {message.role === 'user' && (
                    <User className="w-5 h-5 mt-0.5 flex-shrink-0 text-blue-200" />
                  )}
                </div>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 rounded-lg px-4 py-2 rounded-bl-none animate-pulse">
                <div className="flex items-center gap-2">
                  <Bot className="w-5 h-5 text-indigo-500" />
                  <span className="text-gray-500">Thinking...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="border-t p-4 bg-gray-50">
          <form onSubmit={handleSend} className="flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
              className="flex-1 p-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none h-12"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(e);
                }
              }}
            />
            {isLoading ? (
              <button
                type="button"
                onClick={stopStream}
                className="bg-red-500 hover:bg-red-600 text-white p-3 rounded-lg transition-colors"
              >
                <Loader2 className="w-5 h-5 animate-spin" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-5 h-5" />
              </button>
            )}
          </form>
          <p className="text-xs text-gray-500 mt-2 text-center">
            Powered by OpenRouter AI • Type a message to start chatting
          </p>
        </div>
      </div>
    </div>
  );
}

export default App;
