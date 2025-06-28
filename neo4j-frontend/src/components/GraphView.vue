<template>
  <div class="app-container">
    <!-- 通知组件 -->
    <div class="notification" v-if="notification.show" :class="notification.type">
      {{ notification.message }}
      <button class="close-btn" @click="notification.show = false">×</button>
    </div>

    <!-- 左侧图数据浏览器控制面板 -->
    <div class="control-panel">
      <h2>Neo4j 图数据浏览器</h2>
      
      <!-- 查询部分 -->
      <div class="query-section">
        <h3>节点查询</h3>
        <div class="search-box">
          <div class="search-input">
            <i class="fas fa-search"></i>
    <input 
              v-model="searchNodeName" 
              placeholder="输入节点名称..." 
      @keyup.enter="searchNode"
            />
          </div>
          <div class="search-actions">
            <div class="search-buttons">
              <button 
                class="primary-button" 
                @click="searchNode"
                title="查找该节点及其关联节点">
                <i class="fas fa-project-diagram"></i>
                查找节点关系
              </button>
              <button 
                class="secondary-button" 
                @click="searchParents" 
                :disabled="!searchNodeName"
                title="查找指向该节点的父节点">
                <i class="fas fa-level-up-alt"></i>
                查找父节点
              </button>
              <button 
                class="text-button" 
                @click="loadSampleData"
                title="加载数据库中的部分样本数据">
                <i class="fas fa-random"></i>
                加载随机样本
              </button>
            </div>
            <span class="helper-text">* 样本数据仅用于预览，限制25条记录</span>
          </div>
        </div>
      </div>

      <!-- 节点操作部分 -->
      <div class="node-operations">
        <h3>节点操作</h3>
        <div class="operation-tabs">
          <button 
            :class="{ active: activeTab === 'create' }"
            @click="activeTab = 'create'"
          >创建节点</button>
          <button 
            :class="{ active: activeTab === 'update' }"
            @click="activeTab = 'update'"
          >更新节点</button>
          <button 
            :class="{ active: activeTab === 'delete' }"
            @click="activeTab = 'delete'"
          >删除节点</button>
          <button 
            :class="{ active: activeTab === 'relationship' }"
            @click="activeTab = 'relationship'"
          >管理关系</button>
        </div>

        <!-- 创建节点表单 -->
        <div v-if="activeTab === 'create'" class="operation-form">
          <div class="form-group">
            <label>标签 (Label):</label>
            <input v-model="newNode.label" placeholder="例如: Person" />
          </div>
          <div class="form-group">
            <label>属性 (JSON 格式):</label>
            <textarea 
              v-model="newNode.propertiesJSON" 
              placeholder='{"name": "张三", "born": 1995}'
              rows="4"
            ></textarea>
          </div>
          <button @click="createNode">创建节点</button>
        </div>

        <!-- 更新节点表单 -->
        <div v-if="activeTab === 'update'" class="operation-form">
          <div class="form-group">
            <label>节点名称:</label>
            <input v-model="updateNode.name" placeholder="要更新的节点名称" />
          </div>
          <div class="form-group">
            <label>要更新的属性 (JSON 格式):</label>
            <textarea 
              v-model="updateNode.propertiesJSON" 
              placeholder='{"born": 1996, "city": "北京"}'
              rows="4"
            ></textarea>
          </div>
          <button @click="updateNodeProperties">更新节点</button>
        </div>

        <!-- 删除节点表单 -->
        <div v-if="activeTab === 'delete'" class="operation-form">
          <div class="form-group">
            <label>节点名称:</label>
            <input v-model="deleteNode.name" placeholder="要删除的节点名称" />
          </div>
          <p class="warning">警告: 删除节点将同时删除与其相关的所有关系！</p>
          <button @click="deleteNodeAndRelationships" class="danger-button">删除节点</button>
        </div>

        <!-- 关系管理表单 -->
        <div v-if="activeTab === 'relationship'" class="operation-form">
          <div class="sub-tabs">
            <button 
              :class="{ active: relationshipTab === 'create' }"
              @click="relationshipTab = 'create'"
            >创建关系</button>
            <button 
              :class="{ active: relationshipTab === 'delete' }"
              @click="relationshipTab = 'delete'"
            >删除关系</button>
          </div>

          <!-- 创建关系表单 -->
          <div v-if="relationshipTab === 'create'" class="form-group">
            <div class="form-group">
              <label>起始节点名称:</label>
              <input v-model="relationship.startNodeName" placeholder="例如: 张三" />
            </div>
            <div class="form-group">
              <label>关系类型:</label>
              <input v-model="relationship.relationshipType" placeholder="例如: KNOWS" />
            </div>
            <div class="form-group">
              <label>结束节点名称:</label>
              <input v-model="relationship.endNodeName" placeholder="例如: 李四" />
            </div>
            <div class="form-group">
              <label>关系属性 (JSON 格式，可选):</label>
              <textarea 
                v-model="relationship.propertiesJSON" 
                placeholder='{"since": 2023}' 
                rows="3"
              ></textarea>
            </div>
            <button @click="createRelationship">创建关系</button>
          </div>

          <!-- 删除关系表单 -->
          <div v-if="relationshipTab === 'delete'" class="form-group">
            <div class="form-group">
              <label>起始节点名称:</label>
              <input v-model="deleteRelationship.startNodeName" placeholder="例如: 张三" />
            </div>
            <div class="form-group">
              <label>关系类型:</label>
              <input v-model="deleteRelationship.relationshipType" placeholder="例如: KNOWS" />
            </div>
            <div class="form-group">
              <label>结束节点名称:</label>
              <input v-model="deleteRelationship.endNodeName" placeholder="例如: 李四" />
            </div>
            <button @click="deleteRelationshipBetweenNodes" class="danger-button">删除关系</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 右侧图形可视化区域 -->
    <div class="visualization-area">
      <h3>图数据视图</h3>

      <div v-if="loading" class="loading">
        <div class="spinner"></div>
        <span>加载中...</span>
      </div>
      
      <div v-else-if="groupedData.length === 0" class="no-data">
        <i class="fas fa-database"></i>
        <p>无数据可显示</p>
        <p>尝试查询节点或加载样本数据</p>
      </div>
      
      <div v-else class="graph-data">
        <!-- 每个组（父节点及其所有子节点）作为一行 -->
        <div v-for="(group, index) in groupedData" 
             :key="index" 
             class="graph-group">
          <!-- 父节点标题部分 -->
          <div class="group-header">
            <div class="main-node-title">
              <h4>
                <i class="fas fa-project-diagram"></i>
                {{ group.mainNode.name || '无名节点' }}
              </h4>
              <div class="node-labels" v-if="group.mainNode.labels?.length">
                <span v-for="label in group.mainNode.labels" 
                      :key="label" 
                      class="label">
                  {{ label }}
                </span>
              </div>
            </div>
          </div>

          <!-- 子节点横向排列部分 -->
          <div class="related-nodes-container">
            <!-- 主节点属性卡片 -->
            <div class="node-card main-node-card">
              <div class="node-properties">
                <div v-for="prop in getFilteredProperties(group.mainNode.properties)" 
                     :key="prop.key"
                     class="property-item">
                  <span class="property-key">{{ prop.key }}:</span>
                  <span class="property-value" :title="prop.value">
                    {{ formatValue(prop.value) }}
                  </span>
                </div>
              </div>
              <div class="node-actions">
                <button @click="searchNodeDetails(group.mainNode.name)" 
                        title="查看详情">
                  <i class="fas fa-search"></i>
                </button>
                <button @click="editNode(group.mainNode)" 
                        title="编辑节点">
                  <i class="fas fa-edit"></i>
                </button>
              </div>
            </div>

            <!-- 关系和子节点横向排列 -->
            <div class="child-nodes-container">
              <div v-for="(rel, relIndex) in group.relationships" 
                   :key="relIndex"
                   class="node-card child-node-card">
                <div class="relationship-type">
                  <i class="fas fa-arrow-right"></i>
                  {{ rel.type }}
                  <span v-if="rel.properties && Object.keys(rel.properties).length" 
                        class="relationship-properties"
                        :title="JSON.stringify(rel.properties, null, 2)">
                    {{ formatRelProperties(rel.properties) }}
                  </span>
                </div>
                
                <div class="node-content">
                  <div class="node-header">
                    <h5>{{ rel.node.name || '无名节点' }}</h5>
                    <div class="node-labels" v-if="rel.node.labels?.length">
                      <span v-for="label in rel.node.labels" 
                            :key="label" 
                            class="label small">
                        {{ label }}
                      </span>
                    </div>
                  </div>
                  
                  <div class="node-properties">
                    <div v-for="prop in getFilteredProperties(rel.node.properties)" 
                         :key="prop.key"
                         class="property-item">
                      <span class="property-key">{{ prop.key }}:</span>
                      <span class="property-value" :title="prop.value">
                        {{ formatValue(prop.value) }}
                      </span>
                    </div>
                  </div>

                  <div class="node-actions">
                    <button @click="searchNodeDetails(rel.node.name)" 
                            class="small-button"
                            title="查看详情">
                      <i class="fas fa-search"></i>
                    </button>
                    <button @click="editNode(rel.node)" 
                            class="small-button"
                            title="编辑节点">
                      <i class="fas fa-edit"></i>
    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import axios from 'axios';

