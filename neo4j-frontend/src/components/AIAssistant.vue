<template>
  <div class="ai-assistant-container">
    <!-- 1. 聊天头部 -->
    <div class="chat-header">
      <div class="header-left">
        <h3>文物领域智能知识助手</h3>
        <span class="model-info">Model: {{ llmModel }}</span>
      </div>
      <div class="header-right">
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
        <!-- 消息内容容器 -->
        <div :class="['message-content', message.role === 'system' ? 'system-message-content' : '']">
          <!-- 消息头部：角色和来源 -->
          <div class="message-header">
            <div class="message-role">
              <i :class="getRoleIcon(message.role)"></i>
              <span>{{ getRoleName(message.role) }}</span>
            </div>
            <!-- 消息来源标签 (仅助手和错误消息显示) -->
            <div v-if="message.source && message.role === 'assistant'"
                 :class="['message-source', `source-${message.source}`]">
              <i :class="getSourceIcon(message.source)"></i>
              <span>{{ getSourceName(message.source) }}</span>
            </div>
          </div>

          <!-- 新增：可折叠的思考过程 (仅助手消息显示) -->
          <details v-if="message.role === 'assistant' && message.hasThinking" class="thinking-steps">
            <summary>
              <i class="fas fa-brain"></i> 思考过程 <i class="fas fa-chevron-down details-arrow"></i>
            </summary>
            <!-- Ensure this uses thinkingContent -->
            <pre class="thinking-steps-content">{{ message.thinkingContent || '无详细思考过程记录。' }}</pre>
          </details>

          <!-- 消息文本内容 (HTML格式) -->
          <div class="message-text" v-html="formatMessage(message.mainContent || message.content)"></div> <!-- Fallback to content if mainContent is missing -->

          <!-- 旧的调试信息 (仅在 debug 模式下显示) -->
          <div v-if="message.queryDetails && debug" class="query-details debug-only">
             <strong>原始查询详情 (Debug):</strong>
            <pre>{{ JSON.stringify(message.queryDetails, null, 2) }}</pre>
          </div>
        </div>
      </div>

      <!-- AI 输入状态指示器 -->
      <div v-if="isTyping" class="message assistant typing-indicator-container">
         <div class="message-content">
              <div class="typing-indicator">
                <span></span><span></span><span></span>
              </div>
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
      <textarea
        v-model="userInput"
        @keydown="handleKeydown"
        placeholder="请输入您的问题 (Shift+Enter 换行)..."
        :disabled="isTyping"
        ref="userInputArea"
        rows="3"
      ></textarea>
      <button
        @click="sendMessage"
        :disabled="isTyping || !userInput.trim()"
        title="发送消息 (Enter)"
        class="send-button"
      >
        <i class="fas fa-paper-plane"></i>
        <span>发送</span>
      </button>
    </div>
  </div>
</template>

<script>
import axios from 'axios'; // 用于HTTP请求
import { marked } from 'marked'; // 用于将Markdown转为HTML
import DOMPurify from 'dompurify'; // 用于HTML清理，防止XSS

