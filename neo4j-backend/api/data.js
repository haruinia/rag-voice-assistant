const express = require('express');
const neo4j = require('neo4j-driver');
const router = express.Router();

// --- Neo4j 连接 ---
// 保持你原来的连接方式
const driver = neo4j.driver('bolt://localhost:7687', neo4j.auth.basic('neo4j', 'neo4j'));
// !! 警告：在模块级别创建并在所有请求中重用单个 session 不是推荐的最佳实践，
// !! 在高并发场景下可能导致问题。更健壮的方式是为每个请求获取 session。
// !! 但按你的要求，我们暂时保留此方式。
const session = driver.session();

// --- 优雅关闭 Driver (建议添加) ---
// 当 Node.js 进程退出时，尝试关闭驱动连接
process.on('exit', async () => {
    console.log('应用程序退出，正在关闭 Neo4j session 和 driver...');
    try {
        await session.close(); // 关闭 session
        await driver.close(); // 关闭 driver
        console.log('Neo4j session 和 driver 已关闭。');
    } catch (error) {
        console.error('关闭 Neo4j 连接时出错:', error);
    }
});
// 处理 Ctrl+C 中断信号
process.on('SIGINT', async () => {
    console.log('收到 SIGINT 信号，准备退出...');
    // 触发 exit 事件监听器
    process.exit(0);
});


// ===========================================
//          现有 API 端点 (保持不变)
// ===========================================

/**
 * @route GET /
 * @description 查询图数据库中节点和关系的样本数据 (最多 25 条)
 */
router.get('/', async (req, res) => {
    try {
        console.log("GET /: 正在查询样本数据...");
        const result = await session.run(`
            MATCH (n)
            OPTIONAL MATCH (n)-[r]->(m)
            RETURN n, r, m
            LIMIT 25
        `);

        // 处理结果
        const records = result.records.map(record => {
             // 添加检查确保节点存在
             const nodeN = record.get('n');
             const relR = record.get('r');
             const nodeM = record.get('m');
             return {
                node1: nodeN ? nodeN.properties : null,
                relationship: relR ? relR.type : null,
                node2: nodeM ? nodeM.properties : null
            };
        });
        console.log("GET /: 查询成功，返回样本数据。");
        res.json(records);
    } catch (error) {
        console.error('GET /: 查询 Neo4j 时出错', error);
        res.status(500).json({ message: '查询样本数据失败', error: error.message });
    }
});

/**
 * @route GET /:nodeName
 * @description 根据节点名称查找节点及其出向关系
 */
router.get('/:nodeName', async (req, res) => {
    const nodeName = req.params.nodeName;
    console.log(`GET /${nodeName}: 正在查找节点及其出向关系...`);
    try {
        const result = await session.run(
            `
             MATCH (n {name: $nodeName})
             OPTIONAL MATCH (n)-[r]->(m) // 查找出向关系 (n -> m)
             RETURN n, r, m
            `,
            { nodeName }
        );

        if (result.records.length === 0) {
             console.log(`GET /${nodeName}: 未找到名称为 '${nodeName}' 的节点。`);
             return res.status(404).json({ message: `未找到名称为 '${nodeName}' 的节点` });
        }

        const records = result.records.map(record => {
            const nodeN = record.get('n'); // 起始节点 (找到的节点)
            const relR = record.get('r'); // 关系
            const nodeM = record.get('m'); // 目标节点
            return {
                node1: nodeN ? nodeN.properties : null, // 应该是我们查找的节点
                relationship: relR ? relR.type : null,
                node2: nodeM ? nodeM.properties : null // 关联的节点
            };
        });
        console.log(`GET /${nodeName}: 查询成功。`);
        res.json(records);

    } catch (error) {
        console.error(`GET /${nodeName}: 查询 Neo4j 时出错`, error);
        res.status(500).json({ message: '查找节点及其出向关系失败', error: error.message });
    }
});

/**
 * @route GET /parents/:nodeName
 * @description 根据节点名称查找其父节点 (入向关系)
 */