export default {
  name: 'GraphView',
  
  data() {
    return {
      // 修改 API 基础 URL，去掉末尾的 /data
      apiBaseUrl: 'http://localhost:3000/api',
      
      // 图形数据
      graphData: [],
      loading: false,
      
      // 查询参数
      searchNodeName: '',
      
      // 选项卡状态
      activeTab: 'create',
      relationshipTab: 'create',
      
      // 节点操作数据
      newNode: {
        label: '',
        propertiesJSON: ''
      },
      updateNode: {
        name: '',
        propertiesJSON: ''
      },
      deleteNode: {
        name: ''
      },
      
      // 关系操作数据
      relationship: {
        startNodeName: '',
        endNodeName: '',
        relationshipType: '',
        propertiesJSON: ''
      },
      deleteRelationship: {
        startNodeName: '',
        endNodeName: '',
        relationshipType: ''
      },
      
      // 通知消息
      notification: {
        show: false,
        message: '',
        type: 'success'
      },
    };
  },
  
  created() {
    // 组件创建时加载样本数据
    this.loadSampleData();
  },
  
  computed: {
    groupedData() {
      // 根据查询类型不同，进行不同的数据处理
      if (this.graphData.length === 0) return [];

      // 检查是否是父节点查询结果
      const isParentQuery = this.graphData.some(item => 
        item.node1 && item.node2 && item.node2.name === this.searchNodeName
      );

      if (isParentQuery) {
        // 处理父节点查询结果
        const childNode = this.graphData[0]?.node2;
        if (!childNode) return [];

        return [{
          mainNode: {
            name: childNode.name,
            labels: childNode.labels || [],
            properties: this.extractProperties(childNode)
          },
          relationships: this.graphData.map(item => ({
            type: item.relationship,
            properties: item.relationshipProperties || {},
            node: {
              name: item.node1.name,
              labels: item.node1.labels || [],
              properties: this.extractProperties(item.node1)
            }
          }))
        }];
      } else {
        // 处理普通查询结果
        // 按主节点分组
        const groups = {};
        
        this.graphData.forEach(item => {
          if (!item.node1) return;
          
          const mainNodeName = item.node1.name;
          if (!groups[mainNodeName]) {
            groups[mainNodeName] = {
              mainNode: {
                name: item.node1.name,
                labels: item.node1.labels || [],
                properties: this.extractProperties(item.node1)
              },
              relationships: []
            };
          }
          
          if (item.node2) {
            groups[mainNodeName].relationships.push({
              type: item.relationship,
              properties: item.relationshipProperties || {},
              node: {
                name: item.node2.name,
                labels: item.node2.labels || [],
                properties: this.extractProperties(item.node2)
              }
            });
          }
        });
        
        return Object.values(groups);
      }
    }
  },
  
  methods: {
    // ===== 查询方法 =====
    async loadSampleData() {
      this.loading = true;
      try {
        const response = await axios.get(`${this.apiBaseUrl}/data`);
        this.graphData = response.data;
        
        if (this.graphData.length === 0) {
          this.showNotification('数据库中暂无数据', 'info');
        } else {
          this.showNotification(
            `已加载 ${this.graphData.length} 条样本数据（最多显示25条）`, 
            'info'
          );
        }
      } catch (error) {
        console.error('加载样本数据失败:', error);
        this.showNotification(
          `加载样本数据失败: ${error.response?.data?.message || error.message}`, 
          'error'
        );
      } finally {
        this.loading = false;
      }
    },
    
    async searchNode() {
      if (!this.searchNodeName.trim()) {
        this.showNotification('请输入节点名称进行查询', 'warning');
        return;
      }
      
      this.loading = true;
      try {
        const response = await axios.get(`${this.apiBaseUrl}/data/${this.searchNodeName}`);
        this.graphData = response.data;
        
        if (this.graphData.length === 0) {
          this.showNotification(
            `未找到名称为 "${this.searchNodeName}" 的节点`, 
            'info'
          );
        } else {
          this.showNotification(
            `已找到节点 "${this.searchNodeName}" 及其关联节点`, 
            'success'
          );
        }
      } catch (error) {
        console.error('查询节点失败:', error);
        this.showNotification(
          `查询失败: ${error.response?.data?.message || error.message}`, 
          'error'
        );
        this.graphData = [];
      } finally {
        this.loading = false;
      }
    },
    
    async searchParents() {
      if (!this.searchNodeName.trim()) {
        this.showNotification('请输入节点名称进行查询', 'warning');
        return;
      }
      
      this.loading = true;
      try {
        const response = await axios.get(`${this.apiBaseUrl}/data/parents/${this.searchNodeName}`);
        this.graphData = response.data;
        
        if (this.graphData.length === 0) {
          this.showNotification(
            `未找到节点 "${this.searchNodeName}" 的父节点`, 
            'info'
          );
        } else {
          this.showNotification(
            `已找到 ${this.graphData.length} 个父节点`, 
            'success'
          );
        }
      } catch (error) {
        console.error('查询父节点失败:', error);
        this.showNotification(
          `查询失败: ${error.response?.data?.message || error.message}`, 
          'error'
        );
        this.graphData = [];
      } finally {
        this.loading = false;
      }
    },
    
    // ===== 节点操作方法 =====
    async createNode() {
      if (!this.newNode.label || !this.newNode.propertiesJSON) {
        this.showNotification('标签和属性都不能为空', 'warning');
        return;
      }
      
      let properties;
      try {
        properties = JSON.parse(this.newNode.propertiesJSON);
      } catch (e) {
        this.showNotification('属性必须是有效的 JSON 格式', 'error');
        return;
      }

      // 确保 properties 包含 name 属性
      if (!properties.name) {
        this.showNotification('属性中必须包含 name 字段', 'warning');
        return;
      }

      if (this.debug) {
        console.log('创建节点请求:', {
          url: `${this.apiBaseUrl}/data/nodes`,
            data: {
            label: this.newNode.label,
            properties: properties
            }
          });
        }
      
      this.loading = true;
      try {
        await axios.post(`${this.apiBaseUrl}/data/nodes`, {
          label: this.newNode.label,
          properties: properties
        });
        
        this.showNotification('节点创建成功!', 'success');
        this.newNode.label = '';
        this.newNode.propertiesJSON = '';
        
        // 如果创建的节点与当前搜索节点相关，则刷新查询
        if (this.searchNodeName) {
          await this.searchNode();
        } else {
          await this.loadSampleData();
        }
      } catch (error) {
        console.error('创建节点失败:', error);
        this.showNotification(
          `创建节点失败: ${error.response?.data?.message || error.message}`, 
          'error'
        );
      } finally {
        this.loading = false;
      }
    },
    
    async updateNodeProperties() {
      if (!this.updateNode.name || !this.updateNode.propertiesJSON) {
        this.showNotification('节点名称和要更新的属性都不能为空', 'warning');
        return;
      }

      let properties;
      try {
        properties = JSON.parse(this.updateNode.propertiesJSON);
      } catch (e) {
        this.showNotification('属性必须是有效的 JSON 格式', 'error');
        return;
      }

      if (this.debug) {
        console.log('更新节点请求:', {
          url: `${this.apiBaseUrl}/data/nodes/${this.updateNode.name}`,
          data: properties
        });
      }
      
      this.loading = true;
      try {
        await axios.patch(
          `${this.apiBaseUrl}/data/nodes/${this.updateNode.name}`,
          properties
        );
        
        this.showNotification(`节点 "${this.updateNode.name}" 更新成功!`, 'success');
        
        // 如果当前正在查看这个节点，则刷新查询
        if (this.searchNodeName === this.updateNode.name) {
          await this.searchNode();
        } else {
          await this.loadSampleData();
        }
        
        // 清空表单
        this.updateNode.propertiesJSON = '';
      } catch (error) {
        console.error('更新节点失败:', error);
        this.showNotification(
          `更新节点失败: ${error.response?.data?.message || error.message}`, 
          'error'
        );
      } finally {
        this.loading = false;
      }
    },
    
    async deleteNodeAndRelationships() {
      if (!this.deleteNode.name) {
        this.showNotification('请输入要删除的节点名称', 'warning');
            return;
          }

      if (!confirm(`确定要删除节点 "${this.deleteNode.name}" 及其所有关系吗？此操作不可恢复！`)) {
        return;
      }

      if (this.debug) {
        console.log('删除节点请求:', {
          url: `${this.apiBaseUrl}/data/nodes/${this.deleteNode.name}`
        });
      }
      
      this.loading = true;
      try {
        await axios.delete(
          `${this.apiBaseUrl}/data/nodes/${this.deleteNode.name}`
        );
        
        this.showNotification(`节点 "${this.deleteNode.name}" 已成功删除!`, 'success');
        
        // 清空表单
        this.deleteNode.name = '';
        
        // 重新加载数据
        await this.loadSampleData();
      } catch (error) {
        console.error('删除节点失败:', error);
        this.showNotification(
          `删除节点失败: ${error.response?.data?.message || error.message}`, 
          'error'
        );
      } finally {
        this.loading = false;
      }
    },
    
    // ===== 关系操作方法 =====
    async createRelationship() {
      const { startNodeName, endNodeName, relationshipType, propertiesJSON } = this.relationship;
      
      if (!startNodeName || !endNodeName || !relationshipType) {
        this.showNotification('起始节点、结束节点和关系类型都不能为空', 'warning');
        return;
      }
      
      let properties = {};
      if (propertiesJSON) {
        try {
          properties = JSON.parse(propertiesJSON);
        } catch (e) {
          this.showNotification('关系属性必须是有效的 JSON 格式', 'error');
          return;
        }
      }

      if (this.debug) {
        console.log('创建关系请求:', {
          url: `${this.apiBaseUrl}/data/relationships`,
          data: { startNodeName, endNodeName, relationshipType, properties }
        });
      }
      
      this.loading = true;
      try {
        await axios.post(`${this.apiBaseUrl}/data/relationships`, {
          startNodeName,
          endNodeName,
          relationshipType,
          properties
        });
        
        this.showNotification('关系创建成功!', 'success');
        
        // 清空表单
        this.relationship.propertiesJSON = '';
        
        // 重新加载数据或查询起始节点
        if (this.searchNodeName === startNodeName) {
          await this.searchNode();
        } else {
          await this.loadSampleData();
        }
      } catch (error) {
        console.error('创建关系失败:', error);
        this.showNotification(
          `创建关系失败: ${error.response?.data?.message || error.message}`, 
          'error'
        );
      } finally {
        this.loading = false;
      }
    },
    
    async deleteRelationshipBetweenNodes() {
      const { startNodeName, endNodeName, relationshipType } = this.deleteRelationship;
      
      if (!startNodeName || !endNodeName || !relationshipType) {
        this.showNotification('起始节点、结束节点和关系类型都不能为空', 'warning');
        return;
      }
      
      if (!confirm(`确定要删除从 "${startNodeName}" 到 "${endNodeName}" 的 "${relationshipType}" 关系吗？`)) {
        return;
      }

      if (this.debug) {
        console.log('删除关系请求:', {
          url: `${this.apiBaseUrl}/data/relationships`,
          data: { startNodeName, endNodeName, relationshipType }
        });
      }
      
      this.loading = true;
      try {
        await axios.delete(`${this.apiBaseUrl}/data/relationships`, {
          data: { startNodeName, endNodeName, relationshipType }
        });
        
        this.showNotification('关系删除成功!', 'success');
        
        // 重新加载数据或查询起始节点
        if (this.searchNodeName === startNodeName) {
          await this.searchNode();
        } else {
          await this.loadSampleData();
        }
      } catch (error) {
        console.error('删除关系失败:', error);
        this.showNotification(
          `删除关系失败: ${error.response?.data?.message || error.message}`, 
          'error'
        );
      } finally {
        this.loading = false;
      }
    },
    
    // ===== 辅助方法 =====
    showNotification(message, type = 'success') {
      this.notification = {
        show: true,
        message,
        type
      };
      
      // 5秒后自动关闭通知
      setTimeout(() => {
        this.notification.show = false;
      }, 5000);
    },

    // 格式化属性值显示
    formatValue(value) {
      if (value === null) return 'null';
      if (typeof value === 'object') return JSON.stringify(value);
      if (typeof value === 'boolean') return value ? '是' : '否';
      if (typeof value === 'number') return value.toString();
      if (typeof value === 'string' && value.length > 30) {
        return value.substring(0, 27) + '...';
      }
      return value;
    },

    // 查看节点详情
    searchNodeDetails(nodeName) {
      this.searchNodeName = nodeName;
      this.searchNode();
    },

    // 编辑节点
    editNode(node) {
      this.activeTab = 'update';
      this.updateNode.name = node.name;
      this.updateNode.propertiesJSON = JSON.stringify(
        Object.fromEntries(
          Object.entries(node).filter(([key]) => key !== 'name' && key !== 'labels')
        ),
        null,
        2
      );
    },

    extractProperties(node) {
      if (!node) return {};
      return Object.fromEntries(
        Object.entries(node)
          .filter(([key]) => key !== 'name' && key !== 'labels')
      );
    },

    formatRelProperties(props) {
      const entries = Object.entries(props);
      if (entries.length === 0) return '';
      
      if (entries.length === 1) {
        const [key, value] = entries[0];
        return `${key}: ${this.formatValue(value)}`;
      }
      
      return `${entries.length} 个属性`;
    },

    // 添加新方法：过滤和格式化属性
    getFilteredProperties(properties) {
      if (!properties) return [];
      
      return Object.entries(properties)
        .filter(([key]) => key !== 'name')
        .map(([key, value]) => ({
          key,
          value
        }));
    },
  }
};
</script>

