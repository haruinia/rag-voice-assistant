const express = require('express');
const router = express.Router();
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');

// 配置multer用于处理音频文件上传
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 限制10MB
});

// 从环境变量获取配置
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const ALIYUN_APP_KEY = process.env.ALIYUN_APP_KEY || 'yXfaTeWXf28V9pEh';

// 获取阿里云语音服务token的函数
async function getAliyunToken() {
  try {
    const response = await axios.get('http://localhost:3000/api/get-speech-token');
    return response.data.token;
  } catch (error) {
    console.error('获取阿里云token失败:', error);
    throw error;
  }
}

// 阿里云语音识别函数
async function performASR(audioBuffer) {
  const token = await getAliyunToken();
  
  const formData = new FormData();
  formData.append('audio', audioBuffer, {
    filename: 'audio.pcm',
    contentType: 'audio/pcm'
  });
  
  const response = await axios.post(
    'https://nls-gateway.cn-shanghai.aliyuncs.com/stream/v1/asr',
    formData,
    {
      headers: {
        ...formData.getHeaders(),
        'X-NLS-Token': token,
        'appkey': ALIYUN_APP_KEY
      },
      params: {
        format: 'pcm',
        sample_rate: 16000,
        enable_punctuation_prediction: true,
        enable_inverse_text_normalization: true
      }
    }
  );
  
  return response.data.result;
}

// 阿里云语音合成函数
async function performTTS(text) {
  const token = await getAliyunToken();
  
  const response = await axios.post(
    'https://nls-gateway.cn-shanghai.aliyuncs.com/stream/v1/tts',
    {
      text: text,
      voice: 'zhixiaobai',
      format: 'pcm',
      sample_rate: 16000,
      volume: 50,
      speech_rate: 0,
      pitch_rate: 0
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'X-NLS-Token': token,
        'appkey': ALIYUN_APP_KEY
      },
      responseType: 'arraybuffer'
    }
  );
  
  return response.data;
}

// 实体提取函数（复用前端逻辑）
async function extractEntities(userMessage) {
  const prompt = `任务：请从以下用户问题中，精准地提取出最核心的名词性实体（例如：人名、地名、组织名、物品名称、概念术语等）。
用户问题："${userMessage}"
提取要求：
1. 专注于识别问题指向的核心查询对象。
2. 必须忽略所有非实体词语。
3. 以 JSON 格式返回结果，包含一个名为 "entities" 的数组。
4. 绝对只输出 JSON 对象本身。
JSON 输出格式示例：{"entities": ["实体1", "实体2"]}`;

  const response = await axios.post(
    'https://api.deepseek.com/v1/chat/completions',
    {
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      response_format: { type: "json_object" }
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      }
    }
  );
  
  const result = JSON.parse(response.data.choices[0].message.content);
  return result.entities || [];
}

// 查询知识图谱
async function queryKnowledgeGraph(entityName) {
  try {
    // 直接查询
    const directResponse = await axios.get(
      `http://localhost:3000/api/data/${encodeURIComponent(entityName)}`
    );
    if (directResponse.data && directResponse.data.length > 0) {
      return { data: directResponse.data, source: 'direct' };
    }
  } catch (error) {
    console.log('直接查询失败，尝试模糊查询');
  }
  
  try {
    // 模糊查询
    const fuzzyResponse = await axios.post(
      'http://localhost:3000/api/data/fuzzy-search',
      { searchText: entityName }
    );
    if (fuzzyResponse.data && fuzzyResponse.data.nodes && fuzzyResponse.data.nodes.length > 0) {
      return { data: fuzzyResponse.data, source: 'fuzzy' };
    }
  } catch (error) {
    console.log('模糊查询失败');
  }
  
  return null;
}