router.get('/parents/:nodeName', async (req, res) => {
    const nodeName = req.params.nodeName;
    console.log(`GET /parents/${nodeName}: 正在查找父节点...`);
    try {
        const result = await session.run(`
            MATCH (parentNode)-[r]->(childNode {name: $nodeName}) // 查找入向关系 (parentNode -> childNode)
            RETURN parentNode, r, childNode
        `, { nodeName });

         if (result.records.length === 0) {
             console.log(`GET /parents/${nodeName}: 未找到名称为 '${nodeName}' 的节点的父节点 (或节点不存在)。`);
             // 注意：这也可能是因为节点存在但没有父节点
             return res.status(404).json({ message: `未找到名称为 '${nodeName}' 的节点的父节点` });
        }

        const records = result.records.map(record => {
            const parentNode = record.get('parentNode'); // 父节点
            const relR = record.get('r'); // 关系
            const childNode = record.get('childNode'); // 我们查找的节点
            return {
                node1: parentNode ? parentNode.properties : null, // 父节点属性
                relationship: relR ? relR.type : null, // 关系类型
                node2: childNode ? childNode.properties : null // 子节点属性 (我们查找的节点)
            };
        });
         console.log(`GET /parents/${nodeName}: 查询成功。`);
        res.json(records);
    } catch (error) {
        console.error(`GET /parents/${nodeName}: 查询 Neo4j 时出错`, error);
        res.status(500).json({ message: '查找父节点失败', error: error.message });
    }
});


// ===========================================
//          新增 CRUD 功能 API 端点
// ===========================================

// --- 节点操作 ---

/**
 * @route POST /nodes
 * @description 创建一个新节点
 * @body { label: string, properties: object } - 例如: { "label": "Person", "properties": { "name": "张三", "born": 1995 } }
 * @returns {object} 创建的节点的属性
 */
router.post('/nodes', async (req, res) => {
    const { label, properties } = req.body;
    console.log(`POST /nodes: 准备创建节点，标签: ${label}, 属性:`, properties);

    if (!label || typeof label !== 'string' || label.trim() === '') {
        console.error('POST /nodes: 缺少或无效的标签 (label)。');
        return res.status(400).json({ message: '请求体必须包含有效的 "label" 字符串' });
    }
    if (!properties || typeof properties !== 'object') {
        console.error('POST /nodes: 缺少或无效的属性 (properties)。');
        return res.status(400).json({ message: '请求体必须包含 "properties" 对象' });
    }
     // 基本的标签名验证，防止简单的注入风险（不允许空格、特殊字符等）
     if (!/^[a-zA-Z0-9_]+$/.test(label)) {
        console.error(`POST /nodes: 无效的标签格式: ${label}`);
        return res.status(400).json({ message: '标签 (label) 格式无效，只能包含字母、数字和下划线' });
    }

    try {
        // 使用参数化查询传递属性，但标签需要动态构建（已做基本验证）
        const query = `CREATE (n:${label} $props) RETURN n`;
        const result = await session.run(query, { props: properties });

        if (result.records.length === 0) {
             console.error('POST /nodes: 创建节点失败，未返回记录。');
            throw new Error('节点创建后未返回记录');
        }

        const createdNode = result.records[0].get('n');
        console.log(`POST /nodes: 节点创建成功, ID: ${createdNode.identity}, 标签: ${createdNode.labels}, 属性:`, createdNode.properties);
        res.status(201).json(createdNode.properties); // 201 Created
    } catch (error) {
        console.error('POST /nodes: 创建节点时出错:', error);
        res.status(500).json({ message: '创建节点失败', error: error.message });
    }
});

/**
 * @route PATCH /nodes/:nodeName
 * @description 更新指定名称节点的属性 (合并属性)
 * @param {string} nodeName - URL 参数，要更新的节点的 name 属性值
 * @body {object} propertiesToUpdate - 要更新或添加的属性，例如: { "born": 1996, "city": "北京" }
 * @returns {object} 更新后的节点的完整属性
 */
