// routes/hardware.js - 修复音频格式为PCM的版本
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const ffmpeg = require('fluent-ffmpeg');
const tmp = require('tmp');
const router = express.Router();

// 配置multer用于接收音频文件
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB限制
  },
  fileFilter: (req, file, cb) => {
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

// *** 修复SSE连接处理 - 添加更好的错误处理 ***
router.get('/devices/:deviceId/stream', (req, res) => {
  const deviceId = req.params.deviceId;
  
  console.log(`SSE connection request from device: ${deviceId}`);
  
  // 设置SSE头，添加更多兼容性头部
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control, Content-Type',
    'X-Accel-Buffering': 'no',  // 禁用Nginx缓冲
    'Transfer-Encoding': 'identity'  // 避免chunked encoding问题
  });

  // 立即刷新响应
  res.flushHeaders();

  // 发送连接确认
  const sendSSEData = (data) => {
    try {
      const message = `data: ${JSON.stringify(data)}\n\n`;
      res.write(message);
      if (res.flush) res.flush(); // 立即发送
      return true;
    } catch (error) {
      console.error(`Failed to send SSE data to ${deviceId}:`, error);
      return false;
    }
  };

  // 发送初始连接消息
  if (!sendSSEData({
    type: 'connected',
    deviceId: deviceId,
    timestamp: new Date().toISOString()
  })) {
    return;
  }

  // 存储连接
  activeConnections.set(deviceId, { res, sendData: sendSSEData });
  
  // 确保设备已注册
  updateDeviceStatus(deviceId, { isConnected: true });

  // 发送当前状态
  const status = deviceStatus.get(deviceId);
  if (status) {
    sendSSEData({
      type: 'status',
      ...status
    });
  }

  // 心跳机制 - 减少频率，避免过多消息
  const heartbeat = setInterval(() => {
    const connection = activeConnections.get(deviceId);
    if (connection) {
      if (!connection.sendData({
        type: 'heartbeat',
        timestamp: new Date().toISOString()
      })) {
        clearInterval(heartbeat);
        activeConnections.delete(deviceId);
      }
    } else {
      clearInterval(heartbeat);
    }
  }, 30000); // 30秒心跳

  // 连接关闭处理
  req.on('close', () => {
    console.log(`SSE connection closed for device ${deviceId}`);
    activeConnections.delete(deviceId);
    clearInterval(heartbeat);
    
    setTimeout(() => {
      if (!activeConnections.has(deviceId)) {
        updateDeviceStatus(deviceId, { isConnected: false, status: 'offline' });
      }
    }, 60000);
  });

  req.on('error', (error) => {
    console.error(`SSE connection error for device ${deviceId}:`, error);
    activeConnections.delete(deviceId);
    clearInterval(heartbeat);
  });
});

