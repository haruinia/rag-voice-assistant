// routes/hardware.js - 新增硬件设备专用API路由
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const router = express.Router();

// 配置multer用于接收音频文件
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB限制
  },
  fileFilter: (req, file, cb) => {
    // 支持常见音频格式
    const allowedMimes = [
      'audio/wav', 'audio/mp3', 'audio/mpeg', 
      'audio/pcm', 'audio/x-wav', 'application/octet-stream'
    ];
    cb(null, allowedMimes.includes(file.mimetype) || file.originalname.endsWith('.pcm'));
  }
});

// 设备状态管理
const deviceStatus = new Map();
const activeConnections = new Map();

// 5. 改进SSE连接处理
router.get('/devices/:deviceId/stream', (req, res) => {
  const deviceId = req.params.deviceId;
  
  console.log(`SSE connection request from device: ${deviceId}`);
  
  // 设置SSE头
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  // 发送连接确认
  res.write(`data: ${JSON.stringify({
    type: 'connected',
    deviceId: deviceId,
    timestamp: new Date().toISOString()
  })}\n\n`);

  // 存储连接
  activeConnections.set(deviceId, res);
  
  // 确保设备已注册
  updateDeviceStatus(deviceId, { isConnected: true });

  // 发送当前状态
  const status = deviceStatus.get(deviceId);
  if (status) {
    res.write(`data: ${JSON.stringify({
      type: 'status',
      ...status
    })}\n\n`);
  }

  // 心跳
  const heartbeat = setInterval(() => {
    if (activeConnections.has(deviceId)) {
      try {
        res.write(`data: ${JSON.stringify({
          type: 'heartbeat',
          timestamp: new Date().toISOString()
        })}\n\n`);
      } catch (error) {
        console.log(`Heartbeat failed for ${deviceId}, cleaning up connection`);
        clearInterval(heartbeat);
        activeConnections.delete(deviceId);
      }
    } else {
      clearInterval(heartbeat);
    }
  }, 30000);

  // 连接关闭处理
  req.on('close', () => {
    console.log(`SSE connection closed for device ${deviceId}`);
    activeConnections.delete(deviceId);
    clearInterval(heartbeat);
    
    // 不要立即设为离线，保持1分钟缓存
    setTimeout(() => {
      if (!activeConnections.has(deviceId)) {
        updateDeviceStatus(deviceId, { isConnected: false, status: 'offline' });
      }
    }, 60000);
  });
});


// 发送消息到指定设备的辅助函数
function sendToDevice(deviceId, data) {
  const connection = activeConnections.get(deviceId);
  if (connection) {
    try {
      connection.write(`data: ${JSON.stringify(data)}\n\n`);
      return true;
    } catch (error) {
      console.error(`Failed to send to device ${deviceId}:`, error);
      activeConnections.delete(deviceId);
      return false;
    }
  }
  return false;
}

// 更新设备状态的辅助函数
function updateDeviceStatus(deviceId, updates) {
  const status = deviceStatus.get(deviceId) || {
    id: deviceId,
    status: 'online',
    lastSeen: new Date(),
    isListening: false,
    isSpeaking: false,
    currentTask: null
  };
  
  Object.assign(status, updates, { lastSeen: new Date() });
  deviceStatus.set(deviceId, status);
  
  // 广播状态更新
  sendToDevice(deviceId, {
    type: 'status',
    ...status
  });
  
  return status;
}

// 4. 修复设备列表API，确保返回所有已注册设备
router.get('/devices', (req, res) => {
  const devices = Array.from(deviceStatus.values()).map(device => ({
    ...device,
    isConnected: activeConnections.has(device.id) || 
                 (device.lastSeen && (Date.now() - new Date(device.lastSeen).getTime()) < 60000) // 1分钟内活跃
  }));
  
  console.log(`Returning ${devices.length} devices:`, devices.map(d => ({
    id: d.id,
    status: d.status,
    isConnected: d.isConnected,
    lastSeen: d.lastSeen
  })));
  
  res.json({
    success: true,
    devices: devices,
    total: devices.length,
    online: devices.filter(d => d.isConnected).length
  });
});

