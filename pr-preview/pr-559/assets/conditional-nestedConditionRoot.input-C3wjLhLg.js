import{t as e}from"./jsx-runtime-CF8L0Gwd.js";import{i as t}from"./styled-components.browser.esm-Dy4oaG3m.js";var n=e(),r=t.div`
  position: relative;
  width: 100px;
  height: 60px;
  background: #ddd;
  color: #222;
  ${e=>e.$layer?.isTop?`z-index: ${e.$zIndex};`:``}
`,i=()=>(0,n.jsxs)(`div`,{style:{display:`flex`,gap:8,padding:8},children:[(0,n.jsx)(r,{$layer:{isTop:!0},$zIndex:`3`,children:`Top layer`}),(0,n.jsx)(r,{$layer:{isTop:!1},$zIndex:`1`,children:`Base layer`})]});export{i as App};