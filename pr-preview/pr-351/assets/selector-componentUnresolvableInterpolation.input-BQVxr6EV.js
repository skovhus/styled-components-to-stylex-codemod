import{j as e,c as n}from"./index-CeRyEgL2.js";const r=n.a`
  display: flex;
  padding: 8px;
  background: papayawhip;
`,d=n.span`
  padding: 4px 8px;

  ${r}:hover & {
    color: ${i=>i.$active?"green":"gray"};
  }
`,c=n.span`
  font-size: 12px;

  ${r}:hover & {
    color: ${i=>i.$highlighted?"blue":"inherit"};
    font-weight: 700;
  }
`,h=n.div`
  padding: 8px;

  ${r}:hover & {
    border: 2px solid ${i=>i.$accent?"red":"transparent"};
  }
`,s=()=>e.jsxs("div",{style:{display:"flex",gap:16,padding:16},children:[e.jsx(r,{href:"#",children:e.jsx(d,{$active:!0,children:"Active"})}),e.jsx(r,{href:"#",children:e.jsx(d,{children:"Inactive"})}),e.jsx(r,{href:"#",children:e.jsx(c,{$highlighted:!0,children:"Highlighted"})}),e.jsx(r,{href:"#",children:e.jsx(c,{children:"Normal"})}),e.jsx(r,{href:"#",children:e.jsx(h,{$accent:!0,children:"Accent Card"})}),e.jsx(r,{href:"#",children:e.jsx(h,{children:"Default Card"})})]});export{s as App};