router.patch('/nodes/:nodeName', async (req, res) => {
    const nodeName = req.params.nodeName;
    const propertiesToUpdate = req.body;
    console.log(`PATCH /nodes/${nodeName}: 准备更新节点属性:`, propertiesToUpdate);

    if (!propertiesToUpdate || typeof propertiesToUpdate !== 'object' || Object.keys(propertiesToUpdate).length === 0) {
        console.error(`PATCH /nodes/${nodeName}: 请求体为空或无效。`);
        return res.status(400).json({ message: '请求体必须包含要更新的属性对象' });
    }
    // 可选：防止通过此接口修改 name 属性本身，如果 name 是唯一标识符的话
    if ('name' in propertiesToUpdate && propertiesToUpdate.name !== nodeName) {
        console.warn(`PATCH /nodes/${nodeName}: 尝试修改 name 属性被阻止。`);
        return res.status(400).json({ message: '不允许通过此接口修改 name 属性' });
    }


    try {
        const result = await session.run(
            `MATCH (n {name: $nodeName})
             SET n += $props // 使用 += 合并属性，会覆盖同名属性，添加新属性
             RETURN n`,
            { nodeName: nodeName, props: propertiesToUpdate }
        );

        if (result.records.length === 0) {
            console.log(`PATCH /nodes/${nodeName}: 未找到名称为 '${nodeName}' 的节点进行更新。`);
            return res.status(404).json({ message: `未找到名称为 '${nodeName}' 的节点` });
        }

        const updatedNode = result.records[0].get('n');
         console.log(`PATCH /nodes/${nodeName}: 节点更新成功, ID: ${updatedNode.identity}, 新属性:`, updatedNode.properties);
        res.json(updatedNode.properties);
    } catch (error) {
        console.error(`PATCH /nodes/${nodeName}: 更新节点时出错:`, error);
        res.status(500).json({ message: '更新节点失败', error: error.message });
    }
});

/**
 * @route DELETE /nodes/:nodeName
 * @description 删除指定名称的节点及其所有关联关系
 * @param {string} nodeName - URL 参数，要删除的节点的 name 属性值
 * @returns {object} 删除确认信息
 */
router.delete('/nodes/:nodeName', async (req, res) => {
    const nodeName = req.params.nodeName;
    console.log(`DELETE /nodes/${nodeName}: 准备删除节点...`);

    try {
        // DETACH DELETE 会先删除关系再删除节点，防止出错
        const result = await session.run(
            `MATCH (n {name: $nodeName})
             DETACH DELETE n
             RETURN count(n) as deletedCount`, // count 在删除后是 0，主要看 summary
            { nodeName }
        );

        // 通过 result.summary 获取更准确的操作信息
        const nodesDeleted = result.summary.counters.updates().nodesDeleted;
        const relationshipsDeleted = result.summary.counters.updates().relationshipsDeleted;

        if (nodesDeleted === 0) {
            console.log(`DELETE /nodes/${nodeName}: 未找到名称为 '${nodeName}' 的节点进行删除。`);
            return res.status(404).json({ message: `未找到名称为 '${nodeName}' 的节点` });
        }

        console.log(`DELETE /nodes/${nodeName}: 节点删除成功。删除了 ${nodesDeleted} 个节点和 ${relationshipsDeleted} 条关系。`);
        res.json({
            message: `成功删除节点 '${nodeName}'`,
            nodesDeleted: nodesDeleted,
            relationshipsDeleted: relationshipsDeleted // 删除了多少关联关系
        });
    } catch (error) {
        console.error(`DELETE /nodes/${nodeName}: 删除节点时出错:`, error);
        res.status(500).json({ message: '删除节点失败', error: error.message });
    }
});


// --- 关系操作 ---

/**
 * @route POST /relationships
 * @description 在两个现有节点之间创建（或合并）一个关系
 * @body { startNodeName: string, endNodeName: string, relationshipType: string, properties?: object }
 *        例如: { "startNodeName": "张三", "endNodeName": "李四", "relationshipType": "认识", "properties": { "since": 2023 } }
 * @returns {object} 创建或合并的关系的详细信息
 */
