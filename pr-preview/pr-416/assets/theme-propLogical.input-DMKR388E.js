import{f as e,s as t}from"./index-BZzx-Jen.js";var n=e(),r=t.div`
  height: 100px;
  width: 100px;
  background: red;
  ${e=>e.theme.isDark&&e.enabled?`opacity: 0.5;`:``}
`,i=()=>(0,n.jsxs)(`div`,{style:{display:`flex`,gap:12},children:[(0,n.jsx)(r,{enabled:!0,children:`Enabled`}),(0,n.jsx)(r,{enabled:!1,children:`Disabled`})]});export{i as App};