import{j as e,c as i}from"./index-CDU9ad0s.js";const a="#ff0000",d="#0000ff",r="#00ff00",o=i.div`
  background: linear-gradient(${a}, ${d});
  width: 200px;
  height: 100px;
`,c=i.div`
  background: radial-gradient(${a}, ${d});
  width: 200px;
  height: 100px;
`,x=i.div`
  background: conic-gradient(${a}, ${d}, ${r});
  width: 200px;
  height: 100px;
`,s=i.div`
  background: repeating-linear-gradient(${a} 0%, ${d} 10%);
  width: 200px;
  height: 100px;
`,t=i.div`
  transform: translateY(-50%) translateX(${n=>n.$expanded?"0":"-8px"}) scale(${n=>n.$expanded?1:.9});
  opacity: ${n=>n.$expanded?1:0};
`,l=()=>e.jsxs(e.Fragment,{children:[e.jsx(o,{children:"Linear"}),e.jsx(c,{children:"Radial"}),e.jsx(x,{children:"Conic"}),e.jsx(s,{children:"Repeating"}),e.jsx(t,{$expanded:!0,children:"Expanded"}),e.jsx(t,{$expanded:!1,children:"Collapsed"})]});export{l as App};
