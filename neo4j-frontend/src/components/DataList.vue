<template>
  <div id="cy"></div>
</template>

<script>
import cytoscape from 'cytoscape';
import { fetchData, fetchChildren, fetchParents} from '../api';
import { transformData } from '../transformData';

export default {
  name: 'GraphView',
  data() {
    return {
      cy: null,
      originalElements: [],
      nodeExpanded: {},
    };
  },
  mounted() {
    fetchData()
      .then(data => {
        const elements = transformData(data);
        this.originalElements = elements;
        this.initCytoscape(elements);
      })
      .catch(error => {
        console.error("请求数据时发生错误！", error);
      });
  },
  methods: {
    initCytoscape(elements) {
      this.cy = cytoscape({
        container: document.getElementById('cy'),
        elements: elements,
        style: [
          {
            selector: 'node',
            style: {
              'label': 'data(label)',
              'background-color': '#666',
              'text-valign': 'center',
              'color': '#fff',
              'text-outline-width': 2,
              'text-outline-color': '#666',
            }
          },
          {
            selector: 'edge',
            style: {
              'label': 'data(label)',
              'width': 3,
              'line-color': '#ccc',
              'target-arrow-color': '#ccc',
              'target-arrow-shape': 'triangle',
              'curve-style': 'bezier',
            }
          }
        ],
        layout: {
          name: 'breadthfirst',
          directed: true,
          padding: 10,
          spacingFactor: 1.5,
          avoidOverlap: true
        }
      });

      this.cy.on('dblclick', 'node', (event) => {
        const nodeId = event.target.id();
        if (this.nodeExpanded[nodeId]) {
          this.collapseNode(nodeId);
        } else {
          this.expandNode(nodeId);
        }
      });
    },
    expandNode(nodeId) {
      Promise.all([fetchChildren(nodeId), fetchParents(nodeId)])
        .then(([childrenData, parentsData]) => {
          const newChildrenElements = transformData(childrenData);
          const newParentsElements = transformData(parentsData);
          this.cy.add([...newChildrenElements, ...newParentsElements]);
          this.nodeExpanded[nodeId] = true;
        })
        .catch(error => {
          console.error("获取节点数据时发生错误！", error);
        });
    },
    collapseNode(nodeId) {
      const connectedEdges = this.cy.edges(`[source="${nodeId}"], [target="${nodeId}"]`);
      const connectedNodes = connectedEdges.connectedNodes().filter(node => node.id() !== nodeId);
      this.cy.remove(connectedEdges);
      this.cy.remove(connectedNodes);
      this.nodeExpanded[nodeId] = false;
    }
  }
};
</script>

<style>
#cy {
  width: 100%;
  height: 600px;
  position: relative;
}
</style>
