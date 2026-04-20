import{f as e,s as t}from"./index-BdcX5xHt.js";var n=e(),r=t.div`
  opacity: 0;
  transition: opacity 0.2s;
  &[data-visible="true"] {
    opacity: 1;
  }
`,i=t.div`
  opacity: 0.5;
  padding: 8px 12px;

  [aria-checked="true"] &,
  [data-focused="true"] &,
  [aria-selected="true"] &,
  [aria-checked="mixed"] & {
    opacity: 1;
  }
`,a=t.div`
  opacity: 0;

  [data-active="true"] & {
    opacity: 1;
  }
`,o=t.div`
  opacity: 0;

  [data-state="active"][data-size="lg"] & {
    opacity: 1;
  }
`;function s(){return(0,n.jsxs)(`div`,{style:{display:`flex`,gap:16,padding:16},children:[(0,n.jsx)(r,{"data-visible":`true`,style:{backgroundColor:`lightblue`,padding:20},children:`Visible`}),(0,n.jsx)(r,{style:{backgroundColor:`lightcoral`,padding:20},children:`Hidden`}),(0,n.jsx)(`div`,{"aria-checked":`true`,children:(0,n.jsx)(i,{style:{backgroundColor:`lightgreen`},children:`Checked`})}),(0,n.jsx)(`div`,{children:(0,n.jsx)(i,{style:{backgroundColor:`lightyellow`},children:`Default`})}),(0,n.jsx)(`div`,{"data-active":`true`,children:(0,n.jsx)(a,{style:{backgroundColor:`lightcyan`,padding:10},children:`Active`})}),(0,n.jsx)(`div`,{"data-state":`active`,"data-size":`lg`,children:(0,n.jsx)(o,{style:{backgroundColor:`thistle`,padding:10},children:`Compound`})})]})}export{s as App};