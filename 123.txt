<template>
  <div class="voice-chat-container">
    <!-- 背景动画容器 -->
    <div class="background-animation" ref="backgroundAnimation"></div>

    <!-- 1. 顶部状态栏 (原 chat-header) -->
    <div class="status-bar">
      <div class="status-left">
        <div class="ai-avatar">
          <i class="fas fa-robot"></i>
        </div>
        <div class="ai-info">
          <h3>文物领域智能语音助手</h3>
          <div class="ai-status">
            <span class="status-dot"></span>
            <span id="connection-status">模型：{{ llmModel }}</span>
          </div>
        </div>
      </div>
      <div class="status-right">
        <!-- 查看知识库按钮 -->
        <button @click="showAllNodes" class="control-btn" title="查看知识库所有实体">
          <i class="fas fa-database"></i>
        </button>
        <!-- TTS 开关按钮 -->
        <button @click="toggleTTS"
                class="control-btn tts-toggle"
                :class="{ active: isTTSEnabled }"
                :title="isTTSEnabled ? '关闭语音播报' : '开启语音播报'">
          <i :class="isTTSEnabled ? 'fas fa-volume-up' : 'fas fa-volume-mute'"></i>
        </button>
        <!-- 连接状态指示器 (作为按钮的一部分，或独立显示) -->
        <button class="control-btn" :class="{ active: isConnected, 'not-supported': !isConnected }" :title="isConnected ? '知识库已连接' : '知识库未连接'" disabled>
          <i :class="isConnected ? 'fas fa-check-circle' : 'fas fa-times-circle'"></i>
        </button>
        <!-- 调试模式切换按钮 -->
        <button
          @click="toggleDebug"
          class="control-btn debug-toggle"
          :class="{ active: debug }"
          title="切换调试信息显示"
        >
          <i class="fas fa-bug"></i>
        </button>
      </div>
    </div>

    <!-- 2. 聊天消息区域 (作为主要内容区) -->
    <div class="chat-messages" ref="chatMessages">
      <div v-for="(message, index) in chatMessages"
           :key="index"
           :class="['conversation-item', message.role]">
        <div :class="['conversation-text']">
          <!-- 消息头部，如果需要可以在这里显示，否则直接显示文本 -->
          <div class="message-header-new">
            <div class="message-role-new">
              <i :class="getRoleIcon(message.role)"></i>
              <span>{{ getRoleName(message.role) }}</span>
            </div>
            <div v-if="message.source && message.role === 'assistant'"
                 :class="['message-source-new', `source-${message.source}`]">
              <i :class="getSourceIcon(message.source)"></i>
              <span>{{ getSourceName(message.source) }}</span>
            </div>
          </div>
          <details v-if="message.role === 'assistant' && message.hasThinking" class="thinking-steps-new">
            <summary>
              <i class="fas fa-brain"></i> 思考过程 <i class="fas fa-chevron-down details-arrow"></i>
            </summary>
            <pre class="thinking-steps-content-new">{{ message.thinkingContent || '无详细思考过程记录。' }}</pre>
          </details>
          <div class="message-text-new" v-html="formatMessage(message.mainContent || message.content)"></div>
          <div v-if="message.queryDetails && debug" class="query-details debug-only">
             <strong>原始查询详情 (Debug):</strong>
            <pre>{{ JSON.stringify(message.queryDetails, null, 2) }}</pre>
          </div>
        </div>
      </div>
    </div>

    <!-- 3. 语音可视化叠加层 (当语音交互时显示) -->
    <transition name="voice-overlay-fade">
      <div class="voice-overlay" v-if="isListening || isTyping">
        <div class="voice-visualizer">
          <button class="voice-button"
                  :class="{ listening: isListening, speaking: isTyping && !isListening && isSpeakingOnlyTTS }"
                  @click="toggleListening"
                  :disabled="!speechRecognitionSupported">
            <i :class="getVoiceOverlayIcon"></i>
            <div class="voice-waves" :class="{ active: isListening || (isTyping && !isSpeakingOnlyTTS) || isSpeakingOnlyTTS }">
              <div class="wave-bar"></div>
              <div class="wave-bar"></div>
              <div class="wave-bar"></div>
              <div class="wave-bar"></div>
              <div class="wave-bar"></div>
            </div>
          </button>
        </div>
        <div class="status-text" id="status-text">
            <span v-if="isListening">正在听取您的语音...</span>
            <span v-else-if="isTyping && !isSpeakingOnlyTTS">
                正在思考
                <div class="loading-dots">
                    <div class="loading-dot"></div><div class="loading-dot"></div><div class="loading-dot"></div>
                </div>
            </span>
            <span v-else-if="isSpeakingOnlyTTS">正在为您播报回答...</span>
            <span v-else>点击麦克风开始语音对话</span>
        </div>
        <div class="interim-text" id="interim-text">{{ interimTranscript ? `"${interimTranscript}"` : (isListening ? '请开始说话' : '') }}</div>
      </div>
    </transition>

    <!-- 4. 旧调试信息面板 (仅在 debug 模式下显示) -->
    <div v-if="debug" class="debug-panel debug-only">
      <div class="debug-section">
        <h4>当前分析 (旧 Debug)</h4>
        <pre>{{ currentAnalysis || '无' }}</pre>
      </div>
      <div class="debug-section">
        <h4>当前查询 (旧 Debug)</h4>
        <pre>{{ currentQuery || '无' }}</pre>
      </div>
    </div>

    <!-- 5. 聊天输入区域 (原 chat-input) -->
    <div class="bottom-controls">
       <button
        @click="toggleListening"
        :class="['bottom-btn', 'mic-button-small', { active: isListening, 'not-supported': !speechRecognitionSupported }]"
        :title="speechRecognitionSupported ? (isListening ? '停止录音' : '开始录音 (语音输入)') : '语音输入不受支持'"
        :disabled="isTyping || !speechRecognitionSupported"
      >
        <i :class="isListening ? 'fas fa-microphone-slash' : 'fas fa-microphone'"></i>
         <span>语音输入</span>
      </button>
      <textarea
        v-model="userInput"
        @keydown="handleKeydown"
        placeholder="请输入您的问题或点击麦克风说话..."
        :disabled="isTyping || isListening"
        ref="userInputArea"
        rows="1"
        @input="autoGrowTextarea"
      ></textarea>
      <button
        @click="sendMessage"
        :disabled="isTyping || !userInput.trim() || isListening"
        title="发送消息 (Enter)"
        class="send-button-new bottom-btn"
      >
        <i class="fas fa-paper-plane"></i>
        <span>发送</span>
      </button>
    </div>
  </div>
</template>

<script>
import axios from 'axios';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