// 获取设备列表
router.get('/devices', (req, res) => {
  const devices = Array.from(deviceStatus.values()).map(device => ({
    ...device,
    isConnected: activeConnections.has(device.id) || 
                 (device.lastSeen && (Date.now() - new Date(device.lastSeen).getTime()) < 60000)
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

// *** 关键修复：使用PCM格式的完整对话接口 ***
router.post('/devices/:deviceId/conversation', upload.single('audio'), async (req, res) => {
  const deviceId = req.params.deviceId;
  const audioFile = req.file;
  const { sessionId, voice, format } = req.body;

  console.log(`=== M5EchoBase Conversation Request ===`);
  console.log(`Device: ${deviceId}`);
  console.log(`Session: ${sessionId}`);
  console.log(`Audio size: ${audioFile ? audioFile.size : 0} bytes`);
  console.log(`Voice: ${voice || 'xiaomei'}`);
  console.log(`Target Format: PCM (M5EchoBase compatible)`); // 强制使用PCM

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

    // *** 步骤3: 生成PCM格式TTS音频 ***
    console.log(`Step 3: PCM TTS processing for device ${deviceId}`);
    updateDeviceStatus(deviceId, { currentTask: 'tts_processing' });
    
    const ttsResult = await performPCMTTS(chatResult.text, voice || 'xiaomei');
    console.log('PCM TTS completed, audio size:', ttsResult.audioBuffer.length);

    // 更新为播放状态
    updateDeviceStatus(deviceId, { 
      currentTask: null,
      isSpeaking: true 
    });

    // *** 返回PCM格式音频 ***
    res.set({
      'Content-Type': 'audio/pcm',  // 明确指定PCM格式
      'X-Device-ID': deviceId,
      'X-User-Text': encodeURIComponent(userText),
      'X-AI-Response': encodeURIComponent(chatResult.text),
      'X-Source': chatResult.source,
      'X-Session-ID': sessionId,
      'X-Timestamp': new Date().toISOString(),
      'X-Audio-Size': ttsResult.audioBuffer.length.toString(),
      'X-Audio-Format': 'PCM',
      'X-Sample-Rate': '16000',
      'X-Channels': '1',
      'X-Bit-Depth': '16'
    });

    res.send(ttsResult.audioBuffer);

    console.log(`=== M5EchoBase Conversation Completed ===`);
    console.log(`User: ${userText}`);
    console.log(`AI: ${chatResult.text.substring(0, 100)}...`);
    console.log(`PCM Audio: ${ttsResult.audioBuffer.length} bytes`);
    
    // 5秒后重置播放状态
    setTimeout(() => {
      updateDeviceStatus(deviceId, { 
        isSpeaking: false,
        currentTask: null
      });
    }, 8000); // 延长到8秒，给PCM音频播放足够时间

  } catch (error) {
    console.error(`=== Conversation Error for ${deviceId} ===`);
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    
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


// *** 关键修复：专用PCM TTS函数 (带MP3解码功能) ***
async function performPCMTTS(text, voice = 'xiaomei') {
  console.log('=== PCM TTS Processing (with MP3 -> PCM decoding) ===');
  console.log('Text to synthesize:', text.substring(0, 200) + '...');
  console.log('Voice:', voice);
  
  try {
    // 步骤1: 获取TTS Token (代码保持不变)
    console.log('Getting TTS token...');
    const tokenResponse = await axios.get('http://localhost:3000/api/get-speech-token');
    if (!tokenResponse.data.success) {
      throw new Error('Failed to get TTS token: ' + tokenResponse.data.error);
    }
    const token = tokenResponse.data.token;
    const appKey = 'your_appKey';
    console.log('TTS Token obtained successfully');

    // 步骤2: 请求MP3音频 (即使我们想要PCM，API也可能返回MP3)
    const params = new URLSearchParams({
      appkey: appKey,
      token: token,
      text: text,
      voice: voice,
      format: 'mp3', // 直接请求MP3，因为我们知道会得到它
      sample_rate: 16000,
      speech_rate: -86,
      pitch_rate: -68,
      volume: 80
    });
    const ttsUrl = `https://nls-gateway.cn-shanghai.aliyuncs.com/stream/v1/tts?${params.toString()}`;
    console.log('Calling TTS API for MP3 format...');
    const ttsResponse = await axios.get(ttsUrl, { responseType: 'arraybuffer' });

    if (ttsResponse.status !== 200 || ttsResponse.data.byteLength === 0) {
        throw new Error(`TTS API failed, status: ${ttsResponse.status}, size: ${ttsResponse.data.byteLength}`);
    }
    console.log(`Received MP3 audio data: ${ttsResponse.data.byteLength} bytes`);

    // *** 步骤3: 使用ffmpeg将MP3解码为PCM ***
    console.log('Decoding MP3 to PCM...');
    const pcmBuffer = await new Promise((resolve, reject) => {
        // 创建临时文件来保存MP3和PCM
        const mp3TmpFile = tmp.fileSync({ postfix: '.mp3' });
        fs.writeFileSync(mp3TmpFile.name, Buffer.from(ttsResponse.data));

        const pcmChunks = [];
        ffmpeg(mp3TmpFile.name)
            .outputOptions([
                '-f s16le',       // 格式: signed 16-bit little-endian
                '-acodec pcm_s16le', // 编解码器
                '-ar 16000',      // 采样率: 16kHz
                '-ac 1'           // 声道: 单声道
            ])
            .on('end', () => {
                console.log('FFmpeg decoding finished.');
                mp3TmpFile.removeCallback(); // 清理临时文件
                resolve(Buffer.concat(pcmChunks));
            })
            .on('error', (err) => {
                console.error('FFmpeg error:', err);
                mp3TmpFile.removeCallback();
                reject(new Error('FFmpeg decoding failed: ' + err.message));
            })
            .pipe(new require('stream').Writable({
                write(chunk, encoding, callback) {
                    pcmChunks.push(chunk);
                    callback();
                }
            }));
    });
    
    console.log(`Generated PCM audio buffer size: ${pcmBuffer.length}`);
    
    return {
        success: true,
        audioBuffer: pcmBuffer,
        format: 'pcm',
        sampleRate: 16000,
        channels: 1,
        bitDepth: 16,
        size: pcmBuffer.length,
    };

  } catch (error) {
    console.error('PCM TTS Error:', error.message);
    // ... Fallback逻辑保持不变 ...
    console.log('Falling back to simulated PCM audio due to TTS error');
    return performFallbackPCMTTS(text);
  }
}

// *** 新增：PCM格式降级函数 ***
function performFallbackPCMTTS(text) {
  console.log('=== Fallback PCM TTS (Simulated) ===');
  console.log('Generating fallback PCM audio for text length:', text.length);
  
  // 生成PCM格式的模拟音频数据
  const estimatedDuration = Math.min(text.length * 0.15, 10); // 最多10秒
  const sampleRate = 16000;
  const sampleCount = Math.floor(estimatedDuration * sampleRate);
  const audioSize = sampleCount * 2; // 16-bit samples
  
  console.log('Estimated PCM audio duration:', estimatedDuration, 'seconds');
  console.log('Generated PCM audio size:', audioSize, 'bytes');
  console.log('Sample count:', sampleCount);
  
  // 生成16kHz 16bit单声道PCM数据
  const audioBuffer = Buffer.alloc(audioSize);
  
  for (let i = 0; i < sampleCount; i++) {
    // 生成更复杂的音频波形 - 混合多个频率
    const time = i / sampleRate;
    let sample = 0;
    
    // 基本频率440Hz
    sample += Math.sin(2 * Math.PI * 440 * time) * 0.2;
    // 和声880Hz
    sample += Math.sin(2 * Math.PI * 880 * time) * 0.1;
    // 低频调制
    sample *= (1 + Math.sin(2 * Math.PI * 5 * time) * 0.3);
    
    // 音量包络 - 淡入淡出
    const fadeTime = Math.min(time, estimatedDuration - time, 0.5);
    const envelope = Math.min(fadeTime * 2, 1);
    sample *= envelope;
    
    // 转换为16位整数
    const intSample = Math.floor(sample * 16383); // 留点余量避免削波
    audioBuffer.writeInt16LE(intSample, i * 2);
  }
  
  console.log('Generated fallback PCM audio successfully');
  
  return {
    success: true,
    audioBuffer: audioBuffer,
    format: 'pcm',
    sampleRate: 16000,
    channels: 1,
    bitDepth: 16,
    size: audioBuffer.length,
    duration: estimatedDuration,
    fallback: true
  };
}

// 模拟ASR函数（保持不变）
async function performASR(audioFile) {
  console.log('=== Simplified ASR Test Mode ===');
  console.log('Audio file size:', audioFile.size);
  
  const testMessages = [
    '你好，我想了解文物保护',
    '请介绍一下青铜器的保护方法',
    '文物修复需要哪些技术',
    '博物馆如何保存古代书画',
    '考古发掘中如何保护文物',
    '石器文物怎么保护',
    '陶瓷文物的修复技术',
    '古建筑保护有什么要求'
  ];
  
  const randomMessage = testMessages[Math.floor(Math.random() * testMessages.length)];
  console.log('Simulated ASR result:', randomMessage);
  
  return {
    success: true,
    text: randomMessage
  };
}

// 聊天处理函数（保持不变）
async function processChatMessage(message, sessionId) {
  try {
    console.log(`Processing message: ${message} for session: ${sessionId}`);
    
    let response = '';
    if (message.includes('你好') || message.includes('您好')) {
      response = '您好！我是文物领域智能语音助手，很高兴为您服务。请问有什么文物保护方面的问题我可以帮您解答吗？';
    } else if (message.includes('文物保护') || message.includes('保护文物')) {
      response = '文物保护是一项系统性工程，包括预防性保护、抢救性保护和修复性保护。我们需要控制环境条件，防止文物受到温湿度、光照、污染等因素的损害。您想了解哪种具体的保护方法呢？';
    } else if (message.includes('青铜器')) {
      response = '青铜器保护主要关注防腐蚀。需要控制环境湿度在45%到55%之间，避免氯离子腐蚀，定期检查是否有青铜病。对于已有锈蚀的青铜器，需要通过机械清理、化学稳定化处理等方法进行修复。';
    } else if (message.includes('修复') || message.includes('技术')) {
      response = '文物修复技术包括物理修复如拼接加固，化学修复如脱盐去污，生物修复处理霉菌虫害等。现代还运用激光清洗、三维打印等高科技手段。修复原则是最小干预、可逆性和真实性。';
    } else if (message.includes('书画') || message.includes('古代书画')) {
      response = '古代书画保护要严格控制温湿度，温度18到22摄氏度，相对湿度50%到60%，避免光照直射，使用无酸材料装裱。储存时应平放或卷放，定期检查霉变、虫蛀情况。';
    } else if (message.includes('考古') || message.includes('发掘')) {
      response = '考古发掘中的文物保护包括现场保护，搭建遮阳棚控制湿度，应急加固使用B72等材料，科学提取整体打包或分块提取，临时保存在适宜环境中。每件文物都需要详细记录和摄影。';
    } else if (message.includes('石器')) {
      response = '石器文物保护主要防止风化和机械损伤。要控制温湿度变化，避免盐类结晶破坏，定期清理表面污染物。对于脆弱的石器，需要进行预防性加固处理。';
    } else if (message.includes('陶瓷')) {
      response = '陶瓷文物修复技术包括清洗去污、拼接粘合、缺失部分的补配等。使用可逆性的粘合剂，补配部分要与原件有明显区别。修复后要做好保护性处理。';
    } else if (message.includes('古建筑')) {
      response = '古建筑保护要求不改变文物原状，最大限度保存历史信息。包括结构加固、屋顶防水、白蚁防治、定期监测等。修缮时要使用传统材料和工艺。';
    } else if (message.includes('谢谢') || message.includes('感谢')) {
      response = '不客气！文物保护是我们共同的责任。如果您还有其他关于文物保护的问题，随时可以询问我。让我们一起守护珍贵的文化遗产！';
    } else {
      response = `关于"${message}"这个话题，作为文物保护专业助手，我建议从预防性保护角度考虑。不同材质的文物有不同的保护要求，您希望了解哪个具体方面的保护方法呢？`;
    }
    
    return {
      success: true,
      text: response,
      source: 'cultural_heritage_model'
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

// 控制接口
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

// 聊天测试接口
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

// 辅助函数
function sendToDevice(deviceId, data) {
  const connection = activeConnections.get(deviceId);
  if (connection && connection.sendData) {
    return connection.sendData(data);
  }
  return false;
}

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
    status: 'online'
  });
  
  deviceStatus.set(deviceId, status);
  
  console.log(`Device ${deviceId} status updated:`, {
    status: status.status,
    isConnected: status.isConnected,
    isListening: status.isListening,
    isSpeaking: status.isSpeaking,
    currentTask: status.currentTask
  });
  
  const connection = activeConnections.get(deviceId);
  if (connection && connection.sendData) {
    connection.sendData({ 
      type: 'status', 
      ...status 
    });
  }
  
  return status;
}

module.exports = router;
