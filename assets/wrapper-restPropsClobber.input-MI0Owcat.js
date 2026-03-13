import{j as r,r as s,c as n}from"./index-DExQN3F7.js";const o=n.ul`
  position: relative;
  margin: 0;
  background-color: #f5f5f5;
  height: 100%;
  outline: none;
`;function l(t){const{ref:e,...i}=t;return r.jsx(o,{ref:e,...i})}function d(t){const e=s.useRef(null),i={className:"virtual-list-inner",style:{height:400,width:"100%",position:"relative",overflow:"visible"}};return r.jsx("div",{style:{height:200,overflow:"auto",border:"2px solid #333"},children:r.jsx(l,{ref:e,...i,children:t.children})})}const p=()=>r.jsx("div",{style:{padding:16},children:r.jsx(d,{children:Array.from({length:20},(t,e)=>r.jsxs("li",{style:{padding:"8px 12px",borderBottom:"1px solid #ddd"},children:["Item ",e+1]},e))})});export{p as App};
