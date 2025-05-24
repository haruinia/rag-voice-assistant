import axios from 'axios';

// 定义基础 URL，方便维护
const API_BASE_URL = 'http://localhost:3000/api/data'; // 你的后端路由挂载点

// --- 读取操作 (GET) ---

/**
 * 获取样本图数据
 */
export const fetchData = () => {
  return axios.get(`${API_BASE_URL}/`) // 使用基础 URL
    .then(response => response.data)
    .catch(error => {
      console.error("请求样本数据时发生错误！", error);
      throw error; // 重新抛出错误，让调用者处理
    });
};

/**
 * 获取指定名称节点及其子节点（出向关系）
 * @param {string} nodeName - 节点名称
 */
export const fetchChildren = (nodeName) => {
  return axios.get(`${API_BASE_URL}/${nodeName}`) // 使用基础 URL 和 nodeName
    .then(response => response.data)
    .catch(error => {
      console.error(`获取节点 '${nodeName}' 子节点数据时发生错误！`, error);
      // 考虑处理 404 Not Found 的情况
      if (error.response && error.response.status === 404) {
        console.log(`节点 '${nodeName}' 未找到。`);
        return []; // 返回空数组表示未找到
      }
      throw error;
    });
};

/**
 * 获取指定名称节点的父节点（入向关系）
 * @param {string} nodeName - 节点名称
 */
export const fetchParents = (nodeName) => {
    // 修正 URL 路径，父节点查询也在 /api/data 下
    return axios.get(`${API_BASE_URL}/parents/${nodeName}`)
      .then(response => response.data)
      .catch(error => {
        console.error(`获取节点 '${nodeName}' 父节点数据时发生错误！`, error);
        if (error.response && error.response.status === 404) {
            console.log(`节点 '${nodeName}' 的父节点未找到。`);
            return []; // 返回空数组表示未找到
          }
        throw error;
      });
  };

// --- 创建操作 (POST) ---

/**
 * 创建一个新节点
 * @param {string} label - 节点标签
 * @param {object} properties - 节点属性 (必须包含 name)
 */
export const createNodeAPI = (label, properties) => {
    return axios.post(`${API_BASE_URL}/nodes`, { label, properties })
        .then(response => response.data) // 通常返回创建的节点信息
        .catch(error => {
            console.error(`创建标签为 '${label}' 的节点时发生错误！`, error);
            throw error;
        });
};

/**
 * 创建一条新关系
 * @param {string} startNodeName - 起始节点名称
 * @param {string} endNodeName - 结束节点名称
 * @param {string} relationshipType - 关系类型
 * @param {object} [properties={}] - 关系属性 (可选)
 */
export const createRelationshipAPI = (startNodeName, endNodeName, relationshipType, properties = {}) => {
    return axios.post(`${API_BASE_URL}/relationships`, {
        startNodeName,
        endNodeName,
        relationshipType,
        properties
    })
        .then(response => response.data) // 通常返回创建的关系信息
        .catch(error => {
            console.error(`创建从 '${startNodeName}' 到 '${endNodeName}' 的 '${relationshipType}' 关系时发生错误！`, error);
            throw error;
        });
};

// --- 更新操作 (PATCH) ---

/**
 * 更新指定名称节点的属性
 * @param {string} nodeName - 要更新的节点名称
 * @param {object} propertiesToUpdate - 要更新或添加的属性
 */
export const updateNodeAPI = (nodeName, propertiesToUpdate) => {
    return axios.patch(`${API_BASE_URL}/nodes/${nodeName}`, propertiesToUpdate)
        .then(response => response.data) // 通常返回更新后的节点信息
        .catch(error => {
            console.error(`更新节点 '${nodeName}' 时发生错误！`, error);
            throw error;
        });
};

// --- 删除操作 (DELETE) ---

/**
 * 删除指定名称的节点及其所有关系
 * @param {string} nodeName - 要删除的节点名称
 */
export const deleteNodeAPI = (nodeName) => {
    return axios.delete(`${API_BASE_URL}/nodes/${nodeName}`)
        .then(response => response.data) // 通常返回删除的确认信息
        .catch(error => {
            console.error(`删除节点 '${nodeName}' 时发生错误！`, error);
            throw error;
        });
};

/**
 * 删除两个节点之间指定类型的关系
 * @param {string} startNodeName - 起始节点名称
 * @param {string} endNodeName - 结束节点名称
 * @param {string} relationshipType - 关系类型
 */
export const deleteRelationshipAPI = (startNodeName, endNodeName, relationshipType) => {
    // 对于 axios.delete，如果需要传递 body，需要放在 config 的 data 属性里
    return axios.delete(`${API_BASE_URL}/relationships`, {
        data: { startNodeName, endNodeName, relationshipType }
    })
        .then(response => response.data) // 通常返回删除的确认信息
        .catch(error => {
            console.error(`删除从 '${startNodeName}' 到 '${endNodeName}' 的 '${relationshipType}' 关系时发生错误！`, error);
            throw error;
        });
};


export default {
    fetchData,
    fetchChildren,
    fetchParents,
    createNodeAPI,
    updateNodeAPI,
    deleteNodeAPI,
    createRelationshipAPI,
    deleteRelationshipAPI
};