import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{u as t}from"./index-D50K3hv9.js";import{t as n}from"./framer-motion-BbWl1Vtp.js";var r=e(),i=`data-animating`,a=t.div`
  opacity: 0;
  transition: opacity 0.2s;
  &[data-visible="true"] {
    opacity: 1;
  }
`,o=t.div`
  opacity: 0.5;
  padding: 8px 12px;

  [aria-checked="true"] &,
  [data-focused="true"] &,
  [aria-selected="true"] &,
  [aria-checked="mixed"] & {
    opacity: 1;
  }
`,s=t.div`
  opacity: 0;

  [data-active="true"] & {
    opacity: 1;
  }
`,c=t.div`
  opacity: 0;

  [data-state="active"][data-size="lg"] & {
    opacity: 1;
  }
`,l=t(n.div)`
  width: 160px;
  max-height: 80px;
  overflow: visible;
  padding: 12px;
  border: 1px solid #222;

  &[${i}="true"] {
    max-height: 40px;
    overflow: hidden;
  }
`;function u(){return(0,r.jsxs)(`div`,{style:{display:`flex`,gap:16,padding:16},children:[(0,r.jsx)(a,{"data-visible":`true`,style:{backgroundColor:`lightblue`,padding:20},children:`Visible`}),(0,r.jsx)(a,{style:{backgroundColor:`lightcoral`,padding:20},children:`Hidden`}),(0,r.jsx)(`div`,{"aria-checked":`true`,children:(0,r.jsx)(o,{style:{backgroundColor:`lightgreen`},children:`Checked`})}),(0,r.jsx)(`div`,{children:(0,r.jsx)(o,{style:{backgroundColor:`lightyellow`},children:`Default`})}),(0,r.jsx)(`div`,{"data-active":`true`,children:(0,r.jsx)(s,{style:{backgroundColor:`lightcyan`,padding:10},children:`Active`})}),(0,r.jsx)(`div`,{"data-state":`active`,"data-size":`lg`,children:(0,r.jsx)(c,{style:{backgroundColor:`thistle`,padding:10},children:`Compound`})}),(0,r.jsx)(l,{"data-animating":`true`,style:{backgroundColor:`lavender`},children:`Animating local attr`})]})}export{u as App,i as DataAnimatingAttribute};