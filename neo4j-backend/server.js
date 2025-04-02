const express = require('express');
const cors = require('cors');
const app = express();
const port = 3000;

// 中间件配置
app.use(cors());  // 允许所有来源的跨域请求
app.use(express.json()); // 解析JSON请求体 - 这行是关键
app.use(express.urlencoded({ extended: true })); // 解析URL编码的请求体

// 导入 API 路由
const dataRouter = require('./api/data');

// 使用 API 路由
app.use('/api/data', dataRouter);

// 处理根 URL
app.get('/', (req, res) => {
    res.send('Welcome to the Neo4j API Server');
});

// 启动服务器
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});



// // 创建 Neo4j 驱动
// const driver = neo4j.driver('bolt://localhost:7687', neo4j.auth.basic('neo4j', 'neo4j'));
// const session = driver.session();

// // 定义 API 端点
// app.get('/api/data', async (req, res) => {
//     try {
//         const result = await session.run('MATCH (n)-[r]->(m) RETURN n, r, m LIMIT 25');
//         const records = result.records.map(record => ({
//             node1: record.get('n').properties,
//             relationship: record.get('r').type,
//             node2: record.get('m').properties
//         }));
//         res.json(records);
//     } catch (error) {
//         console.error('Error querying Neo4j', error);
//         res.status(500).send(error);
//     }
// });



