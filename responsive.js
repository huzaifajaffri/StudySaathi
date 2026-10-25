(()=> {
  const labelTable=table=>{
    const rows=[...table.rows],headers=rows.find(row=>row.querySelector('th'))?.cells;
    const labels=headers?[...headers].map(cell=>cell.textContent.trim()):['Item','Score','Details','More info'];
    rows.forEach(row=>{
      if(row.querySelector('th'))return;
      [...row.cells].forEach((cell,index)=>{
        if(!cell.hasAttribute('data-label')&&labels[index])cell.setAttribute('data-label',labels[index]);
      });
    });
  };
  document.querySelectorAll('table').forEach(labelTable);
  new MutationObserver(records=>records.forEach(record=>{
    record.addedNodes.forEach(node=>{
      if(node.nodeType!==Node.ELEMENT_NODE)return;
      if(node.matches&&node.matches('table'))labelTable(node);
      if(node.querySelectorAll)node.querySelectorAll('table').forEach(labelTable);
    });
  })).observe(document.body,{childList:true,subtree:true});
})();
