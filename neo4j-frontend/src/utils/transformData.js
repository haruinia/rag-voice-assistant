export const transformData = (data) => {
    const elements = [];
    const nodes = {};
    data.forEach(item => {
      if (!nodes[item.node1.name]) {
        nodes[item.node1.name] = { data: { id: item.node1.name, label: item.node1.name } };
        elements.push(nodes[item.node1.name]);
      }
      if (item.node2 && !nodes[item.node2.name]) {
        nodes[item.node2.name] = { data: { id: item.node2.name, label: item.node2.name } };
        elements.push(nodes[item.node2.name]);
      }
      if (item.relationship) {
        elements.push({
          data: {
            id: `${item.node1.name}-${item.node2 ? item.node2.name : 'null'}`,
            source: item.node1.name,
            target: item.node2 ? item.node2.name : '',
            label: item.relationship,
          }
        });
      }
    });
    return elements;
  };
  