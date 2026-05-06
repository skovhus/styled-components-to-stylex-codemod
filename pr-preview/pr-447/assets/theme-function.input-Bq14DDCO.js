import{a as e,c as t,p as n,s as r}from"./index-B4IKwpAR.js";var i=n(),a=e,o=t.button`
  padding: 12px 16px;
  background-color: ${e=>e.theme.color.primaryColor};
  color: white;
  border-radius: 4px;
  border-width: 2px;
  border-style: solid;
  border-color: ${e=>e.theme.color.bgBorderFaint};
`,s=t.div`
  padding: 16px;
  background-color: ${e=>e.theme.color.bgBase};
  border-radius: 8px;
`,c=()=>(0,i.jsx)(r,{theme:a,children:(0,i.jsxs)(`div`,{style:{display:`flex`,gap:`12px`,padding:`12px`},children:[(0,i.jsx)(s,{children:(0,i.jsx)(o,{children:`Base Theme`})}),(0,i.jsx)(r,{theme:t=>{let n=t??e;return{...n,isDark:!n.isDark}},children:(0,i.jsx)(s,{children:(0,i.jsx)(o,{children:`Extended Theme`})})})]})});export{c as App};