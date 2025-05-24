<template>
  <div class="ai-chat-box">
    <div class="chat-header">
      <h3>AI 助手</h3>
      <div class="model-info">
        <span class="model-name">DeepSeek-R1:32B</span>
        <span :class="['status-indicator', isConnected ? 'connected' : 'disconnected']"></span>
      </div>
    </div>

    <div class="chat-messages" ref="messagesContainer">
      <div v-for="(message, index) in messages" 
           :key="index" 
           :class="['message', message.role]">
        <div class="message-header">
          <i :class="message.role === 'assistant' ? 'fas fa-robot' : 'fas fa-user'"></i>
          {{ message.role === 'assistant' ? 'AI' : '您' }}
        </div>
        <div class="message-content" v-html="formatMessage(message.content)"></div>
      </div>
      <div v-if="isLoading" class="typing-indicator">
        <span></span><span></span><span></span>
      </div>
    </div>

    <div class="chat-input">
      <textarea
        v-model="inputMessage"
        placeholder="输入您的问题..."
        @keydown.enter.prevent="sendMessage"
        :disabled="isLoading"
        rows="3"
      ></textarea>
      <button 
        @click="sendMessage" 
        :disabled="isLoading || !inputMessage.trim()"
        class="send-button"
      >
        <i class="fas fa-paper-plane"></i>
      </button>
    </div>
  </div>
</template>

<script>
import axios from 'axios';
import { marked } from 'marked';

export default {
  name: 'AIChatBox',
  
  data() {
    return {
      messages: [],
      inputMessage: '',
      isLoading: false,
      isConnected: true,
      apiUrl: 'http://210.27.197.27:11434/api/chat',
    };
  },

  methods: {
    async sendMessage() {
      if (!this.inputMessage.trim() || this.isLoading) return;

      const userMessage = this.inputMessage.trim();
      this.messages.push({
        role: 'user',
        content: userMessage
      });
      this.inputMessage = '';
      this.isLoading = true;

      try {
        const response = await axios.post(this.apiUrl, {
          model: 'deepseek-r1:32b',
          messages: [{
            role: 'user',
            content: userMessage
          }]
        });

        if (response.data && response.data.message) {
          this.messages.push({
            role: 'assistant',
            content: response.data.message
          });
        }

        this.scrollToBottom();
      } catch (error) {
        console.error('AI对话出错:', error);
        this.messages.push({
          role: 'assistant',
          content: '抱歉，我遇到了一些问题。请稍后再试。'
        });
        this.isConnected = false;
      } finally {
        this.isLoading = false;
      }
    },

    formatMessage(content) {
      try {
        return marked(content || '');
      } catch (error) {
        return content;
      }
    },

    scrollToBottom() {
      this.$nextTick(() => {
        const container = this.$refs.messagesContainer;
        container.scrollTop = container.scrollHeight;
      });
    }
  }
};
</script>

<style scoped>
.ai-chat-box {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: white;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.chat-header {
  padding: 16px 20px;
  background: #f8f9fa;
  border-bottom: 1px solid #eee;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.chat-header h3 {
  margin: 0;
  font-size: 18px;
  color: #2c3e50;
}

.model-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #666;
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-indicator.connected {
  background: #4caf50;
}

.status-indicator.disconnected {
  background: #f44336;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: #f8f9fa;
}

.message {
  max-width: 85%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.message.user {
  align-self: flex-end;
}

.message.assistant {
  align-self: flex-start;
}

.message-header {
  font-size: 14px;
  color: #666;
  display: flex;
  align-items: center;
  gap: 6px;
}

.message-content {
  padding: 12px 16px;
  border-radius: 12px;
  background: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.message.user .message-content {
  background: #e3f2fd;
  color: #1a1a1a;
}

.chat-input {
  padding: 16px;
  background: white;
  border-top: 1px solid #eee;
  display: flex;
  gap: 12px;
}

textarea {
  flex: 1;
  padding: 12px;
  border: 2px solid #e6e8eb;
  border-radius: 8px;
  resize: none;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.5;
  transition: all 0.3s;
}

textarea:focus {
  border-color: #1976d2;
  outline: none;
  box-shadow: 0 0 0 3px rgba(25, 118, 210, 0.1);
}

.send-button {
  padding: 8px 16px;
  background: #1976d2;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
}

.send-button:hover:not(:disabled) {
  background: #1565c0;
}

.send-button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.typing-indicator {
  display: flex;
  gap: 4px;
  padding: 12px;
  align-self: flex-start;
}

.typing-indicator span {
  width: 8px;
  height: 8px;
  background: #666;
  border-radius: 50%;
  animation: typing 1s infinite ease-in-out;
}

.typing-indicator span:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-indicator span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes typing {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}

/* Markdown 样式 */
.message-content :deep(p) {
  margin: 0 0 8px 0;
}

.message-content :deep(code) {
  background: #f1f1f1;
  padding: 2px 4px;
  border-radius: 4px;
  font-family: monospace;
}

.message-content :deep(pre) {
  background: #f1f1f1;
  padding: 12px;
  border-radius: 4px;
  overflow-x: auto;
}

.message-content :deep(p:last-child) {
  margin-bottom: 0;
}
</style> 