export default {
  name: 'AIAssistantWithTTS',
  data() {
    return {
      // --- API 配置 ---
      apiBaseUrl: 'http://localhost:3000/api/data',
      aiApiUrl: 'http://210.27.197.62:11434/api/chat',
      llmModel: 'deepseek-r1:32b',

      // --- 状态管理 ---
      chatMessages: [],
      userInput: '',
      isTyping: false, // AI正在生成回复 (或正在处理中，包括思考和等待API响应)
      debug: false,
      isConnected: false,

      // --- 旧调试信息 ---
      currentAnalysis: null,
      currentQuery: null,

      // --- 其他配置 ---
      typingSpeed: 0, // 设为0，因为语音交互时打字效果可能干扰
      cache: new Map(),

      // --- TTS (Text-to-Speech) 相关状态 ---
      isTTSEnabled: true,
      speechSynthesis: null,
      currentUtterance: null,
      voices: [],
      selectedVoiceURI: null,
      isSpeakingOnlyTTS: false, // 新增：AI是否正在播报，用于区分LLM生成过程中的isTyping

      // --- STT (Speech-to-Text) 相关状态 ---
      isListening: false, // 用户是否正在录音
      speechRecognition: null,
      speechRecognitionSupported: true, // 标记浏览器是否支持STT
      interimTranscript: '', // 临时识别结果，用于界面显示
      autoSendOnSpeechEnd: true, // 语音识别结束后是否自动发送
    };
  },

  computed: {
      getVoiceOverlayIcon() {
          if (this.isListening) {
              return 'fas fa-stop'; // 正在听取时显示停止图标
          } else if (this.isTyping && !this.isSpeakingOnlyTTS) {
              return 'fas fa-spinner fa-spin'; // AI思考或生成中
          } else if (this.isSpeakingOnlyTTS) {
              return 'fas fa-volume-up'; // AI正在播报
          }
          return 'fas fa-microphone'; // 默认麦克风图标
      }
  },

  created() {
    this.testDatabaseConnection();
  },

  mounted() {
    // --- TTS 初始化 ---
    if ('speechSynthesis' in window) {
      this.speechSynthesis = window.speechSynthesis;
      this.loadVoices();
      if (this.speechSynthesis.onvoiceschanged !== undefined) {
        this.speechSynthesis.onvoiceschanged = this.loadVoices;
      }
    } else {
      console.warn('浏览器不支持 SpeechSynthesis API。TTS 功能将不可用。');
      this.isTTSEnabled = false; // 如果不支持，则禁用TTS按钮可能更好
    }

    // --- STT 初始化 ---
    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
      const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.speechRecognition = new SpeechRecognitionAPI();
      this.speechRecognition.continuous = false; // 说完一句就结束
      this.speechRecognition.interimResults = true; // 获取中间结果
      this.speechRecognition.lang = 'zh-CN';    // 设置识别语言

      this.speechRecognition.onstart = () => {
        console.log('语音识别服务已启动');
        this.isListening = true;
        this.interimTranscript = ''; // 清空上一次的临时结果
        // 用户开始录音，立即取消任何正在进行的TTS播报
        if (this.speechSynthesis && this.speechSynthesis.speaking) {
          this.speechSynthesis.cancel();
          this.isSpeakingOnlyTTS = false;
        }
      };

      this.speechRecognition.onresult = (event) => {
        let finalTranscript = '';
        this.interimTranscript = ''; // 重置，然后用最新的填充

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            this.interimTranscript += transcript;
          }
        }

        if (finalTranscript.trim() && this.isListening) {
            this.userInput = finalTranscript.trim(); // 填充到输入框
        }
      };

      this.speechRecognition.onerror = (event) => {
        console.error('语音识别错误:', event.error);
        let errorMsg = `语音识别遇到问题: ${event.error}`;
        if (event.error === 'no-speech') {
          errorMsg = '未检测到语音，请重试。';
        } else if (event.error === 'audio-capture') {
          errorMsg = '无法访问麦克风，请检查硬件或驱动。';
        } else if (event.error === 'not-allowed') {
          errorMsg = '麦克风权限被拒绝。请在浏览器设置中允许访问麦克风。';
        }
        this.addSystemMessage(errorMsg);
        this.isListening = false;
        this.interimTranscript = '';
        this.isTyping = false; // 确保错误时也停止显示思考动画
        this.isSpeakingOnlyTTS = false; // 确保错误时停止TTS播报状态
      };

      this.speechRecognition.onend = () => {
        console.log('语音识别服务已断开');
        this.isListening = false;
        this.$nextTick(() => { // 确保interimTranscript更新到DOM后再清空
            this.interimTranscript = '';
        });
        if (this.userInput.trim() && this.autoSendOnSpeechEnd) {
          this.sendMessage();
        } else if (this.userInput.trim()) {
          this.$refs.userInputArea.focus(); // 让用户可以编辑或手动发送
        }
      };
    } else {
      console.warn('浏览器不支持 SpeechRecognition API。语音输入功能将不可用。');
      this.speechRecognitionSupported = false;
      this.addSystemMessage('抱歉，您的浏览器不支持语音输入功能。');
    }

    const welcomeMessage = '您好！我是文物领域智能语音助手，请问有什么可以帮您的？点击麦克风图标可以开始语音输入。';
    this.addSystemMessage(welcomeMessage);
    this.autoGrowTextarea(); // 初始化文本框高度
    this.initBackgroundAnimation(); // 初始化背景动画
  },

  beforeUnmount() {
    // 组件卸载前取消任何正在进行的TTS和STT
    if (this.speechSynthesis && this.speechSynthesis.speaking) {
      this.speechSynthesis.cancel();
    }
    if (this.speechRecognition && this.isListening) {
      this.speechRecognition.stop();
    }
    // 清理背景动画的计时器
    if (this._animationInterval) {
      clearInterval(this._animationInterval);
    }
  },

  methods: {
    initBackgroundAnimation() {
        const container = this.$refs.backgroundAnimation;
        if (!container) return;

        this._animationInterval = setInterval(() => {
            const wave = document.createElement('div');
            wave.className = 'wave';

            const size = Math.random() * 100 + 50; // 50 to 150px
            wave.style.width = size + 'px';
            wave.style.height = size + 'px';
            wave.style.left = Math.random() * 100 + '%';
            wave.style.top = Math.random() * 100 + '%';
            wave.style.animationDuration = `${Math.random() * 3 + 3}s`; // 3s to 6s

            container.appendChild(wave);

            // Clean up old waves after their animation duration
            setTimeout(() => {
                wave.remove();
            }, parseFloat(wave.style.animationDuration) * 1000);
        }, 1500); // Create a new wave every 1.5 seconds
    },

    autoGrowTextarea() {
      const textarea = this.$refs.userInputArea;
      if (textarea) {
        textarea.style.height = 'auto'; // 重置高度以便正确计算 scrollHeight
        textarea.style.height = textarea.scrollHeight + 'px';
      }
    },
    handleKeydown(event) {
      if (this.isListening) {
         this.speechRecognition.stop(); // 如果用户在录音时打字，停止录音
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        this.sendMessage();
      }
       this.$nextTick(this.autoGrowTextarea); // Shift+Enter换行时也调整高度
    },

    async sendMessage() {
      if (this.isListening) {
         this.speechRecognition.stop(); // 如果因某种原因仍在监听，则停止
      }
      const userMessage = this.userInput.trim();
      if (!userMessage || this.isTyping) return;

      // 发送消息前取消任何正在进行的TTS播报
      if (this.speechSynthesis && this.speechSynthesis.speaking) {
        this.speechSynthesis.cancel();
        this.isSpeakingOnlyTTS = false;
      }

      this.chatMessages.push({ role: 'user', content: userMessage, mainContent: userMessage });
      this.userInput = ''; // 清空输入框
      this.$nextTick(this.autoGrowTextarea); // 重置文本框高度
      this.isTyping = true; // AI正在处理（包括思考和等待API响应）
      this.scrollToBottom();

      const thinkingSteps = this.initializeThinkingSteps(userMessage);

      try {
        thinkingSteps.entityExtraction.attempted = true;
        const extractedEntities = await this.extractEntitiesWithLLM(userMessage, thinkingSteps);
        thinkingSteps.entityExtraction.results = extractedEntities;

        let knowledgeContext = '';
        let kgResult = null;
        let kgSource = 'none';

        if (extractedEntities.length > 0 && this.isConnected) {
          thinkingSteps.knowledgeGraphLookup.attempted = true;
          const entityToSearch = extractedEntities[0].name;
          thinkingSteps.knowledgeGraphLookup.entityUsed = entityToSearch;
          kgResult = await this.queryKnowledgeGraphDirectly(entityToSearch, thinkingSteps);
          if (!kgResult) {
            kgResult = await this.queryKnowledgeGraphSemantically(userMessage, thinkingSteps);
          }
          if (kgResult) {
            kgSource = thinkingSteps.knowledgeGraphLookup.queryType;
            thinkingSteps.knowledgeGraphLookup.success = true;
          }
        } else if (!this.isConnected) {
             thinkingSteps.knowledgeGraphLookup.resultSummary = '知识库未连接，跳过查询。';
        } else {
          thinkingSteps.knowledgeGraphLookup.resultSummary = '未提取到有效实体，跳过知识图谱查询。';
        }

        if (kgResult) {
          knowledgeContext = this.formatKnowledgeGraphResults(kgResult);
          thinkingSteps.knowledgeGraphLookup.resultSummary = `通过 ${kgSource} 方式查询 "${thinkingSteps.knowledgeGraphLookup.entityUsed}" 找到 ${kgResult.nodes?.length || 0} 个节点, ${kgResult.relationships?.length || 0} 条关系。`;
          thinkingSteps.finalOutcome.source = 'knowledge_graph';
        } else {
          thinkingSteps.finalOutcome.source = 'model';
        }

        const finalPrompt = this.buildFinalPrompt(userMessage, knowledgeContext, thinkingSteps);
        thinkingSteps.answerGeneration.prompt = finalPrompt;

        const assistantMessage = {
          role: 'assistant',
          content: '', mainContent: '', thinkingContent: '', hasThinking: false,
          source: thinkingSteps.finalOutcome.source,
          thinkingSteps: thinkingSteps,
          queryDetails: this.debug ? kgResult : null
        };
        this.chatMessages.push(assistantMessage);
        this.scrollToBottom();

        await this.streamLLMResponse(finalPrompt, assistantMessage);

      } catch (error) {
        console.error('[sendMessage] 处理消息时发生顶层错误:', error);
        thinkingSteps.finalOutcome.source = 'error';
        thinkingSteps.finalOutcome.errorMessage = error.message;
        this.isTyping = false;
        this.isSpeakingOnlyTTS = false;
        this.showError(error, thinkingSteps);
      } finally {
        this.isTyping = false; // 最终结束思考动画
        this.isSpeakingOnlyTTS = false; // 确保播报状态也重置
        this.$nextTick(() => this.scrollToBottom());
      }
    },

    initializeThinkingSteps(userInput) {
        return {
            userInput: userInput,
            entityExtraction: { method: 'LLM (专用实体提取)', attempted: false, rawInput: userInput, prompt: null, rawResponse: null, results: [], error: null },
            knowledgeGraphLookup: { attempted: false, entityUsed: null, queryType: 'none', queryDetails: null, success: false, rawResult: null, resultSummary: '未尝试知识图谱查询', error: null },
            answerGeneration: { prompt: null, llmResponse: null, error: null },
            finalOutcome: { source: 'model', errorMessage: null }
        };
    },
    async extractEntitiesWithLLM(userMessage, thinkingSteps) {
      const prompt = `
任务：请从以下用户问题中，精准地提取出最核心的名词性实体（例如：人名、地名、组织名、物品名称、概念术语等）。
用户问题：
"${userMessage}"
提取要求：
1.  专注于识别问题指向的核心查询对象。
2.  必须忽略所有非实体词语，例如：疑问词（"谁", "什么", "哪里"），动词（"介绍", "是", "查询"），代词（"你", "我", "它"），连词（"和", "与"），语气助词（"啊", "呢", "吗"），以及描述性或指示性短语（"给我介绍一下", "的信息", "有关于", "关于"）。
3.  目标是提取出用户真正想查询的那个"东西"或"人"的名字。
4.  示例：
    - 输入："你给我介绍一下鎏金天王铜造像" -> 输出：["鎏金天王铜造像"]
    - 输入："王海洋是谁？" -> 输出：["王海洋"]
    - 输入："查询北京大学和清华大学的关系" -> 输出：["北京大学", "清华大学"]
    - 输入："苹果公司的总部在哪里" -> 输出：["苹果公司"]
    - 输入："什么是人工智能" -> 输出：["人工智能"]
    - 输入："天安门广场" -> 输出：["天安门广场"]
    - 输入："我想了解图计算技术" -> 输出：["图计算技术"]
5.  以 JSON 格式返回结果，包含一个名为 "entities" 的数组，数组中的每个元素是提取到的实体字符串。
6.  如果分析后认为问题中没有明确的核心实体可供提取（例如闲聊或非常模糊的问题 "你好啊"），则返回空的 "entities" 数组。
7.  **！！！重要：绝对只输出 JSON 对象本身，前后不要包含任何解释性文字、说明、代码块标记（如 \`\`\`json ... \`\`\`）或其他任何非 JSON 内容。**
JSON 输出格式示例（仅包含实体名称字符串数组）：
{
  "entities": ["实体1", "实体2"]
}
或 (如果找不到)：
{
  "entities": []
}`;
      thinkingSteps.entityExtraction.prompt = prompt;
      try {
        const response = await axios.post(this.aiApiUrl, {
          model: this.llmModel,
          messages: [{ role: 'user', content: prompt }],
          stream: false, // 实体提取不需要流式响应
          options: { response_format: { type: "json_object" } }
        });
        thinkingSteps.entityExtraction.rawResponse = JSON.stringify(response.data);
        const extractedData = this.extractJSONFromLLMResponse(response.data);
        if (extractedData && Array.isArray(extractedData.entities) && extractedData.entities.every(e => typeof e === 'string')) {
          const validEntities = extractedData.entities
            .map(name => name.trim())
            .filter(name => name.length >= 2 && name.length < 50);
          return validEntities.map(name => ({ name: name, confidence: null }));
        } else {
          thinkingSteps.entityExtraction.error = "LLM 返回格式不正确或未提取到实体";
          return [];
        }
      } catch (error) {
        thinkingSteps.entityExtraction.error = `LLM API 调用失败: ${error.message}`;
        return [];
      }
    },
    extractJSONFromLLMResponse(response) {
      if (!response) return null;
      let jsonString = '';
      if (typeof response === 'object' && response.message?.content) {
        jsonString = response.message.content;
      } else if (typeof response === 'string') {
        jsonString = response;
      } else if (typeof response === 'object') {
        try { JSON.parse(JSON.stringify(response)); return response; }
        catch { jsonString = JSON.stringify(response); }
      } else { return null; }
      try { return JSON.parse(jsonString); } catch (e1) { /* ignore */ }
      try { const m = jsonString.match(/```(?:json)?\s*([\s\S]*?)\s*```/); if(m && m[1]) return JSON.parse(m[1]); } catch (e2) { /* ignore */ }
      try { const m = jsonString.match(/\{[\s\S]*\}/); if(m && m[0]) return JSON.parse(m[0]); } catch (e3) { /* ignore */ }
      return null;
    },
    buildFinalPrompt(userMessage, knowledgeContext, thinkingSteps) {
      const kgAttempted = thinkingSteps.knowledgeGraphLookup.attempted;
      const kgSuccess = thinkingSteps.knowledgeGraphLookup.success;
      const entityUsed = thinkingSteps.knowledgeGraphLookup.entityUsed || '用户询问的主题';
      const baseInstructions = `
【重要指令】:
1.  **分离思考与回答**：将你所有的分析、推理、步骤拆解等内部思考过程，**完全**放入 <think>...</think> 标签内。
2.  **最终答案**：在 <think> 标签之外，**只输出**直接面向用户的最终回答。这个回答必须简洁、流畅、完整且独立于思考过程。
3.  **禁止在最终答案中包含思考痕迹**：最终答案中不应出现诸如"首先，我需要..."、"接下来，..." 、"因此，..."、"我的分析是..."等引导思考过程的词语。直接给出结论或信息。
4.  **基于信息源**：如果提供了【知识图谱信息】，最终答案必须严格基于这些信息；如果没有，则基于你的通用知识。
5.  **自然语言**：使用自然、专业的语言。
6.  **Markdown格式**: 使用 Markdown 格式化回答（例如列表、加粗）。`;

      if (knowledgeContext) {
        return `你是一个严谨的知识问答助手。请严格根据下面提供的【知识图谱信息】来回答【用户问题】。
【知识图谱信息】:
\`\`\`
${knowledgeContext}
\`\`\`
【用户问题】:
"${userMessage}"
${baseInstructions}
【补充要求 - 基于知识图谱】:
-   如果信息足够回答，请直接总结输出答案。
-   如果信息不足以回答问题的某个方面，请在最终答案中明确说明（例如："关于 ${entityUsed} 的[某方面]，我目前没有详细信息。"）。
-   **不要**在最终答案开头说"根据知识图谱..."，直接开始回答。`;
      } else if (kgAttempted && !kgSuccess) {
        return `你是一个智能助手。用户询问了关于 "${entityUsed}" 的问题，但在知识库中未能找到相关信息（原因：${thinkingSteps.knowledgeGraphLookup.error || '未找到匹配项'}）。
【用户问题】:
"${userMessage}"
${baseInstructions}
【补充要求 - 查询失败】:
-   在最终答案中，首先告知用户在知识库中未找到关于 "${entityUsed}" 的具体信息。
-   然后，尝试基于你的通用知识库，对用户的问题提供一个可能的、一般性的回答（如果可以）。
-   如果通用知识也无法回答，请在最终答案中坦诚说明。`;
      } else {
        return `你是一个乐于助人的智能助手。请根据你的通用知识回答以下用户问题。
【用户问题】:
"${userMessage}"
${baseInstructions}
【补充要求 - 通用回答】:
-   如果问题具体但你的知识库中没有信息，请在最终答案中坦诚告知。
-   回答应清晰、简洁。`;
      }
    },
    async streamLLMResponse(finalPrompt, assistantMessage) {
        try {
            // 使用 axios 的默认行为，它会等待所有数据接收完毕后将response.data作为完整的文本字符串返回
            // 虽然设置了 stream: true，但 axios 在浏览器环境中处理该选项的方式可能与 Node.js 不同
            // 对于 Ollama 这种逐行返回 JSON 的 API，axios 会将所有行累积到一个字符串中
            const response = await axios.post(this.aiApiUrl, {
                model: this.llmModel,
                messages: [{ role: 'user', content: finalPrompt }],
                stream: true, // 保持此设置，以匹配服务器的预期行为，但实际处理方式兼容axios在浏览器中的表现
            }, { responseType: 'text' }); // 明确声明期望文本响应

            let streamedContent = '';
            let mainContentAccumulator = '';
            let thinkingContentAccumulator = '';
            let inThinkingBlock = false;

            // 这里，response.data 已经是完整的字符串了，我们对其进行按行处理
            const lines = response.data.split('\n');

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    // Ollama 的 stream 响应可能会在每行前加 'data: '
                    const data = JSON.parse(line.replace('data: ', ''));
                    let chunk = '';
                    if (data.message?.content) chunk = data.message.content;
                    else if (data.response) chunk = data.response; // 兼容其他LLM的响应格式

                    if (chunk) {
                        streamedContent += chunk;
                        assistantMessage.content = streamedContent; // 完整的原始内容

                        // 分离主内容和思考过程
                        let currentChunkPos = 0;
                        while (currentChunkPos < chunk.length) {
                            if (inThinkingBlock) {
                                const endTagIndex = chunk.indexOf('</think>', currentChunkPos);
                                if (endTagIndex !== -1) {
                                    thinkingContentAccumulator += chunk.substring(currentChunkPos, endTagIndex);
                                    inThinkingBlock = false;
                                    currentChunkPos = endTagIndex + '</think>'.length;
                                } else {
                                    thinkingContentAccumulator += chunk.substring(currentChunkPos);
                                    currentChunkPos = chunk.length;
                                }
                            } else {
                                const startTagIndex = chunk.indexOf('<think>', currentChunkPos);
                                if (startTagIndex !== -1) {
                                    mainContentAccumulator += chunk.substring(currentChunkPos, startTagIndex);
                                    inThinkingBlock = true;
                                    currentChunkPos = startTagIndex + '<think>'.length;
                                } else {
                                    mainContentAccumulator += chunk.substring(currentChunkPos);
                                    currentChunkPos = chunk.length;
                                }
                            }
                        }
                        assistantMessage.mainContent = mainContentAccumulator;
                        assistantMessage.thinkingContent = thinkingContentAccumulator;
                        assistantMessage.hasThinking = thinkingContentAccumulator.trim().length > 0;

                        this.$forceUpdate(); // 强制Vue更新DOM
                        this.scrollToBottom();
                    }
                    if (data.done) break; // 结束标志
                } catch (e) {
                     // 如果某一行不是有效的JSON，作为普通文本追加
                     console.warn("非JSON行或解析错误:", line, e);
                     if (!inThinkingBlock) mainContentAccumulator += line + '\n'; else thinkingContentAccumulator += line + '\n';
                     assistantMessage.mainContent = mainContentAccumulator;
                     assistantMessage.thinkingContent = thinkingContentAccumulator;
                     this.$forceUpdate(); this.scrollToBottom();
                }
            }

            // 流式响应结束后，再次进行最终解析，以确保内容完整和正确分离
            const finalParsed = this.parseThinkTags(streamedContent);
            assistantMessage.content = streamedContent.trim();
            assistantMessage.mainContent = finalParsed.mainContent;
            assistantMessage.thinkingContent = finalParsed.thinkingContent;
            assistantMessage.hasThinking = finalParsed.hasThinking;
            if (assistantMessage.thinkingSteps) {
                assistantMessage.thinkingSteps.answerGeneration.llmResponse = streamedContent.trim();
                assistantMessage.thinkingSteps.finalOutcome.source = assistantMessage.source;
            }

            this.$forceUpdate();
            this.scrollToBottom();

            // 语音播报：只在内容完整后进行一次播报
            if (this.isTTSEnabled && assistantMessage.mainContent && assistantMessage.role === 'assistant') {
                const textToSpeak = this.cleanTextForSpeech(assistantMessage.mainContent);
                this.startSpeaking(textToSpeak); // 使用统一的播报方法
            }

        } catch (error) {
            const finalErrorMessage = `抱歉，我在尝试回答时遇到了一个内部错误。(${error.message})`;
            if (assistantMessage) {
                assistantMessage.content = finalErrorMessage;
                assistantMessage.mainContent = `抱歉，我在尝试回答时遇到了一个内部错误。`; // TTS播报部分更简洁
                assistantMessage.source = 'error';
                if (assistantMessage.thinkingSteps) {
                    assistantMessage.thinkingSteps.answerGeneration.error = `LLM API 调用失败: ${error.message}`;
                    assistantMessage.thinkingSteps.finalOutcome.source = 'error';
                    assistantMessage.thinkingSteps.finalOutcome.errorMessage = error.message;
                }
            } else {
                 this.chatMessages.push({ role: 'assistant', content: finalErrorMessage, mainContent: `抱歉，我在尝试回答时遇到了一个内部错误。`, source: 'error', hasThinking: false });
            }
            if (this.isTTSEnabled) {
                this.startSpeaking(this.cleanTextForSpeech(finalErrorMessage)); // 使用统一的播报方法
            }
            this.$forceUpdate();
            this.scrollToBottom();
        } finally {
             this.isTyping = false; // 确保在流式响应结束后停止思考动画
        }
    },
    parseThinkTags(text) {
      if (!text) return { mainContent: '', thinkingContent: '', hasThinking: false };
      let mainContent = ''; let thinkingContent = ''; let lastIndex = 0;
      const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
      let match;
      while ((match = thinkRegex.exec(text)) !== null) {
        mainContent += text.substring(lastIndex, match.index);
        thinkingContent += match[1].trim() + '\n\n';
        lastIndex = thinkRegex.lastIndex;
      }
      mainContent += text.substring(lastIndex);
      mainContent = mainContent.trim(); thinkingContent = thinkingContent.trim();
      return { mainContent: mainContent, thinkingContent: thinkingContent, hasThinking: thinkingContent.length > 0 };
    },
    async queryKnowledgeGraphDirectly(entityName, thinkingSteps) {
      const encodedEntity = encodeURIComponent(entityName);
      const queryUrl = `${this.apiBaseUrl}/${encodedEntity}`;
      thinkingSteps.knowledgeGraphLookup.queryType = 'direct_api';
      thinkingSteps.knowledgeGraphLookup.queryDetails = `GET ${queryUrl}`;
      try {
        const response = await axios.get(queryUrl);
        thinkingSteps.knowledgeGraphLookup.rawResult = response.data;
        const isValidResponse = response.data && ((Array.isArray(response.data) && response.data.length > 0) || (typeof response.data === 'object' && Object.keys(response.data).length > 0 && !Array.isArray(response.data)));
        if (isValidResponse) {
          const formattedResult = this.formatDirectQueryResult(response.data, entityName);
          formattedResult._source = 'direct_api';
          return formattedResult;
        } else {
          thinkingSteps.knowledgeGraphLookup.resultSummary = `直接 API 查询 /${encodedEntity} 未返回有效数据。`;
          return null;
        }
      } catch (error) {
        if (error.response && error.response.status === 404) {
            thinkingSteps.knowledgeGraphLookup.resultSummary = `直接 API 查询 /${encodedEntity} 未找到实体 (404)。`;
        } else {
            thinkingSteps.knowledgeGraphLookup.error = `直接 API 查询失败: ${error.message}`;
            thinkingSteps.knowledgeGraphLookup.resultSummary = `直接 API 查询 /${encodedEntity} 失败。`;
        }
        return null;
      }
    },
    async queryKnowledgeGraphSemantically(userMessage, thinkingSteps) {
      const queryUrl = `${this.apiBaseUrl}/semantic-search`;
      const requestBody = { question: userMessage };
      thinkingSteps.knowledgeGraphLookup.queryType = 'semantic_api';
      thinkingSteps.knowledgeGraphLookup.queryDetails = `POST ${queryUrl}\nBody: ${JSON.stringify(requestBody)}`;
      try {
        const response = await axios.post(queryUrl, requestBody);
        thinkingSteps.knowledgeGraphLookup.rawResult = response.data;
        if (response.data && Array.isArray(response.data.nodes) && response.data.nodes.length > 0) {
          response.data._source = 'semantic_api';
          thinkingSteps.knowledgeGraphLookup.error = null;
          return response.data;
        } else {
          if (!thinkingSteps.knowledgeGraphLookup.success) {
              thinkingSteps.knowledgeGraphLookup.resultSummary = `语义搜索 API 未找到 "${userMessage}" 的相关数据。`;
          }
          return null;
        }
      } catch (error) {
         if (!thinkingSteps.knowledgeGraphLookup.success) {
            thinkingSteps.knowledgeGraphLookup.error = `语义搜索 API 失败: ${error.message}`;
            thinkingSteps.knowledgeGraphLookup.resultSummary = `语义搜索 API 调用失败。`;
         }
        return null;
      }
    },
    formatDirectQueryResult(data, queriedEntityName) {
        const result = { nodes: [], relationships: [], _source: 'direct_api' };
        const nodeMap = new Map();
        if (Array.isArray(data)) {
            data.forEach((item, index) => {
                if (item.node1 && item.node1.name) {
                    const nodeId = `node1_${index}_${item.node1.name}`;
                    if (!nodeMap.has(item.node1.name)) {
                         nodeMap.set(item.node1.name, nodeId);
                         result.nodes.push({ id: nodeId, name: item.node1.name, labels: item.node1.labels || ['Entity'], properties: item.node1 });
                    }
                }
                if (item.node2 && item.node2.name) {
                    const nodeId = `node2_${index}_${item.node2.name}`;
                    if (!nodeMap.has(item.node2.name)) {
                        nodeMap.set(item.node2.name, nodeId);
                         result.nodes.push({ id: nodeId, name: item.node2.name, labels: item.node2.labels || ['Entity'], properties: item.node2 });
                    }
                }
                if (item.relationship && item.node1?.name && item.node2?.name) {
                    result.relationships.push({ id: `rel_${index}_${item.relationship}`, type: item.relationship, startNode: nodeMap.get(item.node1.name), endNode: nodeMap.get(item.node2.name), properties: item.relationshipProperties || {} });
                }
            });
        } else if (typeof data === 'object' && data !== null && data.name) {
             const nodeId = `node_${data.name}`;
             if (!nodeMap.has(data.name)) {
                 nodeMap.set(data.name, nodeId);
                 result.nodes.push({ id: nodeId, name: data.name, labels: data.labels || ['Entity'], properties: data });
             }
        } else {
              const nodeId = `node_${queriedEntityName}`;
               if (!nodeMap.has(queriedEntityName)) {
                 nodeMap.set(queriedEntityName, nodeId);
                 result.nodes.push({ id: nodeId, name: queriedEntityName, labels: ['Unknown'], properties: typeof data === 'object' ? data : { value: data } });
             }
         }
        return result;
    },
    formatKnowledgeGraphResults(data) {
      let context = ''; const nodesById = {};
      if (data.nodes && data.nodes.length > 0) {
        context += '【相关实体信息】:\n';
        data.nodes.forEach(node => {
          nodesById[node.id] = node;
          context += `- 实体: ${node.name || node.id}`;
          if (node.labels && node.labels.length > 0) context += ` (类型: ${node.labels.join(', ')})`;
          const props = Object.entries(node.properties || {}).filter(([key]) => !['name','id','labels'].includes(key.toLowerCase()) && !key.toLowerCase().includes('embedding')).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('; ');
          if (props) context += ` | 属性: ${props}\n`; else context += '\n';
        });
      } else { context += '【未找到相关实体信息】\n'; return context.trim(); }
      if (data.relationships && data.relationships.length > 0) {
        context += '\n【相关关系信息】:\n';
        data.relationships.forEach(rel => {
          const startNode = nodesById[rel.startNode] || { name: `[节点ID:${rel.startNode}]` };
          const endNode = nodesById[rel.endNode] || { name: `[节点ID:${rel.endNode}]` };
          context += `- (${startNode.name}) -[${rel.type}]-> (${endNode.name})`;
          const props = Object.entries(rel.properties || {}).filter(([key]) => !key.toLowerCase().includes('embedding')).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('; ');
          if (props) context += ` | 关系属性: ${props}\n`; else context += '\n';
        });
      } else { context += '\n【未找到相关关系信息】'; }
      return context.trim();
    },
    async testDatabaseConnection() {
      try {
        const response = await axios.get(this.apiBaseUrl, { timeout: 5000 });
        if (response.status === 200) {
          this.isConnected = true;
          this.addSystemMessage('✅ 知识库连接成功！');
        } else { throw new Error(`连接测试返回状态码: ${response.status}`); }
      } catch (error) {
        this.isConnected = false;
        this.addSystemMessage('⚠️ 无法连接到知识库，部分功能可能受限。');
      }
    },
    async showAllNodes() {
        if (!this.isConnected) { this.addSystemMessage("知识库未连接，无法获取实体列表。"); return; }
        this.isTyping = true; this.addSystemMessage("正在查询知识库中的所有实体...");
        try {
            const response = await axios.get(this.apiBaseUrl);
            if (response.data && Array.isArray(response.data)) {
                const nodes = new Set();
                 response.data.forEach(item => {
                    if (item.node1?.name) nodes.add(item.node1.name);
                    if (item.node2?.name) nodes.add(item.node2.name);
                    if(item.name) nodes.add(item.name);
                 });
                if (nodes.size > 0) {
                    let message = `知识库中目前包含以下 ${nodes.size} 个实体:\n\n${Array.from(nodes).sort().map(name => `- ${name}`).join('\n')}`;
                     this.addSystemMessage(message);
                } else { this.addSystemMessage("知识库中暂无实体数据。"); }
            } else { this.addSystemMessage("无法从后端获取有效的实体列表数据。"); }
        } catch (error) { this.addSystemMessage(`获取节点列表时出错: ${error.response?.data?.message || error.message}`); }
        finally { this.isTyping = false; this.scrollToBottom(); }
    },
    formatMessage(content) {
      if (!content) return '';
      try { return DOMPurify.sanitize(marked.parse(content)); }
      catch (error) { return content; }
    },
    addSystemMessage(content) {
      const message = {
        role: 'system',
        content: content, mainContent: content,
        source: 'system', timestamp: new Date()
      };
      this.chatMessages.push(message);
      this.$nextTick(() => this.scrollToBottom());
      if (this.isTTSEnabled && this.speechSynthesis && content) {
        const textToSpeak = this.cleanTextForSpeech(content);
        this.startSpeaking(textToSpeak); // 使用统一的播报方法
      }
    },
    showError(error, thinkingSteps) {
      const errorMessage = error.response?.data?.error || error.response?.data?.message || error.message;
      const errorDetails = this.debug ? `\n\n调试信息：${JSON.stringify(error.response?.data || error, null, 2)}` : '';
      const fullUserMessage = `抱歉，处理您的请求时遇到了问题：${errorMessage}${errorDetails}`;

      const errorMsgObject = {
        role: 'assistant',
        content: fullUserMessage, mainContent: `抱歉，处理您的请求时遇到了问题：${errorMessage}`, // TTS只播报核心错误
        source: 'error', thinkingSteps: thinkingSteps
      };
      this.chatMessages.push(errorMsgObject);
      this.$nextTick(() => this.scrollToBottom());
      if (this.isTTSEnabled && this.speechSynthesis) {
        const textToSpeak = this.cleanTextForSpeech(errorMsgObject.mainContent);
        this.startSpeaking(textToSpeak); // 使用统一的播报方法
      }
    },

    // --- TTS Methods ---
    loadVoices() {
      if (!this.speechSynthesis) return;
      this.voices = this.speechSynthesis.getVoices();
      // 优先选择本地服务的中文语音
      const chineseVoice = this.voices.find(voice => voice.lang.startsWith('zh-CN') && voice.localService);
      if (chineseVoice) {
        this.selectedVoiceURI = chineseVoice.voiceURI;
      } else {
         // 如果没有本地服务，选择任何可用的中文语音
         const anyChineseVoice = this.voices.find(voice => voice.lang.startsWith('zh-CN'));
         if(anyChineseVoice) this.selectedVoiceURI = anyChineseVoice.voiceURI;
      }
    },
    toggleTTS() {
      this.isTTSEnabled = !this.isTTSEnabled;
      // 如果关闭TTS，立即停止播报
      if (!this.isTTSEnabled && this.speechSynthesis && this.speechSynthesis.speaking) {
        this.speechSynthesis.cancel();
        this.isSpeakingOnlyTTS = false;
      }
    },
    // 统一的语音播报方法
    startSpeaking(text) {
      if (!this.isTTSEnabled || !this.speechSynthesis || !text || text.trim().length === 0) {
        console.log("TTS skipped: disabled, no synthesis, or empty text.");
        return;
      }

      // 立即取消任何正在进行的播报，防止重叠
      if (this.speechSynthesis.speaking) {
        this.speechSynthesis.cancel();
        console.log("TTS cancelled previous speech.");
      }

      this.currentUtterance = new SpeechSynthesisUtterance(text);
      if (this.selectedVoiceURI) {
        const voice = this.voices.find(v => v.voiceURI === this.selectedVoiceURI);
        if (voice) this.currentUtterance.voice = voice;
      }
      // 如果没有指定语音或指定语音不支持中文，强制设置为中文
      if(!this.currentUtterance.voice || !this.currentUtterance.voice.lang.startsWith('zh')) {
          this.currentUtterance.lang = 'zh-CN';
      }

      this.currentUtterance.onend = () => {
        this.currentUtterance = null;
        this.isSpeakingOnlyTTS = false; // 播报结束，重置状态
        console.log('TTS finished speaking.');
      };
      this.currentUtterance.onerror = (event) => {
        console.error('TTS Error:', event.error);
        this.currentUtterance = null;
        this.isSpeakingOnlyTTS = false; // 播报出错，重置状态
      };

      // 启动播报前设置状态
      this.isSpeakingOnlyTTS = true;
      console.log('TTS starting speech:', text);
      this.speechSynthesis.speak(this.currentUtterance);
    },
    cleanTextForSpeech(markdownText) {
      if (!markdownText) return '';
      let text = markdownText;
      // 移除代码块
      text = text.replace(/```[\s\S]*?```/g, ' (代码部分) ');
      // 移除行内代码
      text = text.replace(/`([^`]+)`/g, '$1');
      // 移除图片
      text = text.replace(/!\[(.*?)\]\(.*?\)/g, '(图片: $1) ');
      // 移除链接
      text = text.replace(/\[(.*?)\]\(.*?\)/g, '$1');
      // 移除Markdown标题
      text = text.replace(/^#{1,6}\s+/gm, '');
      // 移除加粗/斜体标记
      text = text.replace(/(\*\*|__)(.*?)\1/g, '$2');
      text = text.replace(/(\*|_)(.*?)\1/g, '$2');
      // 移除水平线
      text = text.replace(/^(-{3,}|\*{3,}|_{3,})$/gm, '');
      // 移除列表标记
      text = text.replace(/^\s*[*+-]\s+/gm, ' ');
      text = text.replace(/^\s*\d+\.\s+/gm, ' ');
      // 移除HTML标签
      text = text.replace(/<\/?[^>]+(>|$)/g, "");
      // 替换所有换行符和多余空格为单个空格
      text = text.replace(/(\r\n|\n|\r)/gm, " ").replace(/\s+/g, ' ').trim();
      return text;
    },

    // --- STT Methods ---
    toggleListening() {
      if (!this.speechRecognitionSupported || !this.speechRecognition) {
        this.addSystemMessage(this.speechRecognitionSupported ? '语音识别未正确初始化。' : '抱歉，您的浏览器不支持语音输入。');
        return;
      }
      if (this.isListening) {
        this.speechRecognition.stop(); // 停止录音
      } else {
        this.userInput = ''; // 清空文本框以便接收新的语音输入
        this.$nextTick(this.autoGrowTextarea);
        try {
          this.speechRecognition.start(); // 开始录音
        } catch (e) {
          console.error("无法启动语音识别: ", e);
          this.addSystemMessage("无法启动语音识别，请检查麦克风权限或配置。");
          this.isListening = false;
        }
      }
    },

    // --- UI Helper Methods ---
    scrollToBottom() {
      this.$nextTick(() => {
        const container = this.$refs.chatMessages;
        if (container) container.scrollTop = container.scrollHeight;
      });
    },
    toggleDebug() { this.debug = !this.debug; },
    getRoleIcon(role) {
        switch (role) {
            case 'assistant': return 'fas fa-robot';
            case 'user': return 'fas fa-user';
            case 'system': return 'fas fa-info-circle';
            default: return 'fas fa-question-circle';
        }
    },
    getRoleName(role) {
        switch (role) {
            case 'assistant': return 'AI 助手';
            case 'user': return '您';
            case 'system': return '系统消息';
            default: return '未知';
        }
    },
    getSourceIcon(source) {
        switch (source) {
            case 'knowledge_graph': return 'fas fa-database';
            case 'model': return 'fas fa-brain';
            case 'error': return 'fas fa-exclamation-triangle';
            case 'system': return 'fas fa-info-circle';
            default: return 'fas fa-question-circle';
        }
    },
    getSourceName(source) {
        switch (source) {
            case 'knowledge_graph': return '基于知识图谱';
            case 'model': return '基于通用模型';
            case 'error': return '处理出错';
            case 'system': return '系统';
            default: return '未知来源';
        }
    },
  }
};
</script>

<style scoped>
/* --- 全局样式和背景动画 --- */
/* 注意：这里设置了body的背景，但Vue组件通常是挂载到body内的某个div。
   为了实现全屏背景，请确保你的Vue应用根元素是全屏的，或者在index.html的body上设置这些样式。
   在这里，我们直接应用到 .voice-chat-container
*/
.voice-chat-container {
    width: 100vw;
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: rgba(255, 255, 255, 0.05); /* 半透明背景 */
    backdrop-filter: blur(20px); /* 磨砂玻璃效果 */
    border: 1px solid rgba(255, 255, 255, 0.1);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: white; /* 默认文本颜色 */
    position: relative; /* 用于背景动画的定位 */
    overflow: hidden; /* 隐藏超出容器的背景波浪 */
}

/* 背景动画 */
.background-animation {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none; /* 确保不影响交互 */
    overflow: hidden;
    z-index: 0; /* 确保在最底层 */
}

.wave {
    position: absolute;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.05);
    animation: wave-animation 4s infinite;
}

@keyframes wave-animation {
    0% {
        transform: scale(0);
        opacity: 1;
    }
    100% {
        transform: scale(4);
        opacity: 0;
    }
}

/* --- 顶部状态栏 (原 chat-header) --- */
.status-bar {
    padding: 20px 30px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    flex-shrink: 0;
    z-index: 2; /* 确保在内容之上 */
}

.status-left {
    display: flex;
    align-items: center;
    gap: 15px;
}

.ai-avatar {
    width: 50px;
    height: 50px;
    border-radius: 50%;
    background: linear-gradient(45deg, #ff6b6b, #4ecdc4);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 20px;
    animation: pulse 2s infinite;
    flex-shrink: 0;
}

@keyframes pulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.05); }
    100% { transform: scale(1); }
}

.ai-info h3 {
    color: white;
    font-size: 18px;
    margin-bottom: 4px;
}

.ai-status {
    color: rgba(255, 255, 255, 0.8);
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 8px;
}

.status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #4ecdc4;
    animation: blink 1.5s infinite;
}

@keyframes blink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0.3; }
}

.status-right {
    display: flex;
    gap: 15px;
}

.control-btn {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s ease;
    backdrop-filter: blur(10px);
    flex-shrink: 0;
}

.control-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    transform: scale(1.1);
}

.control-btn.active {
    background: rgba(76, 175, 80, 0.3); /* 更亮的绿色 */
    border-color: #4caf50;
}
/* 特殊激活状态 */
.tts-toggle.active {
    background: rgba(76, 175, 80, 0.3); /* 绿色系 */
    border-color: #4caf50;
}
.debug-toggle.active {
    background: rgba(255, 77, 79, 0.3); /* 红色系 */
    border-color: #ff4d4f;
}
.control-btn:disabled, .control-btn.not-supported {
    opacity: 0.5;
    cursor: not-allowed;
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.1);
}
.control-btn:disabled:hover, .control-btn.not-supported:hover {
    transform: none;
    background: rgba(255, 255, 255, 0.05);
}


/* --- 聊天消息区域 (原 chat-messages) --- */
.chat-messages {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 20px 30px;
    overflow-y: auto;
    position: relative; /* 确保滚动条在容器内部 */
    z-index: 1; /* 确保在背景动画之上 */
}

.conversation-item {
    margin-bottom: 15px;
    padding: 15px 20px;
    border-radius: 15px;
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(5px);
    color: white;
    word-wrap: break-word;
    max-width: 70%; /* 限制消息宽度 */
}

.conversation-item.user {
    background: rgba(100, 149, 237, 0.2); /* 用户消息颜色 */
    margin-left: auto; /* 右对齐 */
    border-bottom-right-radius: 4px; /* 右下角圆角小一点 */
}

.conversation-item.assistant {
    background: rgba(255, 107, 107, 0.2); /* AI消息颜色 */
    margin-right: auto; /* 左对齐 */
    border-bottom-left-radius: 4px; /* 左下角圆角小一点 */
}

.conversation-item.system {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.8);
    font-size: 0.9em;
    width: 100%;
    max-width: 100%; /* 系统消息居中显示，宽度限制 */
    text-align: center;
    margin-left: auto;
    margin-right: auto;
    box-shadow: none;
    padding: 10px 15px;
    margin-bottom: 15px;
    border-radius: 10px;
}

.message-header-new {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    padding-bottom: 5px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.message-role-new {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.85rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
}
.message-role-new i { font-size: 0.9rem; }

.message-source-new {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 0.75rem;
    padding: 3px 8px;
    border-radius: 10px;
    background-color: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.7);
}
.message-source-new i { font-size: 0.8em; }
.message-source-new.source-knowledge_graph { background-color: rgba(76, 175, 80, 0.3); color: #a5d6a7; }
.message-source-new.source-model { background-color: rgba(33, 150, 243, 0.3); color: #90caf9; }
.message-source-new.source-error { background-color: rgba(244, 67, 54, 0.3); color: #ef9a9a; }

.thinking-steps-new {
    margin-top: 10px;
    margin-bottom: 8px;
    padding: 5px 0px;
    background-color: transparent;
    border: none;
    border-top: 1px dashed rgba(255, 255, 255, 0.1);
    border-radius: 0;
    font-size: 0.8rem;
}
.thinking-steps-new summary {
    cursor: pointer;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.7);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 5px 0;
    list-style: none;
    transition: color 0.2s ease;
}
.thinking-steps-new summary::-webkit-details-marker { display: none; }
.thinking-steps-new summary:hover { color: #81d4fa; }
.thinking-steps-new summary i.fa-brain { margin-right: 5px; color: rgba(255, 255, 255, 0.5); }
.thinking-steps-new summary:hover i.fa-brain { color: #81d4fa; }
.thinking-steps-new .details-arrow { transition: transform 0.2s ease-in-out; font-size: 0.8em; margin-left: 5px; color: rgba(255, 255, 255, 0.4); }
.thinking-steps-new[open] summary .details-arrow { transform: rotate(180deg); }

.thinking-steps-content-new {
    margin-top: 8px;
    padding: 12px;
    background-color: rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    white-space: pre-wrap;
    word-break: break-all;
    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
    font-size: 0.9em;
    color: rgba(255, 255, 255, 0.8);
    max-height: 400px;
    overflow-y: auto;
}

.message-text-new {
    font-size: 0.95rem;
    color: white;
}
.message-text-new p { margin-bottom: 0.8em; }
.message-text-new p:last-child { margin-bottom: 0; }
.message-text-new ul, .message-text-new ol { padding-left: 20px; margin-bottom: 0.8em; }
.message-text-new li { margin-bottom: 0.4em; }
.message-text-new code {
    background-color: rgba(0, 0, 0, 0.2);
    padding: 2px 5px;
    border-radius: 4px;
    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
    font-size: 0.9em;
    color: #ffcc80; /* code color */
}
.message-text-new pre {
    background-color: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    padding: 12px;
    margin: 10px 0;
    overflow-x: auto;
    font-size: 0.9em;
}
.message-text-new pre code {
    background-color: transparent;
    padding: 0;
    color: inherit;
}
.message-text-new blockquote {
    border-left: 3px solid rgba(255, 255, 255, 0.4);
    padding-left: 10px;
    margin-left: 0;
    color: rgba(255, 255, 255, 0.7);
}
.message-text-new a { color: #81d4fa; text-decoration: none; }
.message-text-new a:hover { text-decoration: underline; }

/* --- 语音可视化叠加层 --- */
.voice-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7); /* 半透明背景 */
    backdrop-filter: blur(15px); /* 模糊背景 */
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 100; /* 确保在最顶层 */
    transition: opacity 0.3s ease;
}

.voice-overlay-fade-enter-active, .voice-overlay-fade-leave-active {
  transition: opacity 0.3s ease;
}
.voice-overlay-fade-enter, .voice-overlay-fade-leave-to {
  opacity: 0;
}


.voice-visualizer {
    width: 300px;
    height: 300px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(255, 255, 255, 0.1) 0%, transparent 70%);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 40px;
    position: relative;
    border: 2px solid rgba(255, 255, 255, 0.1);
}

.voice-button {
    width: 120px;
    height: 120px;
    border-radius: 50%;
    background: linear-gradient(45deg, #ff6b6b, #4ecdc4);
    border: none;
    color: white;
    font-size: 36px;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
}

.voice-button:hover {
    transform: scale(1.1);
    box-shadow: 0 15px 40px rgba(0, 0, 0, 0.4);
}

.voice-button.listening {
    animation: listening-pulse 1s infinite;
}

@keyframes listening-pulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.1); }
    100% { transform: scale(1); }
}

.voice-button.speaking {
    background: linear-gradient(45deg, #4ecdc4, #45b7d1);
}
.voice-button:disabled {
    background: rgba(0,0,0,0.5);
    cursor: not-allowed;
    opacity: 0.6;
}
.voice-button:disabled:hover {
    transform: none;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
}

.voice-waves {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.3s ease;
}

.voice-waves.active {
    opacity: 1;
}

.wave-bar {
    width: 4px;
    height: 20px;
    background: rgba(255, 255, 255, 0.8);
    border-radius: 2px;
    animation: wave-bar 1s infinite;
}

.wave-bar:nth-child(2) { animation-delay: 0.1s; }
.wave-bar:nth-child(3) { animation-delay: 0.2s; }
.wave-bar:nth-child(4) { animation-delay: 0.3s; }
.wave-bar:nth-child(5) { animation-delay: 0.4s; }

@keyframes wave-bar {
    0%, 100% { transform: scaleY(0.5); }
    50% { transform: scaleY(1.5); }
    100% { transform: scaleY(0.5); }
}

.status-text {
    color: white;
    font-size: 18px;
    margin-bottom: 20px;
    text-align: center;
    min-height: 50px; /* 保持高度一致，防止内容闪烁 */
    display: flex;
    align-items: center;
    justify-content: center;
}

.interim-text {
    color: rgba(255, 255, 255, 0.7);
    font-style: italic;
    font-size: 16px;
    min-height: 24px; /* 保持高度一致 */
}

/* 加载动画 */
.loading-dots {
    display: inline-flex;
    gap: 4px;
    margin-left: 10px; /* 与文字分隔 */
}

.loading-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: currentColor; /* 继承父元素的颜色 */
    animation: loading-bounce 1.4s infinite;
}

.loading-dot:nth-child(1) { animation-delay: 0s; }
.loading-dot:nth-child(2) { animation-delay: 0.2s; }
.loading-dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes loading-bounce {
    0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; }
    40% { transform: scale(1.2); opacity: 1; }
}

/* --- 调试信息面板 (原 debug-panel) --- */
.debug-panel {
    position: fixed; /* 固定定位 */
    bottom: 20px;
    right: 20px;
    padding: 15px;
    background: rgba(0, 0, 0, 0.6); /* 半透明背景 */
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 10px;
    font-size: 0.8rem;
    max-height: 300px;
    overflow-y: auto;
    color: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(10px);
    z-index: 99; /* 在聊天内容之上，在语音叠加层之下 */
    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
}
.debug-section h4 {
    margin: 0 0 8px 0;
    font-size: 0.9rem;
    color: #ffcc80; /* 亮黄色 */
}
.debug-section pre {
    margin: 0;
    padding: 8px;
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    white-space: pre-wrap;
    word-break: break-all;
    color: #a5d6a7; /* 绿色系文本 */
}
.query-details {
    margin-top: 10px;
    padding: 10px;
    background: rgba(0, 0, 0, 0.2);
    border: 1px dashed rgba(255, 255, 255, 0.3);
    border-radius: 4px;
    font-size: 0.8rem;
}
.query-details strong { color: #81d4fa; } /* 蓝色系 */
.query-details pre { background-color: rgba(0, 0, 0, 0.3); padding: 5px; margin-top: 5px; }

/* --- 底部控制区 (原 chat-input) --- */
.bottom-controls {
    padding: 20px 30px;
    display: flex;
    align-items: flex-end; /* 保持与输入框对齐 */
    gap: 20px;
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(10px);
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    flex-shrink: 0;
    z-index: 2; /* 确保在内容之上 */
}

.bottom-btn {
    padding: 12px 24px;
    border-radius: 25px;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: white;
    cursor: pointer;
    transition: all 0.3s ease;
    backdrop-filter: blur(10px);
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0; /* 防止被压缩 */
}

.bottom-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    transform: translateY(-2px);
}
.bottom-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.1);
}
.bottom-btn:disabled:hover {
    transform: none;
    background: rgba(255, 255, 255, 0.05);
}

/* 小麦克风按钮 */
.mic-button-small {
    padding: 12px 24px; /* 保持与底部按钮一致的内边距 */
    height: auto; /* 让高度根据内容自适应 */
}
.mic-button-small i { font-size: 1.1rem; }
.mic-button-small.active {
    background: rgba(255, 77, 79, 0.3);
    border-color: #ff4d4f;
}
.mic-button-small.active:hover {
    background: rgba(255, 77, 79, 0.4);
    transform: translateY(-2px);
}


.bottom-controls textarea {
    flex-grow: 1;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 15px; /* 更圆润的边角 */
    padding: 10px 15px;
    font-size: 0.95rem;
    line-height: 1.5;
    resize: none;
    min-height: 50px; /* 确保初始高度 */
    max-height: 120px; /* 限制最大高度 */
    overflow-y: auto;
    transition: border-color 0.3s, box-shadow 0.3s, background-color 0.3s;
    font-family: inherit;
    background: rgba(255, 255, 255, 0.1); /* 半透明背景 */
    color: white; /* 文本颜色 */
    outline: none; /* 移除默认焦点轮廓 */
}
.bottom-controls textarea::placeholder {
    color: rgba(255, 255, 255, 0.7);
}
.bottom-controls textarea:focus {
    border-color: rgba(129, 212, 250, 0.6); /* 蓝色高亮 */
    box-shadow: 0 0 0 2px rgba(129, 212, 250, 0.2);
    background: rgba(255, 255, 255, 0.15); /* 焦点时略微提亮 */
}
.bottom-controls textarea:disabled {
    background-color: rgba(255, 255, 255, 0.05);
    cursor: not-allowed;
    opacity: 0.7;
}

.send-button-new {
    /* 继承 .bottom-btn 的大部分样式 */
    background: linear-gradient(45deg, #667eea, #764ba2); /* 渐变背景 */
    border: none; /* 移除边框 */
    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
}
.send-button-new:hover {
    background: linear-gradient(45deg, #5a6cd6, #6b3e94); /* 悬停时颜色变深 */
}
.send-button-new:disabled {
    background: rgba(102, 126, 234, 0.5); /* 渐变色变浅 */
    box-shadow: none;
}
.send-button-new i { font-size: 1.1rem; }


/* --- 滚动条美化 --- */
.chat-messages::-webkit-scrollbar,
.thinking-steps-content-new::-webkit-scrollbar,
.bottom-controls textarea::-webkit-scrollbar,
.debug-panel::-webkit-scrollbar {
    width: 8px;
    height: 8px; /* For horizontal scrollbars if any */
}

.chat-messages::-webkit-scrollbar-track,
.thinking-steps-content-new::-webkit-scrollbar-track,
.bottom-controls textarea::-webkit-scrollbar-track,
.debug-panel::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.05); /* 半透明轨道 */
    border-radius: 4px;
}

.chat-messages::-webkit-scrollbar-thumb,
.thinking-steps-content-new::-webkit-scrollbar-thumb,
.bottom-controls textarea::-webkit-scrollbar-thumb,
.debug-panel::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.3); /* 半透明滑块 */
    border-radius: 4px;
}

.chat-messages::-webkit-scrollbar-thumb:hover,
.thinking-steps-content-new::-webkit-scrollbar-thumb:hover,
.bottom-controls textarea::-webkit-scrollbar-thumb:hover,
.debug-panel::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.5); /* 悬停时更不透明 */
}

/* --- 响应式设计 (从示例中复制) --- */
@media (max-width: 768px) {
    .voice-visualizer {
        width: 250px;
        height: 250px;
    }
    
    .voice-button {
        width: 100px;
        height: 100px;
        font-size: 30px;
    }
    
    .status-bar, .bottom-controls {
        padding: 15px 20px;
    }
    
    .chat-messages {
        padding: 20px;
    }

    .bottom-controls {
        flex-wrap: wrap; /* 小屏幕下换行 */
        justify-content: center;
        gap: 10px;
    }
    .bottom-controls textarea {
        min-height: 40px; /* 适应小屏幕 */
    }
    .mic-button-small, .send-button-new {
        padding: 10px 18px; /* 调整小按钮大小 */
        height: 40px;
    }
    .send-button-new span, .mic-button-small span {
        display: none; /* 小屏幕下隐藏文字，只留图标 */
    }
    .mic-button-small i, .send-button-new i {
        margin: 0; /* 移除图标旁边的边距 */
    }
    .control-btn {
        width: 36px;
        height: 36px;
    }
}
</style>