import{j as i,a as r}from"./index-CpVFPXAI.js";const e=r("div")`
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
  background: ${s=>s.color||"gray"};

  ${s=>s.size==="tiny"&&`
    width: 7px;
    height: 7px;
  `};

  ${s=>s.size==="small"&&`
    width: 9px;
    height: 9px;
  `};
`,t=()=>i.jsxs("div",{style:{display:"flex",gap:8},children:[i.jsx(e,{color:"red",size:"tiny"}),i.jsx(e,{color:"blue",size:"small"}),i.jsx(e,{color:"green"}),i.jsx(e,{})]});export{t as App,e as Badge};
