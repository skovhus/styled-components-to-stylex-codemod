import{f as e,s as t}from"./index-CIwRs5Vz.js";var n=e(),r=t.span`
  color: blue;
  font-size: 20px;
`,i=t.button`
  padding: 8px 16px;
  background: lightgray;

  &:has(${r}) {
    padding-right: 32px;
    background: lightyellow;
  }
`,a=()=>(0,n.jsxs)(`div`,{style:{display:`flex`,gap:16,padding:16},children:[(0,n.jsx)(i,{children:`No icon`}),(0,n.jsxs)(i,{children:[`With icon `,(0,n.jsx)(r,{children:`★`})]})]});export{a as App};