<style scoped>
/* 主要布局调整：从上下布局改为左右布局 */
.app-container {
  min-height: calc(100vh - 60px);
  padding: 24px;
  background: #f5f7fa;
  display: flex; /* 改为左右布局 */
  gap: 24px; /* 添加间距 */
}

/* 左侧控制面板 - 固定宽度 */
.control-panel {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  width: 420px; /* 固定宽度 */
  flex-shrink: 0; /* 防止缩小 */
  height: fit-content;
  max-height: calc(100vh - 108px); /* 最大高度 */
  overflow-y: auto; /* 内容超出时滚动 */
}

/* 右侧图数据视图区域 - 占据剩余空间 */
.visualization-area {
  flex: 1; /* 占据剩余空间 */
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  height: calc(100vh - 108px); /* 固定高度 */
  overflow-y: auto; /* 内容超出时滚动 */
  display: flex;
  flex-direction: column;
}

.control-panel h2 {
  color: #1a1a1a;
  margin: 0 0 24px 0;
  font-size: 24px;
  font-weight: 600;
}

/* 查询部分样式优化 */
.query-section {
  margin-bottom: 20px;
  padding-bottom: 20px;
  border-bottom: 1px solid #eee;
}

.search-box {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.search-input {
  position: relative;
}

.search-input i {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #666;
}

.search-input input {
  width: 100%;
  padding: 12px 12px 12px 36px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 16px;
  transition: all 0.3s;
}

.search-input input:focus {
  border-color: #1976d2;
  outline: none;
  box-shadow: 0 0 0 3px rgba(25, 118, 210, 0.1);
}

.search-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.search-buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.helper-text {
  color: #666;
  font-size: 12px;
}

/* 按钮样式统一 */
button {
  padding: 10px 16px;
  border-radius: 6px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 6px;
}

.primary-button {
  background: #1976d2;
  color: white;
  border: none;
}

.primary-button:hover {
  background: #1565c0;
  transform: translateY(-1px);
}

.secondary-button {
  background: #e3f2fd;
  color: #1976d2;
  border: 1px solid #bbdefb;
}

.secondary-button:hover {
  background: #bbdefb;
  transform: translateY(-1px);
}

.text-button {
  background: #f5f5f5;
  color: #666;
  border: 1px solid #ddd;
}

.text-button:hover {
  background: #e0e0e0;
  color: #333;
}

/* 操作区域样式 */
.operation-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  padding: 4px;
  background: #f5f5f5;
  border-radius: 8px;
  flex-wrap: wrap;
}

