const express = require('express');
const cors = require('cors');
const dataRouter = require('./api/data');

const app = express();

app.use(cors());
app.use(express.json());

// 注册路由
app.use('/api/data', dataRouter);

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({
    message: '服务器内部错误',
    error: process.env.NODE_ENV === 'development' ? err.message : '请稍后重试'
  });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
}); 