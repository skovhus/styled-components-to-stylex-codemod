import{j as e,b as d,a as s}from"./index-CPNQFtos.js";const o=24,l=s.div`
  position: relative;
  padding: 20px;
  background-color: #f5f5f5;

  ${a=>a.$enabled?d`
          &:hover {
            left: ${a.$collapsed?0:o}px;
            opacity: 0.8;
          }
        `:""}
`,p=()=>e.jsxs("div",{style:{display:"flex",gap:"12px",padding:"12px"},children:[e.jsx(l,{$collapsed:!1,$enabled:!0,children:"Enabled, Not Collapsed"}),e.jsx(l,{$collapsed:!0,$enabled:!0,children:"Enabled, Collapsed"}),e.jsx(l,{$collapsed:!1,$enabled:!1,children:"Disabled"})]});export{p as App};