.operation-tabs button {
  flex: 1;
  padding: 8px;
  border: none;
  background: transparent;
  color: #666;
  min-width: 80px;
  font-size: 14px;
}

.operation-tabs button.active {
  background: white;
  color: #1976d2;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

/* 表单样式优化 */
.operation-form {
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
  margin-top: 16px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  color: #333;
  font-weight: 500;
}

.form-group input,
.form-group textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  font-family: inherit;
  transition: all 0.3s;
  box-sizing: border-box;
}

.form-group input:focus,
.form-group textarea:focus {
  border-color: #1976d2;
  outline: none;
  box-shadow: 0 0 0 3px rgba(25, 118, 210, 0.1);
}

.sub-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  padding: 4px;
  background: #e8f5e9;
  border-radius: 6px;
}

.sub-tabs button {
  flex: 1;
  padding: 8px;
  border: none;
  background: transparent;
  color: #666;
}

.sub-tabs button.active {
  background: white;
  color: #2e7d32;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.danger-button {
  background: #d32f2f;
  color: white;
}

.danger-button:hover {
  background: #c62828;
}

.warning {
  color: #f57c00;
  background: #fff3e0;
  padding: 12px;
  border-radius: 6px;
  border-left: 4px solid #ff9800;
  margin: 16px 0;
}