export default {
  name: 'AIAssistant',

  data() {
    return {
      // --- API 配置 ---
      apiBaseUrl: 'http://localhost:3000/api/data', // 后端知识图谱API基础地址
      aiApiUrl: 'http://210.27.197.62:11434/api/chat', // 大模型API地址 (例如Ollama)
      llmModel: 'deepseek-r1:32b', // 使用的大模型名称

      // --- 状态管理 ---
      chatMessages: [], // 存储所有聊天消息的数组
      userInput: '', // 用户输入框的内容
      isTyping: false, // AI是否正在生成响应
      debug: false, // 是否开启调试模式 (显示额外信息)
      isConnected: false, // 后端知识图谱API是否连接成功

      // --- 旧调试信息 (Debug模式下使用) ---
      currentAnalysis: null,
      currentQuery: null,

      // --- 其他配置 ---
      typingSpeed: 15, // 打字机效果的速度 (ms/字符，0表示禁用)
      cache: new Map(), // 简单缓存 (当前未使用，可用于缓存查询结果等)
    };
  },

  // 组件创建时执行
  created() {
    // 1. 测试后端数据库连接
    this.testDatabaseConnection();
    // 2. 添加初始欢迎消息
     this.addSystemMessage('您好！我是文物领域智能知识助手，请问有什么可以帮您的？');
  },

  methods: {
    // ========================================================================
    // 核心交互逻辑
    // ========================================================================

    /**
     * @description 处理用户输入框的按键事件 (Enter发送, Shift+Enter换行)
     * @param {KeyboardEvent} event 按键事件对象
     */
    handleKeydown(event) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault(); // 阻止默认的 Enter 换行行为
        this.sendMessage();
      }
      // 如果是 Shift+Enter，则textarea组件会自动处理换行
    },

    /**
     * @description 发送消息的主流程：用户输入->实体提取->知识库查询->构建Prompt->LLM生成->显示结果
     */
    async sendMessage() {
      const userMessage = this.userInput.trim();
      if (!userMessage || this.isTyping) return; // 防止发送空消息或重复发送

      // 1. 显示用户消息
      this.chatMessages.push({ role: 'user', content: userMessage });
      this.userInput = ''; // 清空输入框
      this.isTyping = true; // 设置AI为"正在输入"状态
      this.scrollToBottom(); // 滚动到底部

      // 2. 初始化"思考过程"记录对象
      const thinkingSteps = this.initializeThinkingSteps(userMessage);

      try {
        // 3. 使用 LLM 进行精准实体提取
        thinkingSteps.entityExtraction.attempted = true;
        const extractedEntities = await this.extractEntitiesWithLLM(userMessage, thinkingSteps);
        thinkingSteps.entityExtraction.results = extractedEntities;

        let knowledgeContext = '';
        let kgResult = null; // 知识图谱查询结果
        let kgSource = 'none'; // 知识图谱来源类型 ('direct_api', 'semantic_api', 'none')

        // 4. 如果提取到实体，尝试查询知识图谱
        if (extractedEntities.length > 0 && this.isConnected) { // 仅在连接成功时查询
          thinkingSteps.knowledgeGraphLookup.attempted = true;
          const entityToSearch = extractedEntities[0].name; // 优先使用第一个提取到的实体
          thinkingSteps.knowledgeGraphLookup.entityUsed = entityToSearch;
          console.log(`[sendMessage] 优先查询实体: "${entityToSearch}"`);

          // 4a. 尝试直接API精确查询
          kgResult = await this.queryKnowledgeGraphDirectly(entityToSearch, thinkingSteps);

          // 4b. 如果直接查询无结果，尝试语义API模糊查询
          if (!kgResult) {
            kgResult = await this.queryKnowledgeGraphSemantically(userMessage, thinkingSteps);
          }

          // 更新KG查询来源和成功状态
          if (kgResult) {
            kgSource = thinkingSteps.knowledgeGraphLookup.queryType; // 应在查询函数内设置
            thinkingSteps.knowledgeGraphLookup.success = true;
          }
        } else if (!this.isConnected) {
             thinkingSteps.knowledgeGraphLookup.resultSummary = '知识库未连接，跳过查询。';
             console.warn("[sendMessage] 知识库未连接，跳过查询。")
        } else {
          thinkingSteps.knowledgeGraphLookup.resultSummary = '未提取到有效实体，跳过知识图谱查询。';
          console.log("[sendMessage] 未提取到实体，跳过知识图谱查询。");
        }

        // 5. 格式化知识图谱结果为文本上下文
        if (kgResult) {
          knowledgeContext = this.formatKnowledgeGraphResults(kgResult);
          thinkingSteps.knowledgeGraphLookup.resultSummary = `通过 ${kgSource} 方式查询 "${thinkingSteps.knowledgeGraphLookup.entityUsed}" 找到 ${kgResult.nodes?.length || 0} 个节点, ${kgResult.relationships?.length || 0} 条关系。`;
          thinkingSteps.finalOutcome.source = 'knowledge_graph'; // 标记最终答案来源
          console.log("[sendMessage] 已生成知识图谱上下文。");
        } else {
          thinkingSteps.finalOutcome.source = 'model'; // 默认或查询失败，来源是模型
          console.log("[sendMessage] 无可用知识图谱上下文。");
        }

        // 6. 构建最终的 Prompt
        const finalPrompt = this.buildFinalPrompt(userMessage, knowledgeContext, thinkingSteps);
        thinkingSteps.answerGeneration.prompt = finalPrompt;

        // 7. 调用 LLM 生成最终答案 (流式)
        console.log("[sendMessage] 调用 LLM 生成最终答案...");
        const assistantMessage = {
          role: 'assistant',
          content: '', // 初始为空，由流式响应填充
          source: thinkingSteps.finalOutcome.source,
          thinkingSteps: thinkingSteps,
          queryDetails: this.debug ? kgResult : null // 旧调试信息
        };
        this.chatMessages.push(assistantMessage); // 先将消息框架加入列表
        this.isTyping = false; // 流式开始，停止"输入中"状态

        // 8. 处理流式响应
        await this.streamLLMResponse(finalPrompt, assistantMessage);
        thinkingSteps.answerGeneration.llmResponse = assistantMessage.content; // 记录完整响应


      } catch (error) {
        // 顶层错误处理
        console.error('[sendMessage] 处理消息时发生顶层错误:', error);
        thinkingSteps.finalOutcome.source = 'error';
        thinkingSteps.finalOutcome.errorMessage = error.message;
        this.isTyping = false;
        this.showError(error, thinkingSteps); // 显示错误信息给用户
      } finally {
        this.isTyping = false;
        this.$nextTick(() => this.scrollToBottom()); // 确保滚动到底部
      }
    },

    /**
     * @description 初始化思考过程记录对象
     * @param {string} userInput 用户输入
     * @returns {object} 初始化的 thinkingSteps 对象
     */
    initializeThinkingSteps(userInput) {
        return {
            userInput: userInput,
            entityExtraction: { method: 'LLM (专用实体提取)', attempted: false, rawInput: userInput, prompt: null, rawResponse: null, results: [], error: null },
            knowledgeGraphLookup: { attempted: false, entityUsed: null, queryType: 'none', queryDetails: null, success: false, rawResult: null, resultSummary: '未尝试知识图谱查询', error: null },
            answerGeneration: { prompt: null, llmResponse: null, error: null },
            finalOutcome: { source: 'model', errorMessage: null }
        };
    },

    // ========================================================================
    // LLM 交互 (实体提取 & 答案生成)
    // ========================================================================

    /**
     * @description 使用 LLM 精准提取用户问题中的核心实体
     * @param {string} userMessage 用户原始问题
     * @param {object} thinkingSteps 用于记录日志和调试信息
     * @returns {Promise<Array<{name: string, confidence: number | null}>>} 提取到的实体数组
     */
    async extractEntitiesWithLLM(userMessage, thinkingSteps) {
      console.log("[extractEntitiesWithLLM] 开始使用 LLM 提取实体:", userMessage);
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

      thinkingSteps.entityExtraction.prompt = prompt; // 记录 Prompt

      try {
        const response = await axios.post(this.aiApiUrl, {
          model: this.llmModel,
          messages: [{ role: 'user', content: prompt }],
          stream: false, // 实体提取不需要流式
          options: { response_format: { type: "json_object" } } // 尝试强制JSON输出
        });

        thinkingSteps.entityExtraction.rawResponse = JSON.stringify(response.data); // 记录原始响应
        console.log("[extractEntitiesWithLLM] LLM 原始响应:", response.data);

        const extractedData = this.extractJSONFromLLMResponse(response.data); // 使用辅助函数解析

        if (extractedData && Array.isArray(extractedData.entities) && extractedData.entities.every(e => typeof e === 'string')) {
          const validEntities = extractedData.entities
            .map(name => name.trim())
            .filter(name => name.length >= 2 && name.length < 50); // 过滤空/过短/过长实体

          console.log("[extractEntitiesWithLLM] 成功提取并过滤实体:", validEntities);
          return validEntities.map(name => ({ name: name, confidence: null })); // 返回标准格式
        } else {
          console.warn("[extractEntitiesWithLLM] LLM未能有效提取实体或返回格式不正确。", extractedData);
          thinkingSteps.entityExtraction.error = "LLM 返回格式不正确或未提取到实体";
          return [];
        }
      } catch (error) {
        const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
        console.error("[extractEntitiesWithLLM] LLM 实体提取过程中发生错误:", errorMsg);
        thinkingSteps.entityExtraction.error = `LLM API 调用失败: ${error.message}`;
        return [];
      }
    },

    /**
     * @description 从 LLM 可能的各种响应中稳健地提取 JSON 对象
     * @param {string | object} response LLM返回的原始数据
     * @returns {object | null} 解析后的 JSON 对象或 null
     */
    extractJSONFromLLMResponse(response) {
      if (!response) return null;
      let jsonString = '';
      if (typeof response === 'object' && response.message?.content) {
        jsonString = response.message.content; // Ollama 0.1.30+ 默认格式
      } else if (typeof response === 'string') {
        jsonString = response;
      } else if (typeof response === 'object') {
        try { // 尝试直接解析对象本身，可能LLM直接输出了JSON对象
             JSON.parse(JSON.stringify(response));
             return response;
         } catch {
             jsonString = JSON.stringify(response); // 无法解析则转为字符串处理
         }
      } else {
        return null;
      }

      try { return JSON.parse(jsonString); } catch (e1) { /* ignore */ }
      try { const m = jsonString.match(/```(?:json)?\s*([\s\S]*?)\s*```/); if(m && m[1]) return JSON.parse(m[1]); } catch (e2) { /* ignore */ }
      try { const m = jsonString.match(/\{[\s\S]*\}/); if(m && m[0]) return JSON.parse(m[0]); } catch (e3) { /* ignore */ }

      console.error("[extractJSONFromLLMResponse] 无法从响应中提取有效的 JSON:", jsonString);
      return null;
    },

    /**
     * @description 构建最终用于生成答案的 Prompt
     * @param {string} userMessage 用户原始问题
     * @param {string} knowledgeContext 从 KG 提取并格式化的上下文信息，如果无则为空字符串
     * @param {object} thinkingSteps 思考过程对象，用于了解查询情况
     * @returns {string} 构建好的 Prompt
     */
    buildFinalPrompt(userMessage, knowledgeContext, thinkingSteps) {
      let prompt;
      const kgAttempted = thinkingSteps.knowledgeGraphLookup.attempted;
      const kgSuccess = thinkingSteps.knowledgeGraphLookup.success;
      const entityUsed = thinkingSteps.knowledgeGraphLookup.entityUsed || '用户询问的主题';

      // --- Base Instructions (修正模板字符串内容) ---
      const baseInstructions = `
    【重要指令】:
    1.  **分离思考与回答**：将你所有的分析、推理、步骤拆解等内部思考过程，**完全**放入 <think>...</think> 标签内。
    2.  **最终答案**：在 <think> 标签之外，**只输出**直接面向用户的最终回答。这个回答必须简洁、流畅、完整且独立于思考过程。
    3.  **禁止在最终答案中包含思考痕迹**：最终答案中不应出现诸如"首先，我需要..."、"接下来，..." 、"因此，..."、"我的分析是..."等引导思考过程的词语。直接给出结论或信息。
    4.  **基于信息源**：如果提供了【知识图谱信息】，最终答案必须严格基于这些信息；如果没有，则基于你的通用知识。
    5.  **自然语言**：使用自然、专业的语言。
    6.  **Markdown格式**: 使用 Markdown 格式化回答（例如列表、加粗）。
    `; // 结束模板字符串

      if (knowledgeContext) {
        // --- 情况1：成功从知识图谱获取到信息 ---
        prompt = `你是一个严谨的知识问答助手。请严格根据下面提供的【知识图谱信息】来回答【用户问题】。

    【知识图谱信息】:
    \`\`\`
    ${knowledgeContext}
    \`\`\`

    【用户问题】:
    "${userMessage}"

    ${baseInstructions} // 应用基础指令

    【补充要求 - 基于知识图谱】:
    -   如果信息足够回答，请直接总结输出答案。
    -   如果信息不足以回答问题的某个方面，请在最终答案中明确说明（例如："关于 ${entityUsed} 的[某方面]，我目前没有详细信息。"）。
    -   **不要**在最终答案开头说"根据知识图谱..."，直接开始回答。
    `; // 结束模板字符串
      } else if (kgAttempted && !kgSuccess) {
        // --- 情况2：尝试查询知识图谱但失败或无结果 ---
        prompt = `你是一个智能助手。用户询问了关于 "${entityUsed}" 的问题，但在知识库中未能找到相关信息（原因：${thinkingSteps.knowledgeGraphLookup.error || '未找到匹配项'}）。

    【用户问题】:
    "${userMessage}"

    ${baseInstructions} // 应用基础指令

    【补充要求 - 查询失败】:
    -   在最终答案中，首先告知用户在知识库中未找到关于 "${entityUsed}" 的具体信息。
    -   然后，尝试基于你的通用知识库，对用户的问题提供一个可能的、一般性的回答（如果可以）。
    -   如果通用知识也无法回答，请在最终答案中坦诚说明。
    `; // 结束模板字符串
      } else {
        // --- 情况3：未尝试查询知识图谱 或 其他情况 ---
        prompt = `你是一个乐于助人的智能助手。请根据你的通用知识回答以下用户问题。

    【用户问题】:
    "${userMessage}"

    ${baseInstructions} // 应用基础指令

    【补充要求 - 通用回答】:
    -   如果问题具体但你的知识库中没有信息，请在最终答案中坦诚告知。
    -   回答应清晰、简洁。
    `; // 结束模板字符串
      }
      return prompt;
    }, // <--- 添加逗号

    /**
     * @description 处理来自 LLM 的流式响应
     * @param {string} finalPrompt 发送给 LLM 的最终 Prompt (用于重试或调试)
     * @param {object} assistantMessage Vue data 中对应的助手消息对象，用于更新 content
     */
    async streamLLMResponse(finalPrompt, assistantMessage) {
        try {
            const response = await axios.post(this.aiApiUrl, {
                model: this.llmModel,
                messages: [{ role: 'user', content: finalPrompt }],
                stream: true,
            }, { responseType: 'text' });

            let streamedContent = ''; // Store the raw streamed content
            let mainContentAccumulator = ''; // Store content outside <think> tags
            let thinkingContentAccumulator = ''; // Store content inside <think> tags
            let inThinkingBlock = false; // Track if currently inside a <think> block

            const lines = response.data.split('\n');

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const data = JSON.parse(line);
                    let chunk = '';
                    if (data.message?.content) {
                        chunk = data.message.content;
                    } else if (data.response) { // Handle non-chat models if needed
                        chunk = data.response;
                    }

                    if (chunk) {
                        streamedContent += chunk; // Append to raw content
                        assistantMessage.content = streamedContent; // Update raw content for debug/reference

                        // --- Real-time parsing for main/thinking content ---
                        let currentChunkPos = 0;
                        while (currentChunkPos < chunk.length) {
                            if (inThinkingBlock) {
                                const endTagIndex = chunk.indexOf('</think>', currentChunkPos);
                                if (endTagIndex !== -1) {
                                    // End tag found in this chunk
                                    thinkingContentAccumulator += chunk.substring(currentChunkPos, endTagIndex);
                                    inThinkingBlock = false;
                                    currentChunkPos = endTagIndex + '</think>'.length;
                                } else {
                                    // End tag not found, entire remaining chunk is thinking
                                    thinkingContentAccumulator += chunk.substring(currentChunkPos);
                                    currentChunkPos = chunk.length;
                                }
                            } else {
                                const startTagIndex = chunk.indexOf('<think>', currentChunkPos);
                                if (startTagIndex !== -1) {
                                    // Start tag found in this chunk
                                    mainContentAccumulator += chunk.substring(currentChunkPos, startTagIndex);
                                    inThinkingBlock = true;
                                    currentChunkPos = startTagIndex + '<think>'.length;
                                } else {
                                    // Start tag not found, entire remaining chunk is main content
                                    mainContentAccumulator += chunk.substring(currentChunkPos);
                                    currentChunkPos = chunk.length;
                                }
                            }
                        }

                        // Update the reactive properties for display
                        assistantMessage.mainContent = mainContentAccumulator;
                        assistantMessage.thinkingContent = thinkingContentAccumulator;
                        assistantMessage.hasThinking = thinkingContentAccumulator.trim().length > 0;

                        this.$forceUpdate(); // Force UI update for streaming
                        this.scrollToBottom();
                        if (this.typingSpeed > 0) {
                            await new Promise(resolve => setTimeout(resolve, this.typingSpeed));
                        }
                    }
                    if (data.done) break; // End of stream
                } catch (e) {
                     console.warn("[streamLLMResponse] 解析流式行失败或非JSON:", line, e);
                     // Append non-JSON line potentially to main content if not in thinking block
                     if (!inThinkingBlock) {
                         mainContentAccumulator += line + '\n';
                         assistantMessage.mainContent = mainContentAccumulator;
                         this.$forceUpdate();
                         this.scrollToBottom();
                     } else {
                         // Append to thinking content if inside a block
                         thinkingContentAccumulator += line + '\n';
                         assistantMessage.thinkingContent = thinkingContentAccumulator;
                         this.$forceUpdate();
                         this.scrollToBottom();
                     }
                }
            }

            // --- Final Cleanup and Update ---
            const finalParsed = this.parseThinkTags(streamedContent); // Parse the full raw content again for robustness
            assistantMessage.content = streamedContent.trim(); // Store final raw content
            assistantMessage.mainContent = finalParsed.mainContent;
            assistantMessage.thinkingContent = finalParsed.thinkingContent;
            assistantMessage.hasThinking = finalParsed.hasThinking;
            assistantMessage.thinkingSteps.answerGeneration.llmResponse = streamedContent.trim(); // Record raw response in thinking steps

            // Update thinkingSteps with final answer source
             if(assistantMessage.thinkingSteps) {
                assistantMessage.thinkingSteps.finalOutcome.source = assistantMessage.source;
             }

            this.$forceUpdate();
            this.scrollToBottom();

        } catch (error) {
            // ... (existing error handling remains the same) ...
            const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
            console.error("[streamLLMResponse] 调用 LLM API 失败:", errorMsg);
            // Safely access assistantMessage properties
            const finalErrorMessage = `抱歉，我在尝试回答时遇到了一个内部错误。(${error.message})`;
            const errorSource = 'error';
            // Update message directly if it exists, otherwise create a new error message
            if (assistantMessage) {
                assistantMessage.content = finalErrorMessage;
                assistantMessage.mainContent = finalErrorMessage; // Show error in main content
                assistantMessage.thinkingContent = '';
                assistantMessage.hasThinking = false;
                assistantMessage.source = errorSource;
                if (assistantMessage.thinkingSteps) {
                    assistantMessage.thinkingSteps.answerGeneration.error = `LLM API 调用失败: ${error.message}`;
                    assistantMessage.thinkingSteps.finalOutcome.source = errorSource;
                    assistantMessage.thinkingSteps.finalOutcome.errorMessage = error.message;
                }
            } else {
                // If assistantMessage wasn't even created (e.g., error before push)
                this.addMessage({
                    role: 'assistant',
                    content: finalErrorMessage,
                    mainContent: finalErrorMessage,
                    source: errorSource,
                    hasThinking: false,
                });
            }
            this.$forceUpdate();
            this.scrollToBottom();
        }
    },

    /**
     * @description Parses a string to separate content inside and outside <think> tags.
     * @param {string} text The raw text potentially containing <think> tags.
     * @returns {{mainContent: string, thinkingContent: string, hasThinking: boolean}}
     */
    parseThinkTags(text) {
      if (!text) {
        return { mainContent: '', thinkingContent: '', hasThinking: false };
      }
      let mainContent = '';
      let thinkingContent = '';
      let lastIndex = 0;
      const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
      let match;

      while ((match = thinkRegex.exec(text)) !== null) {
        // Add text before the match to mainContent
        mainContent += text.substring(lastIndex, match.index);
        // Add matched thinking content
        thinkingContent += match[1].trim() + '\n\n'; // Add newlines for separation
        // Update lastIndex to point after the match
        lastIndex = thinkRegex.lastIndex;
      }

      // Add any remaining text after the last match to mainContent
      mainContent += text.substring(lastIndex);

      // Trim results
      mainContent = mainContent.trim();
      thinkingContent = thinkingContent.trim();

      return {
        mainContent: mainContent,
        thinkingContent: thinkingContent,
        hasThinking: thinkingContent.length > 0,
      };
    },

    // ========================================================================
    // 知识图谱交互
    // ========================================================================

    /**
     * @description 尝试通过直接 API (GET /api/data/{entityName}) 查询知识图谱
     * @param {string} entityName 要查询的实体名称
     * @param {object} thinkingSteps 用于记录日志和调试信息
     * @returns {Promise<object|null>} 查询成功返回格式化后的结果对象，否则返回 null
     */
    async queryKnowledgeGraphDirectly(entityName, thinkingSteps) {
      const encodedEntity = encodeURIComponent(entityName);
      const queryUrl = `${this.apiBaseUrl}/${encodedEntity}`;
      thinkingSteps.knowledgeGraphLookup.queryType = 'direct_api';
      thinkingSteps.knowledgeGraphLookup.queryDetails = `GET ${queryUrl}`;
      console.log(`[queryKnowledgeGraphDirectly] 尝试直接 API 查询: ${entityName}`);

      try {
        const response = await axios.get(queryUrl);
        thinkingSteps.knowledgeGraphLookup.rawResult = response.data;

        // --- !!! 关键：根据你后端 API 的实际返回值调整这里的判断逻辑 !!! ---
        // 假设 response.data 是一个包含节点信息的数组 或 一个有意义的对象
        const isValidResponse = response.data && (
            (Array.isArray(response.data) && response.data.length > 0) ||
            (typeof response.data === 'object' && Object.keys(response.data).length > 0 && !Array.isArray(response.data))
        );
        // --------------------------------------------------------------------

        if (isValidResponse) {
          console.log(`[queryKnowledgeGraphDirectly] 直接 API 查询成功找到实体 "${entityName}"`);
          // --- !!! 关键：调用格式化函数，将 API 结果转为标准 {nodes, relationships} 格式 !!! ---
          const formattedResult = this.formatDirectQueryResult(response.data, entityName);
          formattedResult._source = 'direct_api'; // 标记来源
          return formattedResult;
        } else {
          console.log(`[queryKnowledgeGraphDirectly] 直接 API 查询未找到有效数据 for "${entityName}"`);
          thinkingSteps.knowledgeGraphLookup.resultSummary = `直接 API 查询 /${encodedEntity} 未返回有效数据。`;
          return null;
        }
      } catch (error) {
        // 只处理 404 (Not Found) 作为 "未找到"，其他错误认为是查询失败
        if (error.response && error.response.status === 404) {
            console.log(`[queryKnowledgeGraphDirectly] 直接 API 查询 404 Not Found for "${entityName}"`);
            thinkingSteps.knowledgeGraphLookup.resultSummary = `直接 API 查询 /${encodedEntity} 未找到实体 (404)。`;
        } else {
            const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
            console.error(`[queryKnowledgeGraphDirectly] 直接 API 查询失败 for "${entityName}": ${errorMsg}`);
            thinkingSteps.knowledgeGraphLookup.error = `直接 API 查询失败: ${error.message}`;
            thinkingSteps.knowledgeGraphLookup.resultSummary = `直接 API 查询 /${encodedEntity} 失败。`;
        }
        return null;
      }
    },

   /**
     * @description 尝试通过语义搜索 API (POST /api/data/semantic-search) 查询知识图谱
     * @param {string} userMessage 用户原始问题 (用于语义上下文)
     * @param {object} thinkingSteps 用于记录日志和调试信息
     * @returns {Promise<object|null>} 查询成功返回结果对象，否则返回 null
     */
    async queryKnowledgeGraphSemantically(userMessage, thinkingSteps) {
      const queryUrl = `${this.apiBaseUrl}/semantic-search`;
      const requestBody = { question: userMessage };
      thinkingSteps.knowledgeGraphLookup.queryType = 'semantic_api';
      thinkingSteps.knowledgeGraphLookup.queryDetails = `POST ${queryUrl}\nBody: ${JSON.stringify(requestBody)}`;
      console.log(`[queryKnowledgeGraphSemantically] 尝试语义搜索 API: "${userMessage}"`);

      try {
        const response = await axios.post(queryUrl, requestBody);
        thinkingSteps.knowledgeGraphLookup.rawResult = response.data;

        // 假设语义搜索 API 成功时直接返回 { nodes: [...], relationships: [...] } 结构
        if (response.data && Array.isArray(response.data.nodes) && response.data.nodes.length > 0) {
          console.log(`[queryKnowledgeGraphSemantically] 语义搜索 API 成功找到 ${response.data.nodes.length} 个相关节点`);
          response.data._source = 'semantic_api'; // 标记来源
          thinkingSteps.knowledgeGraphLookup.error = null; // 清除可能存在的 direct 查询错误
          return response.data;
        } else {
          console.log(`[queryKnowledgeGraphSemantically] 语义搜索 API 未找到相关数据 for "${userMessage}"`);
          // 只有在 direct API 也失败时，才将此作为最终的失败原因
          if (!thinkingSteps.knowledgeGraphLookup.success) {
              thinkingSteps.knowledgeGraphLookup.resultSummary = `语义搜索 API 未找到 "${userMessage}" 的相关数据。`;
          }
          return null;
        }
      } catch (error) {
        const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
        console.error(`[queryKnowledgeGraphSemantically] 语义搜索 API 失败: ${errorMsg}`);
         // 只有在 direct API 也失败时，才将此作为最终的失败原因
         if (!thinkingSteps.knowledgeGraphLookup.success) {
            thinkingSteps.knowledgeGraphLookup.error = `语义搜索 API 失败: ${error.message}`;
            thinkingSteps.knowledgeGraphLookup.resultSummary = `语义搜索 API 调用失败。`;
         }
        return null;
      }
    },

    /**
     * @description [!!! 需要您根据后端 API 调整 !!!] 格式化直接查询 API 的结果为标准格式
     * @param {any} data 从 GET /api/data/{entityName} 返回的原始数据
     * @param {string} queriedEntityName 查询时使用的实体名称
     * @returns {object} 包含 { nodes: [], relationships: [], _source: 'direct_api' } 的对象
     */
    formatDirectQueryResult(data, queriedEntityName) {
        console.log("[formatDirectQueryResult] 正在格式化直接查询结果 for:", queriedEntityName, "原始数据:", data);
        const result = { nodes: [], relationships: [], _source: 'direct_api' };
        const nodeMap = new Map(); // 用于避免重复添加节点

        // --- 示例逻辑：假设 data 是一个对象数组，每个对象代表一条关系 ---
        // 例如： data = [ { node1: {name: 'A', prop: 'v1'}, relationship: 'RELATED_TO', node2: {name: 'B'} }, ... ]
        if (Array.isArray(data)) {
            data.forEach((item, index) => {
                // 处理起始节点 (node1)
                if (item.node1 && item.node1.name) {
                    const nodeId = `node1_${index}_${item.node1.name}`;
                    if (!nodeMap.has(item.node1.name)) {
                         nodeMap.set(item.node1.name, nodeId);
                         result.nodes.push({
                            id: nodeId, // 生成唯一 ID
                            name: item.node1.name,
                            labels: item.node1.labels || ['Entity'], // 尝试获取标签，否则给默认
                            properties: item.node1 // 将所有属性放入 properties
                         });
                    }
                }
                // 处理目标节点 (node2)
                if (item.node2 && item.node2.name) {
                    const nodeId = `node2_${index}_${item.node2.name}`;
                    if (!nodeMap.has(item.node2.name)) {
                        nodeMap.set(item.node2.name, nodeId);
                         result.nodes.push({
                            id: nodeId,
                            name: item.node2.name,
                            labels: item.node2.labels || ['Entity'],
                            properties: item.node2
                         });
                    }
                }
                // 处理关系
                if (item.relationship && item.node1?.name && item.node2?.name) {
                    result.relationships.push({
                        id: `rel_${index}_${item.relationship}`,
                        type: item.relationship,
                        startNode: nodeMap.get(item.node1.name), // 使用 Map 中存储的 ID
                        endNode: nodeMap.get(item.node2.name),
                        properties: item.relationshipProperties || {} // 假设关系属性在此字段
                    });
                }
            });
        }
        // --- 示例逻辑：假设 data 是单个节点对象 ---
        // 例如： data = { name: 'A', prop1: 'v1', prop2: 'v2', labels: ['Person'] }
        else if (typeof data === 'object' && data !== null && data.name) {
             const nodeId = `node_${data.name}`;
             if (!nodeMap.has(data.name)) {
                 nodeMap.set(data.name, nodeId);
                 result.nodes.push({
                     id: nodeId,
                     name: data.name,
                     labels: data.labels || ['Entity'],
                     properties: data
                 });
             }
             // 如果这个API只返回节点，没有关系，则 relationships 数组为空
        }
         else {
              console.warn("[formatDirectQueryResult] 输入数据格式未知，无法格式化:", data);
              // 尝试将查询的实体本身作为一个节点返回
              const nodeId = `node_${queriedEntityName}`;
               if (!nodeMap.has(queriedEntityName)) {
                 nodeMap.set(queriedEntityName, nodeId);
                 result.nodes.push({
                     id: nodeId,
                     name: queriedEntityName,
                     labels: ['Unknown'],
                     properties: typeof data === 'object' ? data : { value: data } // 将原始数据作为属性
                 });
             }
         }

        console.log("[formatDirectQueryResult] 格式化后的结果:", result);
        return result;
    },

    /**
     * @description 将知识图谱查询结果格式化为适合注入 Prompt 的文本
     * @param {object} data 包含 { nodes: [], relationships: [] } 的对象
     * @returns {string} 格式化后的文本描述
     */
    formatKnowledgeGraphResults(data) {
      let context = '';
      const nodesById = {}; // 用于通过 ID 查找节点名称

      if (data.nodes && data.nodes.length > 0) {
        context += '【相关实体信息】:\n';
        data.nodes.forEach(node => {
          nodesById[node.id] = node; // 存储节点信息供关系查找
          context += `- 实体: ${node.name || node.id}`;
          if (node.labels && node.labels.length > 0) {
             context += ` (类型: ${node.labels.join(', ')})`;
          }
          const props = Object.entries(node.properties || {})
            .filter(([key]) => key.toLowerCase() !== 'name' && key.toLowerCase() !== 'id' && key.toLowerCase() !== 'labels' && !key.toLowerCase().includes('embedding')) // 过滤掉非必要或敏感属性
            .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
            .join('; ');
          if (props) {
            context += ` | 属性: ${props}\n`;
          } else {
            context += '\n';
          }
        });
      } else {
           context += '【未找到相关实体信息】\n';
           return context.trim(); // 如果没有节点，直接返回
      }

      if (data.relationships && data.relationships.length > 0) {
        context += '\n【相关关系信息】:\n';
        data.relationships.forEach(rel => {
          const startNode = nodesById[rel.startNode] || { name: `[节点ID:${rel.startNode}]` }; // 处理找不到节点的情况
          const endNode = nodesById[rel.endNode] || { name: `[节点ID:${rel.endNode}]` };
          context += `- (${startNode.name}) -[${rel.type}]-> (${endNode.name})`;
          const props = Object.entries(rel.properties || {})
            .filter(([key]) => !key.toLowerCase().includes('embedding'))
            .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
            .join('; ');
          if (props) {
            context += ` | 关系属性: ${props}\n`;
          } else {
            context += '\n';
          }
        });
      } else {
          context += '\n【未找到相关关系信息】';
      }

      return context.trim();
    },

    // ========================================================================
    // 后端连接与测试
    // ========================================================================

    /**
     * @description 测试与后端知识图谱API的连接性
     */
    async testDatabaseConnection() {
      console.log("[testDatabaseConnection] 开始测试知识库连接...");
      try {
        // 尝试调用一个简单的后端端点，例如获取根路径或特定测试端点
        // 这里假设 GET /api/data 可以返回一些基础信息或状态
        const response = await axios.get(this.apiBaseUrl, { timeout: 5000 }); // 5秒超时

        // 检查响应状态码和可能的响应内容
        if (response.status === 200) {
          console.log("[testDatabaseConnection] 知识库连接成功！", response.data);
          this.isConnected = true;
          this.addSystemMessage('✅ 知识库连接成功！可以为您提供基于知识图谱的问答服务。');
        } else {
          throw new Error(`连接测试返回状态码: ${response.status}`);
        }
      } catch (error) {
        console.error("[testDatabaseConnection] 知识库连接失败:", error.message);
        this.isConnected = false;
        this.addSystemMessage('⚠️ 无法连接到知识库，部分基于知识图谱的功能可能受限。将主要依赖通用模型知识回答。');
      }
    },

   /**
     * @description 获取并显示知识库中的所有实体 (假设后端支持 GET /api/data 返回所有三元组)
     */
    async showAllNodes() {
        if (!this.isConnected) {
            this.addSystemMessage("知识库未连接，无法获取实体列表。");
            return;
        }
        this.isTyping = true;
        this.addSystemMessage("正在查询知识库中的所有实体...");
        try {
            const response = await axios.get(this.apiBaseUrl); // 假设此端点返回所有数据

            if (response.data && Array.isArray(response.data)) {
                const nodes = new Set();
                // 从返回的三元组中提取所有节点名称
                 response.data.forEach(item => {
                    if (item.node1?.name) nodes.add(item.node1.name);
                    if (item.node2?.name) nodes.add(item.node2.name);
                    // 如果数据结构不同，需要调整这里的提取逻辑
                    if(item.name) nodes.add(item.name); // 也许直接返回节点列表？
                 });

                if (nodes.size > 0) {
                    let message = `知识库中目前包含以下 ${nodes.size} 个实体:\n\n`;
                    Array.from(nodes).sort().forEach(name => {
                        message += `- ${name}\n`;
                    });
                     this.addSystemMessage(message);
                } else {
                     this.addSystemMessage("知识库中暂无实体数据。");
                }
            } else {
                this.addSystemMessage("无法从后端获取有效的实体列表数据。");
                 console.warn("showAllNodes: 后端返回数据格式非预期数组:", response.data);
            }
        } catch (error) {
            console.error("[showAllNodes] 获取所有节点失败:", error);
            this.addSystemMessage(`获取节点列表时出错: ${error.response?.data?.message || error.message}`);
        } finally {
            this.isTyping = false;
        }
    },


    // ========================================================================
    // 消息格式化与显示辅助函数
    // ========================================================================

    /**
     * @description 将 Markdown 文本转换为安全的 HTML
     * @param {string} content Markdown 内容
     * @returns {string} 清理后的 HTML 字符串
     */
    formatMessage(content) {
      if (!content) return '';
      try {
        // 先用 marked 将 markdown 转为 html，然后用 DOMPurify 清理，防止 XSS
        const rawHtml = marked.parse(content);
        return DOMPurify.sanitize(rawHtml);
      } catch (error) {
        console.error('Markdown 格式化或清理失败:', error);
        return content; // 出错时返回原始内容（但要小心XSS风险）
      }
    },

    /**
     * @description 格式化 thinkingSteps 对象为可读的字符串，用于 <pre> 显示
     * @param {object} steps 思考过程对象
     * @returns {string} 格式化后的文本
     */
    formatThinkingSteps(steps) {
      if (!steps) return '无思考过程记录。';
      let output = `--- 思考过程概要 ---\n\n`;

      // 1. 用户输入
      output += `[用户输入]: ${steps.userInput}\n\n`;

      // 2. 实体提取
      output += `[1. 实体提取 (${steps.entityExtraction.method})]:\n`;
      if (steps.entityExtraction.attempted) {
        if (steps.entityExtraction.results && steps.entityExtraction.results.length > 0) {
          output += `  - 结果: [${steps.entityExtraction.results.map(e => `"${e.name}"`).join(', ')}]\n`;
        } else {
          output += `  - 结果: 未提取到有效实体\n`;
        }
        if (steps.entityExtraction.error) output += `  - 错误: ${steps.entityExtraction.error}\n`;
        // Debug模式下显示更多细节
        if (this.debug) {
             output += `  - Prompt (摘要): ${steps.entityExtraction.prompt ? steps.entityExtraction.prompt.substring(0, 100) + '...' : 'N/A'}\n`;
             output += `  - LLM原始响应 (摘要): ${steps.entityExtraction.rawResponse ? steps.entityExtraction.rawResponse.substring(0, 100) + '...' : 'N/A'}\n`;
        }
      } else {
        output += `  - 未尝试\n`;
      }
      output += `\n`;

      // 3. 知识图谱查询
      output += `[2. 知识图谱查询]:\n`;
      if (steps.knowledgeGraphLookup.attempted) {
        output += `  - 尝试实体: "${steps.knowledgeGraphLookup.entityUsed || 'N/A'}"\n`;
        output += `  - 查询方式: ${steps.knowledgeGraphLookup.queryType || 'N/A'}\n`;
        output += `  - 是否成功: ${steps.knowledgeGraphLookup.success ? '是' : '否'}\n`;
        output += `  - 结果概要: ${steps.knowledgeGraphLookup.resultSummary || '无'}\n`;
        if (steps.knowledgeGraphLookup.error) output += `  - 错误: ${steps.knowledgeGraphLookup.error}\n`;
         // Debug模式下显示更多细节
         if (this.debug) {
             output += `  - 查询详情: ${steps.knowledgeGraphLookup.queryDetails || 'N/A'}\n`;
             output += `  - KG原始结果 (摘要): ${steps.knowledgeGraphLookup.rawResult ? JSON.stringify(steps.knowledgeGraphLookup.rawResult).substring(0,100)+'...' : 'N/A'}\n`;
         }
      } else {
        output += `  - 未尝试 (可能因未提取到实体或知识库未连接)\n`;
      }
      output += `\n`;

      // 4. 答案生成
      output += `[3. 答案生成]:\n`;
      if (steps.answerGeneration.prompt) {
          // Debug 模式下显示完整 Prompt，否则显示摘要
          const promptToShow = this.debug
              ? steps.answerGeneration.prompt
              : steps.answerGeneration.prompt.substring(0, 300) + (steps.answerGeneration.prompt.length > 300 ? '...' : '');
          output += `  - 使用Prompt (摘要):\n\`\`\`\n${promptToShow}\n\`\`\`\n`;
      } else {
           output += `  - 未生成 Prompt\n`;
      }
      if (steps.answerGeneration.error) output += `  - 错误: ${steps.answerGeneration.error}\n`;
       // Debug模式下显示更多细节
       if (this.debug && steps.answerGeneration.llmResponse) {
            output += `  - LLM完整响应 (摘要): ${steps.answerGeneration.llmResponse.substring(0,150)}...\n`;
       }
      output += `\n`;

      // 5. 最终结果
       output += `[最终结果]:\n`;
       output += `  - 答案来源: ${this.getSourceName(steps.finalOutcome.source)}\n`;
       if (steps.finalOutcome.errorMessage) output += `  - 过程错误: ${steps.finalOutcome.errorMessage}\n`;

      return output;
    },

    /**
     * @description 添加系统消息到聊天记录
     * @param {string} content 系统消息内容
     */
    addSystemMessage(content) {
      this.chatMessages.push({
        role: 'system',
        content: content,
        source: 'system', // 标记来源为系统
        timestamp: new Date() // 可选：添加时间戳
      });
       this.$nextTick(() => this.scrollToBottom());
    },

    /**
     * @description 显示错误信息给用户
     * @param {Error} error 捕获到的错误对象
     * @param {object} thinkingSteps 当前的思考过程记录，用于附加到错误消息中
     */
    showError(error, thinkingSteps) {
      const errorMessage = error.response?.data?.error || // Ollama 错误格式
                           error.response?.data?.message || // 通用错误格式
                           error.message; // 其他错误
      const errorDetails = this.debug ? `\n\n调试信息：${JSON.stringify(error.response?.data || error, null, 2)}` : '';

      // 创建错误消息对象，也包含思考过程
      const errorMsgObject = {
        role: 'assistant', // 显示为助手发出的错误消息
        content: `抱歉，处理您的请求时遇到了问题：${errorMessage}${errorDetails}`,
        source: 'error',
        thinkingSteps: thinkingSteps // 将思考过程附加到错误消息上
      };
      this.chatMessages.push(errorMsgObject);
      this.$nextTick(() => this.scrollToBottom());
    },

    // ========================================================================
    // UI 辅助函数
    // ========================================================================

    /**
     * @description 将聊天消息区域滚动到底部
     */
    scrollToBottom() {
      this.$nextTick(() => {
        const container = this.$refs.chatMessages;
        if (container) {
          container.scrollTop = container.scrollHeight;
        }
      });
    },

    /**
     * @description 切换调试模式
     */
    toggleDebug() {
      this.debug = !this.debug;
      console.log(`调试模式已 ${this.debug ? '开启' : '关闭'}`);
    },

    /**
     * @description 根据消息角色返回对应的 Font Awesome 图标类名
     */
    getRoleIcon(role) {
        switch (role) {
            case 'assistant': return 'fas fa-robot';
            case 'user': return 'fas fa-user';
            case 'system': return 'fas fa-info-circle';
            default: return 'fas fa-question-circle';
        }
    },

    /**
     * @description 根据消息角色返回对应的名称
     */
    getRoleName(role) {
        switch (role) {
            case 'assistant': return 'AI 助手';
            case 'user': return '您';
            case 'system': return '系统消息';
            default: return '未知';
        }
    },

     /**
     * @description 根据消息来源返回对应的 Font Awesome 图标类名
     */
     getSourceIcon(source) {
        switch (source) {
            case 'knowledge_graph': return 'fas fa-database';
            case 'model': return 'fas fa-brain'; // 使用大脑图标表示纯模型
            case 'error': return 'fas fa-exclamation-triangle';
            case 'system': return 'fas fa-info-circle';
            default: return 'fas fa-question-circle';
        }
    },

    /**
     * @description 根据消息来源返回对应的名称
     */
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
.ai-assistant-container {
  display: flex;
  flex-direction: column;
  height: 100vh; /* 占满整个视口高度 */
  background-color: #f0f2f5; /* 更柔和的背景色 */
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  color: #333;
}

