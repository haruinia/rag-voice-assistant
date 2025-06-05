<template>
  <div class="ai-assistant-container">
    <!-- 1. 聊天头部 -->
    <div class="chat-header">
      <div class="header-left">
        <h3>文物领域智能语音助手</h3> <!-- 更改标题以反映语音功能 -->
        <span class="model-info">Model: {{ llmModel }}</span>
      </div>
      <div class="header-right">
        <!-- TTS 开关按钮 -->
        <button @click="toggleTTS"
                class="action-button tts-toggle"
                :class="{ active: isTTSEnabled }"
                :title="isTTSEnabled ? '关闭语音播报' : '开启语音播报'">
          <i :class="isTTSEnabled ? 'fas fa-volume-up' : 'fas fa-volume-mute'"></i>
        </button>
        <!-- 查看知识库按钮 -->
        <button @click="showAllNodes" class="action-button" title="查看知识库所有实体">
          <i class="fas fa-database"></i>
        </button>
        <!-- 连接状态指示器 -->
        <span class="status-indicator" :class="{ active: isConnected, inactive: !isConnected }">
          <i :class="isConnected ? 'fas fa-check-circle' : 'fas fa-times-circle'"></i>
          {{ isConnected ? '已连接知识库' : '未连接知识库' }}
        </span>
        <!-- 调试模式切换按钮 -->
        <button
          @click="toggleDebug"
          class="debug-toggle action-button"
          :class="{ active: debug }"
          title="切换调试信息显示"
        >
          <i class="fas fa-bug"></i>
        </button>
      </div>
    </div>

    <!-- 2. 聊天消息区域 -->
    <div class="chat-messages" ref="chatMessages">
      <div v-for="(message, index) in chatMessages"
           :key="index"
           :class="['message', message.role]">
        <div :class="['message-content', message.role === 'system' ? 'system-message-content' : '']">
          <div class="message-header">
            <div class="message-role">
              <i :class="getRoleIcon(message.role)"></i>
              <span>{{ getRoleName(message.role) }}</span>
            </div>
            <div v-if="message.source && message.role === 'assistant'"
                 :class="['message-source', `source-${message.source}`]">
              <i :class="getSourceIcon(message.source)"></i>
              <span>{{ getSourceName(message.source) }}</span>
            </div>
          </div>
          <details v-if="message.role === 'assistant' && message.hasThinking" class="thinking-steps">
            <summary>
              <i class="fas fa-brain"></i> 思考过程 <i class="fas fa-chevron-down details-arrow"></i>
            </summary>
            <pre class="thinking-steps-content">{{ message.thinkingContent || '无详细思考过程记录。' }}</pre>
          </details>
          <div class="message-text" v-html="formatMessage(message.mainContent || message.content)"></div>
          <div v-if="message.queryDetails && debug" class="query-details debug-only">
             <strong>原始查询详情 (Debug):</strong>
            <pre>{{ JSON.stringify(message.queryDetails, null, 2) }}</pre>
          </div>
        </div>
      </div>
      <!-- AI 输入状态指示器 -->
      <div v-if="isTyping && !isListening" class="message assistant typing-indicator-container">
         <div class="message-content">
              <div class="typing-indicator">
                <span></span><span></span><span></span>
              </div>
         </div>
      </div>
      <!-- 用户语音输入指示器 -->
      <div v-if="isListening" class="message user listening-indicator-container">
        <div class="message-content">
          <i class="fas fa-microphone-alt listening-icon"></i>
          <span>正在听您说...</span>
          <span v-if="interimTranscript" class="interim-text"> "{{ interimTranscript }}"</span>
        </div>
      </div>
    </div>

    <!-- 3. 旧调试信息面板 (仅在 debug 模式下显示) -->
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

    <!-- 4. 聊天输入区域 -->
    <div class="chat-input">
       <button
        @click="toggleListening"
        :class="['action-button', 'mic-button', { active: isListening, 'not-supported': !speechRecognitionSupported }]"
        :title="speechRecognitionSupported ? (isListening ? '停止录音' : '开始录音 (语音输入)') : '语音输入不受支持'"
        :disabled="isTyping || !speechRecognitionSupported"
      >
        <i :class="isListening ? 'fas fa-microphone-slash' : 'fas fa-microphone'"></i>
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
        class="send-button"
      >
        <i class="fas fa-paper-plane"></i>
        <span class="send-button-text">发送</span>
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
      isTyping: false, // AI正在生成回复
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

      // --- STT (Speech-to-Text) 相关状态 ---
      isListening: false, // 用户是否正在录音
      speechRecognition: null,
      speechRecognitionSupported: true, // 标记浏览器是否支持STT
      interimTranscript: '', // 临时识别结果，用于界面显示
      autoSendOnSpeechEnd: true, // 语音识别结束后是否自动发送
    };
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
        if (this.speechSynthesis && this.speechSynthesis.speaking) {
          this.speechSynthesis.cancel(); // 如果AI正在说话，打断它
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

        // 将最终确定的文本填充到输入框 (如果用户没有在识别过程中手动输入)
        // 更好的做法是直接使用 finalTranscript，如果 autoSendOnSpeechEnd 为 true
        if (finalTranscript.trim() && !this.userInput && this.isListening) {
            this.userInput = finalTranscript.trim(); // 填充到输入框，但不立刻发送
        } else if (finalTranscript.trim() && this.isListening) {
            // 如果用户已经开始打字，可以将识别结果追加，或根据策略决定
            // this.userInput = (this.userInput + ' ' + finalTranscript).trim();
            // 当前简单覆盖/填充
            this.userInput = finalTranscript.trim();
        }
        // console.log('Interim:', this.interimTranscript);
        // console.log('Final:', finalTranscript);
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
  },

  beforeUnmount() {
    if (this.speechSynthesis && this.speechSynthesis.speaking) {
      this.speechSynthesis.cancel();
    }
    if (this.speechRecognition && this.isListening) {
      this.speechRecognition.stop(); // 停止可能正在进行的识别
    }
  },

  methods: {
    autoGrowTextarea() {
      const textarea = this.$refs.userInputArea;
      if (textarea) {
        textarea.style.height = 'auto'; // 重置高度以便正确计算 scrollHeight
        textarea.style.height = textarea.scrollHeight + 'px';
      }
    },
    handleKeydown(event) {
      if (this.isListening) {
        // this.speechRecognition.stop(); // 如果用户在录音时打字，可以选择停止录音
        // 或者允许用户编辑识别中的文本，当前逻辑是识别结束后填充
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (!this.isListening) { // 只有在非录音状态下Enter才发送
             this.sendMessage();
        }
      }
       this.$nextTick(this.autoGrowTextarea); // Shift+Enter换行时也调整高度
    },

    async sendMessage() {
      if (this.isListening) {
         this.speechRecognition.stop(); // 如果因某种原因仍在监听，则停止
         // 等待 onend 事件触发并填充 userInput 后再继续，或者直接使用当前 userInput
      }
      const userMessage = this.userInput.trim();
      if (!userMessage || this.isTyping) return;

      if (this.speechSynthesis && this.speechSynthesis.speaking) {
        this.speechSynthesis.cancel();
      }

      this.chatMessages.push({ role: 'user', content: userMessage, mainContent: userMessage });
      this.userInput = ''; // 清空输入框
      this.$nextTick(this.autoGrowTextarea); // 重置文本框高度
      this.isTyping = true;
      this.scrollToBottom();

      const thinkingSteps = this.initializeThinkingSteps(userMessage);

      try {
        // ... (实体提取、知识库查询等逻辑保持不变) ...
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
        this.isTyping = false; // 流式响应开始前，AI不再是"输入中"状态

        await this.streamLLMResponse(finalPrompt, assistantMessage);

      } catch (error) {
        console.error('[sendMessage] 处理消息时发生顶层错误:', error);
        thinkingSteps.finalOutcome.source = 'error';
        thinkingSteps.finalOutcome.errorMessage = error.message;
        this.isTyping = false;
        this.showError(error, thinkingSteps);
      } finally {
        this.isTyping = false;
        this.$nextTick(() => this.scrollToBottom());
      }
    },

    initializeThinkingSteps(userInput) { /* ... 与之前相同 ... */
        return {
            userInput: userInput,
            entityExtraction: { method: 'LLM (专用实体提取)', attempted: false, rawInput: userInput, prompt: null, rawResponse: null, results: [], error: null },
            knowledgeGraphLookup: { attempted: false, entityUsed: null, queryType: 'none', queryDetails: null, success: false, rawResult: null, resultSummary: '未尝试知识图谱查询', error: null },
            answerGeneration: { prompt: null, llmResponse: null, error: null },
            finalOutcome: { source: 'model', errorMessage: null }
        };
    },
    async extractEntitiesWithLLM(userMessage, thinkingSteps) { /* ... 与之前相同 ... */
      const prompt = `
任务：请从以下用户问题中，精准地提取出最核心的名词性实体（例如：人名、地名、组织名、物品名称、概念术语等）。
用户问题：
"${userMessage}"
提取要求：
1.  专注于识别问题指向的核心查询对象。
2.  必须忽略所有非实体词语，例如：疑问词（"谁", "什么", "哪里"），动词（"介绍", "是", "查询"），代词（"你", "我", "它"），连词（"和", "与"），语气助词（"啊", "呢", "吗"），以及描述性或指示性短语（"给我介绍一下", "的信息", "有关", "关于"）。
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
          stream: false,
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
    extractJSONFromLLMResponse(response) { /* ... 与之前相同 ... */
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
    buildFinalPrompt(userMessage, knowledgeContext, thinkingSteps) { /* ... 与之前相同 ... */
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
    async streamLLMResponse(finalPrompt, assistantMessage) { /* ... 与之前相同，确保TTS播报调用的是 mainContent ... */
        try {
            const response = await axios.post(this.aiApiUrl, {
                model: this.llmModel,
                messages: [{ role: 'user', content: finalPrompt }],
                stream: true,
            }, { responseType: 'text' });

            let streamedContent = '';
            let mainContentAccumulator = '';
            let thinkingContentAccumulator = '';
            let inThinkingBlock = false;

            const lines = response.data.split('\n');

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const data = JSON.parse(line);
                    let chunk = '';
                    if (data.message?.content) chunk = data.message.content;
                    else if (data.response) chunk = data.response;

                    if (chunk) {
                        streamedContent += chunk;
                        assistantMessage.content = streamedContent; // Raw full content

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

                        this.$forceUpdate();
                        this.scrollToBottom();
                        // typingSpeed 设为0，语音交互不需要打字效果
                        // if (this.typingSpeed > 0 && !this.isTTSEnabled) {
                        //     await new Promise(resolve => setTimeout(resolve, this.typingSpeed));
                        // }
                    }
                    if (data.done) break;
                } catch (e) {
                     if (!inThinkingBlock) mainContentAccumulator += line + '\n'; else thinkingContentAccumulator += line + '\n';
                     assistantMessage.mainContent = mainContentAccumulator;
                     assistantMessage.thinkingContent = thinkingContentAccumulator;
                     this.$forceUpdate(); this.scrollToBottom();
                }
            }

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

            if (this.isTTSEnabled && assistantMessage.mainContent && assistantMessage.role === 'assistant') {
                const textToSpeak = this.cleanTextForSpeech(assistantMessage.mainContent);
                this.speakText(textToSpeak);
            }

        } catch (error) {
            // const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message; // 'errorMsg' is assigned a value but never used
            const finalErrorMessage = `抱歉，我在尝试回答时遇到了一个内部错误。(${error.message})`;
            if (assistantMessage) {
                assistantMessage.content = finalErrorMessage;
                assistantMessage.mainContent = finalErrorMessage;
                assistantMessage.source = 'error';
                if (assistantMessage.thinkingSteps) {
                    assistantMessage.thinkingSteps.answerGeneration.error = `LLM API 调用失败: ${error.message}`;
                    assistantMessage.thinkingSteps.finalOutcome.source = 'error';
                    assistantMessage.thinkingSteps.finalOutcome.errorMessage = error.message;
                }
            } else {
                // this.addMessage({ role: 'assistant', content: finalErrorMessage, mainContent: finalErrorMessage, source: 'error', hasThinking: false }); // addMessage is not defined
                 this.chatMessages.push({ role: 'assistant', content: finalErrorMessage, mainContent: finalErrorMessage, source: 'error', hasThinking: false });
            }
            if (this.isTTSEnabled) {
                this.speakText(this.cleanTextForSpeech(finalErrorMessage));
            }
            this.$forceUpdate();
            this.scrollToBottom();
        }
    },
    parseThinkTags(text) { /* ... 与之前相同 ... */
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
    async queryKnowledgeGraphDirectly(entityName, thinkingSteps) { /* ... 与之前相同 ... */
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
    async queryKnowledgeGraphSemantically(userMessage, thinkingSteps) { /* ... 与之前相同 ... */
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
    formatDirectQueryResult(data, queriedEntityName) { /* ... 与之前相同 ... */
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
    formatKnowledgeGraphResults(data) { /* ... 与之前相同 ... */
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
    async testDatabaseConnection() { /* ... 与之前相同 ... */
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
    async showAllNodes() { /* ... 与之前相同 ... */
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
    formatMessage(content) { /* ... 与之前相同 ... */
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
        this.speakText(textToSpeak);
      }
    },
    showError(error, thinkingSteps) { /* ... 与之前相同，确保TTS播报调用的是用户可见部分 ... */
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
        this.speakText(textToSpeak);
      }
    },

    // --- TTS Methods ---
    loadVoices() { /* ... 与之前相同 ... */
      if (!this.speechSynthesis) return;
      this.voices = this.speechSynthesis.getVoices();
      const chineseVoice = this.voices.find(voice => voice.lang.startsWith('zh-CN') && voice.localService);
      if (chineseVoice) {
        this.selectedVoiceURI = chineseVoice.voiceURI;
      } else {
         const anyChineseVoice = this.voices.find(voice => voice.lang.startsWith('zh-CN'));
         if(anyChineseVoice) this.selectedVoiceURI = anyChineseVoice.voiceURI;
      }
    },
    toggleTTS() { /* ... 与之前相同 ... */
      this.isTTSEnabled = !this.isTTSEnabled;
      if (!this.isTTSEnabled && this.speechSynthesis && this.speechSynthesis.speaking) {
        this.speechSynthesis.cancel();
      }
    },
    speakText(text) { /* ... 与之前相同 ... */
      if (!this.isTTSEnabled || !this.speechSynthesis || !text || text.trim().length === 0) return;
      if (this.speechSynthesis.speaking) this.speechSynthesis.cancel();
      this.currentUtterance = new SpeechSynthesisUtterance(text);
      if (this.selectedVoiceURI) {
        const voice = this.voices.find(v => v.voiceURI === this.selectedVoiceURI);
        if (voice) this.currentUtterance.voice = voice;
      }
      if(!this.currentUtterance.voice || !this.currentUtterance.voice.lang.startsWith('zh')) {
          this.currentUtterance.lang = 'zh-CN';
      }
      this.currentUtterance.onend = () => { this.currentUtterance = null; };
      this.currentUtterance.onerror = (event) => { console.error('TTS Error:', event.error); this.currentUtterance = null; };
      setTimeout(() => { if (this.speechSynthesis && this.currentUtterance) this.speechSynthesis.speak(this.currentUtterance); }, 50);
    },
    cleanTextForSpeech(markdownText) { /* ... 与之前相同 ... */
      if (!markdownText) return '';
      let text = markdownText;
      text = text.replace(/```[\s\S]*?```/g, ' (代码部分) ');
      text = text.replace(/`([^`]+)`/g, '$1');
      text = text.replace(/!\[(.*?)\]\(.*?\)/g, '(图片: $1) ');
      text = text.replace(/\[(.*?)\]\(.*?\)/g, '$1');
      text = text.replace(/^#{1,6}\s+/gm, '');
      text = text.replace(/(\*\*|__)(.*?)\1/g, '$2');
      text = text.replace(/(\*|_)(.*?)\1/g, '$2');
      text = text.replace(/^(-{3,}|\*{3,}|_{3,})$/gm, '');
      text = text.replace(/^\s*[*+-]\s+/gm, ' ');
      text = text.replace(/^\s*\d+\.\s+/gm, ' ');
      text = text.replace(/<\/?[^>]+(>|$)/g, "");
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
        this.speechRecognition.stop();
      } else {
        this.userInput = ''; // 清空文本框以便接收新的语音输入
        this.$nextTick(this.autoGrowTextarea);
        try {
          this.speechRecognition.start();
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
/* --- 容器与布局 --- */
.ai-assistant-container { display: flex; flex-direction: column; height: 100vh; background-color: #f0f2f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #333; }
/* --- 聊天头部 --- */
.chat-header { display: flex; justify-content: space-between; align-items: center; padding: 15px 25px; background-color: #ffffff; border-bottom: 1px solid #e8e8e8; flex-shrink: 0; }
.header-left h3 { margin: 0; font-size: 1.1rem; font-weight: 600; color: #2c3e50; }
.model-info { font-size: 0.75rem; color: #888; margin-top: 2px; }
.header-right { display: flex; align-items: center; gap: 12px; }
.status-indicator { display: flex; align-items: center; gap: 5px; font-size: 0.85rem; padding: 5px 10px; border-radius: 15px; transition: all 0.3s ease; }
.status-indicator.active { color: #1890ff; background-color: #e6f7ff; border: 1px solid #91d5ff; } .status-indicator.active i { color: #1890ff; }
.status-indicator.inactive { color: #fa541c; background-color: #fff2e8; border: 1px solid #ffbb96; } .status-indicator.inactive i { color: #fa541c; }
.action-button { background: none; border: 1px solid #d9d9d9; border-radius: 4px; color: #555; cursor: pointer; padding: 0px 8px; font-size: 0.9rem; transition: all 0.2s ease; display: flex; align-items: center; justify-content: center; min-width: 32px; height: 32px; }
.action-button:hover { border-color: #1890ff; color: #1890ff; background-color: #f0f8ff; }
.action-button:disabled, .action-button.not-supported { background-color: #f5f5f5 !important; border-color: #e0e0e0 !important; color: #ccc !important; cursor: not-allowed !important; }
.action-button:disabled:hover, .action-button.not-supported:hover { background-color: #f5f5f5 !important; color: #ccc !important; }

.debug-toggle.active { border-color: #ff4d4f; color: #ff4d4f; background-color: #fff1f0; }
.tts-toggle i { font-size: 1rem; }
.tts-toggle.active { border-color: #52c41a; color: #52c41a; background-color: #f6ffed; }
.tts-toggle.active:hover { border-color: #73d13d; color: #73d13d; }

/* --- 聊天消息区域 --- */
.chat-messages { flex: 1; padding: 20px 25px; overflow-y: auto; display: flex; flex-direction: column; gap: 18px; }
.message { display: flex; max-width: 80%; }
.message.user { justify-content: flex-end; margin-left: auto; }
.message.assistant, .message.system { justify-content: flex-start; margin-right: auto; }
.message-content { padding: 12px 18px; border-radius: 12px; background-color: #ffffff; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08); word-wrap: break-word; position: relative; line-height: 1.6; }
.message.user .message-content { background-color: #e6f7ff; border-top-right-radius: 4px; }
.message.assistant .message-content { border-top-left-radius: 4px; }
.message.system .message-content { background-color: #fafafa; border: 1px solid #e8e8e8; color: #555; font-size: 0.9rem; width: 100%; max-width: 100%; text-align: center; box-shadow: none; }
.message-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding-bottom: 5px; border-bottom: 1px solid #f0f0f0; }
.message-role { display: flex; align-items: center; gap: 8px; font-size: 0.85rem; font-weight: 600; color: #555; } .message-role i { font-size: 0.9rem; }
.message-source { display: flex; align-items: center; gap: 5px; font-size: 0.75rem; padding: 3px 8px; border-radius: 10px; background-color: #f0f0f0; color: #666; } .message-source i { font-size: 0.8em; }
.message-source.source-knowledge_graph { background-color: #d4edda; color: #155724; }
.message-source.source-model { background-color: #d1ecf1; color: #0c5460; }
.message-source.source-error { background-color: #f8d7da; color: #721c24; }
.thinking-steps { margin-top: 10px; margin-bottom: 8px; padding: 5px 0px; background-color: transparent; border: none; border-top: 1px dashed #e0e0e0; border-radius: 0; font-size: 0.8rem; }
.thinking-steps summary { cursor: pointer; font-weight: 500; color: #666; display: flex; align-items: center; justify-content: space-between; padding: 5px 0; list-style: none; transition: color 0.2s ease; }
.thinking-steps summary::-webkit-details-marker { display: none; }
.thinking-steps summary:hover { color: #1890ff; } .thinking-steps summary i.fa-brain { margin-right: 5px; color: #999; } .thinking-steps summary:hover i.fa-brain { color: #1890ff; }
.thinking-steps .details-arrow { transition: transform 0.2s ease-in-out; font-size: 0.8em; margin-left: 5px; color: #aaa; }
.thinking-steps[open] summary .details-arrow { transform: rotate(180deg); }
.thinking-steps-content { margin-top: 8px; padding: 12px; background-color: #f8f9fa; border: 1px solid #e9ecef; border-radius: 6px; white-space: pre-wrap; word-break: break-all; font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace; font-size: 0.9em; color: #495057; max-height: 400px; overflow-y: auto; }
.message-text { font-size: 0.95rem; color: #333; }
.message-text p { margin-bottom: 0.8em; } .message-text p:last-child { margin-bottom: 0; }
.message-text ul, .message-text ol { padding-left: 20px; margin-bottom: 0.8em; } .message-text li { margin-bottom: 0.4em; }
.message-text code { background-color: #f0f0f0; padding: 2px 5px; border-radius: 4px; font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace; font-size: 0.9em; color: #d63384; }
.message-text pre { background-color: #f8f9fa; border: 1px solid #e9ecef; border-radius: 6px; padding: 12px; margin: 10px 0; overflow-x: auto; font-size: 0.9em; }
.message-text pre code { background-color: transparent; padding: 0; color: inherit; }
.message-text blockquote { border-left: 3px solid #ccc; padding-left: 10px; margin-left: 0; color: #666; }
.message-text a { color: #1890ff; text-decoration: none; } .message-text a:hover { text-decoration: underline; }

/* --- 指示器 --- */
.typing-indicator-container .message-content,
.listening-indicator-container .message-content {
  padding: 10px 15px; display: inline-block; background: #fff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  display: flex; align-items: center; gap: 8px;
}
.typing-indicator { display: flex; align-items: center; gap: 5px; }
.typing-indicator span { width: 8px; height: 8px; background-color: #1890ff; border-radius: 50%; opacity: 0.8; animation: typing-bounce 1.3s infinite ease-in-out; }
.typing-indicator span:nth-child(1) { animation-delay: -0.24s; } .typing-indicator span:nth-child(2) { animation-delay: -0.12s; } .typing-indicator span:nth-child(3) { animation-delay: 0s; }
@keyframes typing-bounce { 0%, 80%, 100% { transform: scale(0.5); opacity: 0.5; } 40% { transform: scale(1.0); opacity: 1; } }

.listening-icon { color: #1890ff; animation: pulse-mic 1.5s infinite ease-in-out; }
@keyframes pulse-mic { 0% { transform: scale(1); } 50% { transform: scale(1.2); } 100% { transform: scale(1); } }
.interim-text { font-style: italic; color: #777; font-size: 0.9em; margin-left: 5px; }

/* --- 聊天输入区域 --- */
.chat-input { display: flex; align-items: flex-end; padding: 10px 15px; background-color: #ffffff; border-top: 1px solid #e8e8e8; flex-shrink: 0; gap: 8px; }
.mic-button { flex-shrink: 0; padding: 0 10px; min-width: 40px; height: 40px; color: #555; border-color: #d9d9d9;}
.mic-button:hover { color: #1890ff; border-color: #1890ff; }
.mic-button.active { color: #ff4d4f; border-color: #ff4d4f; background-color: #fff1f0; }
.chat-input textarea {
  flex-grow: 1; border: 1px solid #d9d9d9; border-radius: 6px; padding: 10px 15px;
  font-size: 0.95rem; line-height: 1.5; resize: none;
  min-height: 40px; /* 确保初始高度与按钮一致 */
  max-height: 120px; /* 限制最大高度 */
  overflow-y: auto; transition: border-color 0.3s, box-shadow 0.3s; font-family: inherit;
}
.chat-input textarea:focus { border-color: #1890ff; box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2); outline: none; }
.chat-input textarea:disabled { background-color: #f8f8f8; cursor: not-allowed; }
.send-button { background-color: #1890ff; color: white; border: none; border-radius: 6px; padding: 0 15px; height: 40px; font-size: 0.95rem; font-weight: 500; cursor: pointer; transition: background-color 0.2s ease; display: flex; align-items: center; justify-content: center; gap: 8px; flex-shrink: 0; }
.send-button:hover { background-color: #40a9ff; }
.send-button:disabled { background-color: #bfbfbf; cursor: not-allowed; }
.send-button i { font-size: 1rem; }
/* .send-button-text { display: inline; } */ /* 默认显示文字，可根据屏幕大小隐藏 */

/* --- 调试专用样式 --- */
.debug-only { display: block; }
.debug-panel { padding: 15px 25px; background-color: #fffbe6; border-top: 1px solid #ffe58f; font-size: 0.8rem; max-height: 250px; overflow-y: auto; }
.debug-section h4 { margin: 0 0 8px 0; font-size: 0.9rem; color: #d46b08; }
.debug-section pre { margin: 0; padding: 8px; background: #fff; border: 1px solid #eee; border-radius: 4px; white-space: pre-wrap; word-break: break-all; }
.query-details { margin-top: 10px; padding: 10px; background: #f8f9fa; border: 1px dashed #ddd; border-radius: 4px; font-size: 0.8rem; }
.query-details strong { color: #0056b3; } .query-details pre { background-color: #fff; padding: 5px; margin-top: 5px; }

/* --- 滚动条美化 --- */
.chat-messages::-webkit-scrollbar, textarea::-webkit-scrollbar { width: 6px; }
.chat-messages::-webkit-scrollbar-track, textarea::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 3px; }
.chat-messages::-webkit-scrollbar-thumb, textarea::-webkit-scrollbar-thumb { background: #ccc; border-radius: 3px; }
.chat-messages::-webkit-scrollbar-thumb:hover, textarea::-webkit-scrollbar-thumb:hover { background: #aaa; }
</style>