/* 图数据显示区域优化 */
.visualization-area h3 {
  margin: 0 0 20px 0;
  font-size: 20px;
  font-weight: 600;
  color: #1a1a1a;
  flex-shrink: 0; /* 标题不缩小 */
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 16px;
  padding: 60px 20px;
  color: #666;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #1976d2;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.no-data {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: #666;
  text-align: center;
}

.no-data i {
  font-size: 64px;
  margin-bottom: 20px;
  color: #ddd;
}

/* 图数据内容区域 - 确保可以滚动 */
.graph-data {
  display: flex;
  flex-direction: column;
  gap: 24px;
  flex: 1; /* 占据剩余空间 */
  min-height: 0; /* 允许内容溢出 */
}

.graph-group {
  background: #fafafa;
  border: 1px solid #e0e0e0;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.group-header {
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 2px solid #e0e0e0;
}

.main-node-title {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.main-node-title h4 {
  margin: 0;
  font-size: 18px;
  color: #1a1a1a;
  display: flex;
  align-items: center;
  gap: 8px;
}

.related-nodes-container {
  display: flex;
  gap: 20px;
  overflow-x: auto;
  padding: 8px 4px;
  min-height: 200px;
}

.node-card {
  background: white;
  border-radius: 8px;
  padding: 16px;
  min-width: 280px;
  max-width: 320px;
  border: 1px solid #e0e0e0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  flex-shrink: 0;
}

.main-node-card {
  background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%);
  border-color: #90caf9;
}