/* --- 聊天头部 --- */
.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 25px;
  background-color: #ffffff;
  border-bottom: 1px solid #e8e8e8;
  flex-shrink: 0; /* 防止头部被压缩 */
}

.header-left h3 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: #2c3e50;
}

.model-info {
  font-size: 0.75rem;
  color: #888;
  margin-top: 2px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 15px; /* 增加元素间距 */
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.85rem;
  padding: 5px 10px;
  border-radius: 15px; /* 圆角 */
  transition: all 0.3s ease;
}

.status-indicator.active {
  color: #1890ff; /* 蓝色表示连接 */
  background-color: #e6f7ff;
  border: 1px solid #91d5ff;
}
.status-indicator.active i {
   color: #1890ff;
}

.status-indicator.inactive {
  color: #fa541c; /* 橙红色表示未连接 */
  background-color: #fff2e8;
   border: 1px solid #ffbb96;
}
.status-indicator.inactive i {
    color: #fa541c;
}


.action-button {
  background: none;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  color: #555;
  cursor: pointer;
  padding: 6px 8px; /* 调整内边距 */
  font-size: 0.9rem; /* 调整图标大小 */
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.action-button:hover {
  border-color: #1890ff;
  color: #1890ff;
  background-color: #f0f8ff;
}

.debug-toggle.active {
  border-color: #ff4d4f;
  color: #ff4d4f;
  background-color: #fff1f0;
}

/* --- 聊天消息区域 --- */
.chat-messages {
  flex: 1; /* 占据剩余空间 */
  padding: 20px 25px;
  overflow-y: auto; /* 超出内容时滚动 */
  display: flex;
  flex-direction: column;
  gap: 18px; /* 消息间距 */
}

.message {
  display: flex;
  max-width: 80%; /* 消息最大宽度 */
}

.message.user {
  justify-content: flex-end; /* 用户消息靠右 */
  margin-left: auto; /* 确保靠右 */
}

.message.assistant, .message.system {
  justify-content: flex-start; /* AI和系统消息靠左 */
  margin-right: auto; /* 确保靠左 */
}

.message-content {
  padding: 12px 18px;
  border-radius: 12px;
  background-color: #ffffff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  word-wrap: break-word; /* 允许长单词换行 */
  position: relative; /* 用于可能的角标等 */
  line-height: 1.6;
}

.message.user .message-content {
  background-color: #e6f7ff; /* 用户的消息用浅蓝色背景 */
  border-top-right-radius: 4px; /* 轻微调整圆角增加对话感 */
}

.message.assistant .message-content {
   border-top-left-radius: 4px;
}

/* 系统消息样式 */
.message.system .message-content {
  background-color: #fafafa;
  border: 1px solid #e8e8e8;
  color: #555;
  font-size: 0.9rem;
  width: 100%; /* 系统消息通常占满宽度 */
  max-width: 100%;
  text-align: center;
  box-shadow: none;
}

.message-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  padding-bottom: 5px;
  border-bottom: 1px solid #f0f0f0; /* 分隔线 */
}

