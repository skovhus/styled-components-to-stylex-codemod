import{j as e,c as i}from"./index-6b_iQq8g.js";import{s as c,f as l}from"./helpers-DP2WD863.js";const r=i.div`
  font-size: ${d=>d.$size==="large"?l("large"):l("small")};
  ${c.phone} {
    font-size: ${d=>d.$size==="large"?l("medium"):l("small")};
  }
  font-weight: 500;
  color: #333;
`,s=i.label`
  display: flex;
  padding: 16px;
  border-width: 1px;
  border-style: solid;
  border-color: ${d=>d.checked?"#0066cc":"#ccc"};
  border-radius: 6px;
  cursor: ${d=>d.disabled?"not-allowed":"pointer"};

  &:hover {
    border-color: ${d=>d.disabled?"#ddd":d.checked?"#0044aa":"#999"};
  }
`;function o(){return e.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:16,padding:16},children:[e.jsx(r,{children:"Default Title"}),e.jsx(r,{$size:"large",children:"Large Title"}),e.jsx(r,{$size:"small",children:"Small Title"}),e.jsx(s,{checked:!1,children:e.jsx("span",{children:"Unchecked"})}),e.jsx(s,{checked:!0,children:e.jsx("span",{children:"Checked"})}),e.jsx(s,{checked:!0,disabled:!0,children:e.jsx("span",{children:"Checked Disabled"})}),e.jsx(s,{checked:!1,disabled:!0,children:e.jsx("span",{children:"Unchecked Disabled"})})]})}export{o as App};