.child-nodes-container {
  display: flex;
  gap: 16px;
  flex-wrap: nowrap;
  overflow-x: auto;
  padding: 4px;
  flex: 1;
}

.child-node-card {
  flex: 0 0 auto;
}

.relationship-type {
  font-size: 14px;
  color: #666;
  display: flex;
  align-items: center;
  gap: 6px;
  padding-bottom: 8px;
  border-bottom: 1px solid #eee;
  font-weight: 500;
}

.relationship-properties {
  font-size: 12px;
  background: #fff3cd;
  color: #856404;
  padding: 2px 6px;
  border-radius: 4px;
  margin-left: 8px;
}

.node-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
}

.node-header h5 {
  margin: 0;
  font-size: 16px;
  color: #1a1a1a;
  font-weight: 600;
}

.node-labels {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 8px;
}

.label {
  background: #e1f5fe;
  color: #0277bd;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.label.small {
  padding: 2px 6px;
  font-size: 11px;
}

.node-properties {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.property-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 14px;
}

.property-key {
  color: #666;
  font-weight: 500;
  font-size: 12px;
}

.property-value {
  color: #1a1a1a;
  background: #f8f9fa;
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 13px;
  word-break: break-all;
}

.node-actions {
  display: flex;
  gap: 8px;
  margin-top: auto;
  padding-top: 8px;
  border-top: 1px solid #eee;
}