.message-role {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  color: #555;
}
.message-role i {
    font-size: 0.9rem;
}

.message-source {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.75rem;
  padding: 3px 8px;
  border-radius: 10px;
  background-color: #f0f0f0;
  color: #666;
}
.message-source i {
    font-size: 0.8em;
}
/* 不同来源的颜色 */
.message-source.source-knowledge_graph { background-color: #d4edda; color: #155724; }
.message-source.source-model { background-color: #d1ecf1; color: #0c5460; }
.message-source.source-error { background-color: #f8d7da; color: #721c24; }


/* --- 思考过程样式 --- */
.thinking-steps {
  margin-top: 10px;
  margin-bottom: 8px;
  padding: 5px 0px; /* 调整内边距 */
  background-color: transparent; /* 背景透明 */
  border: none; /* 移除边框 */
  border-top: 1px dashed #e0e0e0; /* 使用虚线上边框分隔 */
  border-radius: 0; /* 移除圆角 */
  font-size: 0.8rem;
}

.thinking-steps summary {
  cursor: pointer;
  font-weight: 500;
  color: #666; /* 更柔和的颜色 */
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 0; /* 增加点击区域 */
  list-style: none; /* 移除默认的三角 */
  transition: color 0.2s ease;
}
.thinking-steps summary::-webkit-details-marker { display: none; } /* 隐藏 Chrome/Safari 默认三角 */

.thinking-steps summary:hover {
  color: #1890ff;
}
.thinking-steps summary i.fa-brain {
    margin-right: 5px;
    color: #999;
}
.thinking-steps summary:hover i.fa-brain {
    color: #1890ff;
}

.thinking-steps .details-arrow {
  transition: transform 0.2s ease-in-out;
  font-size: 0.8em;
  margin-left: 5px;
  color: #aaa;
}

.thinking-steps[open] summary .details-arrow {
  transform: rotate(180deg);
}

.thinking-steps-content { /* 应用于 <pre> 标签 */
  margin-top: 8px;
  padding: 12px;
  background-color: #f8f9fa; /* 轻微背景色 */
  border: 1px solid #e9ecef;
  border-radius: 6px;
  white-space: pre-wrap; /* 允许自动换行 */
  word-break: break-all; /* 长单词或URL换行 */
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace; /* 等宽字体 */
  font-size: 0.9em; /* 稍微缩小字体 */
  color: #495057;
  max-height: 400px; /* 限制最大高度 */
  overflow-y: auto; /* 超出时滚动 */
}

/* --- 消息文本样式 --- */
.message-text {
  font-size: 0.95rem; /* 主文本大小 */
  color: #333;
}
/* Markdown生成的HTML元素样式 */
.message-text p { margin-bottom: 0.8em; }
.message-text p:last-child { margin-bottom: 0; }
.message-text ul, .message-text ol { padding-left: 20px; margin-bottom: 0.8em; }
.message-text li { margin-bottom: 0.4em; }
.message-text code {
  background-color: #f0f0f0;
  padding: 2px 5px;
  border-radius: 4px;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
  font-size: 0.9em;
  color: #d63384; /* 粉色代码 */
}
.message-text pre {
  background-color: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 6px;
  padding: 12px;
  margin: 10px 0;
  overflow-x: auto; /* 代码块横向滚动 */
  font-size: 0.9em;
}
.message-text pre code {
  background-color: transparent;
  padding: 0;
  color: inherit; /* 继承pre的颜色 */
}
.message-text blockquote {
  border-left: 3px solid #ccc;
  padding-left: 10px;
  margin-left: 0;
  color: #666;
}
.message-text a {
  color: #1890ff;
  text-decoration: none;
}
.message-text a:hover {
  text-decoration: underline;
}


/* --- AI 输入指示器 --- */
.typing-indicator-container .message-content {
  padding: 10px 15px;
  display: inline-block;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}
.typing-indicator { display: flex; align-items: center; gap: 5px; }
.typing-indicator span {
  width: 8px;
  height: 8px;
  background-color: #1890ff;
  border-radius: 50%;
  opacity: 0.8;
  animation: typing-bounce 1.3s infinite ease-in-out;
}
.typing-indicator span:nth-child(1) { animation-delay: -0.24s; }
.typing-indicator span:nth-child(2) { animation-delay: -0.12s; }
.typing-indicator span:nth-child(3) { animation-delay: 0s; }

@keyframes typing-bounce {
  0%, 80%, 100% { transform: scale(0.5); opacity: 0.5; }
  40% { transform: scale(1.0); opacity: 1; }
}

/* --- 聊天输入区域 --- */
.chat-input {
  display: flex;
  align-items: flex-end; /* 按钮和文本框底部对齐 */
  padding: 15px 25px;
  background-color: #ffffff;
  border-top: 1px solid #e8e8e8;
  flex-shrink: 0; /* 防止输入区域被压缩 */
  gap: 10px;
}

.chat-input textarea {
  flex-grow: 1; /* 占据大部分空间 */
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  padding: 10px 15px;
  font-size: 0.95rem;
  line-height: 1.5;
  resize: none; /* 禁止手动调整qwe大小 */
  max-height: 150px; /* 限制最大高度 */
  overflow-y: auto; /* 超出时滚动 */
  transition: border-color 0.3s, box-shadow 0.3s;
  font-family: inherit;
}

.chat-input textarea:focus {
  border-color: #1890ff;
  box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2);
  outline: none;
}
.chat-input textarea:disabled {
    background-color: #f5f5f5;
    cursor: not-allowed;
}

.send-button {
  background-color: #1890ff;
  color: white;
  border: none;
  border-radius: 6px;
  padding: 0 18px; /* 调整内边距 */
  height: 40px; /* 固定高度，与文本框对齐 */
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-shrink: 0; /* 防止按钮被压缩 */
}

.send-button:hover {
  background-color: #40a9ff;
}

.send-button:disabled {
  background-color: #bfbfbf;
  cursor: not-allowed;
}
.send-button i {
    font-size: 1rem; /* 调整图标大小 */
}

/* --- 调试专用样式 --- */
.debug-only {
    display: block; /* Debug模式下显示 */
}
.debug-panel {
  padding: 15px 25px;
  background-color: #fffbe6; /* 淡黄色背景 */
  border-top: 1px solid #ffe58f;
  font-size: 0.8rem;
  max-height: 250px;
  overflow-y: auto;
}
.debug-section h4 { margin: 0 0 8px 0; font-size: 0.9rem; color: #d46b08; }
.debug-section pre { margin: 0; padding: 8px; background: #fff; border: 1px solid #eee; border-radius: 4px; white-space: pre-wrap; word-break: break-all; }
.query-details {
  margin-top: 10px;
  padding: 10px;
  background: #f8f9fa;
  border: 1px dashed #ddd;
  border-radius: 4px;
  font-size: 0.8rem;
}
.query-details strong { color: #0056b3; }
.query-details pre { background-color: #fff; padding: 5px; margin-top: 5px; }

/* 默认隐藏调试信息 */
.debug-panel:not(.debug-only), .query-details:not(.debug-only) {
    /* display: none; */ /* 使用 v-if 控制，这里不需要 */
}

/* --- 滚动条美化 (可选) --- */
.chat-messages::-webkit-scrollbar { width: 6px; }
.chat-messages::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 3px; }
.chat-messages::-webkit-scrollbar-thumb { background: #ccc; border-radius: 3px; }
.chat-messages::-webkit-scrollbar-thumb:hover { background: #aaa; }

textarea::-webkit-scrollbar { width: 6px; }
textarea::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 3px; }
textarea::-webkit-scrollbar-thumb { background: #ccc; border-radius: 3px; }
textarea::-webkit-scrollbar-thumb:hover { background: #aaa; }

</style>