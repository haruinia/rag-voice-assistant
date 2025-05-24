<template>
    <div ref="threeContainer" style="width: 100%; height: 100%;"></div>
  </template>
  
  <script>
  import * as THREE from 'three';
  import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
  
  export default {
    name: 'ObjViewer',
    mounted() {
      this.initThree();
    },
    methods: {
      initThree() {
        const container = this.$refs.threeContainer;
        const width = container.offsetWidth;
        const height = container.offsetHeight;
  
        // 创建场景
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
        const renderer = new THREE.WebGLRenderer();
        renderer.setSize(width, height);
        container.appendChild(renderer.domElement);
  
        // 加载OBJ模型
        const loader = new OBJLoader();
        loader.load('../3dData/Actaeon.obj', (object) => {
          scene.add(object);
        });
        console.log(loader);
        console.log("1");
  
  
        // 渲染循环
        const animate = () => {
          requestAnimationFrame(animate);
          renderer.render(scene, camera);
        };
        animate();
      }
    }
  }
  </script>