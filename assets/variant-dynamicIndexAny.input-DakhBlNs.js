import"./react-D4cBbUL-.js";import{f as e,s as t}from"./index-DVlcDaUT.js";var n=e(),r=t(`div`)`
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
  background: ${e=>e.color||`gray`};

  ${e=>e.size===`tiny`&&`
    width: 7px;
    height: 7px;
  `};

  ${e=>e.size===`small`&&`
    width: 9px;
    height: 9px;
  `};
`,i=()=>(0,n.jsxs)(`div`,{style:{display:`flex`,gap:8},children:[(0,n.jsx)(r,{color:`red`,size:`tiny`}),(0,n.jsx)(r,{color:`blue`,size:`small`}),(0,n.jsx)(r,{color:`green`}),(0,n.jsx)(r,{})]});export{i as App,r as Badge};