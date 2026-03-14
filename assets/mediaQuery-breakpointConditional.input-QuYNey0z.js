import{j as i,s as t,c as a}from"./index-0Tf7FkTE.js";import{p as e}from"./helpers-sAnpUzLb.js";const o=a.div`
  padding: 16px;
  max-width: 800px;
  background-color: #f5f5f5;

  ${s=>s.$isCompact&&t`
      @media (max-width: ${e.phone}px) {
        max-width: none;
        border-radius: 0;
      }
    `}
`,n=()=>i.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:"8px",padding:"16px"},children:[i.jsx(o,{children:"Default"}),i.jsx(o,{$isCompact:!0,children:"Compact"})]});export{n as App};
