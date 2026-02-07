import{j as t,d as e}from"./index-DUEN-k9G.js";const n=e.div.attrs(o=>({tabIndex:o.tabIndex??0}))`
  overflow-y: auto;
  position: relative;
  flex-grow: 1;
  background-color: ${o=>o.$applyBackground?o.theme.color.bgBase:"inherit"};
  outline: ${o=>o.tabIndex===0?"none":"auto"};
`,r=()=>t.jsx(n,{children:"Tab me!"});export{r as App,n as Component};
