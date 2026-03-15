import"./react-D4cBbUL-.js";import{f as e,s as t}from"./index-GfnpIRuu.js";var n=e(),r=t.div`
  overflow: hidden;
  ${e=>e.$width?`--component-width: ${e.$width}px`:``};
`,i=t.div`
  background-color: coral;
  width: calc(var(--component-width) + 60px);
  height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: bold;
`,a=()=>(0,n.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:`16px`},children:[(0,n.jsx)(r,{$width:100,children:(0,n.jsx)(i,{children:`Width: 100px + 60px = 160px`})}),(0,n.jsx)(r,{$width:200,children:(0,n.jsx)(i,{children:`Width: 200px + 60px = 260px`})}),(0,n.jsx)(r,{$width:void 0,children:(0,n.jsx)(i,{children:`Width: undefined (no custom property)`})})]});export{a as App};