.node-actions button {
  padding: 6px 8px;
  border-radius: 4px;
  background: #f5f5f5;
  border: 1px solid #ddd;
  color: #666;
  font-size: 12px;
  flex: 1;
}

.node-actions button:hover {
  background: #e0e0e0;
  color: #1976d2;
}

.small-button {
  padding: 4px 6px;
  font-size: 11px;
}

/* 滚动条样式 */
.related-nodes-container::-webkit-scrollbar,
.child-nodes-container::-webkit-scrollbar,
.control-panel::-webkit-scrollbar,
.visualization-area::-webkit-scrollbar {
  height: 6px;
  width: 6px;
}

.related-nodes-container::-webkit-scrollbar-thumb,
.child-nodes-container::-webkit-scrollbar-thumb,
.control-panel::-webkit-scrollbar-thumb,
.visualization-area::-webkit-scrollbar-thumb {
  background: #ccc;
  border-radius: 3px;
}

.related-nodes-container::-webkit-scrollbar-track,
.child-nodes-container::-webkit-scrollbar-track,
.control-panel::-webkit-scrollbar-track,
.visualization-area::-webkit-scrollbar-track {
  background: #f0f0f0;
  border-radius: 3px;
}

/* 通知样式 */
.notification {
  position: fixed;
  top: 24px;
  right: 24px;
  padding: 12px 20px;
  border-radius: 8px;
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  animation: slideIn 0.3s ease;
  max-width: 400px;
}

