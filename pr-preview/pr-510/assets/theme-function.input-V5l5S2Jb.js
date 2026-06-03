import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{a as t,l as n,u as r}from"./index-CfwJadkf.js";var i=e(),a=t,o=n.button`
  padding: 12px 16px;
  background-color: ${e=>e.theme.color.primaryColor};
  color: white;
  border-radius: 4px;
  border-width: 2px;
  border-style: solid;
  border-color: ${e=>e.theme.color.bgBorderFaint};
`,s=n.div`
  padding: 16px;
  background-color: ${e=>e.theme.color.bgBase};
  border-radius: 8px;
`,c=()=>(0,i.jsx)(r,{theme:a,children:(0,i.jsxs)(`div`,{style:{display:`flex`,gap:`12px`,padding:`12px`},children:[(0,i.jsx)(s,{children:(0,i.jsx)(o,{children:`Base Theme`})}),(0,i.jsx)(r,{theme:e=>{let n=e??t;return{...n,isDark:!n.isDark}},children:(0,i.jsx)(s,{children:(0,i.jsx)(o,{children:`Extended Theme`})})})]})});export{c as App};