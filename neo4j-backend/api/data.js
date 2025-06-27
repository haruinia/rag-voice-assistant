const express = require('express');
const neo4j = require('neo4j-driver');
const router = express.Router();

// --- Neo4j 连接 ---
// 保持你原来的连接方式
const driver = neo4j.driver('bolt://192.168.1.112:7687', neo4j.auth.basic('neo4j', 'neo4j'));
// !! 警告：在模块级别创建并在所有请求中重用单个 session 不是推荐的最佳实践，
// !! 在高并发场景下可能导致问题。更健壮的方式是为每个请求获取 session。
// !! 但按你的要求，我们暂时保留此方式。http://192.168.1.112/
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
    
    // 防止修改name属性
    if ('name' in propertiesToUpdate && propertiesToUpdate.name !== nodeName) {
        console.warn(`PATCH /nodes/${nodeName}: 尝试修改 name 属性被阻止。`);
        return res.status(400).json({ message: '不允许通过此接口修改 name 属性' });
    }

    // 处理属性值，确保数值类型正确
    const processedProps = {};
    for (const [key, value] of Object.entries(propertiesToUpdate)) {
        if (typeof value === 'number') {
            // 确保数值是JavaScript原始类型，避免科学计数法表示
            processedProps[key] = Number(value.toFixed(0)); // 对于整数
        } else {
            processedProps[key] = value;
        }
    }

    try {
        // 使用参数化查询方式逐个设置属性
        let setClauses = [];
        let params = { nodeName };
        
        for (const [key, value] of Object.entries(processedProps)) {
            const paramName = `prop_${key}`;
            setClauses.push(`n.${key} = $${paramName}`);
            params[paramName] = value;
        }
        
        const setClause = setClauses.join(', ');
        const query = `
            MATCH (n {name: $nodeName})
            SET ${setClause}
            RETURN n
        `;

        const result = await session.run(query, params);

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
// 添加一个简单的请求跟踪，以检测重复请求
const recentRequests = new Map();

router.post('/relationships', async (req, res) => {
    const { startNodeName, endNodeName, relationshipType, properties = {} } = req.body;
    
    // 创建请求签名用于去重
    const requestSignature = `${startNodeName}-${relationshipType}-${endNodeName}-${JSON.stringify(properties)}`;
    const now = Date.now();
    
    // 检查是否是短时间内的重复请求（5秒内）
    if (recentRequests.has(requestSignature)) {
        const lastTime = recentRequests.get(requestSignature);
        if (now - lastTime < 5000) { // 5秒内的重复请求
            console.warn(`POST /relationships: 检测到可能的重复请求: ${requestSignature}`);
            return res.status(429).json({ 
                message: '请不要重复提交相同的请求', 
                duplicate: true 
            });
        }
    }
    
    // 记录这次请求
    recentRequests.set(requestSignature, now);
    
    // 清理旧的请求记录（保持Map不会无限增长）
    if (recentRequests.size > 1000) {
        const oldEntries = [...recentRequests.entries()]
            .filter(([_, timestamp]) => now - timestamp > 60000); // 删除1分钟以上的记录
        oldEntries.forEach(([key]) => recentRequests.delete(key));
    }
    
    console.log(`POST /relationships: 准备创建关系: (${startNodeName})-[${relationshipType}]->(${endNodeName}), 属性:`, properties);

    if (!startNodeName || !endNodeName || !relationshipType) {
        console.error('POST /relationships: 缺少必要的参数。');
        return res.status(400).json({ message: '请求体必须包含 startNodeName, endNodeName 和 relationshipType' });
    }

    try {
        // 确保关系只创建一次
        const countQuery = `
            MATCH (a {name: $startName})-[r:${relationshipType}]->(b {name: $endName})
            RETURN count(r) as relCount
        `;
        
        const countResult = await session.run(countQuery, {
            startName: startNodeName,
            endName: endNodeName
        });
        
        const relCount = countResult.records[0].get('relCount').toInt();
        
        if (relCount > 0) {
            console.log(`POST /relationships: 关系已存在，将更新属性`);
        }
        
        // 原有的MERGE查询
        const query = `
            MATCH (a {name: $startName})
            MATCH (b {name: $endName})
            MERGE (a)-[r:${relationshipType}]->(b)
            ON CREATE SET r = $props 
            ON MATCH SET r += $props 
            RETURN r, id(r) as relationshipId, type(r) as type
        `;
        
        const result = await session.run(query, {
            startName: startNodeName,
            endName: endNodeName,
            props: properties
        });

        if (result.records.length === 0) {
            console.error(`POST /relationships: 创建关系失败，可能是因为节点 '${startNodeName}' 或 '${endNodeName}' 不存在。`);
            return res.status(404).json({ message: `创建关系失败：未找到起始节点 '${startNodeName}' 或结束节点 '${endNodeName}'` });
        }

        const createdRel = result.records[0].get('r');
        const relId = result.records[0].get('relationshipId');
        const relType = result.records[0].get('type');
        
        const actionType = relCount > 0 ? "更新" : "创建";
        console.log(`POST /relationships: 关系${actionType}成功, ID: ${relId}, 类型: ${relType}, 属性:`, createdRel.properties);

        res.status(201).json({
            id: relId,
            type: relType,
            properties: createdRel.properties,
            wasUpdated: relCount > 0
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
    // if (!/^[A-Z_]+$/.test(relationshipType)) {
    //      console.error(`DELETE /relationships: 无效的关系类型格式: ${relationshipType}`);
    //     return res.status(400).json({ message: '关系类型 (relationshipType) 格式无效，建议使用大写字母和下划线' });
    // }

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

// 添加参数化查询接口
router.post('/query', async (req, res) => {
  const { query, parameters } = req.body;
  
  if (!query) {
    return res.status(400).json({ message: '查询语句不能为空' });
  }

  try {
    console.log("执行参数化查询:", query);
    console.log("查询参数:", parameters);
    
    const result = await session.run(query, parameters);
    
    const response = {
      nodes: [],
      relationships: []
    };

    // 处理结果
    result.records.forEach(record => {
      record.keys.forEach(key => {
        const value = record.get(key);
        
        if (value && value.constructor.name === 'Node') {
          if (!response.nodes.some(n => n.id === value.identity.toString())) {
            response.nodes.push({
              id: value.identity.toString(),
              labels: value.labels,
              name: value.properties.name || '未命名节点',
              properties: value.properties
            });
          }
        } else if (value && value.constructor.name === 'Relationship') {
          response.relationships.push({
            id: value.identity.toString(),
            type: value.type,
            startNode: value.start.toString(),
            endNode: value.end.toString(),
            properties: value.properties
          });
        }
      });
    });

    console.log(`查询结果: ${response.nodes.length} 个节点, ${response.relationships.length} 个关系`);
    res.json(response);
    
  } catch (error) {
    console.error('查询执行失败:', error);
    res.status(500).json({ message: '查询执行失败', error: error.message });
  }
});

// 修改语义搜索接口
// === 修改现有的语义搜索接口 ===
router.post('/semantic-search', async (req, res) => {
    const { question } = req.body;
    
    if (!question) {
        return res.status(400).json({ message: '问题不能为空' });
    }

    console.log(`语义搜索请求收到: "${question}"`);

    try {
        // 简化实体提取
        const entityPattern = /(.*?)(?:是谁|是什么|的关系|有什么|有哪些|属性)?[\?？]?$/;
        const match = question.match(entityPattern);
        let entityName = match ? match[1].trim() : question.trim();
        
        console.log(`提取的实体名称: "${entityName}"`);
        
        // 使用增强的模糊搜索
        const searchResults = await enhancedFuzzySearch(entityName, session);
        
        const response = {
            nodes: [],
            relationships: [],
            searchInfo: {
                originalQuery: entityName,
                totalMatches: searchResults.length,
                matchTypes: [...new Set(searchResults.map(r => r.matchType))]
            }
        };

        // 处理搜索结果 - 修复bug：正确访问包装的record对象
        if (searchResults.length > 0) {
            const nodeMap = new Map();
            
            searchResults.forEach(resultItem => {
                // 修复：resultItem是包装对象，需要访问其中的record属性
                const neo4jRecord = resultItem.record;
                
                if (!neo4jRecord) {
                    console.warn('发现一个没有record的搜索结果项:', resultItem);
                    return;
                }

                const nodeN = neo4jRecord.get('n');
                const rel = neo4jRecord.get('r');
                const nodeM = neo4jRecord.get('m');

                // 添加主节点
                if (nodeN && !nodeMap.has(nodeN.identity.toString())) {
                    const nodeInfo = {
                        id: nodeN.identity.toString(),
                        labels: nodeN.labels,
                        name: nodeN.properties.name || '未命名节点',
                        properties: nodeN.properties,
                        matchScore: resultItem.score || 0,  // 从包装对象获取分数
                        matchType: resultItem.matchType || 'unknown'  // 从包装对象获取类型
                    };
                    nodeMap.set(nodeN.identity.toString(), nodeInfo);
                    response.nodes.push(nodeInfo);
                    
                    console.log(`找到节点: ${nodeInfo.name} (匹配度: ${(resultItem.score * 100).toFixed(1)}%, 类型: ${resultItem.matchType})`);
                }

                // 添加关联节点
                if (nodeM && !nodeMap.has(nodeM.identity.toString())) {
                    const nodeInfo = {
                        id: nodeM.identity.toString(),
                        labels: nodeM.labels,
                        name: nodeM.properties.name || '未命名节点',
                        properties: nodeM.properties,
                        matchScore: 0, // 关联节点不参与匹配评分
                        matchType: 'related'
                    };
                    nodeMap.set(nodeM.identity.toString(), nodeInfo);
                    response.nodes.push(nodeInfo);
                }

                // 添加关系
                if (rel) {
                    const relExists = response.relationships.some(r => r.id === rel.identity.toString());
                    if (!relExists) {
                        response.relationships.push({
                            id: rel.identity.toString(),
                            type: rel.type,
                            startNode: rel.start.toString(),
                            endNode: rel.end.toString(),
                            properties: rel.properties
                        });
                    }
                }
            });
            
            // 按匹配分数排序节点
            response.nodes.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
        } else {
            console.log(`未找到任何匹配的节点`);
        }

        console.log(`最终响应: ${response.nodes.length} 个节点, ${response.relationships.length} 个关系`);
        console.log(`匹配类型: ${response.searchInfo.matchTypes.join(', ')}`);
        
        res.json(response);
        
    } catch (error) {
        console.error('语义搜索时出错:', error);
        // 如果出错，返回空结果而不是抛出500错误，提供更好的用户体验
        res.json({ 
            nodes: [], 
            relationships: [],
            searchInfo: {
                originalQuery: req.body.question,
                totalMatches: 0,
                matchTypes: [],
                error: '搜索过程中出现错误，请尝试其他关键词'
            }
        });
    }
});


// === 模糊查询辅助函数 ===

/**
 * 计算两个字符串的编辑距离（Levenshtein Distance）
 */
function levenshteinDistance(str1, str2) {
    const matrix = [];
    const len1 = str1.length;
    const len2 = str2.length;

    if (len1 === 0) return len2;
    if (len2 === 0) return len1;

    // 初始化矩阵
    for (let i = 0; i <= len1; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
        matrix[0][j] = j;
    }

    // 填充矩阵
    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,      // 删除
                matrix[i][j - 1] + 1,      // 插入
                matrix[i - 1][j - 1] + cost // 替换
            );
        }
    }

    return matrix[len1][len2];
}

/**
 * 计算相似度分数（0-1之间，1表示完全相同）
 */
function calculateSimilarity(str1, str2) {
    const maxLen = Math.max(str1.length, str2.length);
    if (maxLen === 0) return 1;
    const distance = levenshteinDistance(str1, str2);
    return (maxLen - distance) / maxLen;
}

/**
 * 简单的汉字转拼音映射（部分常见字，可根据需要扩展）
 */
const pinyinMap = {
    '鎏': 'liu', '刘': 'liu', '留': 'liu', '流': 'liu', '柳': 'liu',
    '金': 'jin', '进': 'jin', '津': 'jin', '今': 'jin', '近': 'jin',
    '铜': 'tong', '同': 'tong', '童': 'tong', '通': 'tong',
    '牛': 'niu', '纽': 'niu', '扭': 'niu',
    '佛': 'fo', '佛': 'fo', '福': 'fu', '富': 'fu',
    '像': 'xiang', '象': 'xiang', '向': 'xiang', '响': 'xiang',
    '天': 'tian', '田': 'tian', '甜': 'tian',
    '王': 'wang', '望': 'wang', '忘': 'wang', '旺': 'wang',
    '造': 'zao', '早': 'zao', '枣': 'zao', '燥': 'zao',
    '青': 'qing', '清': 'qing', '轻': 'qing', '情': 'qing',
    '白': 'bai', '百': 'bai', '摆': 'bai', '败': 'bai',
    '瓷': 'ci', '词': 'ci', '慈': 'ci', '磁': 'ci',
    '壶': 'hu', '湖': 'hu', '胡': 'hu', '虎': 'hu', '户': 'hu',
    '花': 'hua', '华': 'hua', '化': 'hua', '画': 'hua',
    '瓶': 'ping', '平': 'ping', '苹': 'ping', '评': 'ping',
    '碗': 'wan', '万': 'wan', '湾': 'wan', '完': 'wan',
    '盘': 'pan', '判': 'pan', '盼': 'pan', '攀': 'pan'
};

/**
 * 将文本转换为拼音
 */
function textToPinyin(text) {
    return text.split('').map(char => pinyinMap[char] || char).join('');
}

/**
 * 拼音相似度匹配
 */
function pinyinSimilarity(str1, str2) {
    const pinyin1 = textToPinyin(str1);
    const pinyin2 = textToPinyin(str2);
    return calculateSimilarity(pinyin1, pinyin2);
}

/**
 * 增强的模糊搜索函数
 */
/**
 * 增强的模糊搜索函数 (修正版)
 */
async function enhancedFuzzySearch(searchText, session) {
    console.log(`开始增强模糊搜索: "${searchText}"`);
    
    const results = [];
    // 不再需要 processedNodes，因为后续的接口会处理
    
    // 1. 精确匹配
    console.log('1. 尝试精确匹配...');
    try {
        const exactResult = await session.run(`
            MATCH (n {name: $name})
            OPTIONAL MATCH (n)-[r]-(m)
            RETURN n, r, m
        `, { name: searchText });
        
        if (exactResult.records.length > 0) {
            console.log(`精确匹配找到 ${exactResult.records.length} 条记录`);
            // *** 关键修正 ***
            results.push(...exactResult.records.map(record => ({
                record: record, // 包装原始 record
                score: 1.0,
                matchType: 'exact'
            })));
        }
    } catch (error) {
        console.error('精确匹配出错:', error);
    }

    // 2. CONTAINS 模糊匹配
    if (results.length === 0) {
        console.log('2. 尝试 CONTAINS 模糊匹配...');
        try {
            const containsResult = await session.run(`
                MATCH (n)
                WHERE n.name CONTAINS $name
                OPTIONAL MATCH (n)-[r]-(m)
                RETURN n, r, m
                LIMIT 10
            `, { name: searchText });
            
            if (containsResult.records.length > 0) {
                console.log(`CONTAINS 匹配找到 ${containsResult.records.length} 条记录`);
                // *** 关键修正 ***
                results.push(...containsResult.records.map(record => ({
                    record: record, // 包装原始 record
                    score: 0.8,
                    matchType: 'contains'
                })));
            }
        } catch (error) {
            console.error('CONTAINS 匹配出错:', error);
        }
    }

    // 3. 编辑距离模糊匹配
    if (results.length === 0) {
        console.log('3. 尝试编辑距离模糊匹配...');
        try {
            const allNodesResult = await session.run(`
                MATCH (n) WHERE n.name IS NOT NULL RETURN n.name as name LIMIT 1000
            `);
            
            const candidates = [];
            allNodesResult.records.forEach(record => {
                const nodeName = record.get('name');
                const similarity = calculateSimilarity(searchText, nodeName);
                const threshold = searchText.length <= 3 ? 0.6 : 0.5;
                if (similarity >= threshold) {
                    candidates.push({ name: nodeName, similarity: similarity });
                }
            });
            
            candidates.sort((a, b) => b.similarity - a.similarity);
            const topCandidates = candidates.slice(0, 5);
            
            console.log(`编辑距离匹配找到 ${topCandidates.length} 个候选节点:`, 
                       topCandidates.map(c => `${c.name}(${c.similarity.toFixed(2)})`));
            
            for (const candidate of topCandidates) {
                const candidateResult = await session.run(`
                    MATCH (n {name: $name}) OPTIONAL MATCH (n)-[r]-(m) RETURN n, r, m
                `, { name: candidate.name });
                
                // *** 关键修正 ***
                results.push(...candidateResult.records.map(record => ({
                    record: record, // 包装原始 record
                    score: candidate.similarity,
                    matchType: 'edit_distance'
                })));
            }
        } catch (error) {
            console.error('编辑距离匹配出错:', error);
        }
    }

    // 4. 拼音相似度匹配
    if (results.length === 0) {
        console.log('4. 尝试拼音相似度匹配...');
        try {
            const allNodesResult = await session.run(`
                MATCH (n) WHERE n.name IS NOT NULL RETURN n.name as name LIMIT 1000
            `);
            
            const pinyinCandidates = [];
            allNodesResult.records.forEach(record => {
                const nodeName = record.get('name');
                const pinyinSim = pinyinSimilarity(searchText, nodeName);
                if (pinyinSim >= 0.7) {
                    pinyinCandidates.push({ name: nodeName, similarity: pinyinSim });
                }
            });
            
            pinyinCandidates.sort((a, b) => b.similarity - a.similarity);
            const topPinyinCandidates = pinyinCandidates.slice(0, 3);
            
            console.log(`拼音匹配找到 ${topPinyinCandidates.length} 个候选节点:`, 
                       topPinyinCandidates.map(c => `${c.name}(${c.similarity.toFixed(2)})`));
            
            for (const candidate of topPinyinCandidates) {
                const candidateResult = await session.run(`
                    MATCH (n {name: $name}) OPTIONAL MATCH (n)-[r]-(m) RETURN n, r, m
                `, { name: candidate.name });
                
                // *** 关键修正 ***
                results.push(...candidateResult.records.map(record => ({
                    record: record, // 包装原始 record
                    score: candidate.similarity,
                    matchType: 'pinyin'
                })));
            }
        } catch (error) {
            console.error('拼音匹配出错:', error);
        }
    }

    return results;
}

// === 修改现有的语义搜索接口 ===
router.post('/semantic-search', async (req, res) => {
    const { question } = req.body;
    
    if (!question) {
        return res.status(400).json({ message: '问题不能为空' });
    }

    console.log(`语义搜索请求收到: "${question}"`);

    try {
        // 简化实体提取
        const entityPattern = /(.*?)(?:是谁|是什么|的关系|有什么|有哪些|属性)?[\?？]?$/;
        const match = question.match(entityPattern);
        let entityName = match ? match[1].trim() : question.trim();
        
        console.log(`提取的实体名称: "${entityName}"`);
        
        // 使用增强的模糊搜索
        const searchResults = await enhancedFuzzySearch(entityName, session);
        
        const response = {
            nodes: [],
            relationships: [],
            searchInfo: {
                originalQuery: entityName,
                totalMatches: searchResults.length,
                matchTypes: [...new Set(searchResults.map(r => r.matchType))]
            }
        };

        // 处理搜索结果
        if (searchResults.length > 0) {
            const nodeMap = new Map();
            
            searchResults.forEach(record => {
                const nodeN = record.get('n');
                const rel = record.get('r');
                const nodeM = record.get('m');

                // 添加主节点
                if (nodeN && !nodeMap.has(nodeN.identity.toString())) {
                    const nodeInfo = {
                        id: nodeN.identity.toString(),
                        labels: nodeN.labels,
                        name: nodeN.properties.name || '未命名节点',
                        properties: nodeN.properties,
                        matchScore: record.score || 0,
                        matchType: record.matchType || 'unknown'
                    };
                    nodeMap.set(nodeN.identity.toString(), nodeInfo);
                    response.nodes.push(nodeInfo);
                    
                    console.log(`找到节点: ${nodeInfo.name} (匹配度: ${(record.score * 100).toFixed(1)}%, 类型: ${record.matchType})`);
                }

                // 添加关联节点
                if (nodeM && !nodeMap.has(nodeM.identity.toString())) {
                    const nodeInfo = {
                        id: nodeM.identity.toString(),
                        labels: nodeM.labels,
                        name: nodeM.properties.name || '未命名节点',
                        properties: nodeM.properties,
                        matchScore: 0, // 关联节点不参与匹配评分
                        matchType: 'related'
                    };
                    nodeMap.set(nodeM.identity.toString(), nodeInfo);
                    response.nodes.push(nodeInfo);
                }

                // 添加关系
                if (rel) {
                    const relExists = response.relationships.some(r => r.id === rel.identity.toString());
                    if (!relExists) {
                        response.relationships.push({
                            id: rel.identity.toString(),
                            type: rel.type,
                            startNode: rel.start.toString(),
                            endNode: rel.end.toString(),
                            properties: rel.properties
                        });
                    }
                }
            });
            
            // 按匹配分数排序节点
            response.nodes.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
        } else {
            console.log(`未找到任何匹配的节点`);
        }

        console.log(`最终响应: ${response.nodes.length} 个节点, ${response.relationships.length} 个关系`);
        console.log(`匹配类型: ${response.searchInfo.matchTypes.join(', ')}`);
        
        res.json(response);
        
    } catch (error) {
        console.error('【已跳过】语义搜索时出错:', error.message);
        // 直接返回空数组，告诉前端“什么也没找到”
        res.json({ nodes: [], relationships: [] });
    }
});

router.post('/fuzzy-search', async (req, res) => {
    const { searchText, threshold = 0.5 } = req.body;
    
    if (!searchText) {
        return res.status(400).json({ message: '搜索文本不能为空' });
    }

    console.log(`模糊搜索请求: "${searchText}", 阈值: ${threshold}`);

    try {
        const searchResults = await enhancedFuzzySearch(searchText, session);
        
        const filteredResults = searchResults.filter(result => 
            (result.score || 0) >= threshold
        );

        const response = {
            nodes: [],
            relationships: [],
            searchInfo: {
                originalQuery: searchText,
                threshold: threshold,
                totalMatches: filteredResults.length,
                matchTypes: [...new Set(filteredResults.map(r => r.matchType))]
            }
        };

        const nodeMap = new Map();
        
        filteredResults.forEach(resultItem => {
            const neo4jRecord = resultItem.record; 
            
            if (!neo4jRecord) {
                console.warn('发现一个没有 neo4jRecord 的搜索结果项:', resultItem);
                return;
            }

            const nodeN = neo4jRecord.get('n');
            
            if (nodeN && !nodeMap.has(nodeN.identity.toString())) {
                const nodeInfo = {
                    id: nodeN.identity.toString(),
                    labels: nodeN.labels,
                    name: nodeN.properties.name || '未命名节点',
                    properties: nodeN.properties,
                    matchScore: resultItem.score || 0,
                    matchType: resultItem.matchType || 'unknown'
                };
                nodeMap.set(nodeN.identity.toString(), nodeInfo);
                response.nodes.push(nodeInfo);
            }
        });
        
        response.nodes.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
        
        console.log(`模糊搜索完成: ${response.nodes.length} 个匹配节点`);
        res.json(response);
        
    } catch (error) {
        console.error('模糊搜索时出错:', error);
        res.status(500).json({ message: '模糊搜索失败', error: error.message });
    }
});




// 导出路由
module.exports = router;