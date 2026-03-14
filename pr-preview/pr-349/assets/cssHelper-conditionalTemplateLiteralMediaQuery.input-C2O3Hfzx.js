import{j as n,c as o}from"./index-RkKL71wp.js";const e=o.div`
  color: black;
  background-color: #f0f0f0;

  ${i=>i.$prominent?`
    font-weight: bold;
    font-size: 18px;

    @media (min-width: 768px) {
      font-size: 24px;
    }
  `:`
    font-weight: normal;
    font-size: 14px;

    @media (min-width: 768px) {
      font-size: 16px;
    }
  `}
`,r=()=>n.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:16,padding:16},children:[n.jsx(e,{$prominent:!1,children:"Default Banner"}),n.jsx(e,{$prominent:!0,children:"Prominent Banner"})]});export{r as App};