// 生成最终回答
async function generateAnswer(userMessage, knowledgeContext) {
  let prompt;
  
  if (knowledgeContext) {
    prompt = `你是一个严谨的知识问答助手。请严格根据下面提供的【知识图谱信息】来回答【用户问题】。
【知识图谱信息】:
${knowledgeContext}
【用户问题】:"${userMessage}"
请直接给出简洁、准确的答案，不要包含任何思考过程。`;
  } else {
    prompt = `你是一个乐于助人的智能助手。用户问题："${userMessage}"
请根据你的通用知识简洁地回答这个问题。`;
  }
  
  const response = await axios.post(
    'https://api.deepseek.com/v1/chat/completions',
    {
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      stream: false
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      }
    }
  );
  
  return response.data.choices[0].message.content;
}

// 格式化知识图谱结果
function formatKnowledgeResults(data) {
  let context = '【相关信息】:\n';
  
  if (data.nodes) {
    data.nodes.forEach(node => {
      context += `- ${node.name}`;
      if (node.properties) {
        const props = Object.entries(node.properties)
          .filter(([key]) => !['name', 'id', 'embedding'].includes(key.toLowerCase()))
          .map(([key, value]) => `${key}: ${value}`)
          .join('; ');
        if (props) context += ` | ${props}`;
      }
      context += '\n';
    });
  } else if (Array.isArray(data)) {
    data.forEach(item => {
      if (item.node1 && item.node2 && item.relationship) {
        context += `- ${item.node1.name} -[${item.relationship}]-> ${item.node2.name}\n`;
      }
    });
  }
  
  return context;
}

// 清理文本用于TTS
function cleanTextForTTS(text) {
  // 移除markdown格式
  text = text.replace(/```[\s\S]*?```/g, '');
  text = text.replace(/`([^`]+)`/g, '$1');
  text = text.replace(/\*\*(.*?)\*\*/g, '$1');
  text = text.replace(/\*(.*?)\*/g, '$1');
  text = text.replace(/^#{1,6}\s+/gm, '');
  text = text.replace(/^\s*[*+-]\s+/gm, '');
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/\n+/g, '。');
  return text.trim();
}

// 主要的语音交互端点
router.post('/interact', upload.single('audio'), async (req, res) => {
  try {
    console.log('收到语音交互请求');
    
    // 1. 检查音频数据
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: '未收到音频数据' });
    }
    
    // 2. 语音识别
    console.log('开始语音识别...');
    const transcribedText = await performASR(req.file.buffer);
    console.log('识别结果:', transcribedText);
    
    if (!transcribedText || transcribedText.trim().length === 0) {
      return res.status(400).json({ error: '未能识别语音内容' });
    }
    
    // 3. RAG流程
    console.log('开始RAG流程...');
    
    // 提取实体
    const entities = await extractEntities(transcribedText);
    console.log('提取的实体:', entities);
    
    let knowledgeContext = null;
    
    // 查询知识图谱
    if (entities.length > 0) {
      const kgResult = await queryKnowledgeGraph(entities[0]);
      if (kgResult) {
        knowledgeContext = formatKnowledgeResults(kgResult.data);
        console.log('找到知识图谱信息');
      }
    }
    
    // 生成答案
    const answer = await generateAnswer(transcribedText, knowledgeContext);
    console.log('生成的答案:', answer);
    
    // 4. 文本转语音
    console.log('开始语音合成...');
    const cleanAnswer = cleanTextForTTS(answer);
    const audioBuffer = await performTTS(cleanAnswer);
    
    // 5. 返回结果
    res.set({
      'Content-Type': 'audio/pcm',
      'X-Transcribed-Text': encodeURIComponent(transcribedText),
      'X-Answer-Text': encodeURIComponent(answer)
    });
    
    res.send(Buffer.from(audioBuffer));
    
  } catch (error) {
    console.error('语音交互处理错误:', error);
    res.status(500).json({ 
      error: '处理请求时发生错误',
      message: error.message 
    });
  }
});

// 健康检查端点
router.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    service: 'voice-interaction',
    hasDeepSeekKey: !!DEEPSEEK_API_KEY
  });
});

module.exports = router;