.notification.success {
  background: #e8f5e9;
  color: #2e7d32;
  border: 1px solid #a5d6a7;
}

.notification.error {
  background: #fef2f2;
  color: #dc2626;
  border: 1px solid #fecaca;
}

.notification.warning {
  background: #fff7ed;
  color: #c2410c;
  border: 1px solid #fed7aa;
}

.notification.info {
  background: #f0f9ff;
  color: #0369a1;
  border: 1px solid #bae6fd;
}

.close-btn {
  background: none;
  border: none;
  font-size: 18px;
  color: currentColor;
  cursor: pointer;
  padding: 0;
  margin-left: auto;
}

/* 响应式设计优化 */
@media (max-width: 1200px) {
  .app-container {
    flex-direction: column;
    gap: 16px;
  }

  .control-panel {
    width: 100%;
    max-height: 400px;
  }

  .visualization-area {
    height: calc(100vh - 460px);
    min-height: 300px;
  }
}

@media (max-width: 768px) {
  .app-container {
    padding: 12px;
  }
  
  .search-buttons {
    flex-direction: column;
  }

  .operation-tabs {
    flex-wrap: wrap;
  }

  .operation-tabs button {
    min-width: calc(50% - 4px);
  }

  .related-nodes-container {
    flex-direction: column;
  }

  .node-card {
    min-width: 100%;
    max-width: 100%;
  }
}

/* 动画效果 */
@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* 节点操作部分样式 */
.node-operations {
  margin-top: 20px;
}

.node-operations h3 {
  color: #333;
  margin-bottom: 16px;
  font-size: 18px;
  font-weight: 600;
}
</style>