// 2. 获取特定设备状态
router.get('/devices/:deviceId', (req, res) => {
  const deviceId = req.params.deviceId;
  const device = deviceStatus.get(deviceId);
  
  if (!device) {
    return res.status(404).json({
      success: false,
      error: 'Device not found'
    });
  }
  
  res.json({
    success: true,
    device: {
      ...device,
      isConnected: activeConnections.has(deviceId)
    }
  });
});

// 3. 语音识别接口 - 接收设备音频并转换为文字
router.post('/devices/:deviceId/asr', upload.single('audio'), async (req, res) => {
  const deviceId = req.params.deviceId;
  const audioFile = req.file;
  
  console.log(`Received ASR request from device: ${deviceId}`);
  
  if (!audioFile) {
    return res.status(400).json({
      success: false,
      error: 'No audio file provided'
    });
  }

  try {
    // 更新设备状态
    updateDeviceStatus(deviceId, {
      isListening: false,
      currentTask: 'processing_asr'
    });

    // 调用阿里云ASR API (使用现有的token逻辑)
    const tokenResponse = await axios.get('http://localhost:3000/api/get-speech-token');
    if (!tokenResponse.data.success) {
      throw new Error('Failed to get ASR token');
    }

    const token = tokenResponse.data.token;
    const appKey = 'yXfaTeWXf28V9pEh'; // 使用现有的AppKey

    // 创建FormData用于阿里云API
    const formData = new FormData();
    formData.append('appkey', appKey);
    formData.append('token', token);
    formData.append('format', 'wav'); // 根据实际格式调整
    formData.append('sample_rate', '16000');
    formData.append('enable_punctuation_prediction', 'true');
    formData.append('enable_inverse_text_normalization', 'true');
    
    // 添加音频文件
    formData.append('file', audioFile.buffer, {
      filename: 'audio.wav',
      contentType: audioFile.mimetype || 'audio/wav'
    });

    // 调用阿里云一句话识别API
    const asrResponse = await axios.post(
      'https://nls-gateway.cn-shanghai.aliyuncs.com/stream/v1/asr',
      formData,
      {
        headers: {
          ...formData.getHeaders(),
        },
        timeout: 30000
      }
    );

    const recognizedText = asrResponse.data.result || '';
    console.log(`ASR result for device ${deviceId}: ${recognizedText}`);

    // 更新设备状态
    updateDeviceStatus(deviceId, {
      currentTask: null
    });

    res.json({
      success: true,
      text: recognizedText,
      deviceId: deviceId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`ASR error for device ${deviceId}:`, error);
    
    updateDeviceStatus(deviceId, {
      currentTask: null
    });

    res.status(500).json({
      success: false,
      error: 'ASR processing failed',
      details: error.message
    });
  }
});

// 4. 智能问答接口 - 处理设备发送的文字问题
router.post('/devices/:deviceId/chat', async (req, res) => {
  const deviceId = req.params.deviceId;
  const { message, sessionId } = req.body;

  console.log(`Received chat request from device: ${deviceId}, message: ${message}`);

  if (!message || !message.trim()) {
    return res.status(400).json({
      success: false,
      error: 'No message provided'
    });
  }

  try {
    // 更新设备状态
    updateDeviceStatus(deviceId, {
      currentTask: 'processing_chat'
    });

    // 调用现有的聊天处理逻辑 (复用Web版本的逻辑)
    // 这里可以直接调用现有的RAG处理函数
    const chatResponse = await processChatMessage(message, sessionId);

    // 更新设备状态
    updateDeviceStatus(deviceId, {
      currentTask: null
    });

    res.json({
      success: true,
      response: chatResponse.text,
      source: chatResponse.source,
      deviceId: deviceId,
      sessionId: sessionId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`Chat error for device ${deviceId}:`, error);
    
    updateDeviceStatus(deviceId, {
      currentTask: null
    });

    res.status(500).json({
      success: false,
      error: 'Chat processing failed',
      details: error.message
    });
  }
});

// 5. TTS接口 - 将文字转换为语音并返回给设备
router.post('/devices/:deviceId/tts', async (req, res) => {
  const deviceId = req.params.deviceId;
  const { text, voice, format } = req.body;

  console.log(`Received TTS request from device: ${deviceId}, text: ${text}`);

  if (!text || !text.trim()) {
    return res.status(400).json({
      success: false,
      error: 'No text provided'
    });
  }

  try {
    // 更新设备状态
    updateDeviceStatus(deviceId, {
      isSpeaking: true,
      currentTask: 'generating_tts'
    });

    // 获取TTS token
    const tokenResponse = await axios.get('http://localhost:3000/api/get-speech-token');
    if (!tokenResponse.data.success) {
      throw new Error('Failed to get TTS token');
    }

    const token = tokenResponse.data.token;
    const appKey = 'yXfaTeWXf28V9pEh';

    // 构建TTS请求参数
    const params = new URLSearchParams({
      appkey: appKey,
      token: token,
      text: text,
      voice: voice || 'xiaomei',
      format: format || 'mp3',
      sample_rate: 16000,
      speech_rate: -86,
      pitch_rate: -68,
      volume: 50
    });

    // 调用阿里云TTS API
    const ttsResponse = await axios.get(
      `https://nls-gateway.cn-shanghai.aliyuncs.com/stream/v1/tts?${params.toString()}`,
      {
        responseType: 'arraybuffer',
        timeout: 30000
      }
    );

    // 更新设备状态
    updateDeviceStatus(deviceId, {
      currentTask: null
    });

    // 返回音频数据
    res.set({
      'Content-Type': `audio/${format || 'mp3'}`,
      'Content-Length': ttsResponse.data.length,
      'X-Device-ID': deviceId,
      'X-Timestamp': new Date().toISOString()
    });

    res.send(Buffer.from(ttsResponse.data));

    // 音频发送完成后更新状态
    setTimeout(() => {
      updateDeviceStatus(deviceId, {
        isSpeaking: false
      });
    }, 1000);

  } catch (error) {
    console.error(`TTS error for device ${deviceId}:`, error);
    
    updateDeviceStatus(deviceId, {
      isSpeaking: false,
      currentTask: null
    });

    res.status(500).json({
      success: false,
      error: 'TTS processing failed',
      details: error.message
    });
  }
});

// 6. 完整对话接口 - 一个接口完成ASR+Chat+TTS全流程
router.post('/devices/:deviceId/conversation', upload.single('audio'), async (req, res) => {
  const deviceId = req.params.deviceId;
  const audioFile = req.file;
  const { sessionId, voice, format } = req.body;

  console.log(`Received full conversation request from device: ${deviceId}`);

  if (!audioFile) {
    return res.status(400).json({
      success: false,
      error: 'No audio file provided'
    });
  }

  try {
    // 更新设备状态
    updateDeviceStatus(deviceId, {
      isListening: false,
      currentTask: 'processing_conversation'
    });

    // 步骤1: ASR - 语音转文字
    console.log(`Step 1: ASR for device ${deviceId}`);
    const asrResult = await performASR(audioFile);
    
    if (!asrResult.success || !asrResult.text.trim()) {
      throw new Error('ASR failed or no speech detected');
    }

    // 步骤2: Chat - 智能问答
    console.log(`Step 2: Chat for device ${deviceId}, text: ${asrResult.text}`);
    const chatResult = await processChatMessage(asrResult.text, sessionId);

    // 步骤3: TTS - 文字转语音
    console.log(`Step 3: TTS for device ${deviceId}, response: ${chatResult.text}`);
    const ttsResult = await performTTS(chatResult.text, voice, format);

    // 更新设备状态
    updateDeviceStatus(deviceId, {
      currentTask: null
    });

    // 返回完整结果
    res.set({
      'Content-Type': `audio/${format || 'mp3'}`,
      'X-Device-ID': deviceId,
      'X-User-Text': encodeURIComponent(asrResult.text),
      'X-AI-Response': encodeURIComponent(chatResult.text),
      'X-Source': chatResult.source,
      'X-Session-ID': sessionId,
      'X-Timestamp': new Date().toISOString()
    });

    res.send(ttsResult.audioBuffer);

    console.log(`Conversation completed for device ${deviceId}`);

  } catch (error) {
    console.error(`Conversation error for device ${deviceId}:`, error);
    
    updateDeviceStatus(deviceId, {
      currentTask: null
    });

    res.status(500).json({
      success: false,
      error: 'Conversation processing failed',
      details: error.message
    });
  }
});

// 7. 设备控制接口
router.post('/devices/:deviceId/control', (req, res) => {
  const deviceId = req.params.deviceId;
  const { action, params } = req.body;

  console.log(`Control command for device ${deviceId}: ${action}`);

  try {
    let response = { success: true, action, deviceId };

    switch (action) {
      case 'start_listening':
        updateDeviceStatus(deviceId, { isListening: true });
        sendToDevice(deviceId, { type: 'command', action: 'start_listening' });
        response.message = 'Started listening';
        break;

      case 'stop_listening':
        updateDeviceStatus(deviceId, { isListening: false });
        sendToDevice(deviceId, { type: 'command', action: 'stop_listening' });
        response.message = 'Stopped listening';
        break;

      case 'stop_speaking':
        updateDeviceStatus(deviceId, { isSpeaking: false });
        sendToDevice(deviceId, { type: 'command', action: 'stop_speaking' });
        response.message = 'Stopped speaking';
        break;

      case 'reset':
        updateDeviceStatus(deviceId, { 
          isListening: false, 
          isSpeaking: false, 
          currentTask: null 
        });
        sendToDevice(deviceId, { type: 'command', action: 'reset' });
        response.message = 'Device reset';
        break;

      default:
        response.success = false;
        response.error = 'Unknown action';
    }

    res.json(response);

  } catch (error) {
    console.error(`Control error for device ${deviceId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Control command failed',
      details: error.message
    });
  }
});

// 辅助函数 - ASR处理
// 修复后的 routes/hardware.js - 主要修复ASR认证问题

// 在 routes/hardware.js 中，替换 performASR 函数：

// 临时简化版本 - 在 routes/hardware.js 中替换这个函数进行测试

async function performASR(audioFile) {
  console.log('=== Simplified ASR Test Mode ===');
  console.log('Audio file size:', audioFile.size);
  
  // 暂时跳过真实的ASR，返回测试文本
  const testMessages = [
    '你好，我想了解文物保护',
    '请介绍一下青铜器的保护方法',
    '文物修复需要哪些技术',
    '博物馆如何保存古代书画',
    '考古发掘中如何保护文物'
  ];
  
  // 随机选择一个测试消息
  const randomMessage = testMessages[Math.floor(Math.random() * testMessages.length)];
  
  console.log('Simulated ASR result:', randomMessage);
  
  return {
    success: true,
    text: randomMessage
  };
}

// 完整对话接口 - 简化版本用于测试
router.post('/devices/:deviceId/conversation', upload.single('audio'), async (req, res) => {
  const deviceId = req.params.deviceId;
  const audioFile = req.file;
  const { sessionId, voice, format } = req.body;

  console.log(`=== Simplified Conversation Test ===`);
  console.log(`Device: ${deviceId}`);
  console.log(`Audio received: ${audioFile ? 'Yes' : 'No'}`);
  console.log(`Audio size: ${audioFile ? audioFile.size : 0} bytes`);

  if (!audioFile) {
    return res.status(400).json({
      success: false,
      error: 'No audio file provided'
    });
  }

  try {
    // 更新设备状态：处理中
    updateDeviceStatus(deviceId, { 
      currentTask: 'processing_conversation',
      isListening: false 
    });

    // 步骤1: 模拟ASR
    console.log('Step 1: Simulated ASR processing...');
    const asrResult = await performASR(audioFile);
    const userText = asrResult.text;
    console.log('User text:', userText);

    // 步骤2: 处理对话
    console.log('Step 2: Processing chat response...');
    const chatResult = await processChatMessage(userText, sessionId);
    console.log('AI response:', chatResult.text);

    // 步骤3: 生成简单的音频响应（模拟）
    console.log('Step 3: Generating audio response...');
    
    // 创建一个简单的音频响应 - 实际项目中这里会调用TTS
    const audioResponse = Buffer.from('SIMULATED_AUDIO_DATA_' + chatResult.text.substring(0, 50));
    
    // 更新设备状态：播放中
    updateDeviceStatus(deviceId, { 
      currentTask: null,
      isSpeaking: true 
    });

    // 返回响应
    res.set({
      'Content-Type': 'audio/mp3',
      'X-Device-ID': deviceId,
      'X-User-Text': encodeURIComponent(userText),
      'X-AI-Response': encodeURIComponent(chatResult.text),
      'X-Source': chatResult.source,
      'X-Session-ID': sessionId,
      'X-Timestamp': new Date().toISOString()
    });

    res.send(audioResponse);

    console.log('=== Test Conversation Completed ===');
    
    // 3秒后重置状态
    setTimeout(() => {
      updateDeviceStatus(deviceId, { 
        isSpeaking: false,
        status: 'online'
      });
    }, 3000);

  } catch (error) {
    console.error('Conversation processing error:', error);
    
    updateDeviceStatus(deviceId, { 
      currentTask: null,
      isSpeaking: false 
    });

    res.status(500).json({
      success: false,
      error: 'Conversation processing failed',
      details: error.message
    });
  }
});

// 确保设备状态正确更新
function updateDeviceStatus(deviceId, updates) {
  const status = deviceStatus.get(deviceId) || {
    id: deviceId,
    status: 'online',
    lastSeen: new Date(),
    isListening: false,
    isSpeaking: false,
    currentTask: null,
    isConnected: true
  };
  
  Object.assign(status, updates, { 
    lastSeen: new Date(),
    isConnected: true,
    status: 'online'  // 确保状态为在线
  });
  
  deviceStatus.set(deviceId, status);
  
  console.log(`Device ${deviceId} status updated:`, {
    status: status.status,
    isConnected: status.isConnected,
    isListening: status.isListening,
    isSpeaking: status.isSpeaking,
    currentTask: status.currentTask
  });
  
  // 广播状态更新
  const connection = activeConnections.get(deviceId);
  if (connection) {
    try {
      connection.write(`data: ${JSON.stringify({ 
        type: 'status', 
        ...status 
      })}\n\n`);
    } catch (error) {
      console.error('Failed to send status update:', error);
      activeConnections.delete(deviceId);
    }
  }
  
  return status;
}

// 6. 简化版TTS函数（用于测试）
async function performTTS(text, voice = 'xiaomei', format = 'mp3') {
  console.log('=== Simplified TTS Test Mode ===');
  console.log('Text to synthesize:', text.substring(0, 100) + '...');
  
  // 生成模拟音频数据
  const simulatedAudio = Buffer.alloc(1024, 'AUDIO'); // 1KB的模拟音频
  
  console.log('Generated simulated audio, size:', simulatedAudio.length);
  
  return {
    success: true,
    audioBuffer: simulatedAudio
  };
}

// 1. 改进 updateDeviceStatus 函数，自动注册设备
function updateDeviceStatus(deviceId, updates) {
  // 如果设备不存在，自动创建
  const status = deviceStatus.get(deviceId) || {
    id: deviceId,
    status: 'online',
    lastSeen: new Date(),
    isListening: false,
    isSpeaking: false,
    currentTask: null,
    isConnected: true
  };
  
  // 更新状态
  Object.assign(status, updates, { 
    lastSeen: new Date(),
    isConnected: true,
    status: 'online'
  });
  
  deviceStatus.set(deviceId, status);
  
  console.log(`Device ${deviceId} registered/updated:`, {
    status: status.status,
    isConnected: status.isConnected,
    isListening: status.isListening,
    isSpeaking: status.isSpeaking,
    currentTask: status.currentTask
  });
  
  // 尝试广播状态更新（如果有SSE连接）
  broadcastDeviceStatus(deviceId, status);
  
  return status;
}

// 2. 新增广播函数
function broadcastDeviceStatus(deviceId, status) {
  const connection = activeConnections.get(deviceId);
  if (connection) {
    try {
      connection.write(`data: ${JSON.stringify({ 
        type: 'status', 
        ...status 
      })}\n\n`);
      console.log(`Status broadcasted to device ${deviceId}`);
    } catch (error) {
      console.error(`Failed to broadcast to device ${deviceId}:`, error);
      activeConnections.delete(deviceId);
    }
  } else {
    console.log(`No SSE connection for device ${deviceId}, status stored locally`);
  }
}

// 3. 修复完整对话接口，确保设备自动注册
router.post('/devices/:deviceId/conversation', upload.single('audio'), async (req, res) => {
  const deviceId = req.params.deviceId;
  const audioFile = req.file;
  const { sessionId, voice, format } = req.body;

  console.log(`=== Conversation Request ===`);
  console.log(`Device: ${deviceId}`);
  console.log(`Session: ${sessionId}`);
  console.log(`Audio size: ${audioFile ? audioFile.size : 0} bytes`);
  console.log(`Voice: ${voice || 'default'}`);
  console.log(`Format: ${format || 'default'}`);

  // *** 关键修复：立即注册设备 ***
  updateDeviceStatus(deviceId, { 
    currentTask: 'processing_conversation',
    isListening: false 
  });

  if (!audioFile) {
    updateDeviceStatus(deviceId, { currentTask: null });
    return res.status(400).json({
      success: false,
      error: 'No audio file provided'
    });
  }

  try {
    // 步骤1: ASR处理
    console.log(`Step 1: ASR processing for device ${deviceId}`);
    updateDeviceStatus(deviceId, { currentTask: 'asr_processing' });
    
    const asrResult = await performASR(audioFile);
    console.log('ASR Result:', asrResult);
    
    if (!asrResult.success) {
      throw new Error('ASR processing failed');
    }

    const userText = asrResult.text || '未识别到语音';

    // 步骤2: 对话处理
    console.log(`Step 2: Chat processing for device ${deviceId}`);
    updateDeviceStatus(deviceId, { currentTask: 'chat_processing' });
    
    const chatResult = await processChatMessage(userText, sessionId);
    console.log('Chat Result:', chatResult.text.substring(0, 100) + '...');

    // 步骤3: TTS处理
    console.log(`Step 3: TTS processing for device ${deviceId}`);
    updateDeviceStatus(deviceId, { currentTask: 'tts_processing' });
    
    const ttsResult = await performTTS(chatResult.text, voice, format);
    console.log('TTS completed, audio size:', ttsResult.audioBuffer.length);

    // 更新为播放状态
    updateDeviceStatus(deviceId, { 
      currentTask: null,
      isSpeaking: true 
    });

    // 返回结果
    res.set({
      'Content-Type': `audio/${format || 'mp3'}`,
      'X-Device-ID': deviceId,
      'X-User-Text': encodeURIComponent(userText),
      'X-AI-Response': encodeURIComponent(chatResult.text),
      'X-Source': chatResult.source,
      'X-Session-ID': sessionId,
      'X-Timestamp': new Date().toISOString()
    });

    res.send(ttsResult.audioBuffer);

    console.log(`=== Conversation Completed for ${deviceId} ===`);
    console.log(`User: ${userText}`);
    console.log(`AI: ${chatResult.text.substring(0, 100)}...`);
    
    // 3秒后重置播放状态
    setTimeout(() => {
      updateDeviceStatus(deviceId, { 
        isSpeaking: false,
        currentTask: null
      });
    }, 3000);

  } catch (error) {
    console.error(`=== Conversation Error for ${deviceId} ===`);
    console.error('Error:', error.message);
    
    updateDeviceStatus(deviceId, { 
      currentTask: null,
      isSpeaking: false 
    });

    res.status(500).json({
      success: false,
      error: 'Conversation processing failed',
      details: error.message
    });
  }
});

// 添加一个简单的测试聊天接口
router.post('/devices/:deviceId/chat', async (req, res) => {
  const deviceId = req.params.deviceId;
  const { message, sessionId } = req.body;

  console.log(`=== Chat Test for device ${deviceId} ===`);
  console.log(`Message: ${message}`);

  try {
    updateDeviceStatus(deviceId, { currentTask: 'processing_chat' });

    const chatResult = await processChatMessage(message, sessionId);

    updateDeviceStatus(deviceId, { currentTask: null });

    res.json({
      success: true,
      response: chatResult.text,
      source: chatResult.source,
      deviceId: deviceId,
      sessionId: sessionId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`Chat error for device ${deviceId}:`, error);
    
    updateDeviceStatus(deviceId, { currentTask: null });

    res.status(500).json({
      success: false,
      error: 'Chat processing failed',
      details: error.message
    });
  }
});

// 辅助函数 - TTS处理
async function performTTS(text, voice = 'xiaomei', format = 'mp3') {
  const tokenResponse = await axios.get('http://localhost:3000/api/get-speech-token');
  if (!tokenResponse.data.success) {
    throw new Error('Failed to get TTS token');
  }

  const token = tokenResponse.data.token;
  const appKey = 'yXfaTeWXf28V9pEh';

  const params = new URLSearchParams({
    appkey: appKey,
    token: token,
    text: text,
    voice: voice,
    format: format,
    sample_rate: 16000,
    speech_rate: -86,
    pitch_rate: -68,
    volume: 50
  });

  const ttsResponse = await axios.get(
    `https://nls-gateway.cn-shanghai.aliyuncs.com/stream/v1/tts?${params.toString()}`,
    {
      responseType: 'arraybuffer',
      timeout: 30000
    }
  );

  return {
    success: true,
    audioBuffer: Buffer.from(ttsResponse.data)
  };
}

// 辅助函数 - 聊天处理 (复用现有逻辑)
async function processChatMessage(message, sessionId) {
  try {
    // 简单的示例实现 - 后续可以集成完整的RAG逻辑
    console.log(`Processing message: ${message} for session: ${sessionId}`);
    
    // 基本的响应逻辑
    let response = '';
    if (message.includes('你好') || message.includes('您好')) {
      response = '您好！我是文物领域智能语音助手，请问有什么可以帮您的？';
    } else if (message.includes('文物')) {
      response = '文物保护是我们的重要使命。文物承载着历史文化信息，具有重要的历史、艺术和科学价值。请问您想了解哪方面的文物保护知识？';
    } else if (message.includes('谢谢') || message.includes('感谢')) {
      response = '不客气！如果您还有其他问题，随时可以询问我。';
    } else {
      response = `我理解您提到了"${message}"。作为文物领域助手，我可以为您介绍相关的文物保护知识、历史背景或修复技术。请问您想了解哪方面的内容？`;
    }
    
    return {
      success: true,
      text: response,
      source: 'model'
    };
  } catch (error) {
    console.error('Chat processing error:', error);
    return {
      success: false,
      text: '抱歉，处理您的问题时遇到了错误。请稍后重试。',
      source: 'error'
    };
  }
}

module.exports = router;