router.post('/relationships', async (req, res) => {
    const { startNodeName, endNodeName, relationshipType, properties = {} } = req.body;
    console.log(`POST /relationships: 准备创建关系: (${startNodeName})-[${relationshipType}]->(${endNodeName}), 属性:`, properties);

    if (!startNodeName || !endNodeName || !relationshipType) {
         console.error('POST /relationships: 缺少必要的参数。');
        return res.status(400).json({ message: '请求体必须包含 startNodeName, endNodeName 和 relationshipType' });
    }
     // 基本的关系类型验证，防止注入（例如，只允许大写字母和下划线）
    if (!/^[A-Z_]+$/.test(relationshipType)) {
        console.error(`POST /relationships: 无效的关系类型格式: ${relationshipType}`);
        return res.status(400).json({ message: '关系类型 (relationshipType) 格式无效，建议使用大写字母和下划线' });
    }

    try {
        // 使用 MERGE 可以避免创建重复的关系。如果关系已存在，则更新其属性。
        // 关系类型需要动态构建（已做基本验证）
        const query = `
            MATCH (a {name: $startName})
            MATCH (b {name: $endName})
            MERGE (a)-[r:${relationshipType}]->(b)
            ON CREATE SET r = $props // 首次创建时设置属性
            ON MATCH SET r += $props // 如果已存在，则合并（更新）属性
            RETURN r, id(r) as relationshipId, type(r) as type
        `;
        const result = await session.run(query, {
            startName: startNodeName,
            endName: endNodeName,
            props: properties
        });

        if (result.records.length === 0) {
            // 这通常意味着起始节点或结束节点至少有一个不存在
             console.error(`POST /relationships: 创建关系失败，可能是因为节点 '${startNodeName}' 或 '${endNodeName}' 不存在。`);
            return res.status(404).json({ message: `创建关系失败：未找到起始节点 '${startNodeName}' 或结束节点 '${endNodeName}'` });
        }

        const createdRel = result.records[0].get('r');
        const relId = result.records[0].get('relationshipId');
        const relType = result.records[0].get('type');
        console.log(`POST /relationships: 关系创建/合并成功, ID: ${relId}, 类型: ${relType}, 属性:`, createdRel.properties);

        res.status(201).json({ // 即使是 MERGE 匹配，返回 201 也可以接受，表示资源已确保存在
            id: relId,
            type: relType,
            properties: createdRel.properties
        });
    } catch (error) {
        console.error('POST /relationships: 创建关系时出错:', error);
        res.status(500).json({ message: '创建关系失败', error: error.message });
    }
});

/**
 * @route DELETE /relationships
 * @description 删除两个节点之间指定类型的关系
 * @body { startNodeName: string, endNodeName: string, relationshipType: string }
 *        例如: { "startNodeName": "张三", "endNodeName": "李四", "relationshipType": "认识" }
 * @returns {object} 删除确认信息
 */
router.delete('/relationships', async (req, res) => {
    const { startNodeName, endNodeName, relationshipType } = req.body;
     console.log(`DELETE /relationships: 准备删除关系: (${startNodeName})-[${relationshipType}]->(${endNodeName})`);

    if (!startNodeName || !endNodeName || !relationshipType) {
         console.error('DELETE /relationships: 缺少必要的参数。');
        return res.status(400).json({ message: '请求体必须包含 startNodeName, endNodeName 和 relationshipType' });
    }
    if (!/^[A-Z_]+$/.test(relationshipType)) {
         console.error(`DELETE /relationships: 无效的关系类型格式: ${relationshipType}`);
        return res.status(400).json({ message: '关系类型 (relationshipType) 格式无效，建议使用大写字母和下划线' });
    }

    try {
        // 关系类型动态构建（已做基本验证）
        const query = `
            MATCH (a {name: $startName})-[r:${relationshipType}]->(b {name: $endName})
            DELETE r
            RETURN count(r) as deletedCount // count 在删除后是 0，主要看 summary
        `;
        const result = await session.run(query, {
            startName: startNodeName,
            endName: endNodeName
        });

        const relationshipsDeleted = result.summary.counters.updates().relationshipsDeleted;

        if (relationshipsDeleted === 0) {
            console.log(`DELETE /relationships: 未找到要删除的关系: (${startNodeName})-[${relationshipType}]->(${endNodeName})`);
            return res.status(404).json({ message: `未找到关系 '${relationshipType}' 从 '${startNodeName}' 到 '${endNodeName}'` });
        }

        console.log(`DELETE /relationships: 关系删除成功。删除了 ${relationshipsDeleted} 条关系。`);
        res.json({
            message: `成功删除关系 '${relationshipType}' 从 '${startNodeName}' 到 '${endNodeName}'`,
            relationshipsDeleted: relationshipsDeleted
        });
    } catch (error) {
        console.error('DELETE /relationships: 删除关系时出错:', error);
        res.status(500).json({ message: '删除关系失败', error: error.message });
    }
});

// 导出路由
module.exports = router;