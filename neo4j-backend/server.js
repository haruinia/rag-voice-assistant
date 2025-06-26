// server.js (最终修正版 - 添加 AppKey 到请求中)

const express = require('express');
const cors = require('cors');
const RPCClient = require('@alicloud/pop-core').RPCClient;
require('dotenv').config();

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Your API router
const dataRouter = require('./api/data');
app.use('/api/data', dataRouter);

// --- START: The Final Token Generation Endpoint ---
function createNlsClient() {
  return new RPCClient({
    accessKeyId: process.env.ALI_ACCESS_KEY_ID,
    accessKeySecret: process.env.ALI_ACCESS_KEY_SECRET,
    endpoint: 'http://nls-meta.cn-shanghai.aliyuncs.com',
    apiVersion: '2019-02-28'
  });
}

app.get('/api/get-speech-token', async (req, res) => {
  // 检查所有需要的环境变量
  if (!process.env.ALI_ACCESS_KEY_ID || !process.env.ALI_ACCESS_KEY_SECRET || !process.env.ALI_APP_KEY) {
    const errorMessage = 'Alibaba Cloud AccessKeyID, AccessKeySecret, or AppKey not configured in .env file.';
    console.error(errorMessage);
    return res.status(500).json({ error: errorMessage, success: false });
  }

  try {
    const client = createNlsClient();
    
    // **关键修正：在 client.request 方法中加入参数，明确指定 AppKey**
    const response = await client.request(
        'CreateToken', // API Action
        { AppKey: process.env.ALI_APP_KEY }, // API Parameters
        { method: 'POST' } // Request Method
    );
    
    // 为了调试，我们打印出完整的阿里云响应
    console.log('Alibaba Cloud Raw Response:', JSON.stringify(response, null, 2));

    if (response.Token && response.Token.Id) {
      console.log('Successfully generated token:', response.Token.Id);
      res.json({
        token: response.Token.Id,
        expireTime: response.Token.ExpireTime,
        success: true
      });
    } else {
      // 如果响应中还是没有Token，这个错误信息会更有用
      throw new Error('API response structure is unexpected. See console log for details.');
    }

  } catch (error) {
    console.error('CRITICAL ERROR during token creation:', error);
    res.status(500).json({
      error: 'Failed to generate speech token',
      details: {
        message: error.message,
        code: error.code
      },
      success: false
    });
  }
});
// --- END: The Final Endpoint ---


// Root URL
app.get('/', (req, res) => {
  res.send('Welcome to the Neo4j API Server');
});

// Start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log('Alibaba Cloud Speech Token endpoint available at http://localhost:3000/api/get-speech-token');
});