import"./react-D4cBbUL-.js";import{f as e,s as t}from"./index-BEHMEpNn.js";var n=e(),r=t.input`
  padding: 12px;
  border: 1px solid #ccc;

  &::placeholder {
    color: ${e=>e.theme.color[e.$placeholderColor]};
  }
`,i=t.span`
  position: relative;
  padding: 4px 8px;
  background-color: #eee;

  &::after {
    content: "";
    display: block;
    height: 3px;
    background-color: ${e=>e.theme.color[e.$indicatorColor]};
  }
`,a=()=>(0,n.jsxs)(`div`,{style:{display:`grid`,gap:12,padding:16},children:[(0,n.jsx)(r,{$placeholderColor:`labelBase`,placeholder:`Base color`}),(0,n.jsx)(r,{$placeholderColor:`labelMuted`,placeholder:`Muted color`}),(0,n.jsx)(i,{$indicatorColor:`labelBase`,children:`Base`}),(0,n.jsx)(i,{$indicatorColor:`labelMuted`,children:`Muted`})]});export{a as App};